create index if not exists rate_staging_vendor_domain_key_status_idx
  on public.rate_staging (public.rateware_domain_key(vendor_domain), status)
  where vendor_domain is not null;

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
language sql
stable
security definer
set search_path = public
as $$
with vendor_scope as (
  select
    v as vendor_row,
    v.id,
    v.domain,
    v.primary_email,
    coalesce(v.secondary_emails, '{}'::text[]) as secondary_emails
  from public.vendors v
  where v.owner_email = p_owner_email
),
domain_candidates as (
  select id as vendor_id, public.rateware_domain_key(domain) as domain_key, 100 as priority
  from vendor_scope
  union all
  select id as vendor_id, public.rateware_domain_key(primary_email) as domain_key, 90 as priority
  from vendor_scope
  union all
  select vendor_scope.id as vendor_id, public.rateware_domain_key(secondary.email) as domain_key, 80 as priority
  from vendor_scope
  cross join lateral unnest(vendor_scope.secondary_emails) as secondary(email)
),
vendor_domains as (
  select distinct on (domain_key)
    domain_key,
    vendor_id
  from domain_candidates
  where domain_key is not null
    and not public.rateware_is_generic_email_domain(domain_key)
  order by domain_key, priority desc, vendor_id
),
linked_rates as (
  select
    linked.id as vendor_id,
    rs as rate_row,
    linked.vendor_row as vendor_row,
    public.rateware_bi_metric_value(rs, 'all_in_rate') as all_in_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_mile') as cost_per_mile_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_km') as cost_per_km_amount,
    lower(public.rateware_bi_row_text(rs, linked.vendor_row)) as searchable_rate_text
  from public.rate_staging rs
  join vendor_scope linked
    on linked.id = rs.vendor_id
  where rs.status in ('pending_review', 'approved')
    and public.rateware_bi_rate_matches_filters(rs, linked.vendor_row, p_owner_email, p_filters)
),
domain_rates as (
  select
    scoped_vendor.id as vendor_id,
    rs as rate_row,
    scoped_vendor.vendor_row as vendor_row,
    public.rateware_bi_metric_value(rs, 'all_in_rate') as all_in_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_mile') as cost_per_mile_amount,
    public.rateware_bi_metric_value(rs, 'cost_per_km') as cost_per_km_amount,
    lower(public.rateware_bi_row_text(rs, scoped_vendor.vendor_row)) as searchable_rate_text
  from vendor_domains
  join vendor_scope scoped_vendor
    on scoped_vendor.id = vendor_domains.vendor_id
  join public.rate_staging rs
    on public.rateware_domain_key(rs.vendor_domain) = vendor_domains.domain_key
  where rs.status in ('pending_review', 'approved')
    and not exists (
      select 1
      from vendor_scope linked
      where linked.id = rs.vendor_id
    )
    and public.rateware_bi_rate_matches_filters(rs, scoped_vendor.vendor_row, p_owner_email, p_filters)
),
matched_rates as (
  select * from linked_rates
  union all
  select * from domain_rates
),
prepared as (
  select
    matched_rates.*,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'origin_market') as o_market,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'destination_market') as d_market,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'route') as lane_value,
    public.rateware_bi_dimension_value(matched_rates.rate_row, matched_rates.vendor_row, 'border_pair') as border_pair_value
  from matched_rates
)
select
  prepared.vendor_id,
  count(*)::bigint as linked_rates,
  count(*) filter (where (prepared.rate_row).status = 'approved')::bigint as approved_rates,
  count(*) filter (where (prepared.rate_row).status = 'pending_review')::bigint as pending_rates,
  count(*) filter (where public.rateware_row_cross_border(prepared.rate_row))::bigint as crossborder_rates,
  count(*) filter (
    where public.rateware_row_cross_border(prepared.rate_row)
      and (prepared.searchable_rate_text like '%d2d import%' or prepared.searchable_rate_text like '%d2d export%')
  )::bigint as d2d_import_export_rates,
  count(*) filter (
    where upper(coalesce((prepared.rate_row).origin_country, '')) = 'MX'
       or upper(coalesce((prepared.rate_row).destination_country, '')) = 'MX'
       or prepared.searchable_rate_text similar to '%(mexico|monterrey|nuevo leon|apodaca|queretaro|bajio|laredo|lerma|toluca)%'
  )::bigint as mexico_rates,
  round(avg(prepared.all_in_amount)) as avg_all_in_rate,
  round(avg(prepared.cost_per_mile_amount), 2) as avg_cost_per_mile,
  round(avg(prepared.cost_per_km_amount), 2) as avg_cost_per_km,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct value
      from (
        select nullif(o_market, '-') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
        union
        select nullif(d_market, '-') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
      ) market_values
      where value is not null
      limit 8
    ) limited
  ) as markets,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct nullif(lane_value, '- -> -') as value
      from prepared lane_rows
      where lane_rows.vendor_id = prepared.vendor_id
        and nullif(lane_value, '- -> -') is not null
      limit 6
    ) limited
  ) as lanes,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct value
      from (
        select nullif(btrim((equipment_rows.rate_row).equipment), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
        union
        select nullif(btrim((equipment_rows.rate_row).trailer), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
      ) equipment_values
      where value is not null
      limit 6
    ) limited
  ) as equipment,
  (
    select coalesce(array_agg(value order by value), '{}'::text[])
    from (
      select distinct nullif(border_pair_value, '- / -') as value
      from prepared border_rows
      where border_rows.vendor_id = prepared.vendor_id
        and nullif(border_pair_value, '- / -') is not null
      limit 6
    ) limited
  ) as border_pairs,
  max((prepared.rate_row).quote_date) as last_quote_date
from prepared
group by prepared.vendor_id;
$$;
