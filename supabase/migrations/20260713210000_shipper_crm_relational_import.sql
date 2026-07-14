-- Preserve source-system identities so a Shipper CRM workbook can be safely re-imported.
-- External IDs are scoped by workspace through owner_email on every table.

alter table public.shippers
  add column if not exists external_source text,
  add column if not exists external_source_id text;

alter table public.shipper_contacts
  add column if not exists external_source text,
  add column if not exists external_source_id text;

alter table public.shipper_opportunities
  add column if not exists external_source text,
  add column if not exists external_source_id text;

create unique index if not exists shippers_owner_external_source_unique_idx
  on public.shippers (owner_email, external_source, external_source_id)
  where external_source is not null
    and btrim(external_source) <> ''
    and external_source_id is not null
    and btrim(external_source_id) <> '';

create unique index if not exists shipper_contacts_owner_external_source_unique_idx
  on public.shipper_contacts (owner_email, external_source, external_source_id)
  where external_source is not null
    and btrim(external_source) <> ''
    and external_source_id is not null
    and btrim(external_source_id) <> '';

create unique index if not exists shipper_opportunities_owner_external_source_unique_idx
  on public.shipper_opportunities (owner_email, external_source, external_source_id)
  where external_source is not null
    and btrim(external_source) <> ''
    and external_source_id is not null
    and btrim(external_source_id) <> '';

create index if not exists shippers_owner_external_source_idx
  on public.shippers (owner_email, external_source, external_source_id);
create index if not exists shipper_contacts_owner_external_source_idx
  on public.shipper_contacts (owner_email, external_source, external_source_id);
create index if not exists shipper_opportunities_owner_external_source_idx
  on public.shipper_opportunities (owner_email, external_source, external_source_id);
