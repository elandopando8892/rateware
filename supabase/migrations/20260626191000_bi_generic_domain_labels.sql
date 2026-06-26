create or replace function public.rateware_bi_dimension_value(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  key_name text
)
returns text
language plpgsql
stable
as $$
declare
  normalized_key text := lower(coalesce(key_name, ''));
  origin_value text := coalesce(nullif(btrim(rate_row.normalized_origin), ''), nullif(btrim(rate_row.origin), ''), '-');
  destination_value text := coalesce(nullif(btrim(rate_row.normalized_destination), ''), nullif(btrim(rate_row.destination), ''), '-');
  origin_market_value text := coalesce(nullif(btrim(rate_row.origin_market), ''), '-');
  destination_market_value text := coalesce(nullif(btrim(rate_row.destination_market), ''), '-');
  mx_crossing_value text := coalesce(nullif(btrim(rate_row.mx_border_crossing_point), ''), '-');
  us_crossing_value text := coalesce(nullif(btrim(rate_row.us_border_crossing_point), ''), '-');
  vendor_domain_value text := coalesce(nullif(btrim(rate_row.vendor_domain), ''), nullif(btrim(vendor_row.domain), ''));
  safe_vendor_domain text := case
    when vendor_domain_value is not null and not public.rateware_is_generic_email_domain(vendor_domain_value) then vendor_domain_value
    else null
  end;
begin
  return case normalized_key
    when 'vendor' then coalesce(nullif(btrim(vendor_row.vendor_name), ''), safe_vendor_domain, 'Unmatched carrier')
    when 'vendor_domain' then coalesce(safe_vendor_domain, '-')
    when 'vendor_stage' then coalesce(nullif(btrim(vendor_row.base_stage), ''), '-')
    when 'vendor_status' then coalesce(nullif(btrim(vendor_row.status), ''), '-')
    when 'route' then concat_ws(' -> ', origin_value, destination_value)
    when 'corridor' then concat_ws(' -> ', origin_market_value, destination_market_value)
    when 'origin' then origin_value
    when 'destination' then destination_value
    when 'origin_market' then origin_market_value
    when 'destination_market' then destination_market_value
    when 'origin_region' then coalesce(nullif(btrim(rate_row.origin_region), ''), '-')
    when 'destination_region' then coalesce(nullif(btrim(rate_row.destination_region), ''), '-')
    when 'origin_state' then coalesce(nullif(btrim(rate_row.origin_state), ''), '-')
    when 'destination_state' then coalesce(nullif(btrim(rate_row.destination_state), ''), '-')
    when 'origin_zip' then coalesce(nullif(btrim(rate_row.origin_zip_prefix), ''), nullif(btrim(rate_row.origin_state), ''), '-')
    when 'destination_zip' then coalesce(nullif(btrim(rate_row.destination_zip_prefix), ''), nullif(btrim(rate_row.destination_state), ''), '-')
    when 'origin_country' then coalesce(nullif(btrim(rate_row.origin_country), ''), '-')
    when 'destination_country' then coalesce(nullif(btrim(rate_row.destination_country), ''), '-')
    when 'equipment' then coalesce(nullif(btrim(rate_row.equipment), ''), '-')
    when 'trailer' then coalesce(nullif(btrim(rate_row.trailer), ''), '-')
    when 'hazmat' then case when coalesce(rate_row.hazmat, false) then 'Hazmat' else 'Non-hazmat' end
    when 'temperature_controlled' then case when coalesce(rate_row.temperature_controlled, false) then 'Temp controlled' else 'Ambient' end
    when 'operation' then coalesce(nullif(btrim(rate_row.operation), ''), '-')
    when 'service' then coalesce(nullif(btrim(rate_row.service), ''), '-')
    when 'mx_crossing' then mx_crossing_value
    when 'us_crossing' then us_crossing_value
    when 'border_pair' then concat_ws(' / ', mx_crossing_value, us_crossing_value)
    when 'quote_month' then coalesce(substring(rate_row.quote_date::text from 1 for 7), '-')
    when 'currency' then coalesce(nullif(btrim(rate_row.currency), ''), '-')
    when 'rate_status' then coalesce(nullif(btrim(rate_row.status), ''), '-')
    else coalesce(safe_vendor_domain, '-')
  end;
end;
$$;
