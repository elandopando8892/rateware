alter table public.rfx_lane_vendors
  add column if not exists commercial_model text,
  add column if not exists marksman_margin_pct numeric,
  add column if not exists carrier_share_pct numeric,
  add column if not exists best_alternative_offered boolean not null default false,
  add column if not exists alternative_equipment text,
  add column if not exists alternative_units numeric,
  add column if not exists alternative_notes text,
  add column if not exists equipment_available boolean,
  add column if not exists unit_details text,
  add column if not exists eta_pickup timestamptz,
  add column if not exists eta_delivery timestamptz,
  add column if not exists mirror_account_enabled boolean not null default false,
  add column if not exists availability_validation_status text not null default 'not_requested',
  add column if not exists availability_validation_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rfx_lane_vendors_commercial_model_check'
  ) then
    alter table public.rfx_lane_vendors
      add constraint rfx_lane_vendors_commercial_model_check
      check (
        commercial_model is null
        or commercial_model in ('direct_cost_plus', 'carrier_share', 'xbf_buy_sell')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rfx_lane_vendors_availability_validation_status_check'
  ) then
    alter table public.rfx_lane_vendors
      add constraint rfx_lane_vendors_availability_validation_status_check
      check (
        availability_validation_status in ('not_requested', 'mirror_requested', 'mirror_enabled', 'validated', 'rejected')
      );
  end if;
end $$;

create index if not exists rfx_lane_vendors_event_commercial_model_idx
  on public.rfx_lane_vendors (rfx_event_id, commercial_model);

create index if not exists rfx_lane_vendors_event_availability_idx
  on public.rfx_lane_vendors (rfx_event_id, equipment_available, eta_pickup);
