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
  ('rateware_manual_catalog', 'MX', 'MX TOLUCA MX ESTADO DE MEXICO TOLUCA MARKET', 'Toluca, MX', null, 'Toluca', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX TOLUCA MX 50000 ESTADO DE MEXICO TOLUCA MARKET', 'Toluca, MX 50000', '50000', 'Toluca', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX LERMA MX ESTADO DE MEXICO TOLUCA MARKET', 'Lerma, MX', null, 'Lerma', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX LERMA MX 52000 ESTADO DE MEXICO TOLUCA MARKET', 'Lerma, MX 52000', '52000', 'Lerma', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX LERMA EDO MEX MX ESTADO DE MEXICO TOLUCA MARKET', 'Lerma, Edo Mex, MX', null, 'Lerma', 'MX', 'Estado de Mexico', 'Toluca, MX', 'Toluca Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX CUAUTITLAN MX 54730 ESTADO DE MEXICO MEXICO CITY MARKET', 'Cuautitlan, MX 54730', '54730', 'Cuautitlan', 'MX', 'Estado de Mexico', 'Mexico City, MX', 'Mexico City Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX CUAUTITLAN IZCALLI MX 54730 ESTADO DE MEXICO MEXICO CITY MARKET', 'Cuautitlan Izcalli, MX 54730', '54730', 'Cuautitlan Izcalli', 'MX', 'Estado de Mexico', 'Mexico City, MX', 'Mexico City Market', 'Central Mexico', '{"reason":"MX is the business state code for Estado de Mexico; EM remains an accepted alias"}'::jsonb, true, now())
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

update public.rateware_locations
set state_code = 'MX',
    state_name = 'Estado de Mexico',
    metro_city = case
      when city ilike 'Toluca' then 'Toluca, MX'
      when city ilike 'Lerma' then 'Toluca, MX'
      when city ilike 'Cuautitlan%' then 'Mexico City, MX'
      else metro_city
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"state_alias_repaired":"EM_TO_MX"}'::jsonb,
    updated_at = now()
where country = 'MX'
  and (
    city ilike 'Toluca'
    or city ilike 'Lerma'
    or city ilike 'Cuautitlan%'
    or raw_value ilike '%Toluca, MX%'
    or raw_value ilike '%Lerma, MX%'
    or raw_value ilike '%Cuautitlan%'
  );

update public.rate_staging
set origin_state = 'MX',
    origin_match_source = coalesce(origin_match_source, 'mexico_state_alias_repair'),
    origin_match_reason = 'MX treated as Estado de Mexico state code',
    origin_match_confidence = greatest(coalesce(origin_match_confidence, 0), 96)
where origin_country = 'MX'
  and origin_state in ('EM', 'Mexico', 'Estado de Mexico')
  and (
    origin_city ilike 'Toluca'
    or origin_city ilike 'Lerma'
    or origin_city ilike 'Cuautitlan%'
    or origin ilike '%Toluca, MX%'
    or origin ilike '%Lerma, MX%'
    or origin ilike '%Cuautitlan%'
  );

update public.rate_staging
set destination_state = 'MX',
    destination_match_source = coalesce(destination_match_source, 'mexico_state_alias_repair'),
    destination_match_reason = 'MX treated as Estado de Mexico state code',
    destination_match_confidence = greatest(coalesce(destination_match_confidence, 0), 96)
where destination_country = 'MX'
  and destination_state in ('EM', 'Mexico', 'Estado de Mexico')
  and (
    destination_city ilike 'Toluca'
    or destination_city ilike 'Lerma'
    or destination_city ilike 'Cuautitlan%'
    or destination ilike '%Toluca, MX%'
    or destination ilike '%Lerma, MX%'
    or destination ilike '%Cuautitlan%'
  );
