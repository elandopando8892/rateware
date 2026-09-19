-- Preserve legacy Word attachments as immutable Gmail evidence while keeping
-- them outside every automatic document, extraction, package and signature path.

do $osp_legacy_doc_originals_boundary$
declare
  originals storage.buckets%rowtype;
  corporate storage.buckets%rowtype;
  derived storage.buckets%rowtype;
  current_types constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'message/rfc822'
  ];
  next_types constant text[] := array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword', 'message/rfc822'
  ];
begin
  select * into originals from storage.buckets where id = 'osp-originals' for update;
  if not found or originals.public is distinct from false
     or originals.file_size_limit is distinct from 26214400
     or (originals.allowed_mime_types is distinct from current_types
         and originals.allowed_mime_types is distinct from next_types) then
    raise exception using errcode = '23514', message = 'OSP_ORIGINALS_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_types where id = 'osp-originals';

  select * into corporate from storage.buckets where id = 'osp-corporate-documents' for update;
  select * into derived from storage.buckets where id = 'osp-derived-documents' for update;
  if corporate.id is null or derived.id is null
     or corporate.public is distinct from false
     or derived.public is distinct from false
     or corporate.allowed_mime_types is null
     or derived.allowed_mime_types is null
     or 'application/msword' = any(corporate.allowed_mime_types)
     or 'application/msword' = any(derived.allowed_mime_types) then
    raise exception using errcode = '23514', message = 'OSP_LEGACY_DOC_BUCKET_SCOPE_CONFLICT';
  end if;
end;
$osp_legacy_doc_originals_boundary$;

alter table osp_private.gmail_attachments
  add column if not exists processing_disposition text not null
    default 'automatic_eligible';

update osp_private.gmail_attachments
set processing_disposition = 'manual_conversion_required'
where content_type = 'application/msword'
  and processing_disposition <> 'manual_conversion_required';

alter table osp_private.gmail_attachments
  drop constraint if exists osp_gmail_attachments_processing_disposition_check;
alter table osp_private.gmail_attachments
  add constraint osp_gmail_attachments_processing_disposition_check
  check (
    (content_type = 'application/msword'
      and processing_disposition = 'manual_conversion_required')
    or
    (content_type <> 'application/msword'
      and processing_disposition = 'automatic_eligible')
  );

-- The relay provenance constraint remains closed to every other legacy or
-- executable format. application/msword is raw evidence, never a safe source.
alter table osp_private.gmail_attachments
  drop constraint if exists osp_gmail_attachments_source_role_check;
alter table osp_private.gmail_attachments
  add constraint osp_gmail_attachments_source_role_check
  check (
    source_role = 'direct_attachment'
    or (
      source_role = 'original_eml'
      and content_type = 'message/rfc822'
      and filename = 'original.eml'
      and parent_source_sha256 is not null
    )
    or (
      source_role = 'original_attachment'
      and content_type in (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12'
      )
      and filename is not null
      and parent_source_sha256 is not null
    )
  );

-- Allow the existing bounded promotion job to observe the manual blocker. The
-- worker records MANUAL_CONVERSION_REQUIRED and never queues a manifest.
do $legacy_doc_claim_gate$
declare
  current_definition text;
  updated_definition text;
  anchor constant text := $anchor$
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
$anchor$;
  replacement constant text := $replacement$
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/msword',
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'osp_private.claim_next_background_jobs(integer,integer)'::regprocedure
  ) into current_definition;
  if current_definition is null then
    raise exception using errcode = '42883', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_MISSING';
  end if;
  if pg_catalog.strpos(current_definition, '''application/msword''') = 0 then
    if pg_catalog.strpos(current_definition, anchor) = 0 then
      raise exception using errcode = '23514', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_DRIFT';
    end if;
    updated_definition := pg_catalog.replace(current_definition, anchor, replacement);
    if updated_definition = current_definition then
      raise exception using errcode = '23514', message = 'OSP_ATTACHMENT_PROMOTION_CLAIM_DRIFT';
    end if;
    execute updated_definition;
  end if;
end;
$legacy_doc_claim_gate$;

revoke all on function osp_private.claim_next_background_jobs(integer, integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_next_background_jobs(integer, integer)
  to osp_worker;

comment on column osp_private.gmail_attachments.processing_disposition is
  'automatic_eligible or manual_conversion_required. Legacy DOC is preserved only as raw Gmail evidence and cannot enter automatic processing or signing.';
