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
set search_path = ''
as $$
declare
  row_dimensions text[];
  column_dimensions text[];
  metric text := coalesce(nullif(p_metric, ''), 'transaction_count');
  aggregation text := coalesce(nullif(p_aggregation, ''), 'count');
  row_limit integer := least(greatest(coalesce(p_row_limit, 300), 1), 500);
  column_limit integer := least(greatest(coalesce(p_column_limit, 80), 1), 120);
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  select coalesce(array_agg(value), array['vendor']::text[])
    into row_dimensions
  from (
    select nullif(btrim(value), '') value
    from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) item(value)
    where nullif(btrim(value), '') is not null
    limit 3
  ) rows;

  select coalesce(array_agg(value), array[]::text[])
    into column_dimensions
  from (
    select nullif(btrim(value), '') value
    from unnest(coalesce(p_column_dimensions, array[]::text[])) item(value)
    where nullif(btrim(value), '') is not null
    limit 2
  ) columns;

  if scoped_owner is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'columns', '[]'::jsonb, 'summary', '{}'::jsonb);
  end if;

  return (
    with filtered as materialized (
      select facts.*, source.mx_linehaul, source.us_linehaul, source.fsc, source.border_crossing_fee
      from public.rateware_bi_rate_facts facts
      left join public.rate_staging source on source.id = facts.rate_id
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and case when filters = '{}'::jsonb then true else public.rateware_bi_fact_matches_filters(facts, filters) end
    ),
    projected as materialized (
      select
        filtered.rate_id,
        row_projection.row_values,
        coalesce(nullif(array_to_string(row_projection.row_values, ' | '), ''), 'Total') row_key,
        coalesce(nullif(column_projection.column_key, ''), 'Total') column_key,
        coalesce(filtered.dimensions ->> 'vendor', 'Unmatched carrier') carrier_label,
        case metric
          when 'all_in_rate' then filtered.all_in_amount
          when 'cost_per_mile' then filtered.cost_per_mile
          when 'cost_per_km' then filtered.cost_per_km
          when 'us_miles' then filtered.us_miles_amount
          when 'calculated_miles' then filtered.calculated_miles
          when 'calculated_km' then filtered.calculated_km
          when 'mx_linehaul' then public.rateware_clean_rate_number(filtered.mx_linehaul)
          when 'us_linehaul' then public.rateware_clean_rate_number(filtered.us_linehaul)
          when 'fsc' then public.rateware_clean_rate_number(filtered.fsc)
          when 'border_crossing_fee' then public.rateware_clean_rate_number(filtered.border_crossing_fee)
          else null
        end metric_value,
        filtered.all_in_amount
      from filtered
      cross join lateral (
        select coalesce(array_agg(coalesce(filtered.dimensions ->> dimension, '-') order by ordinality), array[]::text[]) row_values
        from unnest(row_dimensions) with ordinality dimensions(dimension, ordinality)
      ) row_projection
      cross join lateral (
        select coalesce(string_agg(coalesce(filtered.dimensions ->> dimension, '-'), ' | ' order by ordinality), 'Total') column_key
        from unnest(column_dimensions) with ordinality dimensions(dimension, ordinality)
      ) column_projection
    ),
    column_counts as (
      select column_key, count(*) transactions
      from projected
      group by column_key
      order by transactions desc, column_key
      limit column_limit
    ),
    ordered_columns as (
      select column_key, row_number() over (order by transactions desc, column_key) sort_order
      from column_counts
    ),
    cell_groups as (
      select
        projected.row_key,
        projected.column_key,
        public.rateware_bi_aggregate_value(
          metric, aggregation, count(*)::bigint, count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value), sum(projected.metric_value), min(projected.metric_value), max(projected.metric_value)
        ) cell_value
      from projected
      join ordered_columns on ordered_columns.column_key = projected.column_key
      group by projected.row_key, projected.column_key
    ),
    row_totals as (
      select
        projected.row_key,
        projected.row_values,
        count(*) transactions,
        public.rateware_bi_aggregate_value(
          metric, aggregation, count(*)::bigint, count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value), sum(projected.metric_value), min(projected.metric_value), max(projected.metric_value)
        ) total_value
      from projected
      group by projected.row_key, projected.row_values
      order by transactions desc, projected.row_key
      limit row_limit
    ),
    summary as (
      select count(*) transactions, count(distinct carrier_label) carriers,
        round(avg(all_in_amount), 2) avg_all_in_rate,
        round(min(all_in_amount), 2) min_all_in_rate,
        round(max(all_in_amount), 2) max_all_in_rate
      from projected
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'row_key', row_totals.row_key,
          'row_values', to_jsonb(row_totals.row_values),
          'cells', coalesce((
            select jsonb_object_agg(ordered_columns.column_key, round(cell_groups.cell_value, 2) order by ordered_columns.sort_order)
            from ordered_columns
            left join cell_groups on cell_groups.row_key = row_totals.row_key and cell_groups.column_key = ordered_columns.column_key
          ), '{}'::jsonb),
          'total', round(row_totals.total_value, 2),
          'transactions', row_totals.transactions
        ) order by row_totals.transactions desc, row_totals.row_key)
        from row_totals
      ), '[]'::jsonb),
      'columns', coalesce((select jsonb_agg(column_key order by sort_order) from ordered_columns), '[]'::jsonb),
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
set search_path = ''
as $$
declare
  row_dimensions text[];
  column_dimensions text[];
  row_values text[] := coalesce(p_row_values, array[]::text[]);
  column_value text := coalesce(nullif(p_column_value, ''), 'Total');
  row_limit integer := least(greatest(coalesce(p_limit, 250), 1), 500);
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  select coalesce(array_agg(value), array['vendor']::text[]) into row_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) item(value) where nullif(btrim(value), '') is not null limit 3) rows;
  select coalesce(array_agg(value), array[]::text[]) into column_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_column_dimensions, array[]::text[])) item(value) where nullif(btrim(value), '') is not null limit 2) columns;

  if scoped_owner is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'cell', jsonb_build_object('row_values', to_jsonb(row_values), 'column_value', column_value));
  end if;

  return (
    with filtered as materialized (
      select facts.*
      from public.rateware_bi_rate_facts facts
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and case when filters = '{}'::jsonb then true else public.rateware_bi_fact_matches_filters(facts, filters) end
    ),
    projected as materialized (
      select
        filtered.*,
        row_projection.row_values,
        coalesce(nullif(column_projection.column_key, ''), 'Total') column_key
      from filtered
      cross join lateral (
        select coalesce(array_agg(coalesce(filtered.dimensions ->> dimension, '-') order by ordinality), array[]::text[]) row_values
        from unnest(row_dimensions) with ordinality dimensions(dimension, ordinality)
      ) row_projection
      cross join lateral (
        select coalesce(string_agg(coalesce(filtered.dimensions ->> dimension, '-'), ' | ' order by ordinality), 'Total') column_key
        from unnest(column_dimensions) with ordinality dimensions(dimension, ordinality)
      ) column_projection
    ),
    matched as materialized (
      select * from projected
      where (cardinality(row_values) = 0 or projected.row_values = row_values)
        and (column_value = 'Total' or projected.column_key = column_value)
    ),
    limited as (
      select matched.*
      from matched
      order by matched.quote_date desc nulls last, matched.created_at desc, matched.rate_id desc
      limit row_limit
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id', limited.rate_id,
        'vendor', nullif(limited.dimensions ->> 'vendor', '-'),
        'vendor_domain', nullif(limited.dimensions ->> 'vendor_domain', '-'),
        'quote_date', limited.quote_date,
        'rfx_id', limited.rfx_id,
        'origin', nullif(limited.dimensions ->> 'origin', '-'),
        'origin_market', nullif(limited.dimensions ->> 'origin_market', '-'),
        'origin_state', nullif(limited.dimensions ->> 'origin_state', '-'),
        'destination', nullif(limited.dimensions ->> 'destination', '-'),
        'destination_market', nullif(limited.dimensions ->> 'destination_market', '-'),
        'destination_state', nullif(limited.dimensions ->> 'destination_state', '-'),
        'equipment', nullif(limited.dimensions ->> 'equipment', '-'),
        'trailer', nullif(limited.dimensions ->> 'trailer', '-'),
        'operation', nullif(limited.dimensions ->> 'operation', '-'),
        'service', nullif(limited.dimensions ->> 'service', '-'),
        'mx_crossing', nullif(limited.dimensions ->> 'mx_crossing', '-'),
        'us_crossing', nullif(limited.dimensions ->> 'us_crossing', '-'),
        'all_in_rate', limited.all_in_amount,
        'currency', limited.currency,
        'calculated_miles', limited.calculated_miles,
        'calculated_km', limited.calculated_km,
        'cost_per_mile', round(limited.cost_per_mile, 2),
        'cost_per_km', round(limited.cost_per_km, 2),
        'status', limited.status
      ) order by limited.quote_date desc nulls last, limited.created_at desc, limited.rate_id desc), '[]'::jsonb),
      'total', (select count(*) from matched),
      'cell', jsonb_build_object('row_values', to_jsonb(row_values), 'column_value', column_value)
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
set search_path = ''
as $$
declare
  scope_value text := case when lower(coalesce(p_scope, 'both')) in ('origin', 'destination', 'both') then lower(coalesce(p_scope, 'both')) else 'both' end;
  level_value text := case when lower(coalesce(p_level, 'market')) in ('region', 'state', 'market', 'location') then lower(coalesce(p_level, 'market')) else 'market' end;
  metric_value text := lower(coalesce(nullif(p_metric, ''), 'transactions'));
  point_limit integer := least(greatest(coalesce(p_limit, 250), 10), 500);
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if scoped_owner is null then
    return jsonb_build_object('points', '[]'::jsonb, 'summary', '{}'::jsonb, 'level', level_value, 'scope', scope_value, 'metric', metric_value);
  end if;

  return (
    with filtered as materialized (
      select facts.*
      from public.rateware_bi_rate_facts facts
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and case when filters = '{}'::jsonb then true else public.rateware_bi_fact_matches_filters(facts, filters) end
    ),
    side_points as (
      select filtered.rate_id, 'origin'::text side, 'origin'::text flow,
        coalesce(nullif(filtered.dimensions ->> 'origin', '-'), '-') raw_location,
        split_part(coalesce(filtered.dimensions ->> 'origin', ''), ',', 1) city,
        nullif(filtered.dimensions ->> 'origin_state', '-') state,
        nullif(filtered.dimensions ->> 'origin_country', '-') country,
        nullif(filtered.dimensions ->> 'origin_market', '-') market,
        nullif(filtered.dimensions ->> 'origin_region', '-') region,
        nullif(filtered.dimensions ->> 'origin_zip', '-') zip,
        filtered.dimensions ->> 'vendor' carrier_label,
        filtered.all_in_amount, filtered.cost_per_mile, filtered.cost_per_km, filtered.currency
      from filtered where scope_value in ('origin', 'both')
      union all
      select filtered.rate_id, 'destination', 'destination',
        coalesce(nullif(filtered.dimensions ->> 'destination', '-'), '-'),
        split_part(coalesce(filtered.dimensions ->> 'destination', ''), ',', 1),
        nullif(filtered.dimensions ->> 'destination_state', '-'),
        nullif(filtered.dimensions ->> 'destination_country', '-'),
        nullif(filtered.dimensions ->> 'destination_market', '-'),
        nullif(filtered.dimensions ->> 'destination_region', '-'),
        nullif(filtered.dimensions ->> 'destination_zip', '-'),
        filtered.dimensions ->> 'vendor',
        filtered.all_in_amount, filtered.cost_per_mile, filtered.cost_per_km, filtered.currency
      from filtered where scope_value in ('destination', 'both')
    ),
    labeled as (
      select *, case level_value
        when 'region' then coalesce(nullif(btrim(region), ''), nullif(concat_ws(' / ', nullif(btrim(country), ''), nullif(btrim(state), '')), ''), raw_location, '-')
        when 'state' then coalesce(nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), raw_location, '-')
        when 'location' then coalesce(nullif(btrim(raw_location), ''), nullif(btrim(market), ''), nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), '-')
        else coalesce(nullif(btrim(market), ''), nullif(btrim(raw_location), ''), nullif(concat_ws(' / ', nullif(btrim(state), ''), nullif(btrim(country), '')), ''), '-')
      end label
      from side_points
    ),
    grouped as (
      select side, flow, level_value level, label,
        coalesce(nullif(btrim(max(city)), ''), split_part(max(raw_location), ',', 1)) city,
        max(state) state, max(country) country, max(market) market, max(region) region, max(zip) zip,
        count(*) transactions, count(distinct carrier_label) carriers,
        round(avg(all_in_amount), 2) avg_all_in,
        round(avg(cost_per_mile), 2) avg_cost_per_mile,
        round(avg(cost_per_km), 2) avg_cost_per_km,
        coalesce(nullif(btrim(max(currency)), ''), 'USD') currency
      from labeled
      group by side, flow, level_value, label
    ),
    ranked as (
      select *, case metric_value
        when 'carriers' then carriers::numeric
        when 'avg_all_in' then coalesce(avg_all_in, 0)
        when 'avg_cost_per_mile' then coalesce(avg_cost_per_mile, 0)
        when 'avg_cost_per_km' then coalesce(avg_cost_per_km, 0)
        else transactions::numeric
      end metric_sort_value
      from grouped
      order by metric_sort_value desc, transactions desc, label
      limit point_limit
    )
    select jsonb_build_object(
      'points', coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.metric_sort_value desc, ranked.transactions desc, ranked.label), '[]'::jsonb),
      'level', level_value,
      'scope', scope_value,
      'metric', metric_value,
      'filters', filters,
      'summary', jsonb_build_object(
        'transactions', (select count(*) from filtered),
        'carriers', (select count(distinct dimensions ->> 'vendor') from filtered),
        'zones', (select count(*) from grouped),
        'missing_geo', 0,
        'plotted', (select count(*) from ranked)
      )
    )
    from ranked
  );
end;
$$;

revoke all on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) to service_role;
grant execute on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer) to service_role;
grant execute on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer) to service_role;
