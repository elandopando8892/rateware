create table if not exists public.rateware_fuel_regions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  state_code text not null,
  fuel_region text not null,
  diesel_per_gallon numeric,
  fsc_per_mile numeric,
  source text not null default 'usaFuel',
  active boolean not null default true,
  unique (state_code, source)
);

create index if not exists rateware_fuel_regions_state_idx
  on public.rateware_fuel_regions (state_code, active);

create table if not exists public.rateware_fsc_trend (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'usaFSCtrend',
  api_fetch text,
  fuel_region text not null,
  index_date date not null,
  diesel_per_gallon numeric not null,
  fsc_per_mile numeric not null,
  active boolean not null default true,
  unique (source, fuel_region, index_date, api_fetch)
);

create index if not exists rateware_fsc_trend_lookup_idx
  on public.rateware_fsc_trend (fuel_region, index_date desc, active);

create table if not exists public.rateware_fsc_index (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'usaFSCindex',
  diesel_from numeric not null,
  diesel_to numeric not null,
  ltl_percent numeric,
  truckload_per_mile numeric not null,
  active boolean not null default true,
  unique (source, diesel_from, diesel_to)
);

alter table public.rate_staging
  add column if not exists carrier_fsc_per_mile numeric,
  add column if not exists normalized_fsc_per_mile numeric,
  add column if not exists normalized_fsc_total numeric,
  add column if not exists fuel_region text,
  add column if not exists fuel_index_date date,
  add column if not exists fuel_diesel_per_gallon numeric,
  add column if not exists fuel_delta numeric,
  add column if not exists fuel_source text,
  add column if not exists normalized_all_in_rate numeric;

create index if not exists rate_staging_fuel_region_idx
  on public.rate_staging (fuel_region);

alter table public.rateware_fuel_regions enable row level security;
alter table public.rateware_fsc_trend enable row level security;
alter table public.rateware_fsc_index enable row level security;

create policy "authenticated users can read fuel regions"
  on public.rateware_fuel_regions for select
  to authenticated
  using (true);

create policy "authenticated users can read fsc trend"
  on public.rateware_fsc_trend for select
  to authenticated
  using (true);

create policy "authenticated users can read fsc index"
  on public.rateware_fsc_index for select
  to authenticated
  using (true);
