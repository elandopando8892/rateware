-- Keep the FCM RateBook receipt ledger append-only for the receiver role.
revoke all on table public.fcm_ratebook_receipts from service_role;
grant select, insert on table public.fcm_ratebook_receipts to service_role;
