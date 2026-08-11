-- Phase 0.2A is expand-only. It records reviewed identity and tenant links but
-- deliberately does not infer or activate any mapping from legacy email data.

alter table public.workspace_registry
  add column if not exists organization_uuid uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_registry_organization_uuid_fkey'
      and conrelid = 'public.workspace_registry'::regclass
  ) then
    alter table public.workspace_registry
      add constraint workspace_registry_organization_uuid_fkey
      foreign key (organization_uuid)
      references public.organizations(id)
      on delete restrict
      not valid;
  end if;
end
$$;

create index if not exists workspace_registry_organization_uuid_idx
  on public.workspace_registry (organization_uuid)
  where organization_uuid is not null;

create table if not exists public.external_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_subject text not null,
  email text,
  status text not null default 'needs_review',
  reviewed_at timestamptz,
  reviewed_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint external_identities_provider_subject_unique unique (provider, external_subject),
  constraint external_identities_provider_normalized check (provider = lower(btrim(provider)) and provider <> ''),
  constraint external_identities_subject_not_blank check (btrim(external_subject) <> ''),
  constraint external_identities_status_check check (status in ('needs_review', 'active', 'suspended', 'revoked')),
  constraint external_identities_active_review_check check (
    status <> 'active' or (reviewed_at is not null and nullif(btrim(reviewed_by_user_id), '') is not null)
  )
);

create table if not exists public.external_organization_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_organization_id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'needs_review',
  reviewed_at timestamptz,
  reviewed_by_user_id text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint external_organization_links_external_unique unique (provider, external_organization_id),
  constraint external_organization_links_provider_normalized check (provider = lower(btrim(provider)) and provider <> ''),
  constraint external_organization_links_external_id_normalized check (
    external_organization_id = lower(btrim(external_organization_id)) and external_organization_id <> ''
  ),
  constraint external_organization_links_status_check check (status in ('needs_review', 'active', 'suspended', 'rejected')),
  constraint external_organization_links_active_review_check check (
    status <> 'active' or (
      reviewed_at is not null
      and nullif(btrim(reviewed_by_user_id), '') is not null
      and nullif(btrim(review_note), '') is not null
    )
  )
);

create index if not exists external_identities_email_idx
  on public.external_identities (lower(email))
  where email is not null;

create index if not exists external_organization_links_tenant_idx
  on public.external_organization_links (organization_id, provider, status);

create or replace view public.phase0_workspace_tenant_candidates
with (security_invoker = true)
as
select
  registry.organization_id as external_organization_id,
  organization.id as candidate_organization_id,
  count(distinct alias.identity_key)::bigint as evidence_count,
  array_agg(distinct alias.identity_type order by alias.identity_type) as evidence_types
from public.workspace_registry registry
join public.workspace_identity_aliases alias
  on alias.organization_id = registry.organization_id
join public.organizations organization
  on lower(btrim(organization.owner_email)) = alias.identity_key
  or lower(btrim(coalesce(organization.owner_user_id, ''))) = alias.identity_key
group by registry.organization_id, organization.id;

alter table public.external_identities enable row level security;
alter table public.external_organization_links enable row level security;

revoke all on table public.external_identities from public, anon, authenticated;
revoke all on table public.external_organization_links from public, anon, authenticated;
revoke all on table public.phase0_workspace_tenant_candidates from public, anon, authenticated;
grant select, insert, update on table public.external_identities to service_role;
grant select, insert, update on table public.external_organization_links to service_role;
grant select on table public.phase0_workspace_tenant_candidates to service_role;

comment on column public.workspace_registry.organization_uuid is
  'Reviewed bridge to the canonical Rateware tenant. Null means unreconciled and must fail closed.';
comment on table public.external_identities is
  'Reviewed provider subjects. Email is evidence only and never an authorization principal.';
comment on table public.external_organization_links is
  'Reviewed external organization to canonical Rateware tenant mappings. No legacy backfill is automatic.';
comment on view public.phase0_workspace_tenant_candidates is
  'PII-free reconciliation evidence only. Candidate rows never activate a tenant mapping.';
