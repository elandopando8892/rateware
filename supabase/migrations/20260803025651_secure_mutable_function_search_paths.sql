-- Pin every legacy helper to trusted schemas and remove implicit Data API RPC
-- execution. The service-role API remains the only direct caller.
do $migration$
declare
  target_names constant text[] := array[
    'approve_rate_staging',
    'rateware_bi_aggregate_value',
    'rateware_bi_dimension_value',
    'rateware_bi_metric_value',
    'rateware_bi_row_text',
    'rateware_bi_value_filter_match',
    'rateware_bool_filter_match',
    'rateware_clean_rate_number',
    'rateware_domain_key',
    'rateware_filter_values_for_field',
    'rateware_has_numeric_rate',
    'rateware_is_generic_email_domain',
    'rateware_json_filter_values',
    'rateware_rate_matches_filters',
    'rateware_row_conflict',
    'rateware_row_cross_border',
    'rateware_row_currency_gap',
    'rateware_row_has_all_in_text',
    'rateware_row_has_split',
    'rateware_row_location_gap',
    'rateware_row_needs_rate',
    'rateware_row_ready',
    'rateware_row_service_conflict',
    'rateware_row_source_audit',
    'rateware_row_split_conflict',
    'rateware_service_mode_key',
    'rateware_text_filter_match',
    'rateware_values_filter_match',
    'rateware_vendor_funnel_stage_rank',
    'rateware_vendor_search_key',
    'vendor_rate_metrics_for_owner'
  ];
  function_record record;
  updated_count integer := 0;
begin
  for function_record in
    select
      namespace.nspname as schema_name,
      functions.proname as function_name,
      pg_get_function_identity_arguments(functions.oid) as identity_arguments
    from pg_proc functions
    join pg_namespace namespace on namespace.oid = functions.pronamespace
    where namespace.nspname = 'public'
      and functions.proname = any(target_names)
    order by functions.proname, pg_get_function_identity_arguments(functions.oid)
  loop
    execute format(
      'alter function %I.%I(%s) set search_path to pg_catalog, public, pg_temp',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    updated_count := updated_count + 1;
  end loop;

  if updated_count <> 31 then
    raise exception 'Expected to secure 31 mutable-search-path functions, secured %', updated_count;
  end if;
end;
$migration$;
