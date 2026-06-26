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
  with source_values as (
    select coalesce(nullif(trim(case p_field
      when 'vendor' then coalesce(v.vendor_name, rs.vendor_domain, v.domain)
      when 'origin' then coalesce(rs.normalized_origin, rs.origin)
      when 'destination' then coalesce(rs.normalized_destination, rs.destination)
      when 'status' then rs.status
      when 'raw_upload_id' then rs.raw_upload_id::text
      when 'vendor_domain' then rs.vendor_domain
      when 'rfx_id' then rs.rfx_id
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
    where (
        case
          when coalesce(p_mode, 'staging') = 'rateware' then rs.status = 'approved'
          when nullif(p_status, '') is not null then rs.status = p_status
          else true
        end
      )
      and (not coalesce(p_exclude_archived, false) or rs.status <> 'archived')
      and (nullif(p_raw_upload_id, '') is null or rs.raw_upload_id::text = p_raw_upload_id)
      and (nullif(p_operation, '') is null or rs.operation = p_operation)
      and (nullif(p_service, '') is null or rs.service = p_service)
      and (
        nullif(p_search, '') is null
        or concat_ws(' ',
          v.vendor_name,
          v.domain,
          rs.vendor_domain,
          rs.rfx_id,
          rs.origin,
          rs.destination,
          rs.normalized_origin,
          rs.normalized_destination,
          rs.origin_city,
          rs.destination_city,
          rs.origin_state,
          rs.destination_state,
          rs.origin_zip_prefix,
          rs.destination_zip_prefix,
          rs.origin_market,
          rs.destination_market,
          rs.origin_region,
          rs.destination_region,
          rs.origin_country,
          rs.destination_country,
          rs.equipment,
          rs.trailer,
          rs.config,
          rs.driver,
          rs.operation,
          rs.service,
          rs.currency,
          rs.weekly_capacity,
          rs.mx_border_crossing_point,
          rs.us_border_crossing_point
        ) ilike '%' || p_search || '%'
      )
      and (
        (
          coalesce(p_column_filters, '{}'::jsonb) = '{}'::jsonb
          and (
            coalesce(p_mode, 'staging') <> 'rateware'
            or coalesce(nullif(p_quick_filter, ''), 'all') = 'all'
          )
          and (
            coalesce(p_mode, 'staging') = 'rateware'
            or coalesce(nullif(p_review_filter, ''), 'all') = 'all'
          )
        )
        or public.rateware_rate_matches_filters(
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
  ),
  distinct_values as (
    select distinct source_values.value
    from source_values
    where nullif(p_value_search, '') is null or source_values.value ilike '%' || p_value_search || '%'
  )
  select distinct_values.value, count(*) over() as total_count
  from distinct_values
  order by distinct_values.value
  limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;
