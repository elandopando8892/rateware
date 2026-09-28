-- The RETURNS TABLE output variable also has this name. Qualify the column so
-- both ordinary website leads and carrier submissions can claim one notice.
create or replace function public.website_lead_intake_claim_notification(p_intake_id uuid, p_claim_token uuid)
returns table (notification_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.website_lead_intakes as i
  set notification_status = 'sending', notification_claim_token = p_claim_token,
      notification_claimed_at = now(), updated_at = now(), last_error = null
  where i.id = p_intake_id and i.notification_status in ('received', 'failed');

  return query
  select i.notification_status
  from public.website_lead_intakes i
  where i.id = p_intake_id;
end;
$$;
