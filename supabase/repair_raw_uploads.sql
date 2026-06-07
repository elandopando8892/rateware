alter table public.raw_uploads
  add column if not exists original_filename text,
  add column if not exists storage_bucket text default 'raw-uploads',
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists document_type text,
  add column if not exists vendor_hint text,
  add column if not exists rfx_hint text,
  add column if not exists status text default 'uploaded',
  add column if not exists staging_target text default 'rate_staging',
  add column if not exists interpreted_at timestamptz,
  add column if not exists error_message text;

create index if not exists raw_uploads_created_at_idx on public.raw_uploads (created_at desc);
create index if not exists raw_uploads_status_idx on public.raw_uploads (status);
create index if not exists raw_uploads_vendor_hint_idx on public.raw_uploads (vendor_hint);
create index if not exists raw_uploads_rfx_hint_idx on public.raw_uploads (rfx_hint);
