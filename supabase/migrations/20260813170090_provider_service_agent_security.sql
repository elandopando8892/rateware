alter table public.provider_agent_runs enable row level security;
alter table public.provider_agent_context_snapshots enable row level security;
alter table public.provider_agent_action_proposals enable row level security;
alter table public.provider_agent_events enable row level security;
revoke all on table public.provider_agent_runs from public, anon, authenticated, service_role;
revoke all on table public.provider_agent_context_snapshots from public, anon, authenticated, service_role;
revoke all on table public.provider_agent_action_proposals from public, anon, authenticated, service_role;
revoke all on table public.provider_agent_events from public, anon, authenticated, service_role;
