-- Provider Service Build 25: deterministic onboarding readiness evaluations.
create table if not exists public.provider_onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_code text not null,
  requirement_set_version integer not null,
  jurisdiction_code text not null,
  legal_entity_kind text,
  requirement_code text not null,
  requirement_kind text not null,
  fact_field_code text,
  document_type text,
  is_required boolean not null default true,
  max_age_days integer,
  display_order integer not null default 100,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_onboarding_requirements_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_requirements_unique
    unique (organization_id,program_code,requirement_set_version,jurisdiction_code,legal_entity_kind,requirement_code),
  constraint provider_onboarding_requirements_program_check check (program_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_onboarding_requirements_version_check check (requirement_set_version>0),
  constraint provider_onboarding_requirements_jurisdiction_check check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  constraint provider_onboarding_requirements_code_check check (requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_requirements_kind_check check (requirement_kind in ('fact','document')),
  constraint provider_onboarding_requirements_selector_check check (
    (requirement_kind='fact' and fact_field_code is not null and document_type is null)
    or (requirement_kind='document' and document_type is not null and fact_field_code is null)
  ),
  constraint provider_onboarding_requirements_fact_check check (fact_field_code is null or fact_field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_requirements_document_check check (document_type is null or document_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_requirements_age_check check (max_age_days is null or max_age_days>0),
  constraint provider_onboarding_requirements_order_check check (display_order>=0)
);

create table if not exists public.provider_onboarding_readiness_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  program_code text not null,
  requirement_set_version integer not null,
  evaluation_status text not null default 'pending',
  required_count integer not null default 0,
  satisfied_count integer not null default 0,
  missing_count integer not null default 0,
  blocking_count integer not null default 0,
  evidence_snapshot_sha256 text,
  evaluated_by_actor_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_onboarding_readiness_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_readiness_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_onboarding_readiness_program_check check (program_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_onboarding_readiness_version_check check (requirement_set_version>0),
  constraint provider_onboarding_readiness_status_check check (evaluation_status in ('pending','complete','incomplete','blocked','failed')),
  constraint provider_onboarding_readiness_counts_check check (
    required_count>=0 and satisfied_count>=0 and missing_count>=0 and blocking_count>=0
    and satisfied_count+missing_count=required_count
  ),
  constraint provider_onboarding_readiness_hash_check check (evidence_snapshot_sha256 is null or evidence_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_onboarding_readiness_actor_check check (btrim(evaluated_by_actor_id)<>'')
);

create table if not exists public.provider_onboarding_readiness_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  evaluation_id uuid not null,
  requirement_id uuid not null,
  requirement_code text not null,
  result_status text not null,
  matched_fact_id uuid,
  matched_document_asset_id uuid,
  evidence_sha256 text,
  result_reason_code text not null,
  evaluated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_onboarding_readiness_results_eval_fkey foreign key (organization_id,evaluation_id)
    references public.provider_onboarding_readiness_evaluations(organization_id,id) on delete cascade,
  constraint provider_onboarding_readiness_results_req_fkey foreign key (organization_id,requirement_id)
    references public.provider_onboarding_requirements(organization_id,id) on delete restrict,
  constraint provider_onboarding_readiness_results_fact_fkey foreign key (organization_id,matched_fact_id)
    references public.provider_legal_entity_facts(organization_id,id) on delete restrict,
  constraint provider_onboarding_readiness_results_asset_fkey foreign key (organization_id,matched_document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id) on delete restrict,
  constraint provider_onboarding_readiness_results_unique unique (organization_id,evaluation_id,requirement_id),
  constraint provider_onboarding_readiness_results_code_check check (requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_readiness_results_status_check check (result_status in ('satisfied','missing','unverified','expired','withheld','conflict')),
  constraint provider_onboarding_readiness_results_match_check check (not (matched_fact_id is not null and matched_document_asset_id is not null)),
  constraint provider_onboarding_readiness_results_hash_check check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_onboarding_readiness_results_reason_check check (result_reason_code ~ '^[a-z][a-z0-9_]{1,127}$')
);
create index if not exists provider_onboarding_requirements_lookup_idx
  on public.provider_onboarding_requirements
    (organization_id,program_code,requirement_set_version,jurisdiction_code,active,display_order);
create index if not exists provider_onboarding_readiness_history_idx
  on public.provider_onboarding_readiness_evaluations
    (organization_id,legal_entity_id,program_code,started_at desc);
alter table public.provider_onboarding_requirements enable row level security;
alter table public.provider_onboarding_readiness_evaluations enable row level security;
alter table public.provider_onboarding_readiness_results enable row level security;
revoke all on table public.provider_onboarding_requirements from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_readiness_evaluations from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_readiness_results from public,anon,authenticated,service_role;
