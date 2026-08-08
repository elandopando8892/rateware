-- Daily spot FX for Bid Room offer comparison.
--
-- This is deliberately NOT rateware_fx_rates. That table holds one monthly
-- costing assumption per source (the "Tipo de Cambio" cell from the Assumptions
-- sheet) and the fuel/costing pipeline reads it by period_month. Bid comparison
-- needs the day's rate, so it gets its own table rather than changing the
-- granularity of a table other pipelines depend on.

create table if not exists public.rateware_fx_spot_rates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'banxico_fix',
  rate_date date not null,
  currency_pair text not null default 'USD/MXN',
  -- How many units of the quote currency buy one unit of the base currency.
  -- For 'USD/MXN' this is pesos per dollar, e.g. 17.1234.
  rate numeric not null check (rate > 0),
  source_note text,
  unique (source, rate_date, currency_pair)
);

-- Resolving "the newest rate at or before today" is the only read pattern.
create index if not exists rateware_fx_spot_rates_lookup_idx
  on public.rateware_fx_spot_rates (currency_pair, rate_date desc);

alter table public.rateware_fx_spot_rates enable row level security;

create policy "authenticated users can read fx spot rates"
  on public.rateware_fx_spot_rates for select
  to authenticated
  using (true);

comment on table public.rateware_fx_spot_rates is
  'Daily spot FX used to compare Bid Room offers quoted in different currencies. Written by the sync-banxico-fx function.';
comment on column public.rateware_fx_spot_rates.rate is
  'Units of quote currency per one unit of base currency. USD/MXN = pesos per dollar.';
