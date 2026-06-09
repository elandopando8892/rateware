update public.rateware_locations
set country = 'MX',
    state_code = 'EM',
    state_name = 'Estado de Mexico',
    market = 'Toluca Market',
    region = 'Central Mexico',
    zip_prefix = coalesce(zip_prefix, '500'),
    updated_at = now()
where active = true
  and (
    raw_value ilike '%toluca%'
    or raw_value ilike '%lerma%'
    or metro_city ilike '%toluca%'
    or metro_city ilike '%lerma%'
  );

insert into public.rateware_locations (
  source,
  country,
  location_key,
  raw_value,
  zip_prefix,
  city,
  state_code,
  state_name,
  metro_city,
  market,
  region,
  metadata,
  active,
  updated_at
)
values
  ('rateware_manual_catalog', 'MX', '500 LERMA ESTADO DE MEXICO TOLUCA MARKET', 'Lerma, EM', '500', 'Lerma', 'EM', 'Estado de Mexico', 'Lerma, Estado de Mexico', 'Toluca Market', 'Central Mexico', '{"reason":"specific city alias mapped to Mexican metro catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '500 LERMA EDO MEX MX TOLUCA MARKET', 'Lerma, Edo Mex, MX', '500', 'Lerma', 'EM', 'Estado de Mexico', 'Lerma, Estado de Mexico', 'Toluca Market', 'Central Mexico', '{"reason":"specific city alias mapped to Mexican metro catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '500 TOLUCA ESTADO DE MEXICO TOLUCA MARKET', 'Toluca, MX', '500', 'Toluca', 'EM', 'Estado de Mexico', 'Toluca, Estado de Mexico', 'Toluca Market', 'Central Mexico', '{"reason":"canonical Toluca metro from Mexican location catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '880 NUEVO LAREDO TAMAULIPAS NUEVO LAREDO MARKET', 'Nuevo Laredo, TM', '880', 'Nuevo Laredo', 'TM', 'Tamaulipas', 'Nuevo Laredo, Tamaulipas', 'Nuevo Laredo Market', 'Northeast Mexico', '{"reason":"default Mexican border city"}'::jsonb, true, now())
on conflict (source, location_key) do update
set country = excluded.country,
    raw_value = excluded.raw_value,
    zip_prefix = excluded.zip_prefix,
    city = excluded.city,
    state_code = excluded.state_code,
    state_name = excluded.state_name,
    metro_city = excluded.metro_city,
    market = excluded.market,
    region = excluded.region,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();
