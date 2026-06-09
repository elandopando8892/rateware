insert into public.rateware_assumptions (
  source,
  section,
  field,
  recommended_value,
  raw_value,
  unit,
  refresh_frequency,
  metadata,
  active,
  updated_at
)
values
  ('rateware_google_catalog', 'Fuel', 'Diesel MX', 28, '28', 'MXN/L', 'weekly', '{"source_tab":"Assumptions","seeded":true}'::jsonb, true, now()),
  ('rateware_google_catalog', 'Fuel', 'Rendimiento Cargado', 2.8, '2.8', 'km/L', null, '{"source_tab":"Assumptions","seeded":true}'::jsonb, true, now()),
  ('rateware_google_catalog', 'Fuel', 'Fuel Escalation Buffer', 0.05, '0.05', 'factor', null, '{"source_tab":"Assumptions","seeded":true}'::jsonb, true, now()),
  ('rateware_google_catalog', 'Finance', 'Tipo de Cambio', 17.5, '17.5', 'MXN/USD', null, '{"source_tab":"Assumptions","seeded":true}'::jsonb, true, now())
on conflict (source, field) do update
set section = excluded.section,
    recommended_value = excluded.recommended_value,
    raw_value = excluded.raw_value,
    unit = excluded.unit,
    refresh_frequency = excluded.refresh_frequency,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();

insert into public.rateware_factor_items (
  source,
  factor_group,
  factor_name,
  recommended_value,
  raw_value,
  unit,
  notes,
  lookup_key,
  metadata,
  active,
  updated_at
)
values (
  'rateware_google_catalog',
  'Equipment',
  'Truck Trailer',
  1,
  '1',
  'factor',
  'Default fuel efficiency factor from Factors sheet.',
  'EQUIPMENT TRUCK TRAILER',
  '{"source_tab":"Factors","seeded":true}'::jsonb,
  true,
  now()
)
on conflict (source, lookup_key) do update
set factor_group = excluded.factor_group,
    factor_name = excluded.factor_name,
    recommended_value = excluded.recommended_value,
    raw_value = excluded.raw_value,
    unit = excluded.unit,
    notes = excluded.notes,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();

insert into public.rateware_mx_diesel_index (
  source,
  period_month,
  country,
  market_key,
  market,
  diesel_mxn_per_liter,
  source_note,
  active,
  updated_at
)
values (
  'rateware_assumptions',
  date_trunc('month', current_date - interval '1 month')::date,
  'MX',
  'MX_NATIONAL',
  'Mexico national',
  28,
  'Seeded from Rateware Assumptions Diesel MX.',
  true,
  now()
)
on conflict (source, period_month, market_key) do update
set diesel_mxn_per_liter = excluded.diesel_mxn_per_liter,
    source_note = excluded.source_note,
    active = true,
    updated_at = now();

insert into public.rateware_fx_rates (
  source,
  period_month,
  currency_pair,
  rate,
  source_note,
  active,
  updated_at
)
values (
  'rateware_assumptions',
  date_trunc('month', current_date - interval '1 month')::date,
  'MXN/USD',
  17.5,
  'Seeded from Rateware Assumptions Tipo de Cambio.',
  true,
  now()
)
on conflict (source, period_month, currency_pair) do update
set rate = excluded.rate,
    source_note = excluded.source_note,
    active = true,
    updated_at = now();
