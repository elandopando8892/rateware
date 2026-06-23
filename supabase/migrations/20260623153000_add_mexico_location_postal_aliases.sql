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
  ('rateware_manual_catalog', 'MX', 'MX RAMOS ARIZPE CU 25900 RAMOS ARIZPE MARKET', 'Ramos Arizpe, CU 25900', '25900', 'Ramos Arizpe', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX ESCOBEDO NL 66050 MONTERREY MARKET', 'Escobedo, NL 66050', '66050', 'Escobedo', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX APODACA NL 66600 MONTERREY MARKET', 'Apodaca, NL 66600', '66600', 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX MONTERREY NL 64000 MONTERREY MARKET', 'Monterrey, NL 64000', '64000', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX CD ACUNA CU 26220 ACUNA MARKET', 'Cd. Acuna, CU 26220', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX ACUNA CU 26220 ACUNA MARKET', 'Acuna, CU 26220', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX ARTEAGA CU 25350 RAMOS ARIZPE MARKET', 'Arteaga, CU 25350', '25350', 'Arteaga', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX CUAUTITLAN EM 54730 MEXICO CITY MARKET', 'Cuautitlan, MX 54730', '54730', 'Cuautitlan', 'EM', 'Estado de Mexico', 'Mexico City, MX', 'Mexico City Market', 'Central Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX QUERETARO QE 76220 QUERETARO MARKET', 'Queretaro, QE 76220', '76220', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX EL MARQUES QE 48124 QUERETARO MARKET', 'El Marques, QE 48124', '48124', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX EL MARQUES QE 76246 QUERETARO MARKET', 'El Marques, QE 76246', '76246', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX HERMOSILLO SO 83200 HERMOSILLO MARKET', 'Hermosillo, SO 83200', '83200', 'Hermosillo', 'SO', 'Sonora', 'Hermosillo, SO', 'Hermosillo Market', 'Northwest Mexico', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX SAN LUIS POTOSI SL 79525 SAN LUIS POTOSI MARKET', 'San Luis Potosi, SL 79525', '79525', 'San Luis Potosi', 'SL', 'San Luis Potosi', 'San Luis Potosi, SL', 'San Luis Potosi Market', 'Bajio', '{"reason":"specific Mexican postal alias from staging corrections"}'::jsonb, true, now())
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

with fixes(raw_pattern, zip_prefix, city, state_code, state_name, metro_city, market, region) as (
  values
    ('%ramos arizpe%', '25900', 'Ramos Arizpe', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico'),
    ('%escobedo%', '66050', 'Escobedo', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%apodaca%', '66600', 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%monterrey%', '64000', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%acuna%', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico'),
    ('%acuña%', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico'),
    ('%arteaga%', '25350', 'Arteaga', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico'),
    ('%cuautitlan%', '54730', 'Cuautitlan', 'EM', 'Estado de Mexico', 'Mexico City, MX', 'Mexico City Market', 'Central Mexico'),
    ('%queretaro%', '76220', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%querétaro%', '76220', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%el marques%', '76246', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%el marqués%', '76246', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%hermosillo%', '83200', 'Hermosillo', 'SO', 'Sonora', 'Hermosillo, SO', 'Hermosillo Market', 'Northwest Mexico'),
    ('%san luis potosi%', '79525', 'San Luis Potosi', 'SL', 'San Luis Potosi', 'San Luis Potosi, SL', 'San Luis Potosi Market', 'Bajio')
)
update public.rate_staging rows
set normalized_origin = fixes.metro_city,
    origin_country = 'MX',
    origin_zip_prefix = fixes.zip_prefix,
    origin_city = fixes.city,
    origin_state = fixes.state_code,
    origin_market = fixes.market,
    origin_region = fixes.region,
    origin_match_source = 'mexico_postal_alias_repair',
    origin_match_confidence = 96,
    origin_match_manual = false,
    origin_match_reason = 'corrected with Mexico postal alias catalog',
    location_match_status = case
      when rows.destination_country is not null or rows.destination_market is not null then 'matched'
      else 'partial'
    end
from fixes
where rows.origin is not null
  and lower(rows.origin) like fixes.raw_pattern
  and (
    rows.origin_country is distinct from 'MX'
    or rows.origin_state is distinct from fixes.state_code
    or rows.origin_market is distinct from fixes.market
  );

with fixes(raw_pattern, zip_prefix, city, state_code, state_name, metro_city, market, region) as (
  values
    ('%ramos arizpe%', '25900', 'Ramos Arizpe', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico'),
    ('%escobedo%', '66050', 'Escobedo', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%apodaca%', '66600', 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%monterrey%', '64000', 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico'),
    ('%acuna%', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico'),
    ('%acuña%', '26220', 'Cd. Acuna', 'CU', 'Coahuila', 'Cd. Acuna, CU', 'Acuna Market', 'Northeast Mexico'),
    ('%arteaga%', '25350', 'Arteaga', 'CU', 'Coahuila', 'Ramos Arizpe, CU', 'Ramos Arizpe Market', 'Northeast Mexico'),
    ('%cuautitlan%', '54730', 'Cuautitlan', 'EM', 'Estado de Mexico', 'Mexico City, MX', 'Mexico City Market', 'Central Mexico'),
    ('%queretaro%', '76220', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%querétaro%', '76220', 'Queretaro', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%el marques%', '76246', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%el marqués%', '76246', 'El Marques', 'QE', 'Queretaro', 'Queretaro, QE', 'Queretaro Market', 'Bajio'),
    ('%hermosillo%', '83200', 'Hermosillo', 'SO', 'Sonora', 'Hermosillo, SO', 'Hermosillo Market', 'Northwest Mexico'),
    ('%san luis potosi%', '79525', 'San Luis Potosi', 'SL', 'San Luis Potosi', 'San Luis Potosi, SL', 'San Luis Potosi Market', 'Bajio')
)
update public.rate_staging rows
set normalized_destination = fixes.metro_city,
    destination_country = 'MX',
    destination_zip_prefix = fixes.zip_prefix,
    destination_city = fixes.city,
    destination_state = fixes.state_code,
    destination_market = fixes.market,
    destination_region = fixes.region,
    destination_match_source = 'mexico_postal_alias_repair',
    destination_match_confidence = 96,
    destination_match_manual = false,
    destination_match_reason = 'corrected with Mexico postal alias catalog',
    location_match_status = case
      when rows.origin_country is not null or rows.origin_market is not null then 'matched'
      else 'partial'
    end
from fixes
where rows.destination is not null
  and lower(rows.destination) like fixes.raw_pattern
  and (
    rows.destination_country is distinct from 'MX'
    or rows.destination_state is distinct from fixes.state_code
    or rows.destination_market is distinct from fixes.market
  );
