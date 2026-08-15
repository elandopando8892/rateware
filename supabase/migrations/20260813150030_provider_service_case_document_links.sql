-- Provider Service Build 4: case to document links.

create table if not exists public.provider_service_case_document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  document_version_id uuid not null,
  link_role text not null default 'supporting',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_case_document_links_org_id_unique unique (organization_id, id),
  constraint provider_service_case_document_links_case_fkey
    foreign key (organization_id, case_id, provider_relationship_id, legal_entity_id)
    references public.provider_service_cases(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete cascade,
  constraint provider_service_case_document_links_version_fkey
    foreign key (organization_id, document_version_id, provider_relationship_id, legal_entity_id)
    references public.provider_document_versions(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete restrict,
  constraint provider_service_case_document_links_unique
    unique (organization_id, case_id, document_version_id, link_role),
  constraint provider_service_case_document_links_role_check
    check (link_role in ('source', 'supporting', 'response', 'resolution', 'generated_output')),
  constraint provider_service_case_document_links_status_check
    check (status in ('active', 'revoked', 'superseded'))
);

create index if not exists provider_service_case_document_links_case_idx
  on public.provider_service_case_document_links (case_id, status, created_at desc);
