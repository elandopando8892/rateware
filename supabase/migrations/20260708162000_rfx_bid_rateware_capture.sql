alter table public.rfx_lane_vendors
  add column if not exists bid_rate_staging_id uuid references public.rate_staging(id) on delete set null,
  add column if not exists bid_rate_staged_at timestamptz;

alter table public.rate_staging
  add column if not exists carrier_cost_rate numeric,
  add column if not exists customer_board_rate numeric,
  add column if not exists commercial_model text,
  add column if not exists commission_fee numeric,
  add column if not exists commission_pct numeric,
  add column if not exists markup_fee numeric,
  add column if not exists markup_pct numeric,
  add column if not exists rate_basis text,
  add column if not exists source_bid_status text;

create index if not exists rfx_lane_vendors_bid_rate_staging_idx
  on public.rfx_lane_vendors (bid_rate_staging_id);

create index if not exists rfx_lane_vendors_bid_rate_staged_idx
  on public.rfx_lane_vendors (rfx_event_id, bid_rate_staged_at desc);

create index if not exists rate_staging_source_bid_status_idx
  on public.rate_staging (source_bid_status, status, created_at desc);

comment on column public.rfx_lane_vendors.bid_rate_staging_id is
  'Rateware staging row created from the carrier bid submission. Separate from award closeout rate_staging_id.';

comment on column public.rate_staging.carrier_cost_rate is
  'Original carrier cost submitted in Bid Room before MARKSMAN cost-plus or XBF buy-sell adjustments.';

comment on column public.rate_staging.customer_board_rate is
  'Commercially comparable board rate after cost-plus or buy-sell adjustments, if applicable.';
