-- Separate source preservation from attachment promotion so a bounded retry can
-- resume at the exact failed step. The worker remains shadow-only,
-- human-approved and unable to send email or invoke webhooks.

alter table osp_private.background_jobs
  drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs
  add constraint background_jobs_kind_check check (kind in (
    'gmail_ingest', 'duplicate_review_refresh', 'attachment_promote',
    'request_manifest', 'document_extract', 'quarterly_document_check',
    'form_ai_mapping', 'generate_supplier_package', 'apply_signature',
    'send_authorized_payload'
  ));

do $attachment_promotion_claim_gate$
declare
  current_definition text;
  updated_definition text;
  anchor constant text := $anchor$
          or (
            control.release_mode = 'shadow'
            and control.outbound_enabled = false
            and control.adaptive_manifest_enabled
            and control.approval_mode = 'human_approved'
            and job.kind = 'request_manifest'
$anchor$;
  replacement constant text := $replacement$
          or (
            control.release_mode = 'shadow'
            and control.outbound_enabled = false
            and control.adaptive_manifest_enabled
            and control.approval_mode = 'human_approved'
            and job.kind = 'attachment_promote'
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
                  select 1
                  from osp_private.gmail_attachments attachment
                  join osp_private.gmail_messages message
                    on message.organization_id = attachment.organization_id
                   and message.id = attachment.gmail_message_id
                  where attachment.organization_id = case_record.organization_id
                    and message.case_id = case_record.id
                    and attachment.content_type in (
                      'application/pdf',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.ms-excel.sheet.macroEnabled.12',
                      'image/jpeg',
                      'image/png'
                    )
                )
            )
          )
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'osp_private.claim_next_background_jobs(integer,integer)'::regprocedure
  ) into current_definition;
  if current_definition is null then
    raise exception using errcode = '42883', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_MISSING';
  end if;
  if pg_catalog.strpos(current_definition, 'job.kind = ''attachment_promote''') > 0 then
    return;
  end if;
  if pg_catalog.strpos(current_definition, anchor) = 0 then
    raise exception using errcode = '23514', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_DRIFT';
  end if;
  updated_definition := pg_catalog.replace(
    current_definition,
    anchor,
    replacement || anchor
  );
  if updated_definition = current_definition then
    raise exception using errcode = '23514', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_DRIFT';
  end if;
  execute updated_definition;
end;
$attachment_promotion_claim_gate$;

revoke all on function osp_private.claim_next_background_jobs(integer, integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_next_background_jobs(integer, integer)
  to osp_worker;

comment on column osp_private.production_controls.adaptive_manifest_enabled is
  'Allows governed email plus PDF/XLSX/XLSM/DOCX/JPEG/PNG request interpretation. It grants no outbound authority.';
