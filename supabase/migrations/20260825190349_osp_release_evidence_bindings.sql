create table osp_private.production_release_transition_evidence (
  transition_id uuid not null references osp_private.production_release_transitions(id) on delete restrict,
  receipt_id uuid not null unique references osp_private.release_evidence_consumptions(id) on delete restrict,
  position integer not null check (position > 0),
  bound_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (transition_id, position)
);

create function osp_private.reject_release_transition_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'RELEASE_EVIDENCE_BINDING_IMMUTABLE';
end;
$$;

create trigger osp_release_transition_evidence_append_only
before update or delete on osp_private.production_release_transition_evidence
for each row execute function osp_private.reject_release_transition_evidence_mutation();

drop function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, integer, integer, jsonb);

create function osp_private.set_release_mode(
  p_release_id text,
  p_mode text,
  p_expected_version integer,
  p_approval_id text,
  p_manifest_sha256 text,
  p_candidate_commit text,
  p_approver_role text,
  p_approver_subject text,
  p_key_id text,
  p_cohort_policy_sha256 text,
  p_operation_id text,
  p_evidence_receipt_ids jsonb,
  p_cohort_size integer default null,
  p_maximum_cohort_size integer default null,
  p_cohort_members jsonb default null
)
returns table (
  receipt_id text,
  release_id text,
  release_mode text,
  control_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_control osp_private.production_controls%rowtype;
  transition_id uuid;
  computed_cohort_sha256 text;
  requested_receipt_count integer;
  matching_receipt_count integer;
begin
  if p_release_id is null
     or p_release_id !~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'
     or p_mode is null
     or p_mode not in ('disabled', 'shadow', 'internal_send', 'bounded_cohort')
     or p_expected_version is null
     or p_expected_version not between 1 and 2147483646
     or p_approval_id is null
     or p_approval_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or p_manifest_sha256 is null
     or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
     or p_candidate_commit is null
     or p_candidate_commit !~ '^[0-9a-f]{40}$'
     or p_approver_role is null
     or p_approver_role not in ('release_owner', 'security_reviewer', 'signature_owner', 'sales_authorizer')
     or p_approver_subject is null
     or p_approver_subject !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or p_key_id is null
     or p_key_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or p_operation_id is null
     or p_operation_id !~ '^P[0-9]{1,2}_[A-Z0-9_]{3,96}$' then
    raise exception using errcode = '23514', message = 'RELEASE_CONTROL_INVALID';
  end if;

  if (p_mode = 'shadow' and p_operation_id is distinct from 'P8_ENABLE_SHADOW_INTAKE')
     or (p_mode = 'internal_send' and p_operation_id is distinct from 'P11_INTERNAL_TEST_SEND')
     or (p_mode = 'bounded_cohort' and p_operation_id is distinct from 'P12_BOUNDED_COHORT')
     or (p_mode = 'disabled' and p_operation_id is distinct from 'P13_ROLLBACK_DRILL')
     or (p_mode in ('shadow', 'disabled') and p_approver_role is distinct from 'release_owner')
     or (p_mode in ('internal_send', 'bounded_cohort') and p_approver_role is distinct from 'sales_authorizer') then
    raise exception using errcode = '23514', message = 'RELEASE_CONTROL_INVALID';
  end if;

  if p_mode = 'bounded_cohort' then
    if p_cohort_policy_sha256 is null
       or p_cohort_policy_sha256 !~ '^[0-9a-f]{64}$'
       or p_cohort_size is null
       or p_maximum_cohort_size is null
       or p_cohort_size not between 1 and p_maximum_cohort_size
       or p_maximum_cohort_size not between 1 and 50
       or p_cohort_members is null
       or pg_catalog.jsonb_typeof(p_cohort_members) is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_cohort_members) is distinct from p_cohort_size then
      raise exception using errcode = '23514', message = 'RELEASE_CONTROL_INVALID';
    end if;
  elsif p_cohort_policy_sha256 is not null
     or p_cohort_size is not null
     or p_maximum_cohort_size is not null
     or p_cohort_members is not null then
    raise exception using errcode = '23514', message = 'RELEASE_CONTROL_INVALID';
  end if;

  if p_evidence_receipt_ids is null
     or pg_catalog.jsonb_typeof(p_evidence_receipt_ids) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_evidence_receipt_ids) < 1 then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_INVALID';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_evidence_receipt_ids) as raw(value)
    where pg_catalog.jsonb_typeof(raw.value) is distinct from 'string'
  ) then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_INVALID';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as raw(value)
    where raw.value is null
       or raw.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_INVALID';
  end if;

  select pg_catalog.count(*)::integer into requested_receipt_count
  from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as requested(receipt_id);
  if requested_receipt_count is distinct from (
    select pg_catalog.count(distinct requested.receipt_id)::integer
    from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as requested(receipt_id)
  ) then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_release_id, 728451));
  select control.* into current_control
  from osp_private.production_controls control
  where control.id = 'singleton'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'RELEASE_CONTROL_UNAVAILABLE';
  end if;
  if current_control.version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'RELEASE_CONTROL_STALE';
  end if;
  if exists (
    select 1 from osp_private.production_release_transitions used
    where used.approval_id = p_approval_id
  ) then
    raise exception using errcode = '23505', message = 'RELEASE_APPROVAL_REPLAY';
  end if;
  if (
    (p_mode = 'disabled' and current_control.release_mode <> 'disabled')
    or (current_control.release_mode = 'disabled' and p_mode = 'shadow')
    or (current_control.release_mode = 'shadow' and p_mode = 'internal_send')
    or (current_control.release_mode = 'internal_send' and p_mode = 'bounded_cohort')
  ) is not true then
    raise exception using errcode = '23514', message = 'RELEASE_MODE_TRANSITION_DENIED';
  end if;
  if not (current_control.release_mode = 'disabled' and p_mode = 'shadow')
     and current_control.release_id is distinct from p_release_id then
    raise exception using errcode = '23514', message = 'RELEASE_ID_MISMATCH';
  end if;

  perform consumption.id
  from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) with ordinality as requested(receipt_id, position)
  join osp_private.release_evidence_consumptions consumption
    on consumption.id = requested.receipt_id::uuid
  order by requested.position
  for update of consumption;

  select pg_catalog.count(*)::integer into matching_receipt_count
  from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as requested(receipt_id)
  join osp_private.release_evidence_consumptions consumption
    on consumption.id = requested.receipt_id::uuid
  where consumption.release_id = p_release_id
    and consumption.operation_id = p_operation_id
    and consumption.candidate_commit = p_candidate_commit
    and consumption.manifest_sha256 = p_manifest_sha256;
  if matching_receipt_count <> requested_receipt_count
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as requested(receipt_id)
       left join osp_private.release_evidence_consumptions consumption
         on consumption.id = requested.receipt_id::uuid
       where consumption.id is null
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) as requested(receipt_id)
       join osp_private.production_release_transition_evidence binding
         on binding.receipt_id = requested.receipt_id::uuid
     ) then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_MISMATCH';
  end if;

  if p_mode = 'bounded_cohort' then
    delete from osp_private.production_release_cohort_cases existing where existing.release_id = p_release_id;
    insert into osp_private.production_release_cohort_cases (release_id, organization_id, case_id)
    select p_release_id, raw."organizationId"::uuid, raw."caseId"::uuid
    from pg_catalog.jsonb_to_recordset(p_cohort_members) as raw("organizationId" text, "caseId" text);
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      pg_catalog.string_agg(member.organization_id::text || ':' || member.case_id::text, E'\n' order by member.organization_id::text, member.case_id::text), 'UTF8'
    ), 'sha256'), 'hex') into computed_cohort_sha256
    from osp_private.production_release_cohort_cases member where member.release_id = p_release_id;
    if (select count(*) from osp_private.production_release_cohort_cases member where member.release_id = p_release_id) <> p_cohort_size
       or computed_cohort_sha256 is distinct from p_cohort_policy_sha256 then
      raise exception using errcode = '23514', message = 'RELEASE_COHORT_MISMATCH';
    end if;
  end if;

  update osp_private.production_controls
  set release_id = p_release_id,
      release_mode = p_mode,
      outbound_enabled = p_mode in ('internal_send', 'bounded_cohort'),
      cohort_policy_sha256 = case when p_mode = 'bounded_cohort' then p_cohort_policy_sha256 else null end,
      actor_subject = p_approver_subject,
      reason_code = p_operation_id,
      version = version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where id = 'singleton';

  insert into osp_private.production_release_transitions (
    release_id, from_mode, to_mode, from_version, to_version,
    approval_id, manifest_sha256, approver_role, approver_subject, key_id, cohort_policy_sha256, operation_id,
    cohort_size, maximum_cohort_size
  ) values (
    p_release_id, current_control.release_mode, p_mode,
    current_control.version, current_control.version + 1,
    p_approval_id, p_manifest_sha256, p_approver_role, p_approver_subject, p_key_id, p_cohort_policy_sha256, p_operation_id,
    p_cohort_size, p_maximum_cohort_size
  ) returning id into transition_id;

  insert into osp_private.production_release_transition_evidence (transition_id, receipt_id, position)
  select transition_id, requested.receipt_id::uuid, requested.position::integer
  from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) with ordinality as requested(receipt_id, position)
  order by requested.position;

  receipt_id := transition_id::text;
  release_id := p_release_id;
  release_mode := p_mode;
  control_version := current_control.version + 1;
  return next;
end;
$$;

alter table osp_private.production_release_transition_evidence enable row level security;
alter table osp_private.production_release_transition_evidence force row level security;

revoke all on osp_private.production_release_transition_evidence from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.reject_release_transition_evidence_mutation() from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
grant usage on schema osp_private to service_role;
grant execute on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  to service_role;
