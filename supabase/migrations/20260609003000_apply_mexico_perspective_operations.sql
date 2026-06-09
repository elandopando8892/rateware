update public.rate_staging
set operation = 'D2D Export',
    service = coalesce(nullif(service, ''), 'One Way'),
    updated_at = now()
where origin_country = 'MX'
  and destination_country in ('US', 'CA');

update public.rate_staging
set operation = 'D2D Import',
    service = coalesce(nullif(service, ''), 'One Way'),
    updated_at = now()
where destination_country = 'MX'
  and origin_country in ('US', 'CA');

update public.rate_staging
set operation = 'MX Northbound',
    updated_at = now()
where origin_country = 'MX'
  and destination_country = 'MX'
  and upper(coalesce(destination_city, '') || ' ' || coalesce(destination, '') || ' ' || coalesce(destination_market, '')) like any (
    array['%NUEVO LAREDO%', '%REYNOSA%', '%MATAMOROS%', '%PIEDRAS NEGRAS%', '%CIUDAD JUAREZ%', '%TIJUANA%', '%NOGALES%']
  );

update public.rate_staging
set operation = 'MX Southbound',
    updated_at = now()
where origin_country = 'MX'
  and destination_country = 'MX'
  and upper(coalesce(origin_city, '') || ' ' || coalesce(origin, '') || ' ' || coalesce(origin_market, '')) like any (
    array['%NUEVO LAREDO%', '%REYNOSA%', '%MATAMOROS%', '%PIEDRAS NEGRAS%', '%CIUDAD JUAREZ%', '%TIJUANA%', '%NOGALES%']
  );

update public.rate_staging
set operation = 'US Northbound',
    updated_at = now()
where origin_country in ('US', 'CA')
  and destination_country in ('US', 'CA')
  and upper(coalesce(origin_city, '') || ' ' || coalesce(origin, '') || ' ' || coalesce(origin_market, '')) like any (
    array['%LAREDO%', '%PHARR%', '%BROWNSVILLE%', '%EAGLE PASS%', '%EL PASO%', '%SAN DIEGO%', '%NOGALES%']
  );

update public.rate_staging
set operation = 'US Southbound',
    updated_at = now()
where origin_country in ('US', 'CA')
  and destination_country in ('US', 'CA')
  and upper(coalesce(destination_city, '') || ' ' || coalesce(destination, '') || ' ' || coalesce(destination_market, '')) like any (
    array['%LAREDO%', '%PHARR%', '%BROWNSVILLE%', '%EAGLE PASS%', '%EL PASO%', '%SAN DIEGO%', '%NOGALES%']
  );
