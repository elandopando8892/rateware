-- A narrowly scoped recovery action. It cannot replay or alter the failed
-- historical Gmail job, and it grants neither outbound nor package authority.

alter table osp_private.background_jobs
  drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs
  add constraint background_jobs_kind_check check (kind in (
    'gmail_ingest', 'duplicate_review_refresh', 'attachment_promote',
    'request_manifest', 'document_extract', 'quarterly_document_check',
    'form_ai_mapping', 'generate_supplier_package', 'apply_signature',
    'send_authorized_payload', 'exact_thread_association'
  ));

create function osp_private.claim_exact_thread_association(
  p_organization_id uuid,
  p_job_id uuid,
  p_prior_job_id uuid,
  p_target_case_id uuid,
  p_original_gmail_message_id text,
  p_original_outer_raw_mime_sha256 text,
  p_original_eml_sha256 text,
  p_amendment_gmail_message_id text,
  p_amendment_outer_raw_mime_sha256 text,
  p_amendment_eml_sha256 text,
  p_lease_ms integer
)
returns table (
  id uuid, organization_id uuid, kind text, opaque_payload jsonb,
  attempt integer, lease_token uuid, leased_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_organization_id is null or p_job_id is null or p_prior_job_id is null
     or p_target_case_id is null
     or p_original_gmail_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_amendment_gmail_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_original_gmail_message_id = p_amendment_gmail_message_id
     or p_original_outer_raw_mime_sha256 !~ '^[0-9a-f]{64}$'
     or p_original_eml_sha256 !~ '^[0-9a-f]{64}$'
     or p_amendment_outer_raw_mime_sha256 !~ '^[0-9a-f]{64}$'
     or p_amendment_eml_sha256 !~ '^[0-9a-f]{64}$'
     or p_original_outer_raw_mime_sha256 = p_amendment_outer_raw_mime_sha256
     or p_original_eml_sha256 = p_amendment_eml_sha256
     or p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000 then
    raise exception using errcode = 'P0001', message = 'INVALID_CLAIM';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidate as (
      select job.id
      from osp_private.background_jobs job
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = 'exact_thread_association'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and exists (
          select 1 from osp_private.background_jobs prior
          where prior.organization_id = p_organization_id
            and prior.id = p_prior_job_id
            and prior.kind = 'gmail_ingest'
            and prior.completed_at is not null
            and prior.last_error_code = 'INVALID_INPUT'
        )
        and job.opaque_payload = jsonb_build_object(
          'priorJobId', p_prior_job_id,
          'targetCaseId', p_target_case_id,
          'deliveryIdempotencyKey', 'exact-thread:' || p_target_case_id || ':' || p_original_outer_raw_mime_sha256 || ':' || p_amendment_outer_raw_mime_sha256,
          'originalGmailMessageId', p_original_gmail_message_id,
          'originalOuterRawMimeSha256', p_original_outer_raw_mime_sha256,
          'originalEmlSha256', p_original_eml_sha256,
          'amendmentGmailMessageId', p_amendment_gmail_message_id,
          'amendmentOuterRawMimeSha256', p_amendment_outer_raw_mime_sha256,
          'amendmentOriginalEmlSha256', p_amendment_eml_sha256
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

revoke all on function osp_private.claim_exact_thread_association(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_exact_thread_association(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, integer
) to osp_worker;
