-- Intake data-quality: give staged rate rows a place to keep the raw carrier
-- signal (name or contact email) separate from the resolved carrier domain.
--
-- Root cause of the unmatched-vendor gap (see
-- docs/unmatched-carriers-analysis-2026-07-02.md): interpret/import put the
-- carrier *name* (e.g. "transportes") and *personal emails* (gmail.com) into
-- vendor_domain, which is meant to hold a real carrier domain only. That both
-- breaks matching and manufactures junk "carriers".
--
-- vendor_domain will now hold only real carrier domains; the raw signal is
-- preserved here so nothing is lost and name-based matching stays possible.
alter table public.rate_staging
  add column if not exists vendor_reference text;

comment on column public.rate_staging.vendor_reference is
  'Raw carrier signal from intake (name or contact email) when it is not a usable carrier domain. vendor_domain holds only real carrier domains.';
