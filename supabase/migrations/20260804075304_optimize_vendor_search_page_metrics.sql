create extension if not exists pg_trgm with schema extensions;

alter table public.vendors
  add column if not exists search_document text;

create or replace function public.rateware_refresh_vendor_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document := public.rateware_vendor_search_key(concat_ws(' ',
    new.vendor_name,
    new.name,
    new.legal_name,
    new.contact_name,
    new.domain,
    new.primary_email,
    array_to_string(coalesce(new.secondary_emails, '{}'::text[]), ' '),
    new.whatsapp_phone,
    array_to_string(coalesce(new.tags, '{}'::text[]), ' '),
    new.coverage_notes,
    new.notes,
    coalesce(new.profile_data::text, '')
  ));
  return new;
end;
$$;

update public.vendors
set search_document = public.rateware_vendor_search_key(concat_ws(' ',
  vendor_name,
  name,
  legal_name,
  contact_name,
  domain,
  primary_email,
  array_to_string(coalesce(secondary_emails, '{}'::text[]), ' '),
  whatsapp_phone,
  array_to_string(coalesce(tags, '{}'::text[]), ' '),
  coverage_notes,
  notes,
  coalesce(profile_data::text, '')
));

drop trigger if exists vendors_refresh_search_document on public.vendors;
create trigger vendors_refresh_search_document
before insert or update of
  vendor_name, name, legal_name, contact_name, domain, primary_email,
  secondary_emails, whatsapp_phone, tags, coverage_notes, notes, profile_data
on public.vendors
for each row execute function public.rateware_refresh_vendor_search_document();

create index if not exists vendors_search_document_trgm_idx
  on public.vendors using gin (search_document extensions.gin_trgm_ops);

create or replace function public.search_workspace_vendors(
  p_owner_email text,
  p_search text,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  id uuid,
  match_rank integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.rateware_vendor_search_key(p_search) as search_key
  ),
  tokens as (
    select array_remove(regexp_split_to_array(search_key, '[[:space:]]+'), '') as values
    from input
  ),
  anchor as (
    select token
    from tokens
    cross join lateral unnest(tokens.values) as token
    where token <> ''
    order by length(token) desc, token
    limit 1
  ),
  scoped as materialized (
    select
      v.id,
      coalesce(v.search_document, '') as search_text,
      public.rateware_vendor_search_key(v.vendor_name) as vendor_name_key,
      public.rateware_vendor_search_key(v.name) as name_key,
      public.rateware_vendor_search_key(v.legal_name) as legal_name_key,
      public.rateware_vendor_search_key(v.domain) as domain_key,
      public.rateware_vendor_search_key(v.primary_email) as primary_email_key,
      array(
        select public.rateware_vendor_search_key(email)
        from unnest(coalesce(v.secondary_emails, '{}'::text[])) as email
      ) as secondary_email_keys
    from public.vendors v
    cross join anchor
    where lower(v.owner_email) = lower(p_owner_email)
      and v.search_document like '%' || anchor.token || '%'
  ),
  matches as (
    select
      scoped.id,
      case
        when scoped.domain_key = input.search_key
          or scoped.primary_email_key = input.search_key
          or input.search_key = any(scoped.secondary_email_keys) then 0
        when scoped.vendor_name_key = input.search_key
          or scoped.name_key = input.search_key
          or scoped.legal_name_key = input.search_key then 1
        when scoped.domain_key like input.search_key || '%'
          or scoped.primary_email_key like input.search_key || '%'
          or exists (
            select 1
            from unnest(scoped.secondary_email_keys) as secondary_key
            where secondary_key like input.search_key || '%'
          ) then 2
        when scoped.vendor_name_key like input.search_key || '%'
          or scoped.name_key like input.search_key || '%'
          or scoped.legal_name_key like input.search_key || '%' then 3
        else 4
      end as match_rank,
      coalesce(nullif(scoped.vendor_name_key, ''), scoped.name_key, scoped.legal_name_key, scoped.domain_key) as sort_key
    from scoped
    cross join input
    cross join tokens
    where input.search_key <> ''
      and not exists (
        select 1
        from unnest(tokens.values) as token
        where token <> '' and scoped.search_text not like '%' || token || '%'
      )
  )
  select
    matches.id,
    matches.match_rank,
    count(*) over() as total_count
  from matches
  order by matches.match_rank, matches.sort_key, matches.id
  limit least(greatest(coalesce(p_limit, 75), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.vendor_rate_metrics_for_owner_ids(
  p_owner_email text,
  p_vendor_ids uuid[],
  p_base_stage text default null
)
returns table (
  vendor_id uuid,
  linked_rates bigint,
  approved_rates bigint,
  pending_rates bigint,
  crossborder_rates bigint,
  d2d_import_export_rates bigint,
  mexico_rates bigint,
  avg_all_in_rate numeric,
  avg_cost_per_mile numeric,
  avg_cost_per_km numeric,
  markets text[],
  lanes text[],
  equipment text[],
  border_pairs text[],
  last_quote_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with vendor_scope as materialized (
    select
      vendors.id,
      public.rateware_domain_key(vendors.domain) domain_key,
      public.rateware_domain_key(vendors.primary_email) email_domain_key,
      coalesce(vendors.secondary_emails, '{}'::text[]) secondary_emails
    from public.vendors vendors
    where vendors.owner_email = lower(nullif(btrim(p_owner_email), ''))
      and vendors.id = any(coalesce(p_vendor_ids, '{}'::uuid[]))
      and (p_base_stage is null or vendors.base_stage = p_base_stage)
  ),
  domain_candidates as (
    select scope.id resolved_vendor_id, scope.domain_key, 100 priority from vendor_scope scope
    union all
    select scope.id, scope.email_domain_key, 90 from vendor_scope scope
    union all
    select scope.id, public.rateware_domain_key(secondary.email), 80
    from vendor_scope scope
    cross join lateral unnest(scope.secondary_emails) as secondary(email)
  ),
  vendor_domains as materialized (
    select distinct on (candidates.domain_key) candidates.domain_key, candidates.resolved_vendor_id
    from domain_candidates candidates
    where candidates.domain_key is not null
      and not public.rateware_is_generic_email_domain(candidates.domain_key)
    order by candidates.domain_key, candidates.priority desc, candidates.resolved_vendor_id
  ),
  matched as materialized (
    select
      facts.vendor_id resolved_vendor_id,
      facts.status, facts.is_crossborder, facts.is_d2d, facts.is_mexico,
      facts.all_in_amount, facts.cost_per_mile, facts.cost_per_km,
      facts.origin_market_label, facts.destination_market_label,
      facts.route_label, facts.equipment_label, facts.trailer_label,
      facts.border_pair_label, facts.quote_date
    from public.rateware_bi_rate_facts facts
    join vendor_scope scope on scope.id = facts.vendor_id
    where facts.owner_email = lower(nullif(btrim(p_owner_email), ''))
      and facts.status in ('pending_review', 'approved')

    union all

    select
      vendor_domains.resolved_vendor_id,
      facts.status, facts.is_crossborder, facts.is_d2d, facts.is_mexico,
      facts.all_in_amount, facts.cost_per_mile, facts.cost_per_km,
      facts.origin_market_label, facts.destination_market_label,
      facts.route_label, facts.equipment_label, facts.trailer_label,
      facts.border_pair_label, facts.quote_date
    from public.rateware_bi_rate_facts facts
    join vendor_domains on vendor_domains.domain_key = facts.vendor_domain_key
    where facts.owner_email = lower(nullif(btrim(p_owner_email), ''))
      and facts.status in ('pending_review', 'approved')
      and facts.vendor_id is null
  )
  select
    matched.resolved_vendor_id,
    count(*)::bigint,
    count(*) filter (where matched.status = 'approved')::bigint,
    count(*) filter (where matched.status = 'pending_review')::bigint,
    count(*) filter (where matched.is_crossborder)::bigint,
    count(*) filter (where matched.is_d2d)::bigint,
    count(*) filter (where matched.is_mexico)::bigint,
    round(avg(matched.all_in_amount)),
    round(avg(matched.cost_per_mile), 2),
    round(avg(matched.cost_per_km), 2),
    coalesce((
      array_remove(array_agg(distinct nullif(matched.origin_market_label, '-')), null)
      || array_remove(array_agg(distinct nullif(matched.destination_market_label, '-')), null)
    )[1:8], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.route_label, '- -> -')), null))[1:6], '{}'::text[]),
    coalesce((
      array_remove(array_agg(distinct nullif(matched.equipment_label, '-')), null)
      || array_remove(array_agg(distinct nullif(matched.trailer_label, '-')), null)
    )[1:6], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.border_pair_label, '- / -')), null))[1:6], '{}'::text[]),
    max(matched.quote_date)
  from matched
  group by matched.resolved_vendor_id;
$$;

create or replace function public.vendor_bid_metrics_for_owner_ids(
  p_owner_email text,
  p_vendor_ids uuid[]
)
returns table (
  vendor_id uuid,
  shortlisted bigint,
  drafted bigint,
  invited bigint,
  viewed bigint,
  quoted bigint,
  awarded bigint,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lane_vendors.vendor_id,
    count(*)::bigint,
    count(*) filter (where lower(coalesce(lane_vendors.invitation_status, '')) = 'drafted')::bigint,
    count(*) filter (where lower(coalesce(lane_vendors.invitation_status, '')) in ('invited', 'viewed', 'responded', 'quoted', 'bid_submitted', 'awarded'))::bigint,
    count(*) filter (where lower(coalesce(lane_vendors.invitation_status, '')) in ('viewed', 'responded', 'quoted', 'bid_submitted', 'awarded'))::bigint,
    count(*) filter (
      where lane_vendors.bid_rate is not null
         or lower(coalesce(lane_vendors.invitation_status, '')) in ('quoted', 'bid_submitted', 'awarded')
    )::bigint,
    count(*) filter (where lower(coalesce(lane_vendors.invitation_status, '')) = 'awarded')::bigint,
    max(coalesce(
      lane_vendors.awarded_at,
      lane_vendors.responded_at,
      lane_vendors.viewed_at,
      lane_vendors.invited_at,
      lane_vendors.updated_at
    ))
  from public.rfx_lane_vendors lane_vendors
  join public.rfx_events events on events.id = lane_vendors.rfx_event_id
  where events.owner_email = lower(nullif(btrim(p_owner_email), ''))
    and lane_vendors.vendor_id = any(coalesce(p_vendor_ids, '{}'::uuid[]))
    and lower(coalesce(lane_vendors.invitation_status, '')) <> 'archived'
  group by lane_vendors.vendor_id;
$$;

revoke all on function public.search_workspace_vendors(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.vendor_rate_metrics_for_owner_ids(text, uuid[], text) from public, anon, authenticated;
revoke all on function public.vendor_bid_metrics_for_owner_ids(text, uuid[]) from public, anon, authenticated;
grant execute on function public.search_workspace_vendors(text, text, integer, integer) to service_role;
grant execute on function public.vendor_rate_metrics_for_owner_ids(text, uuid[], text) to service_role;
grant execute on function public.vendor_bid_metrics_for_owner_ids(text, uuid[]) to service_role;

analyze public.vendors;
analyze public.rateware_bi_rate_facts;
analyze public.rfx_lane_vendors;
