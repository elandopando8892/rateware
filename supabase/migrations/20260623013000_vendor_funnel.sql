alter table public.vendors
  add column if not exists funnel_stage text,
  add column if not exists funnel_stage_updated_at timestamptz,
  add column if not exists targeted_at timestamptz,
  add column if not exists nested_at timestamptz,
  add column if not exists drafted_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists onboarded_at timestamptz,
  add column if not exists trained_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists completed_at timestamptz;

update public.vendors
set
  funnel_stage = coalesce(funnel_stage, 'targeted'),
  funnel_stage_updated_at = coalesce(funnel_stage_updated_at, updated_at, created_at, now()),
  targeted_at = coalesce(targeted_at, case when base_stage = 'procurement' then coalesce(updated_at, created_at, now()) end)
where base_stage = 'procurement'
  and (funnel_stage is null or funnel_stage_updated_at is null or targeted_at is null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and conname = 'vendors_funnel_stage_check'
  ) then
    alter table public.vendors
      add constraint vendors_funnel_stage_check
      check (
        funnel_stage is null
        or funnel_stage in ('targeted', 'nested', 'drafted', 'invited', 'onboarded', 'trained', 'activated', 'completed')
      );
  end if;
end $$;

create index if not exists vendors_owner_funnel_stage_idx
  on public.vendors (owner_email, funnel_stage);
