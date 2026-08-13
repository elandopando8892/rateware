create table if not exists public.provider_sync_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  system_code text not null,
  action_code text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
