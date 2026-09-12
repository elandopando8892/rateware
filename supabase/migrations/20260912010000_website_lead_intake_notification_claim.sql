alter table public.website_lead_intakes
  drop constraint if exists website_lead_intakes_notification_status_check,
  add constraint website_lead_intakes_notification_status_check
    check (notification_status in ('received', 'sending', 'sent', 'failed', 'uncertain')),
  add column if not exists notification_claim_token uuid,
  add column if not exists notification_claimed_at timestamptz;

create or replace function public.website_lead_intake_claim_notification(p_intake_id uuid, p_claim_token uuid)
returns table (notification_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.website_lead_intakes
  set notification_status = 'sending', notification_claim_token = p_claim_token,
      notification_claimed_at = now(), updated_at = now(), last_error = null
  where id = p_intake_id and notification_status in ('received', 'failed');

  return query
  select i.notification_status
  from public.website_lead_intakes i
  where i.id = p_intake_id;
end;
$$;

create or replace function public.website_lead_intake_record_notification(
  p_intake_id uuid, p_claim_token uuid, p_status text,
  p_message_id text default null, p_thread_id text default null, p_last_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if p_status not in ('sent', 'failed', 'uncertain') then
    raise exception 'Invalid notification reconciliation state.';
  end if;
  update public.website_lead_intakes
  set notification_status = p_status,
      notification_message_id = case when p_status = 'sent' then p_message_id else notification_message_id end,
      notification_thread_id = case when p_status = 'sent' then p_thread_id else notification_thread_id end,
      last_error = p_last_error, updated_at = now()
  where id = p_intake_id and notification_status = 'sending' and notification_claim_token = p_claim_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.website_lead_intake_claim_notification(uuid, uuid) from public;
revoke all on function public.website_lead_intake_record_notification(uuid, uuid, text, text, text, text) from public;
grant execute on function public.website_lead_intake_claim_notification(uuid, uuid) to service_role;
grant execute on function public.website_lead_intake_record_notification(uuid, uuid, text, text, text, text) to service_role;

comment on column public.website_lead_intakes.notification_claim_token is
  'Opaque claim owned by one delivery attempt. Stale or uncertain deliveries require commercial reconciliation, never automatic resend.';
