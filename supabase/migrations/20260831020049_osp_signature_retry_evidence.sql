create table osp_private.signature_application_failure_evidence (
  failed_receipt_id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  approval_id uuid not null,
  failed_job_id uuid not null,
  input_object_id text not null
    check (input_object_id ~ '^[A-Za-z0-9:_/-]+$' and length(input_object_id) between 1 and 512),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_failure_code text not null
    check (receipt_failure_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  job_error_code text not null
    check (job_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  receipt_created_at timestamptz not null,
  failed_at timestamptz not null,
  archived_at timestamptz not null default statement_timestamp(),
  unique (organization_id, failed_receipt_id),
  unique (organization_id, failed_job_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, approval_id)
    references osp_private.signature_approvals(organization_id, case_id, id),
  foreign key (organization_id, failed_job_id)
    references osp_private.background_jobs(organization_id, id)
);

create trigger signature_application_failure_evidence_append_only
before update or delete on osp_private.signature_application_failure_evidence
for each row execute function osp_private.reject_signature_policy_mutation();

alter table osp_private.signature_application_failure_evidence enable row level security;
alter table osp_private.signature_application_failure_evidence force row level security;

revoke all on osp_private.signature_application_failure_evidence
from public, anon, authenticated, osp_worker, osp_workflow_api, service_role;

create function osp_private.prepare_signature_application_retry(
  p_organization_id uuid,
  p_case_id uuid,
  p_approval_id uuid,
  p_failed_receipt_id uuid,
  p_failed_job_id uuid,
  p_retry_job_id uuid,
  p_expected_case_version bigint,
  p_input_snapshot_sha256 text,
  p_input_package_sha256 text,
  p_expected_receipt_failure_code text,
  p_expected_job_error_code text,
  p_retry_idempotency_key text
)
returns table (
  id uuid,
  organization_id uuid,
  kind text,
  opaque_payload jsonb,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  approval osp_private.signature_approvals%rowtype;
  package osp_private.generated_packages%rowtype;
  failed_receipt osp_private.signature_application_receipts%rowtype;
  failed_job osp_private.background_jobs%rowtype;
  retry_job osp_private.background_jobs%rowtype;
begin
  if p_organization_id is null
     or p_case_id is null
     or p_approval_id is null
     or p_failed_receipt_id is null
     or p_failed_job_id is null
     or p_retry_job_id is null
     or p_failed_job_id = p_retry_job_id
     or p_expected_case_version is null
     or p_expected_case_version < 1
     or p_input_snapshot_sha256 is null
     or p_input_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_input_package_sha256 is null
     or p_input_package_sha256 !~ '^[0-9a-f]{64}$'
     or p_expected_receipt_failure_code is null
     or p_expected_receipt_failure_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
     or p_expected_job_error_code is null
     or p_expected_job_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
     or p_retry_idempotency_key is null
     or p_retry_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
     or pg_catalog.length(p_retry_idempotency_key) not between 1 and 256 then
    raise exception using errcode = 'P0001', message = 'INVALID_SIGNATURE_RETRY';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.json_build_array(
      p_organization_id, 'signature_application_retry', p_approval_id
    )::text,
    0
  ));

  select * into retry_job
  from osp_private.background_jobs candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_retry_job_id;
  if found then
    if retry_job.kind <> 'apply_signature'
       or retry_job.idempotency_key <> p_retry_idempotency_key
       or retry_job.attempt <> 0
       or retry_job.completed_at is not null
       or retry_job.opaque_payload <> pg_catalog.jsonb_build_object(
         'approvalId', p_approval_id::text,
         'caseId', p_case_id::text
       )
       or not exists (
         select 1
         from osp_private.signature_application_failure_evidence evidence
         where evidence.organization_id = p_organization_id
           and evidence.failed_receipt_id = p_failed_receipt_id
           and evidence.failed_job_id = p_failed_job_id
           and evidence.approval_id = p_approval_id
       ) then
      raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_CONFLICT';
    end if;
    return query select retry_job.id, retry_job.organization_id,
      retry_job.kind, retry_job.opaque_payload, retry_job.attempt;
    return;
  end if;

  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_case_id
  for update;
  if not found
     or current_case.state <> 'signature_approval'
     or current_case.aggregate_version <> p_expected_case_version
     or current_case.blocked_by_duplicate_review then
    raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_CASE_INVALID';
  end if;

  select * into approval
  from osp_private.signature_approvals candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = p_approval_id
  for update;
  if not found
     or approval.status <> 'pending'
     or approval.input_snapshot_sha256 <> p_input_snapshot_sha256 then
    raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_APPROVAL_INVALID';
  end if;

  select * into package
  from osp_private.generated_packages candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = approval.generated_package_id
  for update;
  if not found
     or package.package_kind <> 'supplier_completed'
     or package.status <> 'current'
     or package.input_snapshot_sha256 <> p_input_snapshot_sha256
     or package.output_sha256 <> p_input_package_sha256
     or package.signature_approval_id is not null then
    raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_PACKAGE_INVALID';
  end if;

  select * into failed_job
  from osp_private.background_jobs candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_failed_job_id
    and candidate.kind = 'apply_signature'
  for update;
  if not found
     or failed_job.completed_at is null
     or failed_job.last_error_code <> p_expected_job_error_code
     or failed_job.opaque_payload <> pg_catalog.jsonb_build_object(
       'approvalId', p_approval_id::text,
       'caseId', p_case_id::text
     ) then
    raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_JOB_INVALID';
  end if;

  select * into failed_receipt
  from osp_private.signature_application_receipts candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.approval_id = p_approval_id
    and candidate.id = p_failed_receipt_id
  for update;
  if not found
     or failed_receipt.outcome <> 'failed'
     or failed_receipt.failure_code <> p_expected_receipt_failure_code
     or failed_receipt.input_object_id <> package.object_id
     or failed_receipt.input_sha256 <> p_input_package_sha256
     or failed_receipt.completed_at is null then
    raise exception using errcode = '23514', message = 'SIGNATURE_RETRY_RECEIPT_INVALID';
  end if;

  if not exists (
       select 1
       from osp_private.production_controls control
       where control.id = 'singleton'
         and control.release_mode = 'shadow'
         and control.outbound_enabled = false
     )
     or exists (
       select 1 from osp_private.generated_packages signed
       where signed.organization_id = p_organization_id
         and signed.case_id = p_case_id
         and signed.package_kind = 'signed'
         and signed.signature_approval_id = p_approval_id
     )
     or exists (
       select 1 from osp_private.outbound_payloads payload
       where payload.organization_id = p_organization_id
         and payload.case_id = p_case_id
     )
     or exists (
       select 1 from osp_private.sales_authorizations authorization
       where authorization.organization_id = p_organization_id
         and authorization.case_id = p_case_id
     ) then
    raise exception using errcode = '55000', message = 'SIGNATURE_RETRY_EXTERNAL_EFFECT_HOLD';
  end if;

  insert into osp_private.signature_application_failure_evidence (
    failed_receipt_id, organization_id, case_id, approval_id, failed_job_id,
    input_object_id, input_sha256, receipt_failure_code, job_error_code,
    receipt_created_at, failed_at
  ) values (
    failed_receipt.id, failed_receipt.organization_id, failed_receipt.case_id,
    failed_receipt.approval_id, failed_job.id, failed_receipt.input_object_id,
    failed_receipt.input_sha256, failed_receipt.failure_code,
    failed_job.last_error_code, failed_receipt.created_at,
    failed_receipt.completed_at
  );

  delete from osp_private.signature_application_receipts candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_failed_receipt_id;

  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key, attempt,
    lease_token, leased_until, completed_at, retry_at, last_error_code
  ) values (
    p_retry_job_id, p_organization_id, 'apply_signature',
    pg_catalog.jsonb_build_object(
      'approvalId', p_approval_id::text,
      'caseId', p_case_id::text
    ),
    p_retry_idempotency_key, 0, null, null, null, null, null
  ) returning * into retry_job;

  return query select retry_job.id, retry_job.organization_id,
    retry_job.kind, retry_job.opaque_payload, retry_job.attempt;
end;
$function$;

revoke all on function osp_private.prepare_signature_application_retry(
  uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text, text
) from public, anon, authenticated, osp_worker, osp_workflow_api, service_role;

grant execute on function osp_private.prepare_signature_application_retry(
  uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text, text
) to postgres;
