-- The claim function previously returned `sending` after its own update, so
-- this exact synthetic probe never reached Gmail. Reopen only that claim.
update public.website_lead_intakes
set notification_status='received', notification_claim_token=null,
    notification_claimed_at=null, updated_at=now()
where source_site='holding'
  and idempotency_key='carrier-proof-20260923-1057'
  and lead->>'company'='PRUEBA TÉCNICA - NO COMERCIALIZAR'
  and notification_status='sending'
  and notification_message_id is null
  and last_error is null;
