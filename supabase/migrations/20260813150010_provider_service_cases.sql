-- Provider Service Build 4: durable Provider Service cases.

create table if not exists public.provider_service_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  legal_entity_code text not null,
  case_number bigint generated always as identity,
  case_code text generated always as (
    'PSC-' || legal_entity_code || '-' || lpad(case_number::text, 6, '0')
  ) stored,
  case_type text not null,
  case_category text not null default 'other',
  subject text not null,
  description text,
  status text not null default 'new',
  priority text not null default 'normal',
  sensitivity text not null default 'internal',
  source_channel text not null default 'manual',
  owner_user_id text,
  policy_id uuid,
  policy_version_snapshot integer,
  first_response_minutes_snapshot integer,
  resolution_minutes_snapshot integer,
  opened_by_actor_type text not null default 'user',
  opened_by_user_id text,
  opened_at timestamptz not null default now(),
  first_response_due_at timestamptz,
  first_responded_at timestamptz,
  resolution_due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  blocked_reason text,
  escalation_level integer not null default 0,
  escalation_reason text,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_cases_org_id_unique unique (organization_id, id),
  constraint provider_service_cases_org_id_rel_entity_unique
    unique (organization_id, id, provider_relationship_id, legal_entity_id),
  constraint provider_service_cases_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_service_cases_entity_code_fkey
    foreign key (organization_id, legal_entity_id, legal_entity_code)
    references public.legal_entities(organization_id, id, entity_code)
    on delete restrict,
  constraint provider_service_cases_policy_fkey
    foreign key (organization_id, policy_id, legal_entity_id)
    references public.provider_service_case_policies(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_service_cases_code_unique unique (organization_id, case_code),
  constraint provider_service_cases_entity_code_check check (legal_entity_code ~ '^[A-Z0-9]{2,16}$'),
  constraint provider_service_cases_type_check check (case_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_service_cases_category_check
    check (case_category in ('onboarding', 'credit', 'documents', 'compliance', 'finance', 'operations', 'commercial', 'risk', 'access', 'other')),
  constraint provider_service_cases_subject_not_blank check (btrim(subject) <> ''),
  constraint provider_service_cases_status_check
    check (status in ('new', 'open', 'waiting_provider', 'waiting_xbf', 'waiting_external', 'blocked', 'escalated', 'resolved', 'closed', 'cancelled')),
  constraint provider_service_cases_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent', 'critical')),
  constraint provider_service_cases_sensitivity_check
    check (sensitivity in ('public', 'internal', 'confidential', 'restricted', 'highly_restricted')),
  constraint provider_service_cases_source_check
    check (source_channel in ('manual', 'email', 'portal', 'agent', 'api', 'integration', 'other')),
  constraint provider_service_cases_actor_check
    check (opened_by_actor_type in ('user', 'agent', 'system', 'integration')),
  constraint provider_service_cases_policy_version_check
    check (policy_version_snapshot is null or policy_version_snapshot > 0),
  constraint provider_service_cases_first_response_minutes_check
    check (first_response_minutes_snapshot is null or first_response_minutes_snapshot > 0),
  constraint provider_service_cases_resolution_minutes_check
    check (resolution_minutes_snapshot is null or resolution_minutes_snapshot > 0),
  constraint provider_service_cases_escalation_level_check check (escalation_level between 0 and 5),
  constraint provider_service_cases_escalation_reason_check
    check (escalation_level = 0 or nullif(btrim(coalesce(escalation_reason, '')), '') is not null),
  constraint provider_service_cases_blocked_reason_check
    check (status <> 'blocked' or nullif(btrim(coalesce(blocked_reason, '')), '') is not null),
  constraint provider_service_cases_resolved_check check (status <> 'resolved' or resolved_at is not null),
  constraint provider_service_cases_closed_check
    check (status not in ('closed', 'cancelled') or closed_at is not null),
  constraint provider_service_cases_response_dates_check
    check (first_responded_at is null or first_responded_at >= opened_at),
  constraint provider_service_cases_resolution_dates_check
    check (resolved_at is null or resolved_at >= opened_at),
  constraint provider_service_cases_close_dates_check
    check (closed_at is null or closed_at >= opened_at)
);

create index if not exists provider_service_cases_relationship_status_idx
  on public.provider_service_cases (
    organization_id,
    provider_relationship_id,
    status,
    priority,
    updated_at desc
  );
create index if not exists provider_service_cases_owner_status_idx
  on public.provider_service_cases (organization_id, owner_user_id, status, priority, updated_at desc);
create index if not exists provider_service_cases_response_due_idx
  on public.provider_service_cases (organization_id, first_response_due_at, status)
  where first_responded_at is null and first_response_due_at is not null;
create index if not exists provider_service_cases_resolution_due_idx
  on public.provider_service_cases (organization_id, resolution_due_at, status)
  where resolved_at is null and resolution_due_at is not null;
