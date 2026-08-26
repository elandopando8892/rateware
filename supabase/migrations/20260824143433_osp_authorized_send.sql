alter table osp_private.background_jobs drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs add constraint background_jobs_kind_check check (kind in (
  'gmail_ingest', 'duplicate_review_refresh', 'document_extract',
  'quarterly_document_check', 'form_ai_mapping', 'apply_signature',
  'send_authorized_payload'
));
alter table osp_private.background_jobs
  add constraint background_jobs_tenant_identity_unique unique (organization_id, id);

alter table osp_private.outbound_send_attempts
  add column job_id uuid,
  add column command_sha256 text,
  add column mime_sha256 text,
  add column gmail_thread_id text,
  add column provider_timestamp timestamptz,
  add column send_claim_token uuid,
  add column reserved_case_version bigint,
  add column sending_started_at timestamptz;

do $$
begin
  if exists (select 1 from osp_private.outbound_send_attempts) then
    raise exception using errcode = '55000', message = 'OSP_SEND_MIGRATION_REQUIRES_EMPTY_ATTEMPTS';
  end if;
end;
$$;

alter table osp_private.outbound_send_attempts
  alter column job_id set not null,
  alter column command_sha256 set not null,
  alter column mime_sha256 set not null,
  alter column reserved_case_version set not null,
  add constraint outbound_send_attempt_job_fk
    foreign key (organization_id, job_id)
    references osp_private.background_jobs(organization_id, id),
  add constraint outbound_send_attempt_command_hash_check
    check (command_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint outbound_send_attempt_mime_hash_check
    check (mime_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint outbound_send_attempt_case_version_check
    check (reserved_case_version between 0 and 2147483647),
  add constraint outbound_send_attempt_gmail_thread_check
    check (gmail_thread_id is null or (
      gmail_thread_id ~ '^[A-Za-z0-9_-]+$' and length(gmail_thread_id) between 1 and 256
    )),
  add constraint outbound_send_attempt_provider_time_check
    check ((outcome = 'sent') = (provider_timestamp is not null));

alter table osp_private.outbound_send_attempts
  drop constraint if exists outbound_send_attempts_deterministic_message_id_check,
  drop constraint if exists outbound_attempt_result_check;
alter table osp_private.outbound_send_attempts
  add constraint outbound_send_attempts_deterministic_message_id_check
    check (deterministic_message_id ~ ('^<osp-[0-9a-f-]{36}@' || 'xbfreight\.com>$')),
  add constraint outbound_attempt_result_check check (
    (outcome = 'sent' and gmail_message_id is not null and gmail_thread_id is not null and
      provider_timestamp is not null and failure_code is null and send_claim_token is not null) or
    (outcome = 'failed' and gmail_message_id is null and gmail_thread_id is null and
      provider_timestamp is null and failure_code ~ '^[A-Z0-9_]{1,64}$' and send_claim_token is not null) or
    (outcome = 'reserved' and gmail_message_id is null and gmail_thread_id is null and
      provider_timestamp is null and failure_code is null and send_claim_token is null and sending_started_at is null) or
    (outcome in ('sending', 'manual_reconciliation_required') and gmail_message_id is null and
      provider_timestamp is null and failure_code is null and send_claim_token is not null and sending_started_at is not null)
  );

drop trigger outbound_send_attempts_append_only on osp_private.outbound_send_attempts;
drop index if exists osp_private.outbound_one_success_per_authorization;
create unique index outbound_one_active_per_authorization
  on osp_private.outbound_send_attempts (organization_id, sales_authorization_id)
  where outcome in ('reserved', 'sending', 'sent', 'manual_reconciliation_required');
create unique index outbound_one_gmail_receipt
  on osp_private.outbound_send_attempts (organization_id, gmail_message_id)
  where gmail_message_id is not null;
create table osp_private.outbound_gmail_receipts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  attempt_id uuid not null,
  gmail_message_id text not null check (
    gmail_message_id ~ '^[A-Za-z0-9_-]+$' and length(gmail_message_id) between 1 and 256
  ),
  gmail_thread_id text not null check (
    gmail_thread_id ~ '^[A-Za-z0-9_-]+$' and length(gmail_thread_id) between 1 and 256
  ),
  deterministic_message_id text not null check (
    deterministic_message_id ~ ('^<osp-[0-9a-f-]{36}@' || 'xbfreight\.com>$')
  ),
  receipt_kind text not null check (receipt_kind in ('outbound_receipt', 'supplier_response')),
  canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  provider_timestamp timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, gmail_message_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, attempt_id)
    references osp_private.outbound_send_attempts(organization_id, id)
);

alter table osp_private.approval_events drop constraint if exists approval_events_event_type_check;
alter table osp_private.approval_events add constraint approval_events_event_type_check check (event_type in (
  'complete_operations_review', 'approve_signature', 'signature_applied',
  'authorize_outbound', 'request_authorized_send', 'authorized_send_sent',
  'authorized_send_manual', 'supplier_response_received', 'approval_invalidated'
));

create function osp_private.request_authorized_send_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_sales_authorization_id uuid,
  p_payload_sha256 text,
  p_expected_case_version bigint,
  p_idempotency_key text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz,
  p_command_sha256 text
)
returns table (attempt_id uuid, job_id uuid, outcome text, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  current_authorization osp_private.sales_authorizations%rowtype;
  current_payload osp_private.outbound_payloads%rowtype;
  prior osp_private.outbound_send_attempts%rowtype;
  prior_failed_count integer;
  created_attempt_id uuid := extensions.gen_random_uuid();
  created_job_id uuid := extensions.gen_random_uuid();
begin
  perform osp_private.assert_approval_actor(
    p_organization_id, 'request_authorized_send', p_actor_subject, p_actor_email,
    p_permissions, p_actor_role, p_session_id, p_session_issued_at
  );
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' or
     p_command_sha256 !~ '^[0-9a-f]{64}$' or
     p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' or
     length(p_idempotency_key) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'OSP_SEND_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.json_build_array(p_organization_id, 'request_authorized_send', p_idempotency_key)::text, 0
  ));
  select * into prior
  from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id
    and candidate.idempotency_key = p_idempotency_key;
  if found then
    if prior.command_sha256 <> p_command_sha256 then
      raise exception using errcode = '23505', message = 'OSP_IDEMPOTENCY_CONFLICT';
    end if;
    return query select prior.id, prior.job_id, prior.outcome, true;
    return;
  end if;
  if not exists (
    select 1 from osp_private.production_controls controls
    where controls.id = 'singleton' and controls.outbound_enabled = true
  ) then
    raise exception using errcode = '42501', message = 'OSP_OUTBOUND_DISABLED';
  end if;
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or current_case.aggregate_version <> p_expected_case_version or current_case.state <> 'ready_to_send' then
    raise exception using errcode = '40001', message = 'OSP_SEND_STALE';
  end if;
  select * into current_authorization
  from osp_private.sales_authorizations authorized_record
  where authorized_record.organization_id = p_organization_id
    and authorized_record.case_id = p_case_id
    and authorized_record.id = p_sales_authorization_id
    and authorized_record.status = 'authorized'
  for update;
  if not found or current_authorization.payload_sha256 <> p_payload_sha256 then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into current_payload
  from osp_private.outbound_payloads payload
  where payload.organization_id = p_organization_id
    and payload.case_id = p_case_id
    and payload.id = current_authorization.payload_id
    and payload.status = 'frozen'
    and payload.canonical_sha256 = p_payload_sha256;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  if not exists (
    select 1 from osp_private.approval_events authorization_event
    where authorization_event.organization_id = p_organization_id
      and authorization_event.case_id = p_case_id
      and authorization_event.case_version = current_payload.case_version + 1
      and authorization_event.event_type = 'authorize_outbound'
      and authorization_event.evidence_refs @> pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('authorizationId', p_sales_authorization_id)
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select count(*) into prior_failed_count
  from osp_private.outbound_send_attempts failed_attempt
  where failed_attempt.organization_id = p_organization_id
    and failed_attempt.sales_authorization_id = p_sales_authorization_id
    and failed_attempt.outcome = 'failed';
  if not (
    (p_expected_case_version = current_payload.case_version + 1 and prior_failed_count = 0)
    or (prior_failed_count = 1 and exists (
      select 1 from osp_private.outbound_send_attempts failed_attempt
      where failed_attempt.organization_id = p_organization_id
        and failed_attempt.sales_authorization_id = p_sales_authorization_id
        and failed_attempt.outcome = 'failed'
        and failed_attempt.reserved_case_version = p_expected_case_version
    ))
  ) then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, p_case_id, current_payload.source_snapshot_sha256
  );
  update osp_private.customer_registration_cases
  set aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_case_id
    and aggregate_version = p_expected_case_version;
  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  ) values (
    created_job_id, p_organization_id, 'send_authorized_payload',
    pg_catalog.jsonb_build_object(
      'attemptId', created_attempt_id::text,
      'authorizationId', p_sales_authorization_id::text
    ),
    'send:' || created_attempt_id::text
  );
  insert into osp_private.outbound_send_attempts (
    id, organization_id, case_id, sales_authorization_id, payload_id,
    idempotency_key, outcome, deterministic_message_id, job_id,
    command_sha256, mime_sha256, reserved_case_version
  ) values (
    created_attempt_id, p_organization_id, p_case_id, p_sales_authorization_id,
    current_payload.id, p_idempotency_key, 'reserved',
    '<osp-' || current_payload.id::text || '@' || 'xbfreight.com>', created_job_id,
    p_command_sha256, p_payload_sha256, p_expected_case_version + 1
  );
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    p_expected_case_version + 1, 'request_authorized_send', p_actor_subject,
    p_actor_role, p_session_id, p_command_sha256,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'attemptId', created_attempt_id, 'authorizationId', p_sales_authorization_id
    ))
  );
  return query select created_attempt_id, created_job_id, 'reserved'::text, false;
end;
$$;

create function osp_private.claim_authorized_send(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_lease_token uuid
)
returns table (
  preparation text, authorization_id uuid, mime_object_id text, mime_sha256 text,
  gmail_thread_id text, deterministic_message_id text, send_claim_token uuid,
  gmail_message_id text, provider_timestamp timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  attempt osp_private.outbound_send_attempts%rowtype;
  payload osp_private.outbound_payloads%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  claim_token uuid := extensions.gen_random_uuid();
  next_version bigint;
begin
  if not exists (
    select 1 from osp_private.background_jobs job
    where job.id = p_job_id and job.organization_id = p_organization_id
      and job.kind = 'send_authorized_payload' and job.completed_at is null
      and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
      and job.opaque_payload->>'attemptId' = p_attempt_id::text
  ) then raise exception using errcode = '42501', message = 'OSP_SEND_LEASE_INVALID'; end if;
  perform pg_catalog.set_config('osp.organization_id', p_organization_id::text, true);
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id;
  if not found then raise exception using errcode = '23514', message = 'OSP_SEND_STALE'; end if;
  select * into current_case from osp_private.customer_registration_cases case_record
  where case_record.organization_id = attempt.organization_id
    and case_record.id = attempt.case_id
  for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_SEND_STALE'; end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id and candidate.case_id = current_case.id
  for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_SEND_STALE'; end if;
  if attempt.outcome = 'sent' then
    return query select 'sent', attempt.sales_authorization_id, null::text,
      attempt.mime_sha256, attempt.gmail_thread_id, attempt.deterministic_message_id,
      attempt.send_claim_token, attempt.gmail_message_id, attempt.provider_timestamp;
    return;
  elsif attempt.outcome in ('failed', 'manual_reconciliation_required') then
    return query select attempt.outcome, attempt.sales_authorization_id, null::text,
      attempt.mime_sha256, attempt.gmail_thread_id, attempt.deterministic_message_id,
      attempt.send_claim_token, attempt.gmail_message_id, attempt.provider_timestamp;
    return;
  elsif attempt.outcome = 'sending' then
    update osp_private.outbound_send_attempts set outcome = 'manual_reconciliation_required'
    where id = attempt.id;
    update osp_private.customer_registration_cases
    set state = 'manual_reconciliation_required', aggregate_version = aggregate_version + 1,
        updated_at = statement_timestamp()
    where organization_id = attempt.organization_id and id = attempt.case_id
      and state = 'ready_to_send' and aggregate_version = attempt.reserved_case_version
    returning aggregate_version into next_version;
    if not found then
      raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
    end if;
    insert into osp_private.approval_events (
      id, organization_id, case_id, case_version, event_type, actor_subject,
      actor_role, authorization_session_id, command_sha256, evidence_refs
    ) values (
      extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
      next_version, 'authorized_send_manual', 'osp-worker', 'system',
      'send-worker', attempt.command_sha256,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id
      ))
    );
    return query select 'manual_reconciliation_required', attempt.sales_authorization_id,
      null::text, attempt.mime_sha256, attempt.gmail_thread_id,
      attempt.deterministic_message_id, attempt.send_claim_token,
      null::text, null::timestamptz;
    return;
  end if;
  if not exists (
    select 1 from osp_private.production_controls controls
    where controls.id = 'singleton' and controls.outbound_enabled = true
  ) then raise exception using errcode = '42501', message = 'OSP_OUTBOUND_DISABLED'; end if;
  if current_case.state <> 'ready_to_send'
     or current_case.aggregate_version <> attempt.reserved_case_version then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  if not exists (
    select 1 from osp_private.approval_events request_event
    where request_event.organization_id = attempt.organization_id
      and request_event.case_id = attempt.case_id
      and request_event.case_version = attempt.reserved_case_version
      and request_event.event_type = 'request_authorized_send'
      and request_event.command_sha256 = attempt.command_sha256
      and request_event.evidence_refs @> pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'attemptId', attempt.id,
          'authorizationId', attempt.sales_authorization_id
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select candidate.* into payload from osp_private.outbound_payloads candidate
  join osp_private.sales_authorizations authorized_record
    on authorized_record.organization_id = candidate.organization_id
   and authorized_record.case_id = candidate.case_id
   and authorized_record.payload_id = candidate.id
   and authorized_record.id = attempt.sales_authorization_id
   and authorized_record.status = 'authorized'
  where candidate.organization_id = attempt.organization_id
    and candidate.id = attempt.payload_id and candidate.status = 'frozen'
    and candidate.canonical_sha256 = attempt.mime_sha256;
  if not found then raise exception using errcode = '23514', message = 'OSP_SEND_STALE'; end if;
  perform osp_private.assert_package_snapshot_hash_current(
    attempt.organization_id, attempt.case_id, payload.source_snapshot_sha256
  );
  update osp_private.outbound_send_attempts
  set outcome = 'sending', send_claim_token = claim_token,
      sending_started_at = clock_timestamp()
  where id = attempt.id and outcome = 'reserved';
  return query select 'ready', attempt.sales_authorization_id, payload.object_id,
    attempt.mime_sha256, null::text, attempt.deterministic_message_id,
    claim_token, null::text, null::timestamptz;
end;
$$;

create function osp_private.complete_authorized_send(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_send_claim_token uuid,
  p_gmail_message_id text,
  p_gmail_thread_id text,
  p_mime_sha256 text,
  p_provider_timestamp timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  attempt osp_private.outbound_send_attempts%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  next_version bigint;
begin
  if p_gmail_message_id !~ '^[A-Za-z0-9_-]+$' or
     length(p_gmail_message_id) not between 1 and 256 or
     p_gmail_thread_id !~ '^[A-Za-z0-9_-]+$' or
     length(p_gmail_thread_id) not between 1 and 256 or
     p_mime_sha256 !~ '^[0-9a-f]{64}$' or
     p_provider_timestamp < clock_timestamp() - interval '1 day' or
     p_provider_timestamp > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  if not exists (
    select 1 from osp_private.background_jobs job
    where job.id = p_job_id and job.organization_id = p_organization_id
      and job.kind = 'send_authorized_payload' and job.completed_at is null
      and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
  ) then raise exception using errcode = '42501', message = 'OSP_SEND_LEASE_INVALID'; end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  select * into current_case from osp_private.customer_registration_cases case_record
  where case_record.organization_id = attempt.organization_id
    and case_record.id = attempt.case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id and candidate.case_id = current_case.id
  for update;
  if not found or attempt.outcome <> 'sending' or
     attempt.send_claim_token <> p_send_claim_token or attempt.mime_sha256 <> p_mime_sha256 then
    raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  update osp_private.outbound_send_attempts
  set outcome = 'sent', gmail_message_id = p_gmail_message_id,
      gmail_thread_id = p_gmail_thread_id, provider_timestamp = p_provider_timestamp
  where id = attempt.id;
  update osp_private.customer_registration_cases
  set state = 'sent',
      aggregate_version = aggregate_version + 1, updated_at = statement_timestamp()
  where organization_id = attempt.organization_id and id = attempt.case_id
    and state = 'ready_to_send' and aggregate_version = attempt.reserved_case_version
  returning aggregate_version into next_version;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
    next_version, 'authorized_send_sent', 'osp-worker', 'system',
    'send-worker', attempt.command_sha256,
    jsonb_build_array(jsonb_build_object('attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id))
  );
end;
$$;

create function osp_private.capture_authorized_gmail_event(
  p_organization_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_gmail_message_id text,
  p_gmail_thread_id text,
  p_source_sha256 text,
  p_deterministic_message_id text,
  p_event_kind text,
  p_provider_timestamp timestamptz
)
returns table (case_id uuid, event_kind text, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  attempt osp_private.outbound_send_attempts%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  prior osp_private.outbound_gmail_receipts%rowtype;
  inserted_id uuid;
  next_version bigint;
begin
  if p_gmail_message_id !~ '^[A-Za-z0-9_-]+$' or
     length(p_gmail_message_id) not between 1 and 256 or
     p_gmail_thread_id !~ '^[A-Za-z0-9_-]+$' or
     length(p_gmail_thread_id) not between 1 and 256 or
     p_source_sha256 !~ '^[0-9a-f]{64}$' or
     p_deterministic_message_id !~ ('^<osp-[0-9a-f-]{36}@' || 'xbfreight\.com>$') or
     p_event_kind not in ('outbound_receipt', 'supplier_response') or
     p_provider_timestamp > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  if not exists (
    select 1 from osp_private.background_jobs job
    where job.id = p_job_id and job.organization_id = p_organization_id
      and job.kind = 'gmail_ingest' and job.completed_at is null
      and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
      and job.opaque_payload->>'gmailMessageId' = p_gmail_message_id
  ) then
    raise exception using errcode = '42501', message = 'OSP_SEND_LEASE_INVALID';
  end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id
    and candidate.deterministic_message_id = p_deterministic_message_id
    and candidate.outcome in ('sending', 'sent', 'manual_reconciliation_required')
  order by candidate.created_at desc, candidate.id desc
  limit 1;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  select * into current_case from osp_private.customer_registration_cases case_record
  where case_record.organization_id = attempt.organization_id
    and case_record.id = attempt.case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = attempt.id and candidate.case_id = current_case.id
  for update;
  if not found or attempt.deterministic_message_id <> p_deterministic_message_id or
     attempt.outcome not in ('sending', 'sent', 'manual_reconciliation_required') then
    raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  if p_provider_timestamp < attempt.created_at - interval '5 minutes' then
    raise exception using errcode = '22023', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  select * into prior from osp_private.outbound_gmail_receipts receipt
  where receipt.organization_id = p_organization_id
    and receipt.gmail_message_id = p_gmail_message_id;
  if found then
    if prior.attempt_id <> attempt.id or prior.gmail_thread_id <> p_gmail_thread_id or
       prior.deterministic_message_id <> p_deterministic_message_id or
       prior.receipt_kind <> p_event_kind or prior.source_sha256 <> p_source_sha256 or
       prior.provider_timestamp <> p_provider_timestamp then
      raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
    end if;
    return query select attempt.case_id, p_event_kind, true;
    return;
  end if;
  if p_event_kind = 'outbound_receipt' then
    if attempt.outcome not in ('sending', 'sent', 'manual_reconciliation_required') or
       (attempt.gmail_message_id is not null and attempt.gmail_message_id <> p_gmail_message_id) or
       (attempt.gmail_thread_id is not null and attempt.gmail_thread_id <> p_gmail_thread_id) then
      raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
    end if;
  elsif attempt.outcome <> 'sent' or attempt.gmail_thread_id <> p_gmail_thread_id or
        attempt.gmail_message_id = p_gmail_message_id then
    raise exception using errcode = '23514', message = 'OSP_SEND_RECEIPT_INVALID';
  end if;
  insert into osp_private.outbound_gmail_receipts (
    id, organization_id, case_id, attempt_id, gmail_message_id, gmail_thread_id,
    deterministic_message_id, receipt_kind, canonical_sha256, source_sha256,
    provider_timestamp
  ) values (
    extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
    attempt.id, p_gmail_message_id, p_gmail_thread_id,
    p_deterministic_message_id, p_event_kind, attempt.mime_sha256,
    p_source_sha256, p_provider_timestamp
  ) returning id into inserted_id;
  if p_event_kind = 'outbound_receipt' and attempt.outcome <> 'sent' then
    update osp_private.outbound_send_attempts
    set outcome = 'sent', gmail_message_id = p_gmail_message_id,
        gmail_thread_id = p_gmail_thread_id, provider_timestamp = p_provider_timestamp
    where id = attempt.id;
    update osp_private.customer_registration_cases
    set state = 'sent', aggregate_version = aggregate_version + 1,
        updated_at = statement_timestamp()
    where organization_id = attempt.organization_id and id = attempt.case_id
      and (
        (attempt.outcome = 'sending' and state = 'ready_to_send' and
          aggregate_version = attempt.reserved_case_version) or
        (attempt.outcome = 'manual_reconciliation_required' and
          state = 'manual_reconciliation_required' and
          aggregate_version = attempt.reserved_case_version + 1)
      )
    returning aggregate_version into next_version;
    if not found then
      raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
    end if;
    insert into osp_private.approval_events (
      id, organization_id, case_id, case_version, event_type, actor_subject,
      actor_role, authorization_session_id, command_sha256, evidence_refs
    ) values (
      extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
      next_version, 'authorized_send_sent', 'osp-worker', 'system',
      'gmail-receipt-worker', attempt.command_sha256,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id,
        'gmailReceiptId', inserted_id
      ))
    );
  elsif p_event_kind = 'supplier_response' then
    update osp_private.customer_registration_cases
    set state = 'analyzing_requirements', aggregate_version = aggregate_version + 1,
        updated_at = statement_timestamp()
    where organization_id = attempt.organization_id and id = attempt.case_id
      and state = 'sent'
    returning aggregate_version into next_version;
    if not found then
      raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
    end if;
    insert into osp_private.approval_events (
      id, organization_id, case_id, case_version, event_type, actor_subject,
      actor_role, authorization_session_id, command_sha256, evidence_refs
    ) values (
      extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
      next_version, 'supplier_response_received', 'osp-worker', 'system',
      'gmail-receipt-worker', attempt.command_sha256,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id,
        'gmailReceiptId', inserted_id
      ))
    );
  end if;
  return query select attempt.case_id, p_event_kind, false;
end;
$$;

create function osp_private.fail_authorized_send(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_send_claim_token uuid,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  attempt osp_private.outbound_send_attempts%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  prior_failed_count integer;
  next_version bigint;
begin
  if p_failure_code !~ '^[A-Z0-9_]{1,64}$' or not exists (
    select 1 from osp_private.background_jobs job
    where job.id = p_job_id and job.organization_id = p_organization_id
      and job.kind = 'send_authorized_payload' and job.completed_at is null
      and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
  ) then raise exception using errcode = '42501', message = 'OSP_SEND_LEASE_INVALID'; end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into current_case from osp_private.customer_registration_cases case_record
  where case_record.organization_id = attempt.organization_id
    and case_record.id = attempt.case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id and candidate.case_id = current_case.id
  for update;
  if not found or attempt.outcome <> 'sending' or attempt.send_claim_token <> p_send_claim_token then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select count(*) into prior_failed_count from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = attempt.organization_id
    and candidate.sales_authorization_id = attempt.sales_authorization_id
    and candidate.id <> attempt.id and candidate.outcome = 'failed';
  if prior_failed_count = 0 then
    update osp_private.outbound_send_attempts set outcome = 'failed', failure_code = p_failure_code
    where id = attempt.id;
  else
    update osp_private.outbound_send_attempts set outcome = 'manual_reconciliation_required'
    where id = attempt.id;
    update osp_private.customer_registration_cases
    set state = 'manual_reconciliation_required', aggregate_version = aggregate_version + 1,
        updated_at = statement_timestamp()
    where organization_id = attempt.organization_id and id = attempt.case_id
      and state = 'ready_to_send' and aggregate_version = attempt.reserved_case_version
    returning aggregate_version into next_version;
    if not found then raise exception using errcode = '23514', message = 'OSP_SEND_STALE'; end if;
    insert into osp_private.approval_events (
      id, organization_id, case_id, case_version, event_type, actor_subject,
      actor_role, authorization_session_id, command_sha256, evidence_refs
    ) values (
      extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
      next_version, 'authorized_send_manual', 'osp-worker', 'system',
      'send-worker', attempt.command_sha256,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id
      ))
    );
  end if;
end;
$$;

create function osp_private.mark_authorized_send_ambiguous(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_send_claim_token uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  attempt osp_private.outbound_send_attempts%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  next_version bigint;
begin
  if not exists (
    select 1 from osp_private.background_jobs job
    where job.id = p_job_id and job.organization_id = p_organization_id
      and job.kind = 'send_authorized_payload' and job.completed_at is null
      and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
  ) then raise exception using errcode = '42501', message = 'OSP_SEND_LEASE_INVALID'; end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into current_case from osp_private.customer_registration_cases case_record
  where case_record.organization_id = attempt.organization_id
    and case_record.id = attempt.case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  select * into attempt from osp_private.outbound_send_attempts candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_attempt_id
    and candidate.job_id = p_job_id and candidate.case_id = current_case.id
  for update;
  if not found or attempt.outcome <> 'sending' or attempt.send_claim_token <> p_send_claim_token then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  update osp_private.outbound_send_attempts set outcome = 'manual_reconciliation_required'
  where id = attempt.id;
  update osp_private.customer_registration_cases
  set state = 'manual_reconciliation_required', aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = attempt.organization_id and id = attempt.case_id
    and state = 'ready_to_send' and aggregate_version = attempt.reserved_case_version
  returning aggregate_version into next_version;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SEND_STALE';
  end if;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), attempt.organization_id, attempt.case_id,
    next_version, 'authorized_send_manual', 'osp-worker', 'system',
    'send-worker', attempt.command_sha256,
    jsonb_build_array(jsonb_build_object('attemptId', attempt.id, 'authorizationId', attempt.sales_authorization_id))
  );
end;
$$;

create view osp_private.outbound_send_status
with (security_invoker = true)
as select organization_id, case_id, id as attempt_id, outcome, created_at
from osp_private.outbound_send_attempts;

create unique index document_versions_one_approved_current
on osp_private.document_versions (organization_id, document_id)
where status = 'approved';

alter table osp_private.outbound_payloads
  add constraint outbound_payload_object_identity_check check (
    object_id = 'outbound_' || organization_id::text || '_' || id::text
  );

drop trigger generated_packages_append_only on osp_private.generated_packages;
create function osp_private.protect_generated_package_supersede()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
  end if;
  if old.status <> 'current' or new.status <> 'superseded'
     or (pg_catalog.to_jsonb(new) - 'status') is distinct from (pg_catalog.to_jsonb(old) - 'status') then
    raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
  end if;
  return new;
end;
$$;
create trigger generated_packages_append_only
before update or delete on osp_private.generated_packages
for each row execute function osp_private.protect_generated_package_supersede();

drop trigger signature_approvals_append_only on osp_private.signature_approvals;
create function osp_private.protect_signature_approval_supersede()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
  end if;
  if old.status not in ('pending', 'applied') or new.status <> 'superseded'
     or (pg_catalog.to_jsonb(new) - 'status') is distinct from (pg_catalog.to_jsonb(old) - 'status') then
    raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
  end if;
  return new;
end;
$$;
create trigger signature_approvals_append_only
before update or delete on osp_private.signature_approvals
for each row execute function osp_private.protect_signature_approval_supersede();

create function osp_private.mark_document_review_required_command(
  p_organization_id uuid,
  p_version_id uuid
)
returns table (id uuid, status text)
language plpgsql security definer
set search_path = pg_catalog, osp_private
as $$
begin
  if nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'DOCUMENT_APPROVAL_REJECTED';
  end if;
  return query
  update osp_private.document_versions version
  set status = 'review_required'
  where version.organization_id = p_organization_id
    and version.id = p_version_id
    and version.status = 'uploaded'
    and exists (
      select 1 from osp_private.source_safety_assessments assessment
      where assessment.organization_id = version.organization_id
        and assessment.document_version_id = version.id
        and assessment.status = 'safe'
        and assessment.content_sha256 = version.source_sha256
    )
  returning version.id, version.status;
  if not found then
    raise exception using errcode = '23514', message = 'DOCUMENT_APPROVAL_REJECTED';
  end if;
end;
$$;

create function osp_private.approve_document_version_command(
  p_organization_id uuid,
  p_version_id uuid,
  p_expected_version integer,
  p_review_before_sha256 text,
  p_review_after_sha256 text,
  p_actor_subject text,
  p_actor_permission text
)
returns table (id uuid, status text)
language plpgsql security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  target_version osp_private.document_versions%rowtype;
  prior_version_id uuid;
  impacted_case record;
  impacted_case_ids uuid[] := array[]::uuid[];
  impacted_case_id uuid;
  impacted_version bigint;
begin
  if nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_review_before_sha256 !~ '^[0-9a-f]{64}$'
     or p_review_before_sha256 <> p_review_after_sha256
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or length(p_actor_subject) not between 1 and 256
     or p_actor_permission <> 'osp:operate' then
    raise exception using errcode = '42501', message = 'DOCUMENT_APPROVAL_REJECTED';
  end if;
  select * into target_version from osp_private.document_versions candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_version_id;
  if not found then
    raise exception using errcode = '23514', message = 'DOCUMENT_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.json_build_array(p_organization_id, 'document_approval', target_version.document_id)::text, 0
  ));
  select prior.id into prior_version_id from osp_private.document_versions prior
  where prior.organization_id = p_organization_id
    and prior.document_id = target_version.document_id
    and prior.id <> p_version_id
    and prior.status = 'approved'
  order by prior.version desc limit 1;
  if prior_version_id is not null then
    for impacted_case in
      select case_record.id, case_record.aggregate_version
      from osp_private.customer_registration_cases case_record
      join lateral (
        select snapshot.document_version_ids
        from osp_private.case_package_input_snapshots snapshot
        where snapshot.organization_id = case_record.organization_id
          and snapshot.case_id = case_record.id
        order by snapshot.created_at desc, snapshot.id desc limit 1
      ) current_snapshot on true
      where case_record.organization_id = p_organization_id
        and prior_version_id = any(current_snapshot.document_version_ids)
        and case_record.state in (
          'signature_approval', 'sales_authorization', 'ready_to_send',
          'manual_reconciliation_required'
        )
      order by case_record.id
      for update of case_record
    loop
      impacted_case_ids := pg_catalog.array_append(impacted_case_ids, impacted_case.id);
    end loop;
  end if;
  select * into target_version from osp_private.document_versions candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_version_id
  for update;
  if not found or target_version.version <> p_expected_version
     or target_version.status <> 'review_required'
     or target_version.source_sha256 <> p_review_before_sha256
     or target_version.source_sha256 <> p_review_after_sha256 then
    raise exception using errcode = '40001', message = 'DOCUMENT_VERSION_CONFLICT';
  end if;
  if prior_version_id is not null then
    update osp_private.document_versions prior
    set status = 'superseded'
    where prior.organization_id = p_organization_id
      and prior.id = prior_version_id and prior.status = 'approved';
    if not found then
      raise exception using errcode = '40001', message = 'DOCUMENT_VERSION_CONFLICT';
    end if;
  end if;
  update osp_private.document_versions approved
  set status = 'approved', approved_at = statement_timestamp(),
      approved_by_subject = p_actor_subject,
      approved_by_permission = p_actor_permission
  where approved.organization_id = p_organization_id
    and approved.id = p_version_id
    and approved.version = p_expected_version
    and approved.status = 'review_required'
  returning approved.id, approved.status into id, status;
  if not found then
    raise exception using errcode = '40001', message = 'DOCUMENT_VERSION_CONFLICT';
  end if;
  foreach impacted_case_id in array impacted_case_ids loop
    update osp_private.sales_authorizations authorized_record
    set status = 'superseded'
    from osp_private.outbound_payloads payload
    where authorized_record.organization_id = p_organization_id
      and authorized_record.case_id = impacted_case_id
      and authorized_record.status = 'authorized'
      and payload.organization_id = authorized_record.organization_id
      and payload.case_id = authorized_record.case_id
      and payload.id = authorized_record.payload_id
      and payload.source_snapshot_sha256 in (
        select snapshot.canonical_sha256 from osp_private.case_package_input_snapshots snapshot
        where snapshot.organization_id = p_organization_id
          and snapshot.case_id = impacted_case_id
          and prior_version_id = any(snapshot.document_version_ids)
      );
    update osp_private.signature_approvals approval
    set status = 'superseded'
    where approval.organization_id = p_organization_id
      and approval.case_id = impacted_case_id
      and approval.status in ('pending', 'applied')
      and approval.input_snapshot_sha256 in (
        select snapshot.canonical_sha256 from osp_private.case_package_input_snapshots snapshot
        where snapshot.organization_id = p_organization_id
          and snapshot.case_id = impacted_case_id
          and prior_version_id = any(snapshot.document_version_ids)
      );
    update osp_private.generated_packages package
    set status = 'superseded'
    where package.organization_id = p_organization_id
      and package.case_id = impacted_case_id
      and package.package_kind = 'signed'
      and package.status = 'current'
      and package.input_snapshot_id in (
        select snapshot.id from osp_private.case_package_input_snapshots snapshot
        where snapshot.organization_id = p_organization_id
          and snapshot.case_id = impacted_case_id
          and prior_version_id = any(snapshot.document_version_ids)
      );
    update osp_private.customer_registration_cases case_record
    set state = 'operations_review',
        aggregate_version = aggregate_version + 1,
        updated_at = statement_timestamp()
    where case_record.organization_id = p_organization_id
      and case_record.id = impacted_case_id
    returning case_record.aggregate_version into impacted_version;
    insert into osp_private.approval_events (
      id, organization_id, case_id, case_version, event_type, actor_subject,
      actor_role, authorization_session_id, command_sha256, evidence_refs
    ) values (
      extensions.gen_random_uuid(), p_organization_id, impacted_case_id,
      impacted_version, 'approval_invalidated', p_actor_subject,
      'operations_reviewer', null, p_review_after_sha256,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'documentVersionId', prior_version_id,
        'replacementDocumentVersionId', p_version_id
      ))
    );
    insert into osp_private.case_events (
      id, organization_id, case_id, sequence, state, actor_subject,
      authority_role, source_version, occurred_at, reason_code, correlation_id,
      evidence_json
    ) values (
      extensions.gen_random_uuid(), p_organization_id, impacted_case_id,
      impacted_version, 'operations_review', p_actor_subject, 'operations',
      impacted_version - 1, statement_timestamp(), 'approval_invalidated',
      extensions.gen_random_uuid(),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'documentVersionId', prior_version_id,
        'replacementDocumentVersionId', p_version_id
      ))
    );
  end loop;
  return next;
end;
$$;

create function osp_private.protect_document_version_active_effects()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  protected_version_id uuid;
begin
  if old.status = 'approved' and new.status = 'superseded' then
    protected_version_id := old.id;
  elsif old.status = 'review_required' and new.status = 'approved'
        and new.supersedes_version_id is not null then
    protected_version_id := new.supersedes_version_id;
  else
    return new;
  end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.json_build_array(
        old.organization_id, 'document_effect', protected_version_id
      )::text, 0
    ));
    if exists (
      select 1
      from osp_private.signature_application_receipts receipt
      join osp_private.signature_approvals approval
        on approval.organization_id = receipt.organization_id
       and approval.case_id = receipt.case_id
       and approval.id = receipt.approval_id
      join osp_private.generated_packages package
        on package.organization_id = approval.organization_id
       and package.case_id = approval.case_id
       and package.id = approval.generated_package_id
      join osp_private.case_package_input_snapshots snapshot
        on snapshot.organization_id = package.organization_id
       and snapshot.case_id = package.case_id
       and snapshot.id = package.input_snapshot_id
      where receipt.organization_id = old.organization_id
        and receipt.outcome in ('reserved', 'manual_reconciliation_required')
        and protected_version_id = any(snapshot.document_version_ids)
    ) or exists (
      select 1
      from osp_private.outbound_send_attempts attempt
      join osp_private.sales_authorizations authorized_record
        on authorized_record.organization_id = attempt.organization_id
       and authorized_record.case_id = attempt.case_id
       and authorized_record.id = attempt.sales_authorization_id
      join osp_private.outbound_payloads payload
        on payload.organization_id = authorized_record.organization_id
       and payload.case_id = authorized_record.case_id
       and payload.id = authorized_record.payload_id
      join osp_private.case_package_input_snapshots snapshot
        on snapshot.organization_id = payload.organization_id
       and snapshot.case_id = payload.case_id
       and snapshot.canonical_sha256 = payload.source_snapshot_sha256
      where attempt.organization_id = old.organization_id
        and attempt.outcome in ('reserved', 'sending', 'manual_reconciliation_required')
        and protected_version_id = any(snapshot.document_version_ids)
    ) then
      raise exception using errcode = '55000', message = 'DOCUMENT_EFFECT_IN_FLIGHT';
    end if;
  return new;
end;
$$;

create trigger osp_document_version_active_effects
before update on osp_private.document_versions
for each row execute function osp_private.protect_document_version_active_effects();

create function osp_private.invalidate_case_input_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  affected_case_id uuid;
  affected_organization_id uuid := new.organization_id;
  current_case osp_private.customer_registration_cases%rowtype;
  next_version bigint;
  evidence jsonb;
begin
  if tg_table_name = 'extraction_fields' then
    select extraction.case_id into affected_case_id
    from osp_private.document_extractions extraction
    where extraction.organization_id = new.organization_id
      and extraction.id = new.extraction_id;
  elsif tg_table_name = 'review_decisions' then
    affected_case_id := new.case_id;
  else
    affected_case_id := new.case_id;
  end if;
  if affected_case_id is null then return new; end if;
  select * into current_case from osp_private.customer_registration_cases candidate
  where candidate.organization_id = affected_organization_id
    and candidate.id = affected_case_id for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_CASE_INPUT_INVALID';
  end if;
  if current_case.state in ('manual_reconciliation_required', 'sent', 'accepted', 'rejected', 'closed') then
    raise exception using errcode = '55000', message = 'OSP_EXTERNAL_EFFECT_HOLD';
  end if;
  if current_case.state not in ('signature_approval', 'sales_authorization', 'ready_to_send') then
    return new;
  end if;
  if exists (
    select 1 from osp_private.signature_application_receipts receipt
    where receipt.organization_id = affected_organization_id
      and receipt.case_id = affected_case_id
      and receipt.outcome in ('reserved', 'manual_reconciliation_required')
  ) or exists (
    select 1 from osp_private.outbound_send_attempts attempt
    where attempt.organization_id = affected_organization_id
      and attempt.case_id = affected_case_id
      and attempt.outcome in ('reserved', 'sending', 'manual_reconciliation_required')
  ) then
    raise exception using errcode = '55000', message = 'OSP_EXTERNAL_EFFECT_HOLD';
  end if;
  update osp_private.sales_authorizations set status = 'superseded'
  where organization_id = affected_organization_id and case_id = affected_case_id
    and status = 'authorized';
  update osp_private.signature_approvals set status = 'superseded'
  where organization_id = affected_organization_id and case_id = affected_case_id
    and status in ('pending', 'applied');
  update osp_private.generated_packages set status = 'superseded'
  where organization_id = affected_organization_id and case_id = affected_case_id
    and package_kind = 'signed' and status = 'current';
  update osp_private.customer_registration_cases
  set state = 'operations_review', aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = affected_organization_id and id = affected_case_id
  returning aggregate_version into next_version;
  evidence := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sourceTable', tg_table_name, 'sourceId', new.id
  ));
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), affected_organization_id, affected_case_id,
    next_version, 'approval_invalidated', 'osp-workflow', 'system', null,
    pg_catalog.encode(extensions.digest(evidence::text, 'sha256'), 'hex'), evidence
  );
  insert into osp_private.case_events (
    id, organization_id, case_id, sequence, state, actor_subject,
    authority_role, source_version, occurred_at, reason_code, correlation_id,
    evidence_json
  ) values (
    extensions.gen_random_uuid(), affected_organization_id, affected_case_id,
    next_version, 'operations_review', 'osp-workflow', 'operations',
    next_version - 1, statement_timestamp(), 'approval_invalidated',
    extensions.gen_random_uuid(), evidence
  );
  return new;
end;
$$;

create trigger osp_document_extractions_invalidate_authority
before insert or update on osp_private.document_extractions
for each row execute function osp_private.invalidate_case_input_authority();
create trigger osp_extraction_fields_invalidate_authority
before insert or update on osp_private.extraction_fields
for each row execute function osp_private.invalidate_case_input_authority();
create trigger osp_supplier_form_mappings_invalidate_authority
before insert or update on osp_private.supplier_form_mappings
for each row execute function osp_private.invalidate_case_input_authority();
create trigger osp_case_form_instances_invalidate_authority
before insert or update on osp_private.case_form_instances
for each row execute function osp_private.invalidate_case_input_authority();
create trigger osp_review_decisions_invalidate_authority
before insert or update on osp_private.review_decisions
for each row execute function osp_private.invalidate_case_input_authority();

create trigger outbound_gmail_receipts_append_only
before update or delete on osp_private.outbound_gmail_receipts
for each row execute function osp_private.reject_approval_mutation();

alter table osp_private.outbound_gmail_receipts enable row level security;
alter table osp_private.outbound_gmail_receipts force row level security;

create policy outbound_attempts_workflow_insert
on osp_private.outbound_send_attempts for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
revoke insert on osp_private.outbound_send_attempts from osp_workflow_api;
alter function osp_private.authorize_outbound_command(uuid, uuid, uuid, text, text[], bigint, text, text, text, text[], text, text, timestamptz, text) security definer;
alter function osp_private.authorize_outbound_command(uuid, uuid, uuid, text, text[], bigint, text, text, text, text[], text, text, timestamptz, text) set search_path = pg_catalog, osp_private, extensions;
revoke insert on osp_private.sales_authorizations from osp_workflow_api;
revoke update on osp_private.document_versions from osp_workflow_api;
grant select on osp_private.outbound_send_status to osp_workflow_api;

revoke all on function osp_private.request_authorized_send_command(uuid, uuid, uuid, text, bigint, text, text, text, text[], text, text, timestamptz, text) from public;
revoke all on function osp_private.claim_authorized_send(uuid, uuid, uuid, uuid) from public;
revoke all on function osp_private.complete_authorized_send(uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) from public;
revoke all on function osp_private.fail_authorized_send(uuid, uuid, uuid, uuid, uuid, text) from public;
revoke all on function osp_private.mark_authorized_send_ambiguous(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function osp_private.capture_authorized_gmail_event(uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public;
revoke all on function osp_private.protect_document_version_active_effects() from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.protect_generated_package_supersede() from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.protect_signature_approval_supersede() from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.invalidate_case_input_authority() from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.mark_document_review_required_command(uuid, uuid) from public, anon, authenticated, osp_worker;
revoke all on function osp_private.approve_document_version_command(uuid, uuid, integer, text, text, text, text) from public, anon, authenticated, osp_worker;

grant execute on function osp_private.request_authorized_send_command(uuid, uuid, uuid, text, bigint, text, text, text, text[], text, text, timestamptz, text) to osp_workflow_api;
grant execute on function osp_private.claim_authorized_send(uuid, uuid, uuid, uuid) to osp_worker;
grant execute on function osp_private.complete_authorized_send(uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) to osp_worker;
grant execute on function osp_private.fail_authorized_send(uuid, uuid, uuid, uuid, uuid, text) to osp_worker;
grant execute on function osp_private.mark_authorized_send_ambiguous(uuid, uuid, uuid, uuid, uuid) to osp_worker;
grant execute on function osp_private.capture_authorized_gmail_event(uuid, uuid, uuid, text, text, text, text, text, timestamptz) to osp_worker;
grant execute on function osp_private.mark_document_review_required_command(uuid, uuid) to osp_workflow_api;
grant execute on function osp_private.approve_document_version_command(uuid, uuid, integer, text, text, text, text) to osp_workflow_api;
