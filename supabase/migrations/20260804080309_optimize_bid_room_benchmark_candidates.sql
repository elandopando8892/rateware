create or replace function public.rateware_rfx_text_match_score(
  p_left text,
  p_right text,
  p_weight integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  with normalized as (
    select
      public.rateware_vendor_search_key(p_left) left_key,
      public.rateware_vendor_search_key(p_right) right_key
  )
  select case
    when left_key = '' or right_key = '' then 0
    when left_key = right_key then p_weight
    when left_key like '%' || right_key || '%'
      or right_key like '%' || left_key || '%' then round(p_weight * 0.65)::integer
    else 0
  end
  from normalized;
$$;

create or replace function public.rateware_rfx_lane_rate_score(
  p_lane public.rfx_lanes,
  p_rate public.rate_staging
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select least(100,
    least(50,
      public.rateware_rfx_text_match_score(p_lane.origin_market, p_rate.origin_market, 30)
      + public.rateware_rfx_text_match_score(p_lane.origin_region, p_rate.origin_region, 14)
      + public.rateware_rfx_text_match_score(p_lane.origin_state, p_rate.origin_state, 14)
      + public.rateware_rfx_text_match_score(p_lane.origin_country, p_rate.origin_country, 10)
      + public.rateware_rfx_text_match_score(p_lane.origin, coalesce(p_rate.normalized_origin, p_rate.origin), 22)
      + public.rateware_rfx_text_match_score(p_lane.origin_city, coalesce(p_rate.origin_city, p_rate.normalized_origin, p_rate.origin), 18)
    )
    + least(50,
      public.rateware_rfx_text_match_score(p_lane.destination_market, p_rate.destination_market, 30)
      + public.rateware_rfx_text_match_score(p_lane.destination_region, p_rate.destination_region, 14)
      + public.rateware_rfx_text_match_score(p_lane.destination_state, p_rate.destination_state, 14)
      + public.rateware_rfx_text_match_score(p_lane.destination_country, p_rate.destination_country, 10)
      + public.rateware_rfx_text_match_score(p_lane.destination, coalesce(p_rate.normalized_destination, p_rate.destination), 22)
      + public.rateware_rfx_text_match_score(p_lane.destination_city, coalesce(p_rate.destination_city, p_rate.normalized_destination, p_rate.destination), 18)
    )
    + public.rateware_rfx_text_match_score(p_lane.equipment, coalesce(p_rate.equipment, p_rate.normalized_equipment), 12)
    + public.rateware_rfx_text_match_score(p_lane.trailer, coalesce(p_rate.trailer, p_rate.normalized_trailer), 10)
    + public.rateware_rfx_text_match_score(p_lane.config, coalesce(p_rate.config, p_rate.normalized_config), 8)
    + public.rateware_rfx_text_match_score(p_lane.operation, coalesce(p_rate.operation, p_rate.normalized_operation), 12)
    + public.rateware_rfx_text_match_score(p_lane.service, coalesce(p_rate.service, p_rate.normalized_service), 10)
  );
$$;

create or replace function public.rfx_benchmark_candidate_rate_ids(
  p_owner_email text,
  p_event_id uuid,
  p_per_lane integer default 1000
)
returns table (
  lane_id uuid,
  rate_id uuid,
  match_score integer,
  candidate_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with event_lanes as materialized (
    select lanes.*
    from public.rfx_lanes lanes
    join public.rfx_events events on events.id = lanes.rfx_event_id
    where lanes.rfx_event_id = p_event_id
      and events.owner_email = lower(nullif(btrim(p_owner_email), ''))
  ),
  scored as materialized (
    select
      lanes.id lane_id,
      rates.id rate_id,
      public.rateware_rfx_lane_rate_score(lanes, rates) match_score,
      public.rateware_clean_rate_number(rates.all_in_rate) amount,
      rates.quote_date,
      rates.created_at
    from event_lanes lanes
    cross join public.rate_staging rates
    where rates.owner_email = lower(nullif(btrim(p_owner_email), ''))
      and rates.status = 'approved'
  ),
  matches as materialized (
    select *
    from scored
    where scored.match_score >= 40
      and scored.amount is not null
  ),
  ranked as (
    select
      matches.*,
      count(*) over (partition by matches.lane_id) candidate_count,
      row_number() over (
        partition by matches.lane_id
        order by matches.match_score desc, matches.amount asc,
          matches.quote_date desc nulls last, matches.created_at desc, matches.rate_id
      ) candidate_rank
    from matches
  )
  select ranked.lane_id, ranked.rate_id, ranked.match_score, ranked.candidate_count
  from ranked
  where ranked.candidate_rank <= least(greatest(coalesce(p_per_lane, 1000), 1), 2000)
  order by ranked.lane_id, ranked.candidate_rank;
$$;

revoke all on function public.rateware_rfx_text_match_score(text, text, integer) from public, anon, authenticated;
revoke all on function public.rateware_rfx_lane_rate_score(public.rfx_lanes, public.rate_staging) from public, anon, authenticated;
revoke all on function public.rfx_benchmark_candidate_rate_ids(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.rfx_benchmark_candidate_rate_ids(text, uuid, integer) to service_role;
