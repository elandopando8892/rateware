update public.rate_staging
set service = 'Roundtrip'
where upper(
    coalesce(extracted_payload->>'service', '') || ' ' ||
    coalesce(extracted_payload->>'operation', '') || ' ' ||
    coalesce(extracted_payload->>'notes', '') || ' ' ||
    coalesce(service, '')
  ) ~ '(^|[^A-Z0-9])(RT|ROUND[[:space:]]*TRIP|ROUNDTRIP)([^A-Z0-9]|$)';

update public.rate_staging
set service = 'Backhaul'
where upper(
    coalesce(extracted_payload->>'service', '') || ' ' ||
    coalesce(extracted_payload->>'operation', '') || ' ' ||
    coalesce(extracted_payload->>'notes', '') || ' ' ||
    coalesce(service, '')
  ) ~ '(^|[^A-Z0-9])(BACKHAUL)([^A-Z0-9]|$)';

update public.rate_staging
set service = 'One Way'
where upper(
    coalesce(extracted_payload->>'service', '') || ' ' ||
    coalesce(extracted_payload->>'operation', '') || ' ' ||
    coalesce(extracted_payload->>'notes', '') || ' ' ||
    coalesce(service, '')
  ) ~ '(^|[^A-Z0-9])(OW|ONE[[:space:]]*WAY|ONEWAY)([^A-Z0-9]|$)'
  and upper(
    coalesce(extracted_payload->>'service', '') || ' ' ||
    coalesce(extracted_payload->>'operation', '') || ' ' ||
    coalesce(extracted_payload->>'notes', '') || ' ' ||
    coalesce(service, '')
  ) !~ '(^|[^A-Z0-9])(RT|ROUND[[:space:]]*TRIP|ROUNDTRIP|BACKHAUL)([^A-Z0-9]|$)';
