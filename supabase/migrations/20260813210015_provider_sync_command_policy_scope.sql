alter table public.provider_sync_commands add column integration_policy_id uuid;
alter table public.provider_sync_commands add constraint provider_sync_commands_policy_fkey foreign key (organization_id,integration_policy_id) references public.provider_integration_action_policies(organization_id,id) on delete restrict;
alter table public.provider_sync_commands add constraint provider_sync_commands_policy_required_check check (integration_policy_id is not null);
