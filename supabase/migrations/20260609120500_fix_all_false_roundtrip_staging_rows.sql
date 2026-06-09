update public.rate_staging
set service = 'One Way',
    normalized_service = 'One Way',
    notes = trim(both ' |' from concat_ws(' | ', notes, 'Service corrected to One Way because no explicit RT/Round Trip marker was found in the carrier quote.')),
    updated_at = now()
where status in ('pending_review', 'approved')
  and lower(coalesce(service, normalized_service, '')) in ('roundtrip', 'round trip')
  and not (
    upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) like '%ROUND TRIP%'
    or upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) like '%ROUNDTRIP%'
    or upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || array_to_string(coalesce(extraction_warnings, '{}'::text[]), ' ')) ~ '(^|[^A-Z])RT([^A-Z]|$)'
  );
