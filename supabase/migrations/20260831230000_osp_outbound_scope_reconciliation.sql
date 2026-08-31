alter table public.provider_gmail_connections
drop constraint if exists provider_gmail_connections_readonly_scopes_check;

alter table public.provider_gmail_connections
add constraint provider_gmail_connections_least_privilege_scopes_check
check (
  scopes <@ array[
    'openid',
    'email',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ]::text[]
);

create table osp_private.outbound_scope_failure_evidence (
  reconciled_attempt_id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  failed_job_id uuid not null unique,
  send_claim_token uuid not null unique,
  failure_code text not null check (failure_code = 'GMAIL_SEND_SCOPE_MISSING'),
  missing_scope_evidence_sha256 text not null
    check (missing_scope_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  gmail_absence_checked_at timestamptz not null,
  gmail_evidence_sha256 text not null
    check (gmail_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  remediated_connection_id uuid not null,
  remediated_scopes text[] not null,
  new_attempt_id uuid not null unique,
  new_job_id uuid not null unique,
  new_idempotency_key text not null unique,
  new_command_sha256 text not null
    check (new_command_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default statement_timestamp(),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, reconciled_attempt_id)
    references osp_private.outbound_send_attempts(organization_id, id),
  foreign key (organization_id, new_attempt_id)
    references osp_private.outbound_send_attempts(organization_id, id),
  foreign key (failed_job_id)
    references osp_private.background_jobs(id),
  foreign key (new_job_id)
    references osp_private.background_jobs(id)
);

create trigger outbound_scope_failure_evidence_append_only
before update or delete on osp_private.outbound_scope_failure_evidence
for each row execute function osp_private.reject_approval_mutation();

create function osp_private.prepare_outbound_scope_retry(
  p_organization_id uuid,
  p_case_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_expected_send_claim_token uuid,
  p_missing_scope_evidence_sha256 text,
  p_gmail_absence_checked_at timestamptz,
  p_gmail_evidence_sha256 text,
  p_new_command_sha256 text
)
returns table (attempt_id uuid, job_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  failure constant text := 'GMAIL_SEND_SCOPE_MISSING';
  readonly_scope constant text := 'https://www.googleapis.com/auth/gmail.readonly';
  send_scope constant text := 'https://www.googleapis.com/auth/gmail.send';
  current_case osp_private.customer_registration_cases%rowtype;
  old_attempt osp_private.outbound_send_attempts%rowtype;
  old_job osp_private.background_jobs%rowtype;
  current_authorization osp_private.sales_authorizations%rowtype;
  current_payload osp_private.outbound_payloads%rowtype;
  remediated_connection public.provider_gmail_connections%rowtype;
  prior osp_private.outbound_scope_failure_evidence%rowtype;
  created_attempt_id uuid := extensions.gen_random_uuid();
  created_job_id uuid := extensions.gen_random_uuid();
  created_idempotency_key text := 'reconciled:' || p_attempt_id::text || ':gmail-send-scope-v1';
  next_version bigint;
begin
  if p_missing_scope_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_gmail_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_new_command_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.json_build_array(
        p_organization_id,
        'prepare_outbound_scope_retry',
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
    raise exception using errcode = '42501', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_CONTROL_INVALID';
  end if;

  select * into prior
  from osp_private.outbound_scope_failure_evidence evidence
  where evidence.organization_id = p_organization_id
    and evidence.reconciled_attempt_id = p_attempt_id;

  if found then
    if prior.case_id <> p_case_id
      or prior.failed_job_id <> p_job_id
      or prior.send_claim_token <> p_expected_send_claim_token
      or prior.missing_scope_evidence_sha256 <> p_missing_scope_evidence_sha256
      or prior.gmail_absence_checked_at <> p_gmail_absence_checked_at
      or prior.gmail_evidence_sha256 <> p_gmail_evidence_sha256
      or prior.new_command_sha256 <> p_new_command_sha256
      or prior.failure_code <> failure
      or not exists (
        select 1
        from osp_private.outbound_send_attempts attempt
        join osp_private.background_jobs job
          on job.organization_id = attempt.organization_id
         and job.id = attempt.job_id
        where attempt.organization_id = p_organization_id
          and attempt.id = prior.new_attempt_id
          and attempt.job_id = prior.new_job_id
          and attempt.outcome = 'reserved'
          and attempt.send_claim_token is null
          and job.completed_at is null
          and job.last_error_code is null
          and job.lease_token is null
      )
    then
      raise exception using errcode = '23505', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_CONFLICT';
    end if;
    return query select prior.new_attempt_id, prior.new_job_id, true;
    return;
  end if;

  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_case_id
  for update;

  select * into old_attempt
  from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id
  for update;

  select * into old_job
  from osp_private.background_jobs candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_job_id
    and candidate.kind = 'send_authorized_payload'
  for update;

  select * into current_authorization
  from osp_private.sales_authorizations candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = old_attempt.sales_authorization_id
    and candidate.status = 'authorized';

  select * into current_payload
  from osp_private.outbound_payloads candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = old_attempt.payload_id
    and candidate.status = 'frozen';

  select * into remediated_connection
  from public.provider_gmail_connections connection
  where connection.organization_id = p_organization_id
    and lower(connection.mailbox_email) = 'carriers@xbfreight.com'
    and connection.status in ('connected', 'watching')
    and connection.scopes @> array[readonly_scope, send_scope]::text[]
  order by connection.updated_at desc
  limit 1;

  if current_case.id is null
    or current_case.state <> 'manual_reconciliation_required'
    or old_attempt.id is null
    or old_attempt.outcome <> 'manual_reconciliation_required'
    or old_attempt.send_claim_token <> p_expected_send_claim_token
    or old_attempt.sending_started_at is null
    or old_attempt.gmail_message_id is not null
    or old_attempt.gmail_thread_id is not null
    or old_attempt.provider_timestamp is not null
    or old_attempt.failure_code is not null
    or current_case.aggregate_version <> old_attempt.reserved_case_version + 1
    or old_job.id is null
    or old_job.attempt < 1
    or old_job.completed_at is null
    or old_job.last_error_code is not null
    or old_job.lease_token is not null
    or old_job.leased_until is not null
    or old_job.opaque_payload->>'attemptId' <> old_attempt.id::text
    or old_job.opaque_payload->>'authorizationId' <> old_attempt.sales_authorization_id::text
    or current_authorization.id is null
    or current_authorization.payload_id <> old_attempt.payload_id
    or current_authorization.payload_sha256 <> old_attempt.mime_sha256
    or current_payload.id is null
    or current_payload.canonical_sha256 <> old_attempt.mime_sha256
    or remediated_connection.id is null
    or p_gmail_absence_checked_at < old_attempt.sending_started_at
    or p_gmail_absence_checked_at > clock_timestamp()
    or p_gmail_absence_checked_at < clock_timestamp() - interval '15 minutes'
    or exists (
      select 1
      from osp_private.outbound_gmail_receipts receipt
      where receipt.organization_id = p_organization_id
        and (
          receipt.attempt_id = p_attempt_id
          or receipt.deterministic_message_id = old_attempt.deterministic_message_id
        )
    )
    or exists (
      select 1
      from osp_private.outbound_send_attempts active_attempt
      where active_attempt.organization_id = p_organization_id
        and active_attempt.sales_authorization_id = old_attempt.sales_authorization_id
        and active_attempt.id <> old_attempt.id
        and active_attempt.outcome in ('reserved', 'sending', 'sent', 'manual_reconciliation_required')
    )
  then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_STALE';
  end if;

  update osp_private.outbound_send_attempts
  set outcome = 'failed',
      failure_code = failure
  where organization_id = p_organization_id
    and id = old_attempt.id
    and outcome = 'manual_reconciliation_required';
  if not found then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_STALE';
  end if;

  update osp_private.customer_registration_cases
  set state = 'ready_to_send',
      aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id
    and id = p_case_id
    and state = 'manual_reconciliation_required'
    and aggregate_version = old_attempt.reserved_case_version + 1
  returning aggregate_version into next_version;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_SCOPE_RECONCILIATION_STALE';
  end if;

  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  ) values (
    created_job_id, p_organization_id, 'send_authorized_payload',
    pg_catalog.jsonb_build_object(
      'attemptId', created_attempt_id::text,
      'authorizationId', old_attempt.sales_authorization_id::text
    ),
    'send:' || created_attempt_id::text
  );

  insert into osp_private.outbound_send_attempts (
    id, organization_id, case_id, sales_authorization_id, payload_id,
    idempotency_key, outcome, deterministic_message_id, job_id,
    command_sha256, mime_sha256, reserved_case_version
  ) values (
    created_attempt_id, p_organization_id, p_case_id,
    old_attempt.sales_authorization_id, old_attempt.payload_id,
    created_idempotency_key, 'reserved', old_attempt.deterministic_message_id,
    created_job_id, p_new_command_sha256, old_attempt.mime_sha256, next_version
  );

  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id, next_version,
    'request_authorized_send', 'osp:release:codex', 'system',
    'gmail-send-scope-reconciliation', p_new_command_sha256,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'attemptId', created_attempt_id,
        'authorizationId', old_attempt.sales_authorization_id,
        'reconciledAttemptId', old_attempt.id,
        'failureCode', failure,
        'connectionId', remediated_connection.id
      )
    )
  );

  insert into osp_private.outbound_scope_failure_evidence (
    reconciled_attempt_id, organization_id, case_id, failed_job_id,
    send_claim_token, failure_code, missing_scope_evidence_sha256,
    gmail_absence_checked_at, gmail_evidence_sha256,
    remediated_connection_id, remediated_scopes, new_attempt_id, new_job_id,
    new_idempotency_key, new_command_sha256
  ) values (
    old_attempt.id, p_organization_id, p_case_id, old_job.id,
    old_attempt.send_claim_token, failure, p_missing_scope_evidence_sha256,
    p_gmail_absence_checked_at, p_gmail_evidence_sha256,
    remediated_connection.id, remediated_connection.scopes,
    created_attempt_id, created_job_id, created_idempotency_key,
    p_new_command_sha256
  );

  return query select created_attempt_id, created_job_id, false;
end;
$$;

revoke all on table osp_private.outbound_scope_failure_evidence
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
revoke all on function osp_private.prepare_outbound_scope_retry(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, text, text
)
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant execute on function osp_private.prepare_outbound_scope_retry(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, text, text
)
to postgres;
