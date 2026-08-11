CREATE OR REPLACE FUNCTION public.rateware_bi_vendor_metrics_for_owner_v2(
  p_owner_email text,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET work_mem TO '64MB'
AS $function$
DECLARE
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF scoped_owner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH vendor_scope AS MATERIALIZED (
    SELECT
      vendors.id,
      public.rateware_domain_key(vendors.domain) domain_key,
      public.rateware_domain_key(vendors.primary_email) email_domain_key,
      coalesce(vendors.secondary_emails, '{}'::text[]) secondary_emails
    FROM public.vendors vendors
    WHERE vendors.owner_email = scoped_owner
  ),
  domain_candidates AS (
    SELECT scope.id resolved_vendor_id, scope.domain_key, 100 priority FROM vendor_scope scope
    UNION ALL
    SELECT scope.id, scope.email_domain_key, 90 FROM vendor_scope scope
    UNION ALL
    SELECT scope.id, public.rateware_domain_key(secondary.email), 80
    FROM vendor_scope scope
    CROSS JOIN LATERAL unnest(scope.secondary_emails) AS secondary(email)
  ),
  vendor_domains AS MATERIALIZED (
    SELECT DISTINCT ON (candidates.domain_key)
      candidates.domain_key,
      candidates.resolved_vendor_id
    FROM domain_candidates candidates
    WHERE candidates.domain_key IS NOT NULL
      AND NOT public.rateware_is_generic_email_domain(candidates.domain_key)
    ORDER BY candidates.domain_key, candidates.priority DESC, candidates.resolved_vendor_id
  ),
  matched AS MATERIALIZED (
    SELECT
      facts.vendor_id resolved_vendor_id,
      facts.status,
      facts.is_crossborder,
      facts.is_d2d,
      facts.is_mexico,
      facts.all_in_amount,
      facts.cost_per_mile,
      facts.cost_per_km,
      facts.origin_market_label,
      facts.destination_market_label,
      facts.route_label,
      facts.equipment_label,
      facts.trailer_label,
      facts.border_pair_label,
      facts.quote_date
    FROM public.rateware_bi_rate_facts facts
    JOIN vendor_scope scope ON scope.id = facts.vendor_id
    WHERE facts.owner_email = scoped_owner
      AND facts.status IN ('pending_review', 'approved')
      AND facts.vendor_id IS NOT NULL
      AND (
        filters = '{}'::jsonb
        OR (
          (NOT (filters ? 'search') OR public.rateware_bi_value_filter_match(filters, 'search', facts.search_text))
          AND (NOT coalesce((filters ->> 'crossborder')::boolean, false) OR facts.is_crossborder)
          AND (NOT coalesce((filters ->> 'd2d')::boolean, false) OR facts.is_d2d)
          AND (
            filters - array['search', 'crossborder', 'd2d']::text[] = '{}'::jsonb
            OR NOT EXISTS (
              SELECT 1
              FROM jsonb_object_keys(filters - array['search', 'crossborder', 'd2d']::text[]) AS active(key)
              WHERE facts.dimensions ? active.key
                AND NOT public.rateware_bi_value_filter_match(filters, active.key, facts.dimensions ->> active.key)
            )
          )
        )
      )

    UNION ALL

    SELECT
      vendor_domains.resolved_vendor_id,
      facts.status,
      facts.is_crossborder,
      facts.is_d2d,
      facts.is_mexico,
      facts.all_in_amount,
      facts.cost_per_mile,
      facts.cost_per_km,
      facts.origin_market_label,
      facts.destination_market_label,
      facts.route_label,
      facts.equipment_label,
      facts.trailer_label,
      facts.border_pair_label,
      facts.quote_date
    FROM public.rateware_bi_rate_facts facts
    JOIN vendor_domains ON vendor_domains.domain_key = facts.vendor_domain_key
    JOIN vendor_scope scope ON scope.id = vendor_domains.resolved_vendor_id
    WHERE facts.owner_email = scoped_owner
      AND facts.status IN ('pending_review', 'approved')
      AND facts.vendor_id IS NULL
      AND (
        filters = '{}'::jsonb
        OR (
          (NOT (filters ? 'search') OR public.rateware_bi_value_filter_match(filters, 'search', facts.search_text))
          AND (NOT coalesce((filters ->> 'crossborder')::boolean, false) OR facts.is_crossborder)
          AND (NOT coalesce((filters ->> 'd2d')::boolean, false) OR facts.is_d2d)
          AND (
            filters - array['search', 'crossborder', 'd2d']::text[] = '{}'::jsonb
            OR NOT EXISTS (
              SELECT 1
              FROM jsonb_object_keys(filters - array['search', 'crossborder', 'd2d']::text[]) AS active(key)
              WHERE facts.dimensions ? active.key
                AND NOT public.rateware_bi_value_filter_match(filters, active.key, facts.dimensions ->> active.key)
            )
          )
        )
      )
  )
  SELECT
    matched.resolved_vendor_id,
    count(*)::bigint,
    count(*) FILTER (WHERE matched.status = 'approved')::bigint,
    count(*) FILTER (WHERE matched.status = 'pending_review')::bigint,
    count(*) FILTER (WHERE matched.is_crossborder)::bigint,
    count(*) FILTER (WHERE matched.is_d2d)::bigint,
    count(*) FILTER (WHERE matched.is_mexico)::bigint,
    round(avg(matched.all_in_amount)),
    round(avg(matched.cost_per_mile), 2),
    round(avg(matched.cost_per_km), 2),
    coalesce((
      array_remove(array_agg(DISTINCT nullif(matched.origin_market_label, '-')), null)
      || array_remove(array_agg(DISTINCT nullif(matched.destination_market_label, '-')), null)
    )[1:8], '{}'::text[]),
    coalesce((array_remove(array_agg(DISTINCT nullif(matched.route_label, '- -> -')), null))[1:6], '{}'::text[]),
    coalesce((
      array_remove(array_agg(DISTINCT nullif(matched.equipment_label, '-')), null)
      || array_remove(array_agg(DISTINCT nullif(matched.trailer_label, '-')), null)
    )[1:6], '{}'::text[]),
    coalesce((array_remove(array_agg(DISTINCT nullif(matched.border_pair_label, '- / -')), null))[1:6], '{}'::text[]),
    max(matched.quote_date)
  FROM matched
  GROUP BY matched.resolved_vendor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rateware_bi_vendor_metrics_for_owner_v2(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rateware_bi_vendor_metrics_for_owner_v2(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rateware_bi_vendor_metrics_for_owner_v2(text, jsonb) FROM authenticated;
