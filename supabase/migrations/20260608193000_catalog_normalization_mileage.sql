create table if not exists public.rateware_catalog_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'rateware_google_catalog',
  category text not null,
  raw_value text not null,
  normalized_value text not null,
  code text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (source, category, raw_value, normalized_value)
);

create index if not exists rateware_catalog_items_category_idx
  on public.rateware_catalog_items (category, active);

create index if not exists rateware_catalog_items_code_idx
  on public.rateware_catalog_items (category, code);

create table if not exists public.rateware_lane_mileage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null,
  country_scope text not null check (country_scope in ('us', 'mx', 'cross_border', 'unknown')),
  route_key text not null,
  origin text,
  destination text,
  equipment text,
  trailer text,
  config text,
  operation text,
  service text,
  driver text,
  miles numeric,
  km numeric,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unique (source, route_key)
);

create index if not exists rateware_lane_mileage_route_key_idx
  on public.rateware_lane_mileage (route_key, active);

alter table public.rate_staging
  add column if not exists normalized_origin text,
  add column if not exists normalized_destination text,
  add column if not exists origin_market text,
  add column if not exists destination_market text,
  add column if not exists normalized_equipment text,
  add column if not exists normalized_trailer text,
  add column if not exists normalized_config text,
  add column if not exists normalized_operation text,
  add column if not exists normalized_service text,
  add column if not exists normalized_driver text,
  add column if not exists catalog_match_status text not null default 'unmatched',
  add column if not exists mileage_source text,
  add column if not exists calculated_miles numeric,
  add column if not exists calculated_km numeric;

create index if not exists rate_staging_catalog_match_status_idx
  on public.rate_staging (catalog_match_status);

alter table public.rateware_catalog_items enable row level security;
alter table public.rateware_lane_mileage enable row level security;

create policy "authenticated users can read catalog items"
  on public.rateware_catalog_items for select
  to authenticated
  using (true);

create policy "authenticated users can read lane mileage"
  on public.rateware_lane_mileage for select
  to authenticated
  using (true);
