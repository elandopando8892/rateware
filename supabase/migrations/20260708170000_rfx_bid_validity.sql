alter table public.rfx_lane_vendors
  add column if not exists valid_through date;

alter table public.rate_staging
  add column if not exists valid_through date;

create index if not exists rfx_lane_vendors_valid_through_idx
  on public.rfx_lane_vendors (rfx_event_id, valid_through)
  where valid_through is not null;

create index if not exists rate_staging_valid_through_idx
  on public.rate_staging (valid_through)
  where valid_through is not null;

comment on column public.rfx_lane_vendors.valid_through is
  'Carrier-submitted offer validity date for the Bid Room lane quote.';

comment on column public.rate_staging.valid_through is
  'Offer validity date captured from source quotes or RFx carrier bid submissions.';
