-- Provider Service Build 21: processing lease and review evidence.
alter table public.provider_entity_document_ingestions
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists processing_lease_token uuid,
  add column if not exists processing_lease_expires_at timestamptz,
  add column if not exists last_processing_error text;

alter table public.provider_entity_document_ingestions
  add constraint provider_entity_ingestions_attempts_check check (processing_attempts>=0 and processing_attempts<=25),
  add constraint provider_entity_ingestions_lease_check check (
    (processing_lease_token is null and processing_lease_expires_at is null)
    or (processing_lease_token is not null and processing_lease_expires_at is not null)
  ),
  add constraint provider_entity_ingestions_error_check
    check (last_processing_error is null or length(last_processing_error)<=2000);

create index if not exists provider_entity_ingestions_worker_claim_idx
  on public.provider_entity_document_ingestions (ingestion_status,processing_lease_expires_at,created_at)
  where ingestion_status in ('uploaded','scanning');
