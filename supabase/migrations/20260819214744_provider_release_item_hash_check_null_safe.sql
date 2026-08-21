-- `null ~ '...'` is NULL, not false, and a CHECK only rejects on false. Without an
-- explicit IS NOT NULL, dropping the column's NOT NULL let a document item carry no
-- hash at all.
delete from public.provider_onboarding_release_package_items
  where item_key='requirement:probe_doc_no_hash';

alter table public.provider_onboarding_release_package_items
  drop constraint if exists provider_release_package_items_hash_check;
alter table public.provider_onboarding_release_package_items
  add constraint provider_release_package_items_hash_check check (
    (item_kind='declared_gap' and evidence_sha256 is null)
    or (item_kind<>'declared_gap' and evidence_sha256 is not null
        and evidence_sha256 ~ '^[0-9a-f]{64}$')
  );;
