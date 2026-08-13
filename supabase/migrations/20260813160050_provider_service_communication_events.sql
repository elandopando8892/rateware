-- Provider Service Build 5: append-only communication event target.
create table if not exists public.provider_communication_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  thread_id uuid not null,
  message_id uuid,
  case_link_id uuid,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service',
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_communication_events_thread_fkey foreign key (organization_id, thread_id) references public.provider_communication_threads(organization_id, id) on delete restrict,
  constraint provider_communication_events_message_fkey foreign key (organization_id, message_id) references public.provider_communication_messages(organization_id, id) on delete restrict,
  constraint provider_communication_events_case_link_fkey foreign key (organization_id, case_link_id) references public.provider_communication_case_links(organization_id, id) on delete restrict,
  constraint provider_communication_events_type_check check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_communication_events_actor_check check (actor_type in ('user','agent','system','integration')),
  constraint provider_communication_events_source_not_blank check (btrim(source) <> '')
);
create index if not exists provider_communication_events_thread_created_idx on public.provider_communication_events (thread_id, occurred_at desc, id desc);
