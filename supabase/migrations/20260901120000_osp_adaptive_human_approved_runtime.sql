-- Put request interpretation on the normal OSP worker path while preserving
-- human approval and a hard outbound lock. No email or webhook authority is
-- granted by this migration.

alter table osp_private.background_jobs
  drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs
  add constraint background_jobs_kind_check check (kind in (
    'gmail_ingest', 'duplicate_review_refresh', 'request_manifest',
    'document_extract', 'quarterly_document_check', 'form_ai_mapping',
    'generate_supplier_package', 'apply_signature', 'send_authorized_payload'
  ));

do $adaptive_derived_bucket$
declare
  target storage.buckets%rowtype;
  current_types constant text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  adaptive_types constant text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
begin
  select * into target from storage.buckets where id = 'osp-derived-documents' for update;
  if not found or target.public is distinct from false
     or target.file_size_limit is distinct from 26214400
     or (target.allowed_mime_types is distinct from current_types
         and target.allowed_mime_types is distinct from adaptive_types) then
    raise exception using errcode = '23514', message = 'OSP_DERIVED_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = adaptive_types
  where id = 'osp-derived-documents';
end;
$adaptive_derived_bucket$;

alter table osp_private.generated_packages
  drop constraint if exists generated_packages_content_type_check;
alter table osp_private.generated_packages
  add constraint generated_packages_content_type_check check (
    content_type is null or content_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ) not valid;

alter table osp_private.production_controls
  add column if not exists adaptive_manifest_enabled boolean not null default false,
  add column if not exists approval_mode text not null default 'human_approved';

alter table osp_private.production_controls
  drop constraint if exists osp_approval_mode_check;
alter table osp_private.production_controls
  add constraint osp_approval_mode_check check (approval_mode = 'human_approved');

update osp_private.production_controls
set adaptive_manifest_enabled = true,
    approval_mode = 'human_approved',
    outbound_enabled = false,
    updated_at = statement_timestamp()
where id = 'singleton'
  and release_mode = 'shadow'
  and outbound_enabled = false;

do $adaptive_controls$
begin
  if not exists (
    select 1 from osp_private.production_controls
    where id = 'singleton'
      and release_mode = 'shadow'
      and outbound_enabled = false
      and adaptive_manifest_enabled = true
      and approval_mode = 'human_approved'
  ) then
    raise exception using errcode = '23514', message = 'OSP_ADAPTIVE_CONTROL_CONFLICT';
  end if;
end;
$adaptive_controls$;

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
            and control.adaptive_manifest_enabled
            and control.approval_mode = 'human_approved'
            and job.kind = 'request_manifest'
            and exists (
              select 1
              from osp_private.customer_registration_cases case_record
              where case_record.organization_id = job.organization_id
                and case_record.id = osp_private.background_job_payload_uuid(
                  job.opaque_payload,
                  'caseId'
                )
                and case_record.blocked_by_duplicate_review = false
                and exists (
                  select 1 from osp_private.gmail_messages message
                  where message.organization_id = case_record.organization_id
                    and message.case_id = case_record.id
                )
                and not exists (
                  select 1
                  from osp_private.document_versions version
                  join osp_private.documents document
                    on document.organization_id = version.organization_id
                   and document.id = version.document_id
                  where version.organization_id = case_record.organization_id
                    and document.case_id = case_record.id
                    and version.document_type = 'supplier_requirement'
                    and version.status in ('review_required', 'approved')
                    and not exists (
                      select 1
                      from osp_private.source_safety_assessments assessment
                      where assessment.organization_id = version.organization_id
                        and assessment.document_version_id = version.id
                        and assessment.status = 'safe'
                    )
                )
            )
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

comment on column osp_private.production_controls.adaptive_manifest_enabled is
  'Allows governed email plus PDF/XLSX/XLSM/DOCX request interpretation. It grants no outbound authority.';
comment on column osp_private.production_controls.approval_mode is
  'OSP remains human-approved: AI proposes and accountable users confirm every consequential step.';
