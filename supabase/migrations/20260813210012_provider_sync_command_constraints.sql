alter table public.provider_sync_commands add constraint provider_sync_commands_org_id_unique unique (organization_id,id);
alter table public.provider_sync_commands add constraint provider_sync_commands_relationship_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id) references public.provider_relationships(organization_id,id,legal_entity_id) on delete restrict;
alter table public.provider_sync_commands add constraint provider_sync_commands_idempotency_unique unique (organization_id,idempotency_key);
alter table public.provider_sync_commands add constraint provider_sync_commands_system_check check (system_code ~ '^[a-z][a-z0-9_]{1,63}$');
alter table public.provider_sync_commands add constraint provider_sync_commands_action_check check (action_code ~ '^[a-z][a-z0-9_]{1,127}$');
alter table public.provider_sync_commands add constraint provider_sync_commands_idempotency_check check (idempotency_key ~ '^[0-9a-f]{64}$');
alter table public.provider_sync_commands add constraint provider_sync_commands_status_check check (status in ('pending','processing','succeeded','failed','cancelled'));
alter table public.provider_sync_commands add constraint provider_sync_commands_attempt_check check (attempt_count >= 0);
