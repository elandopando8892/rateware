-- Keeps exact duplicate review scoped and responsive as Shipper Base grows.
create index if not exists shippers_owner_legal_name_active_idx
  on public.shippers (owner_email, lower(legal_name))
  where status <> 'archived';

create index if not exists shippers_owner_primary_email_active_idx
  on public.shippers (owner_email, lower(primary_contact_email))
  where status <> 'archived';
