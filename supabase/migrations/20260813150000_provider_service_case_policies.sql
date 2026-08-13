-- Provider Service Build 4: versioned case and SLA policies.

create table if not exists public.provider_service_case_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  case_type text not null,
  policy_name text not null,
  version integer not null,
  status text not null default 'draft',
  default_priority text not null default 'normal',
  first_response_minutes integer,
  resolution_minutes integer,
  default_owner_role_code text,
  effective_from timestamptz,
  effective_to timestamptz,
  published_at timestamptz,
  published_by_user_id text,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_case_policies_org_id_unique unique (organization_id, id),
  constraint provider_service_case_policies_org_id_entity_unique unique (organization_id, id, legal_entity_id),
  constraint provider_service_case_policies_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_service_case_policies_version_unique
    unique (organization_id, legal_entity_id, case_type, version),
  constraint provider_service_case_policies_type_check
    check (case_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_service_case_policies_name_not_blank check (btrim(policy_name) <> ''),
  constraint provider_service_case_policies_version_check check (version > 0),
  constraint provider_service_case_policies_status_check check (status in ('draft', 'published', 'retired')),
  constraint provider_service_case_policies_priority_check
    check (default_priority in ('low', 'normal', 'high', 'urgent', 'critical')),
  constraint provider_service_case_policies_first_response_check
    check (first_response_minutes is null or first_response_minutes > 0),
  constraint provider_service_case_policies_resolution_check
    check (resolution_minutes is null or resolution_minutes > 0),
  constraint provider_service_case_policies_owner_role_check
    check (default_owner_role_code is null or default_owner_role_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_service_case_policies_dates_check
    check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint provider_service_case_policies_published_check check (
    status = 'draft'
    or (published_at is not null and nullif(btrim(coalesce(published_by_user_id, '')), '') is not null)
  ),
  constraint provider_service_case_policies_retired_check
    check (status <> 'retired' or retired_at is not null)
);

create unique index if not exists provider_service_case_policies_one_published_idx
  on public.provider_service_case_policies (organization_id, legal_entity_id, case_type)
  where status = 'published';
