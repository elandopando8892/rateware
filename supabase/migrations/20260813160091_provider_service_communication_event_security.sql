alter table public.provider_communication_events enable row level security;
revoke all on table public.provider_communication_events from public, anon, authenticated, service_role;
