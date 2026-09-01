-- P3: make a carrier award one tenant-scoped, replay-safe transaction.

create table if not exists public.rfx_award_operations (
  owner_email text not null,
  operation_id uuid not null,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete cascade,
  payload_fingerprint text not null,
  result jsonb not null,
  completed_at timestamptz not null default now(),
  primary key (owner_email, operation_id)
);

alter table public.rfx_award_operations enable row level security;

comment on table public.rfx_award_operations is
  'Durable idempotency receipts for human-approved RFx carrier award transitions.';

create or replace function public.rateware_award_rfx_lane_vendor(
  p_owner_email text,
  p_operation_id uuid,
  p_rfx_lane_vendor_id uuid,
  p_award_role text,
  p_award_reason text default null,
  p_award_notes text default null,
  p_awarded_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.rfx_lane_vendors%rowtype;
  v_existing public.rfx_award_operations%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_role text := lower(btrim(coalesce(p_award_role, 'primary')));
  v_reason text;
  v_notes text := nullif(btrim(coalesce(p_award_notes, '')), '');
  v_fingerprint text;
begin
  if nullif(btrim(coalesce(p_owner_email, '')), '') is null then
    raise exception 'RFx award owner is required.';
  end if;
  if p_operation_id is null then
    raise exception 'RFx award operation id is required.';
  end if;
  if v_role not in ('primary', 'backup') then
    raise exception 'RFx award role must be primary or backup.';
  end if;

  v_reason := coalesce(
    nullif(btrim(coalesce(p_award_reason, '')), ''),
    case when v_role = 'primary' then 'Primary procurement award' else 'Backup carrier' end
  );
  v_fingerprint := md5(concat_ws('|', p_rfx_lane_vendor_id::text, v_role, v_reason, coalesce(v_notes, '')));

  -- Serialize equal operation ids before checking their durable receipt.
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_owner_email)) || ':' || p_operation_id::text, 0));

  select * into v_existing
  from public.rfx_award_operations
  where owner_email = lower(btrim(p_owner_email))
    and operation_id = p_operation_id;

  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      raise exception 'RFx award operation id was already used with a different payload.';
    end if;
    return jsonb_set(v_existing.result, '{idempotent}', 'true'::jsonb, true);
  end if;

  select invitation.* into v_invitation
  from public.rfx_lane_vendors invitation
  join public.rfx_events event on event.id = invitation.rfx_event_id
  where invitation.id = p_rfx_lane_vendor_id
    and lower(event.owner_email) = lower(btrim(p_owner_email))
  for update of invitation;

  if not found then
    raise exception 'RFx invitation was not found in this workspace.';
  end if;
  if v_invitation.bid_rate is null then
    raise exception 'A carrier bid rate is required before awarding.';
  end if;

  -- A lane lock prevents two distinct operation ids from racing for primary.
  perform 1
  from public.rfx_lane_vendors
  where rfx_lane_id = v_invitation.rfx_lane_id
  order by id
  for update;

  v_before := to_jsonb(v_invitation);

  if v_invitation.award_role = v_role
     and coalesce(v_invitation.award_reason, '') = v_reason
     and coalesce(v_invitation.award_notes, '') = coalesce(v_notes, '') then
    v_result := jsonb_build_object(
      'invitation_id', v_invitation.id,
      'award_role', v_role,
      'before', v_before,
      'idempotent', true
    );
  else
    if v_role = 'primary' then
      update public.rate_staging staging
      set rfx_bid_outcome = 'not_awarded', updated_at = v_now
      from public.rfx_lane_vendors previous
      where previous.rfx_lane_id = v_invitation.rfx_lane_id
        and previous.award_role = 'primary'
        and previous.id <> v_invitation.id
        and previous.bid_rate_staging_id = staging.id;

      update public.rfx_lane_vendors
      set award_role = null,
          award_reason = null,
          award_notes = null,
          awarded_at = null,
          awarded_by = null,
          updated_at = v_now
      where rfx_lane_id = v_invitation.rfx_lane_id
        and award_role = 'primary'
        and id <> v_invitation.id;
    end if;

    update public.rfx_lane_vendors
    set award_role = v_role,
        award_reason = v_reason,
        award_notes = v_notes,
        awarded_at = v_now,
        awarded_by = nullif(btrim(coalesce(p_awarded_by, '')), ''),
        invitation_status = case when v_role = 'primary' then 'awarded' else 'quoted' end,
        updated_at = v_now
    where id = v_invitation.id;

    update public.rate_staging
    set rfx_bid_outcome = case when v_role = 'primary' then 'awarded' else 'backup' end,
        updated_at = v_now
    where id = v_invitation.bid_rate_staging_id;

    v_result := jsonb_build_object(
      'invitation_id', v_invitation.id,
      'award_role', v_role,
      'before', v_before,
      'idempotent', false
    );
  end if;

  insert into public.rfx_award_operations (
    owner_email, operation_id, rfx_lane_vendor_id, payload_fingerprint, result, completed_at
  ) values (
    lower(btrim(p_owner_email)), p_operation_id, v_invitation.id, v_fingerprint, v_result, v_now
  );

  return v_result;
end;
$$;

revoke all on table public.rfx_award_operations from public, anon, authenticated;
revoke all on function public.rateware_award_rfx_lane_vendor(text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant select, insert on table public.rfx_award_operations to service_role;
grant execute on function public.rateware_award_rfx_lane_vendor(text, uuid, uuid, text, text, text, text) to service_role;

