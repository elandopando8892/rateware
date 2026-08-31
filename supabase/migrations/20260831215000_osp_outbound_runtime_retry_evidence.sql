create table osp_private.outbound_runtime_failure_evidence (
  failed_job_id uuid primary key
    references osp_private.background_jobs(id),
  organization_id uuid not null,
  case_id uuid not null,
  attempt_id uuid not null unique,
  sales_authorization_id uuid not null,
  deterministic_message_id text not null
    check (deterministic_message_id ~ ('^<osp-[0-9a-f-]{36}@' || 'xbfreight\.com>$')),
  job_error_code text not null
    check (job_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  job_attempt integer not null check (job_attempt >= 1),
  job_created_at timestamptz not null,
  job_completed_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, attempt_id)
    references osp_private.outbound_send_attempts(organization_id, id)
);

create trigger outbound_runtime_failure_evidence_append_only
before update or delete on osp_private.outbound_runtime_failure_evidence
for each row execute function osp_private.reject_approval_mutation();

create function osp_private.prepare_outbound_runtime_retry(
  p_organization_id uuid,
  p_case_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_expected_job_error text
)
returns table (retry_job_id uuid, attempt_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  current_attempt osp_private.outbound_send_attempts%rowtype;
  failed_job osp_private.background_jobs%rowtype;
  prior osp_private.outbound_runtime_failure_evidence%rowtype;
begin
  if p_expected_job_error !~ '^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception using errcode = '22023', message = 'OSP_OUTBOUND_RETRY_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.json_build_array(
        p_organization_id,
        'prepare_outbound_runtime_retry',
        p_attempt_id,
        p_job_id
      )::text,
      0
    )
  );

  if not exists (
    select 1
    from osp_private.production_controls control
    where control.id = 'singleton'
      and control.release_mode = 'shadow'
      and control.outbound_enabled = false
  ) then
    raise exception using errcode = '42501', message = 'OSP_OUTBOUND_RETRY_CONTROL_INVALID';
  end if;

  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_case_id
  for update;

  select * into current_attempt
  from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id
  for update;

  select * into failed_job
  from osp_private.background_jobs candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_job_id
    and candidate.kind = 'send_authorized_payload'
  for update;

  select * into prior
  from osp_private.outbound_runtime_failure_evidence evidence
  where evidence.failed_job_id = p_job_id;

  if found then
    if prior.organization_id <> p_organization_id
      or prior.case_id <> p_case_id
      or prior.attempt_id <> p_attempt_id
      or prior.job_error_code <> p_expected_job_error
      or current_attempt.outcome <> 'reserved'
      or failed_job.completed_at is not null
      or failed_job.last_error_code is not null
      or failed_job.lease_token is not null
      or failed_job.leased_until is not null
    then
      raise exception using errcode = '23505', message = 'OSP_OUTBOUND_RETRY_CONFLICT';
    end if;
    return query select p_job_id, p_attempt_id, true;
    return;
  end if;

  if current_case.id is null
    or current_case.state <> 'ready_to_send'
    or current_attempt.id is null
    or current_attempt.outcome <> 'reserved'
    or current_attempt.reserved_case_version <> current_case.aggregate_version
    or current_attempt.send_claim_token is not null
    or current_attempt.sending_started_at is not null
    or current_attempt.gmail_message_id is not null
    or current_attempt.gmail_thread_id is not null
    or current_attempt.provider_timestamp is not null
    or current_attempt.failure_code is not null
    or failed_job.id is null
    or failed_job.attempt < 1
    or failed_job.completed_at is null
    or failed_job.last_error_code <> p_expected_job_error
    or failed_job.retry_at is not null
    or failed_job.lease_token is not null
    or failed_job.leased_until is not null
    or pg_catalog.jsonb_object_length(failed_job.opaque_payload) <> 2
    or failed_job.opaque_payload->>'attemptId' <> p_attempt_id::text
    or failed_job.opaque_payload->>'authorizationId' <> current_attempt.sales_authorization_id::text
    or exists (
      select 1 from osp_private.outbound_gmail_receipts receipt
      where receipt.organization_id = p_organization_id
        and receipt.attempt_id = p_attempt_id
    )
  then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_RETRY_STALE';
  end if;

  insert into osp_private.outbound_runtime_failure_evidence (
    failed_job_id,
    organization_id,
    case_id,
    attempt_id,
    sales_authorization_id,
    deterministic_message_id,
    job_error_code,
    job_attempt,
    job_created_at,
    job_completed_at
  ) values (
    failed_job.id,
    current_attempt.organization_id,
    current_attempt.case_id,
    current_attempt.id,
    current_attempt.sales_authorization_id,
    current_attempt.deterministic_message_id,
    failed_job.last_error_code,
    failed_job.attempt,
    failed_job.created_at,
    failed_job.completed_at
  );

  update osp_private.background_jobs
  set completed_at = null,
      last_error_code = null,
      retry_at = null,
      lease_token = null,
      leased_until = null
  where id = failed_job.id;

  return query select p_job_id, p_attempt_id, false;
end;
$$;

revoke all on table osp_private.outbound_runtime_failure_evidence
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
revoke all on function osp_private.prepare_outbound_runtime_retry(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant execute on function osp_private.prepare_outbound_runtime_retry(uuid, uuid, uuid, uuid, text)
to postgres;
