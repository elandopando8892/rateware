-- Operator-attested malware status for trusted operator imports.
--
-- The Entity Vault promotes a document only after a clean malware scan. That is
-- correct for untrusted portal uploads. It is disproportionate for a one-time
-- import of the company's OWN documents from a trusted operator drive, and the
-- only honest malware engine available for that import records that the file was
-- operator-attested, not machine-scanned.
--
-- This widens two checks to admit 'operator_attested' as a promote-eligible
-- malware status. It removes nothing: 'clean' still means a real clean scan, and
-- the processor accepts 'operator_attested' only for source_channel='manual'
-- imports — a portal upload still requires an actual scan. Human review is
-- unchanged; every promoted document still enters review as needs_review.

alter table public.provider_entity_document_ingestions
  drop constraint if exists provider_entity_ingestions_malware_check;
alter table public.provider_entity_document_ingestions
  add constraint provider_entity_ingestions_malware_check
  check (malware_status in ('pending','scanning','clean','infected','error','operator_attested'));

alter table public.provider_entity_document_ingestions
  drop constraint if exists provider_entity_ingestions_ready_check;
alter table public.provider_entity_document_ingestions
  add constraint provider_entity_ingestions_ready_check
  check (
    ingestion_status <> 'ready'
    or (
      ready_at is not null
      and malware_status in ('clean', 'operator_attested')
      and hash_status in ('matched', 'unavailable')
      and classification_status in ('classified', 'needs_review')
      and provider_document_asset_id is not null
    )
  );

comment on constraint provider_entity_ingestions_malware_check
  on public.provider_entity_document_ingestions is
  'malware_status vocabulary. operator_attested marks a trusted operator import that was not machine-scanned; the processor sets it only for source_channel=manual, never for portal uploads.';
