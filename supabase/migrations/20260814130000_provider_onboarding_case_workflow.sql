-- Provider Service Build 26: onboarding case workflow and task ledger.
create table if not exists public.provider_onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  external_party_key text not null,
  program_code text not null,
  jurisdiction_code text not null,
  legal_entity_kind text,
  case_status text not null default 'draft',
  revision integer not null default 1,
  owner_user_id text,
  current_readiness_evaluation_id uuid,
  opened_by_actor_id text not null,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  ready_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_onboarding_cases_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_cases_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_onboarding_cases_readiness_fkey foreign key (organization_id,current_readiness_evaluation_id)
    references public.provider_onboarding_readiness_evaluations(organization_id,id) on delete restrict,
  constraint provider_onboarding_cases_party_check check (external_party_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$'),
  constraint provider_onboarding_cases_program_check check (program_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_onboarding_cases_jurisdiction_check check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  constraint provider_onboarding_cases_status_check check (case_status in (
    'draft','evidence_collection','human_review','readiness_check',
    'blocked','ready_for_approval','cancelled','closed'
  )),
  constraint provider_onboarding_cases_revision_check check (revision>0),
  constraint provider_onboarding_cases_actor_check check (btrim(opened_by_actor_id)<>''),
  constraint provider_onboarding_cases_due_check check (due_at is null or due_at>opened_at),
  constraint provider_onboarding_cases_ready_check check (ready_at is null or case_status in ('ready_for_approval','closed')),
  constraint provider_onboarding_cases_closed_check check (closed_at is null or case_status in ('cancelled','closed'))
);
create unique index if not exists provider_onboarding_cases_active_unique
  on public.provider_onboarding_cases (organization_id,legal_entity_id,external_party_key,program_code)
  where case_status not in ('cancelled','closed');
create index if not exists provider_onboarding_cases_pipeline_idx
  on public.provider_onboarding_cases (organization_id,case_status,due_at,updated_at desc);

create table if not exists public.provider_onboarding_case_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  task_type text not null,
  task_key text not null,
  task_status text not null default 'open',
  requirement_code text,
  assigned_user_id text,
  blocking boolean not null default true,
  source_readiness_result_id uuid,
  completed_by_actor_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint provider_onboarding_case_tasks_case_fkey foreign key (organization_id,case_id)
    references public.provider_onboarding_cases(organization_id,id) on delete cascade,
  constraint provider_onboarding_case_tasks_result_fkey foreign key (source_readiness_result_id)
    references public.provider_onboarding_readiness_results(id) on delete restrict,
  constraint provider_onboarding_case_tasks_unique unique (organization_id,case_id,task_key),
  constraint provider_onboarding_case_tasks_type_check check (task_type in (
    'collect_fact','collect_document','verify_document','resolve_conflict',
    'refresh_evidence','run_human_review','rerun_readiness','approve_package'
  )),
  constraint provider_onboarding_case_tasks_key_check check (task_key ~ '^[a-z][a-z0-9_:.-]{1,191}$'),
  constraint provider_onboarding_case_tasks_status_check check (task_status in ('open','in_progress','completed','cancelled')),
  constraint provider_onboarding_case_tasks_requirement_check check (requirement_code is null or requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_case_tasks_completion_check check (
    task_status not in ('completed','cancelled') or completed_at is not null
  ),
  constraint provider_onboarding_case_tasks_started_check check (started_at is null or started_at>=created_at),
  constraint provider_onboarding_case_tasks_due_check check (due_at is null or due_at>created_at)
);
create index if not exists provider_onboarding_case_tasks_queue_idx
  on public.provider_onboarding_case_tasks (organization_id,task_status,blocking,due_at,created_at);

create table if not exists public.provider_onboarding_case_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  event_type text not null,
  previous_revision integer,
  revision integer not null,
  actor_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_onboarding_case_events_case_fkey foreign key (organization_id,case_id)
    references public.provider_onboarding_cases(organization_id,id) on delete restrict,
  constraint provider_onboarding_case_events_type_check check (event_type in (
    'case_opened','readiness_attached','tasks_reconciled','case_status_changed','case_cancelled'
  )),
  constraint provider_onboarding_case_events_revision_check check (
    revision>0 and (previous_revision is null or revision>=previous_revision)
  ),
  constraint provider_onboarding_case_events_actor_check check (btrim(actor_id)<>'')
);
create index if not exists provider_onboarding_case_events_timeline_idx
  on public.provider_onboarding_case_events (organization_id,case_id,occurred_at,id);
alter table public.provider_onboarding_cases enable row level security;
alter table public.provider_onboarding_case_tasks enable row level security;
alter table public.provider_onboarding_case_events enable row level security;
revoke all on table public.provider_onboarding_cases from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_case_tasks from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_case_events from public,anon,authenticated,service_role;
