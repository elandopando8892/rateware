create table if not exists public.rateware_assumptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'rateware_google_catalog',
  section text,
  field text not null,
  recommended_value numeric,
  raw_value text,
  unit text,
  refresh_frequency text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (source, field)
);

create index if not exists rateware_assumptions_field_idx
  on public.rateware_assumptions (field, active);

create table if not exists public.rateware_factor_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'rateware_google_catalog',
  factor_group text not null,
  factor_name text not null,
  recommended_value numeric,
  raw_value text,
  unit text,
  notes text,
  lookup_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (source, lookup_key)
);

create index if not exists rateware_factor_items_lookup_idx
  on public.rateware_factor_items (lookup_key, active);

create table if not exists public.rateware_mx_diesel_index (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'rateware_assumptions',
  period_month date not null,
  country text not null default 'MX',
  market_key text not null default 'MX_NATIONAL',
  market text,
  diesel_mxn_per_liter numeric not null,
  source_note text,
  active boolean not null default true,
  unique (source, period_month, market_key)
);

create index if not exists rateware_mx_diesel_index_lookup_idx
  on public.rateware_mx_diesel_index (period_month desc, market_key, active);

create table if not exists public.rateware_fx_rates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'rateware_assumptions',
  period_month date not null,
  currency_pair text not null default 'MXN/USD',
  rate numeric not null,
  source_note text,
  active boolean not null default true,
  unique (source, period_month, currency_pair)
);

create index if not exists rateware_fx_rates_lookup_idx
  on public.rateware_fx_rates (currency_pair, period_month desc, active);

alter table public.rateware_lane_legs
  add column if not exists diesel_price_mxn_per_liter numeric,
  add column if not exists diesel_price_usd_per_liter numeric,
  add column if not exists fx_rate_mxn_usd numeric,
  add column if not exists fuel_efficiency_km_per_liter numeric,
  add column if not exists fuel_factor numeric,
  add column if not exists fuel_cost_usd numeric,
  add column if not exists fuel_source text,
  add column if not exists fx_source text;

alter table public.rate_staging
  add column if not exists mx_diesel_mxn_per_liter numeric,
  add column if not exists mx_diesel_usd_per_liter numeric,
  add column if not exists fx_rate_mxn_usd numeric,
  add column if not exists mx_fuel_efficiency_km_per_liter numeric,
  add column if not exists mx_fuel_factor numeric,
  add column if not exists mx_fuel_cost_usd numeric,
  add column if not exists mx_fuel_source text,
  add column if not exists fx_source text;

alter table public.rateware_assumptions enable row level security;
alter table public.rateware_factor_items enable row level security;
alter table public.rateware_mx_diesel_index enable row level security;
alter table public.rateware_fx_rates enable row level security;

create policy "authenticated users can read rateware assumptions"
  on public.rateware_assumptions for select
  to authenticated
  using (true);

create policy "authenticated users can read rateware factors"
  on public.rateware_factor_items for select
  to authenticated
  using (true);

create policy "authenticated users can read mx diesel index"
  on public.rateware_mx_diesel_index for select
  to authenticated
  using (true);

create policy "authenticated users can read fx rates"
  on public.rateware_fx_rates for select
  to authenticated
  using (true);
