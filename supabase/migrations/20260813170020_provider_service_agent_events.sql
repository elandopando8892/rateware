create table if not exists public.provider_agent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  agent_run_id uuid not null,
  action_proposal_id uuid,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service_agent',
  correlation_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_agent_events_run_fkey foreign key (organization_id,agent_run_id) references public.provider_agent_runs(organization_id,id) on delete restrict,
  constraint provider_agent_events_action_fkey foreign key (organization_id,action_proposal_id) references public.provider_agent_action_proposals(organization_id,id) on delete restrict,
  constraint provider_agent_events_type_check check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_agent_events_actor_check check (actor_type in ('user','agent','system','integration')),
  constraint provider_agent_events_source_not_blank check (btrim(source) <> '')
);
create index if not exists provider_agent_events_run_created_idx on public.provider_agent_events (agent_run_id,occurred_at desc,id desc);
