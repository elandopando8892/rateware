alter table public.rfx_lane_vendors
  add column if not exists award_role text,
  add column if not exists award_reason text,
  add column if not exists award_notes text,
  add column if not exists awarded_at timestamptz,
  add column if not exists awarded_by text,
  add column if not exists rate_staging_id uuid references public.rate_staging(id) on delete set null,
  add column if not exists rateware_closeout_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rfx_lane_vendors'::regclass
      and conname = 'rfx_lane_vendors_award_role_check'
  ) then
    alter table public.rfx_lane_vendors
      add constraint rfx_lane_vendors_award_role_check
      check (award_role is null or award_role in ('primary', 'backup'));
  end if;
end $$;

create index if not exists rfx_lane_vendors_award_idx
  on public.rfx_lane_vendors (rfx_event_id, award_role, awarded_at desc);

create index if not exists rfx_lane_vendors_rate_staging_idx
  on public.rfx_lane_vendors (rate_staging_id);
