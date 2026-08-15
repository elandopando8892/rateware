-- Provider Service Build 4: append-only case event target.

create table if not exists public.provider_service_case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service',
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_service_case_events_case_fkey
    foreign key (organization_id, case_id)
    references public.provider_service_cases(organization_id, id)
    on delete restrict,
  constraint provider_service_case_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_service_case_events_actor_check
    check (actor_type in ('user', 'agent', 'system', 'integration')),
  constraint provider_service_case_events_source_not_blank check (btrim(source) <> '')
);

create index if not exists provider_service_case_events_case_created_idx
  on public.provider_service_case_events (case_id, occurred_at desc, id desc);
