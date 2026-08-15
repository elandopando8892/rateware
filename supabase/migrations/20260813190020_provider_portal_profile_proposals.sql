create table if not exists public.provider_portal_profile_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invitation_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  field_code text not null,
  proposed_value jsonb not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now()
);
