-- Provider Service Build 18: legal-entity source of truth and controlled release vault.
-- Additive and fail-closed. This migration creates no production records, uploads no
-- binaries, and exposes no new API/RPC surface.

create table if not exists public.provider_legal_entity_profile_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  field_code text not null,
  field_label text not null,
  field_value jsonb not null,
  value_format text not null default 'text',
  sensitivity text not null default 'internal',
  lifecycle_status text not null default 'active',
  verification_status text not null default 'unverified',
  source_reference text,
  effective_date date,
  expiration_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_profile_fields_org_id_unique unique (organization_id,id),
  constraint provider_entity_profile_fields_entity_fkey
    foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id)
    on delete restrict,
  constraint provider_entity_profile_fields_logical_unique
    unique (organization_id,legal_entity_id,field_code),
  constraint provider_entity_profile_fields_code_check
    check (field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_profile_fields_label_check check (btrim(field_label)<>''),
  constraint provider_entity_profile_fields_format_check
    check (value_format in ('text','email','phone','address','identifier','number','date','boolean','json')),
  constraint provider_entity_profile_fields_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_profile_fields_lifecycle_check
    check (lifecycle_status in ('active','superseded','revoked','archived')),
  constraint provider_entity_profile_fields_verification_check
    check (verification_status in ('unverified','verified','needs_review','rejected')),
  constraint provider_entity_profile_fields_dates_check
    check (expiration_date is null or effective_date is null or expiration_date>=effective_date)
);

create table if not exists public.provider_legal_entity_document_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  document_type text not null,
  document_key text not null default 'primary',
  document_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint,
  file_sha256 text not null,
  sensitivity text not null default 'confidential',
  release_policy text not null default 'approval_required',
  lifecycle_status text not null default 'active',
  verification_status text not null default 'unverified',
  issuer_name text,
  effective_date date,
  expiration_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_document_assets_org_id_unique unique (organization_id,id),
  constraint provider_entity_document_assets_entity_fkey
    foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id)
    on delete restrict,
  constraint provider_entity_document_assets_logical_unique
    unique (organization_id,legal_entity_id,document_type,document_key),
  constraint provider_entity_document_assets_storage_unique
    unique (organization_id,storage_bucket,storage_path),
  constraint provider_entity_document_assets_hash_unique
    unique (organization_id,legal_entity_id,file_sha256),
  constraint provider_entity_document_assets_type_check
    check (document_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_document_assets_key_check
    check (document_key ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_document_assets_name_check check (btrim(document_name)<>''),
  constraint provider_entity_document_assets_bucket_check check (btrim(storage_bucket)<>''),
  constraint provider_entity_document_assets_path_check check (btrim(storage_path)<>''),
  constraint provider_entity_document_assets_filename_check check (btrim(original_filename)<>''),
  constraint provider_entity_document_assets_size_check check (file_size_bytes is null or file_size_bytes>=0),
  constraint provider_entity_document_assets_sha_check check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_entity_document_assets_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_document_assets_release_policy_check
    check (release_policy in ('automatic','review_required','approval_required','never_release')),
  constraint provider_entity_document_assets_lifecycle_check
    check (lifecycle_status in ('active','superseded','revoked','archived')),
  constraint provider_entity_document_assets_verification_check
    check (verification_status in ('unverified','verified','needs_review','rejected')),
  constraint provider_entity_document_assets_dates_check
    check (expiration_date is null or effective_date is null or expiration_date>=effective_date)
);

create table if not exists public.provider_legal_entity_release_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  provider_relationship_id uuid not null,
  package_code text not null,
  purpose text not null default 'provider_onboarding',
  recipient_name text,
  recipient_domain text,
  lifecycle_status text not null default 'draft',
  maximum_sensitivity text not null default 'internal',
  approval_request_id uuid,
  requested_by_actor_type text not null default 'user',
  requested_by_user_id text,
  released_by_user_id text,
  released_at timestamptz,
  expires_at timestamptz,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_release_packages_org_id_unique unique (organization_id,id),
  constraint provider_entity_release_packages_code_unique unique (organization_id,package_code),
  constraint provider_entity_release_packages_relationship_fkey
    foreign key (organization_id,provider_relationship_id,legal_entity_id)
    references public.provider_relationships(organization_id,id,legal_entity_id)
    on delete restrict,
  constraint provider_entity_release_packages_code_check
    check (package_code ~ '^REL-[A-Z0-9]{2,16}-[0-9]{6,20}$'),
  constraint provider_entity_release_packages_purpose_check
    check (purpose in ('provider_onboarding','credit_application','compliance_renewal','banking_verification','other')),
  constraint provider_entity_release_packages_domain_check
    check (recipient_domain is null or recipient_domain = lower(btrim(recipient_domain))),
  constraint provider_entity_release_packages_status_check
    check (lifecycle_status in ('draft','review_required','approval_required','approved','released','revoked','cancelled','expired')),
  constraint provider_entity_release_packages_sensitivity_check
    check (maximum_sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_release_packages_actor_check
    check (requested_by_actor_type in ('user','agent','system','integration')),
  constraint provider_entity_release_packages_user_check
    check (requested_by_actor_type<>'user' or nullif(btrim(coalesce(requested_by_user_id,'')),'') is not null),
  constraint provider_entity_release_packages_approval_check
    check (
      maximum_sensitivity not in ('restricted','highly_restricted')
      or lifecycle_status in ('draft','review_required','approval_required','cancelled','expired')
      or approval_request_id is not null
    ),
  constraint provider_entity_release_packages_release_check
    check (
      lifecycle_status<>'released'
      or (released_at is not null and nullif(btrim(coalesce(released_by_user_id,'')),'') is not null)
    ),
  constraint provider_entity_release_packages_expiry_check
    check (expires_at is null or expires_at>created_at)
);

create table if not exists public.provider_legal_entity_release_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  release_package_id uuid not null,
  legal_entity_id uuid not null,
  profile_field_id uuid,
  document_asset_id uuid,
  item_label text not null,
  sensitivity text not null,
  release_policy text not null,
  item_status text not null default 'pending',
  released_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_release_items_org_id_unique unique (organization_id,id),
  constraint provider_entity_release_items_package_fkey
    foreign key (organization_id,release_package_id)
    references public.provider_legal_entity_release_packages(organization_id,id)
    on delete cascade,
  constraint provider_entity_release_items_entity_fkey
    foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id)
    on delete restrict,
  constraint provider_entity_release_items_field_fkey
    foreign key (organization_id,profile_field_id)
    references public.provider_legal_entity_profile_fields(organization_id,id)
    on delete restrict,
  constraint provider_entity_release_items_asset_fkey
    foreign key (organization_id,document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id)
    on delete restrict,
  constraint provider_entity_release_items_source_check
    check ((profile_field_id is not null)::integer + (document_asset_id is not null)::integer = 1),
  constraint provider_entity_release_items_logical_unique
    unique nulls not distinct (organization_id,release_package_id,profile_field_id,document_asset_id),
  constraint provider_entity_release_items_label_check check (btrim(item_label)<>''),
  constraint provider_entity_release_items_sensitivity_check
    check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_release_items_policy_check
    check (release_policy in ('automatic','review_required','approval_required','never_release')),
  constraint provider_entity_release_items_status_check
    check (item_status in ('pending','review_required','approval_required','approved','released','withheld','revoked')),
  constraint provider_entity_release_items_never_release_check
    check (release_policy<>'never_release' or item_status in ('pending','withheld','revoked')),
  constraint provider_entity_release_items_hash_check
    check (released_sha256 is null or released_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists provider_entity_profile_fields_entity_idx
  on public.provider_legal_entity_profile_fields (organization_id,legal_entity_id,lifecycle_status,field_code);
create index if not exists provider_entity_document_assets_entity_idx
  on public.provider_legal_entity_document_assets (organization_id,legal_entity_id,lifecycle_status,document_type);
create index if not exists provider_entity_document_assets_expiry_idx
  on public.provider_legal_entity_document_assets (organization_id,expiration_date)
  where lifecycle_status='active' and expiration_date is not null;
create index if not exists provider_entity_release_packages_queue_idx
  on public.provider_legal_entity_release_packages (organization_id,lifecycle_status,created_at);
create index if not exists provider_entity_release_items_package_idx
  on public.provider_legal_entity_release_items (organization_id,release_package_id,item_status);

create or replace view public.provider_legal_entity_release_readiness
with (security_barrier=true)
as
select
  package.organization_id,
  package.id as release_package_id,
  package.legal_entity_id,
  package.provider_relationship_id,
  package.package_code,
  package.lifecycle_status,
  package.maximum_sensitivity,
  package.approval_request_id,
  count(item.id)::integer as item_count,
  count(item.id) filter (where item.release_policy='never_release')::integer as never_release_count,
  count(item.id) filter (where item.item_status in ('review_required','approval_required'))::integer as pending_control_count,
  count(item.id) filter (where item.item_status='approved')::integer as approved_item_count,
  bool_and(
    item.id is not null
    and item.release_policy<>'never_release'
    and item.item_status in ('approved','released')
  ) as ready_to_release
from public.provider_legal_entity_release_packages package
left join public.provider_legal_entity_release_items item
  on item.organization_id=package.organization_id
 and item.release_package_id=package.id
group by package.organization_id,package.id,package.legal_entity_id,
  package.provider_relationship_id,package.package_code,package.lifecycle_status,
  package.maximum_sensitivity,package.approval_request_id;

alter table public.provider_legal_entity_profile_fields enable row level security;
alter table public.provider_legal_entity_document_assets enable row level security;
alter table public.provider_legal_entity_release_packages enable row level security;
alter table public.provider_legal_entity_release_items enable row level security;

revoke all on table public.provider_legal_entity_profile_fields from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_document_assets from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_release_packages from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_release_items from public,anon,authenticated,service_role;
revoke all on table public.provider_legal_entity_release_readiness from public,anon,authenticated,service_role;
