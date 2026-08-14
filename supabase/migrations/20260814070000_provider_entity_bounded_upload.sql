-- Provider Service Build 20: bounded signed-upload session state.
-- Internal orchestration only; no browser or Edge action is exposed in this build.

alter table public.provider_entity_document_ingestions
  add column if not exists upload_session_id uuid,
  add column if not exists upload_issued_at timestamptz,
  add column if not exists upload_expires_at timestamptz,
  add column if not exists upload_completed_at timestamptz,
  add column if not exists object_etag text,
  add column if not exists object_last_modified_at timestamptz;

alter table public.provider_entity_document_ingestions
  add constraint provider_entity_ingestions_upload_session_unique
    unique (organization_id,upload_session_id),
  add constraint provider_entity_ingestions_upload_window_check
    check (
      (upload_session_id is null and upload_issued_at is null and upload_expires_at is null)
      or (
        upload_session_id is not null
        and upload_issued_at is not null
        and upload_expires_at is not null
        and upload_expires_at>upload_issued_at
        and upload_expires_at<=upload_issued_at+interval '15 minutes'
      )
    ),
  add constraint provider_entity_ingestions_upload_completion_check
    check (
      upload_completed_at is null
      or (
        upload_session_id is not null
        and ingestion_status in ('uploaded','scanning','quarantined','ready','failed')
      )
    ),
  add constraint provider_entity_ingestions_object_etag_check
    check (object_etag is null or btrim(object_etag)<>''),
  add constraint provider_entity_ingestions_object_modified_check
    check (object_last_modified_at is null or upload_completed_at is not null);

create index if not exists provider_entity_ingestions_upload_expiry_idx
  on public.provider_entity_document_ingestions (organization_id,upload_expires_at)
  where ingestion_status='requested' and upload_expires_at is not null;
