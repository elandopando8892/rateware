update public.rate_staging
set service = 'One Way',
    normalized_service = 'One Way',
    notes = trim(both ' |' from concat_ws(' | ', notes, 'Service corrected to One Way because the carrier quote has no explicit RT/Round Trip marker.')),
    updated_at = now()
where status = 'pending_review'
  and coalesce(rfx_id, '') = 'RFx-04302602'
  and lower(coalesce(vendor_domain, '')) in ('fronterizos.com.mx', 'solucionesdecarga.com', 'gumegroup.com')
  and lower(coalesce(service, '')) in ('roundtrip', 'round trip')
  and not (
    upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || coalesce(extracted_payload::text, '')) like '%ROUND TRIP%'
    or upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || coalesce(extracted_payload::text, '')) like '%ROUNDTRIP%'
    or upper(coalesce(notes, '') || ' ' || coalesce(accessorials, '') || ' ' || coalesce(extracted_payload::text, '')) ~ '(^|[^A-Z])RT([^A-Z]|$)'
  );
