-- Distinguish a newly acquired claim from one already being sent. Returning
-- `sending` after our own update prevented every notification from starting.
create or replace function public.website_lead_intake_claim_notification(p_intake_id uuid, p_claim_token uuid)
returns table (notification_status text)
language plpgsql
security definer
set search_path = public
as $$
declare v_claimed boolean := false;
begin
  update public.website_lead_intakes as i
  set notification_status = 'sending', notification_claim_token = p_claim_token,
      notification_claimed_at = now(), updated_at = now(), last_error = null
  where i.id = p_intake_id and i.notification_status in ('received', 'failed')
  returning true into v_claimed;

  if v_claimed then
    return query select 'claimed'::text;
    return;
  end if;

  return query
  select i.notification_status
  from public.website_lead_intakes i
  where i.id = p_intake_id;
end;
$$;
