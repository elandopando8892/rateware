create table if not exists public.provider_onboarding_requirement_waivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  requirement_id uuid not null,
  requirement_code text not null,
  program_code text not null,
  requirement_set_version integer not null,
  waiver_status text not null default 'active',
  justification text not null,
  substitute_reference text,
  authorized_by_actor_id text not null,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_actor_id text,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_onboarding_waivers_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_waivers_entity_fkey foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id) on delete restrict,
  constraint provider_onboarding_waivers_req_fkey foreign key (organization_id,requirement_id)
    references public.provider_onboarding_requirements(organization_id,id) on delete restrict,
  constraint provider_onboarding_waivers_status_check check (waiver_status in ('active','revoked','expired')),
  constraint provider_onboarding_waivers_code_check check (requirement_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_waivers_program_check check (program_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_onboarding_waivers_version_check check (requirement_set_version>0),
  constraint provider_onboarding_waivers_justification_check check (length(btrim(justification))>=20),
  constraint provider_onboarding_waivers_actor_check check (btrim(authorized_by_actor_id)<>''),
  constraint provider_onboarding_waivers_expiry_check check (expires_at>authorized_at),
  constraint provider_onboarding_waivers_revocation_check check (
    (waiver_status<>'revoked' and revoked_at is null and revoked_by_actor_id is null)
    or (waiver_status='revoked' and revoked_at is not null and btrim(coalesce(revoked_by_actor_id,''))<>''
        and length(btrim(coalesce(revocation_reason,'')))>=10)
  )
);

create unique index if not exists provider_onboarding_waivers_active_unique
  on public.provider_onboarding_requirement_waivers (organization_id,legal_entity_id,requirement_id)
  where waiver_status='active';
create index if not exists provider_onboarding_waivers_lookup_idx
  on public.provider_onboarding_requirement_waivers
    (organization_id,legal_entity_id,program_code,requirement_set_version,waiver_status);

alter table public.provider_onboarding_readiness_evaluations
  add column if not exists waived_count integer not null default 0;

alter table public.provider_onboarding_readiness_evaluations
  drop constraint if exists provider_onboarding_readiness_counts_check;
alter table public.provider_onboarding_readiness_evaluations
  add constraint provider_onboarding_readiness_counts_check check (
    required_count>=0 and satisfied_count>=0 and missing_count>=0
    and blocking_count>=0 and waived_count>=0
    and satisfied_count+missing_count+waived_count=required_count
  );

alter table public.provider_onboarding_readiness_evaluations
  drop constraint if exists provider_onboarding_readiness_status_check;
alter table public.provider_onboarding_readiness_evaluations
  add constraint provider_onboarding_readiness_status_check check (
    evaluation_status in ('pending','complete','complete_with_waivers','incomplete','blocked','failed')
  );

alter table public.provider_onboarding_readiness_results
  drop constraint if exists provider_onboarding_readiness_results_status_check;
alter table public.provider_onboarding_readiness_results
  add constraint provider_onboarding_readiness_results_status_check check (
    result_status in ('satisfied','missing','unverified','expired','withheld','conflict','waived')
  );

alter table public.provider_onboarding_release_package_items
  drop constraint if exists provider_release_package_items_kind_check;
alter table public.provider_onboarding_release_package_items
  add constraint provider_release_package_items_kind_check check (item_kind in ('fact','document','declared_gap'));

alter table public.provider_onboarding_release_package_items
  drop constraint if exists provider_release_package_items_source_check;
alter table public.provider_onboarding_release_package_items
  add constraint provider_release_package_items_source_check check (
    (item_kind='fact' and source_fact_id is not null and source_document_asset_id is null)
    or (item_kind='document' and source_document_asset_id is not null and source_fact_id is null)
    or (item_kind='declared_gap' and source_fact_id is null and source_document_asset_id is null)
  );

alter table public.provider_onboarding_release_package_items
  alter column evidence_sha256 drop not null;
alter table public.provider_onboarding_release_package_items
  drop constraint if exists provider_release_package_items_hash_check;
alter table public.provider_onboarding_release_package_items
  add constraint provider_release_package_items_hash_check check (
    (item_kind='declared_gap' and evidence_sha256 is null)
    or (item_kind<>'declared_gap' and evidence_sha256 ~ '^[0-9a-f]{64}$')
  );

alter table public.provider_onboarding_requirement_waivers enable row level security;
revoke all on table public.provider_onboarding_requirement_waivers from public,anon,authenticated,service_role;
grant select,insert,update on table public.provider_onboarding_requirement_waivers to service_role;;
