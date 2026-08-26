create table osp_private.release_evidence_consumptions (
  id uuid primary key default extensions.gen_random_uuid(),
  environment text not null check (environment = 'production'),
  release_id text not null check (release_id ~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'),
  step text not null check (step ~ '^[a-z0-9][a-z0-9-]{2,127}$'),
  operation_id text not null check (operation_id ~ '^P[0-9]+_[A-Z0-9_]{3,127}$'),
  candidate_commit text not null check (candidate_commit ~ '^[0-9a-f]{40}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  validator_sha256 text not null check (validator_sha256 ~ '^[0-9a-f]{64}$'),
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  nonce text not null check (nonce ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  workflow_ref text not null check (workflow_ref ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml@refs/heads/[A-Za-z0-9_][A-Za-z0-9._-]*(?:/[A-Za-z0-9_][A-Za-z0-9._-]*)*$'),
  run_id text not null check (run_id ~ '^[0-9]{1,20}$'),
  issued_at timestamptz not null check (pg_catalog.isfinite(issued_at)),
  expires_at timestamptz not null check (pg_catalog.isfinite(expires_at) and expires_at > issued_at and expires_at - issued_at <= interval '15 minutes'),
  consumed_at timestamptz not null default statement_timestamp(),
  attestation_sha256 text not null check (attestation_sha256 ~ '^[0-9a-f]{64}$'),
  runner_key_id text not null check (runner_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  expected_control_version integer not null check (expected_control_version between 1 and 2147483647),
  constraint release_evidence_consumptions_replay_key unique (environment, release_id, step, nonce)
);

create function osp_private.reject_release_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'RELEASE_EVIDENCE_IMMUTABLE';
end;
$$;

create trigger osp_release_evidence_consumptions_append_only
before update or delete on osp_private.release_evidence_consumptions
for each row execute function osp_private.reject_release_evidence_mutation();

create function osp_private.consume_release_evidence(
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
  workflow_branch text;
begin
  workflow_branch := pg_catalog.substring(p_workflow_ref, '@refs/heads/(.*)$');
  if p_environment <> 'production'
    or p_release_id !~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'
    or p_step !~ '^[a-z0-9][a-z0-9-]{2,127}$'
    or p_operation_id !~ '^P[0-9]+_[A-Z0-9_]{3,127}$'
    or p_candidate_commit !~ '^[0-9a-f]{40}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_validator_sha256 !~ '^[0-9a-f]{64}$'
    or p_command_sha256 !~ '^[0-9a-f]{64}$'
    or p_output_sha256 !~ '^[0-9a-f]{64}$'
    or p_nonce !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_workflow_ref !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml@refs/heads/[A-Za-z0-9_][A-Za-z0-9._-]*(?:/[A-Za-z0-9_][A-Za-z0-9._-]*)*$'
    or workflow_branch is null or workflow_branch like '%..%' or workflow_branch like '%//%'
    or workflow_branch like '%@{%' or workflow_branch like '%\\%'
    or workflow_branch like '%.' or workflow_branch ~ '(^|/)[^/]*\.lock($|/)'
    or p_run_id !~ '^[0-9]{1,20}$'
    or p_issued_at is null or p_expires_at is null
    or not pg_catalog.isfinite(p_issued_at) or not pg_catalog.isfinite(p_expires_at)
    or p_issued_at > pg_catalog.statement_timestamp() or p_expires_at <= pg_catalog.statement_timestamp()
    or p_expires_at <= p_issued_at or p_expires_at - p_issued_at > interval '15 minutes'
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

revoke all on osp_private.release_evidence_consumptions from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.reject_release_evidence_mutation() from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.consume_release_evidence(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, integer)
  from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
grant usage on schema osp_private to service_role;
grant execute on function osp_private.consume_release_evidence(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, integer)
  to service_role;
