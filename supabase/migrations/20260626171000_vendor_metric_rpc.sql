create or replace function public.rateware_domain_key(value text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
begin
  cleaned := lower(btrim(coalesce(value, '')));
  if cleaned = '' then
    return null;
  end if;

  cleaned := regexp_replace(cleaned, '^mailto:', '', 'i');
  cleaned := regexp_replace(cleaned, '^[a-z][a-z0-9+.-]*://', '', 'i');
  cleaned := regexp_replace(cleaned, '^@+', '');

  if position('@' in cleaned) > 0 then
    cleaned := regexp_replace(cleaned, '^.*@', '');
  end if;

  cleaned := regexp_replace(cleaned, '^www\.', '');
  cleaned := regexp_replace(cleaned, '[/?#].*$', '');
  cleaned := regexp_replace(cleaned, '^[^a-z0-9]+', '');
  cleaned := regexp_replace(cleaned, '[^a-z0-9.-].*$', '');
  cleaned := regexp_replace(cleaned, '\.+$', '');

  if cleaned = '' or cleaned !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
    return null;
  end if;

  return cleaned;
end;
$$;

create or replace function public.rateware_is_generic_email_domain(domain text)
returns boolean
language sql
immutable
as $$
  select coalesce(public.rateware_domain_key(domain), '') = any(array[
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'yahoo.com',
    'yahoo.com.mx',
    'icloud.com',
    'me.com',
    'aol.com',
    'proton.me',
    'protonmail.com'
  ]);
$$;

create or replace function public.vendor_rate_metrics_for_owner(
  p_owner_email text,
  p_base_stage text default null
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
as $$
with vendor_scope as (
  select
    id,
    domain,
    primary_email,
    coalesce(secondary_emails, '{}'::text[]) as secondary_emails
  from public.vendors
  where owner_email = p_owner_email
    and (p_base_stage is null or base_stage = p_base_stage)
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
matched_rates as (
  select
    coalesce(linked.id, domain_match.vendor_id) as vendor_id,
    rate_staging.status,
    rate_staging.rfx_id,
    rate_staging.origin,
    rate_staging.destination,
    rate_staging.normalized_origin,
    rate_staging.normalized_destination,
    rate_staging.origin_country,
    rate_staging.destination_country,
    rate_staging.origin_state,
    rate_staging.destination_state,
    rate_staging.origin_market,
    rate_staging.destination_market,
    rate_staging.origin_region,
    rate_staging.destination_region,
    rate_staging.equipment,
    rate_staging.trailer,
    rate_staging.operation,
    rate_staging.service,
    rate_staging.mx_border_crossing_point,
    rate_staging.us_border_crossing_point,
    rate_staging.us_miles,
    rate_staging.all_in_rate,
    rate_staging.quote_date,
    rate_staging.calculated_miles,
    rate_staging.calculated_km,
    public.rateware_row_cross_border(rate_staging) as is_crossborder,
    public.rateware_clean_rate_number(rate_staging.all_in_rate) as all_in_amount,
    public.rateware_clean_rate_number(rate_staging.us_miles) as us_miles_amount
  from public.rate_staging
  left join vendor_scope linked
    on linked.id = rate_staging.vendor_id
  left join lateral (
    select vendor_domains.vendor_id
    from vendor_domains
    where linked.id is null
      and vendor_domains.domain_key = public.rateware_domain_key(rate_staging.vendor_domain)
    limit 1
  ) domain_match on true
  where rate_staging.status in ('pending_review', 'approved')
    and (linked.id is not null or domain_match.vendor_id is not null)
),
prepared as (
  select
    matched_rates.*,
    case
      when matched_rates.calculated_miles is not null and matched_rates.calculated_miles > 0 then matched_rates.calculated_miles
      when matched_rates.us_miles_amount is not null and matched_rates.us_miles_amount > 0 then matched_rates.us_miles_amount
      else null
    end as miles_amount,
    case
      when matched_rates.calculated_km is not null and matched_rates.calculated_km > 0 then matched_rates.calculated_km
      when matched_rates.calculated_miles is not null and matched_rates.calculated_miles > 0 then matched_rates.calculated_miles * 1.60934
      when matched_rates.us_miles_amount is not null and matched_rates.us_miles_amount > 0 then matched_rates.us_miles_amount * 1.60934
      else null
    end as km_amount,
    lower(concat_ws(' ', matched_rates.operation, matched_rates.service, matched_rates.origin, matched_rates.destination, matched_rates.normalized_origin, matched_rates.normalized_destination)) as searchable_rate_text
  from matched_rates
)
select
  prepared.vendor_id,
  count(*)::bigint as linked_rates,
  count(*) filter (where prepared.status = 'approved')::bigint as approved_rates,
  count(*) filter (where prepared.status = 'pending_review')::bigint as pending_rates,
  count(*) filter (where prepared.is_crossborder)::bigint as crossborder_rates,
  count(*) filter (
    where prepared.is_crossborder
      and (
        prepared.searchable_rate_text like '%d2d import%'
        or prepared.searchable_rate_text like '%d2d export%'
      )
  )::bigint as d2d_import_export_rates,
  count(*) filter (
    where upper(coalesce(prepared.origin_country, '')) = 'MX'
       or upper(coalesce(prepared.destination_country, '')) = 'MX'
       or prepared.searchable_rate_text similar to '%(mexico|monterrey|nuevo leon|apodaca|queretaro|bajio|laredo|lerma|toluca)%'
  )::bigint as mexico_rates,
  round(avg(prepared.all_in_amount)) as avg_all_in_rate,
  round(avg(prepared.all_in_amount / nullif(prepared.miles_amount, 0)) filter (where prepared.all_in_amount is not null and prepared.miles_amount > 0), 2) as avg_cost_per_mile,
  round(avg(prepared.all_in_amount / nullif(prepared.km_amount, 0)) filter (where prepared.all_in_amount is not null and prepared.km_amount > 0), 2) as avg_cost_per_km,
  (
    select coalesce(array_agg(value), '{}'::text[])
    from (
      select value
      from (
        select distinct nullif(btrim(origin_market), '') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
        union
        select distinct nullif(btrim(destination_market), '') as value
        from prepared market_rows
        where market_rows.vendor_id = prepared.vendor_id
      ) market_values
      where value is not null
      order by value
      limit 8
    ) limited
  ) as markets,
  (
    select coalesce(array_agg(value), '{}'::text[])
    from (
      select value
      from (
        select distinct nullif(
          btrim(
            concat_ws(
              ' -> ',
              coalesce(nullif(btrim(origin), ''), nullif(btrim(normalized_origin), '')),
              coalesce(nullif(btrim(destination), ''), nullif(btrim(normalized_destination), ''))
            )
          ),
          ''
        ) as value
        from prepared lane_rows
        where lane_rows.vendor_id = prepared.vendor_id
      ) lane_values
      where value is not null
      order by value
      limit 6
    ) limited
  ) as lanes,
  (
    select coalesce(array_agg(value), '{}'::text[])
    from (
      select value
      from (
        select distinct nullif(btrim(equipment), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
        union
        select distinct nullif(btrim(trailer), '') as value
        from prepared equipment_rows
        where equipment_rows.vendor_id = prepared.vendor_id
      ) equipment_values
      where value is not null
      order by value
      limit 6
    ) limited
  ) as equipment,
  (
    select coalesce(array_agg(value), '{}'::text[])
    from (
      select value
      from (
        select distinct nullif(
          btrim(
            concat_ws(
              ' / ',
              nullif(btrim(mx_border_crossing_point), ''),
              nullif(btrim(us_border_crossing_point), '')
            )
          ),
          ''
        ) as value
        from prepared border_rows
        where border_rows.vendor_id = prepared.vendor_id
      ) border_values
      where value is not null
      order by value
      limit 6
    ) limited
  ) as border_pairs,
  max(prepared.quote_date) as last_quote_date
from prepared
group by prepared.vendor_id;
$$;

create index if not exists rate_staging_vendor_status_idx
  on public.rate_staging (vendor_id, status);

create index if not exists rate_staging_vendor_domain_status_idx
  on public.rate_staging (vendor_domain, status);

create index if not exists vendors_owner_primary_email_idx
  on public.vendors (owner_email, primary_email);
