-- Strengthen the audit-evidence hash without editing the already-applied
-- shipment event ledger migration.

alter table public.rateware_shipment_creation_events
  add constraint rateware_shipment_events_request_payload_hash_format
  check (request_payload_hash ~ '^sha256:[a-f0-9]{64}$') not valid;

alter table public.rateware_shipment_creation_events
  validate constraint rateware_shipment_events_request_payload_hash_format;
