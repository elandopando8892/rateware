-- Supabase is on the Pro plan again (2026-09-25): BI rate facts return to
-- PostgreSQL. The 2026-09-06 source-online activation disabled these writers
-- when BI moved to Turso, and the 2026-09-07 retirement emptied the table.
-- On a clean replay these triggers are already enabled, so this is a no-op.
set local lock_timeout = '5s';
alter table public.rate_staging enable trigger rateware_bi_rate_fact_sync;
alter table public.vendors enable trigger rateware_bi_vendor_dimension_sync;
alter table public.vendors enable trigger rateware_bi_vendor_fact_sync;
alter table public.rateware_bi_rate_facts enable trigger rateware_bi_fact_vendor_reference_sync;
