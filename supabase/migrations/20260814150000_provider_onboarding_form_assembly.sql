-- Provider Service Build 28: private form assembly with explicit signature consent.
create table if not exists public.provider_onboarding_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_code text not null,
  template_code text not null,
  template_version integer not null,
  template_name text not null,
  storage_bucket text not null default 'provider-entity-vault',
  storage_path text not null,
  template_sha256 text not null,
  output_mime_type text not null default 'application/pdf',
  signature_policy text not null default 'explicit_authorization',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_onboarding_form_templates_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_form_templates_unique unique (organization_id,program_code,template_code,template_version),
  constraint provider_onboarding_form_templates_program_check check (program_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_onboarding_form_templates_code_check check (template_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_form_templates_version_check check (template_version>0),
  constraint provider_onboarding_form_templates_vault_check check (storage_bucket='provider-entity-vault' and storage_path like 'templates/%'),
  constraint provider_onboarding_form_templates_hash_check check (template_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_onboarding_form_templates_mime_check check (output_mime_type in ('application/pdf')),
  constraint provider_onboarding_form_templates_signature_check check (signature_policy in ('none','explicit_authorization','external_esign'))
);

create table if not exists public.provider_onboarding_form_field_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_id uuid not null,
  target_field_name text not null,
  source_kind text not null,
  source_field_code text,
  static_value jsonb,
  required boolean not null default true,
  disclosure_required text not null default 'full',
  transform_code text not null default 'direct',
  display_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_onboarding_form_mappings_template_fkey foreign key (organization_id,template_id)
    references public.provider_onboarding_form_templates(organization_id,id) on delete cascade,
  constraint provider_onboarding_form_mappings_unique unique (organization_id,template_id,target_field_name),
  constraint provider_onboarding_form_mappings_target_check check (target_field_name ~ '^[A-Za-z][A-Za-z0-9_.:-]{1,191}$'),
  constraint provider_onboarding_form_mappings_source_check check (source_kind in ('fact','static')),
  constraint provider_onboarding_form_mappings_selector_check check (
    (source_kind='fact' and source_field_code is not null and static_value is null)
    or (source_kind='static' and static_value is not null and source_field_code is null)
  ),
  constraint provider_onboarding_form_mappings_field_check check (source_field_code is null or source_field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_form_mappings_disclosure_check check (disclosure_required in ('redacted','full')),
  constraint provider_onboarding_form_mappings_transform_check check (transform_code in ('direct','uppercase','lowercase','date_iso','boolean_yes_no')),
  constraint provider_onboarding_form_mappings_order_check check (display_order>=0)
);

create table if not exists public.provider_onboarding_signature_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null,
  signer_actor_id text not null,
  signature_document_asset_id uuid,
  signature_method text not null,
  authorization_status text not null default 'active',
  scope_sha256 text not null,
  consent_text_version text not null,
  consent_evidence jsonb not null,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason_code text,
  constraint provider_signature_authorizations_org_id_unique unique (organization_id,id),
  constraint provider_signature_authorizations_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete restrict,
  constraint provider_signature_authorizations_asset_fkey foreign key (organization_id,signature_document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id) on delete restrict,
  constraint provider_signature_authorizations_active_unique unique (organization_id,package_id,signer_actor_id),
  constraint provider_signature_authorizations_method_check check (signature_method in ('stored_signature_asset','external_esign','manual_wet')),
  constraint provider_signature_authorizations_asset_check check (
    (signature_method='stored_signature_asset' and signature_document_asset_id is not null)
    or (signature_method<>'stored_signature_asset' and signature_document_asset_id is null)
  ),
  constraint provider_signature_authorizations_status_check check (authorization_status in ('active','consumed','revoked','expired')),
  constraint provider_signature_authorizations_hash_check check (scope_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_signature_authorizations_signer_check check (btrim(signer_actor_id)<>''),
  constraint provider_signature_authorizations_consent_check check (
    btrim(consent_text_version)<>'' and jsonb_typeof(consent_evidence)='object' and consent_evidence<>'{}'::jsonb
  ),
  constraint provider_signature_authorizations_expiry_check check (expires_at>authorized_at),
  constraint provider_signature_authorizations_consumed_check check (authorization_status<>'consumed' or consumed_at is not null),
  constraint provider_signature_authorizations_revoked_check check (
    authorization_status<>'revoked' or (revoked_at is not null and revocation_reason_code is not null)
  )
);

create table if not exists public.provider_onboarding_form_assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null,
  template_id uuid not null,
  signature_authorization_id uuid,
  assembly_status text not null default 'queued',
  input_manifest_sha256 text not null,
  output_storage_bucket text,
  output_storage_path text,
  output_sha256 text,
  output_size_bytes bigint,
  processing_lease_token uuid,
  processing_lease_expires_at timestamptz,
  requested_by_actor_id text not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_form_assemblies_org_id_unique unique (organization_id,id),
  constraint provider_form_assemblies_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete restrict,
  constraint provider_form_assemblies_template_fkey foreign key (organization_id,template_id)
    references public.provider_onboarding_form_templates(organization_id,id) on delete restrict,
  constraint provider_form_assemblies_signature_fkey foreign key (organization_id,signature_authorization_id)
    references public.provider_onboarding_signature_authorizations(organization_id,id) on delete restrict,
  constraint provider_form_assemblies_unique unique (organization_id,package_id,template_id),
  constraint provider_form_assemblies_status_check check (assembly_status in ('queued','assembling','assembled','failed','cancelled')),
  constraint provider_form_assemblies_input_hash_check check (input_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_form_assemblies_output_check check (
    assembly_status<>'assembled' or (
      output_storage_bucket='provider-entity-vault' and output_storage_path like 'assembled/%'
      and output_sha256 ~ '^[0-9a-f]{64}$' and output_size_bytes>0 and completed_at is not null
    )
  ),
  constraint provider_form_assemblies_lease_check check (
    processing_lease_token is null or (assembly_status='assembling' and processing_lease_expires_at is not null)
  ),
  constraint provider_form_assemblies_requester_check check (btrim(requested_by_actor_id)<>'')
);

create table if not exists public.provider_onboarding_form_assembly_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  assembly_id uuid not null,
  event_type text not null,
  actor_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_form_assembly_events_assembly_fkey foreign key (organization_id,assembly_id)
    references public.provider_onboarding_form_assemblies(organization_id,id) on delete restrict,
  constraint provider_form_assembly_events_type_check check (event_type in (
    'assembly_queued','assembly_started','assembly_completed','assembly_failed',
    'signature_authorization_consumed','assembly_cancelled'
  )),
  constraint provider_form_assembly_events_actor_check check (btrim(actor_id)<>'')
);
create index if not exists provider_form_assemblies_queue_idx
  on public.provider_onboarding_form_assemblies (organization_id,assembly_status,requested_at);
create index if not exists provider_form_assembly_events_timeline_idx
  on public.provider_onboarding_form_assembly_events (organization_id,assembly_id,occurred_at,id);
alter table public.provider_onboarding_form_templates enable row level security;
alter table public.provider_onboarding_form_field_mappings enable row level security;
alter table public.provider_onboarding_signature_authorizations enable row level security;
alter table public.provider_onboarding_form_assemblies enable row level security;
alter table public.provider_onboarding_form_assembly_events enable row level security;
revoke all on table public.provider_onboarding_form_templates from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_form_field_mappings from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_signature_authorizations from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_form_assemblies from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_form_assembly_events from public,anon,authenticated,service_role;
