create table if not exists public.provider_system_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  system_code text not null,
  mapping_type text not null,
  required_for_activation boolean not null default false,
  status text not null default 'not_configured',
  external_reference_id uuid,
  expected_fingerprint text,
  actual_fingerprint text,
  last_synced_at timestamptz,
  last_reconciled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
