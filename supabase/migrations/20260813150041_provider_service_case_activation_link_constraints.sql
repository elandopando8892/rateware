alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_org_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_org_id_unique
  unique (organization_id, id);

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_case_fkey
  foreign key (organization_id, case_id, provider_relationship_id, legal_entity_id)
  references public.provider_service_cases(organization_id, id, provider_relationship_id, legal_entity_id)
  on delete cascade;

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_activation_fkey
  foreign key (organization_id, activation_id, provider_relationship_id, legal_entity_id)
  references public.provider_activations(organization_id, id, provider_relationship_id, legal_entity_id)
  on delete restrict;

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_unique
  unique (organization_id, case_id, activation_id, link_role);

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_role_check
  check (link_role in ('source', 'related', 'blocks_activation', 'resolves_activation'));

alter table public.provider_service_case_activation_links
  add constraint provider_service_case_activation_links_status_check
  check (status in ('active', 'revoked', 'superseded'));

create index if not exists provider_service_case_activation_links_case_idx
  on public.provider_service_case_activation_links (case_id, status, created_at desc);
