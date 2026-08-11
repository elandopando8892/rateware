CREATE OR REPLACE FUNCTION public.rateware_column_filters_match(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  filters jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_object_keys(coalesce(filters, '{}'::jsonb)) AS active(key)
    WHERE NOT CASE active.key
      WHEN 'vendor' THEN public.rateware_values_filter_match(filters, 'vendor', ARRAY[vendor_row.vendor_name, rate_row.vendor_domain, vendor_row.domain])
      WHEN 'origin' THEN public.rateware_values_filter_match(filters, 'origin', ARRAY[rate_row.origin, rate_row.normalized_origin, rate_row.origin_city, rate_row.origin_state, rate_row.origin_zip_prefix, rate_row.origin_market, rate_row.origin_region, rate_row.origin_country])
      WHEN 'destination' THEN public.rateware_values_filter_match(filters, 'destination', ARRAY[rate_row.destination, rate_row.normalized_destination, rate_row.destination_city, rate_row.destination_state, rate_row.destination_zip_prefix, rate_row.destination_market, rate_row.destination_region, rate_row.destination_country])
      WHEN 'status' THEN public.rateware_values_filter_match(filters, 'status', ARRAY[rate_row.status])
      WHEN 'raw_upload_id' THEN public.rateware_values_filter_match(filters, 'raw_upload_id', ARRAY[rate_row.raw_upload_id::text])
      WHEN 'vendor_domain' THEN public.rateware_values_filter_match(filters, 'vendor_domain', ARRAY[rate_row.vendor_domain])
      WHEN 'rfx_id' THEN public.rateware_values_filter_match(filters, 'rfx_id', ARRAY[rate_row.rfx_id])
      WHEN 'row_id' THEN public.rateware_values_filter_match(filters, 'row_id', ARRAY[rate_row.row_id])
      WHEN 'origin_zip_prefix' THEN public.rateware_values_filter_match(filters, 'origin_zip_prefix', ARRAY[rate_row.origin_zip_prefix])
      WHEN 'origin_state' THEN public.rateware_values_filter_match(filters, 'origin_state', ARRAY[rate_row.origin_state])
      WHEN 'origin_market' THEN public.rateware_values_filter_match(filters, 'origin_market', ARRAY[rate_row.origin_market])
      WHEN 'origin_region' THEN public.rateware_values_filter_match(filters, 'origin_region', ARRAY[rate_row.origin_region])
      WHEN 'origin_country' THEN public.rateware_values_filter_match(filters, 'origin_country', ARRAY[rate_row.origin_country])
      WHEN 'destination_zip_prefix' THEN public.rateware_values_filter_match(filters, 'destination_zip_prefix', ARRAY[rate_row.destination_zip_prefix])
      WHEN 'destination_state' THEN public.rateware_values_filter_match(filters, 'destination_state', ARRAY[rate_row.destination_state])
      WHEN 'destination_market' THEN public.rateware_values_filter_match(filters, 'destination_market', ARRAY[rate_row.destination_market])
      WHEN 'destination_region' THEN public.rateware_values_filter_match(filters, 'destination_region', ARRAY[rate_row.destination_region])
      WHEN 'destination_country' THEN public.rateware_values_filter_match(filters, 'destination_country', ARRAY[rate_row.destination_country])
      WHEN 'equipment' THEN public.rateware_values_filter_match(filters, 'equipment', ARRAY[rate_row.equipment])
      WHEN 'trailer' THEN public.rateware_values_filter_match(filters, 'trailer', ARRAY[rate_row.trailer])
      WHEN 'hazmat' THEN public.rateware_values_filter_match(filters, 'hazmat', ARRAY[CASE WHEN rate_row.hazmat THEN 'Yes' ELSE 'No' END])
      WHEN 'temperature_controlled' THEN public.rateware_values_filter_match(filters, 'temperature_controlled', ARRAY[CASE WHEN rate_row.temperature_controlled THEN 'Yes' ELSE 'No' END])
      WHEN 'config' THEN public.rateware_values_filter_match(filters, 'config', ARRAY[rate_row.config])
      WHEN 'operation' THEN public.rateware_values_filter_match(filters, 'operation', ARRAY[rate_row.operation])
      WHEN 'service' THEN public.rateware_values_filter_match(filters, 'service', ARRAY[rate_row.service])
      WHEN 'mx_border_crossing_point' THEN public.rateware_values_filter_match(filters, 'mx_border_crossing_point', ARRAY[rate_row.mx_border_crossing_point])
      WHEN 'us_border_crossing_point' THEN public.rateware_values_filter_match(filters, 'us_border_crossing_point', ARRAY[rate_row.us_border_crossing_point])
      WHEN 'mx_linehaul' THEN public.rateware_values_filter_match(filters, 'mx_linehaul', ARRAY[rate_row.mx_linehaul])
      WHEN 'us_linehaul' THEN public.rateware_values_filter_match(filters, 'us_linehaul', ARRAY[rate_row.us_linehaul])
      WHEN 'fsc' THEN public.rateware_values_filter_match(filters, 'fsc', ARRAY[rate_row.fsc])
      WHEN 'border_crossing_fee' THEN public.rateware_values_filter_match(filters, 'border_crossing_fee', ARRAY[rate_row.border_crossing_fee])
      WHEN 'all_in_rate' THEN public.rateware_values_filter_match(filters, 'all_in_rate', ARRAY[rate_row.all_in_rate])
      WHEN 'currency' THEN public.rateware_values_filter_match(filters, 'currency', ARRAY[rate_row.currency])
      WHEN 'weekly_capacity' THEN public.rateware_values_filter_match(filters, 'weekly_capacity', ARRAY[rate_row.weekly_capacity])
      WHEN 'quote_date' THEN public.rateware_values_filter_match(filters, 'quote_date', ARRAY[rate_row.quote_date::text])
      ELSE true
    END
  );
$function$;

CREATE OR REPLACE FUNCTION public.rateware_rate_matches_filters(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  p_mode text DEFAULT 'staging'::text,
  p_status text DEFAULT NULL::text,
  p_raw_upload_id text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_operation text DEFAULT NULL::text,
  p_service text DEFAULT NULL::text,
  p_quick_filter text DEFAULT 'all'::text,
  p_review_filter text DEFAULT 'all'::text,
  p_column_filters jsonb DEFAULT '{}'::jsonb,
  p_exclude_archived boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT (
      CASE
        WHEN coalesce(p_mode, 'staging') = 'rateware' THEN rate_row.status = 'approved'
        WHEN nullif(p_status, '') IS NOT NULL THEN rate_row.status = p_status
        ELSE true
      END
    )
    AND (NOT coalesce(p_exclude_archived, false) OR rate_row.status <> 'archived')
    AND (nullif(p_raw_upload_id, '') IS NULL OR rate_row.raw_upload_id::text = p_raw_upload_id)
    AND (nullif(p_operation, '') IS NULL OR rate_row.operation = p_operation)
    AND (nullif(p_service, '') IS NULL OR rate_row.service = p_service)
    AND (
      nullif(p_search, '') IS NULL
      OR concat_ws(' ',
        vendor_row.vendor_name,
        vendor_row.domain,
        rate_row.vendor_domain,
        rate_row.rfx_id,
        rate_row.row_id,
        rate_row.origin,
        rate_row.destination,
        rate_row.normalized_origin,
        rate_row.normalized_destination,
        rate_row.origin_city,
        rate_row.destination_city,
        rate_row.origin_state,
        rate_row.destination_state,
        rate_row.origin_zip_prefix,
        rate_row.destination_zip_prefix,
        rate_row.origin_market,
        rate_row.destination_market,
        rate_row.origin_region,
        rate_row.destination_region,
        rate_row.origin_country,
        rate_row.destination_country,
        rate_row.equipment,
        rate_row.trailer,
        rate_row.config,
        rate_row.driver,
        rate_row.operation,
        rate_row.service,
        rate_row.currency,
        rate_row.weekly_capacity,
        rate_row.mx_border_crossing_point,
        rate_row.us_border_crossing_point
      ) ILIKE '%' || p_search || '%'
    )
    AND public.rateware_column_filters_match(rate_row, vendor_row, p_column_filters)
    AND (
      coalesce(p_mode, 'staging') <> 'rateware'
      OR CASE coalesce(nullif(p_quick_filter, ''), 'all')
        WHEN 'all' THEN true
        WHEN 'cross-border' THEN public.rateware_row_cross_border(rate_row)
        WHEN 'all-in' THEN public.rateware_has_numeric_rate(rate_row.all_in_rate) AND NOT public.rateware_row_has_split(rate_row)
        WHEN 'split-rate' THEN public.rateware_row_has_split(rate_row)
        WHEN 'with-capacity' THEN nullif(trim(coalesce(rate_row.weekly_capacity, '')), '') IS NOT NULL
        WHEN 'conflicts' THEN public.rateware_row_conflict(rate_row)
        ELSE true
      END
    )
    AND (
      coalesce(p_mode, 'staging') = 'rateware'
      OR CASE coalesce(nullif(p_review_filter, ''), 'all')
        WHEN 'all' THEN true
        WHEN 'needs-location' THEN public.rateware_row_location_gap(rate_row)
        WHEN 'needs-rate' THEN public.rateware_row_needs_rate(rate_row)
        WHEN 'needs-vendor' THEN rate_row.vendor_id IS NULL
        WHEN 'conflicts' THEN public.rateware_row_conflict(rate_row)
        WHEN 'source-audit' THEN public.rateware_row_source_audit(rate_row)
        WHEN 'ready' THEN public.rateware_row_ready(rate_row)
        WHEN 'all-in' THEN public.rateware_has_numeric_rate(rate_row.all_in_rate)
        WHEN 'split-rate' THEN public.rateware_row_has_split(rate_row)
        ELSE true
      END
    );
$function$;

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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SELECT filtered.id AS row_id, count(*) OVER() AS total_count
  FROM filtered
  ORDER BY
    CASE WHEN coalesce(p_mode, 'staging') = 'rateware' THEN filtered.quote_date END DESC NULLS LAST,
    filtered.created_at DESC,
    filtered.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50000), 1), 50000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    END), ''), '(blank)') AS value
    FROM public.rate_staging rs
    LEFT JOIN public.vendors v ON v.id = rs.vendor_id
    WHERE rs.owner_email = lower(btrim(p_owner_email))
      AND public.rateware_rate_matches_filters(
        rs, v, p_mode, p_status, p_raw_upload_id, p_search, p_operation,
        p_service, p_quick_filter, p_review_filter, p_column_filters, p_exclude_archived
      )
  )
  SELECT distinct_values.value, count(*) OVER() AS total_count
  FROM distinct_values
  WHERE nullif(p_value_search, '') IS NULL OR distinct_values.value ILIKE '%' || p_value_search || '%'
  ORDER BY distinct_values.value
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 5000);
$function$;
