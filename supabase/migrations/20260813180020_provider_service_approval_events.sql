create table if not exists public.provider_approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  approval_request_id uuid not null,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_approval_events_request_fkey foreign key (organization_id,approval_request_id) references public.provider_approval_requests(organization_id,id) on delete restrict,
  constraint provider_approval_events_type_check check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_approval_events_actor_check check (actor_type in ('user','agent','system','integration'))
);
create index if not exists provider_approval_events_request_idx on public.provider_approval_events (approval_request_id,occurred_at desc,id desc);
