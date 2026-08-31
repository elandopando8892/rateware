-- Invitation-wave review state reuses the append-only SaaS audit ledger.
-- This additive index supports latest-review lookup by owner and RFx.
create index if not exists saas_audit_log_rfx_carrier_review_idx
  on public.saas_audit_log (owner_email, entity_type, created_at desc)
  where entity_type = 'rfx_event_carrier_review';
