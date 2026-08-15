-- Provider Service Build 2: Mutual Activation Engine core tables.
-- Additive only. No template seed, vendor backfill, activation, or production mutation.

alter table public.provider_relationships
  add constraint provider_relationships_org_id_entity_unique
  unique (organization_id, id, legal_entity_id);

create table if not exists public.provider_activation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  template_code text not null,
  template_name text not null,
  version integer not null,
  status text not null default 'draft',
  effective_from timestamptz,
  effective_to timestamptz,
  published_at timestamptz,
  published_by_user_id text,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activation_templates_org_id_unique unique (organization_id, id),
  constraint provider_activation_templates_org_id_entity_unique
    unique (organization_id, id, legal_entity_id),
  constraint provider_activation_templates_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_activation_templates_version_unique
    unique (organization_id, legal_entity_id, template_code, version),
  constraint provider_activation_templates_code_check
    check (template_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activation_templates_name_not_blank
    check (btrim(template_name) <> ''),
  constraint provider_activation_templates_version_check check (version > 0),
  constraint provider_activation_templates_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint provider_activation_templates_dates_check
    check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint provider_activation_templates_published_check check (
    status = 'draft'
    or (
      published_at is not null
      and nullif(btrim(coalesce(published_by_user_id, '')), '') is not null
    )
  ),
  constraint provider_activation_templates_retired_check check (
    status <> 'retired' or retired_at is not null
  )
);

create unique index if not exists provider_activation_templates_one_published_idx
  on public.provider_activation_templates (organization_id, legal_entity_id, template_code)
  where status = 'published';

create table if not exists public.provider_activation_template_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  activation_template_id uuid not null,
  track_code text not null,
  requirement_code text not null,
  requirement_name text not null,
  requirement_description text,
  requirement_type text not null default 'other',
  is_required boolean not null default true,
  is_blocking boolean not null default true,
  evidence_required boolean not null default false,
  sequence_number integer not null default 100,
  default_due_days integer,
  default_validity_days integer,
  reviewer_role_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activation_template_requirements_org_id_unique
    unique (organization_id, id),
  constraint provider_activation_template_requirements_template_fkey
    foreign key (organization_id, activation_template_id)
    references public.provider_activation_templates(organization_id, id)
    on delete cascade,
  constraint provider_activation_template_requirements_code_unique
    unique (organization_id, activation_template_id, requirement_code),
  constraint provider_activation_template_requirements_track_check check (
    track_code in (
      'provider_readiness',
      'xbf_customer_setup',
      'commercial_operational_readiness'
    )
  ),
  constraint provider_activation_template_requirements_code_check
    check (requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_activation_template_requirements_name_not_blank
    check (btrim(requirement_name) <> ''),
  constraint provider_activation_template_requirements_type_check
    check (requirement_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activation_template_requirements_blocking_check
    check (not is_blocking or is_required),
  constraint provider_activation_template_requirements_sequence_check
    check (sequence_number > 0),
  constraint provider_activation_template_requirements_due_check
    check (default_due_days is null or default_due_days >= 0),
  constraint provider_activation_template_requirements_validity_check
    check (default_validity_days is null or default_validity_days > 0),
  constraint provider_activation_template_requirements_reviewer_check
    check (
      reviewer_role_code is null
      or reviewer_role_code ~ '^[a-z][a-z0-9_]{1,63}$'
    )
);

create table if not exists public.provider_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  activation_template_id uuid not null,
  template_code_snapshot text not null,
  template_name_snapshot text not null,
  template_version_snapshot integer not null,
  activation_type text not null default 'initial',
  status text not null default 'in_progress',
  opened_by_user_id text,
  activation_owner_user_id text,
  opened_at timestamptz not null default now(),
  ready_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activations_org_id_unique unique (organization_id, id),
  constraint provider_activations_relationship_entity_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_activations_template_entity_fkey
    foreign key (organization_id, activation_template_id, legal_entity_id)
    references public.provider_activation_templates(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_activations_template_code_check
    check (template_code_snapshot ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activations_template_name_not_blank
    check (btrim(template_name_snapshot) <> ''),
  constraint provider_activations_template_version_check
    check (template_version_snapshot > 0),
  constraint provider_activations_type_check
    check (activation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activations_status_check check (
    status in (
      'in_progress',
      'under_review',
      'blocked',
      'ready',
      'activated',
      'cancelled',
      'superseded',
      'closed'
    )
  ),
  constraint provider_activations_ready_at_check check (
    status not in ('ready', 'activated') or ready_at is not null
  ),
  constraint provider_activations_activated_at_check check (
    status <> 'activated' or activated_at is not null
  ),
  constraint provider_activations_closed_at_check check (
    status not in ('cancelled', 'superseded', 'closed') or closed_at is not null
  )
);

create unique index if not exists provider_activations_one_open_relationship_idx
  on public.provider_activations (organization_id, provider_relationship_id)
  where status in ('in_progress', 'under_review', 'blocked', 'ready');

create table if not exists public.provider_activation_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  activation_id uuid not null,
  template_requirement_id uuid not null,
  track_code text not null,
  requirement_code text not null,
  requirement_name text not null,
  requirement_description text,
  requirement_type text not null,
  is_required boolean not null,
  is_blocking boolean not null,
  evidence_required boolean not null,
  sequence_number integer not null,
  validity_days_snapshot integer,
  reviewer_role_code text,
  state text not null default 'pending',
  owner_user_id text,
  state_changed_at timestamptz not null default now(),
  due_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id text,
  satisfied_at timestamptz,
  expires_at timestamptz,
  failure_reason text,
  correction_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activation_requirements_org_activation_id_unique
    unique (organization_id, activation_id, id),
  constraint provider_activation_requirements_activation_fkey
    foreign key (organization_id, activation_id)
    references public.provider_activations(organization_id, id)
    on delete cascade,
  constraint provider_activation_requirements_template_requirement_fkey
    foreign key (organization_id, template_requirement_id)
    references public.provider_activation_template_requirements(organization_id, id)
    on delete restrict,
  constraint provider_activation_requirements_code_unique
    unique (organization_id, activation_id, requirement_code),
  constraint provider_activation_requirements_track_check check (
    track_code in (
      'provider_readiness',
      'xbf_customer_setup',
      'commercial_operational_readiness'
    )
  ),
  constraint provider_activation_requirements_code_check
    check (requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_activation_requirements_name_not_blank
    check (btrim(requirement_name) <> ''),
  constraint provider_activation_requirements_type_check
    check (requirement_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activation_requirements_blocking_check
    check (not is_blocking or is_required),
  constraint provider_activation_requirements_sequence_check
    check (sequence_number > 0),
  constraint provider_activation_requirements_validity_check
    check (validity_days_snapshot is null or validity_days_snapshot > 0),
  constraint provider_activation_requirements_reviewer_check
    check (
      reviewer_role_code is null
      or reviewer_role_code ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
  constraint provider_activation_requirements_state_check check (
    state in (
      'pending',
      'in_progress',
      'submitted',
      'under_review',
      'passed',
      'failed',
      'correction_required',
      'expired',
      'not_applicable'
    )
  ),
  constraint provider_activation_requirements_submitted_check check (
    state <> 'submitted' or submitted_at is not null
  ),
  constraint provider_activation_requirements_satisfied_check check (
    state not in ('passed', 'not_applicable') or satisfied_at is not null
  ),
  constraint provider_activation_requirements_not_applicable_review_check check (
    state <> 'not_applicable'
    or (
      reviewed_at is not null
      and nullif(btrim(coalesce(reviewed_by_user_id, '')), '') is not null
    )
  ),
  constraint provider_activation_requirements_failed_reason_check check (
    state <> 'failed' or nullif(btrim(coalesce(failure_reason, '')), '') is not null
  ),
  constraint provider_activation_requirements_correction_note_check check (
    state <> 'correction_required'
    or nullif(btrim(coalesce(correction_note, '')), '') is not null
  )
);

create table if not exists public.provider_activation_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  activation_id uuid not null,
  activation_requirement_id uuid not null,
  evidence_type text not null,
  source_system text not null,
  source_reference text not null,
  source_url text,
  status text not null default 'active',
  verified_at timestamptz,
  verified_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activation_evidence_links_requirement_fkey
    foreign key (organization_id, activation_id, activation_requirement_id)
    references public.provider_activation_requirements(organization_id, activation_id, id)
    on delete restrict,
  constraint provider_activation_evidence_links_reference_unique
    unique (
      organization_id,
      activation_requirement_id,
      source_system,
      source_reference
    ),
  constraint provider_activation_evidence_links_type_check
    check (evidence_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activation_evidence_links_system_check
    check (source_system ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_activation_evidence_links_reference_not_blank
    check (btrim(source_reference) <> ''),
  constraint provider_activation_evidence_links_status_check
    check (status in ('active', 'revoked', 'superseded'))
);

create table if not exists public.provider_activation_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  activation_id uuid not null,
  scope_type text not null,
  activation_requirement_id uuid,
  track_code text,
  status text not null default 'requested',
  requested_by_user_id text not null,
  requested_at timestamptz not null default now(),
  request_reason text not null,
  decided_by_user_id text,
  decided_at timestamptz,
  decision_note text,
  effective_from timestamptz,
  expires_at timestamptz,
  revoked_by_user_id text,
  revoked_at timestamptz,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_activation_exceptions_org_activation_id_unique
    unique (organization_id, activation_id, id),
  constraint provider_activation_exceptions_activation_fkey
    foreign key (organization_id, activation_id)
    references public.provider_activations(organization_id, id)
    on delete cascade,
  constraint provider_activation_exceptions_requirement_fkey
    foreign key (organization_id, activation_id, activation_requirement_id)
    references public.provider_activation_requirements(organization_id, activation_id, id)
    on delete restrict,
  constraint provider_activation_exceptions_scope_check check (
    (scope_type = 'requirement' and activation_requirement_id is not null and track_code is null)
    or (scope_type = 'track' and activation_requirement_id is null and track_code is not null)
    or (scope_type = 'activation' and activation_requirement_id is null and track_code is null)
  ),
  constraint provider_activation_exceptions_track_check check (
    track_code is null
    or track_code in (
      'provider_readiness',
      'xbf_customer_setup',
      'commercial_operational_readiness'
    )
  ),
  constraint provider_activation_exceptions_status_check check (
    status in ('requested', 'approved', 'rejected', 'revoked', 'expired')
  ),
  constraint provider_activation_exceptions_requester_not_blank
    check (btrim(requested_by_user_id) <> ''),
  constraint provider_activation_exceptions_reason_not_blank
    check (btrim(request_reason) <> ''),
  constraint provider_activation_exceptions_decision_check check (
    status not in ('approved', 'rejected')
    or (
      decided_at is not null
      and nullif(btrim(coalesce(decided_by_user_id, '')), '') is not null
      and nullif(btrim(coalesce(decision_note, '')), '') is not null
    )
  ),
  constraint provider_activation_exceptions_approval_dates_check check (
    status <> 'approved'
    or (
      effective_from is not null
      and expires_at is not null
      and expires_at > effective_from
    )
  ),
  constraint provider_activation_exceptions_revocation_check check (
    status <> 'revoked'
    or (
      revoked_at is not null
      and nullif(btrim(coalesce(revoked_by_user_id, '')), '') is not null
      and nullif(btrim(coalesce(revocation_reason, '')), '') is not null
    )
  )
);

create table if not exists public.provider_activation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  activation_id uuid not null,
  activation_requirement_id uuid,
  activation_exception_id uuid,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service',
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_activation_events_activation_fkey
    foreign key (organization_id, activation_id)
    references public.provider_activations(organization_id, id)
    on delete restrict,
  constraint provider_activation_events_requirement_fkey
    foreign key (organization_id, activation_id, activation_requirement_id)
    references public.provider_activation_requirements(organization_id, activation_id, id)
    on delete restrict,
  constraint provider_activation_events_exception_fkey
    foreign key (organization_id, activation_id, activation_exception_id)
    references public.provider_activation_exceptions(organization_id, activation_id, id)
    on delete restrict,
  constraint provider_activation_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_activation_events_actor_type_check
    check (actor_type in ('user', 'agent', 'system', 'integration')),
  constraint provider_activation_events_source_not_blank
    check (btrim(source) <> '')
);

create index if not exists provider_activation_templates_entity_status_idx
  on public.provider_activation_templates (
    organization_id,
    legal_entity_id,
    status,
    template_code,
    version desc
  );
create index if not exists provider_activation_template_requirements_template_track_idx
  on public.provider_activation_template_requirements (
    activation_template_id,
    track_code,
    sequence_number,
    id
  );
create index if not exists provider_activations_relationship_status_idx
  on public.provider_activations (
    organization_id,
    provider_relationship_id,
    status,
    updated_at desc
  );
create index if not exists provider_activation_requirements_activation_track_idx
  on public.provider_activation_requirements (
    activation_id,
    track_code,
    state,
    sequence_number,
    id
  );
create index if not exists provider_activation_evidence_links_requirement_idx
  on public.provider_activation_evidence_links (
    activation_requirement_id,
    status,
    created_at desc
  );
create index if not exists provider_activation_exceptions_activation_status_idx
  on public.provider_activation_exceptions (
    activation_id,
    status,
    expires_at,
    id
  );
create index if not exists provider_activation_events_activation_created_idx
  on public.provider_activation_events (
    activation_id,
    occurred_at desc,
    id desc
  );
