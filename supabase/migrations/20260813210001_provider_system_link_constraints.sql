alter table public.provider_system_links add constraint provider_system_links_org_id_unique unique (organization_id,id);
alter table public.provider_system_links add constraint provider_system_links_relationship_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id) references public.provider_relationships(organization_id,id,legal_entity_id) on delete restrict;
alter table public.provider_system_links add constraint provider_system_links_mapping_unique unique (organization_id,provider_relationship_id,legal_entity_id,system_code,mapping_type);
alter table public.provider_system_links add constraint provider_system_links_system_check check (system_code ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.provider_system_links add constraint provider_system_links_mapping_check check (mapping_type ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.provider_system_links add constraint provider_system_links_status_check check (status in ('not_configured','pending','provisioning','active','drift','suspended','error'));
