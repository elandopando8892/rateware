create or replace function public.protect_outreach_delivery_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'drafted'
    and old.status in (
      'queued', 'sending', 'sent', 'delivered', 'read', 'replied',
      'failed', 'delivery_unknown', 'bounced', 'manual_sent', 'archived'
    )
  then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_outreach_delivery_state() from public, anon, authenticated;

drop trigger if exists protect_outreach_delivery_state_trigger on public.outreach_messages;
create trigger protect_outreach_delivery_state_trigger
before update on public.outreach_messages
for each row
execute function public.protect_outreach_delivery_state();

-- Repair rows with durable Gmail acceptance evidence that were later reset by
-- a stale draft regeneration request.
update public.outreach_messages
set status = 'sent',
    delivery_status = 'sent',
    provider_response_status = coalesce(nullif(provider_response_status, ''), 'accepted'),
    updated_at = greatest(updated_at, coalesce(send_completed_at, sent_at, updated_at))
where status = 'drafted'
  and channel = 'email'
  and provider = 'gmail'
  and provider_message_id is not null
  and sent_at is not null
  and send_completed_at is not null
  and delivery_status = 'sent';

comment on function public.protect_outreach_delivery_state() is
  'Prevents stale draft regeneration from overwriting an outreach delivery claim or completed provider result.';
