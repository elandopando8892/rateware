create function osp_private.claim_signature_application_canary(
  p_organization_id uuid,
  p_case_id uuid,
  p_job_id uuid,
  p_approval_id uuid,
  p_expected_case_version bigint,
  p_input_snapshot_sha256 text,
  p_input_package_sha256 text,
  p_signature_position_version integer,
  p_lease_ms integer
)
returns table (
  id uuid,
  organization_id uuid,
  kind text,
  opaque_payload jsonb,
  attempt integer,
  lease_token uuid,
  leased_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  now_at timestamptz := pg_catalog.clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_organization_id is null
     or p_case_id is null
     or p_job_id is null
     or p_approval_id is null
     or p_expected_case_version is null
     or p_expected_case_version < 1
     or p_input_snapshot_sha256 is null
     or p_input_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_input_package_sha256 is null
     or p_input_package_sha256 !~ '^[0-9a-f]{64}$'
     or p_signature_position_version is null
     or p_signature_position_version < 1
     or p_lease_ms is null
     or p_lease_ms < 1
     or p_lease_ms > 900000 then
    raise exception using errcode = 'P0001', message = 'INVALID_CLAIM';
  end if;

  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidate as (
      select job.id
      from osp_private.background_jobs job
      join osp_private.signature_approvals approval
        on approval.organization_id = job.organization_id
       and approval.id = p_approval_id
       and approval.case_id = p_case_id
      join osp_private.customer_registration_cases case_record
        on case_record.organization_id = approval.organization_id
       and case_record.id = approval.case_id
      join osp_private.generated_packages package
        on package.organization_id = approval.organization_id
       and package.case_id = approval.case_id
       and package.id = approval.generated_package_id
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.release_mode = 'shadow'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = 'apply_signature'
        and job.attempt = 0
        and job.completed_at is null
        and job.retry_at is null
        and job.leased_until is null
        and case_record.state = 'signature_approval'
        and case_record.aggregate_version = p_expected_case_version
        and case_record.blocked_by_duplicate_review = false
        and approval.status = 'pending'
        and approval.input_snapshot_sha256 = p_input_snapshot_sha256
        and approval.signature_position_version = p_signature_position_version
        and approval.authorization_session_issued_at is not null
        and package.package_kind = 'supplier_completed'
        and package.status = 'current'
        and package.output_sha256 = p_input_package_sha256
        and package.input_snapshot_sha256 = p_input_snapshot_sha256
        and package.signature_approval_id is null
        and not exists (
          select 1
          from osp_private.signature_application_receipts receipt
          where receipt.organization_id = approval.organization_id
            and receipt.case_id = approval.case_id
            and receipt.approval_id = approval.id
        )
        and not exists (
          select 1
          from osp_private.generated_packages signed
          where signed.organization_id = approval.organization_id
            and signed.case_id = approval.case_id
            and signed.package_kind = 'signed'
            and signed.signature_approval_id = approval.id
        )
        and (
          (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'object'
            and job.opaque_payload = pg_catalog.jsonb_build_object(
              'approvalId', p_approval_id::text,
              'caseId', p_case_id::text
            )
          )
          or (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'string'
            and job.opaque_payload #>> '{}' = pg_catalog.format(
              '{"approvalId":"%s","caseId":"%s"}',
              p_approval_id,
              p_case_id
            )
          )
        )
      for update of job skip locked
      limit 1
    )
    update osp_private.background_jobs job
       set attempt = job.attempt + 1,
           lease_token = extensions.gen_random_uuid(),
           leased_until = lease_deadline
      from candidate
     where job.id = candidate.id
    returning job.id, job.organization_id, job.kind, job.opaque_payload,
              job.attempt, job.lease_token, job.leased_until;
end;
$function$;

revoke all on function osp_private.claim_signature_application_canary(
  uuid, uuid, uuid, uuid, bigint, text, text, integer, integer
) from public, anon, authenticated, service_role, osp_workflow_api;

grant execute on function osp_private.claim_signature_application_canary(
  uuid, uuid, uuid, uuid, bigint, text, text, integer, integer
) to osp_worker;
