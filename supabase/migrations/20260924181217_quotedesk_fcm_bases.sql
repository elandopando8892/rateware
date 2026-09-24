-- QuoteDesk (Bidware), phase 3: estimate lanes with the Freight Cost Model (FCM).
--
-- The FCM runs on its own database. QuoteDesk neither logs into the FCM nor
-- calls its API: these tables hold a copy of the FCM's calculation bases, and
-- quotedesk-api prices lanes with a port of the FCM engine (quotedesk-api/fcm.mjs).
--
-- fcm_cost_bases: the organization's FCM assumption sets (cost bases), with the
--   parameters as a "SECTION__Field" -> value map. usable marks the sets the FCM
--   itself would price with: the published version of a live cost base, or the
--   organization's active legacy set.
-- fcm_mex_lanes: the FCM MX lane table (km, casetas, hours per city pair and truck).
-- fcm_usa_lanes: the FCM US lane table (miles, transit days, route expenses).
-- fcm_usa_market_conditions: the FCM US market condition by KMA and trailer type.
-- The three reference tables are the same for every organization.
-- quotedesk_quote_lanes.fsc_diesel_per_gallon: the diesel level behind a lane's FSC.
-- Only the quotedesk-api edge function (service role) reads these tables.

create table if not exists public.fcm_cost_bases (
  id text primary key,
  owner_email text not null,
  organization_id text,
  fcm_organization_id text not null,
  fcm_organization_name text,
  fcm_cost_base_id text,
  code text,
  name text not null,
  scope text,
  cost_base_status text,
  version integer not null default 1,
  version_status text not null,
  is_active boolean not null default false,
  usable boolean not null default false,
  is_default boolean not null default false,
  policy text not null default 'OPERATIONAL_V3' check (policy in ('OPERATIONAL_V3', 'WORKBOOK_V3')),
  currency text,
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  param_count integer not null default 0,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists fcm_cost_bases_owner_idx on public.fcm_cost_bases (owner_email, usable);

create table if not exists public.fcm_mex_lanes (
  lane_key_norm text primary key,
  lane_key text not null,
  km numeric not null check (km >= 0),
  tolls_mxn numeric not null default 0,
  driver_expenses_mxn numeric,
  pension_mxn numeric,
  trip_days numeric,
  route_hours numeric,
  synced_at timestamptz not null default now()
);

create table if not exists public.fcm_usa_lanes (
  lane_key text primary key,
  out_state text,
  miles numeric not null check (miles >= 0),
  truck_days numeric,
  route_expenses numeric,
  synced_at timestamptz not null default now()
);

create table if not exists public.fcm_usa_market_conditions (
  market text primary key,
  dry_van text,
  flatbed text,
  reefer text,
  region text,
  synced_at timestamptz not null default now()
);

alter table public.quotedesk_quote_lanes
  add column if not exists fsc_diesel_per_gallon numeric
  check (fsc_diesel_per_gallon is null or fsc_diesel_per_gallon >= 0);

alter table public.fcm_cost_bases enable row level security;
alter table public.fcm_mex_lanes enable row level security;
alter table public.fcm_usa_lanes enable row level security;
alter table public.fcm_usa_market_conditions enable row level security;
revoke all on table public.fcm_cost_bases from anon, authenticated;
revoke all on table public.fcm_mex_lanes from anon, authenticated;
revoke all on table public.fcm_usa_lanes from anon, authenticated;
revoke all on table public.fcm_usa_market_conditions from anon, authenticated;

comment on table public.fcm_cost_bases is
  'Bidware QuoteDesk: copy of the organization''s FCM cost bases (assumption sets) and their parameters. Service role only.';
comment on table public.fcm_mex_lanes is
  'Bidware QuoteDesk: copy of the FCM MX lane table (km, casetas MXN, hours). Service role only.';
comment on table public.fcm_usa_lanes is
  'Bidware QuoteDesk: copy of the FCM US lane table (miles, transit days, route expenses). Service role only.';
comment on table public.fcm_usa_market_conditions is
  'Bidware QuoteDesk: copy of the FCM US market conditions by KMA and trailer type. Service role only.';
comment on column public.quotedesk_quote_lanes.fsc_diesel_per_gallon is
  'Diesel USD/gal of the weekly EIA index behind fsc_per_mile (the "@" level shown with the FSC).';
