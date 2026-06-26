create or replace function public.rateware_values_filter_match(filters jsonb, key text, candidates text[])
returns boolean
language plpgsql
immutable
as $$
declare
  filter_values text[];
  normalized_candidates text[];
  raw jsonb;
  needle text;
begin
  if coalesce(filters, '{}'::jsonb) ? key = false then
    return true;
  end if;

  filter_values := public.rateware_json_filter_values(filters, key);
  if array_length(filter_values, 1) is null then
    return true;
  end if;

  select coalesce(array_agg(lower(trim(value))), array[]::text[])
    into normalized_candidates
  from unnest(coalesce(candidates, array[]::text[])) as item(value)
  where nullif(trim(value), '') is not null;

  if array_length(normalized_candidates, 1) is null then
    normalized_candidates := array['(blank)'];
  end if;

  raw := coalesce(filters, '{}'::jsonb) -> key;
  if jsonb_typeof(raw) = 'array' then
    return exists (
      select 1
      from unnest(filter_values) selected(value)
      join unnest(normalized_candidates) candidate(value)
        on lower(trim(selected.value)) = candidate.value
    );
  end if;

  needle := lower(trim(filter_values[1]));
  if needle = '' then
    return true;
  end if;

  return array_to_string(normalized_candidates, ' ') like '%' || needle || '%';
end;
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
