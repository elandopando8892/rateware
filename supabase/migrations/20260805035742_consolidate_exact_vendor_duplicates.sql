create table if not exists public.vendor_merge_audit (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  organization_id text,
  canonical_vendor_id uuid not null,
  merged_vendor_ids uuid[] not null default '{}'::uuid[],
  normalized_name text not null,
  normalized_domain text not null,
  selection_reason text not null,
  relationship_counts jsonb not null default '{}'::jsonb,
  canonical_snapshot jsonb not null default '{}'::jsonb,
  duplicate_snapshots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vendor_merge_audit_owner_created_idx
  on public.vendor_merge_audit (owner_email, created_at desc);

alter table public.vendor_merge_audit enable row level security;

create or replace function public.consolidate_exact_workspace_vendor_duplicates(
  p_owner_email text,
  p_organization_id text default null,
  p_dry_run boolean default true,
  p_preview_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_count integer := 0;
  v_duplicate_count integer := 0;
  v_removed_count integer := 0;
  v_preview jsonb := '[]'::jsonb;
  v_group record;
  v_loser record;
  v_lane_vendor record;
  v_keeper_lane_vendor_id uuid;
  v_conflict_count integer := 0;
begin
  if nullif(btrim(p_owner_email), '') is null then
    raise exception 'Workspace owner_email is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'vendor-duplicate-consolidation:' || p_owner_email || ':' || coalesce(nullif(btrim(p_organization_id), ''), ''),
      0
    )
  );

  drop table if exists pg_temp.vendor_merge_plan;

  create temporary table vendor_merge_plan on commit drop as
  with scoped as (
    select
      v.*,
      regexp_replace(
        translate(lower(btrim(coalesce(nullif(v.vendor_name, ''), nullif(v.legal_name, ''), nullif(v.name, '')))),
          U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1', 'aeiouun'),
        '[^a-z0-9]+', '', 'g'
      ) as normalized_name,
      regexp_replace(
        split_part(
          regexp_replace(
            lower(btrim(coalesce(nullif(v.domain, ''), split_part(v.primary_email, '@', 2)))),
            '^https?://', '', 'i'
          ),
          '/', 1
        ),
        '^www\.', '', 'i'
      ) as normalized_domain
    from public.vendors v
    where v.owner_email = p_owner_email
      and (
        nullif(btrim(p_organization_id), '') is null
        or v.organization_id = p_organization_id
        or v.organization_id is null
      )
  ),
  duplicate_keys as (
    select
      owner_email,
      coalesce(organization_id, nullif(btrim(p_organization_id), ''), '') as organization_key,
      normalized_name,
      normalized_domain
    from scoped
    where normalized_name <> ''
      and normalized_domain <> ''
      and normalized_domain not in (
        'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
        'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com',
        'msn.com', 'gmx.com', 'mail.com'
      )
    group by owner_email, coalesce(organization_id, nullif(btrim(p_organization_id), ''), ''), normalized_name, normalized_domain
    having count(*) > 1
  ),
  candidate_ids as (
    select s.id
    from scoped s
    join duplicate_keys d
      on d.owner_email = s.owner_email
     and d.organization_key = coalesce(s.organization_id, nullif(btrim(p_organization_id), ''), '')
     and d.normalized_name = s.normalized_name
     and d.normalized_domain = s.normalized_domain
  ),
  quote_evidence as (
    select evidence.vendor_id, sum(evidence.row_count)::integer as quote_count
    from (
      select r.vendor_id, count(*)::integer as row_count
      from public.rates r
      where r.vendor_id in (select id from candidate_ids)
      group by r.vendor_id
      union all
      select s.vendor_id, count(*)::integer
      from public.rate_staging s
      where s.vendor_id in (select id from candidate_ids)
      group by s.vendor_id
      union all
      select lv.vendor_id, count(*)::integer
      from public.rfx_lane_vendors lv
      where lv.vendor_id in (select id from candidate_ids)
        and (lv.bid_rate is not null or lv.responded_at is not null or lower(coalesce(lv.invitation_status, '')) in ('quoted', 'awarded', 'backup'))
      group by lv.vendor_id
      union all
      select rs.vendor_id, count(q.id)::integer
      from public.rfx_ratebook_shares rs
      join public.rfx_ratebook_carrier_quotes q on q.ratebook_share_id = rs.id
      where rs.vendor_id in (select id from candidate_ids)
      group by rs.vendor_id
    ) evidence
    group by evidence.vendor_id
  ),
  ranked as (
    select
      s.id,
      s.owner_email,
      s.organization_id,
      coalesce(s.organization_id, nullif(btrim(p_organization_id), ''), '') as organization_key,
      s.normalized_name,
      s.normalized_domain,
      (coalesce(s.notes, '') ~* '(^|[^a-z0-9])source\s*id\s*:') as has_source_id,
      coalesce(q.quote_count, 0) as quote_count,
      (
        case when nullif(btrim(s.primary_email), '') is not null then 18 else 0 end
        + case when nullif(btrim(s.domain), '') is not null then 14 else 0 end
        + case when nullif(btrim(s.whatsapp_phone), '') is not null then 10 else 0 end
        + case when nullif(btrim(s.contact_name), '') is not null then 8 else 0 end
        + case when nullif(btrim(s.legal_name), '') is not null then 8 else 0 end
        + case when coalesce(array_length(s.tags, 1), 0) > 0 then 8 else 0 end
        + case when coalesce(s.profile_data, '{}'::jsonb) <> '{}'::jsonb then 12 else 0 end
        + case when lower(coalesce(s.base_stage, '')) = 'procurement' then 12 else 0 end
        + case when lower(coalesce(s.status, 'active')) = 'active' and s.archived_at is null then 10 else 0 end
        - case when lower(coalesce(s.status, '')) in ('blocked', 'archived') then 25 else 0 end
      )::integer as health_score,
      row_number() over (
        partition by s.owner_email,
          coalesce(s.organization_id, nullif(btrim(p_organization_id), ''), ''),
          s.normalized_name,
          s.normalized_domain
        order by
          (coalesce(s.notes, '') ~* '(^|[^a-z0-9])source\s*id\s*:') desc,
          coalesce(q.quote_count, 0) desc,
          (
            case when nullif(btrim(s.primary_email), '') is not null then 18 else 0 end
            + case when nullif(btrim(s.domain), '') is not null then 14 else 0 end
            + case when nullif(btrim(s.whatsapp_phone), '') is not null then 10 else 0 end
            + case when nullif(btrim(s.contact_name), '') is not null then 8 else 0 end
            + case when nullif(btrim(s.legal_name), '') is not null then 8 else 0 end
            + case when coalesce(array_length(s.tags, 1), 0) > 0 then 8 else 0 end
            + case when coalesce(s.profile_data, '{}'::jsonb) <> '{}'::jsonb then 12 else 0 end
            + case when lower(coalesce(s.base_stage, '')) = 'procurement' then 12 else 0 end
            + case when lower(coalesce(s.status, 'active')) = 'active' and s.archived_at is null then 10 else 0 end
            - case when lower(coalesce(s.status, '')) in ('blocked', 'archived') then 25 else 0 end
          ) desc,
          (lower(coalesce(s.base_stage, '')) = 'procurement') desc,
          s.updated_at desc nulls last,
          s.created_at asc nulls last,
          s.id
      ) as priority_rank
    from scoped s
    join duplicate_keys d
      on d.owner_email = s.owner_email
     and d.organization_key = coalesce(s.organization_id, nullif(btrim(p_organization_id), ''), '')
     and d.normalized_name = s.normalized_name
     and d.normalized_domain = s.normalized_domain
    left join quote_evidence q on q.vendor_id = s.id
  ),
  winners as (
    select * from ranked where priority_rank = 1
  )
  select
    r.owner_email,
    r.organization_id,
    r.organization_key,
    r.normalized_name,
    r.normalized_domain,
    w.id as winner_id,
    r.id as loser_id,
    w.has_source_id as winner_has_source_id,
    w.quote_count as winner_quote_count,
    w.health_score as winner_health_score,
    r.has_source_id as loser_has_source_id,
    r.quote_count as loser_quote_count,
    r.health_score as loser_health_score,
    case
      when w.has_source_id then 'Apollo Source ID in Notes'
      when w.quote_count > 0 then 'Most linked quotation evidence'
      else 'Highest vendor health score'
    end as selection_reason
  from ranked r
  join winners w
    on w.owner_email = r.owner_email
   and w.organization_key = r.organization_key
   and w.normalized_name = r.normalized_name
   and w.normalized_domain = r.normalized_domain
  where r.priority_rank > 1;

  drop table if exists pg_temp.vendor_merge_members;

  create temporary table vendor_merge_members on commit drop as
  select distinct p.winner_id, p.winner_id as member_id
  from vendor_merge_plan p
  union
  select distinct p.winner_id, p.loser_id as member_id
  from vendor_merge_plan p;

  select count(distinct (organization_key, normalized_name, normalized_domain)), count(*)
    into v_group_count, v_duplicate_count
  from vendor_merge_plan;

  select coalesce(jsonb_agg(preview_row order by normalized_name, normalized_domain), '[]'::jsonb)
    into v_preview
  from (
    select
      p.normalized_name,
      p.normalized_domain,
      jsonb_build_object(
        'canonical_vendor_id', p.winner_id,
        'canonical_vendor_name', max(w.vendor_name),
        'normalized_name', p.normalized_name,
        'normalized_domain', p.normalized_domain,
        'selection_reason', max(p.selection_reason),
        'has_source_id', bool_or(p.winner_has_source_id),
        'linked_quote_evidence', max(p.winner_quote_count),
        'health_score', max(p.winner_health_score),
        'merged_vendor_ids', jsonb_agg(p.loser_id order by p.loser_id),
        'duplicates_removed', count(*)
      ) as preview_row
    from vendor_merge_plan p
    join public.vendors w on w.id = p.winner_id
    group by p.winner_id, p.normalized_name, p.normalized_domain
    order by p.normalized_name, p.normalized_domain
    limit greatest(1, least(coalesce(p_preview_limit, 100), 500))
  ) preview_rows;

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'duplicate_groups', v_group_count,
      'duplicates_to_remove', v_duplicate_count,
      'priority', jsonb_build_array('Apollo Source ID in Notes', 'Linked quotation evidence', 'Vendor health score'),
      'match_rule', 'Exact normalized company name + exact non-generic corporate domain + workspace',
      'preview', v_preview
    );
  end if;

  perform 1
  from public.vendors v
  join vendor_merge_members m on m.member_id = v.id
  order by v.id
  for update of v;

  select count(*) into v_conflict_count
  from (
    select m.winner_id, t.rfx_event_id, t.thread_type, t.rfx_lane_id
    from public.bid_room_chat_threads t
    join vendor_merge_members m on m.member_id = t.vendor_id
    where t.status <> 'archived'
    group by m.winner_id, t.rfx_event_id, t.thread_type, t.rfx_lane_id
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % active Bid Room chat thread collision(s).', v_conflict_count;
  end if;

  select count(*) into v_conflict_count
  from (
    select m.winner_id, s.ratebook_id
    from public.rfx_ratebook_shares s
    join vendor_merge_members m on m.member_id = s.vendor_id
    group by m.winner_id, s.ratebook_id
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % Ratebook share collision(s).', v_conflict_count;
  end if;

  select count(*) into v_conflict_count
  from (
    select m.winner_id, s.owner_email
    from public.vendor_value_scorecards s
    join vendor_merge_members m on m.member_id = s.vendor_id
    group by m.winner_id, s.owner_email
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % vendor scorecard collision(s).', v_conflict_count;
  end if;

  select count(*) into v_conflict_count
  from (
    select m.winner_id, c.owner_email, c.phone_e164
    from public.vendor_whatsapp_contacts c
    join vendor_merge_members m on m.member_id = c.vendor_id
    group by m.winner_id, c.owner_email, c.phone_e164
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % WhatsApp contact collision(s).', v_conflict_count;
  end if;

  select count(*) into v_conflict_count
  from (
    select
      m.winner_id,
      g.owner_email,
      coalesce(nullif(btrim(g.meta_group_id), ''), nullif(btrim(g.group_url), ''), nullif(btrim(g.group_name), '')) as group_identity
    from public.vendor_whatsapp_groups g
    join vendor_merge_members m on m.member_id = g.vendor_id
    where coalesce(nullif(btrim(g.meta_group_id), ''), nullif(btrim(g.group_url), ''), nullif(btrim(g.group_name), '')) is not null
    group by
      m.winner_id,
      g.owner_email,
      coalesce(nullif(btrim(g.meta_group_id), ''), nullif(btrim(g.group_url), ''), nullif(btrim(g.group_name), ''))
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % WhatsApp group collision(s).', v_conflict_count;
  end if;

  select count(*) into v_conflict_count
  from (
    select m.winner_id, s.owner_email, s.channel, s.contact_value
    from public.outreach_contact_suppressions s
    join vendor_merge_members m on m.member_id = s.vendor_id
    where s.active is true
    group by m.winner_id, s.owner_email, s.channel, s.contact_value
    having count(*) > 1
  ) conflicts;
  if v_conflict_count > 0 then
    raise exception 'Vendor consolidation blocked: % active outreach suppression collision(s).', v_conflict_count;
  end if;

  for v_group in
    select
      p.winner_id,
      p.owner_email,
      max(p.organization_id) as organization_id,
      p.normalized_name,
      p.normalized_domain,
      max(p.selection_reason) as selection_reason,
      array_agg(p.loser_id order by p.loser_id) as loser_ids
    from vendor_merge_plan p
    group by p.winner_id, p.owner_email, p.normalized_name, p.normalized_domain
  loop
    insert into public.vendor_merge_audit (
      owner_email,
      organization_id,
      canonical_vendor_id,
      merged_vendor_ids,
      normalized_name,
      normalized_domain,
      selection_reason,
      relationship_counts,
      canonical_snapshot,
      duplicate_snapshots
    )
    select
      v_group.owner_email,
      v_group.organization_id,
      v_group.winner_id,
      v_group.loser_ids,
      v_group.normalized_name,
      v_group.normalized_domain,
      v_group.selection_reason,
      jsonb_build_object(
        'rates', (select count(*) from public.rates where vendor_id = any(v_group.loser_ids)),
        'rate_staging', (select count(*) from public.rate_staging where vendor_id = any(v_group.loser_ids)),
        'rfx_lane_vendors', (select count(*) from public.rfx_lane_vendors where vendor_id = any(v_group.loser_ids)),
        'outreach_messages', (select count(*) from public.outreach_messages where vendor_id = any(v_group.loser_ids)),
        'ratebook_quotes', (
          select count(*)
          from public.rfx_ratebook_carrier_quotes q
          where q.vendor_id = any(v_group.loser_ids)
        )
      ),
      to_jsonb(w),
      coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at, d.id) from public.vendors d where d.id = any(v_group.loser_ids)), '[]'::jsonb)
    from public.vendors w
    where w.id = v_group.winner_id;

    for v_loser in
      select p.* from vendor_merge_plan p
      where p.winner_id = v_group.winner_id
      order by p.loser_id
    loop
      update public.vendors w
      set
        organization_id = coalesce(w.organization_id, l.organization_id, nullif(btrim(p_organization_id), '')),
        name = coalesce(nullif(w.name, ''), nullif(l.name, '')),
        vendor_name = coalesce(nullif(w.vendor_name, ''), nullif(l.vendor_name, '')),
        legal_name = coalesce(nullif(w.legal_name, ''), nullif(l.legal_name, '')),
        contact_name = coalesce(nullif(w.contact_name, ''), nullif(l.contact_name, '')),
        primary_email = coalesce(nullif(w.primary_email, ''), nullif(l.primary_email, '')),
        secondary_emails = (
          select coalesce(array_agg(distinct email order by email) filter (where nullif(btrim(email), '') is not null), '{}'::text[])
          from unnest(coalesce(w.secondary_emails, '{}'::text[]) || coalesce(l.secondary_emails, '{}'::text[])
            || array_remove(array[l.primary_email], null)) email
        ),
        whatsapp_phone = coalesce(nullif(w.whatsapp_phone, ''), nullif(l.whatsapp_phone, '')),
        preferred_channel = coalesce(nullif(w.preferred_channel, ''), nullif(l.preferred_channel, '')),
        mc = coalesce(nullif(w.mc, ''), nullif(l.mc, '')),
        dot = coalesce(nullif(w.dot, ''), nullif(l.dot, '')),
        tags = (
          select coalesce(array_agg(distinct tag order by tag) filter (where nullif(btrim(tag), '') is not null), '{}'::text[])
          from unnest(coalesce(w.tags, '{}'::text[]) || coalesce(l.tags, '{}'::text[])) tag
        ),
        notes = case
          when nullif(btrim(l.notes), '') is null then w.notes
          when nullif(btrim(w.notes), '') is null then l.notes
          when position(l.notes in w.notes) > 0 then w.notes
          else w.notes || E'\n\nMerged profile notes:\n' || l.notes
        end,
        coverage_notes = case
          when nullif(btrim(l.coverage_notes), '') is null then w.coverage_notes
          when nullif(btrim(w.coverage_notes), '') is null then l.coverage_notes
          when position(l.coverage_notes in w.coverage_notes) > 0 then w.coverage_notes
          else w.coverage_notes || E'\n' || l.coverage_notes
        end,
        source = coalesce(nullif(w.source, ''), nullif(l.source, '')),
        base_stage = case
          when lower(coalesce(w.base_stage, '')) = 'procurement' or lower(coalesce(l.base_stage, '')) = 'procurement' then 'procurement'
          else coalesce(nullif(w.base_stage, ''), nullif(l.base_stage, ''))
        end,
        status = case
          when lower(coalesce(w.status, '')) = 'active' or lower(coalesce(l.status, '')) = 'active' then 'active'
          else coalesce(nullif(w.status, ''), nullif(l.status, ''))
        end,
        active = coalesce(w.active, false) or coalesce(l.active, false),
        archived_at = case when coalesce(w.active, false) or coalesce(l.active, false) then null else coalesce(w.archived_at, l.archived_at) end,
        funnel_stage = case
          when array_position(array['targeted','nested','drafted','invited','onboarded','trained','activated','completed'], lower(coalesce(l.funnel_stage, 'targeted')))
             > array_position(array['targeted','nested','drafted','invited','onboarded','trained','activated','completed'], lower(coalesce(w.funnel_stage, 'targeted')))
            then l.funnel_stage
          else coalesce(w.funnel_stage, l.funnel_stage)
        end,
        funnel_stage_updated_at = greatest(w.funnel_stage_updated_at, l.funnel_stage_updated_at),
        targeted_at = coalesce(w.targeted_at, l.targeted_at),
        nested_at = coalesce(w.nested_at, l.nested_at),
        drafted_at = coalesce(w.drafted_at, l.drafted_at),
        invited_at = coalesce(w.invited_at, l.invited_at),
        onboarded_at = coalesce(w.onboarded_at, l.onboarded_at),
        trained_at = coalesce(w.trained_at, l.trained_at),
        activated_at = coalesce(w.activated_at, l.activated_at),
        completed_at = coalesce(w.completed_at, l.completed_at),
        logo_url = coalesce(nullif(w.logo_url, ''), nullif(l.logo_url, '')),
        logo_storage_bucket = coalesce(nullif(w.logo_storage_bucket, ''), nullif(l.logo_storage_bucket, '')),
        logo_storage_path = coalesce(nullif(w.logo_storage_path, ''), nullif(l.logo_storage_path, '')),
        logo_source = coalesce(nullif(w.logo_source, ''), nullif(l.logo_source, '')),
        profile_data = coalesce(l.profile_data, '{}'::jsonb) || coalesce(w.profile_data, '{}'::jsonb)
          || jsonb_build_object(
            'merged_vendor_ids', (
              select coalesce(jsonb_agg(stable_ids.merged_id order by stable_ids.merged_id), '[]'::jsonb)
              from (
                select distinct merged_id
                from (
                  select jsonb_array_elements_text(
                    case
                      when jsonb_typeof(w.profile_data -> 'merged_vendor_ids') = 'array'
                        then w.profile_data -> 'merged_vendor_ids'
                      else '[]'::jsonb
                    end
                  ) as merged_id
                  union all
                  select jsonb_array_elements_text(
                    case
                      when jsonb_typeof(l.profile_data -> 'merged_vendor_ids') = 'array'
                        then l.profile_data -> 'merged_vendor_ids'
                      else '[]'::jsonb
                    end
                  ) as merged_id
                  union all
                  select v_loser.loser_id::text
                ) merged_ids
                where nullif(btrim(merged_id), '') is not null
              ) stable_ids
            ),
            'last_duplicate_consolidation_at', now()
          ),
        whatsapp_permission_basis = coalesce(nullif(w.whatsapp_permission_basis, ''), nullif(l.whatsapp_permission_basis, '')),
        whatsapp_do_not_contact = coalesce(w.whatsapp_do_not_contact, false) or coalesce(l.whatsapp_do_not_contact, false),
        whatsapp_opt_in_status = coalesce(nullif(w.whatsapp_opt_in_status, ''), nullif(l.whatsapp_opt_in_status, '')),
        whatsapp_last_verified_at = greatest(w.whatsapp_last_verified_at, l.whatsapp_last_verified_at),
        whatsapp_group_url = coalesce(nullif(w.whatsapp_group_url, ''), nullif(l.whatsapp_group_url, '')),
        whatsapp_group_name = coalesce(nullif(w.whatsapp_group_name, ''), nullif(l.whatsapp_group_name, '')),
        whatsapp_meta_group_id = coalesce(nullif(w.whatsapp_meta_group_id, ''), nullif(l.whatsapp_meta_group_id, '')),
        whatsapp_group_status = coalesce(nullif(w.whatsapp_group_status, ''), nullif(l.whatsapp_group_status, '')),
        whatsapp_notes = coalesce(nullif(w.whatsapp_notes, ''), nullif(l.whatsapp_notes, '')),
        updated_at = now()
      from public.vendors l
      where w.id = v_loser.winner_id
        and l.id = v_loser.loser_id;

      for v_lane_vendor in
        select lv.*
        from public.rfx_lane_vendors lv
        where lv.vendor_id = v_loser.loser_id
        order by lv.created_at, lv.id
      loop
        select lv.id into v_keeper_lane_vendor_id
        from public.rfx_lane_vendors lv
        where lv.rfx_lane_id = v_lane_vendor.rfx_lane_id
          and lv.vendor_id = v_loser.winner_id
        order by
          (lv.award_role is not null) desc,
          (lv.bid_rate is not null) desc,
          lv.responded_at desc nulls last,
          lv.updated_at desc nulls last,
          lv.id
        limit 1;

        if v_keeper_lane_vendor_id is null then
          update public.rfx_lane_vendors
          set vendor_id = v_loser.winner_id, updated_at = now()
          where id = v_lane_vendor.id;
        else
          insert into public.rfx_segment_confirmations (
            owner_user_id, owner_email, organization_id, rfx_event_id,
            rfx_lane_vendor_id, vendor_id, segment_key, rubric_key,
            answer, comment, source, metadata, created_at, updated_at
          )
          select
            c.owner_user_id, c.owner_email, c.organization_id, c.rfx_event_id,
            v_keeper_lane_vendor_id, v_loser.winner_id, c.segment_key, c.rubric_key,
            c.answer, c.comment, c.source, c.metadata, c.created_at, c.updated_at
          from public.rfx_segment_confirmations c
          where c.rfx_lane_vendor_id = v_lane_vendor.id
          on conflict (rfx_lane_vendor_id, segment_key, rubric_key) do update
          set
            answer = case
              when nullif(btrim(rfx_segment_confirmations.answer), '') is null then excluded.answer
              else rfx_segment_confirmations.answer
            end,
            comment = case
              when nullif(btrim(excluded.comment), '') is null then rfx_segment_confirmations.comment
              when nullif(btrim(rfx_segment_confirmations.comment), '') is null then excluded.comment
              when position(excluded.comment in rfx_segment_confirmations.comment) > 0 then rfx_segment_confirmations.comment
              else rfx_segment_confirmations.comment || E'\n' || excluded.comment
            end,
            metadata = coalesce(rfx_segment_confirmations.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
            updated_at = greatest(rfx_segment_confirmations.updated_at, excluded.updated_at);

          delete from public.rfx_segment_confirmations
          where rfx_lane_vendor_id = v_lane_vendor.id;

          update public.outreach_messages old_message
          set rfx_lane_vendor_id = null,
              vendor_id = v_loser.winner_id
          where old_message.rfx_lane_vendor_id = v_lane_vendor.id
            and exists (
              select 1
              from public.outreach_messages keeper_message
              where keeper_message.campaign_id = old_message.campaign_id
                and keeper_message.rfx_lane_vendor_id = v_keeper_lane_vendor_id
                and keeper_message.channel = old_message.channel
                and keeper_message.contact_key = old_message.contact_key
            );

          update public.outreach_messages
          set rfx_lane_vendor_id = v_keeper_lane_vendor_id,
              vendor_id = v_loser.winner_id
          where rfx_lane_vendor_id = v_lane_vendor.id;

          update public.rfx_ratebook_shares
          set primary_rfx_lane_vendor_id = v_keeper_lane_vendor_id,
              updated_at = now()
          where primary_rfx_lane_vendor_id = v_lane_vendor.id;

          update public.rfx_lane_vendors keeper
          set
            invitation_status = case
              when lower(coalesce(keeper.invitation_status, '')) in ('awarded','backup','quoted','rejected','withdrawn') then keeper.invitation_status
              when lower(coalesce(v_lane_vendor.invitation_status, '')) in ('awarded','backup','quoted','rejected','withdrawn') then v_lane_vendor.invitation_status
              else coalesce(nullif(keeper.invitation_status, ''), v_lane_vendor.invitation_status)
            end,
            invited_at = coalesce(keeper.invited_at, v_lane_vendor.invited_at),
            viewed_at = greatest(keeper.viewed_at, v_lane_vendor.viewed_at),
            responded_at = greatest(keeper.responded_at, v_lane_vendor.responded_at),
            bid_rate = coalesce(keeper.bid_rate, v_lane_vendor.bid_rate),
            currency = coalesce(nullif(keeper.currency, ''), v_lane_vendor.currency),
            weekly_capacity = coalesce(keeper.weekly_capacity, v_lane_vendor.weekly_capacity),
            transit_days = coalesce(keeper.transit_days, v_lane_vendor.transit_days),
            notes = case
              when nullif(btrim(v_lane_vendor.notes), '') is null then keeper.notes
              when nullif(btrim(keeper.notes), '') is null then v_lane_vendor.notes
              when position(v_lane_vendor.notes in keeper.notes) > 0 then keeper.notes
              else keeper.notes || E'\n' || v_lane_vendor.notes
            end,
            response_source = coalesce(nullif(keeper.response_source, ''), v_lane_vendor.response_source),
            award_role = coalesce(nullif(keeper.award_role, ''), v_lane_vendor.award_role),
            award_reason = coalesce(nullif(keeper.award_reason, ''), v_lane_vendor.award_reason),
            award_notes = coalesce(nullif(keeper.award_notes, ''), v_lane_vendor.award_notes),
            awarded_at = coalesce(keeper.awarded_at, v_lane_vendor.awarded_at),
            awarded_by = coalesce(keeper.awarded_by, v_lane_vendor.awarded_by),
            rate_staging_id = coalesce(keeper.rate_staging_id, v_lane_vendor.rate_staging_id),
            rateware_closeout_at = coalesce(keeper.rateware_closeout_at, v_lane_vendor.rateware_closeout_at),
            commercial_model = coalesce(nullif(keeper.commercial_model, ''), v_lane_vendor.commercial_model),
            marksman_margin_pct = coalesce(keeper.marksman_margin_pct, v_lane_vendor.marksman_margin_pct),
            carrier_share_pct = coalesce(keeper.carrier_share_pct, v_lane_vendor.carrier_share_pct),
            best_alternative_offered = coalesce(keeper.best_alternative_offered, false) or coalesce(v_lane_vendor.best_alternative_offered, false),
            alternative_equipment = coalesce(nullif(keeper.alternative_equipment, ''), v_lane_vendor.alternative_equipment),
            alternative_units = coalesce(keeper.alternative_units, v_lane_vendor.alternative_units),
            alternative_notes = coalesce(nullif(keeper.alternative_notes, ''), v_lane_vendor.alternative_notes),
            equipment_available = coalesce(nullif(keeper.equipment_available, ''), v_lane_vendor.equipment_available),
            unit_details = coalesce(nullif(keeper.unit_details, ''), v_lane_vendor.unit_details),
            eta_pickup = coalesce(keeper.eta_pickup, v_lane_vendor.eta_pickup),
            eta_delivery = coalesce(keeper.eta_delivery, v_lane_vendor.eta_delivery),
            mirror_account_enabled = coalesce(keeper.mirror_account_enabled, false) or coalesce(v_lane_vendor.mirror_account_enabled, false),
            availability_validation_status = coalesce(nullif(keeper.availability_validation_status, ''), v_lane_vendor.availability_validation_status),
            availability_validation_notes = coalesce(nullif(keeper.availability_validation_notes, ''), v_lane_vendor.availability_validation_notes),
            bid_rate_staging_id = coalesce(keeper.bid_rate_staging_id, v_lane_vendor.bid_rate_staging_id),
            bid_rate_staged_at = coalesce(keeper.bid_rate_staged_at, v_lane_vendor.bid_rate_staged_at),
            valid_through = coalesce(keeper.valid_through, v_lane_vendor.valid_through),
            current_unit_location = coalesce(nullif(keeper.current_unit_location, ''), v_lane_vendor.current_unit_location),
            deadhead_distance = coalesce(keeper.deadhead_distance, v_lane_vendor.deadhead_distance),
            deadhead_unit = coalesce(nullif(keeper.deadhead_unit, ''), v_lane_vendor.deadhead_unit),
            updated_at = greatest(keeper.updated_at, v_lane_vendor.updated_at, now())
          where keeper.id = v_keeper_lane_vendor_id;

          delete from public.rfx_lane_vendors where id = v_lane_vendor.id;
        end if;

        v_keeper_lane_vendor_id := null;
      end loop;

      update public.bid_room_chat_messages set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.bid_room_chat_threads set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.contact_history set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.email_suppression_list set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.interpretation_memory set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.outreach_contact_suppressions set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.outreach_messages set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.rate_staging set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.rates set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.raw_uploads set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.rfx_award_package_lanes set awarded_carrier_id = v_loser.winner_id, updated_at = now() where awarded_carrier_id = v_loser.loser_id;
      update public.rfx_award_package_lanes set backup_carrier_id = v_loser.winner_id, updated_at = now() where backup_carrier_id = v_loser.loser_id;
      update public.rfx_ratebook_carrier_quote_revisions set vendor_id = v_loser.winner_id where vendor_id = v_loser.loser_id;
      update public.rfx_ratebook_carrier_quotes set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.rfx_ratebook_quote_reviews set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.rfx_ratebook_shares set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.rfx_segment_confirmations set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.vendor_improvement_cases set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.vendor_profile_requests set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.vendor_value_scorecards set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.vendor_whatsapp_contacts set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;
      update public.vendor_whatsapp_groups set vendor_id = v_loser.winner_id, updated_at = now() where vendor_id = v_loser.loser_id;

      delete from public.vendors where id = v_loser.loser_id;
      v_removed_count := v_removed_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'dry_run', false,
    'duplicate_groups', v_group_count,
    'duplicates_removed', v_removed_count,
    'canonical_vendors_kept', v_group_count,
    'priority', jsonb_build_array('Apollo Source ID in Notes', 'Linked quotation evidence', 'Vendor health score'),
    'match_rule', 'Exact normalized company name + exact non-generic corporate domain + workspace',
    'preview', v_preview
  );
end;
$$;

revoke all on function public.consolidate_exact_workspace_vendor_duplicates(text, text, boolean, integer) from public;
revoke all on function public.consolidate_exact_workspace_vendor_duplicates(text, text, boolean, integer) from anon;
revoke all on function public.consolidate_exact_workspace_vendor_duplicates(text, text, boolean, integer) from authenticated;
grant execute on function public.consolidate_exact_workspace_vendor_duplicates(text, text, boolean, integer) to service_role;

revoke all on public.vendor_merge_audit from anon, authenticated;
grant select, insert on public.vendor_merge_audit to service_role;
