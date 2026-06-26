create or replace function public.rateware_clean_rate_number(value text)
returns numeric
language plpgsql
immutable
as $$
declare
  cleaned text;
begin
  if value is null then
    return null;
  end if;

  if value ~* '^\s*(x|n/?a|please estimate|tier\s*[123])\s*$' then
    return null;
  end if;

  cleaned := nullif(
    regexp_replace(
      regexp_replace(value, '(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)', '', 'gi'),
      '[^0-9.\-]',
      '',
      'g'
    ),
    ''
  );

  if cleaned ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return cleaned::numeric;
  end if;

  return null;
end;
$$;

create or replace function public.rateware_has_numeric_rate(value text)
returns boolean
language sql
immutable
as $$
  select coalesce(public.rateware_clean_rate_number(value) > 0, false);
$$;

create or replace function public.rateware_json_filter_values(filters jsonb, key text)
returns text[]
language plpgsql
immutable
as $$
declare
  raw jsonb;
  values text[];
begin
  raw := coalesce(filters, '{}'::jsonb) -> key;
  if raw is null then
    return array[]::text[];
  end if;

  if jsonb_typeof(raw) = 'array' then
    select coalesce(array_agg(trim(value)), array[]::text[])
      into values
    from jsonb_array_elements_text(raw) as item(value)
    where trim(value) <> '';
    return values;
  end if;

  values := array[trim(raw #>> '{}')];
  if values[1] = '' then
    return array[]::text[];
  end if;
  return values;
end;
$$;

create or replace function public.rateware_text_filter_match(filters jsonb, key text, candidate text)
returns boolean
language plpgsql
immutable
as $$
declare
  values text[];
  normalized text;
  raw jsonb;
begin
  values := public.rateware_json_filter_values(filters, key);
  if array_length(values, 1) is null then
    return true;
  end if;

  normalized := nullif(trim(coalesce(candidate, '')), '');
  if normalized is null then
    return exists (select 1 from unnest(values) value where lower(value) = '(blank)');
  end if;

  raw := coalesce(filters, '{}'::jsonb) -> key;
  if jsonb_typeof(raw) = 'array' then
    return exists (
      select 1
      from unnest(values) value
      where lower(value) <> '(blank)'
        and lower(normalized) = lower(value)
    );
  end if;

  return lower(normalized) like '%' || lower(values[1]) || '%';
end;
$$;

create or replace function public.rateware_bool_filter_match(filters jsonb, key text, candidate boolean)
returns boolean
language plpgsql
immutable
as $$
declare
  values text[];
  normalized text;
begin
  values := public.rateware_json_filter_values(filters, key);
  if array_length(values, 1) is null then
    return true;
  end if;

  normalized := case when candidate then 'yes' else 'no' end;
  return exists (
    select 1
    from unnest(values) value
    where lower(value) in (normalized, case when normalized = 'yes' then 'true' else 'false' end)
  );
end;
$$;

create or replace function public.rateware_service_mode_key(value text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(value, '')) ~ '\m(rt|round trip|roundtrip|round)\M' then 'roundtrip'
    when lower(coalesce(value, '')) ~ '\m(ow|one way|oneway)\M' then 'oneway'
    else ''
  end;
$$;

create or replace function public.rateware_row_has_split(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select public.rateware_has_numeric_rate(rate_row.mx_linehaul)
      or public.rateware_has_numeric_rate(rate_row.us_linehaul)
      or public.rateware_has_numeric_rate(rate_row.fsc)
      or public.rateware_has_numeric_rate(rate_row.border_crossing_fee);
$$;

create or replace function public.rateware_row_needs_rate(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select not public.rateware_has_numeric_rate(rate_row.all_in_rate)
     and not public.rateware_has_numeric_rate(rate_row.mx_linehaul)
     and not public.rateware_has_numeric_rate(rate_row.us_linehaul);
$$;

create or replace function public.rateware_row_has_all_in_text(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select coalesce(rate_row.all_in_rate, '') ~* '[a-z]';
$$;

create or replace function public.rateware_row_split_conflict(rate_row public.rate_staging)
returns boolean
language plpgsql
stable
as $$
declare
  all_in numeric;
  split_total numeric;
begin
  all_in := public.rateware_clean_rate_number(rate_row.all_in_rate);
  split_total := coalesce(public.rateware_clean_rate_number(rate_row.mx_linehaul), 0)
    + coalesce(public.rateware_clean_rate_number(rate_row.us_linehaul), 0)
    + coalesce(public.rateware_clean_rate_number(rate_row.fsc), 0)
    + coalesce(public.rateware_clean_rate_number(rate_row.border_crossing_fee), 0);

  if all_in is null or all_in <= 0 or split_total <= 0 then
    return false;
  end if;

  return abs(all_in - split_total) > greatest(25, all_in * 0.05);
end;
$$;

create or replace function public.rateware_row_service_conflict(rate_row public.rate_staging)
returns boolean
language plpgsql
stable
as $$
declare
  source_mode text;
  staged_mode text;
begin
  source_mode := public.rateware_service_mode_key(concat_ws(' ', rate_row.source_evidence->>'service', rate_row.source_evidence->>'lane', rate_row.source_evidence->>'source_service'));
  staged_mode := public.rateware_service_mode_key(rate_row.service);
  return source_mode <> '' and staged_mode <> '' and source_mode <> staged_mode;
end;
$$;

create or replace function public.rateware_row_currency_gap(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select (public.rateware_has_numeric_rate(rate_row.all_in_rate) or public.rateware_row_has_split(rate_row))
     and nullif(trim(coalesce(rate_row.currency, '')), '') is null;
$$;

create or replace function public.rateware_row_location_gap(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select not (
      nullif(trim(coalesce(rate_row.origin_market, '')), '') is not null
      or nullif(trim(coalesce(rate_row.origin_zip_prefix, '')), '') is not null
      or nullif(trim(coalesce(rate_row.origin_state, '')), '') is not null
      or nullif(trim(coalesce(rate_row.origin_country, '')), '') is not null
    )
    or not (
      nullif(trim(coalesce(rate_row.destination_market, '')), '') is not null
      or nullif(trim(coalesce(rate_row.destination_zip_prefix, '')), '') is not null
      or nullif(trim(coalesce(rate_row.destination_state, '')), '') is not null
      or nullif(trim(coalesce(rate_row.destination_country, '')), '') is not null
    );
$$;

create or replace function public.rateware_row_conflict(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select public.rateware_row_has_all_in_text(rate_row)
      or public.rateware_row_split_conflict(rate_row)
      or public.rateware_row_service_conflict(rate_row)
      or public.rateware_row_currency_gap(rate_row)
      or nullif(trim(coalesce(rate_row.operation, '')), '') is null
      or nullif(trim(coalesce(rate_row.service, '')), '') is null;
$$;

create or replace function public.rateware_row_source_audit(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select coalesce(array_length(rate_row.audit_flags, 1), 0) > 0
      or coalesce(array_length(rate_row.extraction_warnings, 1), 0) > 0
      or exists (
        select 1
        from jsonb_each_text(coalesce(rate_row.field_confidence, '{}'::jsonb)) as confidence(field, value)
        where value ~ '^-?[0-9]+(\.[0-9]+)?$'
          and value::numeric < 0.75
      );
$$;

create or replace function public.rateware_row_ready(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select not public.rateware_row_needs_rate(rate_row)
      and not public.rateware_row_has_all_in_text(rate_row)
      and not public.rateware_row_location_gap(rate_row)
      and rate_row.vendor_id is not null
      and nullif(trim(coalesce(rate_row.quote_date::text, '')), '') is not null
      and nullif(trim(coalesce(rate_row.operation, '')), '') is not null
      and nullif(trim(coalesce(rate_row.service, '')), '') is not null
      and not public.rateware_row_conflict(rate_row);
$$;

create or replace function public.rateware_row_cross_border(rate_row public.rate_staging)
returns boolean
language sql
stable
as $$
  select lower(concat_ws(' ',
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
      rate_row.origin_market,
      rate_row.destination_market,
      rate_row.operation,
      rate_row.service,
      rate_row.equipment,
      rate_row.trailer,
      rate_row.mx_border_crossing_point,
      rate_row.us_border_crossing_point
    )) ~ '(cross-border|crossborder|d2d import|d2d export|laredo|nuevo laredo)'
    or (
      upper(coalesce(rate_row.origin_country, '')) = 'MX'
      and upper(coalesce(rate_row.destination_country, '')) in ('US', 'USA', 'CA', 'CANADA')
    )
    or (
      upper(coalesce(rate_row.destination_country, '')) = 'MX'
      and upper(coalesce(rate_row.origin_country, '')) in ('US', 'USA', 'CA', 'CANADA')
    );
$$;

create or replace function public.rateware_filtered_rate_ids(
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
  p_limit integer default 50000,
  p_offset integer default 0
)
returns table(row_id uuid, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select rs.*
    from public.rate_staging rs
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
      and public.rateware_text_filter_match(p_column_filters, 'status', rs.status)
      and public.rateware_text_filter_match(p_column_filters, 'raw_upload_id', rs.raw_upload_id::text)
      and public.rateware_text_filter_match(p_column_filters, 'vendor_domain', rs.vendor_domain)
      and public.rateware_text_filter_match(p_column_filters, 'rfx_id', rs.rfx_id)
      and public.rateware_text_filter_match(p_column_filters, 'origin_zip_prefix', rs.origin_zip_prefix)
      and public.rateware_text_filter_match(p_column_filters, 'origin_state', rs.origin_state)
      and public.rateware_text_filter_match(p_column_filters, 'origin_market', rs.origin_market)
      and public.rateware_text_filter_match(p_column_filters, 'origin_region', rs.origin_region)
      and public.rateware_text_filter_match(p_column_filters, 'origin_country', rs.origin_country)
      and public.rateware_text_filter_match(p_column_filters, 'destination_zip_prefix', rs.destination_zip_prefix)
      and public.rateware_text_filter_match(p_column_filters, 'destination_state', rs.destination_state)
      and public.rateware_text_filter_match(p_column_filters, 'destination_market', rs.destination_market)
      and public.rateware_text_filter_match(p_column_filters, 'destination_region', rs.destination_region)
      and public.rateware_text_filter_match(p_column_filters, 'destination_country', rs.destination_country)
      and public.rateware_text_filter_match(p_column_filters, 'equipment', rs.equipment)
      and public.rateware_text_filter_match(p_column_filters, 'trailer', rs.trailer)
      and public.rateware_bool_filter_match(p_column_filters, 'hazmat', rs.hazmat)
      and public.rateware_bool_filter_match(p_column_filters, 'temperature_controlled', rs.temperature_controlled)
      and public.rateware_text_filter_match(p_column_filters, 'config', rs.config)
      and public.rateware_text_filter_match(p_column_filters, 'operation', rs.operation)
      and public.rateware_text_filter_match(p_column_filters, 'service', rs.service)
      and public.rateware_text_filter_match(p_column_filters, 'mx_border_crossing_point', rs.mx_border_crossing_point)
      and public.rateware_text_filter_match(p_column_filters, 'us_border_crossing_point', rs.us_border_crossing_point)
      and public.rateware_text_filter_match(p_column_filters, 'currency', rs.currency)
      and public.rateware_text_filter_match(p_column_filters, 'weekly_capacity', rs.weekly_capacity)
      and public.rateware_text_filter_match(p_column_filters, 'quote_date', rs.quote_date::text)
      and (
        coalesce(p_mode, 'staging') <> 'rateware'
        or case coalesce(nullif(p_quick_filter, ''), 'all')
          when 'all' then true
          when 'cross-border' then public.rateware_row_cross_border(rs)
          when 'all-in' then public.rateware_has_numeric_rate(rs.all_in_rate) and not public.rateware_row_has_split(rs)
          when 'split-rate' then public.rateware_row_has_split(rs)
          when 'with-capacity' then nullif(trim(coalesce(rs.weekly_capacity, '')), '') is not null
          when 'conflicts' then public.rateware_row_conflict(rs)
          else true
        end
      )
      and (
        coalesce(p_mode, 'staging') = 'rateware'
        or case coalesce(nullif(p_review_filter, ''), 'all')
          when 'all' then true
          when 'needs-location' then public.rateware_row_location_gap(rs)
          when 'needs-rate' then public.rateware_row_needs_rate(rs)
          when 'needs-vendor' then rs.vendor_id is null
          when 'conflicts' then public.rateware_row_conflict(rs)
          when 'source-audit' then public.rateware_row_source_audit(rs)
          when 'ready' then public.rateware_row_ready(rs)
          when 'all-in' then public.rateware_has_numeric_rate(rs.all_in_rate)
          when 'split-rate' then public.rateware_row_has_split(rs)
          else true
        end
      )
  )
  select filtered.id as row_id, count(*) over() as total_count
  from filtered
  order by
    case when coalesce(p_mode, 'staging') = 'rateware' then filtered.quote_date end desc nulls last,
    filtered.created_at desc,
    filtered.id desc
  limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create index if not exists rate_staging_status_quote_created_idx
  on public.rate_staging (status, quote_date desc, created_at desc);

create index if not exists rate_staging_status_created_idx
  on public.rate_staging (status, created_at desc);

create index if not exists rate_staging_status_operation_service_idx
  on public.rate_staging (status, operation, service);

create index if not exists rate_staging_status_origin_market_idx
  on public.rate_staging (status, origin_market);

create index if not exists rate_staging_status_destination_market_idx
  on public.rate_staging (status, destination_market);
