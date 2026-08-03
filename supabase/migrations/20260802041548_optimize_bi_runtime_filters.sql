-- The previous BI predicate accepted the complete fact row as a composite
-- argument. PostgreSQL had to materialize/copy that wide row for every match,
-- turning simple filters such as crossborder=true into multi-second scans.
-- Keep the existing public helper for compatibility, but inline its equivalent
-- predicate into the five server-only RPCs that scan the BI fact table.
do $$
declare
  target_oid oid;
  target_signature text;
  definition text;
  rewritten text;
  needle constant text := 'public.rateware_bi_fact_matches_filters(facts, filters)';
  predicate constant text := $predicate$(
          (
            not (filters ? 'search')
            or public.rateware_bi_value_filter_match(filters, 'search', facts.search_text)
          )
          and (
            not coalesce((filters ->> 'crossborder')::boolean, false)
            or facts.is_crossborder
          )
          and (
            not coalesce((filters ->> 'd2d')::boolean, false)
            or facts.is_d2d
          )
          and (
            filters - array['search', 'crossborder', 'd2d']::text[] = '{}'::jsonb
            or not exists (
              select 1
              from jsonb_object_keys(
                filters - array['search', 'crossborder', 'd2d']::text[]
              ) as active(key)
              where facts.dimensions ? active.key
                and not public.rateware_bi_value_filter_match(
                  filters,
                  active.key,
                  facts.dimensions ->> active.key
                )
            )
          )
        )$predicate$;
begin
  for target_oid, target_signature in
    select function_oid, signature
    from (values
      ('public.rateware_bi_summary_for_owner(text,jsonb)'::regprocedure::oid, 'rateware_bi_summary_for_owner'),
      ('public.rateware_bi_vendor_metrics_for_owner(text,jsonb)'::regprocedure::oid, 'rateware_bi_vendor_metrics_for_owner'),
      ('public.rateware_bi_pivot_for_owner(text,text[],text[],text,text,jsonb,integer,integer)'::regprocedure::oid, 'rateware_bi_pivot_for_owner'),
      ('public.rateware_bi_drilldown_for_owner(text,text[],text[],text[],text,jsonb,integer)'::regprocedure::oid, 'rateware_bi_drilldown_for_owner'),
      ('public.rateware_bi_geo_density_for_owner(text,text,text,text,jsonb,integer)'::regprocedure::oid, 'rateware_bi_geo_density_for_owner')
    ) targets(function_oid, signature)
  loop
    definition := pg_get_functiondef(target_oid);
    rewritten := replace(definition, needle, predicate);
    if rewritten = definition then
      raise exception 'Expected BI filter predicate was not found in %', target_signature;
    end if;
    execute rewritten;
  end loop;
end;
$$;

analyze public.rateware_bi_rate_facts;
