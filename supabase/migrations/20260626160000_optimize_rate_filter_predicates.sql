create or replace function public.rateware_rate_matches_filters(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  p_mode text default 'staging',
  p_status text default null,
  p_raw_upload_id text default null,
  p_search text default null,
  p_operation text default null,
  p_service text default null,
  p_quick_filter text default 'all',
  p_review_filter text default 'all',
  p_column_filters jsonb default '{}'::jsonb,
  p_exclude_archived boolean default false
)
returns boolean
language plpgsql
stable
as $$
declare
  filters jsonb := coalesce(p_column_filters, '{}'::jsonb);
  quick_filter text := coalesce(nullif(p_quick_filter, ''), 'all');
  review_filter text := coalesce(nullif(p_review_filter, ''), 'all');
begin
  if coalesce(p_mode, 'staging') = 'rateware' then
    if rate_row.status is distinct from 'approved' then
      return false;
    end if;
  elsif nullif(p_status, '') is not null and rate_row.status is distinct from p_status then
    return false;
  end if;

  if coalesce(p_exclude_archived, false) and rate_row.status = 'archived' then
    return false;
  end if;

  if nullif(p_raw_upload_id, '') is not null and rate_row.raw_upload_id::text is distinct from p_raw_upload_id then
    return false;
  end if;

  if nullif(p_operation, '') is not null and rate_row.operation is distinct from p_operation then
    return false;
  end if;

  if nullif(p_service, '') is not null and rate_row.service is distinct from p_service then
    return false;
  end if;

  if nullif(p_search, '') is not null and concat_ws(' ',
    vendor_row.vendor_name,
    vendor_row.domain,
    rate_row.vendor_domain,
    rate_row.rfx_id,
    rate_row.origin,
    rate_row.destination,
    rate_row.normalized_origin,
    rate_row.normalized_destination,
    rate_row.origin_city,
    rate_row.destination_city,
    rate_row.origin_state,
    rate_row.destination_state,
    rate_row.origin_zip_prefix,
    rate_row.destination_zip_prefix,
    rate_row.origin_market,
    rate_row.destination_market,
    rate_row.origin_region,
    rate_row.destination_region,
    rate_row.origin_country,
    rate_row.destination_country,
    rate_row.equipment,
    rate_row.trailer,
    rate_row.config,
    rate_row.driver,
    rate_row.operation,
    rate_row.service,
    rate_row.currency,
    rate_row.weekly_capacity,
    rate_row.mx_border_crossing_point,
    rate_row.us_border_crossing_point
  ) not ilike '%' || p_search || '%' then
    return false;
  end if;

  if filters ? 'vendor'
    and not public.rateware_values_filter_match(filters, 'vendor', array[vendor_row.vendor_name, rate_row.vendor_domain, vendor_row.domain]) then
    return false;
  end if;

  if filters ? 'origin'
    and not public.rateware_values_filter_match(filters, 'origin', array[rate_row.origin, rate_row.normalized_origin, rate_row.origin_city, rate_row.origin_state, rate_row.origin_zip_prefix, rate_row.origin_market, rate_row.origin_region, rate_row.origin_country]) then
    return false;
  end if;

  if filters ? 'destination'
    and not public.rateware_values_filter_match(filters, 'destination', array[rate_row.destination, rate_row.normalized_destination, rate_row.destination_city, rate_row.destination_state, rate_row.destination_zip_prefix, rate_row.destination_market, rate_row.destination_region, rate_row.destination_country]) then
    return false;
  end if;

  if filters ? 'status' and not public.rateware_values_filter_match(filters, 'status', array[rate_row.status]) then return false; end if;
  if filters ? 'raw_upload_id' and not public.rateware_values_filter_match(filters, 'raw_upload_id', array[rate_row.raw_upload_id::text]) then return false; end if;
  if filters ? 'vendor_domain' and not public.rateware_values_filter_match(filters, 'vendor_domain', array[rate_row.vendor_domain]) then return false; end if;
  if filters ? 'rfx_id' and not public.rateware_values_filter_match(filters, 'rfx_id', array[rate_row.rfx_id]) then return false; end if;
  if filters ? 'origin_zip_prefix' and not public.rateware_values_filter_match(filters, 'origin_zip_prefix', array[rate_row.origin_zip_prefix]) then return false; end if;
  if filters ? 'origin_state' and not public.rateware_values_filter_match(filters, 'origin_state', array[rate_row.origin_state]) then return false; end if;
  if filters ? 'origin_market' and not public.rateware_values_filter_match(filters, 'origin_market', array[rate_row.origin_market]) then return false; end if;
  if filters ? 'origin_region' and not public.rateware_values_filter_match(filters, 'origin_region', array[rate_row.origin_region]) then return false; end if;
  if filters ? 'origin_country' and not public.rateware_values_filter_match(filters, 'origin_country', array[rate_row.origin_country]) then return false; end if;
  if filters ? 'destination_zip_prefix' and not public.rateware_values_filter_match(filters, 'destination_zip_prefix', array[rate_row.destination_zip_prefix]) then return false; end if;
  if filters ? 'destination_state' and not public.rateware_values_filter_match(filters, 'destination_state', array[rate_row.destination_state]) then return false; end if;
  if filters ? 'destination_market' and not public.rateware_values_filter_match(filters, 'destination_market', array[rate_row.destination_market]) then return false; end if;
  if filters ? 'destination_region' and not public.rateware_values_filter_match(filters, 'destination_region', array[rate_row.destination_region]) then return false; end if;
  if filters ? 'destination_country' and not public.rateware_values_filter_match(filters, 'destination_country', array[rate_row.destination_country]) then return false; end if;
  if filters ? 'equipment' and not public.rateware_values_filter_match(filters, 'equipment', array[rate_row.equipment]) then return false; end if;
  if filters ? 'trailer' and not public.rateware_values_filter_match(filters, 'trailer', array[rate_row.trailer]) then return false; end if;
  if filters ? 'hazmat' and not public.rateware_values_filter_match(filters, 'hazmat', array[case when rate_row.hazmat then 'Yes' else 'No' end]) then return false; end if;
  if filters ? 'temperature_controlled' and not public.rateware_values_filter_match(filters, 'temperature_controlled', array[case when rate_row.temperature_controlled then 'Yes' else 'No' end]) then return false; end if;
  if filters ? 'config' and not public.rateware_values_filter_match(filters, 'config', array[rate_row.config]) then return false; end if;
  if filters ? 'operation' and not public.rateware_values_filter_match(filters, 'operation', array[rate_row.operation]) then return false; end if;
  if filters ? 'service' and not public.rateware_values_filter_match(filters, 'service', array[rate_row.service]) then return false; end if;
  if filters ? 'mx_border_crossing_point' and not public.rateware_values_filter_match(filters, 'mx_border_crossing_point', array[rate_row.mx_border_crossing_point]) then return false; end if;
  if filters ? 'us_border_crossing_point' and not public.rateware_values_filter_match(filters, 'us_border_crossing_point', array[rate_row.us_border_crossing_point]) then return false; end if;
  if filters ? 'mx_linehaul' and not public.rateware_values_filter_match(filters, 'mx_linehaul', array[rate_row.mx_linehaul]) then return false; end if;
  if filters ? 'us_linehaul' and not public.rateware_values_filter_match(filters, 'us_linehaul', array[rate_row.us_linehaul]) then return false; end if;
  if filters ? 'fsc' and not public.rateware_values_filter_match(filters, 'fsc', array[rate_row.fsc]) then return false; end if;
  if filters ? 'border_crossing_fee' and not public.rateware_values_filter_match(filters, 'border_crossing_fee', array[rate_row.border_crossing_fee]) then return false; end if;
  if filters ? 'all_in_rate' and not public.rateware_values_filter_match(filters, 'all_in_rate', array[rate_row.all_in_rate]) then return false; end if;
  if filters ? 'currency' and not public.rateware_values_filter_match(filters, 'currency', array[rate_row.currency]) then return false; end if;
  if filters ? 'weekly_capacity' and not public.rateware_values_filter_match(filters, 'weekly_capacity', array[rate_row.weekly_capacity]) then return false; end if;
  if filters ? 'quote_date' and not public.rateware_values_filter_match(filters, 'quote_date', array[rate_row.quote_date::text]) then return false; end if;

  if coalesce(p_mode, 'staging') = 'rateware' then
    case quick_filter
      when 'all' then null;
      when 'cross-border' then if not public.rateware_row_cross_border(rate_row) then return false; end if;
      when 'all-in' then if not (public.rateware_has_numeric_rate(rate_row.all_in_rate) and not public.rateware_row_has_split(rate_row)) then return false; end if;
      when 'split-rate' then if not public.rateware_row_has_split(rate_row) then return false; end if;
      when 'with-capacity' then if nullif(trim(coalesce(rate_row.weekly_capacity, '')), '') is null then return false; end if;
      when 'conflicts' then if not public.rateware_row_conflict(rate_row) then return false; end if;
      else null;
    end case;
  else
    case review_filter
      when 'all' then null;
      when 'needs-location' then if not public.rateware_row_location_gap(rate_row) then return false; end if;
      when 'needs-rate' then if not public.rateware_row_needs_rate(rate_row) then return false; end if;
      when 'needs-vendor' then if rate_row.vendor_id is not null then return false; end if;
      when 'conflicts' then if not public.rateware_row_conflict(rate_row) then return false; end if;
      when 'source-audit' then if not public.rateware_row_source_audit(rate_row) then return false; end if;
      when 'ready' then if not public.rateware_row_ready(rate_row) then return false; end if;
      when 'all-in' then if not public.rateware_has_numeric_rate(rate_row.all_in_rate) then return false; end if;
      when 'split-rate' then if not public.rateware_row_has_split(rate_row) then return false; end if;
      else null;
    end case;
  end if;

  return true;
end;
$$;
