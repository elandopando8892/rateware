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
begin
  return case normalized_key
    when 'vendor' then coalesce(nullif(btrim(vendor_row.vendor_name), ''), nullif(btrim(rate_row.vendor_domain), ''), 'Unmatched carrier')
    when 'vendor_domain' then coalesce(nullif(btrim(rate_row.vendor_domain), ''), nullif(btrim(vendor_row.domain), ''), '-')
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
    else coalesce(nullif(btrim(rate_row.vendor_domain), ''), '-')
  end;
end;
$$;

create or replace function public.rateware_bi_metric_value(
  rate_row public.rate_staging,
  metric_name text
)
returns numeric
language plpgsql
stable
as $$
declare
  normalized_metric text := lower(coalesce(metric_name, ''));
  all_in numeric := public.rateware_clean_rate_number(rate_row.all_in_rate);
  us_miles_amount numeric := public.rateware_clean_rate_number(rate_row.us_miles);
  miles_amount numeric;
  km_amount numeric;
begin
  if normalized_metric = 'all_in_rate' then
    return all_in;
  elsif normalized_metric = 'us_miles' then
    return us_miles_amount;
  elsif normalized_metric = 'calculated_miles' then
    return rate_row.calculated_miles;
  elsif normalized_metric = 'calculated_km' then
    return rate_row.calculated_km;
  elsif normalized_metric = 'mx_linehaul' then
    return public.rateware_clean_rate_number(rate_row.mx_linehaul);
  elsif normalized_metric = 'us_linehaul' then
    return public.rateware_clean_rate_number(rate_row.us_linehaul);
  elsif normalized_metric = 'fsc' then
    return public.rateware_clean_rate_number(rate_row.fsc);
  elsif normalized_metric = 'border_crossing_fee' then
    return public.rateware_clean_rate_number(rate_row.border_crossing_fee);
  end if;

  miles_amount := coalesce(nullif(rate_row.calculated_miles, 0), nullif(us_miles_amount, 0));
  km_amount := coalesce(nullif(rate_row.calculated_km, 0), nullif(rate_row.calculated_miles * 1.60934, 0), nullif(us_miles_amount * 1.60934, 0));

  if normalized_metric = 'cost_per_mile' then
    return case when all_in is not null and miles_amount is not null and miles_amount > 0 then all_in / miles_amount else null end;
  elsif normalized_metric = 'cost_per_km' then
    return case when all_in is not null and km_amount is not null and km_amount > 0 then all_in / km_amount else null end;
  end if;

  return null;
end;
$$;

create or replace function public.rateware_bi_value_filter_match(filters jsonb, key_name text, candidate text)
returns boolean
language plpgsql
immutable
as $$
declare
  raw jsonb;
  normalized_candidate text := lower(coalesce(nullif(btrim(candidate), ''), ''));
  text_value text;
begin
  if not (coalesce(filters, '{}'::jsonb) ? key_name) then
    return true;
  end if;

  raw := coalesce(filters, '{}'::jsonb) -> key_name;
  if raw is null or raw = 'null'::jsonb then
    return true;
  end if;

  if jsonb_typeof(raw) = 'boolean' then
    if (raw #>> '{}')::boolean = false then
      return true;
    end if;
    return normalized_candidate in ('yes', 'true', 'hazmat', 'temp controlled');
  end if;

  if jsonb_typeof(raw) = 'array' then
    return not exists (
      select 1
      from jsonb_array_elements_text(raw) as item(value)
      where nullif(btrim(item.value), '') is not null
    ) or exists (
      select 1
      from jsonb_array_elements_text(raw) as item(value)
      where (
        lower(btrim(item.value)) = '(blank)' and normalized_candidate = ''
      ) or (
        lower(btrim(item.value)) <> '(blank)'
        and normalized_candidate like '%' || lower(btrim(item.value)) || '%'
      )
    );
  end if;

  text_value := lower(btrim(raw #>> '{}'));
  if text_value = '' then
    return true;
  end if;
  if text_value = '(blank)' then
    return normalized_candidate = '';
  end if;
  return normalized_candidate like '%' || text_value || '%';
end;
$$;

create or replace function public.rateware_bi_row_text(rate_row public.rate_staging, vendor_row public.vendors)
returns text
language sql
stable
as $$
  select concat_ws(' ',
    vendor_row.vendor_name,
    vendor_row.domain,
    rate_row.vendor_domain,
    rate_row.rfx_id,
    rate_row.origin,
    rate_row.destination,
    rate_row.normalized_origin,
    rate_row.normalized_destination,
    rate_row.origin_market,
    rate_row.destination_market,
    rate_row.origin_state,
    rate_row.destination_state,
    rate_row.origin_country,
    rate_row.destination_country,
    rate_row.operation,
    rate_row.service,
    rate_row.equipment,
    rate_row.trailer,
    rate_row.mx_border_crossing_point,
    rate_row.us_border_crossing_point
  );
$$;

create or replace function public.rateware_bi_rate_matches_filters(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  filter_key text;
  d2d_text text;
begin
  if rate_row.status not in ('pending_review', 'approved') then
    return false;
  end if;

  if rate_row.vendor_id is not null and coalesce(vendor_row.owner_email, '') is distinct from coalesce(p_owner_email, '') then
    return false;
  end if;

  if filters ? 'search'
    and not public.rateware_bi_value_filter_match(filters, 'search', public.rateware_bi_row_text(rate_row, vendor_row)) then
    return false;
  end if;

  if filters ? 'crossborder' and coalesce((filters ->> 'crossborder')::boolean, false)
    and not public.rateware_row_cross_border(rate_row) then
    return false;
  end if;

  if filters ? 'd2d' and coalesce((filters ->> 'd2d')::boolean, false) then
    d2d_text := lower(public.rateware_bi_row_text(rate_row, vendor_row));
    if not (
      public.rateware_row_cross_border(rate_row)
      and (d2d_text like '%d2d import%' or d2d_text like '%d2d export%')
    ) then
      return false;
    end if;
  end if;

  foreach filter_key in array array[
    'vendor',
    'vendor_domain',
    'vendor_stage',
    'vendor_status',
    'route',
    'corridor',
    'origin',
    'destination',
    'origin_market',
    'destination_market',
    'origin_region',
    'destination_region',
    'origin_state',
    'destination_state',
    'origin_zip',
    'destination_zip',
    'origin_country',
    'destination_country',
    'equipment',
    'trailer',
    'hazmat',
    'temperature_controlled',
    'operation',
    'service',
    'mx_crossing',
    'us_crossing',
    'border_pair',
    'quote_month',
    'currency',
    'rate_status'
  ] loop
    if not public.rateware_bi_value_filter_match(filters, filter_key, public.rateware_bi_dimension_value(rate_row, vendor_row, filter_key)) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.rateware_bi_aggregate_value(
  metric_name text,
  aggregation_name text,
  transaction_count bigint,
  carrier_count bigint,
  avg_value numeric,
  sum_value numeric,
  min_value numeric,
  max_value numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(metric_name, '') = 'transaction_count' or coalesce(aggregation_name, '') = 'count' then transaction_count::numeric
    when coalesce(metric_name, '') = 'distinct_carriers' or coalesce(aggregation_name, '') = 'distinct' then carrier_count::numeric
    when coalesce(aggregation_name, '') = 'sum' then sum_value
    when coalesce(aggregation_name, '') = 'min' then min_value
    when coalesce(aggregation_name, '') = 'max' then max_value
    else avg_value
  end;
$$;

create or replace function public.rateware_bi_pivot_for_owner(
  p_owner_email text,
  p_row_dimensions text[] default array['vendor'],
  p_column_dimensions text[] default array['operation'],
  p_metric text default 'transaction_count',
  p_aggregation text default 'count',
  p_filters jsonb default '{}'::jsonb,
  p_row_limit integer default 300,
  p_column_limit integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_dimensions text[];
  column_dimensions text[];
  metric text := coalesce(nullif(p_metric, ''), 'transaction_count');
  aggregation text := coalesce(nullif(p_aggregation, ''), 'count');
  row_limit integer := least(greatest(coalesce(p_row_limit, 300), 1), 500);
  column_limit integer := least(greatest(coalesce(p_column_limit, 80), 1), 120);
begin
  select coalesce(array_agg(value), array['vendor']::text[])
    into row_dimensions
  from (
    select nullif(btrim(value), '') as value
    from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) as item(value)
    where nullif(btrim(value), '') is not null
    limit 3
  ) rows;

  select coalesce(array_agg(value), array[]::text[])
    into column_dimensions
  from (
    select nullif(btrim(value), '') as value
    from unnest(coalesce(p_column_dimensions, array[]::text[])) as item(value)
    where nullif(btrim(value), '') is not null
    limit 2
  ) columns;

  return (
    with filtered as (
      select rs as rate_row, v as vendor_row
      from public.rate_staging rs
      left join public.vendors v on v.id = rs.vendor_id
      where public.rateware_bi_rate_matches_filters(rs, v, p_owner_email, p_filters)
    ),
    projected as (
      select
        (filtered.rate_row).id,
        row_projection.row_values,
        coalesce(nullif(array_to_string(row_projection.row_values, ' | '), ''), 'Total') as row_key,
        coalesce(nullif(column_projection.column_key, ''), 'Total') as column_key,
        public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor') as carrier_label,
        public.rateware_bi_metric_value(filtered.rate_row, metric) as metric_value,
        public.rateware_bi_metric_value(filtered.rate_row, 'all_in_rate') as all_in_amount
      from filtered
      cross join lateral (
        select coalesce(array_agg(public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, dimension) order by ordinality), array[]::text[]) as row_values
        from unnest(row_dimensions) with ordinality as dimensions(dimension, ordinality)
      ) row_projection
      cross join lateral (
        select coalesce(string_agg(public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, dimension), ' | ' order by ordinality), 'Total') as column_key
        from unnest(column_dimensions) with ordinality as dimensions(dimension, ordinality)
      ) column_projection
    ),
    column_counts as (
      select column_key, count(*) as transactions
      from projected
      group by column_key
      order by transactions desc, column_key
      limit column_limit
    ),
    ordered_columns as (
      select column_key, row_number() over (order by transactions desc, column_key) as sort_order
      from column_counts
    ),
    cell_groups as (
      select
        projected.row_key,
        projected.column_key,
        public.rateware_bi_aggregate_value(
          metric,
          aggregation,
          count(*)::bigint,
          count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value),
          sum(projected.metric_value),
          min(projected.metric_value),
          max(projected.metric_value)
        ) as cell_value
      from projected
      join ordered_columns on ordered_columns.column_key = projected.column_key
      group by projected.row_key, projected.column_key
    ),
    row_totals as (
      select
        projected.row_key,
        projected.row_values,
        count(*) as transactions,
        public.rateware_bi_aggregate_value(
          metric,
          aggregation,
          count(*)::bigint,
          count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value),
          sum(projected.metric_value),
          min(projected.metric_value),
          max(projected.metric_value)
        ) as total_value
      from projected
      group by projected.row_key, projected.row_values
      order by transactions desc, projected.row_key
      limit row_limit
    ),
    summary as (
      select
        count(*) as transactions,
        count(distinct carrier_label) as carriers,
        round(avg(all_in_amount), 2) as avg_all_in_rate,
        round(min(all_in_amount), 2) as min_all_in_rate,
        round(max(all_in_amount), 2) as max_all_in_rate
      from projected
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'row_key', row_totals.row_key,
            'row_values', to_jsonb(row_totals.row_values),
            'cells', coalesce((
              select jsonb_object_agg(ordered_columns.column_key, round(cell_groups.cell_value, 2) order by ordered_columns.sort_order)
              from ordered_columns
              left join cell_groups
                on cell_groups.row_key = row_totals.row_key
               and cell_groups.column_key = ordered_columns.column_key
            ), '{}'::jsonb),
            'total', round(row_totals.total_value, 2),
            'transactions', row_totals.transactions
          )
          order by row_totals.transactions desc, row_totals.row_key
        )
        from row_totals
      ), '[]'::jsonb),
      'columns', coalesce((
        select jsonb_agg(column_key order by sort_order)
        from ordered_columns
      ), '[]'::jsonb),
      'row_dimensions', to_jsonb(row_dimensions),
      'column_dimensions', to_jsonb(column_dimensions),
      'metric', metric,
      'aggregation', aggregation,
      'summary', coalesce((select to_jsonb(summary) from summary), '{}'::jsonb)
    )
  );
end;
$$;

create or replace function public.rateware_bi_drilldown_for_owner(
  p_owner_email text,
  p_row_dimensions text[] default array['vendor'],
  p_column_dimensions text[] default array[]::text[],
  p_row_values text[] default array[]::text[],
  p_column_value text default 'Total',
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_dimensions text[];
  column_dimensions text[];
  row_values text[] := coalesce(p_row_values, array[]::text[]);
  column_value text := coalesce(nullif(p_column_value, ''), 'Total');
  row_limit integer := least(greatest(coalesce(p_limit, 250), 1), 500);
begin
  select coalesce(array_agg(value), array['vendor']::text[])
    into row_dimensions
  from (
    select nullif(btrim(value), '') as value
    from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) as item(value)
    where nullif(btrim(value), '') is not null
    limit 3
  ) rows;

  select coalesce(array_agg(value), array[]::text[])
    into column_dimensions
  from (
    select nullif(btrim(value), '') as value
    from unnest(coalesce(p_column_dimensions, array[]::text[])) as item(value)
    where nullif(btrim(value), '') is not null
    limit 2
  ) columns;

  return (
    with filtered as (
      select rs as rate_row, v as vendor_row
      from public.rate_staging rs
      left join public.vendors v on v.id = rs.vendor_id
      where public.rateware_bi_rate_matches_filters(rs, v, p_owner_email, p_filters)
    ),
    projected as (
      select
        filtered.rate_row,
        filtered.vendor_row,
        row_projection.row_values,
        coalesce(nullif(column_projection.column_key, ''), 'Total') as column_key,
        public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor') as carrier_label,
        public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor_domain') as carrier_domain
      from filtered
      cross join lateral (
        select coalesce(array_agg(public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, dimension) order by ordinality), array[]::text[]) as row_values
        from unnest(row_dimensions) with ordinality as dimensions(dimension, ordinality)
      ) row_projection
      cross join lateral (
        select coalesce(string_agg(public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, dimension), ' | ' order by ordinality), 'Total') as column_key
        from unnest(column_dimensions) with ordinality as dimensions(dimension, ordinality)
      ) column_projection
    ),
    matched as (
      select *
      from projected
      where (cardinality(row_values) = 0 or projected.row_values = row_values)
        and (column_value = 'Total' or projected.column_key = column_value)
    ),
    limited as (
      select *
      from matched
      order by (rate_row).quote_date desc nulls last, (rate_row).created_at desc, (rate_row).id desc
      limit row_limit
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id', (limited.rate_row).id,
        'vendor', nullif(limited.carrier_label, '-'),
        'vendor_domain', nullif(limited.carrier_domain, '-'),
        'quote_date', (limited.rate_row).quote_date,
        'rfx_id', (limited.rate_row).rfx_id,
        'origin', coalesce((limited.rate_row).normalized_origin, (limited.rate_row).origin),
        'origin_market', (limited.rate_row).origin_market,
        'origin_state', (limited.rate_row).origin_state,
        'destination', coalesce((limited.rate_row).normalized_destination, (limited.rate_row).destination),
        'destination_market', (limited.rate_row).destination_market,
        'destination_state', (limited.rate_row).destination_state,
        'equipment', (limited.rate_row).equipment,
        'trailer', (limited.rate_row).trailer,
        'operation', (limited.rate_row).operation,
        'service', (limited.rate_row).service,
        'mx_crossing', (limited.rate_row).mx_border_crossing_point,
        'us_crossing', (limited.rate_row).us_border_crossing_point,
        'all_in_rate', public.rateware_bi_metric_value(limited.rate_row, 'all_in_rate'),
        'currency', (limited.rate_row).currency,
        'calculated_miles', (limited.rate_row).calculated_miles,
        'calculated_km', (limited.rate_row).calculated_km,
        'cost_per_mile', round(public.rateware_bi_metric_value(limited.rate_row, 'cost_per_mile'), 2),
        'cost_per_km', round(public.rateware_bi_metric_value(limited.rate_row, 'cost_per_km'), 2),
        'status', (limited.rate_row).status
      ) order by (limited.rate_row).quote_date desc nulls last, (limited.rate_row).created_at desc, (limited.rate_row).id desc), '[]'::jsonb),
      'total', (select count(*) from matched),
      'cell', jsonb_build_object(
        'row_values', to_jsonb(row_values),
        'column_value', column_value
      )
    )
    from limited
  );
end;
$$;

create or replace function public.rateware_bi_geo_density_for_owner(
  p_owner_email text,
  p_scope text default 'both',
  p_level text default 'market',
  p_metric text default 'transactions',
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  scope_value text := case when lower(coalesce(p_scope, 'both')) in ('origin', 'destination', 'both') then lower(coalesce(p_scope, 'both')) else 'both' end;
  level_value text := case when lower(coalesce(p_level, 'market')) in ('region', 'state', 'market', 'location') then lower(coalesce(p_level, 'market')) else 'market' end;
  metric_value text := lower(coalesce(nullif(p_metric, ''), 'transactions'));
  point_limit integer := least(greatest(coalesce(p_limit, 250), 10), 500);
begin
  return (
    with filtered as (
      select rs as rate_row, v as vendor_row
      from public.rate_staging rs
      left join public.vendors v on v.id = rs.vendor_id
      where public.rateware_bi_rate_matches_filters(rs, v, p_owner_email, p_filters)
    ),
    side_points as (
      select
        (filtered.rate_row).id,
        'origin'::text as side,
        'origin'::text as flow,
        coalesce(nullif(btrim((filtered.rate_row).normalized_origin), ''), nullif(btrim((filtered.rate_row).origin), ''), '-') as raw_location,
        (filtered.rate_row).origin_city as city,
        (filtered.rate_row).origin_state as state,
        (filtered.rate_row).origin_country as country,
        (filtered.rate_row).origin_market as market,
        (filtered.rate_row).origin_region as region,
        (filtered.rate_row).origin_zip_prefix as zip,
        public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor') as carrier_label,
        public.rateware_bi_metric_value(filtered.rate_row, 'all_in_rate') as all_in_amount,
        public.rateware_bi_metric_value(filtered.rate_row, 'cost_per_mile') as cost_per_mile,
        public.rateware_bi_metric_value(filtered.rate_row, 'cost_per_km') as cost_per_km,
        (filtered.rate_row).currency
      from filtered
      where scope_value in ('origin', 'both')
      union all
      select
        (filtered.rate_row).id,
        'destination'::text as side,
        'destination'::text as flow,
        coalesce(nullif(btrim((filtered.rate_row).normalized_destination), ''), nullif(btrim((filtered.rate_row).destination), ''), '-') as raw_location,
        (filtered.rate_row).destination_city as city,
        (filtered.rate_row).destination_state as state,
        (filtered.rate_row).destination_country as country,
        (filtered.rate_row).destination_market as market,
        (filtered.rate_row).destination_region as region,
        (filtered.rate_row).destination_zip_prefix as zip,
        public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor') as carrier_label,
        public.rateware_bi_metric_value(filtered.rate_row, 'all_in_rate') as all_in_amount,
        public.rateware_bi_metric_value(filtered.rate_row, 'cost_per_mile') as cost_per_mile,
        public.rateware_bi_metric_value(filtered.rate_row, 'cost_per_km') as cost_per_km,
        (filtered.rate_row).currency
      from filtered
      where scope_value in ('destination', 'both')
    ),
    labeled as (
      select
        *,
        case level_value
          when 'region' then coalesce(nullif(btrim(region), ''), nullif(concat_ws(' / ', nullif(btrim(country), ''), nullif(btrim(state), '')), ''), raw_location, '-')
          when 'state' then coalesce(nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), raw_location, '-')
          when 'location' then coalesce(nullif(btrim(raw_location), ''), nullif(btrim(market), ''), nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), '-')
          else coalesce(nullif(btrim(market), ''), nullif(btrim(raw_location), ''), nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), '-')
        end as label
      from side_points
    ),
    grouped as (
      select
        side,
        flow,
        level_value as level,
        label,
        coalesce(nullif(btrim(max(city)), ''), split_part(max(raw_location), ',', 1)) as city,
        max(state) as state,
        max(country) as country,
        max(market) as market,
        max(region) as region,
        max(zip) as zip,
        count(*) as transactions,
        count(distinct carrier_label) as carriers,
        round(avg(all_in_amount), 2) as avg_all_in,
        round(avg(cost_per_mile), 2) as avg_cost_per_mile,
        round(avg(cost_per_km), 2) as avg_cost_per_km,
        coalesce(nullif(btrim(max(currency)), ''), 'USD') as currency
      from labeled
      group by side, flow, level_value, label
    ),
    ranked as (
      select
        *,
        case metric_value
          when 'carriers' then carriers::numeric
          when 'avg_all_in' then coalesce(avg_all_in, 0)
          when 'avg_cost_per_mile' then coalesce(avg_cost_per_mile, 0)
          when 'avg_cost_per_km' then coalesce(avg_cost_per_km, 0)
          else transactions::numeric
        end as metric_sort_value
      from grouped
      order by metric_sort_value desc, transactions desc, label
      limit point_limit
    )
    select jsonb_build_object(
      'points', coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.metric_sort_value desc, ranked.transactions desc, ranked.label), '[]'::jsonb),
      'level', level_value,
      'scope', scope_value,
      'metric', metric_value,
      'filters', coalesce(p_filters, '{}'::jsonb),
      'summary', jsonb_build_object(
        'transactions', (select count(*) from filtered),
        'carriers', (select count(distinct public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor')) from filtered),
        'zones', (select count(*) from grouped),
        'missing_geo', 0,
        'plotted', (select count(*) from ranked)
      )
    )
    from ranked
  );
end;
$$;

create or replace function public.rateware_bi_summary_for_owner(
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select rs as rate_row, v as vendor_row
    from public.rate_staging rs
    left join public.vendors v on v.id = rs.vendor_id
    where public.rateware_bi_rate_matches_filters(rs, v, p_owner_email, p_filters)
  )
  select jsonb_build_object(
    'transactions', count(*),
    'carriers', count(distinct public.rateware_bi_dimension_value(filtered.rate_row, filtered.vendor_row, 'vendor')),
    'approved_rates', count(*) filter (where (rate_row).status = 'approved'),
    'pending_rates', count(*) filter (where (rate_row).status = 'pending_review'),
    'crossborder_rates', count(*) filter (where public.rateware_row_cross_border(rate_row)),
    'd2d_import_export_rates', count(*) filter (
      where public.rateware_row_cross_border(rate_row)
        and lower(public.rateware_bi_row_text(filtered.rate_row, filtered.vendor_row)) similar to '%(d2d import|d2d export)%'
    ),
    'missing_vendor', count(*) filter (where (rate_row).vendor_id is null and nullif(btrim(coalesce((rate_row).vendor_domain, '')), '') is not null),
    'missing_rate', count(*) filter (where public.rateware_bi_metric_value(rate_row, 'all_in_rate') is null),
    'missing_miles', count(*) filter (
      where public.rateware_bi_metric_value(rate_row, 'all_in_rate') is not null
        and (rate_row).calculated_miles is null
        and (rate_row).calculated_km is null
        and public.rateware_clean_rate_number((rate_row).us_miles) is null
    ),
    'missing_origin', count(*) filter (
      where nullif(btrim(coalesce((rate_row).origin_market, '')), '') is null
        and nullif(btrim(coalesce((rate_row).origin_state, '')), '') is null
        and nullif(btrim(coalesce((rate_row).origin_country, '')), '') is null
    ),
    'missing_destination', count(*) filter (
      where nullif(btrim(coalesce((rate_row).destination_market, '')), '') is null
        and nullif(btrim(coalesce((rate_row).destination_state, '')), '') is null
        and nullif(btrim(coalesce((rate_row).destination_country, '')), '') is null
    ),
    'avg_all_in_rate', round(avg(public.rateware_bi_metric_value(rate_row, 'all_in_rate')), 2),
    'min_all_in_rate', round(min(public.rateware_bi_metric_value(rate_row, 'all_in_rate')), 2),
    'max_all_in_rate', round(max(public.rateware_bi_metric_value(rate_row, 'all_in_rate')), 2)
  )
  from filtered;
$$;

create or replace function public.rateware_bi_vendor_metrics_for_owner(
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns table (
  vendor_id uuid,
  linked_rates bigint,
  approved_rates bigint,
  pending_rates bigint,
  crossborder_rates bigint,
  d2d_import_export_rates bigint,
  mexico_rates bigint,
  avg_all_in_rate numeric,
  avg_cost_per_mile numeric,
  avg_cost_per_km numeric,
  markets text[],
  lanes text[],
  equipment text[],
  border_pairs text[],
  last_quote_date date
)
language sql
stable
security definer
set search_path = public
as $$
with vendor_scope as (
  select
    v as vendor_row,
    v.id,
    v.domain,
    v.primary_email,
    coalesce(v.secondary_emails, '{}'::text[]) as secondary_emails
  from public.vendors v
  where v.owner_email = p_owner_email
),
domain_candidates as (
  select id as vendor_id, public.rateware_domain_key(domain) as domain_key, 100 as priority
  from vendor_scope
  union all
  select id as vendor_id, public.rateware_domain_key(primary_email) as domain_key, 90 as priority
  from vendor_scope
  union all
  select vendor_scope.id as vendor_id, public.rateware_domain_key(secondary.email) as domain_key, 80 as priority
  from vendor_scope
  cross join lateral unnest(vendor_scope.secondary_emails) as secondary(email)
),
vendor_domains as (
  select distinct on (domain_key)
    domain_key,
    vendor_id
  from domain_candidates
  where domain_key is not null
    and not public.rateware_is_generic_email_domain(domain_key)
  order by domain_key, priority desc, vendor_id
),
matched_rates as (
  select
    scoped_vendor.id as vendor_id,
    rs as rate_row,
    scoped_vendor.vendor_row as vendor_row,
    public.rateware_bi_metric_value(rs, 'all_in_rate') as all_in_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_mile') as cost_per_mile_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_km') as cost_per_km_amount,
    lower(public.rateware_bi_row_text(rs, scoped_vendor.vendor_row)) as searchable_rate_text
  from public.rate_staging rs
  left join vendor_scope linked
    on linked.id = rs.vendor_id
  left join lateral (
    select vendor_domains.vendor_id
    from vendor_domains
    where linked.id is null
      and vendor_domains.domain_key = public.rateware_domain_key(rs.vendor_domain)
    limit 1
  ) domain_match on true
  join vendor_scope scoped_vendor
    on scoped_vendor.id = coalesce(linked.id, domain_match.vendor_id)
  where public.rateware_bi_rate_matches_filters(rs, scoped_vendor.vendor_row, p_owner_email, p_filters)
),
prepared as (
  select
    matched_rates.*,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'origin_market') as o_market,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'destination_market') as d_market,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'route') as lane_value,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'border_pair') as border_pair_value
  from matched_rates
)
select
  prepared.vendor_id,
  count(*)::bigint as linked_rates,
  count(*) filter (where (prepared.rate_row).status = 'approved')::bigint as approved_rates,
  count(*) filter (where (prepared.rate_row).status = 'pending_review')::bigint as pending_rates,
  count(*) filter (where public.rateware_row_cross_border(prepared.rate_row))::bigint as crossborder_rates,
  count(*) filter (
    where public.rateware_row_cross_border(prepared.rate_row)
      and (prepared.searchable_rate_text like '%d2d import%' or prepared.searchable_rate_text like '%d2d export%')
  )::bigint as d2d_import_export_rates,
  count(*) filter (
    where upper(coalesce((prepared.rate_row).origin_country, '')) = 'MX'
       or upper(coalesce((prepared.rate_row).destination_country, '')) = 'MX'
       or prepared.searchable_rate_text similar to '%(mexico|monterrey|nuevo leon|apodaca|queretaro|bajio|laredo|lerma|toluca)%'
  )::bigint as mexico_rates,
  round(avg(prepared.all_in_amount)) as avg_all_in_rate,
  round(avg(prepared.cost_per_mile_amount), 2) as avg_cost_per_mile,
  round(avg(prepared.cost_per_km_amount), 2) as avg_cost_per_km,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct value
      from (
        select nullif(o_market, '-') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
        union
        select nullif(d_market, '-') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
      ) market_values
      where value is not null
      limit 8
    ) limited
  ) as markets,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct nullif(lane_value, '- -> -') as value
      from prepared lane_rows
      where lane_rows.vendor_id = prepared.vendor_id
        and nullif(lane_value, '- -> -') is not null
      limit 6
    ) limited
  ) as lanes,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct value
      from (
        select nullif(btrim((equipment_rows.rate_row).equipment), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
        union
        select nullif(btrim((equipment_rows.rate_row).trailer), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
      ) equipment_values
      where value is not null
      limit 6
    ) limited
  ) as equipment,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct nullif(border_pair_value, '- / -') as value
      from prepared border_rows
      where border_rows.vendor_id = prepared.vendor_id
        and nullif(border_pair_value, '- / -') is not null
      limit 6
    ) limited
  ) as border_pairs,
  max((prepared.rate_row).quote_date) as last_quote_date
from prepared
group by prepared.vendor_id;
$$;
