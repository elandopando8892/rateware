create table if not exists public.provider_communication_case_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null,
  case_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  link_role text not null default 'related',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
