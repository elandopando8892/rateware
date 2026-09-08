-- Amend only an open correction; preserve the old decision in the append-only event ledger.
create or replace function osp_private.decide_profile_evidence_field_command(
  p_organization_id uuid,
  p_review_id uuid,
  p_field_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_decision_note text,
  p_reviewer_value jsonb,
  p_actor_subject text,
  p_actor_permission text
)
returns table (review_id uuid, field_id uuid, field_status text, revision integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_review public.provider_entity_document_reviews%rowtype;
  target_field public.provider_entity_document_review_fields%rowtype;
  next_revision integer;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_expected_revision < 1
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.length(p_actor_subject) not between 1 and 256
     or p_actor_permission <> 'osp:operate'
     or p_decision not in ('accepted', 'corrected', 'rejected', 'withheld')
     or p_decision_note is distinct from pg_catalog.btrim(p_decision_note)
     or pg_catalog.length(p_decision_note) not between 3 and 1000 then
    raise exception using errcode = '42501', message = 'PROFILE_FIELD_DECISION_FORBIDDEN';
  end if;

  select review.* into target_review
  from public.provider_entity_document_reviews review
  where review.organization_id = p_organization_id
    and review.id = p_review_id
    and review.review_status = 'in_review'
    and review.assigned_reviewer_user_id = p_actor_subject
    and review.revision = p_expected_revision
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'PROFILE_REVIEW_VERSION_CONFLICT';
  end if;

  select field.* into target_field
  from public.provider_entity_document_review_fields field
  where field.organization_id = p_organization_id
    and field.review_id = p_review_id
    and field.id = p_field_id
    and field.field_status in ('pending', 'corrected')
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'PROFILE_FIELD_VERSION_CONFLICT';
  end if;

  -- Only an unfinalized correction owned by this same reviewer can be amended.
  if target_field.field_status = 'corrected'
     and (p_decision <> 'corrected' or target_field.decided_by_user_id is distinct from p_actor_subject) then
    raise exception using errcode = '42501', message = 'PROFILE_CORRECTION_AMENDMENT_FORBIDDEN';
  end if;

  if p_decision = 'corrected' and p_reviewer_value is null then
    raise exception using errcode = '23514', message = 'PROFILE_CORRECTION_VALUE_REQUIRED';
  end if;
  if p_decision <> 'corrected' and p_reviewer_value is not null then
    raise exception using errcode = '23514', message = 'PROFILE_CORRECTION_VALUE_REJECTED';
  end if;
  if p_decision = 'withheld' and target_field.sensitivity not in ('restricted', 'highly_restricted') then
    raise exception using errcode = '23514', message = 'PROFILE_WITHHOLD_NOT_ALLOWED';
  end if;
  if target_field.sensitivity in ('restricted', 'highly_restricted')
     and p_decision in ('accepted', 'corrected') then
    raise exception using errcode = '23514', message = 'PROFILE_RESTRICTED_REVIEW_REQUIRED';
  end if;

  next_revision := target_review.revision + 1;
  update public.provider_entity_document_review_fields field
  set field_status = p_decision,
      reviewer_value = case when p_decision = 'corrected' then p_reviewer_value else null end,
      decided_by_user_id = p_actor_subject,
      decided_at = pg_catalog.statement_timestamp(),
      decision_note = p_decision_note,
      updated_at = pg_catalog.statement_timestamp()
  where field.organization_id = p_organization_id
    and field.review_id = p_review_id
    and field.id = p_field_id
    and field.field_status in ('pending', 'corrected');
  if not found then
    raise exception using errcode = '40001', message = 'PROFILE_FIELD_VERSION_CONFLICT';
  end if;

  update public.provider_entity_document_reviews review
  set revision = next_revision, updated_at = pg_catalog.statement_timestamp()
  where review.organization_id = p_organization_id
    and review.id = p_review_id
    and review.revision = p_expected_revision;
  if not found then
    raise exception using errcode = '40001', message = 'PROFILE_REVIEW_VERSION_CONFLICT';
  end if;

  insert into public.provider_entity_document_review_events (
    organization_id, review_id, event_type, previous_revision, revision,
    actor_user_id, payload, occurred_at
  ) values (
    p_organization_id, p_review_id, 'field_decided', p_expected_revision,
    next_revision, p_actor_subject,
    pg_catalog.jsonb_build_object(
      'field_id', p_field_id, 'field_code', target_field.field_code, 'decision', p_decision,
      'amendment', target_field.field_status = 'corrected',
      'previous_decision', case when target_field.field_status = 'corrected' then
        pg_catalog.jsonb_build_object('field_status', target_field.field_status,
          'reviewer_value', target_field.reviewer_value, 'decision_note', target_field.decision_note,
          'decided_by_user_id', target_field.decided_by_user_id, 'decided_at', target_field.decided_at)
        else null end,
      'new_decision', case when p_decision = 'corrected' then
        pg_catalog.jsonb_build_object('reviewer_value', p_reviewer_value,
          'decision_note', p_decision_note, 'decided_by_user_id', p_actor_subject)
        else null end),
    pg_catalog.statement_timestamp()
  );

  return query select p_review_id, p_field_id, p_decision, next_revision;
end;
$function$;

