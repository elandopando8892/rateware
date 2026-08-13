alter table public.provider_compliance_rules add constraint provider_compliance_rules_org_id_set_unique unique (organization_id,id,rule_set_id);

create table if not exists public.provider_compliance_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  rule_set_id uuid not null,
  rule_set_code_snapshot text not null,
  rule_set_name_snapshot text not null,
  rule_set_version_snapshot integer not null,
  evaluation_type text not null default 'initial',
  status text not null default 'pending',
  initiated_by_actor_type text not null default 'system',
  initiated_by_user_id text,
  correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz,
  completed_at timestamptz,
  valid_until timestamptz,
  next_review_at timestamptz,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_compliance_evaluations_org_id_unique unique (organization_id,id),
  constraint provider_compliance_evaluations_org_id_set_unique unique (organization_id,id,rule_set_id),
  constraint provider_compliance_evaluations_org_rel_entity_unique unique (organization_id,id,provider_relationship_id,legal_entity_id),
  constraint provider_compliance_evaluations_relationship_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id) references public.provider_relationships(organization_id,id,legal_entity_id) on delete restrict,
  constraint provider_compliance_evaluations_rule_set_fkey foreign key (organization_id,rule_set_id,legal_entity_id) references public.provider_compliance_rule_sets(organization_id,id,legal_entity_id) on delete restrict,
  constraint provider_compliance_evaluations_code_check check (rule_set_code_snapshot ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_compliance_evaluations_name_not_blank check (btrim(rule_set_name_snapshot) <> ''),
  constraint provider_compliance_evaluations_version_check check (rule_set_version_snapshot > 0),
  constraint provider_compliance_evaluations_type_check check (evaluation_type in ('initial','manual_review','continuous','recheck','reactivation')),
  constraint provider_compliance_evaluations_status_check check (status in ('pending','running','review_required','compliant','non_compliant','error','cancelled')),
  constraint provider_compliance_evaluations_actor_check check (initiated_by_actor_type in ('user','agent','system','integration')),
  constraint provider_compliance_evaluations_completed_check check (status not in ('compliant','non_compliant','error','cancelled') or completed_at is not null),
  constraint provider_compliance_evaluations_failure_check check (status <> 'error' or nullif(btrim(coalesce(failure_message,'')),'') is not null)
);

create unique index if not exists provider_compliance_evaluations_one_open_idx
  on public.provider_compliance_evaluations (organization_id,provider_relationship_id,rule_set_id)
  where status in ('pending','running','review_required');
