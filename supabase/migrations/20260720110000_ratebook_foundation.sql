-- Sprint 0: Ratebook foundation.
-- Keep the existing RFx package projection intact while making the Ratebook
-- lifecycle, shipper ownership and operating segments explicit.

alter table public.rfx_ratebooks
  add column if not exists shipper_id uuid references public.shippers(id) on delete set null,
  add column if not exists shipper_name text,
  add column if not exists source_type text not null default 'rfx'
    check (source_type in ('rfi', 'rfx', 'spot', 'bid_room')),
  add column if not exists source_reference text,
  add column if not exists source_fingerprint text,
  add column if not exists version_number integer not null default 1 check (version_number > 0),
  add column if not exists lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'published', 'superseded', 'archived')),
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists published_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists rfx_ratebooks_owner_shipper_lifecycle_idx
  on public.rfx_ratebooks(owner_email, shipper_id, lifecycle_status, updated_at desc);
create index if not exists rfx_ratebooks_owner_source_idx
  on public.rfx_ratebooks(owner_email, source_type, updated_at desc);
create unique index if not exists rfx_ratebooks_owner_source_fingerprint_unique_idx
  on public.rfx_ratebooks(owner_email, source_fingerprint)
  where source_fingerprint is not null and btrim(source_fingerprint) <> '';

create table if not exists public.rfx_ratebook_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  ratebook_id uuid not null references public.rfx_ratebooks(id) on delete cascade,
  source_package_segment_id uuid references public.rfx_package_segments(id) on delete set null,
  segment_key text not null,
  segment_name text not null,
  source_type text not null default 'rfx'
    check (source_type in ('rfi', 'rfx', 'spot', 'bid_room')),
  operation text,
  service text,
  equipment text,
  trailer text,
  lane_count integer not null default 0,
  valid_from date,
  valid_until date,
  metadata jsonb not null default '{}'::jsonb,
  constraint rfx_ratebook_segments_unique unique(ratebook_id, segment_key)
);

create index if not exists rfx_ratebook_segments_ratebook_idx
  on public.rfx_ratebook_segments(ratebook_id, updated_at);
create index if not exists rfx_ratebook_segments_owner_idx
  on public.rfx_ratebook_segments(owner_email, source_type, updated_at desc);

alter table public.rfx_ratebook_segments enable row level security;

drop policy if exists "authenticated users can access ratebook segments" on public.rfx_ratebook_segments;
create policy "authenticated users can access ratebook segments"
  on public.rfx_ratebook_segments for all to authenticated
  using (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
