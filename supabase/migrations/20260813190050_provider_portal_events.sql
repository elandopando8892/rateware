create table if not exists public.provider_portal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitation_id uuid not null,
  event_type text not null,
  actor_type text not null default 'external',
  actor_reference text,
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_portal_events_invitation_fkey
    foreign key (organization_id,invitation_id)
    references public.provider_portal_invitations(organization_id,id)
    on delete restrict,
  constraint provider_portal_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_portal_events_actor_check
    check (actor_type in ('external','user','agent','system','integration'))
);
create index if not exists provider_portal_events_invitation_idx
  on public.provider_portal_events (invitation_id,occurred_at desc,id desc);
