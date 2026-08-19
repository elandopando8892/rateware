-- Operator override: waive a specific onboarding requirement, on the record.
--
-- WHY THIS EXISTS
--
-- Readiness is deliberately unforgiving: a requirement is satisfied only by current,
-- verified evidence. Real onboarding does not always clear that bar. The XBF/Salzillo
-- case is the shape of it: the address proof exists at the correct fiscal domicile but
-- is issued to the landlord, and the bank statement for the operating entity does not
-- exist yet. Neither is a system defect and neither can be fixed by re-running anything.
-- Without an override the case cannot progress, so the work leaves the platform and
-- happens in somebody's mailbox -- exactly the outcome this product exists to prevent.
--
-- WHAT A WAIVER IS NOT
--
-- A waiver never manufactures evidence. It attaches no fact and no document, and it
-- carries no evidence hash: there is nothing to hash, because nothing was produced.
-- A waived requirement is recorded as 'waived', never as 'satisfied', and an evaluation
-- carrying one is 'complete_with_waivers', never 'complete'. Downstream code must
-- therefore opt in to accepting waivers; it cannot mistake one for evidence.
--
-- Every waiver is attributable (who), justified (why), scoped (which requirement, which
-- entity, which requirement-set version) and expiring (until when). A waiver that never
-- expired would silently become policy.

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
  -- What is being accepted instead, in the operator's words. Free text on purpose:
  -- the substitute is often a combination no schema anticipates ("landlord utility
  -- bill plus executed lease naming the tenant").
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
  -- A justification long enough to mean something. "ok" is not a reason.
  constraint provider_onboarding_waivers_justification_check check (length(btrim(justification))>=20),
  constraint provider_onboarding_waivers_actor_check check (btrim(authorized_by_actor_id)<>''),
  constraint provider_onboarding_waivers_expiry_check check (expires_at>authorized_at),
  constraint provider_onboarding_waivers_revocation_check check (
    (waiver_status<>'revoked' and revoked_at is null and revoked_by_actor_id is null)
    or (waiver_status='revoked' and revoked_at is not null and btrim(coalesce(revoked_by_actor_id,''))<>''
        and length(btrim(coalesce(revocation_reason,'')))>=10)
  )
);

-- One live waiver per requirement per entity. Re-deciding means revoking and issuing a
-- new one, so the history stays readable rather than accumulating silent duplicates.
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

-- 'complete_with_waivers' is a distinct status, not a flavour of 'complete'. Anything
-- that today accepts only 'complete' keeps refusing waived evaluations until its author
-- decides otherwise, which is the safe default.
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

-- A waived requirement travels in the release package as a declared gap: the recipient
-- is told the requirement was not met and what was accepted instead. Suppressing it
-- would let a package read as complete when it is not.
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

-- A declared gap has no evidence, so it has no hash. Every other kind still must.
--
-- The IS NOT NULL below is load-bearing, not belt-and-braces. Dropping the column's
-- NOT NULL is what makes a gap expressible, and `null ~ '...'` evaluates to NULL rather
-- than false -- a CHECK only rejects on false, so without it a document row with no hash
-- would pass. A probe against the live table caught exactly that.
alter table public.provider_onboarding_release_package_items
  alter column evidence_sha256 drop not null;
alter table public.provider_onboarding_release_package_items
  drop constraint if exists provider_release_package_items_hash_check;
alter table public.provider_onboarding_release_package_items
  add constraint provider_release_package_items_hash_check check (
    (item_kind='declared_gap' and evidence_sha256 is null)
    or (item_kind<>'declared_gap' and evidence_sha256 is not null
        and evidence_sha256 ~ '^[0-9a-f]{64}$')
  );

alter table public.provider_onboarding_requirement_waivers enable row level security;
revoke all on table public.provider_onboarding_requirement_waivers from public,anon,authenticated,service_role;
grant select,insert,update on table public.provider_onboarding_requirement_waivers to service_role;
