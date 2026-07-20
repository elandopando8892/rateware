-- Sprint 5: Ratebook version control.
-- Published books are immutable carrier-facing releases. Source changes create
-- a new draft only when procurement explicitly requests a revision.

alter table public.rfx_ratebooks
  add column if not exists parent_ratebook_id uuid references public.rfx_ratebooks(id) on delete set null,
  add column if not exists source_snapshot_hash text,
  add column if not exists source_changed_at timestamptz;

-- The original Ratebook projection allowed one row per RFx package. A package
-- can now have multiple sequential releases, so uniqueness belongs to version.
alter table public.rfx_ratebooks
  drop constraint if exists rfx_ratebooks_owner_email_rfx_package_id_key;

drop index if exists public.rfx_ratebooks_owner_source_fingerprint_unique_idx;

create unique index if not exists rfx_ratebooks_owner_package_version_unique_idx
  on public.rfx_ratebooks(owner_email, rfx_package_id, version_number);

create index if not exists rfx_ratebooks_owner_package_lifecycle_idx
  on public.rfx_ratebooks(owner_email, rfx_package_id, lifecycle_status, version_number desc);

create index if not exists rfx_ratebooks_owner_source_fingerprint_idx
  on public.rfx_ratebooks(owner_email, source_fingerprint)
  where source_fingerprint is not null and btrim(source_fingerprint) <> '';

create index if not exists rfx_ratebooks_parent_idx
  on public.rfx_ratebooks(parent_ratebook_id);
