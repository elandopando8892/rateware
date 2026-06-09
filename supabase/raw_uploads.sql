create extension if not exists pgcrypto;

create table if not exists public.raw_uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  original_filename text not null,
  storage_bucket text not null default 'raw-uploads',
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint not null,
  document_type text not null check (document_type in ('xlsx', 'pdf', 'image', 'email')),
  vendor_hint text,
  rfx_hint text,
  status text not null default 'uploaded' check (status in ('uploaded', 'staged', 'failed', 'archived')),
  staging_target text not null default 'rate_staging',
  interpreted_at timestamptz,
  error_message text,
  constraint raw_uploads_storage_unique unique (storage_bucket, storage_path),
  constraint raw_uploads_staging_target_check check (staging_target = 'rate_staging')
);

alter table public.raw_uploads
  add column if not exists created_at timestamptz default now(),
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

create table if not exists public.interpretation_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_upload_id uuid not null references public.raw_uploads(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  model text,
  extracted_rows integer not null default 0,
  error_message text
);

alter table public.interpretation_jobs
  add column if not exists created_at timestamptz default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists raw_upload_id uuid references public.raw_uploads(id) on delete cascade,
  add column if not exists status text default 'running',
  add column if not exists model text,
  add column if not exists extracted_rows integer default 0,
  add column if not exists error_message text;

create index if not exists interpretation_jobs_raw_upload_id_idx on public.interpretation_jobs (raw_upload_id);
create index if not exists interpretation_jobs_status_idx on public.interpretation_jobs (status);

create table if not exists public.rate_staging (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_upload_id uuid not null references public.raw_uploads(id) on delete cascade,
  interpretation_job_id uuid references public.interpretation_jobs(id) on delete set null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  vendor_domain text,
  rfx_id text,
  row_id text,
  rfx_key text,
  route_key text,
  business_key text,
  origin text,
  destination text,
  equipment text,
  trailer text,
  config text,
  operation text,
  service text,
  driver text,
  mx_border_crossing_point text,
  us_border_crossing_point text,
  mx_linehaul text,
  us_linehaul text,
  us_miles text,
  fsc text,
  fuel text,
  border_crossing_fee text,
  flat_rate text,
  all_in_rate text,
  currency text,
  weekly_capacity text,
  notes text,
  accessorials text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  extraction_warnings text[] not null default '{}',
  extracted_payload jsonb not null default '{}'::jsonb
);

alter table public.rate_staging
  add column if not exists created_at timestamptz default now(),
  add column if not exists raw_upload_id uuid references public.raw_uploads(id) on delete cascade,
  add column if not exists interpretation_job_id uuid references public.interpretation_jobs(id) on delete set null,
  add column if not exists status text default 'pending_review',
  add column if not exists vendor_domain text,
  add column if not exists rfx_id text,
  add column if not exists row_id text,
  add column if not exists rfx_key text,
  add column if not exists route_key text,
  add column if not exists business_key text,
  add column if not exists origin text,
  add column if not exists destination text,
  add column if not exists equipment text,
  add column if not exists trailer text,
  add column if not exists config text,
  add column if not exists operation text,
  add column if not exists service text,
  add column if not exists driver text,
  add column if not exists mx_border_crossing_point text,
  add column if not exists us_border_crossing_point text,
  add column if not exists mx_linehaul text,
  add column if not exists us_linehaul text,
  add column if not exists us_miles text,
  add column if not exists fsc text,
  add column if not exists fuel text,
  add column if not exists border_crossing_fee text,
  add column if not exists flat_rate text,
  add column if not exists all_in_rate text,
  add column if not exists currency text,
  add column if not exists weekly_capacity text,
  add column if not exists notes text,
  add column if not exists accessorials text,
  add column if not exists confidence numeric default 0,
  add column if not exists extraction_warnings text[] default '{}',
  add column if not exists extracted_payload jsonb default '{}'::jsonb;

create index if not exists rate_staging_raw_upload_id_idx on public.rate_staging (raw_upload_id);
create index if not exists rate_staging_status_idx on public.rate_staging (status);
create index if not exists rate_staging_vendor_domain_idx on public.rate_staging (vendor_domain);
create index if not exists rate_staging_rfx_id_idx on public.rate_staging (rfx_id);

alter table public.raw_uploads enable row level security;
alter table public.interpretation_jobs enable row level security;
alter table public.rate_staging enable row level security;

create policy "authenticated users can read raw uploads"
  on public.raw_uploads for select
  to authenticated
  using (true);

create policy "authenticated users can create raw uploads"
  on public.raw_uploads for insert
  to authenticated
  with check (staging_target = 'rate_staging');

create policy "authenticated users can read interpretation jobs"
  on public.interpretation_jobs for select
  to authenticated
  using (true);

create policy "authenticated users can read rate staging"
  on public.rate_staging for select
  to authenticated
  using (true);

create policy "authenticated users can review rate staging"
  on public.rate_staging for update
  to authenticated
  using (true)
  with check (status in ('pending_review', 'approved', 'rejected'));

insert into storage.buckets (id, name, public)
values ('raw-uploads', 'raw-uploads', false)
on conflict (id) do nothing;

create policy "authenticated users can upload raw source files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'raw-uploads');

create policy "authenticated users can read raw source files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'raw-uploads');
