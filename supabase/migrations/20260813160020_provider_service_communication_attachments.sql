-- Provider Service Build 5: attachment metadata under idempotent messages.
-- File binaries remain outside this build; processed provider documents are linked by Build 3 document_version_id.

create table if not exists public.provider_communication_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  message_id uuid not null,
  legal_entity_id uuid not null,
  provider_relationship_id uuid,
  external_attachment_id text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint,
  file_sha256 text,
  processing_status text not null default 'received',
  document_version_id uuid,
  processing_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_communication_attachments_org_id_unique unique (organization_id, id),
  constraint provider_communication_attachments_message_fkey
    foreign key (organization_id, message_id)
    references public.provider_communication_messages(organization_id, id)
    on delete cascade,
  constraint provider_communication_attachments_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_communication_attachments_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_communication_attachments_document_fkey
    foreign key (organization_id, document_version_id, provider_relationship_id, legal_entity_id)
    references public.provider_document_versions(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete restrict,
  constraint provider_communication_attachments_external_unique
    unique (organization_id, message_id, external_attachment_id),
  constraint provider_communication_attachments_external_not_blank
    check (btrim(external_attachment_id) <> ''),
  constraint provider_communication_attachments_filename_not_blank
    check (btrim(original_filename) <> ''),
  constraint provider_communication_attachments_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint provider_communication_attachments_sha256_check
    check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_communication_attachments_processing_check
    check (processing_status in ('received', 'processing', 'registered', 'needs_review', 'failed', 'ignored')),
  constraint provider_communication_attachments_document_scope_check
    check (document_version_id is null or provider_relationship_id is not null),
  constraint provider_communication_attachments_error_check
    check (processing_status <> 'failed' or nullif(btrim(coalesce(processing_error, '')), '') is not null)
);

create index if not exists provider_communication_attachments_message_idx
  on public.provider_communication_attachments (message_id, processing_status, created_at);
create index if not exists provider_communication_attachments_unprocessed_idx
  on public.provider_communication_attachments (organization_id, processing_status, created_at)
  where document_version_id is null and processing_status in ('received', 'processing', 'needs_review');
