create table if not exists public.provider_compliance_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  evaluation_id uuid not null,
  rule_result_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  evidence_kind text not null,
  document_version_id uuid,
  source_system text,
  external_reference text,
  manual_reference text,
  status text not null default 'active',
  verified_at timestamptz,
  verified_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
