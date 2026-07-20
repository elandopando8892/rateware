-- Asynchronous carrier offers belong to Ratebook, not to the live Bid Room.
-- The carrier portal only reaches these rows through a signed, opaque share token.

create table if not exists public.rfx_ratebook_carrier_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ratebook_id uuid not null references public.rfx_ratebooks(id) on delete cascade,
  ratebook_share_id uuid not null references public.rfx_ratebook_shares(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  package_lane_id uuid not null references public.rfx_package_lanes(id) on delete cascade,
  demand_lane_id uuid references public.rfx_demand_lanes(id) on delete set null,
  owner_email text,
  organization_id text,
  status text not null default 'submitted' check (status in ('submitted', 'withdrawn')),
  all_in_rate numeric not null check (all_in_rate > 0),
  currency text not null default 'USD' check (char_length(trim(currency)) = 3),
  weekly_capacity numeric check (weekly_capacity is null or weekly_capacity >= 0),
  transit_days numeric check (transit_days is null or transit_days >= 0),
  valid_until date,
  quote_reference text,
  notes text,
  source text not null default 'ratebook_carrier_portal',
  revision_number integer not null default 1 check (revision_number > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (ratebook_share_id, package_lane_id)
);

create index if not exists rfx_ratebook_carrier_quotes_ratebook_lane_idx
  on public.rfx_ratebook_carrier_quotes (ratebook_id, package_lane_id, status, updated_at desc);
create index if not exists rfx_ratebook_carrier_quotes_vendor_idx
  on public.rfx_ratebook_carrier_quotes (vendor_id, updated_at desc);

create table if not exists public.rfx_ratebook_carrier_quote_revisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_id uuid not null references public.rfx_ratebook_carrier_quotes(id) on delete cascade,
  ratebook_id uuid not null references public.rfx_ratebooks(id) on delete cascade,
  ratebook_share_id uuid not null references public.rfx_ratebook_shares(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  package_lane_id uuid not null references public.rfx_package_lanes(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  action text not null check (action in ('submitted', 'updated', 'withdrawn')),
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists rfx_ratebook_quote_revisions_quote_idx
  on public.rfx_ratebook_carrier_quote_revisions (quote_id, revision_number desc);

-- No direct Data API policy: the authenticated procurement API and the opaque
-- carrier portal token enforce workspace and carrier scope server-side.
alter table public.rfx_ratebook_carrier_quotes enable row level security;
alter table public.rfx_ratebook_carrier_quote_revisions enable row level security;
