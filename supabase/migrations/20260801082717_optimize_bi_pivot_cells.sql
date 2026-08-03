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
        facts.dimensions,
        facts.all_in_amount,
        facts.cost_per_mile,
        facts.cost_per_km,
        facts.us_miles_amount,
        facts.calculated_miles,
        facts.calculated_km,
        facts.mx_linehaul_amount,
        facts.us_linehaul_amount,
        facts.fsc_amount,
        facts.border_crossing_fee_amount
      from public.rateware_bi_rate_facts facts
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and case when filters = '{}'::jsonb then true else public.rateware_bi_fact_matches_filters(facts, filters) end
    ),
    projected as materialized (
      select
        array_remove(array[
          case when cardinality(row_dimensions) >= 1 then coalesce(filtered.dimensions ->> row_dimensions[1], '-') end,
          case when cardinality(row_dimensions) >= 2 then coalesce(filtered.dimensions ->> row_dimensions[2], '-') end,
          case when cardinality(row_dimensions) >= 3 then coalesce(filtered.dimensions ->> row_dimensions[3], '-') end
        ], null) row_values,
        coalesce(nullif(concat_ws(' | ',
          case when cardinality(row_dimensions) >= 1 then coalesce(filtered.dimensions ->> row_dimensions[1], '-') end,
          case when cardinality(row_dimensions) >= 2 then coalesce(filtered.dimensions ->> row_dimensions[2], '-') end,
          case when cardinality(row_dimensions) >= 3 then coalesce(filtered.dimensions ->> row_dimensions[3], '-') end
        ), ''), 'Total') row_key,
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
          when 'mx_linehaul' then filtered.mx_linehaul_amount
          when 'us_linehaul' then filtered.us_linehaul_amount
          when 'fsc' then filtered.fsc_amount
          when 'border_crossing_fee' then filtered.border_crossing_fee_amount
          else null
        end metric_value,
        filtered.all_in_amount
      from filtered
    ),
    column_counts as (
      select column_key, count(*) transactions from projected group by column_key
      order by transactions desc, column_key limit column_limit
    ),
    ordered_columns as materialized (
      select column_key, row_number() over (order by transactions desc, column_key) sort_order from column_counts
    ),
    cell_groups as materialized (
      select projected.row_key, projected.column_key,
        public.rateware_bi_aggregate_value(metric, aggregation, count(*)::bigint, count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value), sum(projected.metric_value), min(projected.metric_value), max(projected.metric_value)) cell_value
      from projected join ordered_columns on ordered_columns.column_key = projected.column_key
      group by projected.row_key, projected.column_key
    ),
    row_totals as materialized (
      select projected.row_key, projected.row_values, count(*) transactions,
        public.rateware_bi_aggregate_value(metric, aggregation, count(*)::bigint, count(distinct projected.carrier_label)::bigint,
          avg(projected.metric_value), sum(projected.metric_value), min(projected.metric_value), max(projected.metric_value)) total_value
      from projected group by projected.row_key, projected.row_values
      order by transactions desc, projected.row_key limit row_limit
    ),
    row_cells as materialized (
      select
        row_totals.row_key,
        row_totals.row_values,
        row_totals.total_value,
        row_totals.transactions,
        jsonb_object_agg(ordered_columns.column_key, round(cell_groups.cell_value, 2) order by ordered_columns.sort_order) cells
      from row_totals
      cross join ordered_columns
      left join cell_groups
        on cell_groups.row_key = row_totals.row_key
       and cell_groups.column_key = ordered_columns.column_key
      group by row_totals.row_key, row_totals.row_values, row_totals.total_value, row_totals.transactions
    ),
    summary as (
      select count(*) transactions, count(distinct carrier_label) carriers,
        round(avg(all_in_amount), 2) avg_all_in_rate, round(min(all_in_amount), 2) min_all_in_rate, round(max(all_in_amount), 2) max_all_in_rate
      from projected
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'row_key', row_cells.row_key,
        'row_values', to_jsonb(row_cells.row_values),
        'cells', coalesce(row_cells.cells, '{}'::jsonb),
        'total', round(row_cells.total_value, 2),
        'transactions', row_cells.transactions
      ) order by row_cells.transactions desc, row_cells.row_key) from row_cells), '[]'::jsonb),
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

revoke all on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) to service_role;
