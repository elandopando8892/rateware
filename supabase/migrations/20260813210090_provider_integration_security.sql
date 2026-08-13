alter table public.provider_system_links enable row level security;
alter table public.provider_sync_commands enable row level security;
alter table public.provider_sync_receipts enable row level security;
alter table public.provider_system_reconciliations enable row level security;
alter table public.provider_system_activation_links enable row level security;
alter table public.provider_integration_action_policies enable row level security;

revoke all on table public.provider_system_links from public,anon,authenticated,service_role;
revoke all on table public.provider_sync_commands from public,anon,authenticated,service_role;
revoke all on table public.provider_sync_receipts from public,anon,authenticated,service_role;
revoke all on table public.provider_system_reconciliations from public,anon,authenticated,service_role;
revoke all on table public.provider_system_activation_links from public,anon,authenticated,service_role;
revoke all on table public.provider_integration_action_policies from public,anon,authenticated,service_role;
