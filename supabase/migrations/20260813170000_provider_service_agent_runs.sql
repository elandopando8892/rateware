-- Provider Service Build 6: API-independent agent run and context ledger.
create table if not exists public.provider_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  provider_relationship_id uuid,
  thread_id uuid,
  case_id uuid,
  activation_id uuid,
  run_mode text not null default 'manual',
  runtime_type text not null default 'deterministic',
  status text not null default 'created',
  initiated_by_actor_type text not null default 'user',
  initiated_by_user_id text,
  correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_agent_runs_org_id_unique unique (organization_id, id),
  constraint provider_agent_runs_entity_fkey foreign key (organization_id, legal_entity_id) references public.legal_entities(organization_id, id) on delete restrict,
  constraint provider_agent_runs_relationship_fkey foreign key (organization_id, provider_relationship_id, legal_entity_id) references public.provider_relationships(organization_id, id, legal_entity_id) on delete restrict,
  constraint provider_agent_runs_thread_fkey foreign key (organization_id, thread_id, legal_entity_id) references public.provider_communication_threads(organization_id, id, legal_entity_id) on delete restrict,
  constraint provider_agent_runs_case_fkey foreign key (organization_id, case_id, provider_relationship_id, legal_entity_id) references public.provider_service_cases(organization_id, id, provider_relationship_id, legal_entity_id) on delete restrict,
  constraint provider_agent_runs_activation_fkey foreign key (organization_id, activation_id, provider_relationship_id, legal_entity_id) references public.provider_activations(organization_id, id, provider_relationship_id, legal_entity_id) on delete restrict,
  constraint provider_agent_runs_mode_check check (run_mode in ('intake','case','activation','follow_up','manual')),
  constraint provider_agent_runs_runtime_check check (runtime_type in ('deterministic','openai_agents_sdk')),
  constraint provider_agent_runs_status_check check (status in ('created','planning','awaiting_approval','ready','completed','failed','cancelled')),
  constraint provider_agent_runs_actor_check check (initiated_by_actor_type in ('user','agent','system','integration')),
  constraint provider_agent_runs_case_scope_check check (case_id is null or provider_relationship_id is not null),
  constraint provider_agent_runs_activation_scope_check check (activation_id is null or provider_relationship_id is not null),
  constraint provider_agent_runs_completed_check check (status not in ('completed','failed','cancelled') or completed_at is not null),
  constraint provider_agent_runs_failure_check check (status <> 'failed' or nullif(btrim(coalesce(failure_message,'')),'') is not null)
);

create table if not exists public.provider_agent_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  agent_run_id uuid not null,
  schema_version integer not null default 1,
  context_sha256 text not null,
  context_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint provider_agent_context_snapshots_run_fkey foreign key (organization_id, agent_run_id) references public.provider_agent_runs(organization_id, id) on delete cascade,
  constraint provider_agent_context_snapshots_run_unique unique (organization_id, agent_run_id),
  constraint provider_agent_context_snapshots_schema_check check (schema_version > 0),
  constraint provider_agent_context_snapshots_sha_check check (context_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists provider_agent_runs_work_idx on public.provider_agent_runs (organization_id, legal_entity_id, status, created_at desc);
