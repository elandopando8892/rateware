create function osp_private.claim_exact_shadow_analysis(
  p_organization_id uuid,
  p_case_id uuid,
  p_job_id uuid,
  p_kind text,
  p_lease_ms integer
) returns table (
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
  if p_organization_id is null or p_case_id is null or p_job_id is null
     or p_kind not in ('attachment_promote', 'request_manifest')
     or p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000 then
    raise exception using errcode = 'P0001', message = 'INVALID_CLAIM';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidate as (
      select job.id
      from osp_private.background_jobs job
      join osp_private.customer_registration_cases case_record
        on case_record.organization_id = job.organization_id
       and case_record.id = p_case_id
      join osp_private.gmail_messages source_message
        on source_message.organization_id = case_record.organization_id
       and source_message.case_id = case_record.id
       and source_message.gmail_message_id = case_record.gmail_message_id
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.release_mode = 'shadow'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = p_kind
        and job.opaque_payload = pg_catalog.jsonb_build_object(
          'caseId', p_case_id::text
        )
        and job.attempt = 0
        and job.completed_at is null
        and job.last_error_code is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and case_record.blocked_by_duplicate_review = false
        and source_message.subject like
          'PRUEBA CONTROLADA OSP-CANARY-%'
        and (
          p_kind = 'attachment_promote'
          or (
            exists (
              select 1 from osp_private.background_jobs promotion
              where promotion.organization_id = p_organization_id
                and promotion.kind = 'attachment_promote'
                and promotion.opaque_payload = pg_catalog.jsonb_build_object(
                  'caseId', p_case_id::text
                )
                and promotion.completed_at is not null
                and promotion.last_error_code is null
            )
            and not exists (
              select 1 from osp_private.background_jobs promotion
              where promotion.organization_id = p_organization_id
                and promotion.kind = 'attachment_promote'
                and promotion.opaque_payload = pg_catalog.jsonb_build_object(
                  'caseId', p_case_id::text
                )
                and promotion.completed_at is null
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
$$;

revoke all on function osp_private.claim_exact_shadow_analysis(
  uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_exact_shadow_analysis(
  uuid, uuid, uuid, text, integer
) to osp_worker;
