create function osp_private.claim_supplier_package_canary(
  p_organization_id uuid,
  p_case_id uuid,
  p_job_id uuid,
  p_snapshot_id uuid,
  p_snapshot_sha256 text,
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
     or p_snapshot_id is null
     or p_snapshot_sha256 is null
     or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
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
      join osp_private.case_package_input_snapshots snapshot
        on snapshot.organization_id = job.organization_id
       and snapshot.case_id = p_case_id
       and snapshot.id = p_snapshot_id
       and snapshot.canonical_sha256 = p_snapshot_sha256
      join osp_private.customer_registration_cases case_record
        on case_record.organization_id = snapshot.organization_id
       and case_record.id = snapshot.case_id
       and case_record.state = 'operations_review'
       and case_record.aggregate_version = snapshot.case_version
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = 'generate_supplier_package'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'object'
            and job.opaque_payload = pg_catalog.jsonb_build_object(
              'caseId', p_case_id::text,
              'snapshotId', p_snapshot_id::text
            )
          )
          or (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'string'
            and job.opaque_payload #>> '{}' = pg_catalog.format(
              '{"caseId":"%s","snapshotId":"%s"}',
              p_case_id,
              p_snapshot_id
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

revoke all on function osp_private.claim_supplier_package_canary(
  uuid, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role, osp_workflow_api;

grant execute on function osp_private.claim_supplier_package_canary(
  uuid, uuid, uuid, uuid, text, integer
) to osp_worker;
