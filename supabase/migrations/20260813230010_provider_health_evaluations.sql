create table if not exists public.provider_health_evaluations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, provider_relationship_id uuid not null, legal_entity_id uuid not null,
  policy_id uuid not null, policy_code_snapshot text not null, policy_version_snapshot integer not null,
  health_score numeric(5,2) not null, health_state text not null,
  activation_score numeric(5,2) not null, documents_score numeric(5,2) not null, cases_score numeric(5,2) not null,
  communications_score numeric(5,2) not null, compliance_score numeric(5,2) not null, integrations_score numeric(5,2) not null,
  hard_blocker boolean not null default false, blocker_codes text[] not null default '{}', signal_snapshot jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.provider_health_evaluations add constraint provider_health_evaluations_org_fkey foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.provider_health_evaluations add constraint provider_health_evaluations_relationship_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id) references public.provider_relationships(organization_id,id,legal_entity_id) on delete restrict;
alter table public.provider_health_evaluations add constraint provider_health_evaluations_policy_fkey foreign key (organization_id,policy_id) references public.provider_health_policies(organization_id,id) on delete restrict;
alter table public.provider_health_evaluations add constraint provider_health_evaluations_state_check check (health_state in ('healthy','watch','at_risk','critical','unknown'));
alter table public.provider_health_evaluations add constraint provider_health_evaluations_score_check check (health_score between 0 and 100 and activation_score between 0 and 100 and documents_score between 0 and 100 and cases_score between 0 and 100 and communications_score between 0 and 100 and compliance_score between 0 and 100 and integrations_score between 0 and 100);
create index if not exists provider_health_evaluations_relationship_idx on public.provider_health_evaluations(provider_relationship_id,evaluated_at desc,id desc);
