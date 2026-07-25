-- Keep Sourcing, Procurement, Funnel, Rateware and Bid Room on one vendor lifecycle.
-- A vendor can enter through CRM, an RFx shortlist, an invitation response, or a matched
-- rate. The lifecycle must advance consistently regardless of the entry point.

create or replace function public.rateware_vendor_funnel_stage_rank(p_stage text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_stage, ''))
    when 'targeted' then 1
    when 'nested' then 2
    when 'drafted' then 3
    when 'invited' then 4
    when 'onboarded' then 5
    when 'trained' then 6
    when 'activated' then 7
    when 'completed' then 8
    else 0
  end;
$$;

create or replace function public.rateware_normalize_vendor_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_stage text;
begin
  new.base_stage := lower(coalesce(nullif(btrim(new.base_stage), ''), 'sourcing'));
  if new.base_stage not in ('sourcing', 'procurement', 'archived') then
    new.base_stage := 'sourcing';
  end if;

  if new.base_stage = 'procurement' then
    normalized_stage := lower(coalesce(nullif(btrim(new.funnel_stage), ''), 'targeted'));
    if public.rateware_vendor_funnel_stage_rank(normalized_stage) = 0 then
      normalized_stage := 'targeted';
    end if;
    new.funnel_stage := normalized_stage;
    new.funnel_stage_updated_at := coalesce(new.funnel_stage_updated_at, now());

    if normalized_stage = 'targeted' then new.targeted_at := coalesce(new.targeted_at, now()); end if;
    if normalized_stage = 'nested' then new.nested_at := coalesce(new.nested_at, now()); end if;
    if normalized_stage = 'drafted' then new.drafted_at := coalesce(new.drafted_at, now()); end if;
    if normalized_stage = 'invited' then new.invited_at := coalesce(new.invited_at, now()); end if;
    if normalized_stage = 'onboarded' then new.onboarded_at := coalesce(new.onboarded_at, now()); end if;
    if normalized_stage = 'trained' then new.trained_at := coalesce(new.trained_at, now()); end if;
    if normalized_stage = 'activated' then new.activated_at := coalesce(new.activated_at, now()); end if;
    if normalized_stage = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
  else
    new.funnel_stage := null;
    new.funnel_stage_updated_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists rateware_vendor_lifecycle_normalize on public.vendors;
create trigger rateware_vendor_lifecycle_normalize
before insert or update of base_stage, funnel_stage on public.vendors
for each row execute function public.rateware_normalize_vendor_lifecycle();

create or replace function public.rateware_promote_vendor_lifecycle(
  p_vendor_id uuid,
  p_minimum_stage text default 'targeted'
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  current_stage text;
  next_stage text;
  current_rank integer;
  required_rank integer;
begin
  if p_vendor_id is null then return false; end if;

  select funnel_stage into current_stage
  from public.vendors
  where id = p_vendor_id
    and base_stage <> 'archived'
  for update;

  if not found then return false; end if;

  required_rank := public.rateware_vendor_funnel_stage_rank(p_minimum_stage);
  if required_rank = 0 then required_rank := 1; end if;
  current_rank := public.rateware_vendor_funnel_stage_rank(current_stage);
  next_stage := case
    when current_rank >= required_rank then coalesce(current_stage, 'targeted')
    when required_rank = 1 then 'targeted'
    when required_rank = 2 then 'nested'
    when required_rank = 3 then 'drafted'
    when required_rank = 4 then 'invited'
    when required_rank = 5 then 'onboarded'
    when required_rank = 6 then 'trained'
    when required_rank = 7 then 'activated'
    else 'completed'
  end;

  update public.vendors
  set
    base_stage = 'procurement',
    funnel_stage = next_stage,
    funnel_stage_updated_at = case when current_stage is distinct from next_stage then now() else funnel_stage_updated_at end,
    targeted_at = coalesce(targeted_at, now()),
    nested_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 2 then coalesce(nested_at, now()) else nested_at end,
    drafted_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 3 then coalesce(drafted_at, now()) else drafted_at end,
    invited_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 4 then coalesce(invited_at, now()) else invited_at end,
    onboarded_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 5 then coalesce(onboarded_at, now()) else onboarded_at end,
    trained_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 6 then coalesce(trained_at, now()) else trained_at end,
    activated_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 7 then coalesce(activated_at, now()) else activated_at end,
    completed_at = case when public.rateware_vendor_funnel_stage_rank(next_stage) >= 8 then coalesce(completed_at, now()) else completed_at end,
    updated_at = now()
  where id = p_vendor_id;

  return true;
end;
$$;

create or replace function public.rateware_sync_vendor_lifecycle_from_rfx_lane_vendor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.vendor_id is not null and lower(coalesce(new.invitation_status, '')) <> 'archived' then
    perform public.rateware_promote_vendor_lifecycle(
      new.vendor_id,
      case
        when new.bid_rate is not null
          or lower(coalesce(new.invitation_status, '')) in ('quoted', 'bid_submitted', 'awarded')
          then 'nested'
        else 'targeted'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rateware_sync_vendor_lifecycle_from_rfx_lane_vendor on public.rfx_lane_vendors;
create trigger rateware_sync_vendor_lifecycle_from_rfx_lane_vendor
after insert or update of vendor_id, invitation_status, bid_rate on public.rfx_lane_vendors
for each row execute function public.rateware_sync_vendor_lifecycle_from_rfx_lane_vendor();

create or replace function public.rateware_sync_vendor_lifecycle_from_rate_staging()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.vendor_id is not null and lower(coalesce(new.status, 'pending_review')) not in ('rejected', 'archived', 'removed') then
    perform public.rateware_promote_vendor_lifecycle(new.vendor_id, 'nested');
  end if;
  return new;
end;
$$;

drop trigger if exists rateware_sync_vendor_lifecycle_from_rate_staging on public.rate_staging;
create trigger rateware_sync_vendor_lifecycle_from_rate_staging
after insert or update of vendor_id, status on public.rate_staging
for each row execute function public.rateware_sync_vendor_lifecycle_from_rate_staging();

-- Reconcile existing linked activity without demoting a vendor already advanced in onboarding.
do $$
declare
  signal_row record;
begin
  for signal_row in
    select
      vendor_id,
      case
        when bool_or(bid_rate is not null or invitation_status in ('quoted', 'bid_submitted', 'awarded')) then 'nested'
        else 'targeted'
      end as minimum_stage
    from public.rfx_lane_vendors
    where vendor_id is not null
      and invitation_status <> 'archived'
    group by vendor_id
  loop
    perform public.rateware_promote_vendor_lifecycle(signal_row.vendor_id, signal_row.minimum_stage);
  end loop;

  for signal_row in
    select distinct vendor_id
    from public.rate_staging
    where vendor_id is not null
      and status <> 'rejected'
  loop
    perform public.rateware_promote_vendor_lifecycle(signal_row.vendor_id, 'nested');
  end loop;
end;
$$;

create index if not exists rfx_lane_vendors_vendor_lifecycle_idx
  on public.rfx_lane_vendors (vendor_id, invitation_status);
create index if not exists rate_staging_vendor_lifecycle_idx
  on public.rate_staging (vendor_id, status)
  where vendor_id is not null;
