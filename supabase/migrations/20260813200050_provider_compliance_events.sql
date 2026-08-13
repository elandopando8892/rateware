create table if not exists public.provider_compliance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  evaluation_id uuid not null,
  rule_result_id uuid,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_compliance_events_evaluation_fkey foreign key (organization_id,evaluation_id) references public.provider_compliance_evaluations(organization_id,id) on delete restrict,
  constraint provider_compliance_events_result_fkey foreign key (organization_id,rule_result_id) references public.provider_compliance_rule_results(organization_id,id) on delete restrict,
  constraint provider_compliance_events_type_check check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_compliance_events_actor_check check (actor_type in ('user','agent','system','integration'))
);
create index if not exists provider_compliance_events_evaluation_idx on public.provider_compliance_events (evaluation_id,occurred_at desc,id desc);
