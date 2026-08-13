-- Provider Service Build 1: relationship core tables and indexes.
-- Expand-only; no backfill and no mutation of existing vendor rows.

-- These composite keys let Provider Service enforce tenant scope with foreign
-- keys instead of inferring it from owner email or relying on a privileged trigger.
alter table public.workspace_registry
  add constraint workspace_registry_external_canonical_unique
  unique (organization_id, organization_uuid);

alter table public.vendors
  add constraint vendors_id_organization_id_unique
  unique (id, organization_id);

create table if not exists public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_code text not null,
  legal_name text not null,
  country_code text not null,
  tax_identifier text,
  default_currency text,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_entities_organization_id_id_unique unique (organization_id, id),
  constraint legal_entities_organization_id_id_code_unique unique (organization_id, id, entity_code),
  constraint legal_entities_organization_code_unique unique (organization_id, entity_code),
  constraint legal_entities_entity_code_check check (entity_code ~ '^[A-Z0-9]{2,16}$'),
  constraint legal_entities_legal_name_not_blank check (btrim(legal_name) <> ''),
  constraint legal_entities_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  constraint legal_entities_currency_check check (
    default_currency is null or default_currency ~ '^[A-Z]{3}$'
  ),
  constraint legal_entities_status_check check (status in ('draft', 'active', 'inactive'))
);

create table if not exists public.provider_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vendor_id uuid not null,
  vendor_workspace_id text not null,
  legal_entity_id uuid not null,
  legal_entity_code text not null,
  vendor_number bigint generated always as identity,
  vendor_code text generated always as (
    'VND-' || legal_entity_code || '-' || lpad(vendor_number::text, 6, '0')
  ) stored,
  lifecycle_status text not null default 'identified',
  activation_status text not null default 'not_started',
  risk_tier text not null default 'unrated',
  assigned_owner_user_id text,
  source text not null default 'manual',
  primary_blocker text,
  activated_at timestamptz,
  suspended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_relationships_organization_id_id_unique unique (organization_id, id),
  constraint provider_relationships_vendor_workspace_fkey
    foreign key (vendor_id, vendor_workspace_id)
    references public.vendors(id, organization_id)
    on delete restrict,
  constraint provider_relationships_workspace_tenant_fkey
    foreign key (vendor_workspace_id, organization_id)
    references public.workspace_registry(organization_id, organization_uuid)
    on delete restrict,
  constraint provider_relationships_entity_fkey
    foreign key (organization_id, legal_entity_id, legal_entity_code)
    references public.legal_entities(organization_id, id, entity_code)
    on delete restrict,
  constraint provider_relationships_vendor_entity_unique
    unique (organization_id, vendor_id, legal_entity_id),
  constraint provider_relationships_vendor_code_unique
    unique (organization_id, vendor_code),
  constraint provider_relationships_legal_entity_code_check
    check (legal_entity_code ~ '^[A-Z0-9]{2,16}$'),
  constraint provider_relationships_lifecycle_status_check check (
    lifecycle_status in (
      'identified',
      'contactable',
      'eligible',
      'onboarding',
      'under_review',
      'approved',
      'activated',
      'executed',
      'recurrent',
      'information_required',
      'correction_required',
      'compliance_hold',
      'finance_hold',
      'legal_review',
      'suspended',
      'rejected',
      'offboarded'
    )
  ),
  constraint provider_relationships_activation_status_check check (
    activation_status in ('not_started', 'in_progress', 'blocked', 'ready', 'activated', 'suspended')
  ),
  constraint provider_relationships_risk_tier_check check (
    risk_tier in ('unrated', 'low', 'medium', 'high', 'critical')
  ),
  constraint provider_relationships_source_not_blank check (btrim(source) <> ''),
  constraint provider_relationships_activated_at_check check (
    activation_status <> 'activated' or activated_at is not null
  ),
  constraint provider_relationships_suspended_at_check check (
    lifecycle_status <> 'suspended' or suspended_at is not null
  )
);

create table if not exists public.provider_relationship_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  role_code text not null,
  status text not null default 'active',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_relationship_roles_relationship_fkey
    foreign key (organization_id, provider_relationship_id)
    references public.provider_relationships(organization_id, id)
    on delete cascade,
  constraint provider_relationship_roles_unique
    unique (organization_id, provider_relationship_id, role_code),
  constraint provider_relationship_roles_code_check
    check (role_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_relationship_roles_status_check check (status in ('active', 'inactive')),
  constraint provider_relationship_roles_dates_check check (
    effective_to is null or effective_to >= effective_from
  )
);

create table if not exists public.provider_relationship_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  contact_name text not null,
  job_title text,
  email text,
  phone text,
  contact_role text not null default 'general',
  preferred_channel text not null default 'email',
  is_primary boolean not null default false,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_relationship_contacts_relationship_fkey
    foreign key (organization_id, provider_relationship_id)
    references public.provider_relationships(organization_id, id)
    on delete cascade,
  constraint provider_relationship_contacts_name_not_blank check (btrim(contact_name) <> ''),
  constraint provider_relationship_contacts_contact_required check (
    nullif(btrim(coalesce(email, '')), '') is not null
    or nullif(btrim(coalesce(phone, '')), '') is not null
  ),
  constraint provider_relationship_contacts_email_normalized check (
    email is null or email = lower(btrim(email))
  ),
  constraint provider_relationship_contacts_role_check
    check (contact_role ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_relationship_contacts_channel_check
    check (preferred_channel in ('email', 'phone', 'whatsapp', 'portal')),
  constraint provider_relationship_contacts_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.provider_external_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  system_code text not null,
  reference_type text not null,
  external_value text not null,
  is_primary boolean not null default true,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_external_references_relationship_fkey
    foreign key (organization_id, provider_relationship_id)
    references public.provider_relationships(organization_id, id)
    on delete cascade,
  constraint provider_external_references_identity_unique
    unique (organization_id, system_code, reference_type, external_value),
  constraint provider_external_references_system_code_check
    check (system_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_external_references_reference_type_check
    check (reference_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_external_references_value_not_blank check (btrim(external_value) <> ''),
  constraint provider_external_references_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.provider_relationship_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  event_type text not null,
  previous_lifecycle_status text,
  lifecycle_status text,
  previous_activation_status text,
  activation_status text,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service',
  correlation_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_relationship_events_relationship_fkey
    foreign key (organization_id, provider_relationship_id)
    references public.provider_relationships(organization_id, id)
    on delete restrict,
  constraint provider_relationship_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_relationship_events_actor_type_check
    check (actor_type in ('user', 'agent', 'system', 'integration')),
  constraint provider_relationship_events_source_not_blank check (btrim(source) <> '')
);

create unique index if not exists provider_relationship_contacts_primary_role_unique_idx
  on public.provider_relationship_contacts (
    organization_id,
    provider_relationship_id,
    contact_role
  )
  where is_primary and status = 'active';

create unique index if not exists provider_external_references_primary_unique_idx
  on public.provider_external_references (
    organization_id,
    provider_relationship_id,
    system_code,
    reference_type
  )
  where is_primary and status = 'active';

create index if not exists provider_relationships_organization_lifecycle_idx
  on public.provider_relationships (organization_id, lifecycle_status, updated_at desc);
create index if not exists provider_relationships_organization_activation_idx
  on public.provider_relationships (organization_id, activation_status, updated_at desc);
create index if not exists provider_relationships_vendor_idx
  on public.provider_relationships (vendor_id, legal_entity_id);
create index if not exists provider_relationship_roles_relationship_idx
  on public.provider_relationship_roles (provider_relationship_id, status, role_code);
create index if not exists provider_relationship_contacts_relationship_idx
  on public.provider_relationship_contacts (provider_relationship_id, status, contact_role);
create index if not exists provider_external_references_relationship_idx
  on public.provider_external_references (provider_relationship_id, status, system_code);
create index if not exists provider_relationship_events_relationship_created_idx
  on public.provider_relationship_events (provider_relationship_id, occurred_at desc, id desc);
