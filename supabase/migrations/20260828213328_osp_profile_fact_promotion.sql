-- Sprint 7: explicit, atomic promotion of an approved documentary review into
-- the canonical legal-entity fact ledger. The command has no release, email,
-- webhook, signature, provider or package-generation authority.

create or replace function osp_private.canonical_jsonb_text(p_value jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(p_value)
    when 'object' then coalesce((
      select '{' || pg_catalog.string_agg(pg_catalog.to_jsonb(member.key)::text || ':' || osp_private.canonical_jsonb_text(member.value), ',' order by member.key) || '}'
      from pg_catalog.jsonb_each(p_value) member
    ), '{}')
    when 'array' then coalesce((
      select '[' || pg_catalog.string_agg(osp_private.canonical_jsonb_text(item.value), ',' order by item.ordinality) || ']'
      from pg_catalog.jsonb_array_elements(p_value) with ordinality item(value, ordinality)
    ), '[]')
    else p_value::text
  end;
$$;

create or replace function osp_private.profile_review_candidate_sha256(
  p_organization_id uuid,
  p_review_id uuid,
  p_expected_revision integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(
    'osp-profile-fact-promotion-v1' || E'\norganizationId=' || p_organization_id::text
      || E'\nreviewId=' || p_review_id::text
      || E'\nreviewRevision=' || p_expected_revision::text
      || coalesce(E'\n' || string_agg(
        field.field_code || '|' || field.id::text || '|' || field.field_status || '|'
          || osp_private.canonical_jsonb_text(case when field.field_status = 'corrected' then field.reviewer_value else field.proposed_value end)
          || '|' || field.sensitivity,
        E'\n' order by field.field_code, field.id
      ), ''),
    'UTF8'
  ), 'sha256'), 'hex')
  from public.provider_entity_document_review_fields field
  where field.organization_id = p_organization_id
    and field.review_id = p_review_id
    and field.field_status in ('accepted', 'corrected');
$$;

create or replace function osp_private.promote_profile_review_facts_command(
  p_organization_id uuid,
  p_review_id uuid,
  p_expected_review_revision integer,
  p_expected_candidate_sha256 text,
  p_expected_current_fact_ids jsonb,
  p_actor_subject text,
  p_actor_permission text
)
returns table (
  promotion_id uuid,
  promotion_status text,
  promoted_fact_count integer,
  unchanged_fact_count integer,
  withheld_field_count integer,
  review_id uuid,
  review_revision integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_review public.provider_entity_document_reviews%rowtype;
  prior public.provider_legal_entity_fact_promotions%rowtype;
  candidate record;
  current_fact public.provider_legal_entity_facts%rowtype;
  created_promotion_id uuid;
  actual_candidate_sha256 text;
  candidate_value jsonb;
  candidate_value_sha256 text;
  expected_current_id text;
  next_fact_id uuid;
  promoted_count integer := 0;
  unchanged_count integer := 0;
  withheld_count integer := 0;
  event_time timestamptz := pg_catalog.statement_timestamp();
begin
  if p_actor_permission <> 'osp:operate'
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.length(p_actor_subject) not between 1 and 256
     or p_expected_review_revision < 1
     or p_expected_candidate_sha256 !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_expected_current_fact_ids) <> 'object'
     or nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'PROFILE_FACT_PROMOTION_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_review_id::text, 0)
  );

  select * into target_review
  from public.provider_entity_document_reviews review
  where review.organization_id = p_organization_id
    and review.id = p_review_id
  for update;

  if not found or target_review.review_status <> 'approved'
     or target_review.revision <> p_expected_review_revision then
    raise exception using errcode = '40001', message = 'PROFILE_FACT_REVIEW_VERSION_CONFLICT';
  end if;

  select * into prior
  from public.provider_legal_entity_fact_promotions promotion
  where promotion.organization_id = p_organization_id
    and promotion.review_id = p_review_id;

  if found then
    if prior.promotion_status <> 'applied'
       or prior.expected_review_revision <> p_expected_review_revision
       or prior.metadata->>'candidate_sha256' is distinct from p_expected_candidate_sha256 then
      raise exception using errcode = '40001', message = 'PROFILE_FACT_PROMOTION_CONFLICT';
    end if;
    return query select prior.id, prior.promotion_status, prior.promoted_fact_count,
      prior.unchanged_fact_count, coalesce((prior.metadata->>'withheld_field_count')::integer, 0),
      p_review_id, p_expected_review_revision, true;
    return;
  end if;

  actual_candidate_sha256 := osp_private.profile_review_candidate_sha256(
    p_organization_id, p_review_id, p_expected_review_revision
  );
  if actual_candidate_sha256 is distinct from p_expected_candidate_sha256 then
    raise exception using errcode = '40001', message = 'PROFILE_FACT_CANDIDATE_CHANGED';
  end if;

  select count(*)::integer into withheld_count
  from public.provider_entity_document_review_fields field
  where field.organization_id = p_organization_id
    and field.review_id = p_review_id
    and field.field_status = 'withheld';

  for candidate in
    select field.id, field.field_code, field.field_status, field.proposed_value,
      field.reviewer_value, field.sensitivity
    from public.provider_entity_document_review_fields field
    where field.organization_id = p_organization_id
      and field.review_id = p_review_id
      and field.field_status in ('accepted', 'corrected')
    order by field.field_code, field.id
  loop
    if not (p_expected_current_fact_ids ? candidate.field_code) then
      raise exception using errcode = '40001', message = 'PROFILE_FACT_EXPECTATION_INCOMPLETE';
    end if;
    current_fact := null;
    select * into current_fact
    from public.provider_legal_entity_facts fact
    where fact.organization_id = p_organization_id
      and fact.legal_entity_id = target_review.legal_entity_id
      and fact.field_code = candidate.field_code
      and fact.fact_status = 'current'
    for update;
    expected_current_id := p_expected_current_fact_ids->>candidate.field_code;
    if (current_fact.id is null and expected_current_id is not null)
       or (current_fact.id is not null and expected_current_id is distinct from current_fact.id::text) then
      raise exception using errcode = '40001', message = 'PROFILE_FACT_CURRENT_VERSION_CONFLICT';
    end if;
  end loop;

  insert into public.provider_legal_entity_fact_promotions (
    organization_id, legal_entity_id, review_id, expected_review_revision,
    promotion_status, promoted_by_actor_id, metadata
  ) values (
    p_organization_id, target_review.legal_entity_id, p_review_id, p_expected_review_revision,
    'pending', p_actor_subject, pg_catalog.jsonb_build_object(
      'candidate_sha256', p_expected_candidate_sha256,
      'withheld_field_count', withheld_count,
      'authority', p_actor_permission,
      'outbound_effects', false
    )
  ) returning id into created_promotion_id;

  insert into public.provider_legal_entity_fact_events (
    organization_id, legal_entity_id, promotion_id, event_type, field_code, actor_id, payload, occurred_at
  )
  select p_organization_id, target_review.legal_entity_id, created_promotion_id,
    'field_withheld', field.field_code, p_actor_subject,
    pg_catalog.jsonb_build_object('sensitivity', field.sensitivity), event_time
  from public.provider_entity_document_review_fields field
  where field.organization_id = p_organization_id
    and field.review_id = p_review_id
    and field.field_status = 'withheld';

  for candidate in
    select field.id, field.field_code, field.field_status, field.proposed_value,
      field.reviewer_value, field.sensitivity
    from public.provider_entity_document_review_fields field
    where field.organization_id = p_organization_id
      and field.review_id = p_review_id
      and field.field_status in ('accepted', 'corrected')
    order by field.field_code, field.id
  loop
    candidate_value := case when candidate.field_status = 'corrected'
      then candidate.reviewer_value else candidate.proposed_value end;
    if candidate_value is null then
      raise exception using errcode = '23514', message = 'PROFILE_FACT_VALUE_MISSING';
    end if;
    candidate_value_sha256 := encode(extensions.digest(convert_to(osp_private.canonical_jsonb_text(candidate_value), 'UTF8'), 'sha256'), 'hex');
    current_fact := null;
    select * into current_fact
    from public.provider_legal_entity_facts fact
    where fact.organization_id = p_organization_id
      and fact.legal_entity_id = target_review.legal_entity_id
      and fact.field_code = candidate.field_code
      and fact.fact_status = 'current'
    for update;

    if current_fact.id is not null and current_fact.fact_value_sha256 = candidate_value_sha256 then
      unchanged_count := unchanged_count + 1;
      insert into public.provider_legal_entity_fact_events (
        organization_id, legal_entity_id, fact_id, promotion_id, event_type, field_code, actor_id, occurred_at
      ) values (
        p_organization_id, target_review.legal_entity_id, current_fact.id, created_promotion_id,
        'fact_unchanged', candidate.field_code, p_actor_subject, event_time
      );
      continue;
    end if;

    next_fact_id := gen_random_uuid();
    if current_fact.id is not null then
      update public.provider_legal_entity_facts fact
      set fact_status = 'superseded', superseded_at = event_time
      where fact.organization_id = p_organization_id
        and fact.id = current_fact.id
        and fact.fact_status = 'current';
      if not found then
        raise exception using errcode = '40001', message = 'PROFILE_FACT_CURRENT_VERSION_CONFLICT';
      end if;
    end if;

    insert into public.provider_legal_entity_facts (
      id, organization_id, legal_entity_id, field_code, fact_value, fact_value_sha256,
      sensitivity, source_review_id, source_review_field_id, source_promotion_id, effective_at
    ) values (
      next_fact_id, p_organization_id, target_review.legal_entity_id, candidate.field_code,
      candidate_value, candidate_value_sha256, candidate.sensitivity, p_review_id,
      candidate.id, created_promotion_id, event_time
    );

    if current_fact.id is not null then
      update public.provider_legal_entity_facts fact
      set superseded_by_fact_id = next_fact_id
      where fact.organization_id = p_organization_id
        and fact.id = current_fact.id
        and fact.fact_status = 'superseded'
        and fact.superseded_by_fact_id is null;
      if not found then
        raise exception using errcode = '40001', message = 'PROFILE_FACT_CURRENT_VERSION_CONFLICT';
      end if;
      insert into public.provider_legal_entity_fact_events (
        organization_id, legal_entity_id, fact_id, promotion_id, event_type, field_code, actor_id, payload, occurred_at
      ) values (
        p_organization_id, target_review.legal_entity_id, current_fact.id, created_promotion_id,
        'fact_superseded', candidate.field_code, p_actor_subject,
        pg_catalog.jsonb_build_object('superseded_by_fact_id', next_fact_id), event_time
      );
    end if;
    insert into public.provider_legal_entity_fact_events (
      organization_id, legal_entity_id, fact_id, promotion_id, event_type, field_code, actor_id, payload, occurred_at
    ) values (
      p_organization_id, target_review.legal_entity_id, next_fact_id, created_promotion_id,
      'fact_promoted', candidate.field_code, p_actor_subject,
      pg_catalog.jsonb_build_object('source_review_field_id', candidate.id), event_time
    );
    promoted_count := promoted_count + 1;
  end loop;

  update public.provider_legal_entity_fact_promotions promotion
  set promotion_status = 'applied', promoted_fact_count = promoted_count,
    unchanged_fact_count = unchanged_count, completed_at = event_time
  where promotion.organization_id = p_organization_id
    and promotion.id = created_promotion_id
    and promotion.promotion_status = 'pending';
  if not found then
    raise exception using errcode = '40001', message = 'PROFILE_FACT_PROMOTION_CONFLICT';
  end if;

  return query select created_promotion_id, 'applied'::text, promoted_count,
    unchanged_count, withheld_count, p_review_id, p_expected_review_revision, false;
end;
$$;

revoke all on function osp_private.profile_review_candidate_sha256(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function osp_private.canonical_jsonb_text(jsonb)
  from public, anon, authenticated;
revoke all on function osp_private.promote_profile_review_facts_command(uuid, uuid, integer, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function osp_private.profile_review_candidate_sha256(uuid, uuid, integer)
  to osp_workflow_api;
grant execute on function osp_private.promote_profile_review_facts_command(uuid, uuid, integer, text, jsonb, text, text)
  to osp_workflow_api;

comment on function osp_private.promote_profile_review_facts_command(uuid, uuid, integer, text, jsonb, text, text) is
  'Atomically promotes the exact approved review into canonical facts. It cannot release packages or cause outbound effects.';
