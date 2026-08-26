do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'osp_release_control_runtime') then
    raise exception using
      errcode = '55000',
      message = 'OSP_RELEASE_CONTROL_RUNTIME_ROLE_EXISTS';
  end if;
  create role osp_release_control_runtime
    login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
end;
$$;

revoke anon, authenticated, service_role, osp_workflow_api, osp_worker
  from osp_release_control_runtime;
revoke all on schema osp_private from osp_release_control_runtime;
revoke all on all tables in schema osp_private from osp_release_control_runtime;
revoke all on all sequences in schema osp_private from osp_release_control_runtime;
revoke all on all functions in schema osp_private from osp_release_control_runtime;

alter function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  rename to set_release_mode_legacy_without_receipt_provenance;

revoke all on function osp_private.set_release_mode_legacy_without_receipt_provenance(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  from public, anon, authenticated, osp_workflow_api, osp_worker, service_role, osp_release_control_runtime;

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
  requested_receipt_count integer;
  eligible_receipt_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_release_id, 728451));
  perform control.id
  from osp_private.production_controls control
  where control.id = 'singleton'
  for update;

  if p_release_id ~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'
     and p_expected_version between 1 and 2147483646
     and pg_catalog.jsonb_typeof(p_evidence_receipt_ids) = 'array'
     and pg_catalog.jsonb_array_length(p_evidence_receipt_ids) > 0
     and not exists (
       select 1 from pg_catalog.jsonb_array_elements(p_evidence_receipt_ids) raw(value)
       where pg_catalog.jsonb_typeof(raw.value) is distinct from 'string'
     )
     and not exists (
       select 1 from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) raw(value)
       where raw.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    select pg_catalog.jsonb_array_length(p_evidence_receipt_ids)
      into requested_receipt_count;
    select pg_catalog.count(*)::integer
      into eligible_receipt_count
    from pg_catalog.jsonb_array_elements_text(p_evidence_receipt_ids) requested(receipt_id)
    join osp_private.release_evidence_consumptions consumption
      on consumption.id::text = requested.receipt_id
    where consumption.expected_control_version = p_expected_version
      and consumption.workflow_ref ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$';
    if eligible_receipt_count <> requested_receipt_count then
      raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_RECEIPTS_MISMATCH';
    end if;
  end if;

  return query
  select legacy.receipt_id, legacy.release_id, legacy.release_mode, legacy.control_version
  from osp_private.set_release_mode_legacy_without_receipt_provenance(
    p_release_id, p_mode, p_expected_version, p_approval_id,
    p_manifest_sha256, p_candidate_commit, p_approver_role,
    p_approver_subject, p_key_id, p_cohort_policy_sha256,
    p_operation_id, p_evidence_receipt_ids, p_cohort_size,
    p_maximum_cohort_size, p_cohort_members
  ) legacy;
end;
$$;

revoke all on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  from public, anon, authenticated, osp_workflow_api, osp_worker, service_role, osp_release_control_runtime;
grant usage on schema osp_private to osp_release_control_runtime;
grant select on osp_private.production_controls to osp_release_control_runtime;
grant execute on function osp_private.consume_release_evidence(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, integer)
  to osp_release_control_runtime;
grant execute on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, text, jsonb, integer, integer, jsonb)
  to osp_release_control_runtime;
