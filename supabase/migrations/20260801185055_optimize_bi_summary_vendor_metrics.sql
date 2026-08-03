alter table public.rateware_bi_rate_facts
  add column if not exists vendor_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'vendor', ''), 'Unmatched carrier'), 256)
  ) stored,
  add column if not exists origin_market_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'origin_market', ''), '-'), 256)
  ) stored,
  add column if not exists destination_market_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'destination_market', ''), '-'), 256)
  ) stored,
  add column if not exists route_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'route', ''), '- -> -'), 512)
  ) stored,
  add column if not exists equipment_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'equipment', ''), '-'), 256)
  ) stored,
  add column if not exists trailer_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'trailer', ''), '-'), 256)
  ) stored,
  add column if not exists border_pair_label text generated always as (
    left(coalesce(nullif(dimensions ->> 'border_pair', ''), '- / -'), 256)
  ) stored,
  add column if not exists missing_origin boolean generated always as (
    coalesce(dimensions ->> 'origin_market', '-') = '-'
    and coalesce(dimensions ->> 'origin_state', '-') = '-'
    and coalesce(dimensions ->> 'origin_country', '-') = '-'
  ) stored,
  add column if not exists missing_destination boolean generated always as (
    coalesce(dimensions ->> 'destination_market', '-') = '-'
    and coalesce(dimensions ->> 'destination_state', '-') = '-'
    and coalesce(dimensions ->> 'destination_country', '-') = '-'
  ) stored;

create index if not exists rateware_bi_facts_summary_cover_idx
  on public.rateware_bi_rate_facts(owner_email, status)
  include (
    vendor_label, vendor_id, has_vendor_reference, is_crossborder, is_d2d,
    all_in_amount, calculated_miles, calculated_km, us_miles_amount,
    missing_origin, missing_destination
  )
  where status in ('pending_review', 'approved');

create index if not exists rateware_bi_facts_vendor_metrics_cover_idx
  on public.rateware_bi_rate_facts(owner_email, status, vendor_id, vendor_domain_key)
  include (
    is_crossborder, is_d2d, is_mexico, all_in_amount, cost_per_mile,
    cost_per_km, origin_market_label, destination_market_label, route_label,
    equipment_label, trailer_label, border_pair_label, quote_date
  )
  where status in ('pending_review', 'approved');

create or replace function public.rateware_bi_summary_for_owner(
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  payload jsonb;
begin
  if scoped_owner is null then
    return jsonb_build_object(
      'transactions', 0, 'carriers', 0, 'approved_rates', 0,
      'pending_rates', 0, 'crossborder_rates', 0,
      'd2d_import_export_rates', 0, 'missing_vendor', 0,
      'missing_rate', 0, 'missing_miles', 0, 'missing_origin', 0,
      'missing_destination', 0, 'avg_all_in_rate', null,
      'min_all_in_rate', null, 'max_all_in_rate', null
    );
  end if;

  if filters = '{}'::jsonb then
    select jsonb_build_object(
      'transactions', count(*),
      'carriers', count(distinct facts.vendor_label),
      'approved_rates', count(*) filter (where facts.status = 'approved'),
      'pending_rates', count(*) filter (where facts.status = 'pending_review'),
      'crossborder_rates', count(*) filter (where facts.is_crossborder),
      'd2d_import_export_rates', count(*) filter (where facts.is_d2d),
      'missing_vendor', count(*) filter (where facts.vendor_id is null and facts.has_vendor_reference),
      'missing_rate', count(*) filter (where facts.all_in_amount is null),
      'missing_miles', count(*) filter (
        where facts.all_in_amount is not null
          and facts.calculated_miles is null
          and facts.calculated_km is null
          and facts.us_miles_amount is null
      ),
      'missing_origin', count(*) filter (where facts.missing_origin),
      'missing_destination', count(*) filter (where facts.missing_destination),
      'avg_all_in_rate', round(avg(facts.all_in_amount), 2),
      'min_all_in_rate', round(min(facts.all_in_amount), 2),
      'max_all_in_rate', round(max(facts.all_in_amount), 2)
    ) into payload
    from public.rateware_bi_rate_facts facts
    where facts.owner_email = scoped_owner
      and facts.status in ('pending_review', 'approved');
    return payload;
  end if;

  select jsonb_build_object(
    'transactions', count(*),
    'carriers', count(distinct facts.vendor_label),
    'approved_rates', count(*) filter (where facts.status = 'approved'),
    'pending_rates', count(*) filter (where facts.status = 'pending_review'),
    'crossborder_rates', count(*) filter (where facts.is_crossborder),
    'd2d_import_export_rates', count(*) filter (where facts.is_d2d),
    'missing_vendor', count(*) filter (where facts.vendor_id is null and facts.has_vendor_reference),
    'missing_rate', count(*) filter (where facts.all_in_amount is null),
    'missing_miles', count(*) filter (
      where facts.all_in_amount is not null
        and facts.calculated_miles is null
        and facts.calculated_km is null
        and facts.us_miles_amount is null
    ),
    'missing_origin', count(*) filter (where facts.missing_origin),
    'missing_destination', count(*) filter (where facts.missing_destination),
    'avg_all_in_rate', round(avg(facts.all_in_amount), 2),
    'min_all_in_rate', round(min(facts.all_in_amount), 2),
    'max_all_in_rate', round(max(facts.all_in_amount), 2)
  ) into payload
  from public.rateware_bi_rate_facts facts
  where facts.owner_email = scoped_owner
    and facts.status in ('pending_review', 'approved')
    and public.rateware_bi_fact_matches_filters(facts, filters);
  return payload;
end;
$$;

create or replace function public.rateware_bi_vendor_metrics_for_owner(
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns table (
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if scoped_owner is null then
    return;
  end if;

  if filters = '{}'::jsonb then
    return query
    with vendor_scope as materialized (
      select
        vendors.id,
        public.rateware_domain_key(vendors.domain) domain_key,
        public.rateware_domain_key(vendors.primary_email) email_domain_key,
        coalesce(vendors.secondary_emails, '{}'::text[]) secondary_emails
      from public.vendors vendors
      where vendors.owner_email = scoped_owner
    ),
    domain_candidates as (
      select scope.id resolved_vendor_id, scope.domain_key, 100 priority from vendor_scope scope
      union all
      select scope.id, scope.email_domain_key, 90 from vendor_scope scope
      union all
      select scope.id, public.rateware_domain_key(secondary.email), 80
      from vendor_scope scope
      cross join lateral unnest(scope.secondary_emails) as secondary(email)
    ),
    vendor_domains as materialized (
      select distinct on (candidates.domain_key) candidates.domain_key, candidates.resolved_vendor_id
      from domain_candidates candidates
      where candidates.domain_key is not null
        and not public.rateware_is_generic_email_domain(candidates.domain_key)
      order by candidates.domain_key, candidates.priority desc, candidates.resolved_vendor_id
    ),
    matched as materialized (
      select
        coalesce(facts.vendor_id, vendor_domains.resolved_vendor_id) resolved_vendor_id,
        facts.status, facts.is_crossborder, facts.is_d2d, facts.is_mexico,
        facts.all_in_amount, facts.cost_per_mile, facts.cost_per_km,
        facts.origin_market_label, facts.destination_market_label,
        facts.route_label, facts.equipment_label, facts.trailer_label,
        facts.border_pair_label, facts.quote_date
      from public.rateware_bi_rate_facts facts
      left join vendor_domains
        on facts.vendor_id is null
       and vendor_domains.domain_key = facts.vendor_domain_key
      join vendor_scope scope
        on scope.id = coalesce(facts.vendor_id, vendor_domains.resolved_vendor_id)
      where facts.owner_email = scoped_owner
        and facts.status in ('pending_review', 'approved')
    )
    select
      matched.resolved_vendor_id,
      count(*)::bigint,
      count(*) filter (where matched.status = 'approved')::bigint,
      count(*) filter (where matched.status = 'pending_review')::bigint,
      count(*) filter (where matched.is_crossborder)::bigint,
      count(*) filter (where matched.is_d2d)::bigint,
      count(*) filter (where matched.is_mexico)::bigint,
      round(avg(matched.all_in_amount)),
      round(avg(matched.cost_per_mile), 2),
      round(avg(matched.cost_per_km), 2),
      coalesce((
        array_remove(array_agg(distinct nullif(matched.origin_market_label, '-')), null)
        || array_remove(array_agg(distinct nullif(matched.destination_market_label, '-')), null)
      )[1:8], '{}'::text[]),
      coalesce((array_remove(array_agg(distinct nullif(matched.route_label, '- -> -')), null))[1:6], '{}'::text[]),
      coalesce((
        array_remove(array_agg(distinct nullif(matched.equipment_label, '-')), null)
        || array_remove(array_agg(distinct nullif(matched.trailer_label, '-')), null)
      )[1:6], '{}'::text[]),
      coalesce((array_remove(array_agg(distinct nullif(matched.border_pair_label, '- / -')), null))[1:6], '{}'::text[]),
      max(matched.quote_date)
    from matched
    group by matched.resolved_vendor_id;
    return;
  end if;

  return query
  with vendor_scope as materialized (
    select
      vendors.id,
      public.rateware_domain_key(vendors.domain) domain_key,
      public.rateware_domain_key(vendors.primary_email) email_domain_key,
      coalesce(vendors.secondary_emails, '{}'::text[]) secondary_emails
    from public.vendors vendors
    where vendors.owner_email = scoped_owner
  ),
  domain_candidates as (
    select scope.id resolved_vendor_id, scope.domain_key, 100 priority from vendor_scope scope
    union all
    select scope.id, scope.email_domain_key, 90 from vendor_scope scope
    union all
    select scope.id, public.rateware_domain_key(secondary.email), 80
    from vendor_scope scope
    cross join lateral unnest(scope.secondary_emails) as secondary(email)
  ),
  vendor_domains as materialized (
    select distinct on (candidates.domain_key) candidates.domain_key, candidates.resolved_vendor_id
    from domain_candidates candidates
    where candidates.domain_key is not null
      and not public.rateware_is_generic_email_domain(candidates.domain_key)
    order by candidates.domain_key, candidates.priority desc, candidates.resolved_vendor_id
  ),
  matched as materialized (
    select
      coalesce(facts.vendor_id, vendor_domains.resolved_vendor_id) resolved_vendor_id,
      facts.status, facts.is_crossborder, facts.is_d2d, facts.is_mexico,
      facts.all_in_amount, facts.cost_per_mile, facts.cost_per_km,
      facts.origin_market_label, facts.destination_market_label,
      facts.route_label, facts.equipment_label, facts.trailer_label,
      facts.border_pair_label, facts.quote_date
    from public.rateware_bi_rate_facts facts
    left join vendor_domains
      on facts.vendor_id is null
     and vendor_domains.domain_key = facts.vendor_domain_key
    join vendor_scope scope
      on scope.id = coalesce(facts.vendor_id, vendor_domains.resolved_vendor_id)
    where facts.owner_email = scoped_owner
      and facts.status in ('pending_review', 'approved')
      and public.rateware_bi_fact_matches_filters(facts, filters)
  )
  select
    matched.resolved_vendor_id,
    count(*)::bigint,
    count(*) filter (where matched.status = 'approved')::bigint,
    count(*) filter (where matched.status = 'pending_review')::bigint,
    count(*) filter (where matched.is_crossborder)::bigint,
    count(*) filter (where matched.is_d2d)::bigint,
    count(*) filter (where matched.is_mexico)::bigint,
    round(avg(matched.all_in_amount)),
    round(avg(matched.cost_per_mile), 2),
    round(avg(matched.cost_per_km), 2),
    coalesce((
      array_remove(array_agg(distinct nullif(matched.origin_market_label, '-')), null)
      || array_remove(array_agg(distinct nullif(matched.destination_market_label, '-')), null)
    )[1:8], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.route_label, '- -> -')), null))[1:6], '{}'::text[]),
    coalesce((
      array_remove(array_agg(distinct nullif(matched.equipment_label, '-')), null)
      || array_remove(array_agg(distinct nullif(matched.trailer_label, '-')), null)
    )[1:6], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.border_pair_label, '- / -')), null))[1:6], '{}'::text[]),
    max(matched.quote_date)
  from matched
  group by matched.resolved_vendor_id;
end;
$$;

revoke all on function public.rateware_bi_summary_for_owner(text, jsonb) from public, anon, authenticated;
revoke all on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb) from public, anon, authenticated;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb) to service_role;
grant execute on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb) to service_role;

analyze public.rateware_bi_rate_facts;
