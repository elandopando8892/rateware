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
    select
      lanes.id,
      lower(btrim(coalesce(lanes.origin_market, ''))) origin_market,
      lower(btrim(coalesce(lanes.origin_state, ''))) origin_state,
      lower(btrim(coalesce(lanes.origin, ''))) origin,
      lower(btrim(coalesce(lanes.destination_market, ''))) destination_market,
      lower(btrim(coalesce(lanes.destination_state, ''))) destination_state,
      lower(btrim(coalesce(lanes.destination, ''))) destination,
      lower(btrim(coalesce(lanes.equipment, ''))) equipment,
      lower(btrim(coalesce(lanes.trailer, ''))) trailer,
      lower(btrim(coalesce(lanes.operation, ''))) operation,
      lower(btrim(coalesce(lanes.service, ''))) service
    from public.rfx_lanes lanes
    join public.rfx_events events on events.id = lanes.rfx_event_id
    where lanes.rfx_event_id = p_event_id
      and events.owner_email = lower(nullif(btrim(p_owner_email), ''))
  ),
  fact_scope as materialized (
    select
      facts.rate_id,
      facts.quote_date,
      facts.created_at,
      lower(btrim(coalesce(facts.origin_market_label, ''))) origin_market,
      lower(btrim(coalesce(facts.dimensions ->> 'origin_state', ''))) origin_state,
      lower(btrim(coalesce(facts.dimensions ->> 'origin', ''))) origin,
      lower(btrim(coalesce(facts.destination_market_label, ''))) destination_market,
      lower(btrim(coalesce(facts.dimensions ->> 'destination_state', ''))) destination_state,
      lower(btrim(coalesce(facts.dimensions ->> 'destination', ''))) destination,
      lower(btrim(coalesce(facts.equipment_label, ''))) equipment,
      lower(btrim(coalesce(facts.trailer_label, ''))) trailer,
      lower(btrim(coalesce(facts.dimensions ->> 'operation', ''))) operation,
      lower(btrim(coalesce(facts.dimensions ->> 'service', ''))) service
    from public.rateware_bi_rate_facts facts
    where facts.owner_email = lower(nullif(btrim(p_owner_email), ''))
      and facts.status = 'approved'
      and facts.all_in_amount is not null
  ),
  matches as materialized (
    select
      lanes.id lane_id,
      facts.rate_id,
      (
        case when lanes.origin_market <> '' and facts.origin_market <> ''
          and (lanes.origin_market = facts.origin_market or lanes.origin_market like '%' || facts.origin_market || '%' or facts.origin_market like '%' || lanes.origin_market || '%') then 30 else 0 end
        + case when lanes.origin_state <> '' and lanes.origin_state = facts.origin_state then 14 else 0 end
        + case when lanes.origin <> '' and facts.origin <> ''
          and (lanes.origin = facts.origin or lanes.origin like '%' || facts.origin || '%' or facts.origin like '%' || lanes.origin || '%') then 22 else 0 end
        + case when lanes.destination_market <> '' and facts.destination_market <> ''
          and (lanes.destination_market = facts.destination_market or lanes.destination_market like '%' || facts.destination_market || '%' or facts.destination_market like '%' || lanes.destination_market || '%') then 30 else 0 end
        + case when lanes.destination_state <> '' and lanes.destination_state = facts.destination_state then 14 else 0 end
        + case when lanes.destination <> '' and facts.destination <> ''
          and (lanes.destination = facts.destination or lanes.destination like '%' || facts.destination || '%' or facts.destination like '%' || lanes.destination || '%') then 22 else 0 end
        + case when lanes.equipment <> '' and lanes.equipment = facts.equipment then 12 else 0 end
        + case when lanes.trailer <> '' and lanes.trailer = facts.trailer then 10 else 0 end
        + case when lanes.operation <> '' and lanes.operation = facts.operation then 12 else 0 end
        + case when lanes.service <> '' and lanes.service = facts.service then 10 else 0 end
      )::integer match_score,
      facts.quote_date,
      facts.created_at
    from event_lanes lanes
    cross join fact_scope facts
    where (
      (lanes.origin_market <> '' and facts.origin_market <> ''
        and (lanes.origin_market = facts.origin_market or lanes.origin_market like '%' || facts.origin_market || '%' or facts.origin_market like '%' || lanes.origin_market || '%'))
      or (lanes.origin_state <> '' and lanes.origin_state = facts.origin_state)
      or (lanes.origin <> '' and facts.origin <> ''
        and (lanes.origin = facts.origin or lanes.origin like '%' || facts.origin || '%' or facts.origin like '%' || lanes.origin || '%'))
    )
    and (
      (lanes.destination_market <> '' and facts.destination_market <> ''
        and (lanes.destination_market = facts.destination_market or lanes.destination_market like '%' || facts.destination_market || '%' or facts.destination_market like '%' || lanes.destination_market || '%'))
      or (lanes.destination_state <> '' and lanes.destination_state = facts.destination_state)
      or (lanes.destination <> '' and facts.destination <> ''
        and (lanes.destination = facts.destination or lanes.destination like '%' || facts.destination || '%' or facts.destination like '%' || lanes.destination || '%'))
    )
  ),
  ranked as (
    select
      matches.*,
      count(*) over (partition by matches.lane_id) candidate_count,
      row_number() over (
        partition by matches.lane_id
        order by matches.match_score desc, matches.quote_date desc nulls last,
          matches.created_at desc, matches.rate_id
      ) candidate_rank
    from matches
  )
  select ranked.lane_id, ranked.rate_id, ranked.match_score, ranked.candidate_count
  from ranked
  where ranked.candidate_rank <= least(greatest(coalesce(p_per_lane, 1000), 1), 2000)
  order by ranked.lane_id, ranked.candidate_rank;
$$;

drop function if exists public.rateware_rfx_lane_rate_score(public.rfx_lanes, public.rate_staging);
drop function if exists public.rateware_rfx_text_match_score(text, text, integer);

revoke all on function public.rfx_benchmark_candidate_rate_ids(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.rfx_benchmark_candidate_rate_ids(text, uuid, integer) to service_role;
