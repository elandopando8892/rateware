alter table public.rate_staging
  add column if not exists origin_match_source text,
  add column if not exists destination_match_source text,
  add column if not exists origin_match_confidence numeric,
  add column if not exists destination_match_confidence numeric,
  add column if not exists origin_match_manual boolean not null default false,
  add column if not exists destination_match_manual boolean not null default false;

update public.rateware_locations
set zip_prefix = null,
    updated_at = now()
where country = 'MX'
  and zip_prefix is not null;

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
  ('rateware_manual_catalog', 'MX', 'MX APODACA NL MONTERREY METRO', 'Apodaca, NL', null, 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"Apodaca belongs to the Monterrey metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX APODACA NUEVO LEON MONTERREY METRO', 'Apodaca, Nuevo Leon', null, 'Apodaca', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"Apodaca belongs to the Monterrey metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX MONTERREY NL MONTERREY METRO', 'Monterrey, NL', null, 'Monterrey', 'NL', 'Nuevo Leon', 'Monterrey, NL', 'Monterrey Market', 'Northeast Mexico', '{"reason":"Canonical Monterrey metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX LERMA EM TOLUCA METRO', 'Lerma, EM', null, 'Lerma', 'EM', 'Estado de Mexico', 'Toluca, EM', 'Toluca Market', 'Central Mexico', '{"reason":"Lerma belongs to the Toluca metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX LERMA EDO MEX TOLUCA METRO', 'Lerma, Edo Mex, MX', null, 'Lerma', 'EM', 'Estado de Mexico', 'Toluca, EM', 'Toluca Market', 'Central Mexico', '{"reason":"Lerma belongs to the Toluca metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX TOLUCA EM TOLUCA METRO', 'Toluca, EM', null, 'Toluca', 'EM', 'Estado de Mexico', 'Toluca, EM', 'Toluca Market', 'Central Mexico', '{"reason":"Canonical Toluca metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX TOLUCA MEXICO TOLUCA METRO', 'Toluca, Mexico', null, 'Toluca', 'EM', 'Estado de Mexico', 'Toluca, EM', 'Toluca Market', 'Central Mexico', '{"reason":"Canonical Toluca metro/KMA; MX match does not use 3-digit ZIP"}'::jsonb, true, now()),
  ('rateware_manual_catalog', 'MX', 'MX NUEVO LAREDO TM BORDER METRO', 'Nuevo Laredo, TM', null, 'Nuevo Laredo', 'TM', 'Tamaulipas', 'Nuevo Laredo, TM', 'Nuevo Laredo Market', 'Northeast Mexico', '{"reason":"Default Mexican border city; MX match does not use 3-digit ZIP"}'::jsonb, true, now())
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
