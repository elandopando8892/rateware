create table if not exists public.provider_signature_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  legal_entity_id uuid not null,
  provider_relationship_id uuid not null,
  approval_request_id uuid not null,
  source_document_version_id uuid not null,
  output_document_version_id uuid,
  signer_reference text not null,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  applied_at timestamptz,
  application_reference text,
  failure_message text,
  created_at timestamptz not null default now()
);
