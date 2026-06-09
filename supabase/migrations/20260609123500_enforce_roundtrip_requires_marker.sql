update public.rate_staging
set service = 'One Way',
    normalized_service = 'One Way',
    notes = trim(both ' |' from concat_ws(' | ', notes, 'Service corrected to One Way because no explicit roundtrip marker was found in the carrier quote.')),
    updated_at = now()
where status in ('pending_review', 'approved')
  and lower(coalesce(service, normalized_service, '')) in ('roundtrip', 'round trip', 'round-trip')
  and upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) not like '%VISIBLE SERVICE MARKER RT%';

update public.rate_staging
set all_in_rate = nullif(regexp_replace(regexp_replace(all_in_rate, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    updated_at = now()
where all_in_rate is not null;
