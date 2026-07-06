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
  ('rateware_manual_catalog', 'MX', '666 APODACA NL MONTERREY MARKET', 'Apodaca, NL 66600', '666', 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"country-locked Mexican metro alias; MX locations must not match US/CA ZIP prefixes"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '640 MONTERREY NL MONTERREY MARKET', 'Monterrey, NL 64000', '640', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"country-locked Mexican metro alias; MX locations must not match US/CA ZIP prefixes"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '520 LERMA MX TOLUCA MARKET', 'Lerma, MX 52000', '520', 'Lerma', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '520 LERMA EM TOLUCA MARKET', 'Lerma, EM 52000', '520', 'Lerma', 'EM', 'Estado de Mexico', 'Toluca, EM', 'Toluca Market', 'Central Mexico', '{"reason":"EM alias for Estado de Mexico; MX remains accepted as business state code"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '500 TOLUCA MX TOLUCA MARKET', 'Toluca, MX 50000', '500', 'Toluca', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'US', '750 DALLAS TX DALLAS MKT TX', 'Dallas, TX 75000', '750', 'Dallas', 'TX', 'Texas', 'Dallas, TX', 'Dallas Mkt (TX)', 'South Central', '{"reason":"country-locked US KMA alias from ZIP catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'US', '780 LAREDO TX LAREDO MKT TX', 'Laredo, TX 78000', '780', 'Laredo', 'TX', 'Texas', 'Laredo, TX', 'Laredo Mkt (TX)', 'South Central', '{"reason":"country-locked US border KMA alias from ZIP catalog"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', '880 NUEVO LAREDO TM NUEVO LAREDO MARKET', 'Nuevo Laredo, TM 88000', '880', 'Nuevo Laredo', 'TM', 'Tamaulipas', 'Nuevo Laredo, TM', 'Nuevo Laredo Market', 'Northeast Mexico', '{"reason":"country-locked MX border city counterpart for Laredo, TX"}'::jsonb, true, now())
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

create index if not exists rateware_locations_country_zip_active_idx
  on public.rateware_locations (country, zip_prefix, active);
