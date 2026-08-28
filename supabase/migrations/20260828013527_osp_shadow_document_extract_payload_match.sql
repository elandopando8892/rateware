-- BackgroundJobStore persists its canonical payload as either a JSON object or
-- a JSONB string, depending on the postgres driver. Match both exact forms
-- without parsing arbitrary text inside the privileged claim function.
create or replace function osp_private.claim_shadow_document_extract(
  p_organization_id uuid,
  p_case_id uuid,
  p_job_id uuid,
  p_document_version_id uuid,
  p_source_sha256 text,
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
set search_path = pg_catalog, osp_private
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_organization_id is null
     or p_case_id is null
     or p_job_id is null
     or p_document_version_id is null
     or p_source_sha256 is null
     or p_source_sha256 !~ '^[0-9a-f]{64}$'
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
      join osp_private.document_versions document_version
        on document_version.organization_id = job.organization_id
       and document_version.id = p_document_version_id
      join osp_private.documents document
        on document.organization_id = document_version.organization_id
       and document.id = document_version.document_id
      join lateral (
        select assessment.status, assessment.reason_code,
               assessment.content_sha256
        from osp_private.source_safety_assessments assessment
        where assessment.organization_id = document_version.organization_id
          and assessment.document_version_id = document_version.id
        order by assessment.version desc
        limit 1
      ) safety on true
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.release_mode = 'shadow'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = 'document_extract'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'object'
            and job.opaque_payload = pg_catalog.jsonb_build_object(
              'documentVersionId', p_document_version_id::text
            )
          )
          or (
            pg_catalog.jsonb_typeof(job.opaque_payload) = 'string'
            and job.opaque_payload #>> '{}' = pg_catalog.format(
              '{"documentVersionId":"%s"}', p_document_version_id
            )
          )
        )
        and document.case_id = p_case_id
        and document_version.document_type = 'supplier_requirement'
        and document_version.status = 'review_required'
        and document_version.content_type =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        and document_version.source_sha256 = p_source_sha256
        and safety.status = 'safe'
        and safety.reason_code = 'strict_xlsx_package_policy'
        and safety.content_sha256 = p_source_sha256
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
$$;

revoke all on function osp_private.claim_shadow_document_extract(
  uuid, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role, osp_workflow_api;

grant execute on function osp_private.claim_shadow_document_extract(
  uuid, uuid, uuid, uuid, text, integer
) to osp_worker;
