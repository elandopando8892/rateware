alter table public.rfx_events
  add column if not exists source_rfx_package_name text,
  add column if not exists rfx_master_package jsonb not null default '{}'::jsonb;

alter table public.rfx_lanes
  add column if not exists rfx_segment_key text,
  add column if not exists rfx_segment_name text;

create table if not exists public.rfx_package_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  package_id uuid not null references public.rfx_packages(id) on delete cascade,
  segment_key text not null,
  segment_name text not null,
  operation text,
  service text,
  equipment text,
  trailer text,
  lane_count integer not null default 0,
  lane_ids jsonb not null default '[]'::jsonb,
  logistics_model text,
  operation_criteria text,
  business_rules text,
  service_specifications text,
  other_notes text,
  checklist jsonb not null default '[]'::jsonb,
  sort_order integer not null default 1,
  constraint rfx_package_segments_unique unique (package_id, segment_key)
);

create table if not exists public.rfx_segment_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_vendor_id uuid references public.rfx_lane_vendors(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete cascade,
  segment_key text not null,
  rubric_key text not null,
  answer text not null default 'pending' check (answer in ('pending', 'agree', 'exception', 'disagree', 'not_applicable')),
  comment text,
  source text not null default 'carrier_portal',
  metadata jsonb not null default '{}'::jsonb,
  constraint rfx_segment_confirmations_unique unique (rfx_lane_vendor_id, segment_key, rubric_key)
);

create index if not exists rfx_package_segments_package_idx on public.rfx_package_segments(package_id);
create index if not exists rfx_package_segments_owner_idx on public.rfx_package_segments(owner_email);
create index if not exists rfx_segment_confirmations_event_idx on public.rfx_segment_confirmations(rfx_event_id);
create index if not exists rfx_segment_confirmations_vendor_idx on public.rfx_segment_confirmations(vendor_id);
create index if not exists rfx_segment_confirmations_invitation_idx on public.rfx_segment_confirmations(rfx_lane_vendor_id);

alter table public.rfx_package_segments enable row level security;
alter table public.rfx_segment_confirmations enable row level security;

create policy "authenticated users can read rfx package segments"
  on public.rfx_package_segments for select
  to authenticated
  using (true);

create policy "authenticated users can write rfx package segments"
  on public.rfx_package_segments for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read rfx segment confirmations"
  on public.rfx_segment_confirmations for select
  to authenticated
  using (true);

create policy "authenticated users can write rfx segment confirmations"
  on public.rfx_segment_confirmations for all
  to authenticated
  using (true)
  with check (true);
