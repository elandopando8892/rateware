create table if not exists public.provider_health_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, legal_entity_id uuid not null,
  policy_code text not null, policy_name text not null, version integer not null, status text not null default 'draft',
  activation_weight integer not null, documents_weight integer not null, cases_weight integer not null,
  communications_weight integer not null, compliance_weight integer not null, integrations_weight integer not null,
  critical_max integer not null default 49, at_risk_max integer not null default 69, watch_max integer not null default 84,
  hard_blocker_cap integer not null default 25, published_at timestamptz, published_by_user_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.provider_health_policies add constraint provider_health_policies_org_fkey foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.provider_health_policies add constraint provider_health_policies_entity_fkey foreign key (organization_id,legal_entity_id) references public.legal_entities(organization_id,id) on delete restrict;
alter table public.provider_health_policies add constraint provider_health_policies_org_id_unique unique (organization_id,id);
alter table public.provider_health_policies add constraint provider_health_policies_version_unique unique (organization_id,legal_entity_id,policy_code,version);
alter table public.provider_health_policies add constraint provider_health_policies_status_check check (status in ('draft','published','retired'));
alter table public.provider_health_policies add constraint provider_health_policies_weights_check check (activation_weight>=0 and documents_weight>=0 and cases_weight>=0 and communications_weight>=0 and compliance_weight>=0 and integrations_weight>=0 and activation_weight+documents_weight+cases_weight+communications_weight+compliance_weight+integrations_weight=100);
alter table public.provider_health_policies add constraint provider_health_policies_thresholds_check check (critical_max>=0 and critical_max<at_risk_max and at_risk_max<watch_max and watch_max<100);
alter table public.provider_health_policies add constraint provider_health_policies_cap_check check (hard_blocker_cap between 0 and critical_max);
create unique index if not exists provider_health_policies_one_published_idx on public.provider_health_policies(organization_id,legal_entity_id,policy_code) where status='published';
