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
  ('rateware_manual_catalog', 'MX', '259 RAMOS ARIZPE CU RAMOS ARIZPE MARKET', 'Ramos Arizpe, CU 25900', '259', 'Ramos Arizpe', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '660 ESCOBEDO NL MONTERREY MARKET', 'Escobedo, NL 66050', '660', 'Escobedo', 'NL', 'Nuevo Leon', 'Escobedo, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '262 ACUNA CU ACUNA MARKET', 'Acuna, CU 26220', '262', 'Acuna', 'CU', 'Coahuila', 'Acuna, CU', 'Acuna Market', 'Northeast Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '253 ARTEAGA CU SALTILLO MARKET', 'Arteaga, CU 25350', '253', 'Arteaga', 'CU', 'Coahuila', 'Arteaga, CU', 'Saltillo Market', 'Northeast Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '760 QUERETARO QE QUERETARO MARKET', 'Queretaro, QE 76000', '760', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '832 HERMOSILLO SO HERMOSILLO MARKET', 'Hermosillo, SO 83200', '832', 'Hermosillo', 'SO', 'Sonora', 'Hermosillo, SO', 'Hermosillo Market', 'Northwest Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '547 CUAUTITLAN MX MEXICO CITY TOLUCA', 'Cuautitlan, MX 54730', '547', 'Cuautitlan', 'MX', 'Estado de Mexico', 'Cuautitlan, MX', 'Mexico City / Toluca', 'Central Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '762 EL MARQUES QE QUERETARO MARKET', 'El Marques, QE 76246', '762', 'El Marques', 'QE', 'Queretaro', 'El Marques, QE', 'Queretaro Market', 'Bajio', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '792 SAN LUIS POTOSI SL SAN LUIS POTOSI MARKET', 'San Luis Potosi, SL 79255', '792', 'San Luis Potosi', 'SL', 'San Luis Potosi', 'San Luis Potosi, SL', 'San Luis Potosi Market', 'Bajio', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '640 MONTERREY NL MONTERREY MARKET', 'Monterrey, NL 64000', '640', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"manual guard for Mexican city/state/postal match"}'::jsonb, true, now())
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

create index if not exists rateware_locations_country_state_active_idx
  on public.rateware_locations (country, state_code, active);
