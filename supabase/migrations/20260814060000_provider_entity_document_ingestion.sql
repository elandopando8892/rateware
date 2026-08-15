-- Provider Service Build 19: private document ingestion ledger and quarantine boundary.
-- No public upload route, no production files, and no release authority.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'provider-entity-vault',
  'provider-entity-vault',
  false,
  26214400,
  array['application/pdf','image/png','image/jpeg']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.provider_entity_document_ingestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  ingestion_key text not null,
  source_channel text not null default 'manual',
  source_reference text,
  original_filename text not null,
  declared_mime_type text not null,
  declared_size_bytes bigint,
  storage_bucket text not null default 'provider-entity-vault',
  storage_path text not null,
  expected_sha256 text,
  observed_sha256 text,
  hash_status text not null default 'pending',
  malware_status text not null default 'pending',
  classification_status text not null default 'pending',
  classified_document_type text,
  classified_sensitivity text,
  classification_confidence numeric,
  ingestion_status text not null default 'requested',
  quarantine_reason text,
  provider_document_asset_id uuid,
  requested_by_actor_type text not null default 'user',
  requested_by_user_id text,
  ready_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_entity_ingestions_org_id_unique unique (organization_id,id),
  constraint provider_entity_ingestions_entity_fkey
    foreign key (organization_id,legal_entity_id)
    references public.legal_entities(organization_id,id)
    on delete restrict,
  constraint provider_entity_ingestions_asset_fkey
    foreign key (organization_id,provider_document_asset_id)
    references public.provider_legal_entity_document_assets(organization_id,id)
    on delete restrict,
  constraint provider_entity_ingestions_key_unique
    unique (organization_id,legal_entity_id,ingestion_key),
  constraint provider_entity_ingestions_storage_unique
    unique (organization_id,storage_bucket,storage_path),
  constraint provider_entity_ingestions_key_check
    check (ingestion_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$'),
  constraint provider_entity_ingestions_source_check
    check (source_channel in ('manual','email','portal','api','import','generated')),
  constraint provider_entity_ingestions_filename_check
    check (btrim(original_filename)<>'' and original_filename !~ '[\\/]'),
  constraint provider_entity_ingestions_mime_check
    check (declared_mime_type in ('application/pdf','image/png','image/jpeg')),
  constraint provider_entity_ingestions_size_check
    check (declared_size_bytes is null or (declared_size_bytes>0 and declared_size_bytes<=26214400)),
  constraint provider_entity_ingestions_bucket_check
    check (storage_bucket='provider-entity-vault'),
  constraint provider_entity_ingestions_path_check
    check (
      storage_path like organization_id::text || '/' || legal_entity_id::text || '/' || id::text || '/%'
      and storage_path !~ '(^|/)\.\.(/|$)'
    ),
  constraint provider_entity_ingestions_expected_hash_check
    check (expected_sha256 is null or expected_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_entity_ingestions_observed_hash_check
    check (observed_sha256 is null or observed_sha256 ~ '^[0-9a-f]{64}$'),
  constraint provider_entity_ingestions_hash_status_check
    check (hash_status in ('pending','matched','mismatched','unavailable')),
  constraint provider_entity_ingestions_malware_check
    check (malware_status in ('pending','scanning','clean','infected','error')),
  constraint provider_entity_ingestions_classification_check
    check (classification_status in ('pending','classified','needs_review','rejected')),
  constraint provider_entity_ingestions_document_type_check
    check (classified_document_type is null or classified_document_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_ingestions_sensitivity_check
    check (classified_sensitivity is null or classified_sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  constraint provider_entity_ingestions_confidence_check
    check (classification_confidence is null or classification_confidence between 0 and 1),
  constraint provider_entity_ingestions_status_check
    check (ingestion_status in ('requested','uploaded','scanning','quarantined','ready','failed','cancelled')),
  constraint provider_entity_ingestions_actor_check
    check (requested_by_actor_type in ('user','agent','system','integration')),
  constraint provider_entity_ingestions_requester_check
    check (requested_by_actor_type<>'user' or nullif(btrim(coalesce(requested_by_user_id,'')),'') is not null),
  constraint provider_entity_ingestions_ready_check
    check (
      ingestion_status<>'ready'
      or (
        ready_at is not null
        and malware_status='clean'
        and hash_status in ('matched','unavailable')
        and classification_status in ('classified','needs_review')
        and provider_document_asset_id is not null
      )
    ),
  constraint provider_entity_ingestions_quarantine_check
    check (ingestion_status<>'quarantined' or nullif(btrim(coalesce(quarantine_reason,'')),'') is not null),
  constraint provider_entity_ingestions_failed_check
    check (ingestion_status<>'failed' or failed_at is not null)
);

create table if not exists public.provider_entity_document_ingestion_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  ingestion_id uuid not null,
  event_type text not null,
  previous_status text,
  ingestion_status text not null,
  actor_type text not null default 'system',
  actor_user_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_entity_ingestion_events_ingestion_fkey
    foreign key (organization_id,ingestion_id)
    references public.provider_entity_document_ingestions(organization_id,id)
    on delete restrict,
  constraint provider_entity_ingestion_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_entity_ingestion_events_previous_status_check
    check (previous_status is null or previous_status in ('requested','uploaded','scanning','quarantined','ready','failed','cancelled')),
  constraint provider_entity_ingestion_events_status_check
    check (ingestion_status in ('requested','uploaded','scanning','quarantined','ready','failed','cancelled')),
  constraint provider_entity_ingestion_events_actor_check
    check (actor_type in ('user','agent','system','integration'))
);

create index if not exists provider_entity_ingestions_queue_idx
  on public.provider_entity_document_ingestions
    (organization_id,ingestion_status,malware_status,classification_status,created_at);
create index if not exists provider_entity_ingestions_entity_idx
  on public.provider_entity_document_ingestions
    (organization_id,legal_entity_id,created_at desc);
create index if not exists provider_entity_ingestion_events_timeline_idx
  on public.provider_entity_document_ingestion_events
    (organization_id,ingestion_id,occurred_at,id);

create or replace view public.provider_entity_document_ingestion_queue
with (security_barrier=true)
as
select
  ingestion.organization_id,
  ingestion.id as ingestion_id,
  ingestion.legal_entity_id,
  entity.entity_code as legal_entity_code,
  ingestion.original_filename,
  ingestion.declared_mime_type,
  ingestion.declared_size_bytes,
  ingestion.hash_status,
  ingestion.malware_status,
  ingestion.classification_status,
  ingestion.classified_document_type,
  ingestion.classified_sensitivity,
  ingestion.classification_confidence,
  ingestion.ingestion_status,
  ingestion.quarantine_reason,
  ingestion.provider_document_asset_id,
  ingestion.requested_by_actor_type,
  ingestion.created_at,
  ingestion.updated_at,
  case
    when ingestion.ingestion_status in ('failed','quarantined') then 10
    when ingestion.malware_status in ('infected','error') then 10
    when ingestion.hash_status='mismatched' then 10
    when ingestion.classification_status='needs_review' then 20
    when ingestion.ingestion_status in ('uploaded','scanning') then 30
    when ingestion.ingestion_status='requested' then 40
    else 90
  end as priority_rank
from public.provider_entity_document_ingestions ingestion
join public.legal_entities entity
  on entity.organization_id=ingestion.organization_id
 and entity.id=ingestion.legal_entity_id;

alter table public.provider_entity_document_ingestions enable row level security;
alter table public.provider_entity_document_ingestion_events enable row level security;

revoke all on table public.provider_entity_document_ingestions from public,anon,authenticated,service_role;
revoke all on table public.provider_entity_document_ingestion_events from public,anon,authenticated,service_role;
revoke all on table public.provider_entity_document_ingestion_queue from public,anon,authenticated,service_role;

-- The bucket is private and receives no storage.objects policies in this build.
-- Upload and processing authority must be added later through a bounded service-role command.
