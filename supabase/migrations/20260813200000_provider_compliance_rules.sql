-- Provider Service Build 9: deterministic compliance rule definitions.
-- evaluator_code names reviewed runtime logic; no dynamic SQL is stored.
create table if not exists public.provider_compliance_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  rule_set_code text not null,
  rule_set_name text not null,
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
  constraint provider_compliance_rule_sets_org_id_unique unique (organization_id,id),
  constraint provider_compliance_rule_sets_org_id_entity_unique unique (organization_id,id,legal_entity_id),
  constraint provider_compliance_rule_sets_entity_fkey foreign key (organization_id,legal_entity_id) references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_compliance_rule_sets_version_unique unique (organization_id,legal_entity_id,rule_set_code,version),
  constraint provider_compliance_rule_sets_code_check check (rule_set_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_compliance_rule_sets_name_not_blank check (btrim(rule_set_name) <> ''),
  constraint provider_compliance_rule_sets_version_check check (version > 0),
  constraint provider_compliance_rule_sets_status_check check (status in ('draft','published','retired')),
  constraint provider_compliance_rule_sets_dates_check check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint provider_compliance_rule_sets_published_check check (status='draft' or (published_at is not null and nullif(btrim(coalesce(published_by_user_id,'')),'') is not null)),
  constraint provider_compliance_rule_sets_retired_check check (status <> 'retired' or retired_at is not null)
);

create unique index if not exists provider_compliance_rule_sets_one_published_idx
  on public.provider_compliance_rule_sets (organization_id,legal_entity_id,rule_set_code)
  where status='published';

create table if not exists public.provider_compliance_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rule_set_id uuid not null,
  rule_code text not null,
  rule_name text not null,
  category text not null,
  severity text not null default 'medium',
  evaluator_code text not null,
  is_required boolean not null default true,
  is_blocking boolean not null default true,
  continuous boolean not null default false,
  recheck_minutes integer,
  sequence_number integer not null default 100,
  evaluator_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_compliance_rules_org_id_unique unique (organization_id,id),
  constraint provider_compliance_rules_rule_set_fkey foreign key (organization_id,rule_set_id) references public.provider_compliance_rule_sets(organization_id,id) on delete cascade,
  constraint provider_compliance_rules_code_unique unique (organization_id,rule_set_id,rule_code),
  constraint provider_compliance_rules_code_check check (rule_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_compliance_rules_name_not_blank check (btrim(rule_name) <> ''),
  constraint provider_compliance_rules_category_check check (category ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_compliance_rules_severity_check check (severity in ('info','low','medium','high','critical')),
  constraint provider_compliance_rules_evaluator_check check (evaluator_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_compliance_rules_blocking_check check (not is_blocking or is_required),
  constraint provider_compliance_rules_recheck_check check ((not continuous and recheck_minutes is null) or (continuous and recheck_minutes is not null and recheck_minutes > 0)),
  constraint provider_compliance_rules_sequence_check check (sequence_number > 0)
);

create index if not exists provider_compliance_rules_set_sequence_idx
  on public.provider_compliance_rules (rule_set_id,sequence_number,id);
