create table if not exists public.rfx_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  rfx_id text not null,
  name text not null,
  customer text,
  event_type text not null default 'spot' check (event_type in ('spot', 'rfx', 'bid')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'awarded', 'archived')),
  due_date date,
  notes text
);

create table if not exists public.rfx_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  lane_number integer not null default 1,
  origin text,
  origin_city text,
  origin_state text,
  origin_country text,
  origin_market text,
  origin_region text,
  destination text,
  destination_city text,
  destination_state text,
  destination_country text,
  destination_market text,
  destination_region text,
  equipment text,
  trailer text,
  config text,
  operation text,
  service text,
  weekly_volume numeric,
  annual_volume numeric,
  target_rate numeric,
  currency text not null default 'USD',
  incumbent_vendor text,
  notes text
);

create table if not exists public.rfx_lane_vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  invitation_status text not null default 'shortlisted'
    check (invitation_status in ('shortlisted', 'invited', 'viewed', 'bid_submitted', 'declined', 'awarded', 'archived')),
  invitation_token text not null default md5(random()::text || clock_timestamp()::text),
  invited_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  bid_rate numeric,
  currency text not null default 'USD',
  weekly_capacity numeric,
  transit_days numeric,
  notes text,
  response_source text,
  constraint rfx_lane_vendors_lane_vendor_unique unique (rfx_lane_id, vendor_id),
  constraint rfx_lane_vendors_token_unique unique (invitation_token)
);

create index if not exists rfx_events_owner_created_idx on public.rfx_events (owner_email, created_at desc);
create index if not exists rfx_events_status_idx on public.rfx_events (status);
create index if not exists rfx_lanes_event_idx on public.rfx_lanes (rfx_event_id, lane_number);
create index if not exists rfx_lane_vendors_event_idx on public.rfx_lane_vendors (rfx_event_id);
create index if not exists rfx_lane_vendors_lane_idx on public.rfx_lane_vendors (rfx_lane_id);
create index if not exists rfx_lane_vendors_vendor_idx on public.rfx_lane_vendors (vendor_id);
create index if not exists rfx_lane_vendors_token_idx on public.rfx_lane_vendors (invitation_token);

alter table public.rfx_events enable row level security;
alter table public.rfx_lanes enable row level security;
alter table public.rfx_lane_vendors enable row level security;

create policy "authenticated users can read rfx events"
  on public.rfx_events for select
  to authenticated
  using (true);

create policy "authenticated users can create rfx events"
  on public.rfx_events for insert
  to authenticated
  with check (true);

create policy "authenticated users can update rfx events"
  on public.rfx_events for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read rfx lanes"
  on public.rfx_lanes for select
  to authenticated
  using (true);

create policy "authenticated users can create rfx lanes"
  on public.rfx_lanes for insert
  to authenticated
  with check (true);

create policy "authenticated users can update rfx lanes"
  on public.rfx_lanes for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read rfx lane vendors"
  on public.rfx_lane_vendors for select
  to authenticated
  using (true);

create policy "authenticated users can create rfx lane vendors"
  on public.rfx_lane_vendors for insert
  to authenticated
  with check (true);

create policy "authenticated users can update rfx lane vendors"
  on public.rfx_lane_vendors for update
  to authenticated
  using (true)
  with check (true);
