-- Build the BI summary in one indexed, materialized pass. The previous
-- implementation passed the full rate_staging composite through several SQL
-- and PL/pgSQL helpers repeatedly, which made a 56k-row summary take 40-120s.
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
    select
      lower(nullif(btrim(p_owner_email), '')) as owner_key,
      coalesce(p_filters, '{}'::jsonb) as filters
  ),
  filtered as materialized (
    select
      rs,
      v.vendor_name,
      v.domain as crm_domain
    from public.rate_staging rs
    cross join params
    left join public.vendors v
      on v.id = rs.vendor_id
     and lower(v.owner_email) = params.owner_key
    where params.owner_key is not null
      and rs.owner_email = params.owner_key
      and rs.status in ('pending_review', 'approved')
      and (rs.vendor_id is null or v.id is not null)
      and case
        when params.filters = '{}'::jsonb then true
        else public.rateware_bi_rate_matches_filters(rs, v, params.owner_key, params.filters)
      end
  ),
  text_prepared as materialized (
    select
      (filtered.rs).status as rate_status,
      (filtered.rs).vendor_id,
      (filtered.rs).vendor_domain,
      (filtered.rs).origin_market,
      (filtered.rs).origin_state,
      (filtered.rs).origin_country,
      (filtered.rs).destination_market,
      (filtered.rs).destination_state,
      (filtered.rs).destination_country,
      (filtered.rs).calculated_miles,
      (filtered.rs).calculated_km,
      coalesce(
        nullif(btrim(filtered.vendor_name), ''),
        case
          when not public.rateware_is_generic_email_domain(
            coalesce(nullif(btrim((filtered.rs).vendor_domain), ''), nullif(btrim(filtered.crm_domain), ''))
          ) then coalesce(nullif(btrim((filtered.rs).vendor_domain), ''), nullif(btrim(filtered.crm_domain), ''))
          else null
        end,
        'Unmatched carrier'
      ) as carrier_label,
      public.rateware_clean_rate_number((filtered.rs).all_in_rate) as all_in_amount,
      public.rateware_clean_rate_number((filtered.rs).us_miles) as us_miles_amount,
      lower(concat_ws(' ',
        (filtered.rs).vendor_domain,
        (filtered.rs).rfx_id,
        (filtered.rs).origin,
        (filtered.rs).destination,
        (filtered.rs).normalized_origin,
        (filtered.rs).normalized_destination,
        (filtered.rs).origin_city,
        (filtered.rs).destination_city,
        (filtered.rs).origin_state,
        (filtered.rs).destination_state,
        (filtered.rs).origin_market,
        (filtered.rs).destination_market,
        (filtered.rs).operation,
        (filtered.rs).service,
        (filtered.rs).equipment,
        (filtered.rs).trailer,
        (filtered.rs).mx_border_crossing_point,
        (filtered.rs).us_border_crossing_point
      )) as searchable_rate_text
    from filtered
  ),
  prepared as materialized (
    select
      text_prepared.*,
      (
        searchable_rate_text ~ '(cross-border|crossborder|d2d import|d2d export|laredo|nuevo laredo)'
        or (
          upper(coalesce(origin_country, '')) = 'MX'
          and upper(coalesce(destination_country, '')) in ('US', 'USA', 'CA', 'CANADA')
        )
        or (
          upper(coalesce(destination_country, '')) = 'MX'
          and upper(coalesce(origin_country, '')) in ('US', 'USA', 'CA', 'CANADA')
        )
      ) as is_crossborder
    from text_prepared
  )
  select jsonb_build_object(
    'transactions', count(*),
    'carriers', count(distinct carrier_label),
    'approved_rates', count(*) filter (where rate_status = 'approved'),
    'pending_rates', count(*) filter (where rate_status = 'pending_review'),
    'crossborder_rates', count(*) filter (where is_crossborder),
    'd2d_import_export_rates', count(*) filter (
      where is_crossborder
        and (searchable_rate_text like '%d2d import%' or searchable_rate_text like '%d2d export%')
    ),
    'missing_vendor', count(*) filter (
      where vendor_id is null
        and nullif(btrim(coalesce(vendor_domain, '')), '') is not null
    ),
    'missing_rate', count(*) filter (where all_in_amount is null),
    'missing_miles', count(*) filter (
      where all_in_amount is not null
        and calculated_miles is null
        and calculated_km is null
        and us_miles_amount is null
    ),
    'missing_origin', count(*) filter (
      where nullif(btrim(coalesce(origin_market, '')), '') is null
        and nullif(btrim(coalesce(origin_state, '')), '') is null
        and nullif(btrim(coalesce(origin_country, '')), '') is null
    ),
    'missing_destination', count(*) filter (
      where nullif(btrim(coalesce(destination_market, '')), '') is null
        and nullif(btrim(coalesce(destination_state, '')), '') is null
        and nullif(btrim(coalesce(destination_country, '')), '') is null
    ),
    'avg_all_in_rate', round(avg(all_in_amount), 2),
    'min_all_in_rate', round(min(all_in_amount), 2),
    'max_all_in_rate', round(max(all_in_amount), 2)
  )
  from prepared;
$$;

revoke all on function public.rateware_bi_summary_for_owner(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb)
  to service_role;

comment on function public.rateware_bi_summary_for_owner(text, jsonb)
  is 'Internal Rateware BI summary. Uses indexed workspace scope and computes row signals once.';
