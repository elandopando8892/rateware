update public.rate_staging
set origin_zip_prefix = null,
    origin_match_source = coalesce(origin_match_source, 'auto_catalog')
where origin_zip_prefix is not null
  and (
    origin_country = 'MX'
    or origin_region ilike '%Mexico%'
    or origin_market in ('Monterrey Market', 'Toluca Market', 'Nuevo Laredo Market', 'Mexico City / Toluca')
  );

update public.rate_staging
set destination_zip_prefix = null,
    destination_match_source = coalesce(destination_match_source, 'auto_catalog')
where destination_zip_prefix is not null
  and (
    destination_country = 'MX'
    or destination_region ilike '%Mexico%'
    or destination_market in ('Monterrey Market', 'Toluca Market', 'Nuevo Laredo Market', 'Mexico City / Toluca')
  );

update public.rate_staging
set origin_match_confidence = coalesce(origin_match_confidence, 100)
where origin_match_source is not null
  and origin_match_confidence is null;

update public.rate_staging
set destination_match_confidence = coalesce(destination_match_confidence, 100)
where destination_match_source is not null
  and destination_match_confidence is null;
