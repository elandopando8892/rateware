-- External TMS reference for Shipper CRM integrations.
-- The Rateware UUID remains the canonical Shipper CRM id; this value is the
-- identifier assigned by the customer's TMS (for example, Fleet Rocket).
alter table public.shippers
  add column if not exists tms_system_id text;

comment on column public.shippers.tms_system_id is
  'External TMS system identifier for integration mapping; not the Rateware UUID.';
