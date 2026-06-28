create or replace function public.rateware_filter_values_for_field(rate_row public.rate_staging, vendor_row public.vendors, p_field text)
returns table(value text)
language plpgsql
stable
as $$
declare
  candidate_values text[];
begin
  candidate_values := case p_field
    when 'vendor' then array[vendor_row.vendor_name, rate_row.vendor_domain, vendor_row.domain]
    when 'origin' then array[rate_row.origin, rate_row.normalized_origin, rate_row.origin_city, rate_row.origin_state, rate_row.origin_zip_prefix, rate_row.origin_market, rate_row.origin_region, rate_row.origin_country]
    when 'destination' then array[rate_row.destination, rate_row.normalized_destination, rate_row.destination_city, rate_row.destination_state, rate_row.destination_zip_prefix, rate_row.destination_market, rate_row.destination_region, rate_row.destination_country]
    when 'status' then array[rate_row.status]
    when 'raw_upload_id' then array[rate_row.raw_upload_id::text]
    when 'vendor_domain' then array[rate_row.vendor_domain]
    when 'rfx_id' then array[rate_row.rfx_id]
    when 'row_id' then array[rate_row.row_id]
    when 'origin_zip_prefix' then array[rate_row.origin_zip_prefix]
    when 'origin_state' then array[rate_row.origin_state]
    when 'origin_market' then array[rate_row.origin_market]
    when 'origin_region' then array[rate_row.origin_region]
    when 'origin_country' then array[rate_row.origin_country]
    when 'destination_zip_prefix' then array[rate_row.destination_zip_prefix]
    when 'destination_state' then array[rate_row.destination_state]
    when 'destination_market' then array[rate_row.destination_market]
    when 'destination_region' then array[rate_row.destination_region]
    when 'destination_country' then array[rate_row.destination_country]
    when 'equipment' then array[rate_row.equipment]
    when 'trailer' then array[rate_row.trailer]
    when 'hazmat' then array[case when rate_row.hazmat then 'Yes' else 'No' end]
    when 'temperature_controlled' then array[case when rate_row.temperature_controlled then 'Yes' else 'No' end]
    when 'config' then array[rate_row.config]
    when 'operation' then array[rate_row.operation]
    when 'service' then array[rate_row.service]
    when 'mx_border_crossing_point' then array[rate_row.mx_border_crossing_point]
    when 'us_border_crossing_point' then array[rate_row.us_border_crossing_point]
    when 'mx_linehaul' then array[rate_row.mx_linehaul]
    when 'us_linehaul' then array[rate_row.us_linehaul]
    when 'fsc' then array[rate_row.fsc]
    when 'border_crossing_fee' then array[rate_row.border_crossing_fee]
    when 'all_in_rate' then array[rate_row.all_in_rate]
    when 'currency' then array[rate_row.currency]
    when 'weekly_capacity' then array[rate_row.weekly_capacity]
    when 'quote_date' then array[rate_row.quote_date::text]
    else array[]::text[]
  end;

  return query
    select distinct nullif(trim(candidate), '') as value
    from unnest(candidate_values) as item(candidate)
    where nullif(trim(candidate), '') is not null;

  if not found then
    return query select '(blank)'::text;
  end if;
end;
$$;

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
language sql
stable
as $$
  select (
      case
        when coalesce(p_mode, 'staging') = 'rateware' then rate_row.status = 'approved'
        when nullif(p_status, '') is not null then rate_row.status = p_status
        else true
      end
    )
    and (not coalesce(p_exclude_archived, false) or rate_row.status <> 'archived')
    and (nullif(p_raw_upload_id, '') is null or rate_row.raw_upload_id::text = p_raw_upload_id)
    and (nullif(p_operation, '') is null or rate_row.operation = p_operation)
    and (nullif(p_service, '') is null or rate_row.service = p_service)
    and (
      nullif(p_search, '') is null
      or concat_ws(' ',
        vendor_row.vendor_name,
        vendor_row.domain,
        rate_row.vendor_domain,
        rate_row.rfx_id,
        rate_row.row_id,
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
      ) ilike '%' || p_search || '%'
    )
    and public.rateware_values_filter_match(p_column_filters, 'vendor', array[vendor_row.vendor_name, rate_row.vendor_domain, vendor_row.domain])
    and public.rateware_values_filter_match(p_column_filters, 'origin', array[rate_row.origin, rate_row.normalized_origin, rate_row.origin_city, rate_row.origin_state, rate_row.origin_zip_prefix, rate_row.origin_market, rate_row.origin_region, rate_row.origin_country])
    and public.rateware_values_filter_match(p_column_filters, 'destination', array[rate_row.destination, rate_row.normalized_destination, rate_row.destination_city, rate_row.destination_state, rate_row.destination_zip_prefix, rate_row.destination_market, rate_row.destination_region, rate_row.destination_country])
    and public.rateware_values_filter_match(p_column_filters, 'status', array[rate_row.status])
    and public.rateware_values_filter_match(p_column_filters, 'raw_upload_id', array[rate_row.raw_upload_id::text])
    and public.rateware_values_filter_match(p_column_filters, 'vendor_domain', array[rate_row.vendor_domain])
    and public.rateware_values_filter_match(p_column_filters, 'rfx_id', array[rate_row.rfx_id])
    and public.rateware_values_filter_match(p_column_filters, 'row_id', array[rate_row.row_id])
    and public.rateware_values_filter_match(p_column_filters, 'origin_zip_prefix', array[rate_row.origin_zip_prefix])
    and public.rateware_values_filter_match(p_column_filters, 'origin_state', array[rate_row.origin_state])
    and public.rateware_values_filter_match(p_column_filters, 'origin_market', array[rate_row.origin_market])
    and public.rateware_values_filter_match(p_column_filters, 'origin_region', array[rate_row.origin_region])
    and public.rateware_values_filter_match(p_column_filters, 'origin_country', array[rate_row.origin_country])
    and public.rateware_values_filter_match(p_column_filters, 'destination_zip_prefix', array[rate_row.destination_zip_prefix])
    and public.rateware_values_filter_match(p_column_filters, 'destination_state', array[rate_row.destination_state])
    and public.rateware_values_filter_match(p_column_filters, 'destination_market', array[rate_row.destination_market])
    and public.rateware_values_filter_match(p_column_filters, 'destination_region', array[rate_row.destination_region])
    and public.rateware_values_filter_match(p_column_filters, 'destination_country', array[rate_row.destination_country])
    and public.rateware_values_filter_match(p_column_filters, 'equipment', array[rate_row.equipment])
    and public.rateware_values_filter_match(p_column_filters, 'trailer', array[rate_row.trailer])
    and public.rateware_values_filter_match(p_column_filters, 'hazmat', array[case when rate_row.hazmat then 'Yes' else 'No' end])
    and public.rateware_values_filter_match(p_column_filters, 'temperature_controlled', array[case when rate_row.temperature_controlled then 'Yes' else 'No' end])
    and public.rateware_values_filter_match(p_column_filters, 'config', array[rate_row.config])
    and public.rateware_values_filter_match(p_column_filters, 'operation', array[rate_row.operation])
    and public.rateware_values_filter_match(p_column_filters, 'service', array[rate_row.service])
    and public.rateware_values_filter_match(p_column_filters, 'mx_border_crossing_point', array[rate_row.mx_border_crossing_point])
    and public.rateware_values_filter_match(p_column_filters, 'us_border_crossing_point', array[rate_row.us_border_crossing_point])
    and public.rateware_values_filter_match(p_column_filters, 'mx_linehaul', array[rate_row.mx_linehaul])
    and public.rateware_values_filter_match(p_column_filters, 'us_linehaul', array[rate_row.us_linehaul])
    and public.rateware_values_filter_match(p_column_filters, 'fsc', array[rate_row.fsc])
    and public.rateware_values_filter_match(p_column_filters, 'border_crossing_fee', array[rate_row.border_crossing_fee])
    and public.rateware_values_filter_match(p_column_filters, 'all_in_rate', array[rate_row.all_in_rate])
    and public.rateware_values_filter_match(p_column_filters, 'currency', array[rate_row.currency])
    and public.rateware_values_filter_match(p_column_filters, 'weekly_capacity', array[rate_row.weekly_capacity])
    and public.rateware_values_filter_match(p_column_filters, 'quote_date', array[rate_row.quote_date::text])
    and (
      coalesce(p_mode, 'staging') <> 'rateware'
      or case coalesce(nullif(p_quick_filter, ''), 'all')
        when 'all' then true
        when 'cross-border' then public.rateware_row_cross_border(rate_row)
        when 'all-in' then public.rateware_has_numeric_rate(rate_row.all_in_rate) and not public.rateware_row_has_split(rate_row)
        when 'split-rate' then public.rateware_row_has_split(rate_row)
        when 'with-capacity' then nullif(trim(coalesce(rate_row.weekly_capacity, '')), '') is not null
        when 'conflicts' then public.rateware_row_conflict(rate_row)
        else true
      end
    )
    and (
      coalesce(p_mode, 'staging') = 'rateware'
      or case coalesce(nullif(p_review_filter, ''), 'all')
        when 'all' then true
        when 'needs-location' then public.rateware_row_location_gap(rate_row)
        when 'needs-rate' then public.rateware_row_needs_rate(rate_row)
        when 'needs-vendor' then rate_row.vendor_id is null
        when 'conflicts' then public.rateware_row_conflict(rate_row)
        when 'source-audit' then public.rateware_row_source_audit(rate_row)
        when 'ready' then public.rateware_row_ready(rate_row)
        when 'all-in' then public.rateware_has_numeric_rate(rate_row.all_in_rate)
        when 'split-rate' then public.rateware_row_has_split(rate_row)
        else true
      end
    );
$$;

create or replace function public.rateware_filtered_rate_values(
  p_field text,
  p_mode text default 'staging',
  p_status text default null,
  p_raw_upload_id text default null,
  p_search text default null,
  p_operation text default null,
  p_service text default null,
  p_quick_filter text default 'all',
  p_review_filter text default 'all',
  p_column_filters jsonb default '{}'::jsonb,
  p_exclude_archived boolean default false,
  p_value_search text default null,
  p_limit integer default 1000
)
returns table(value text, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with distinct_values as (
    select distinct coalesce(nullif(trim(case p_field
      when 'vendor' then coalesce(v.vendor_name, rs.vendor_domain, v.domain)
      when 'origin' then coalesce(rs.normalized_origin, rs.origin)
      when 'destination' then coalesce(rs.normalized_destination, rs.destination)
      when 'status' then rs.status
      when 'raw_upload_id' then rs.raw_upload_id::text
      when 'vendor_domain' then rs.vendor_domain
      when 'rfx_id' then rs.rfx_id
      when 'row_id' then rs.row_id
      when 'origin_zip_prefix' then rs.origin_zip_prefix
      when 'origin_state' then rs.origin_state
      when 'origin_market' then rs.origin_market
      when 'origin_region' then rs.origin_region
      when 'origin_country' then rs.origin_country
      when 'destination_zip_prefix' then rs.destination_zip_prefix
      when 'destination_state' then rs.destination_state
      when 'destination_market' then rs.destination_market
      when 'destination_region' then rs.destination_region
      when 'destination_country' then rs.destination_country
      when 'equipment' then rs.equipment
      when 'trailer' then rs.trailer
      when 'hazmat' then case when rs.hazmat then 'Yes' else 'No' end
      when 'temperature_controlled' then case when rs.temperature_controlled then 'Yes' else 'No' end
      when 'config' then rs.config
      when 'operation' then rs.operation
      when 'service' then rs.service
      when 'mx_border_crossing_point' then rs.mx_border_crossing_point
      when 'us_border_crossing_point' then rs.us_border_crossing_point
      when 'mx_linehaul' then rs.mx_linehaul
      when 'us_linehaul' then rs.us_linehaul
      when 'fsc' then rs.fsc
      when 'border_crossing_fee' then rs.border_crossing_fee
      when 'all_in_rate' then rs.all_in_rate
      when 'currency' then rs.currency
      when 'weekly_capacity' then rs.weekly_capacity
      when 'quote_date' then rs.quote_date::text
      else null
    end), ''), '(blank)') as value
    from public.rate_staging rs
    left join public.vendors v on v.id = rs.vendor_id
    where public.rateware_rate_matches_filters(
      rs,
      v,
      p_mode,
      p_status,
      p_raw_upload_id,
      p_search,
      p_operation,
      p_service,
      p_quick_filter,
      p_review_filter,
      p_column_filters,
      p_exclude_archived
    )
  )
  select distinct_values.value, count(*) over() as total_count
  from distinct_values
  where nullif(p_value_search, '') is null or distinct_values.value ilike '%' || p_value_search || '%'
  order by distinct_values.value
  limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;
