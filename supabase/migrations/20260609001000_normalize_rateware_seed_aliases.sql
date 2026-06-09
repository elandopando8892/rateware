update public.rateware_catalog_items
set active = false,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"hidden_reason":"carrier alias only; normalized by interpret-upload"}'::jsonb
where source = 'rateware_seed'
  and (
    (category = 'equipment' and normalized_value in ('DV53'))
    or (category = 'trailer' and normalized_value in ('DV53'))
    or (category = 'config' and normalized_value in ('53 ft'))
    or (category = 'operation' and normalized_value in ('Cross-border', 'Domestic US', 'Domestic MX'))
    or (category = 'service' and normalized_value in ('OW Impo', 'OW Import', 'OW Export', 'RT', 'Round Trip', 'Truckload'))
    or (category = 'border_crossing' and normalized_value in ('Puente Internacional', 'Nuevo Laredo / Laredo', 'Reynosa / Pharr', 'Matamoros / Brownsville'))
  );

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
  ('rateware_seed', 'service', 'One Way', 'One Way', 'ONE_WAY', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'Roundtrip', 'Roundtrip', 'ROUNDTRIP', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'service', 'Backhaul', 'Backhaul', 'BACKHAUL', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'D2D Import', 'D2D Import', 'D2D_IMPORT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'D2D Export', 'D2D Export', 'D2D_EXPORT', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'MX Northbound', 'MX Northbound', 'MX_NORTHBOUND', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'MX Southbound', 'MX Southbound', 'MX_SOUTHBOUND', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'US Northbound', 'US Northbound', 'US_NORTHBOUND', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'operation', 'US Southbound', 'US Southbound', 'US_SOUTHBOUND', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'config', 'Single', 'Single', 'SINGLE', '{"seeded":true}'::jsonb, true, now()),
  ('rateware_seed', 'config', 'Tandem', 'Tandem', 'TANDEM', '{"seeded":true}'::jsonb, true, now())
on conflict (source, category, raw_value, normalized_value) do update
set code = excluded.code,
    metadata = excluded.metadata,
    active = true,
    updated_at = now();

alter table public.rate_staging
  add column if not exists updated_at timestamptz default now();

update public.rate_staging
set equipment = 'Truck Trailer',
    trailer = coalesce(nullif(trailer, ''), 'Dry Van'),
    config = case
      when config is null or config = '' or upper(config) in ('53 FT', '53FT', 'DV53') then 'Single'
      else config
    end,
    updated_at = now()
where upper(coalesce(equipment, '') || ' ' || coalesce(trailer, '') || ' ' || coalesce(config, '')) like any (array['%DV53%', '%53 FT%', '%53FT%']);

update public.rate_staging
set operation = 'D2D Import',
    service = 'One Way',
    updated_at = now()
where upper(coalesce(operation, '') || ' ' || coalesce(service, '')) like any (array['%OW IMPO%', '%OW IMPORT%']);

update public.rate_staging
set operation = 'D2D Export',
    service = 'One Way',
    updated_at = now()
where upper(coalesce(operation, '') || ' ' || coalesce(service, '')) like any (array['%OW EXPO%', '%OW EXPORT%']);

update public.rate_staging
set service = 'Roundtrip',
    updated_at = now()
where upper(coalesce(service, '')) in ('RT', 'ROUND TRIP');

update public.rate_staging
set operation = case
      when origin_country = 'MX' then 'D2D Import'
      else 'D2D Export'
    end,
    mx_border_crossing_point = case
      when mx_border_crossing_point is null
        or mx_border_crossing_point = ''
        or upper(mx_border_crossing_point) like '%PUENTE%'
        or upper(mx_border_crossing_point) like '%BRIDGE%'
      then 'Nuevo Laredo, TM'
      else mx_border_crossing_point
    end,
    us_border_crossing_point = case
      when us_border_crossing_point is null
        or us_border_crossing_point = ''
        or upper(us_border_crossing_point) like '%PUENTE%'
        or upper(us_border_crossing_point) like '%BRIDGE%'
      then 'Laredo, TX'
      else us_border_crossing_point
    end,
    updated_at = now()
where (
    origin_country = 'MX' and destination_country in ('US', 'CA')
  )
  or (
    destination_country = 'MX' and origin_country in ('US', 'CA')
  );
