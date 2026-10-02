-- Requires explicit human authorization. Disable the Edge action first.
-- Preserve confirmed corrections and the private operation receipts.
begin;
drop function public.resolve_vendor_email_bounce(text, uuid, text, text, uuid);
commit;
