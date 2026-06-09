update public.rate_staging
set operation = 'D2D Import',
    service = coalesce(nullif(service, ''), 'One Way'),
    updated_at = now()
where origin_country = 'MX'
  and destination_country in ('US', 'CA');

update public.rate_staging
set operation = 'D2D Export',
    service = coalesce(nullif(service, ''), 'One Way'),
    updated_at = now()
where destination_country = 'MX'
  and origin_country in ('US', 'CA');
