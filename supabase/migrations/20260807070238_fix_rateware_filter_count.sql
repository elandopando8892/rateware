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
  filter_count integer := 0;
  needle text;
BEGIN
  SELECT count(*)::integer
  INTO filter_count
  FROM jsonb_object_keys(coalesce(p_column_filters, '{}'::jsonb));

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
