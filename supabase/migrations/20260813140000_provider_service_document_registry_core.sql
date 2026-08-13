-- Provider Service Build 3: native document registry core.
-- Additive only. No storage bucket, email ingestion, provider backfill, or production data mutation.

alter table public.provider_activations
  add constraint provider_activations_org_rel_entity_unique
  unique (organization_id, id, provider_relationship_id, legal_entity_id);

create table if not exists public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  document_type text not null,
  document_key text not null default 'primary',
  document_name text not null,
  direction text not null default 'inbound',
  lifecycle_status text not null default 'active',
  sensitivity text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_documents_org_id_unique
    unique (organization_id, id),
  constraint provider_documents_org_id_rel_entity_unique
    unique (organization_id, id, provider_relationship_id, legal_entity_id),
  constraint provider_documents_relationship_fkey
    foreign key (organization_id, provider_relationship_id, legal_entity_id)
    references public.provider_relationships(organization_id, id, legal_entity_id)
    on delete restrict,
  constraint provider_documents_logical_unique
    unique (
      organization_id,
      provider_relationship_id,
      legal_entity_id,
      document_type,
      document_key
    ),
  constraint provider_documents_type_check
    check (document_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_documents_key_check
    check (document_key ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_documents_name_not_blank
    check (btrim(document_name) <> ''),
  constraint provider_documents_direction_check
    check (direction in ('inbound', 'outbound', 'internal')),
  constraint provider_documents_lifecycle_check
    check (lifecycle_status in ('active', 'superseded', 'revoked', 'archived')),
  constraint provider_documents_sensitivity_check
    check (sensitivity in ('public', 'internal', 'confidential', 'restricted', 'highly_restricted'))
);

create table if not exists public.provider_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_document_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  version_number integer not null,
  original_filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  file_sha256 text not null,
  source_channel text not null default 'manual',
  source_reference text,
  issuer_name text,
  subject_name text,
  country_code text,
  effective_date date,
  expiration_date date,
  processing_status text not null default 'registered',
  classification_status text not null default 'unclassified',
  classification_confidence numeric,
  registered_by_actor_type text not null default 'user',
  registered_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_document_versions_org_id_unique
    unique (organization_id, id),
  constraint provider_document_versions_org_id_rel_entity_unique
    unique (organization_id, id, provider_relationship_id, legal_entity_id),
  constraint provider_document_versions_document_fkey
    foreign key (
      organization_id,
      provider_document_id,
      provider_relationship_id,
      legal_entity_id
    )
    references public.provider_documents(
      organization_id,
      id,
      provider_relationship_id,
      legal_entity_id
    )
    on delete restrict,
  constraint provider_document_versions_version_unique
    unique (organization_id, provider_document_id, version_number),
  constraint provider_document_versions_storage_unique
    unique (organization_id, storage_bucket, storage_path),
  constraint provider_document_versions_file_unique
    unique (organization_id, provider_relationship_id, file_sha256),
  constraint provider_document_versions_number_check
    check (version_number > 0),
  constraint provider_document_versions_filename_not_blank
    check (btrim(original_filename) <> ''),
  constraint provider_document_versions_bucket_not_blank
    check (btrim(storage_bucket) <> ''),
  constraint provider_document_versions_path_not_blank
    check (btrim(storage_path) <> ''),
  constraint provider_document_versions_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint provider_document_versions_sha256_check
    check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_document_versions_source_channel_check
    check (source_channel in ('email', 'portal', 'manual', 'generated', 'api', 'import', 'other')),
  constraint provider_document_versions_country_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint provider_document_versions_dates_check
    check (expiration_date is null or effective_date is null or expiration_date >= effective_date),
  constraint provider_document_versions_processing_check
    check (processing_status in ('registered', 'processing', 'ready', 'superseded', 'archived')),
  constraint provider_document_versions_classification_check
    check (classification_status in ('unclassified', 'classified', 'needs_review')),
  constraint provider_document_versions_classification_confidence_check
    check (classification_confidence is null or (classification_confidence >= 0 and classification_confidence <= 1)),
  constraint provider_document_versions_actor_type_check
    check (registered_by_actor_type in ('user', 'agent', 'system', 'integration'))
);

create table if not exists public.provider_document_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_version_id uuid not null,
  extraction_type text not null default 'fields',
  extractor_type text not null default 'agent',
  extractor_name text,
  status text not null default 'pending',
  confidence numeric,
  extracted_fields jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_document_extractions_org_id_unique
    unique (organization_id, id),
  constraint provider_document_extractions_version_fkey
    foreign key (organization_id, document_version_id)
    references public.provider_document_versions(organization_id, id)
    on delete cascade,
  constraint provider_document_extractions_type_check
    check (extraction_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_document_extractions_extractor_type_check
    check (extractor_type in ('agent', 'system', 'integration', 'user')),
  constraint provider_document_extractions_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'needs_review')),
  constraint provider_document_extractions_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint provider_document_extractions_completed_check
    check (status not in ('completed', 'failed', 'needs_review') or completed_at is not null),
  constraint provider_document_extractions_error_check
    check (status <> 'failed' or nullif(btrim(coalesce(error_message, '')), '') is not null)
);

create table if not exists public.provider_document_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_version_id uuid not null,
  review_type text not null default 'content',
  decision text not null default 'pending',
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_document_reviews_org_id_unique
    unique (organization_id, id),
  constraint provider_document_reviews_version_fkey
    foreign key (organization_id, document_version_id)
    references public.provider_document_versions(organization_id, id)
    on delete restrict,
  constraint provider_document_reviews_type_check
    check (review_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_document_reviews_decision_check
    check (decision in ('pending', 'approved', 'rejected', 'correction_required')),
  constraint provider_document_reviews_terminal_review_check check (
    decision = 'pending'
    or (
      reviewed_at is not null
      and nullif(btrim(coalesce(reviewed_by_user_id, '')), '') is not null
    )
  ),
  constraint provider_document_reviews_note_check check (
    decision not in ('rejected', 'correction_required')
    or nullif(btrim(coalesce(decision_note, '')), '') is not null
  )
);

create table if not exists public.provider_document_requirement_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  activation_id uuid not null,
  activation_requirement_id uuid not null,
  document_version_id uuid not null,
  link_role text not null default 'evidence',
  status text not null default 'active',
  created_by_actor_type text not null default 'user',
  created_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_document_requirement_links_org_id_unique
    unique (organization_id, id),
  constraint provider_document_requirement_links_activation_fkey
    foreign key (
      organization_id,
      activation_id,
      provider_relationship_id,
      legal_entity_id
    )
    references public.provider_activations(
      organization_id,
      id,
      provider_relationship_id,
      legal_entity_id
    )
    on delete restrict,
  constraint provider_document_requirement_links_requirement_fkey
    foreign key (organization_id, activation_id, activation_requirement_id)
    references public.provider_activation_requirements(organization_id, activation_id, id)
    on delete restrict,
  constraint provider_document_requirement_links_version_fkey
    foreign key (
      organization_id,
      document_version_id,
      provider_relationship_id,
      legal_entity_id
    )
    references public.provider_document_versions(
      organization_id,
      id,
      provider_relationship_id,
      legal_entity_id
    )
    on delete restrict,
  constraint provider_document_requirement_links_unique
    unique (organization_id, activation_requirement_id, document_version_id, link_role),
  constraint provider_document_requirement_links_role_check
    check (link_role in ('evidence', 'supporting', 'source_form', 'generated_output')),
  constraint provider_document_requirement_links_status_check
    check (status in ('active', 'revoked', 'superseded')),
  constraint provider_document_requirement_links_actor_type_check
    check (created_by_actor_type in ('user', 'agent', 'system', 'integration'))
);

create table if not exists public.provider_document_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_document_id uuid not null,
  document_version_id uuid,
  extraction_id uuid,
  review_id uuid,
  requirement_link_id uuid,
  event_type text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  source text not null default 'provider_service',
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_document_events_document_fkey
    foreign key (organization_id, provider_document_id)
    references public.provider_documents(organization_id, id)
    on delete restrict,
  constraint provider_document_events_version_fkey
    foreign key (organization_id, document_version_id)
    references public.provider_document_versions(organization_id, id)
    on delete restrict,
  constraint provider_document_events_extraction_fkey
    foreign key (organization_id, extraction_id)
    references public.provider_document_extractions(organization_id, id)
    on delete restrict,
  constraint provider_document_events_review_fkey
    foreign key (organization_id, review_id)
    references public.provider_document_reviews(organization_id, id)
    on delete restrict,
  constraint provider_document_events_link_fkey
    foreign key (organization_id, requirement_link_id)
    references public.provider_document_requirement_links(organization_id, id)
    on delete restrict,
  constraint provider_document_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_document_events_actor_type_check
    check (actor_type in ('user', 'agent', 'system', 'integration')),
  constraint provider_document_events_source_not_blank
    check (btrim(source) <> '')
);

create index if not exists provider_documents_relationship_type_idx
  on public.provider_documents (
    organization_id,
    provider_relationship_id,
    lifecycle_status,
    document_type,
    document_key
  );
create index if not exists provider_document_versions_document_version_idx
  on public.provider_document_versions (provider_document_id, version_number desc, created_at desc);
create index if not exists provider_document_versions_expiration_idx
  on public.provider_document_versions (organization_id, expiration_date, processing_status)
  where expiration_date is not null;
create index if not exists provider_document_extractions_version_created_idx
  on public.provider_document_extractions (document_version_id, created_at desc);
create index if not exists provider_document_reviews_version_created_idx
  on public.provider_document_reviews (document_version_id, created_at desc);
create index if not exists provider_document_requirement_links_requirement_idx
  on public.provider_document_requirement_links (activation_requirement_id, status, created_at desc);
create index if not exists provider_document_events_document_created_idx
  on public.provider_document_events (provider_document_id, occurred_at desc, id desc);
