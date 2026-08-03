create table if not exists public.rateware_bi_rate_facts (
  rate_id uuid primary key references public.rate_staging(id) on delete cascade,
  owner_email text not null,
  organization_id text,
  vendor_id uuid,
  vendor_domain_key text,
  status text not null,
  quote_date date,
  rfx_id text,
  currency text,
  dimensions jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  is_crossborder boolean not null default false,
  is_d2d boolean not null default false,
  is_mexico boolean not null default false,
  all_in_amount numeric,
  cost_per_mile numeric,
  cost_per_km numeric,
  calculated_miles numeric,
  calculated_km numeric,
  us_miles_amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rateware_bi_rate_facts enable row level security;
revoke all on table public.rateware_bi_rate_facts from public, anon, authenticated;
grant select, insert, update, delete on table public.rateware_bi_rate_facts to service_role;

create or replace function public.rateware_bi_fact_dimensions(
  rate_row public.rate_staging,
  vendor_row public.vendors
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dimension_values as (
    select
      coalesce(nullif(btrim(rate_row.normalized_origin), ''), nullif(btrim(rate_row.origin), ''), '-') as origin_value,
      coalesce(nullif(btrim(rate_row.normalized_destination), ''), nullif(btrim(rate_row.destination), ''), '-') as destination_value,
      coalesce(nullif(btrim(rate_row.origin_market), ''), '-') as origin_market_value,
      coalesce(nullif(btrim(rate_row.destination_market), ''), '-') as destination_market_value,
      coalesce(nullif(btrim(rate_row.mx_border_crossing_point), ''), '-') as mx_crossing_value,
      coalesce(nullif(btrim(rate_row.us_border_crossing_point), ''), '-') as us_crossing_value,
      coalesce(nullif(btrim(rate_row.vendor_domain), ''), nullif(btrim(vendor_row.domain), '')) as raw_vendor_domain
  ),
  labels as (
    select
      dimension_values.*,
      case
        when dimension_values.raw_vendor_domain is not null
          and not public.rateware_is_generic_email_domain(dimension_values.raw_vendor_domain)
          then dimension_values.raw_vendor_domain
        else null
      end as safe_vendor_domain
    from dimension_values
  )
  select jsonb_build_object(
    'vendor', coalesce(nullif(btrim(vendor_row.vendor_name), ''), safe_vendor_domain, 'Unmatched carrier'),
    'vendor_domain', coalesce(safe_vendor_domain, '-'),
    'vendor_stage', coalesce(nullif(btrim(vendor_row.base_stage), ''), '-'),
    'vendor_status', coalesce(nullif(btrim(vendor_row.status), ''), '-'),
    'route', concat_ws(' -> ', origin_value, destination_value),
    'corridor', concat_ws(' -> ', origin_market_value, destination_market_value),
    'origin', origin_value,
    'destination', destination_value,
    'origin_market', origin_market_value,
    'destination_market', destination_market_value,
    'origin_region', coalesce(nullif(btrim(rate_row.origin_region), ''), '-'),
    'destination_region', coalesce(nullif(btrim(rate_row.destination_region), ''), '-'),
    'origin_state', coalesce(nullif(btrim(rate_row.origin_state), ''), '-'),
    'destination_state', coalesce(nullif(btrim(rate_row.destination_state), ''), '-'),
    'origin_zip', coalesce(nullif(btrim(rate_row.origin_zip_prefix), ''), nullif(btrim(rate_row.origin_state), ''), '-'),
    'destination_zip', coalesce(nullif(btrim(rate_row.destination_zip_prefix), ''), nullif(btrim(rate_row.destination_state), ''), '-'),
    'origin_country', coalesce(nullif(btrim(rate_row.origin_country), ''), '-'),
    'destination_country', coalesce(nullif(btrim(rate_row.destination_country), ''), '-'),
    'equipment', coalesce(nullif(btrim(rate_row.equipment), ''), '-'),
    'trailer', coalesce(nullif(btrim(rate_row.trailer), ''), '-'),
    'hazmat', case when coalesce(rate_row.hazmat, false) then 'Hazmat' else 'Non-hazmat' end,
    'temperature_controlled', case when coalesce(rate_row.temperature_controlled, false) then 'Temp controlled' else 'Ambient' end,
    'operation', coalesce(nullif(btrim(rate_row.operation), ''), '-'),
    'service', coalesce(nullif(btrim(rate_row.service), ''), '-'),
    'mx_crossing', mx_crossing_value,
    'us_crossing', us_crossing_value,
    'border_pair', concat_ws(' / ', mx_crossing_value, us_crossing_value),
    'quote_month', coalesce(substring(rate_row.quote_date::text from 1 for 7), '-'),
    'currency', coalesce(nullif(btrim(rate_row.currency), ''), '-'),
    'rate_status', coalesce(nullif(btrim(rate_row.status), ''), '-')
  )
  from labels;
$$;

create or replace function public.rateware_bi_fact_search_text(
  rate_row public.rate_staging,
  vendor_row public.vendors
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(concat_ws(' ',
    vendor_row.vendor_name,
    vendor_row.domain,
    rate_row.vendor_domain,
    rate_row.rfx_id,
    rate_row.origin,
    rate_row.destination,
    rate_row.normalized_origin,
    rate_row.normalized_destination,
    rate_row.origin_market,
    rate_row.destination_market,
    rate_row.origin_state,
    rate_row.destination_state,
    rate_row.origin_country,
    rate_row.destination_country,
    rate_row.operation,
    rate_row.service,
    rate_row.equipment,
    rate_row.trailer,
    rate_row.mx_border_crossing_point,
    rate_row.us_border_crossing_point
  ));
$$;

create or replace function public.rateware_sync_bi_rate_fact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_record public.vendors%rowtype;
  all_in numeric;
  miles numeric;
  km numeric;
  us_miles numeric;
  searchable text;
  crossborder boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.rateware_bi_rate_facts where rate_id = old.id;
    return old;
  end if;

  if new.status not in ('pending_review', 'approved') or nullif(btrim(new.owner_email), '') is null then
    delete from public.rateware_bi_rate_facts where rate_id = new.id;
    return new;
  end if;

  if new.vendor_id is not null then
    select * into vendor_record
    from public.vendors
    where id = new.vendor_id
      and owner_email = new.owner_email;
  end if;

  all_in := public.rateware_clean_rate_number(new.all_in_rate);
  us_miles := public.rateware_clean_rate_number(new.us_miles);
  miles := coalesce(nullif(new.calculated_miles, 0), nullif(us_miles, 0));
  km := coalesce(nullif(new.calculated_km, 0), nullif(new.calculated_miles * 1.60934, 0), nullif(us_miles * 1.60934, 0));
  searchable := public.rateware_bi_fact_search_text(new, vendor_record);
  crossborder := public.rateware_row_cross_border(new);

  insert into public.rateware_bi_rate_facts (
    rate_id, owner_email, organization_id, vendor_id, vendor_domain_key,
    status, quote_date, rfx_id, currency, dimensions, search_text,
    is_crossborder, is_d2d, is_mexico, all_in_amount, cost_per_mile,
    cost_per_km, calculated_miles, calculated_km, us_miles_amount,
    created_at, updated_at
  ) values (
    new.id, lower(new.owner_email), new.organization_id, new.vendor_id,
    public.rateware_domain_key(new.vendor_domain), new.status, new.quote_date,
    new.rfx_id, new.currency,
    public.rateware_bi_fact_dimensions(new, vendor_record), searchable,
    crossborder,
    crossborder and (searchable like '%d2d import%' or searchable like '%d2d export%'),
    upper(coalesce(new.origin_country, '')) = 'MX'
      or upper(coalesce(new.destination_country, '')) = 'MX'
      or searchable similar to '%(mexico|monterrey|nuevo leon|apodaca|queretaro|bajio|laredo|lerma|toluca)%',
    all_in,
    case when all_in is not null and miles is not null and miles > 0 then all_in / miles else null end,
    case when all_in is not null and km is not null and km > 0 then all_in / km else null end,
    new.calculated_miles, new.calculated_km, us_miles,
    coalesce(new.created_at, now()), now()
  )
  on conflict (rate_id) do update set
    owner_email = excluded.owner_email,
    organization_id = excluded.organization_id,
    vendor_id = excluded.vendor_id,
    vendor_domain_key = excluded.vendor_domain_key,
    status = excluded.status,
    quote_date = excluded.quote_date,
    rfx_id = excluded.rfx_id,
    currency = excluded.currency,
    dimensions = excluded.dimensions,
    search_text = excluded.search_text,
    is_crossborder = excluded.is_crossborder,
    is_d2d = excluded.is_d2d,
    is_mexico = excluded.is_mexico,
    all_in_amount = excluded.all_in_amount,
    cost_per_mile = excluded.cost_per_mile,
    cost_per_km = excluded.cost_per_km,
    calculated_miles = excluded.calculated_miles,
    calculated_km = excluded.calculated_km,
    us_miles_amount = excluded.us_miles_amount,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists rateware_bi_rate_fact_sync on public.rate_staging;
create trigger rateware_bi_rate_fact_sync
after insert or update or delete on public.rate_staging
for each row execute function public.rateware_sync_bi_rate_fact();

create or replace function public.rateware_sync_bi_vendor_facts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rateware_bi_rate_facts facts
  set
    dimensions = public.rateware_bi_fact_dimensions(rates, new),
    search_text = public.rateware_bi_fact_search_text(rates, new),
    updated_at = now()
  from public.rate_staging rates
  where facts.rate_id = rates.id
    and facts.vendor_id = new.id
    and facts.owner_email = lower(new.owner_email);
  return new;
end;
$$;

drop trigger if exists rateware_bi_vendor_fact_sync on public.vendors;
create trigger rateware_bi_vendor_fact_sync
after update of vendor_name, domain, base_stage, status, owner_email on public.vendors
for each row execute function public.rateware_sync_bi_vendor_facts();

with source as materialized (
  select
    rates.id,
    lower(rates.owner_email) owner_email,
    rates.organization_id,
    rates.vendor_id,
    public.rateware_domain_key(rates.vendor_domain) vendor_domain_key,
    rates.status,
    rates.quote_date,
    rates.rfx_id,
    rates.currency,
    rates.created_at,
    rates.calculated_miles,
    rates.calculated_km,
    public.rateware_clean_rate_number(rates.all_in_rate) all_in_amount,
    public.rateware_clean_rate_number(rates.us_miles) us_miles_amount,
    rates.vendor_domain,
    vendors.vendor_name,
    vendors.domain crm_domain,
    vendors.base_stage vendor_stage,
    vendors.status vendor_status,
    coalesce(nullif(btrim(rates.normalized_origin), ''), nullif(btrim(rates.origin), ''), '-') origin_value,
    coalesce(nullif(btrim(rates.normalized_destination), ''), nullif(btrim(rates.destination), ''), '-') destination_value,
    coalesce(nullif(btrim(rates.origin_market), ''), '-') origin_market_value,
    coalesce(nullif(btrim(rates.destination_market), ''), '-') destination_market_value,
    coalesce(nullif(btrim(rates.mx_border_crossing_point), ''), '-') mx_crossing_value,
    coalesce(nullif(btrim(rates.us_border_crossing_point), ''), '-') us_crossing_value,
    rates.origin_region,
    rates.destination_region,
    rates.origin_state,
    rates.destination_state,
    rates.origin_zip_prefix,
    rates.destination_zip_prefix,
    rates.origin_country,
    rates.destination_country,
    rates.equipment,
    rates.trailer,
    rates.hazmat,
    rates.temperature_controlled,
    rates.operation,
    rates.service,
    lower(concat_ws(' ',
      vendors.vendor_name,
      vendors.domain,
      rates.vendor_domain,
      rates.rfx_id,
      rates.origin,
      rates.destination,
      rates.normalized_origin,
      rates.normalized_destination,
      rates.origin_city,
      rates.destination_city,
      rates.origin_market,
      rates.destination_market,
      rates.origin_state,
      rates.destination_state,
      rates.origin_country,
      rates.destination_country,
      rates.operation,
      rates.service,
      rates.equipment,
      rates.trailer,
      rates.mx_border_crossing_point,
      rates.us_border_crossing_point
    )) searchable
  from public.rate_staging rates
  left join public.vendors vendors
    on vendors.id = rates.vendor_id
   and vendors.owner_email = rates.owner_email
  where rates.status in ('pending_review', 'approved')
    and nullif(btrim(rates.owner_email), '') is not null
),
prepared as materialized (
  select
    source.*,
    coalesce(nullif(btrim(source.vendor_domain), ''), nullif(btrim(source.crm_domain), '')) raw_vendor_domain,
    (
      source.searchable ~ '(cross-border|crossborder|d2d import|d2d export|laredo|nuevo laredo)'
      or (upper(coalesce(source.origin_country, '')) = 'MX' and upper(coalesce(source.destination_country, '')) in ('US', 'USA', 'CA', 'CANADA'))
      or (upper(coalesce(source.destination_country, '')) = 'MX' and upper(coalesce(source.origin_country, '')) in ('US', 'USA', 'CA', 'CANADA'))
    ) is_crossborder,
    coalesce(nullif(source.calculated_miles, 0), nullif(source.us_miles_amount, 0)) miles_amount,
    coalesce(nullif(source.calculated_km, 0), nullif(source.calculated_miles * 1.60934, 0), nullif(source.us_miles_amount * 1.60934, 0)) km_amount
  from source
),
fact_rows as materialized (
  select
    prepared.*,
    case
      when prepared.raw_vendor_domain is not null
        and not public.rateware_is_generic_email_domain(prepared.raw_vendor_domain)
        then prepared.raw_vendor_domain
      else null
    end safe_vendor_domain
  from prepared
)
insert into public.rateware_bi_rate_facts (
  rate_id, owner_email, organization_id, vendor_id, vendor_domain_key,
  status, quote_date, rfx_id, currency, dimensions, search_text,
  is_crossborder, is_d2d, is_mexico, all_in_amount, cost_per_mile,
  cost_per_km, calculated_miles, calculated_km, us_miles_amount,
  created_at, updated_at
)
select
  fact_rows.id,
  fact_rows.owner_email,
  fact_rows.organization_id,
  fact_rows.vendor_id,
  fact_rows.vendor_domain_key,
  fact_rows.status,
  fact_rows.quote_date,
  fact_rows.rfx_id,
  fact_rows.currency,
  jsonb_build_object(
    'vendor', coalesce(nullif(btrim(fact_rows.vendor_name), ''), fact_rows.safe_vendor_domain, 'Unmatched carrier'),
    'vendor_domain', coalesce(fact_rows.safe_vendor_domain, '-'),
    'vendor_stage', coalesce(nullif(btrim(fact_rows.vendor_stage), ''), '-'),
    'vendor_status', coalesce(nullif(btrim(fact_rows.vendor_status), ''), '-'),
    'route', concat_ws(' -> ', fact_rows.origin_value, fact_rows.destination_value),
    'corridor', concat_ws(' -> ', fact_rows.origin_market_value, fact_rows.destination_market_value),
    'origin', fact_rows.origin_value,
    'destination', fact_rows.destination_value,
    'origin_market', fact_rows.origin_market_value,
    'destination_market', fact_rows.destination_market_value,
    'origin_region', coalesce(nullif(btrim(fact_rows.origin_region), ''), '-'),
    'destination_region', coalesce(nullif(btrim(fact_rows.destination_region), ''), '-'),
    'origin_state', coalesce(nullif(btrim(fact_rows.origin_state), ''), '-'),
    'destination_state', coalesce(nullif(btrim(fact_rows.destination_state), ''), '-'),
    'origin_zip', coalesce(nullif(btrim(fact_rows.origin_zip_prefix), ''), nullif(btrim(fact_rows.origin_state), ''), '-'),
    'destination_zip', coalesce(nullif(btrim(fact_rows.destination_zip_prefix), ''), nullif(btrim(fact_rows.destination_state), ''), '-'),
    'origin_country', coalesce(nullif(btrim(fact_rows.origin_country), ''), '-'),
    'destination_country', coalesce(nullif(btrim(fact_rows.destination_country), ''), '-'),
    'equipment', coalesce(nullif(btrim(fact_rows.equipment), ''), '-'),
    'trailer', coalesce(nullif(btrim(fact_rows.trailer), ''), '-'),
    'hazmat', case when coalesce(fact_rows.hazmat, false) then 'Hazmat' else 'Non-hazmat' end,
    'temperature_controlled', case when coalesce(fact_rows.temperature_controlled, false) then 'Temp controlled' else 'Ambient' end,
    'operation', coalesce(nullif(btrim(fact_rows.operation), ''), '-'),
    'service', coalesce(nullif(btrim(fact_rows.service), ''), '-'),
    'mx_crossing', fact_rows.mx_crossing_value,
    'us_crossing', fact_rows.us_crossing_value,
    'border_pair', concat_ws(' / ', fact_rows.mx_crossing_value, fact_rows.us_crossing_value),
    'quote_month', coalesce(substring(fact_rows.quote_date::text from 1 for 7), '-'),
    'currency', coalesce(nullif(btrim(fact_rows.currency), ''), '-'),
    'rate_status', coalesce(nullif(btrim(fact_rows.status), ''), '-')
  ),
  fact_rows.searchable,
  fact_rows.is_crossborder,
  fact_rows.is_crossborder and (fact_rows.searchable like '%d2d import%' or fact_rows.searchable like '%d2d export%'),
  upper(coalesce(fact_rows.origin_country, '')) = 'MX'
    or upper(coalesce(fact_rows.destination_country, '')) = 'MX'
    or fact_rows.searchable similar to '%(mexico|monterrey|nuevo leon|apodaca|queretaro|bajio|laredo|lerma|toluca)%',
  fact_rows.all_in_amount,
  case when fact_rows.all_in_amount is not null and fact_rows.miles_amount > 0 then fact_rows.all_in_amount / fact_rows.miles_amount else null end,
  case when fact_rows.all_in_amount is not null and fact_rows.km_amount > 0 then fact_rows.all_in_amount / fact_rows.km_amount else null end,
  fact_rows.calculated_miles,
  fact_rows.calculated_km,
  fact_rows.us_miles_amount,
  fact_rows.created_at,
  now()
from fact_rows
on conflict (rate_id) do update set
  owner_email = excluded.owner_email,
  organization_id = excluded.organization_id,
  vendor_id = excluded.vendor_id,
  vendor_domain_key = excluded.vendor_domain_key,
  status = excluded.status,
  quote_date = excluded.quote_date,
  rfx_id = excluded.rfx_id,
  currency = excluded.currency,
  dimensions = excluded.dimensions,
  search_text = excluded.search_text,
  is_crossborder = excluded.is_crossborder,
  is_d2d = excluded.is_d2d,
  is_mexico = excluded.is_mexico,
  all_in_amount = excluded.all_in_amount,
  cost_per_mile = excluded.cost_per_mile,
  cost_per_km = excluded.cost_per_km,
  calculated_miles = excluded.calculated_miles,
  calculated_km = excluded.calculated_km,
  us_miles_amount = excluded.us_miles_amount,
  updated_at = now();

create or replace function public.rateware_bi_fact_matches_filters(
  fact_row public.rateware_bi_rate_facts,
  p_filters jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  filter_key text;
begin
  if filters = '{}'::jsonb then
    return true;
  end if;

  if filters ? 'search'
    and not public.rateware_bi_value_filter_match(filters, 'search', fact_row.search_text) then
    return false;
  end if;
  if filters ? 'crossborder'
    and coalesce((filters ->> 'crossborder')::boolean, false)
    and not fact_row.is_crossborder then
    return false;
  end if;
  if filters ? 'd2d'
    and coalesce((filters ->> 'd2d')::boolean, false)
    and not fact_row.is_d2d then
    return false;
  end if;

  for filter_key in
    select active.key
    from jsonb_object_keys(filters) as active(key)
    where active.key not in ('search', 'crossborder', 'd2d')
      and fact_row.dimensions ? active.key
  loop
    if not public.rateware_bi_value_filter_match(filters, filter_key, fact_row.dimensions ->> filter_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.rateware_bi_summary_for_owner(
  p_owner_email text,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select lower(nullif(btrim(p_owner_email), '')) owner_key, coalesce(p_filters, '{}'::jsonb) filters
  ),
  filtered as materialized (
    select facts.*
    from public.rateware_bi_rate_facts facts
    cross join params
    where params.owner_key is not null
      and facts.owner_email = params.owner_key
      and facts.status in ('pending_review', 'approved')
      and case
        when params.filters = '{}'::jsonb then true
        else public.rateware_bi_fact_matches_filters(facts, params.filters)
      end
  )
  select jsonb_build_object(
    'transactions', count(*),
    'carriers', count(distinct dimensions ->> 'vendor'),
    'approved_rates', count(*) filter (where status = 'approved'),
    'pending_rates', count(*) filter (where status = 'pending_review'),
    'crossborder_rates', count(*) filter (where is_crossborder),
    'd2d_import_export_rates', count(*) filter (where is_d2d),
    'missing_vendor', count(*) filter (where vendor_id is null and vendor_domain_key is not null),
    'missing_rate', count(*) filter (where all_in_amount is null),
    'missing_miles', count(*) filter (
      where all_in_amount is not null
        and calculated_miles is null
        and calculated_km is null
        and us_miles_amount is null
    ),
    'missing_origin', count(*) filter (
      where coalesce(dimensions ->> 'origin_market', '-') = '-'
        and coalesce(dimensions ->> 'origin_state', '-') = '-'
        and coalesce(dimensions ->> 'origin_country', '-') = '-'
    ),
    'missing_destination', count(*) filter (
      where coalesce(dimensions ->> 'destination_market', '-') = '-'
        and coalesce(dimensions ->> 'destination_state', '-') = '-'
        and coalesce(dimensions ->> 'destination_country', '-') = '-'
    ),
    'avg_all_in_rate', round(avg(all_in_amount), 2),
    'min_all_in_rate', round(min(all_in_amount), 2),
    'max_all_in_rate', round(max(all_in_amount), 2)
  )
  from filtered;
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
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select lower(nullif(btrim(p_owner_email), '')) owner_key, coalesce(p_filters, '{}'::jsonb) filters
  ),
  vendor_scope as materialized (
    select
      vendors.id,
      public.rateware_domain_key(vendors.domain) domain_key,
      public.rateware_domain_key(vendors.primary_email) email_domain_key,
      coalesce(vendors.secondary_emails, '{}'::text[]) secondary_emails
    from public.vendors vendors
    cross join params
    where vendors.owner_email = params.owner_key
  ),
  domain_candidates as (
    select id vendor_id, domain_key, 100 priority from vendor_scope
    union all
    select id, email_domain_key, 90 from vendor_scope
    union all
    select scope.id, public.rateware_domain_key(secondary.email), 80
    from vendor_scope scope
    cross join lateral unnest(scope.secondary_emails) as secondary(email)
  ),
  vendor_domains as materialized (
    select distinct on (domain_key) domain_key, vendor_id
    from domain_candidates
    where domain_key is not null
      and not public.rateware_is_generic_email_domain(domain_key)
    order by domain_key, priority desc, vendor_id
  ),
  matched as materialized (
    select
      coalesce(facts.vendor_id, vendor_domains.vendor_id) resolved_vendor_id,
      facts.*
    from public.rateware_bi_rate_facts facts
    cross join params
    left join vendor_domains
      on facts.vendor_id is null
     and vendor_domains.domain_key = facts.vendor_domain_key
    join vendor_scope
      on vendor_scope.id = coalesce(facts.vendor_id, vendor_domains.vendor_id)
    where facts.owner_email = params.owner_key
      and facts.status in ('pending_review', 'approved')
      and case
        when params.filters = '{}'::jsonb then true
        else public.rateware_bi_fact_matches_filters(facts, params.filters)
      end
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
      array_remove(array_agg(distinct nullif(matched.dimensions ->> 'origin_market', '-')), null)
      || array_remove(array_agg(distinct nullif(matched.dimensions ->> 'destination_market', '-')), null)
    )[1:8], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.dimensions ->> 'route', '- -> -')), null))[1:6], '{}'::text[]),
    coalesce((
      array_remove(array_agg(distinct nullif(matched.dimensions ->> 'equipment', '-')), null)
      || array_remove(array_agg(distinct nullif(matched.dimensions ->> 'trailer', '-')), null)
    )[1:6], '{}'::text[]),
    coalesce((array_remove(array_agg(distinct nullif(matched.dimensions ->> 'border_pair', '- / -')), null))[1:6], '{}'::text[]),
    max(matched.quote_date)
  from matched
  group by matched.resolved_vendor_id;
$$;

revoke all on function public.rateware_bi_fact_dimensions(public.rate_staging, public.vendors) from public, anon, authenticated;
revoke all on function public.rateware_bi_fact_search_text(public.rate_staging, public.vendors) from public, anon, authenticated;
revoke all on function public.rateware_sync_bi_rate_fact() from public, anon, authenticated;
revoke all on function public.rateware_sync_bi_vendor_facts() from public, anon, authenticated;
revoke all on function public.rateware_bi_fact_matches_filters(public.rateware_bi_rate_facts, jsonb) from public, anon, authenticated;
revoke all on function public.rateware_bi_summary_for_owner(text, jsonb) from public, anon, authenticated;
revoke all on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb) from public, anon, authenticated;

grant execute on function public.rateware_bi_fact_dimensions(public.rate_staging, public.vendors) to service_role;
grant execute on function public.rateware_bi_fact_search_text(public.rate_staging, public.vendors) to service_role;
grant execute on function public.rateware_bi_fact_matches_filters(public.rateware_bi_rate_facts, jsonb) to service_role;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb) to service_role;
grant execute on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb) to service_role;

create index if not exists rateware_bi_facts_owner_status_idx
  on public.rateware_bi_rate_facts(owner_email, status);
create index if not exists rateware_bi_facts_owner_vendor_idx
  on public.rateware_bi_rate_facts(owner_email, vendor_id)
  where vendor_id is not null;
create index if not exists rateware_bi_facts_owner_domain_idx
  on public.rateware_bi_rate_facts(owner_email, vendor_domain_key)
  where vendor_domain_key is not null;
create index if not exists rateware_bi_facts_owner_quote_idx
  on public.rateware_bi_rate_facts(owner_email, quote_date desc nulls last);

analyze public.rateware_bi_rate_facts;
