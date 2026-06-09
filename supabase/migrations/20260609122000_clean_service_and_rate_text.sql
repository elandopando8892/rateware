update public.rate_staging
set service = 'One Way',
    normalized_service = 'One Way',
    notes = trim(both ' |' from concat_ws(' | ', notes, 'Service corrected to One Way because no explicit roundtrip marker was found in the carrier quote.')),
    updated_at = now()
where status in ('pending_review', 'approved')
  and lower(coalesce(service, normalized_service, '')) in ('roundtrip', 'round trip')
  and not (
    upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) like '%VISIBLE SERVICE MARKER RT%'
    or upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) like '%VISIBLE SERVICE MARKER ROUND%'
  );

update public.rate_staging
set mx_linehaul = nullif(regexp_replace(regexp_replace(mx_linehaul, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    us_linehaul = nullif(regexp_replace(regexp_replace(us_linehaul, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    us_miles = nullif(regexp_replace(regexp_replace(us_miles, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    fsc = nullif(regexp_replace(regexp_replace(fsc, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    fuel = nullif(regexp_replace(regexp_replace(fuel, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    border_crossing_fee = nullif(regexp_replace(regexp_replace(border_crossing_fee, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    flat_rate = nullif(regexp_replace(regexp_replace(flat_rate, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    all_in_rate = nullif(regexp_replace(regexp_replace(all_in_rate, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'), '[^0-9.\-]', '', 'g'), ''),
    updated_at = now()
where coalesce(mx_linehaul, us_linehaul, us_miles, fsc, fuel, border_crossing_fee, flat_rate, all_in_rate) is not null;
