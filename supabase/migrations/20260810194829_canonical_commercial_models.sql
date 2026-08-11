begin;

alter table public.rfx_lane_vendors
  drop constraint if exists rfx_lane_vendors_commercial_model_check,
  drop constraint if exists rfx_lane_vendors_client_fee_amount_check,
  drop constraint if exists rfx_lane_vendors_commercial_rounding_increment_check;

update public.rfx_lane_vendors
set commercial_model = case commercial_model
  when 'direct_cost_plus' then 'cost_plus'
  when 'carrier_share' then 'sell_share'
  when 'xbf_buy_sell' then 'brokerage'
  else commercial_model
end
where commercial_model in ('direct_cost_plus', 'carrier_share', 'xbf_buy_sell');

alter table public.rfx_lane_vendors
  add column if not exists client_fee_amount numeric,
  add column if not exists commercial_rounding_increment numeric,
  add constraint rfx_lane_vendors_commercial_model_check
    check (
      commercial_model is null
      or commercial_model in ('fee_plus', 'cost_plus', 'sell_share', 'brokerage')
    ),
  add constraint rfx_lane_vendors_client_fee_amount_check
    check (client_fee_amount is null or client_fee_amount >= 0),
  add constraint rfx_lane_vendors_commercial_rounding_increment_check
    check (commercial_rounding_increment is null or commercial_rounding_increment > 0);

alter table public.rate_staging
  add column if not exists client_fee_amount numeric,
  add column if not exists commercial_rounding_increment numeric;

alter table public.rate_staging
  drop constraint if exists rate_staging_commercial_model_check;

update public.rate_staging
set commercial_model = case commercial_model
  when 'direct_cost_plus' then 'cost_plus'
  when 'carrier_share' then 'sell_share'
  when 'xbf_buy_sell' then 'brokerage'
  else commercial_model
end
where commercial_model in ('direct_cost_plus', 'carrier_share', 'xbf_buy_sell');

alter table public.rate_staging
  add constraint rate_staging_commercial_model_check
    check (
      commercial_model is null
      or commercial_model in ('fee_plus', 'cost_plus', 'sell_share', 'brokerage')
    );

comment on column public.rfx_lane_vendors.commercial_model is
  'Canonical commercial model: fee_plus, cost_plus, sell_share, or brokerage.';

comment on column public.rfx_lane_vendors.client_fee_amount is
  'Separate direct or transactional fee invoiced by XBF to the customer; never the carrier-side fee/share.';

comment on column public.rfx_lane_vendors.commercial_rounding_increment is
  'Optional negotiated rounding increment: nearest for Cost-Plus, downward for Sell-Share.';

commit;
