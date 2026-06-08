create table if not exists public.border_crossing_pairs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mx_city text not null,
  mx_state text not null,
  mx_country text not null default 'MX',
  us_city text not null,
  us_state text not null,
  us_country text not null default 'US',
  crossing_name text not null,
  default_rank integer not null default 100,
  active boolean not null default true,
  unique (mx_city, mx_state, us_city, us_state, crossing_name)
);

create index if not exists border_crossing_pairs_lookup_idx
  on public.border_crossing_pairs (active, mx_state, us_state, default_rank);

insert into public.border_crossing_pairs (mx_city, mx_state, us_city, us_state, crossing_name, default_rank)
values
  ('Nuevo Laredo', 'TM', 'Laredo', 'TX', 'Nuevo Laredo / Laredo', 10),
  ('Reynosa', 'TM', 'Pharr', 'TX', 'Reynosa / Pharr', 20),
  ('Reynosa', 'TM', 'McAllen', 'TX', 'Reynosa / McAllen', 25),
  ('Matamoros', 'TM', 'Brownsville', 'TX', 'Matamoros / Brownsville', 30),
  ('Cd. Juarez', 'CH', 'El Paso', 'TX', 'Cd. Juarez / El Paso', 40),
  ('Piedras Negras', 'CU', 'Eagle Pass', 'TX', 'Piedras Negras / Eagle Pass', 50),
  ('Cd. Acuña', 'CU', 'Del Rio', 'TX', 'Cd. Acuña / Del Rio', 60),
  ('Nogales', 'SO', 'Nogales', 'AZ', 'Nogales / Nogales', 70),
  ('Tijuana', 'BN', 'Otay Mesa', 'CA', 'Tijuana / Otay Mesa', 80),
  ('Mexicali', 'BN', 'Calexico', 'CA', 'Mexicali / Calexico', 90)
on conflict (mx_city, mx_state, us_city, us_state, crossing_name) do update
set default_rank = excluded.default_rank,
    active = true,
    updated_at = now();

create table if not exists public.rateware_lane_legs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rate_staging_id uuid not null references public.rate_staging(id) on delete cascade,
  leg_sequence integer not null,
  leg_type text not null check (leg_type in ('mx_linehaul', 'border_crossing', 'us_linehaul', 'domestic', 'needs_review')),
  origin text,
  destination text,
  origin_country text,
  destination_country text,
  border_pair_id uuid references public.border_crossing_pairs(id) on delete set null,
  miles numeric,
  km numeric,
  mileage_source text,
  fuel_region text,
  fsc_per_mile numeric,
  fsc_total numeric,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status text not null default 'draft' check (status in ('draft', 'needs_mileage', 'ready', 'needs_review')),
  metadata jsonb not null default '{}'::jsonb,
  unique (rate_staging_id, leg_sequence)
);

create index if not exists rateware_lane_legs_staging_idx
  on public.rateware_lane_legs (rate_staging_id, leg_sequence);

alter table public.rate_staging
  add column if not exists lane_type text,
  add column if not exists leg_status text not null default 'not_built',
  add column if not exists leg_summary text;

alter table public.border_crossing_pairs enable row level security;
alter table public.rateware_lane_legs enable row level security;

create policy "authenticated users can read border crossing pairs"
  on public.border_crossing_pairs for select
  to authenticated
  using (true);

create policy "authenticated users can read lane legs"
  on public.rateware_lane_legs for select
  to authenticated
  using (true);
