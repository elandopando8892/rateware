-- QuoteDesk (Bidware): freight quote tracker. A quote belongs to a shipper and
-- holds one or more routes; each route carries its inputs (homologated with
-- rfx_lanes), miles, cost components, accessorials and markup, plus the derived
-- base cost, all-in and margin computed by the quotedesk-api edge function.
-- Only that function (service role) reads or writes these tables.

create table if not exists public.quotedesk_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  folio_number integer not null check (folio_number > 0),
  folio text not null,
  shipper_id uuid references public.shippers(id) on delete set null,
  shipper_name text,
  shipper_opportunity_id uuid references public.shipper_opportunities(id) on delete set null,
  title text,
  quote_type text not null default 'spot' check (quote_type in ('spot', 'contract')),
  channel text not null default 'email'
    check (channel in ('email', 'whatsapp', 'phone', 'rfi', 'portal', 'other')),
  requested_by text,
  assigned_to_email text,
  currency text not null default 'USD' check (currency in ('USD', 'MXN')),
  fx_usd_mxn numeric(12, 4),
  fx_rate_date date,
  valid_until date,
  status text not null default 'new'
    check (status in ('new', 'estimating', 'quoted', 'bid_room', 'won', 'lost', 'expired', 'archived')),
  status_changed_at timestamptz not null default now(),
  quoted_at timestamptz,
  closed_at timestamptz,
  outcome_reason text,
  rfx_event_id uuid references public.rfx_events(id) on delete set null,
  bid_room_launched_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, folio_number)
);

create index if not exists quotedesk_quotes_owner_status_idx
  on public.quotedesk_quotes (owner_email, status, updated_at desc);
create index if not exists quotedesk_quotes_rfx_event_idx
  on public.quotedesk_quotes (rfx_event_id) where rfx_event_id is not null;
create index if not exists quotedesk_quotes_shipper_idx
  on public.quotedesk_quotes (shipper_id) where shipper_id is not null;

create table if not exists public.quotedesk_quote_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  quote_id uuid not null references public.quotedesk_quotes(id) on delete cascade,
  lane_number integer not null check (lane_number > 0),
  origin text,
  origin_city text,
  origin_state text,
  origin_country text,
  origin_postal_code text,
  origin_market text,
  origin_region text,
  destination text,
  destination_city text,
  destination_state text,
  destination_country text,
  destination_postal_code text,
  destination_market text,
  destination_region text,
  equipment text,
  trailer text,
  config text,
  operation text,
  service text,
  border_crossing text,
  crossing_model text,
  weight_lb numeric(12, 2) check (weight_lb is null or weight_lb >= 0),
  weekly_volume numeric(12, 2) check (weekly_volume is null or weekly_volume >= 0),
  mx_miles numeric(10, 1) check (mx_miles is null or mx_miles >= 0),
  us_miles numeric(10, 1) check (us_miles is null or us_miles >= 0),
  miles_source text,
  linehaul_mx numeric(14, 2) check (linehaul_mx is null or linehaul_mx >= 0),
  linehaul_us numeric(14, 2) check (linehaul_us is null or linehaul_us >= 0),
  fuel_amount numeric(14, 2) check (fuel_amount is null or fuel_amount >= 0),
  fsc_per_mile numeric(10, 4) check (fsc_per_mile is null or fsc_per_mile >= 0),
  fsc_rate_date date,
  border_amount numeric(14, 2) check (border_amount is null or border_amount >= 0),
  carrier_rate numeric(14, 2) check (carrier_rate is null or carrier_rate >= 0),
  accessorials jsonb not null default '[]'::jsonb check (jsonb_typeof(accessorials) = 'array'),
  markup_mode text not null default 'percent_on_cost'
    check (markup_mode in ('percent_on_cost', 'fixed_amount', 'target_margin')),
  markup_value numeric(14, 4),
  base_cost numeric(14, 2),
  accessorials_total numeric(14, 2) not null default 0,
  markup_amount numeric(14, 2),
  all_in_rate numeric(14, 2),
  margin_amount numeric(14, 2),
  margin_pct numeric(9, 4),
  cost_source text not null default 'manual' check (cost_source in ('manual', 'bid_room_award', 'fcm')),
  rfx_lane_id uuid references public.rfx_lanes(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  unique (quote_id, lane_number)
);

create index if not exists quotedesk_quote_lanes_owner_quote_idx
  on public.quotedesk_quote_lanes (owner_email, quote_id, lane_number);
create index if not exists quotedesk_quote_lanes_rfx_lane_idx
  on public.quotedesk_quote_lanes (rfx_lane_id) where rfx_lane_id is not null;

create table if not exists public.quotedesk_accessorial_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  code text not null,
  label text not null,
  unit text not null check (unit in ('hour', 'event', 'trip', 'day', 'mile', 'other')),
  default_rate numeric(14, 2) not null default 0 check (default_rate >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'MXN')),
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (owner_email, code)
);

alter table public.quotedesk_quotes enable row level security;
alter table public.quotedesk_quote_lanes enable row level security;
alter table public.quotedesk_accessorial_catalog enable row level security;
revoke all on table public.quotedesk_quotes from anon, authenticated;
revoke all on table public.quotedesk_quote_lanes from anon, authenticated;
revoke all on table public.quotedesk_accessorial_catalog from anon, authenticated;

comment on table public.quotedesk_quotes is
  'Bidware QuoteDesk: one freight quote per shipper request. Written only by the quotedesk-api edge function.';
comment on table public.quotedesk_quote_lanes is
  'Bidware QuoteDesk: routes of a quote with miles, cost components, accessorials and markup; derived totals are computed server-side.';
comment on table public.quotedesk_accessorial_catalog is
  'Bidware QuoteDesk: per-workspace accessorial catalog (label, unit, default rate) used by the accessorials + markup modal.';
