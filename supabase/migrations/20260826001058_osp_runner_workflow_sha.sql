alter table osp_private.release_evidence_consumptions
  drop constraint release_evidence_consumptions_workflow_ref_check;

alter table osp_private.release_evidence_consumptions
  add constraint release_evidence_consumptions_workflow_ref_check
  check (workflow_ref ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$')
  not valid;

create or replace function osp_private.consume_release_evidence(
  p_environment text,
  p_release_id text,
  p_step text,
  p_operation_id text,
  p_candidate_commit text,
  p_manifest_sha256 text,
  p_validator_sha256 text,
  p_command_sha256 text,
  p_output_sha256 text,
  p_nonce text,
  p_workflow_ref text,
  p_run_id text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_attestation_sha256 text,
  p_runner_key_id text,
  p_expected_version integer
)
returns table (
  receipt_id uuid,
  release_id text,
  step text,
  operation_id text,
  nonce text,
  control_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_control osp_private.production_controls%rowtype;
  receipt uuid;
  violation_constraint text;
begin
  if p_environment is null
    or p_release_id is null
    or p_step is null
    or p_operation_id is null
    or p_candidate_commit is null
    or p_manifest_sha256 is null
    or p_validator_sha256 is null
    or p_command_sha256 is null
    or p_output_sha256 is null
    or p_nonce is null
    or p_workflow_ref is null
    or p_run_id is null
    or p_issued_at is null
    or p_expires_at is null
    or p_attestation_sha256 is null
    or p_runner_key_id is null
    or p_expected_version is null
    or p_environment <> 'production'
    or p_release_id !~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'
    or p_step !~ '^[a-z0-9][a-z0-9-]{2,127}$'
    or p_operation_id !~ '^P[0-9]+_[A-Z0-9_]{3,127}$'
    or p_candidate_commit !~ '^[0-9a-f]{40}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_validator_sha256 !~ '^[0-9a-f]{64}$'
    or p_command_sha256 !~ '^[0-9a-f]{64}$'
    or p_output_sha256 !~ '^[0-9a-f]{64}$'
    or p_nonce !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_workflow_ref !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml@[0-9a-f]{40}$'
    or p_run_id !~ '^[0-9]{1,20}$'
    or not pg_catalog.isfinite(p_issued_at)
    or not pg_catalog.isfinite(p_expires_at)
    or p_issued_at > pg_catalog.statement_timestamp()
    or p_expires_at <= pg_catalog.statement_timestamp()
    or p_expires_at <= p_issued_at
    or p_expires_at - p_issued_at > interval '15 minutes'
    or p_attestation_sha256 !~ '^[0-9a-f]{64}$'
    or p_runner_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_expected_version not between 1 and 2147483647 then
    raise exception using errcode = '23514', message = 'RELEASE_EVIDENCE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_release_id, 728451));
  select control.* into current_control
  from osp_private.production_controls control
  where control.id = 'singleton'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'RELEASE_CONTROL_UNAVAILABLE';
  end if;
  if current_control.version is distinct from p_expected_version
    or not (
      current_control.release_mode = 'disabled' and current_control.release_id is null
      or current_control.release_id is not distinct from p_release_id
    ) then
    raise exception using errcode = '40001', message = 'RELEASE_CONTROL_VERSION_CONFLICT';
  end if;

  begin
    insert into osp_private.release_evidence_consumptions (
      environment, release_id, step, operation_id, candidate_commit,
      manifest_sha256, validator_sha256, command_sha256, output_sha256,
      nonce, workflow_ref, run_id, issued_at, expires_at, attestation_sha256,
      runner_key_id, expected_control_version
    ) values (
      p_environment, p_release_id, p_step, p_operation_id, p_candidate_commit,
      p_manifest_sha256, p_validator_sha256, p_command_sha256, p_output_sha256,
      p_nonce, p_workflow_ref, p_run_id, p_issued_at, p_expires_at,
      p_attestation_sha256, p_runner_key_id, p_expected_version
    ) returning id into receipt;
  exception when unique_violation then
    get stacked diagnostics violation_constraint = constraint_name;
    if violation_constraint = 'release_evidence_consumptions_replay_key' then
      raise exception using errcode = '23505', message = 'RELEASE_EVIDENCE_REPLAY';
    end if;
    raise;
  end;

  return query select receipt, p_release_id, p_step, p_operation_id, p_nonce, current_control.version;
end;
$$;

revoke all on function osp_private.consume_release_evidence(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, integer)
  from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
grant execute on function osp_private.consume_release_evidence(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, integer)
  to service_role;
