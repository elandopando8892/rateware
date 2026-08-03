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
  select coalesce(array_agg(value), array['vendor']::text[]) into row_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) item(value) where nullif(btrim(value), '') is not null limit 3) rows;
  select coalesce(array_agg(value), array[]::text[]) into column_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_column_dimensions, array[]::text[])) item(value) where nullif(btrim(value), '') is not null limit 2) columns;

  if scoped_owner is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'columns', '[]'::jsonb, 'summary', '{}'::jsonb);
  end if;

  return (
    with filtered as materialized (
      select
        facts.rate_id,
        facts.dimensions,
        facts.all_in_amount,
        facts.cost_per_mile,
        facts.cost_per_km,
        facts.us_miles_amount,
        facts.calculated_miles,
        facts.calculated_km,
        source.mx_linehaul,
        source.us_linehaul,
        source.fsc,
        source.border_crossing_fee
      from public.rateware_bi_rate_facts facts
      left join public.rate_staging source
        on source.id = facts.rate_id
       and metric in ('mx_linehaul', 'us_linehaul', 'fsc', 'border_crossing_fee')
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and case when filters = '{}'::jsonb then true else public.rateware_bi_fact_matches_filters(facts, filters) end
    ),
    dimensioned as materialized (
      select
        filtered.*,
        array_remove(array[
          case when cardinality(row_dimensions) >= 1 then coalesce(filtered.dimensions ->> row_dimensions[1], '-') end,
          case when cardinality(row_dimensions) >= 2 then coalesce(filtered.dimensions ->> row_dimensions[2], '-') end,
          case when cardinality(row_dimensions) >= 3 then coalesce(filtered.dimensions ->> row_dimensions[3], '-') end
        ], null) row_values,
        coalesce(nullif(concat_ws(' | ',
          case when cardinality(column_dimensions) >= 1 then coalesce(filtered.dimensions ->> column_dimensions[1], '-') end,
          case when cardinality(column_dimensions) >= 2 then coalesce(filtered.dimensions ->> column_dimensions[2], '-') end
        ), ''), 'Total') column_key,
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
        end metric_value
      from filtered
    ),
    projected as materialized (
      select
        dimensioned.*,
        coalesce(nullif(array_to_string(dimensioned.row_values, ' | '), ''), 'Total') row_key
      from dimensioned
    ),
    column_counts as (
      select column_key, count(*) transactions from projected group by column_key
      order by transactions desc, column_key limit column_limit
    ),
    ordered_columns as (
      select column_key, row_number() over (order by transactions desc, column_key) sort_order from column_counts
    ),
    cell_groups as (
      select projected.row_key, projected.column_key,
        public.rateware_bi_aggregate_value(
          metric, aggregation, count(*)::bigint, count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value), sum(projected.metric_value), min(projected.metric_value), max(projected.metric_value)
        ) cell_value
      from projected
      join ordered_columns on ordered_columns.column_key = projected.column_key
      group by projected.row_key, projected.column_key
    ),
    row_totals as (
      select projected.row_key, projected.row_values, count(*) transactions,
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
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'row_key', row_totals.row_key,
        'row_values', to_jsonb(row_totals.row_values),
        'cells', coalesce((select jsonb_object_agg(ordered_columns.column_key, round(cell_groups.cell_value, 2) order by ordered_columns.sort_order)
          from ordered_columns left join cell_groups on cell_groups.row_key = row_totals.row_key and cell_groups.column_key = ordered_columns.column_key), '{}'::jsonb),
        'total', round(row_totals.total_value, 2),
        'transactions', row_totals.transactions
      ) order by row_totals.transactions desc, row_totals.row_key) from row_totals), '[]'::jsonb),
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
  selected_row_values text[] := coalesce(p_row_values, array[]::text[]);
  selected_column_value text := coalesce(nullif(p_column_value, ''), 'Total');
  row_limit integer := least(greatest(coalesce(p_limit, 250), 1), 500);
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  select coalesce(array_agg(value), array['vendor']::text[]) into row_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_row_dimensions, array['vendor']::text[])) item(value) where nullif(btrim(value), '') is not null limit 3) rows;
  select coalesce(array_agg(value), array[]::text[]) into column_dimensions
  from (select nullif(btrim(value), '') value from unnest(coalesce(p_column_dimensions, array[]::text[])) item(value) where nullif(btrim(value), '') is not null limit 2) columns;

  if scoped_owner is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'cell', jsonb_build_object('row_values', to_jsonb(selected_row_values), 'column_value', selected_column_value));
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
        array_remove(array[
          case when cardinality(row_dimensions) >= 1 then coalesce(filtered.dimensions ->> row_dimensions[1], '-') end,
          case when cardinality(row_dimensions) >= 2 then coalesce(filtered.dimensions ->> row_dimensions[2], '-') end,
          case when cardinality(row_dimensions) >= 3 then coalesce(filtered.dimensions ->> row_dimensions[3], '-') end
        ], null) projected_row_values,
        coalesce(nullif(concat_ws(' | ',
          case when cardinality(column_dimensions) >= 1 then coalesce(filtered.dimensions ->> column_dimensions[1], '-') end,
          case when cardinality(column_dimensions) >= 2 then coalesce(filtered.dimensions ->> column_dimensions[2], '-') end
        ), ''), 'Total') projected_column_value
      from filtered
    ),
    matched as materialized (
      select * from projected
      where (cardinality(selected_row_values) = 0 or projected.projected_row_values = selected_row_values)
        and (selected_column_value = 'Total' or projected.projected_column_value = selected_column_value)
    ),
    limited as (
      select * from matched
      order by quote_date desc nulls last, created_at desc, rate_id desc
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
      'cell', jsonb_build_object('row_values', to_jsonb(selected_row_values), 'column_value', selected_column_value)
    )
    from limited
  );
end;
$$;

revoke all on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) to service_role;
grant execute on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer) to service_role;
