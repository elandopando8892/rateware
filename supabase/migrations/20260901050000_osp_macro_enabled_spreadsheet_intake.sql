-- Admit macro-enabled customer-setup workbooks only after the worker has
-- preserved the original and validated a macro-free analysis copy. This
-- migration grants no signature, disclosure, email, webhook or outbound power.

do $osp_xlsm_bucket_boundary$
declare
  originals storage.buckets%rowtype;
  corporate storage.buckets%rowtype;
  old_originals constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'message/rfc822'
  ];
  next_originals constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'message/rfc822'
  ];
  old_corporate constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  next_corporate constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
begin
  select * into originals from storage.buckets where id = 'osp-originals' for update;
  if not found or originals.public is distinct from false
     or originals.file_size_limit is distinct from 26214400
     or (originals.allowed_mime_types is distinct from old_originals
         and originals.allowed_mime_types is distinct from next_originals) then
    raise exception using errcode = '23514', message = 'OSP_ORIGINALS_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_originals where id = 'osp-originals';

  select * into corporate from storage.buckets where id = 'osp-corporate-documents' for update;
  if not found or corporate.public is distinct from false
     or corporate.file_size_limit is distinct from 26214400
     or (corporate.allowed_mime_types is distinct from old_corporate
         and corporate.allowed_mime_types is distinct from next_corporate) then
    raise exception using errcode = '23514', message = 'OSP_CORPORATE_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_corporate where id = 'osp-corporate-documents';
end;
$osp_xlsm_bucket_boundary$;

create or replace function osp_private.claim_next_background_jobs(
  p_lease_ms integer,
  p_limit integer
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
  if p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidates as (
      select job.id
      from osp_private.background_jobs job
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          control.release_mode in ('internal_send', 'bounded_cohort')
          or (
            control.release_mode = 'shadow'
            and job.kind in ('gmail_ingest', 'duplicate_review_refresh')
          )
          or (
            control.release_mode = 'shadow'
            and control.outbound_enabled = false
            and control.osp_xlsx_intake_enabled
            and job.created_at >= control.osp_xlsx_intake_active_after
            and (
              (
                job.kind = 'document_extract'
                and exists (
                  select 1
                  from osp_private.document_versions version
                  join osp_private.documents document
                    on document.organization_id = version.organization_id
                   and document.id = version.document_id
                  join osp_private.customer_registration_cases case_record
                    on case_record.organization_id = document.organization_id
                   and case_record.id = document.case_id
                   and case_record.blocked_by_duplicate_review = false
                  join osp_private.gmail_attachments attachment
                    on attachment.organization_id = version.organization_id
                   and attachment.id = version.id
                  join osp_private.gmail_messages message
                    on message.organization_id = attachment.organization_id
                   and message.id = attachment.gmail_message_id
                   and message.received_at >= control.osp_xlsx_intake_active_after
                  join lateral (
                    select assessment.status, assessment.reason_code
                    from osp_private.source_safety_assessments assessment
                    where assessment.organization_id = version.organization_id
                      and assessment.document_version_id = version.id
                    order by assessment.version desc
                    limit 1
                  ) safety on true
                  where version.organization_id = job.organization_id
                    and version.id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'documentVersionId'
                    )
                    and version.document_type = 'supplier_requirement'
                    and version.status in ('review_required', 'approved')
                    and version.bucket_id = 'osp-corporate-documents'
                    and (
                      (version.content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                       and safety.reason_code = 'strict_xlsx_package_policy')
                      or
                      (version.content_type = 'application/vnd.ms-excel.sheet.macroEnabled.12'
                       and safety.reason_code = 'macro_quarantined_openxml_policy')
                    )
                    and safety.status = 'safe'
                )
              )
              or (
                job.kind = 'form_ai_mapping'
                and exists (
                  select 1
                  from osp_private.document_extractions extraction
                  join osp_private.document_versions version
                    on version.organization_id = extraction.organization_id
                   and version.id = extraction.source_version_id
                  join osp_private.documents document
                    on document.organization_id = version.organization_id
                   and document.id = version.document_id
                  join osp_private.customer_registration_cases case_record
                    on case_record.organization_id = extraction.organization_id
                   and case_record.id = extraction.case_id
                   and case_record.blocked_by_duplicate_review = false
                  join osp_private.gmail_attachments attachment
                    on attachment.organization_id = version.organization_id
                   and attachment.id = version.id
                  join osp_private.gmail_messages message
                    on message.organization_id = attachment.organization_id
                   and message.id = attachment.gmail_message_id
                   and message.received_at >= control.osp_xlsx_intake_active_after
                  join lateral (
                    select assessment.status, assessment.reason_code
                    from osp_private.source_safety_assessments assessment
                    where assessment.organization_id = version.organization_id
                      and assessment.document_version_id = version.id
                    order by assessment.version desc
                    limit 1
                  ) safety on true
                  where extraction.organization_id = job.organization_id
                    and extraction.id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'extractionId'
                    )
                    and extraction.case_id = osp_private.background_job_payload_uuid(
                      job.opaque_payload,
                      'caseId'
                    )
                    and (
                      (version.content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                       and safety.reason_code = 'strict_xlsx_package_policy')
                      or
                      (version.content_type = 'application/vnd.ms-excel.sheet.macroEnabled.12'
                       and safety.reason_code = 'macro_quarantined_openxml_policy')
                    )
                    and safety.status = 'safe'
                )
              )
            )
          )
        )
      order by job.created_at, job.id
      for update of job skip locked
      limit p_limit
    )
    update osp_private.background_jobs job
    set attempt = job.attempt + 1,
        lease_token = extensions.gen_random_uuid(),
        leased_until = lease_deadline
    from candidates
    where job.id = candidates.id
    returning job.id, job.organization_id, job.kind, job.opaque_payload,
      job.attempt, job.lease_token, job.leased_until;
end;
$$;

revoke all on function osp_private.claim_next_background_jobs(integer, integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_next_background_jobs(integer, integer)
  to osp_worker;

comment on function osp_private.claim_next_background_jobs(integer, integer) is
  'Claims OSP background work. XLSM jobs require a quarantined macro-free analysis-copy safety assessment; original files remain immutable and macros never execute.';
