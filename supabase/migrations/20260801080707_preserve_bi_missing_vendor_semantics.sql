alter table public.rateware_bi_rate_facts
  add column if not exists has_vendor_reference boolean not null default false;

update public.rateware_bi_rate_facts facts
set has_vendor_reference = nullif(btrim(coalesce(rates.vendor_domain, '')), '') is not null
from public.rate_staging rates
where rates.id = facts.rate_id;

create or replace function public.rateware_set_bi_fact_vendor_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_vendor_domain text;
begin
  select vendor_domain into source_vendor_domain
  from public.rate_staging
  where id = new.rate_id;

  new.has_vendor_reference := nullif(btrim(coalesce(source_vendor_domain, '')), '') is not null;
  return new;
end;
$$;

drop trigger if exists rateware_bi_fact_vendor_reference_sync on public.rateware_bi_rate_facts;
create trigger rateware_bi_fact_vendor_reference_sync
before insert or update on public.rateware_bi_rate_facts
for each row execute function public.rateware_set_bi_fact_vendor_reference();

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
    'missing_vendor', count(*) filter (where vendor_id is null and has_vendor_reference),
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

revoke all on function public.rateware_set_bi_fact_vendor_reference() from public, anon, authenticated;
revoke all on function public.rateware_bi_summary_for_owner(text, jsonb) from public, anon, authenticated;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb) to service_role;
