CREATE INDEX IF NOT EXISTS rate_staging_owner_status_origin_value_idx
ON public.rate_staging (owner_email, status, (coalesce(normalized_origin, origin)));

CREATE INDEX IF NOT EXISTS rate_staging_owner_status_destination_value_idx
ON public.rate_staging (owner_email, status, (coalesce(normalized_destination, destination)));

CREATE INDEX IF NOT EXISTS rate_staging_origin_filter_trgm_idx
ON public.rate_staging USING gin (
  (lower(
    coalesce(origin,'') || ' ' || coalesce(normalized_origin,'') || ' ' ||
    coalesce(origin_city,'') || ' ' || coalesce(origin_state,'') || ' ' ||
    coalesce(origin_zip_prefix,'') || ' ' || coalesce(origin_market,'') || ' ' ||
    coalesce(origin_region,'') || ' ' || coalesce(origin_country,'')
  )) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS rate_staging_destination_filter_trgm_idx
ON public.rate_staging USING gin (
  (lower(
    coalesce(destination,'') || ' ' || coalesce(normalized_destination,'') || ' ' ||
    coalesce(destination_city,'') || ' ' || coalesce(destination_state,'') || ' ' ||
    coalesce(destination_zip_prefix,'') || ' ' || coalesce(destination_market,'') || ' ' ||
    coalesce(destination_region,'') || ' ' || coalesce(destination_country,'')
  )) gin_trgm_ops
);

CREATE OR REPLACE FUNCTION public.rateware_filtered_rate_ids(
  p_mode text DEFAULT 'staging'::text,
  p_status text DEFAULT NULL::text,
  p_raw_upload_id text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_operation text DEFAULT NULL::text,
  p_service text DEFAULT NULL::text,
  p_quick_filter text DEFAULT 'all'::text,
  p_review_filter text DEFAULT 'all'::text,
  p_column_filters jsonb DEFAULT '{}'::jsonb,
  p_exclude_archived boolean DEFAULT false,
  p_owner_email text DEFAULT NULL::text,
  p_limit integer DEFAULT 50000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(row_id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_fast boolean :=
    coalesce(p_mode, 'staging') = 'rateware'
    AND nullif(p_status, '') IS NULL
    AND nullif(p_raw_upload_id, '') IS NULL
    AND nullif(p_search, '') IS NULL
    AND nullif(p_operation, '') IS NULL
    AND nullif(p_service, '') IS NULL
    AND coalesce(nullif(p_quick_filter, ''), 'all') = 'all'
    AND coalesce(nullif(p_review_filter, ''), 'all') = 'all'
    AND NOT coalesce(p_exclude_archived, false);
  filter_count integer := jsonb_object_length(coalesce(p_column_filters, '{}'::jsonb));
  needle text;
BEGIN
  IF base_fast AND filter_count = 0 THEN
    RETURN QUERY
    SELECT rs.id, count(*) OVER()::bigint
    FROM public.rate_staging rs
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND rs.status = 'approved'
    ORDER BY rs.quote_date DESC NULLS LAST, rs.created_at DESC, rs.id DESC
    LIMIT least(greatest(coalesce(p_limit, 50000), 1), 50000)
    OFFSET greatest(coalesce(p_offset, 0), 0);
    RETURN;
  END IF;

  IF base_fast AND filter_count = 1
     AND p_column_filters ? 'origin'
     AND jsonb_typeof(p_column_filters -> 'origin') = 'string' THEN
    needle := lower(btrim(p_column_filters ->> 'origin'));
    RETURN QUERY
    SELECT rs.id, count(*) OVER()::bigint
    FROM public.rate_staging rs
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND rs.status = 'approved'
      AND lower(
        coalesce(rs.origin,'') || ' ' || coalesce(rs.normalized_origin,'') || ' ' ||
        coalesce(rs.origin_city,'') || ' ' || coalesce(rs.origin_state,'') || ' ' ||
        coalesce(rs.origin_zip_prefix,'') || ' ' || coalesce(rs.origin_market,'') || ' ' ||
        coalesce(rs.origin_region,'') || ' ' || coalesce(rs.origin_country,'')
      ) LIKE '%' || needle || '%'
    ORDER BY rs.quote_date DESC NULLS LAST, rs.created_at DESC, rs.id DESC
    LIMIT least(greatest(coalesce(p_limit, 50000), 1), 50000)
    OFFSET greatest(coalesce(p_offset, 0), 0);
    RETURN;
  END IF;

  IF base_fast AND filter_count = 1
     AND p_column_filters ? 'destination'
     AND jsonb_typeof(p_column_filters -> 'destination') = 'string' THEN
    needle := lower(btrim(p_column_filters ->> 'destination'));
    RETURN QUERY
    SELECT rs.id, count(*) OVER()::bigint
    FROM public.rate_staging rs
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND rs.status = 'approved'
      AND lower(
        coalesce(rs.destination,'') || ' ' || coalesce(rs.normalized_destination,'') || ' ' ||
        coalesce(rs.destination_city,'') || ' ' || coalesce(rs.destination_state,'') || ' ' ||
        coalesce(rs.destination_zip_prefix,'') || ' ' || coalesce(rs.destination_market,'') || ' ' ||
        coalesce(rs.destination_region,'') || ' ' || coalesce(rs.destination_country,'')
      ) LIKE '%' || needle || '%'
    ORDER BY rs.quote_date DESC NULLS LAST, rs.created_at DESC, rs.id DESC
    LIMIT least(greatest(coalesce(p_limit, 50000), 1), 50000)
    OFFSET greatest(coalesce(p_offset, 0), 0);
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT rs.*
    FROM public.rate_staging rs
    LEFT JOIN public.vendors v ON v.id = rs.vendor_id
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND public.rateware_rate_matches_filters(
        rs, v, p_mode, p_status, p_raw_upload_id, p_search, p_operation,
        p_service, p_quick_filter, p_review_filter, p_column_filters, p_exclude_archived
      )
  )
  SELECT filtered.id, count(*) OVER()::bigint
  FROM filtered
  ORDER BY
    CASE WHEN coalesce(p_mode, 'staging') = 'rateware' THEN filtered.quote_date END DESC NULLS LAST,
    filtered.created_at DESC,
    filtered.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50000), 1), 50000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rateware_filtered_rate_values(
  p_field text,
  p_mode text DEFAULT 'staging'::text,
  p_status text DEFAULT NULL::text,
  p_raw_upload_id text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_operation text DEFAULT NULL::text,
  p_service text DEFAULT NULL::text,
  p_quick_filter text DEFAULT 'all'::text,
  p_review_filter text DEFAULT 'all'::text,
  p_column_filters jsonb DEFAULT '{}'::jsonb,
  p_exclude_archived boolean DEFAULT false,
  p_owner_email text DEFAULT NULL::text,
  p_value_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(value text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_fast_rateware boolean :=
    coalesce(p_mode, 'staging') = 'rateware'
    AND nullif(p_status, '') IS NULL
    AND nullif(p_raw_upload_id, '') IS NULL
    AND nullif(p_search, '') IS NULL
    AND nullif(p_operation, '') IS NULL
    AND nullif(p_service, '') IS NULL
    AND coalesce(nullif(p_quick_filter, ''), 'all') = 'all'
    AND coalesce(nullif(p_review_filter, ''), 'all') = 'all'
    AND coalesce(p_column_filters, '{}'::jsonb) = '{}'::jsonb
    AND NOT coalesce(p_exclude_archived, false);
BEGIN
  IF is_fast_rateware AND p_field = 'origin' THEN
    RETURN QUERY
    WITH distinct_values AS (
      SELECT DISTINCT coalesce(nullif(btrim(coalesce(rs.normalized_origin, rs.origin)), ''), '(blank)') AS v
      FROM public.rate_staging rs
      WHERE rs.owner_email = lower(btrim(p_owner_email))
        AND rs.status = 'approved'
        AND (
          nullif(p_value_search, '') IS NULL
          OR lower(coalesce(rs.normalized_origin, rs.origin, '')) LIKE '%' || lower(p_value_search) || '%'
        )
    )
    SELECT distinct_values.v, count(*) OVER()::bigint
    FROM distinct_values
    ORDER BY distinct_values.v
    LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
    RETURN;
  END IF;

  IF is_fast_rateware AND p_field = 'destination' THEN
    RETURN QUERY
    WITH distinct_values AS (
      SELECT DISTINCT coalesce(nullif(btrim(coalesce(rs.normalized_destination, rs.destination)), ''), '(blank)') AS v
      FROM public.rate_staging rs
      WHERE rs.owner_email = lower(btrim(p_owner_email))
        AND rs.status = 'approved'
        AND (
          nullif(p_value_search, '') IS NULL
          OR lower(coalesce(rs.normalized_destination, rs.destination, '')) LIKE '%' || lower(p_value_search) || '%'
        )
    )
    SELECT distinct_values.v, count(*) OVER()::bigint
    FROM distinct_values
    ORDER BY distinct_values.v
    LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
    RETURN;
  END IF;

  IF is_fast_rateware AND p_field = 'vendor' THEN
    RETURN QUERY
    WITH distinct_values AS (
      SELECT DISTINCT coalesce(nullif(trim(coalesce(v.vendor_name, rs.vendor_domain, v.domain)), ''), '(blank)') AS v
      FROM public.rate_staging rs
      LEFT JOIN public.vendors v ON v.id = rs.vendor_id
      WHERE rs.owner_email = lower(btrim(p_owner_email))
        AND rs.status = 'approved'
    ), searched AS (
      SELECT v FROM distinct_values
      WHERE nullif(p_value_search, '') IS NULL OR v ILIKE '%' || p_value_search || '%'
    )
    SELECT searched.v, count(*) OVER()::bigint
    FROM searched
    ORDER BY searched.v
    LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
    RETURN;
  END IF;

  IF is_fast_rateware THEN
    RETURN QUERY
    WITH distinct_values AS (
      SELECT DISTINCT coalesce(nullif(trim(CASE p_field
        WHEN 'status' THEN rs.status
        WHEN 'raw_upload_id' THEN rs.raw_upload_id::text
        WHEN 'vendor_domain' THEN rs.vendor_domain
        WHEN 'rfx_id' THEN rs.rfx_id
        WHEN 'row_id' THEN rs.row_id
        WHEN 'origin_zip_prefix' THEN rs.origin_zip_prefix
        WHEN 'origin_state' THEN rs.origin_state
        WHEN 'origin_market' THEN rs.origin_market
        WHEN 'origin_region' THEN rs.origin_region
        WHEN 'origin_country' THEN rs.origin_country
        WHEN 'destination_zip_prefix' THEN rs.destination_zip_prefix
        WHEN 'destination_state' THEN rs.destination_state
        WHEN 'destination_market' THEN rs.destination_market
        WHEN 'destination_region' THEN rs.destination_region
        WHEN 'destination_country' THEN rs.destination_country
        WHEN 'equipment' THEN rs.equipment
        WHEN 'trailer' THEN rs.trailer
        WHEN 'hazmat' THEN CASE WHEN rs.hazmat THEN 'Yes' ELSE 'No' END
        WHEN 'temperature_controlled' THEN CASE WHEN rs.temperature_controlled THEN 'Yes' ELSE 'No' END
        WHEN 'config' THEN rs.config
        WHEN 'operation' THEN rs.operation
        WHEN 'service' THEN rs.service
        WHEN 'mx_border_crossing_point' THEN rs.mx_border_crossing_point
        WHEN 'us_border_crossing_point' THEN rs.us_border_crossing_point
        WHEN 'mx_linehaul' THEN rs.mx_linehaul
        WHEN 'us_linehaul' THEN rs.us_linehaul
        WHEN 'fsc' THEN rs.fsc
        WHEN 'border_crossing_fee' THEN rs.border_crossing_fee
        WHEN 'all_in_rate' THEN rs.all_in_rate
        WHEN 'currency' THEN rs.currency
        WHEN 'weekly_capacity' THEN rs.weekly_capacity
        WHEN 'quote_date' THEN rs.quote_date::text
        ELSE NULL
      END), ''), '(blank)') AS v
      FROM public.rate_staging rs
      WHERE rs.owner_email = lower(btrim(p_owner_email))
        AND rs.status = 'approved'
    ), searched AS (
      SELECT v FROM distinct_values
      WHERE nullif(p_value_search, '') IS NULL OR v ILIKE '%' || p_value_search || '%'
    )
    SELECT searched.v, count(*) OVER()::bigint
    FROM searched
    ORDER BY searched.v
    LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
    RETURN;
  END IF;

  RETURN QUERY
  WITH distinct_values AS (
    SELECT DISTINCT coalesce(nullif(trim(CASE p_field
      WHEN 'vendor' THEN coalesce(v.vendor_name, rs.vendor_domain, v.domain)
      WHEN 'origin' THEN coalesce(rs.normalized_origin, rs.origin)
      WHEN 'destination' THEN coalesce(rs.normalized_destination, rs.destination)
      WHEN 'status' THEN rs.status
      WHEN 'raw_upload_id' THEN rs.raw_upload_id::text
      WHEN 'vendor_domain' THEN rs.vendor_domain
      WHEN 'rfx_id' THEN rs.rfx_id
      WHEN 'row_id' THEN rs.row_id
      WHEN 'origin_zip_prefix' THEN rs.origin_zip_prefix
      WHEN 'origin_state' THEN rs.origin_state
      WHEN 'origin_market' THEN rs.origin_market
      WHEN 'origin_region' THEN rs.origin_region
      WHEN 'origin_country' THEN rs.origin_country
      WHEN 'destination_zip_prefix' THEN rs.destination_zip_prefix
      WHEN 'destination_state' THEN rs.destination_state
      WHEN 'destination_market' THEN rs.destination_market
      WHEN 'destination_region' THEN rs.destination_region
      WHEN 'destination_country' THEN rs.destination_country
      WHEN 'equipment' THEN rs.equipment
      WHEN 'trailer' THEN rs.trailer
      WHEN 'hazmat' THEN CASE WHEN rs.hazmat THEN 'Yes' ELSE 'No' END
      WHEN 'temperature_controlled' THEN CASE WHEN rs.temperature_controlled THEN 'Yes' ELSE 'No' END
      WHEN 'config' THEN rs.config
      WHEN 'operation' THEN rs.operation
      WHEN 'service' THEN rs.service
      WHEN 'mx_border_crossing_point' THEN rs.mx_border_crossing_point
      WHEN 'us_border_crossing_point' THEN rs.us_border_crossing_point
      WHEN 'mx_linehaul' THEN rs.mx_linehaul
      WHEN 'us_linehaul' THEN rs.us_linehaul
      WHEN 'fsc' THEN rs.fsc
      WHEN 'border_crossing_fee' THEN rs.border_crossing_fee
      WHEN 'all_in_rate' THEN rs.all_in_rate
      WHEN 'currency' THEN rs.currency
      WHEN 'weekly_capacity' THEN rs.weekly_capacity
      WHEN 'quote_date' THEN rs.quote_date::text
      ELSE NULL
    END), ''), '(blank)') AS v
    FROM public.rate_staging rs
    LEFT JOIN public.vendors v ON v.id = rs.vendor_id
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND public.rateware_rate_matches_filters(
        rs, v, p_mode, p_status, p_raw_upload_id, p_search, p_operation,
        p_service, p_quick_filter, p_review_filter, p_column_filters, p_exclude_archived
      )
  ), searched AS (
    SELECT v FROM distinct_values
    WHERE nullif(p_value_search, '') IS NULL OR v ILIKE '%' || p_value_search || '%'
  )
  SELECT searched.v, count(*) OVER()::bigint
  FROM searched
  ORDER BY searched.v
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
END;
$function$;
