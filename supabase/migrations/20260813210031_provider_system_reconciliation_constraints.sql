alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_org_fkey foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_relationship_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id) references public.provider_relationships(organization_id,id,legal_entity_id) on delete restrict;
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_system_check check (system_code ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_mapping_check check (mapping_type ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_status_check check (reconciliation_status in ('in_sync','drift','missing_remote','missing_local','error'));
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_expected_hash_check check (expected_fingerprint is null or expected_fingerprint ~ '^[0-9a-f]{64}$');
alter table public.provider_system_reconciliations add constraint provider_system_reconciliations_actual_hash_check check (actual_fingerprint is null or actual_fingerprint ~ '^[0-9a-f]{64}$');
create index if not exists provider_system_reconciliations_latest_idx on public.provider_system_reconciliations (organization_id,provider_relationship_id,system_code,mapping_type,checked_at desc,id desc);
