create table if not exists public.rateware_locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'cusCatalog',
  country text not null check (country in ('US', 'CA', 'MX', 'UNKNOWN')),
  location_key text not null,
  raw_value text not null,
  zip_prefix text,
  city text,
  state_code text,
  state_name text,
  metro_city text,
  market text,
  region text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (source, location_key)
);

create index if not exists rateware_locations_lookup_idx
  on public.rateware_locations (country, active, location_key);

create index if not exists rateware_locations_zip_idx
  on public.rateware_locations (zip_prefix, active);

alter table public.rate_staging
  add column if not exists origin_country text,
  add column if not exists origin_zip_prefix text,
  add column if not exists origin_city text,
  add column if not exists origin_state text,
  add column if not exists origin_region text,
  add column if not exists destination_country text,
  add column if not exists destination_zip_prefix text,
  add column if not exists destination_city text,
  add column if not exists destination_state text,
  add column if not exists destination_region text,
  add column if not exists location_match_status text not null default 'unmatched';

create index if not exists rate_staging_location_match_status_idx
  on public.rate_staging (location_match_status);

alter table public.rateware_locations enable row level security;

create policy "authenticated users can read rateware locations"
  on public.rateware_locations for select
  to authenticated
  using (true);
