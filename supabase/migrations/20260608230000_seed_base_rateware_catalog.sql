insert into public.rateware_catalog_items (
  source,
  category,
  raw_value,
  normalized_value,
  code,
  metadata,
  active,
  updated_at
)
values
  ('rateware_seed', 'equipment', 'DV53', 'DV53', 'DV53', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'equipment', 'Truck Trailer', 'Truck Trailer', 'TRUCK_TRAILER', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'trailer', 'DV53', 'DV53', 'DV53', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'trailer', 'Dry Van', 'Dry Van', 'DRY_VAN', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'config', '53 ft', '53 ft', '53FT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'Cross-border', 'Cross-border', 'CROSS_BORDER', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'Domestic US', 'Domestic US', 'DOMESTIC_US', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'Domestic MX', 'Domestic MX', 'DOMESTIC_MX', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'OW Impo', 'OW Impo', 'OW_IMPO', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'OW Import', 'OW Import', 'OW_IMPORT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'OW Export', 'OW Export', 'OW_EXPORT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'RT', 'RT', 'RT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'Round Trip', 'Round Trip', 'ROUND_TRIP', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'Truckload', 'Truckload', 'TRUCKLOAD', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'border_crossing', 'Puente Internacional', 'Puente Internacional', 'PUENTE_INTERNACIONAL', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'border_crossing', 'Nuevo Laredo / Laredo', 'Nuevo Laredo / Laredo', 'NLD_LRD', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'border_crossing', 'Reynosa / Pharr', 'Reynosa / Pharr', 'REX_PHR', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'border_crossing', 'Matamoros / Brownsville', 'Matamoros / Brownsville', 'MAT_BRO', '{"seeded":true}'::jsonb, true, now())
on conflict (source, category, raw_value, normalized_value) do update
set code = excluded.code,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();

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
  ('rateware_seed', 'MX', 'LERMA EDO MEX MX', 'Lerma, Edo Mex, MX', null, 'Lerma', 'MX', 'Mexico', 'Lerma, Edo Mex, MX', 'Mexico City / Toluca', 'Central Mexico', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'US', 'CANTON MS US', 'Canton, MS, US', null, 'Canton', 'MS', 'MS', 'Canton, MS, US', 'Jackson, MS', 'Southeast', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'US', 'BOWLING GREEN KY US', 'Bowling Green, KY, US', null, 'Bowling Green', 'KY', 'KY', 'Bowling Green, KY, US', 'Bowling Green, KY', 'Southeast', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'US', 'SMYRNA EMPTIES TN US', 'Smyrna Empties, TN, US', null, 'Smyrna', 'TN', 'TN', 'Smyrna Empties, TN, US', 'Nashville, TN', 'Southeast', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'MX', 'NUEVO LAREDO TM MX', 'Nuevo Laredo, TM, MX', null, 'Nuevo Laredo', 'TM', 'Tamaulipas', 'Nuevo Laredo, TM, MX', 'Nuevo Laredo', 'Northeast Mexico', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'US', 'LAREDO TX US', 'Laredo, TX, US', null, 'Laredo', 'TX', 'TX', 'Laredo, TX, US', 'Laredo, TX', 'Texas', '{"seeded":true}'::jsonb, true, now())
on conflict (source, location_key) do update
set country = excluded.country,
    raw_value = excluded.raw_value,
    city = excluded.city,
    state_code = excluded.state_code,
    state_name = excluded.state_name,
    metro_city = excluded.metro_city,
    market = excluded.market,
    region = excluded.region,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();
