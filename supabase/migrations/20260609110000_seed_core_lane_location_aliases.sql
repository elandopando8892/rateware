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
  ('rateware_manual_catalog', 'MX', '640 APODACA NUEVO LEON MONTERREY MARKET', 'Apodaca, NL', '640', 'Apodaca', 'NL', 'Nuevo Leon', 'Apodaca, Nuevo Leon', 'Monterrey Market', 'Northeast Mexico', '{"reason":"specific city alias mapped to Monterrey metro catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '640 MONTERREY NUEVO LEON MONTERREY MARKET', 'Monterrey, NL', '640', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, Nuevo Leon', 'Monterrey Market', 'Northeast Mexico', '{"reason":"canonical Monterrey metro from Mexican location catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'US', '750 DALLAS TX DALLAS MKT TX', 'Dallas, TX', '750', 'Dallas', 'TX', 'TX', 'Dallas, TX', 'Dallas Mkt (TX)', 'Texas', '{"reason":"canonical Dallas market from zip catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'US', '780 LAREDO TX LAREDO MKT TX', 'Laredo, TX', '780', 'Laredo', 'TX', 'TX', 'Laredo, TX', 'Laredo Mkt (TX)', 'Texas', '{"reason":"canonical Laredo border market from zip catalog"}'::jsonb, true, now())
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
