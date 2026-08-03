create or replace function public.rateware_bi_rate_matches_filters(
  rate_row public.rate_staging,
  vendor_row public.vendors,
  p_owner_email text,
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
  d2d_text text;
  scoped_owner text := lower(nullif(btrim(p_owner_email), ''));
begin
  if scoped_owner is null then
    return false;
  end if;

  if lower(coalesce(nullif(btrim(rate_row.owner_email), ''), '')) is distinct from scoped_owner then
    return false;
  end if;

  if rate_row.status not in ('pending_review', 'approved') then
    return false;
  end if;

  if rate_row.vendor_id is not null
    and lower(coalesce(nullif(btrim(vendor_row.owner_email), ''), '')) is distinct from scoped_owner then
    return false;
  end if;

  if filters ? 'search'
    and not public.rateware_bi_value_filter_match(filters, 'search', public.rateware_bi_row_text(rate_row, vendor_row)) then
    return false;
  end if;

  if filters ? 'crossborder' and coalesce((filters ->> 'crossborder')::boolean, false)
    and not public.rateware_row_cross_border(rate_row) then
    return false;
  end if;

  if filters ? 'd2d' and coalesce((filters ->> 'd2d')::boolean, false) then
    d2d_text := lower(public.rateware_bi_row_text(rate_row, vendor_row));
    if not (
      public.rateware_row_cross_border(rate_row)
      and (d2d_text like '%d2d import%' or d2d_text like '%d2d export%')
    ) then
      return false;
    end if;
  end if;

  foreach filter_key in array array[
    'vendor',
    'vendor_domain',
    'vendor_stage',
    'vendor_status',
    'route',
    'corridor',
    'origin',
    'destination',
    'origin_market',
    'destination_market',
    'origin_region',
    'destination_region',
    'origin_state',
    'destination_state',
    'origin_zip',
    'destination_zip',
    'origin_country',
    'destination_country',
    'equipment',
    'trailer',
    'hazmat',
    'temperature_controlled',
    'operation',
    'service',
    'mx_crossing',
    'us_crossing',
    'border_pair',
    'quote_month',
    'currency',
    'rate_status'
  ] loop
    if not public.rateware_bi_value_filter_match(
      filters,
      filter_key,
      public.rateware_bi_dimension_value(rate_row, vendor_row, filter_key)
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.rateware_bi_rate_matches_filters(public.rate_staging, public.vendors, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_rate_matches_filters(public.rate_staging, public.vendors, text, jsonb)
  to service_role;

revoke all on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer)
  to service_role;

revoke all on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer)
  to service_role;

revoke all on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer)
  to service_role;

revoke all on function public.rateware_bi_summary_for_owner(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb)
  to service_role;

revoke all on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb)
  to service_role;

comment on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer)
  is 'Internal Rateware BI RPC. Execute through the authenticated rateware-api Edge Function only.';
comment on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer)
  is 'Internal Rateware BI RPC. Execute through the authenticated rateware-api Edge Function only.';
comment on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer)
  is 'Internal Rateware BI RPC. Execute through the authenticated rateware-api Edge Function only.';
comment on function public.rateware_bi_summary_for_owner(text, jsonb)
  is 'Internal Rateware BI RPC. Execute through the authenticated rateware-api Edge Function only.';
comment on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb)
  is 'Internal Rateware BI RPC. Execute through the authenticated rateware-api Edge Function only.';
