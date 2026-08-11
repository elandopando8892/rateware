CREATE INDEX IF NOT EXISTS rateware_bi_geo_origin_market_cover_idx
ON public.rateware_bi_rate_facts (owner_email, status, origin_market_label)
INCLUDE (vendor_label, all_in_amount, cost_per_mile, cost_per_km, currency)
WHERE status IN ('pending_review','approved');

CREATE INDEX IF NOT EXISTS rateware_bi_geo_destination_market_cover_idx
ON public.rateware_bi_rate_facts (owner_email, status, destination_market_label)
INCLUDE (vendor_label, all_in_amount, cost_per_mile, cost_per_km, currency)
WHERE status IN ('pending_review','approved');

CREATE OR REPLACE FUNCTION public.rateware_bi_geo_density_market_fast(
  p_owner_email text,
  p_scope text DEFAULT 'both',
  p_metric text DEFAULT 'transactions',
  p_limit integer DEFAULT 250
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
WITH params AS (
  SELECT
    lower(nullif(btrim(p_owner_email), '')) AS owner_email,
    CASE WHEN lower(coalesce(p_scope,'both')) IN ('origin','destination','both') THEN lower(coalesce(p_scope,'both')) ELSE 'both' END AS scope_value,
    lower(coalesce(nullif(p_metric,''),'transactions')) AS metric_value,
    least(greatest(coalesce(p_limit,250),10),500) AS point_limit
),
summary AS MATERIALIZED (
  SELECT count(*)::bigint AS transactions,
         count(DISTINCT f.vendor_label)::bigint AS carriers
  FROM public.rateware_bi_rate_facts f, params p
  WHERE f.owner_email=p.owner_email
    AND f.status IN ('pending_review','approved')
),
grouped AS MATERIALIZED (
  SELECT
    'origin'::text AS side,
    'origin'::text AS flow,
    'market'::text AS level,
    coalesce(nullif(btrim(f.origin_market_label),''),'-') AS label,
    count(*)::bigint AS transactions,
    count(DISTINCT f.vendor_label)::bigint AS carriers,
    round(avg(f.all_in_amount),2) AS avg_all_in,
    round(avg(f.cost_per_mile),2) AS avg_cost_per_mile,
    round(avg(f.cost_per_km),2) AS avg_cost_per_km,
    coalesce(nullif(btrim(max(f.currency)),''),'USD') AS currency
  FROM public.rateware_bi_rate_facts f, params p
  WHERE f.owner_email=p.owner_email
    AND f.status IN ('pending_review','approved')
    AND p.scope_value IN ('origin','both')
  GROUP BY coalesce(nullif(btrim(f.origin_market_label),''),'-')

  UNION ALL

  SELECT
    'destination'::text,
    'destination'::text,
    'market'::text,
    coalesce(nullif(btrim(f.destination_market_label),''),'-'),
    count(*)::bigint,
    count(DISTINCT f.vendor_label)::bigint,
    round(avg(f.all_in_amount),2),
    round(avg(f.cost_per_mile),2),
    round(avg(f.cost_per_km),2),
    coalesce(nullif(btrim(max(f.currency)),''),'USD')
  FROM public.rateware_bi_rate_facts f, params p
  WHERE f.owner_email=p.owner_email
    AND f.status IN ('pending_review','approved')
    AND p.scope_value IN ('destination','both')
  GROUP BY coalesce(nullif(btrim(f.destination_market_label),''),'-')
),
ranked AS MATERIALIZED (
  SELECT g.*,
    CASE (SELECT metric_value FROM params)
      WHEN 'carriers' THEN g.carriers::numeric
      WHEN 'avg_all_in' THEN coalesce(g.avg_all_in,0)
      WHEN 'avg_cost_per_mile' THEN coalesce(g.avg_cost_per_mile,0)
      WHEN 'avg_cost_per_km' THEN coalesce(g.avg_cost_per_km,0)
      ELSE g.transactions::numeric
    END AS metric_sort_value
  FROM grouped g
  ORDER BY metric_sort_value DESC, transactions DESC, label
  LIMIT (SELECT point_limit FROM params)
),
enriched AS MATERIALIZED (
  SELECT
    r.side, r.flow, r.level, r.label,
    coalesce(nullif(btrim(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin_city' ELSE 'destination_city' END),''),
             split_part(coalesce(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin' ELSE 'destination' END,''),',',1)) AS city,
    nullif(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin_state' ELSE 'destination_state' END,'-') AS state,
    nullif(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin_country' ELSE 'destination_country' END,'-') AS country,
    r.label AS market,
    nullif(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin_region' ELSE 'destination_region' END,'-') AS region,
    nullif(rep.dimensions ->> CASE WHEN r.side='origin' THEN 'origin_zip' ELSE 'destination_zip' END,'-') AS zip,
    r.transactions, r.carriers, r.avg_all_in, r.avg_cost_per_mile, r.avg_cost_per_km, r.currency, r.metric_sort_value
  FROM ranked r
  LEFT JOIN LATERAL (
    SELECT f.dimensions
    FROM public.rateware_bi_rate_facts f, params p
    WHERE f.owner_email=p.owner_email
      AND f.status IN ('pending_review','approved')
      AND (
        (r.side='origin' AND coalesce(nullif(btrim(f.origin_market_label),''),'-')=r.label)
        OR
        (r.side='destination' AND coalesce(nullif(btrim(f.destination_market_label),''),'-')=r.label)
      )
    LIMIT 1
  ) rep ON true
)
SELECT jsonb_build_object(
  'points', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.metric_sort_value DESC,e.transactions DESC,e.label) FROM enriched e),'[]'::jsonb),
  'level','market',
  'scope',(SELECT scope_value FROM params),
  'metric',(SELECT metric_value FROM params),
  'filters','{}'::jsonb,
  'summary',jsonb_build_object(
    'transactions',coalesce((SELECT transactions FROM summary),0),
    'carriers',coalesce((SELECT carriers FROM summary),0),
    'zones',(SELECT count(*) FROM grouped),
    'missing_geo',0,
    'plotted',(SELECT count(*) FROM ranked)
  )
);
$function$;

CREATE OR REPLACE FUNCTION public.rateware_bi_geo_density_for_owner(p_owner_email text, p_scope text DEFAULT 'both'::text, p_level text DEFAULT 'market'::text, p_metric text DEFAULT 'transactions'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  if level_value = 'market' and filters = '{}'::jsonb then
    return public.rateware_bi_geo_density_market_fast(scoped_owner, scope_value, metric_value, point_limit);
  end if;

  return (
    with filtered as materialized (
      select
        facts.rate_id,
        nullif(facts.dimensions ->> 'vendor', '-') carrier_label,
        coalesce(nullif(facts.dimensions ->> 'origin', '-'), '-') origin_location,
        split_part(coalesce(facts.dimensions ->> 'origin', ''), ',', 1) origin_city,
        nullif(facts.dimensions ->> 'origin_state', '-') origin_state,
        nullif(facts.dimensions ->> 'origin_country', '-') origin_country,
        nullif(facts.dimensions ->> 'origin_market', '-') origin_market,
        nullif(facts.dimensions ->> 'origin_region', '-') origin_region,
        nullif(facts.dimensions ->> 'origin_zip', '-') origin_zip,
        coalesce(nullif(facts.dimensions ->> 'destination', '-'), '-') destination_location,
        split_part(coalesce(facts.dimensions ->> 'destination', ''), ',', 1) destination_city,
        nullif(facts.dimensions ->> 'destination_state', '-') destination_state,
        nullif(facts.dimensions ->> 'destination_country', '-') destination_country,
        nullif(facts.dimensions ->> 'destination_market', '-') destination_market,
        nullif(facts.dimensions ->> 'destination_region', '-') destination_region,
        nullif(facts.dimensions ->> 'destination_zip', '-') destination_zip,
        facts.all_in_amount,
        facts.cost_per_mile,
        facts.cost_per_km,
        facts.currency
      from public.rateware_bi_rate_facts facts
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
        and (
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
            from jsonb_object_keys(filters - array['search', 'crossborder', 'd2d']::text[]) as active(key)
            where facts.dimensions ? active.key
              and not public.rateware_bi_value_filter_match(filters, active.key, facts.dimensions ->> active.key)
          )
        )
    ),
    filtered_summary as materialized (
      select count(*) transactions, count(distinct carrier_label) carriers
      from filtered
    ),
    side_points as (
      select filtered.rate_id,'origin'::text side,'origin'::text flow,filtered.origin_location raw_location,filtered.origin_city city,filtered.origin_state state,filtered.origin_country country,filtered.origin_market market,filtered.origin_region region,filtered.origin_zip zip,filtered.carrier_label,filtered.all_in_amount,filtered.cost_per_mile,filtered.cost_per_km,filtered.currency
      from filtered where scope_value in ('origin','both')
      union all
      select filtered.rate_id,'destination','destination',filtered.destination_location,filtered.destination_city,filtered.destination_state,filtered.destination_country,filtered.destination_market,filtered.destination_region,filtered.destination_zip,filtered.carrier_label,filtered.all_in_amount,filtered.cost_per_mile,filtered.cost_per_km,filtered.currency
      from filtered where scope_value in ('destination','both')
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
    grouped as materialized (
      select side,flow,level_value level,label,coalesce(nullif(btrim(max(city)), ''), split_part(max(raw_location), ',', 1)) city,max(state) state,max(country) country,max(market) market,max(region) region,max(zip) zip,count(*) transactions,count(distinct carrier_label) carriers,round(avg(all_in_amount), 2) avg_all_in,round(avg(cost_per_mile), 2) avg_cost_per_mile,round(avg(cost_per_km), 2) avg_cost_per_km,coalesce(nullif(btrim(max(currency)), ''), 'USD') currency
      from labeled group by side,flow,level_value,label
    ),
    ranked as materialized (
      select *, case metric_value when 'carriers' then carriers::numeric when 'avg_all_in' then coalesce(avg_all_in, 0) when 'avg_cost_per_mile' then coalesce(avg_cost_per_mile, 0) when 'avg_cost_per_km' then coalesce(avg_cost_per_km, 0) else transactions::numeric end metric_sort_value
      from grouped order by metric_sort_value desc,transactions desc,label limit point_limit
    )
    select jsonb_build_object(
      'points',coalesce((select jsonb_agg(to_jsonb(ranked) order by ranked.metric_sort_value desc,ranked.transactions desc,ranked.label) from ranked),'[]'::jsonb),
      'level',level_value,'scope',scope_value,'metric',metric_value,'filters',filters,
      'summary',jsonb_build_object('transactions',coalesce((select transactions from filtered_summary),0),'carriers',coalesce((select carriers from filtered_summary),0),'zones',(select count(*) from grouped),'missing_geo',0,'plotted',(select count(*) from ranked))
    )
  );
end;
$function$;
