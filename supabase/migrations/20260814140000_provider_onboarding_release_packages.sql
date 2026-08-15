-- Provider Service Build 27: controlled release-package approval without delivery authority.
create table if not exists public.provider_onboarding_release_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  readiness_evaluation_id uuid not null,
  package_version integer not null default 1,
  package_status text not null default 'draft',
  revision integer not null default 1,
  purpose_code text not null,
  recipient_key text not null,
  required_approval_count integer not null default 1,
  manifest_sha256 text,
  requested_by_actor_id text not null,
  requested_at timestamptz,
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_release_packages_org_id_unique unique (organization_id,id),
  constraint provider_release_packages_case_fkey foreign key (organization_id,case_id)
    references public.provider_onboarding_cases(organization_id,id) on delete restrict,
  constraint provider_release_packages_readiness_fkey foreign key (organization_id,readiness_evaluation_id)
    references public.provider_onboarding_readiness_evaluations(organization_id,id) on delete restrict,
  constraint provider_release_packages_case_version_unique unique (organization_id,case_id,package_version),
  constraint provider_release_packages_version_check check (package_version>0 and revision>0),
  constraint provider_release_packages_status_check check (package_status in (
    'draft','pending_approval','approved','rejected','revoked','expired'
  )),
  constraint provider_release_packages_purpose_check check (purpose_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_release_packages_recipient_check check (recipient_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:@-]{1,191}$'),
  constraint provider_release_packages_approval_count_check check (required_approval_count between 1 and 3),
  constraint provider_release_packages_hash_check check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_release_packages_requester_check check (btrim(requested_by_actor_id)<>''),
  constraint provider_release_packages_pending_check check (
    package_status='draft' or (requested_at is not null and manifest_sha256 is not null)
  ),
  constraint provider_release_packages_approved_check check (
    package_status<>'approved' or (approved_at is not null and expires_at is not null and expires_at>approved_at)
  ),
  constraint provider_release_packages_revoked_check check (
    package_status<>'revoked' or (revoked_at is not null and revocation_reason_code is not null)
  )
);

create table if not exists public.provider_onboarding_release_package_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null,
  item_key text not null,
  item_kind text not null,
  source_fact_id uuid,
  source_document_asset_id uuid,
  disclosure_mode text not null,
  sensitivity text not null,
  evidence_sha256 text not null,
  included_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_release_package_items_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete cascade,
  constraint provider_release_package_items_fact_fkey foreign key (organization_id,source_fact_id)
    references public.provider_legal_entity_facts(organization_id,id) on delete restrict,
  constraint provider_release_package_items_asset_fkey foreign key (organization_id,source_document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id) on delete restrict,
  constraint provider_release_package_items_unique unique (organization_id,package_id,item_key),
  constraint provider_release_package_items_key_check check (item_key ~ '^[a-z][a-z0-9_:.-]{1,191}$'),
  constraint provider_release_package_items_kind_check check (item_kind in ('fact','document')),
  constraint provider_release_package_items_source_check check (
    (item_kind='fact' and source_fact_id is not null and source_document_asset_id is null)
    or (item_kind='document' and source_document_asset_id is not null and source_fact_id is null)
  ),
  constraint provider_release_package_items_disclosure_check check (disclosure_mode in ('reference_only','redacted','full')),
  constraint provider_release_package_items_sensitivity_check check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_release_package_items_hash_check check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_release_package_items_restricted_check check (
    sensitivity not in ('restricted','highly_restricted') or disclosure_mode<>'full'
  )
);

create table if not exists public.provider_onboarding_release_package_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null,
  package_revision integer not null,
  requested_by_actor_id text not null,
  approver_actor_id text not null,
  approval_role text not null,
  decision text not null,
  decision_note text not null,
  decided_at timestamptz not null default now(),
  constraint provider_release_package_approvals_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete restrict,
  constraint provider_release_package_approvals_unique unique (organization_id,package_id,approver_actor_id),
  constraint provider_release_package_approvals_revision_check check (package_revision>0),
  constraint provider_release_package_approvals_separation_check check (requested_by_actor_id<>approver_actor_id),
  constraint provider_release_package_approvals_role_check check (approval_role in ('operations','compliance','data_owner','legal')),
  constraint provider_release_package_approvals_decision_check check (decision in ('approved','rejected')),
  constraint provider_release_package_approvals_note_check check (btrim(decision_note)<>'')
);

create table if not exists public.provider_onboarding_release_package_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null,
  event_type text not null,
  previous_revision integer,
  revision integer not null,
  actor_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_release_package_events_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete restrict,
  constraint provider_release_package_events_type_check check (event_type in (
    'package_created','package_submitted_for_approval','package_approved',
    'package_rejected','package_revoked','package_expired'
  )),
  constraint provider_release_package_events_revision_check check (
    revision>0 and (previous_revision is null or revision>=previous_revision)
  ),
  constraint provider_release_package_events_actor_check check (btrim(actor_id)<>'')
);
create index if not exists provider_release_packages_queue_idx
  on public.provider_onboarding_release_packages (organization_id,package_status,created_at);
create index if not exists provider_release_package_events_timeline_idx
  on public.provider_onboarding_release_package_events (organization_id,package_id,occurred_at,id);
alter table public.provider_onboarding_release_packages enable row level security;
alter table public.provider_onboarding_release_package_items enable row level security;
alter table public.provider_onboarding_release_package_approvals enable row level security;
alter table public.provider_onboarding_release_package_events enable row level security;
revoke all on table public.provider_onboarding_release_packages from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_release_package_items from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_release_package_approvals from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_release_package_events from public,anon,authenticated,service_role;
