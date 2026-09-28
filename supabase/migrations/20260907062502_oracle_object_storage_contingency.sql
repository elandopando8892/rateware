-- Provider-neutral pointers keep existing rows readable while large objects move
-- out of Supabase Storage. Existing data remains on Supabase by default.

alter table public.raw_uploads
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_sha256 text;

alter table public.provider_entity_document_ingestions
  add column if not exists storage_provider text not null default 'supabase';

alter table public.provider_legal_entity_document_assets
  add column if not exists storage_provider text not null default 'supabase';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'raw_uploads_storage_provider_check') then
    alter table public.raw_uploads add constraint raw_uploads_storage_provider_check
      check (storage_provider in ('supabase','oracle_s3'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'raw_uploads_storage_sha256_check') then
    alter table public.raw_uploads add constraint raw_uploads_storage_sha256_check
      check (storage_sha256 is null or storage_sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provider_entity_ingestions_storage_provider_check') then
    alter table public.provider_entity_document_ingestions
      add constraint provider_entity_ingestions_storage_provider_check
      check (storage_provider in ('supabase','oracle_s3'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provider_entity_assets_storage_provider_check') then
    alter table public.provider_legal_entity_document_assets
      add constraint provider_entity_assets_storage_provider_check
      check (storage_provider in ('supabase','oracle_s3'));
  end if;
end
$$;

create table if not exists public.object_storage_replicas (
  id uuid primary key default gen_random_uuid(),
  organization_id text,
  owner_email text,
  source_table text not null,
  source_record_id uuid not null,
  source_provider text not null,
  source_bucket text not null,
  source_path text not null,
  replica_provider text not null,
  replica_bucket text not null,
  replica_path text not null,
  object_sha256 text,
  object_size_bytes bigint,
  object_etag text,
  replica_status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint object_storage_replicas_source_table_check
    check (source_table in ('raw_uploads','provider_entity_document_ingestions')),
  constraint object_storage_replicas_provider_check
    check (source_provider in ('supabase','oracle_s3') and replica_provider in ('supabase','oracle_s3')),
  constraint object_storage_replicas_distinct_provider_check
    check (source_provider <> replica_provider),
  constraint object_storage_replicas_status_check
    check (replica_status in ('pending','copying','verified','failed','deleted')),
  constraint object_storage_replicas_sha256_check
    check (object_sha256 is null or object_sha256 ~ '^[0-9a-f]{64}$'),
  constraint object_storage_replicas_size_check
    check (object_size_bytes is null or object_size_bytes >= 0),
  constraint object_storage_replicas_attempts_check
    check (attempts >= 0),
  constraint object_storage_replicas_source_unique
    unique (source_table,source_record_id,replica_provider,replica_bucket,replica_path)
);

create index if not exists object_storage_replicas_status_idx
  on public.object_storage_replicas (replica_status,updated_at);
create index if not exists object_storage_replicas_source_idx
  on public.object_storage_replicas (source_table,source_record_id);

alter table public.object_storage_replicas enable row level security;
revoke all on table public.object_storage_replicas from anon, authenticated;
grant select, insert, update, delete on table public.object_storage_replicas to service_role;

comment on table public.object_storage_replicas is
  'Server-only audit ledger for verified copies between Supabase Storage and Oracle Object Storage.';
comment on column public.raw_uploads.storage_provider is
  'Storage implementation for storage_bucket/storage_path. Defaults to Supabase for backward compatibility.';
