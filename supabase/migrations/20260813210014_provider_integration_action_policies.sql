-- Provider Service Build 10: versioned allowlist for outbound integration actions.
create table if not exists public.provider_integration_action_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  system_code text not null,
  action_code text not null,
  version integer not null,
  status text not null default 'draft',
  sensitivity text not null default 'internal',
  requires_approval boolean not null default false,
  required_for_activation boolean not null default false,
  published_at timestamptz,
  published_by_user_id text,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_integration_action_policies_org_id_unique unique (organization_id,id),
  constraint provider_integration_action_policies_entity_fkey
    foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_integration_action_policies_version_unique
    unique (organization_id,legal_entity_id,system_code,action_code,version),
  constraint provider_integration_action_policies_system_check
    check (system_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_integration_action_policies_action_check
    check (action_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_integration_action_policies_version_check check (version > 0),
  constraint provider_integration_action_policies_status_check check (status in ('draft','published','retired')),
  constraint provider_integration_action_policies_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_integration_action_policies_approval_check
    check (sensitivity not in ('restricted','highly_restricted') or requires_approval),
  constraint provider_integration_action_policies_published_check
    check (status='draft' or (published_at is not null and nullif(btrim(coalesce(published_by_user_id,'')),'') is not null)),
  constraint provider_integration_action_policies_retired_check check (status <> 'retired' or retired_at is not null)
);

create unique index if not exists provider_integration_action_policies_one_published_idx
  on public.provider_integration_action_policies (organization_id,legal_entity_id,system_code,action_code)
  where status='published';
