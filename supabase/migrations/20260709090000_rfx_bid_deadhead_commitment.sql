alter table public.rfx_lane_vendors
  add column if not exists current_unit_location text,
  add column if not exists deadhead_distance numeric,
  add column if not exists deadhead_unit text;

alter table public.rate_staging
  add column if not exists current_unit_location text,
  add column if not exists deadhead_distance numeric,
  add column if not exists deadhead_unit text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rfx_lane_vendors_deadhead_unit_check'
      and conrelid = 'public.rfx_lane_vendors'::regclass
  ) then
    alter table public.rfx_lane_vendors
      add constraint rfx_lane_vendors_deadhead_unit_check
      check (deadhead_unit is null or deadhead_unit in ('mi', 'km'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rate_staging_deadhead_unit_check'
      and conrelid = 'public.rate_staging'::regclass
  ) then
    alter table public.rate_staging
      add constraint rate_staging_deadhead_unit_check
      check (deadhead_unit is null or deadhead_unit in ('mi', 'km'));
  end if;
end $$;

create index if not exists rfx_lane_vendors_deadhead_idx
  on public.rfx_lane_vendors (rfx_event_id, deadhead_distance)
  where deadhead_distance is not null;

create index if not exists rate_staging_deadhead_idx
  on public.rate_staging (deadhead_distance)
  where deadhead_distance is not null;

comment on column public.rfx_lane_vendors.current_unit_location is
  'Carrier declared current unit location for live capacity commitment.';

comment on column public.rfx_lane_vendors.deadhead_distance is
  'Carrier declared empty miles or kilometers from current unit location to pickup.';

comment on column public.rfx_lane_vendors.deadhead_unit is
  'Distance unit for deadhead_distance. Allowed values: mi or km.';

comment on column public.rate_staging.current_unit_location is
  'Carrier declared current unit location copied from RFx bid submission.';

comment on column public.rate_staging.deadhead_distance is
  'Carrier declared empty miles or kilometers copied from RFx bid submission.';

comment on column public.rate_staging.deadhead_unit is
  'Distance unit for deadhead_distance copied from RFx bid submission.';
