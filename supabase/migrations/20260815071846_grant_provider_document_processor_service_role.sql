-- Recovered from production 2026-08-18. Applied directly to rateware-prod on
-- 2026-08-15 without a source commit; reconstructed here verbatim from
-- supabase_migrations.schema_migrations so branch history matches the remote.
grant select, update on table public.provider_entity_document_ingestions to service_role;
grant insert on table public.provider_entity_document_ingestion_events to service_role;
grant select, insert on table public.provider_legal_entity_document_assets to service_role;
