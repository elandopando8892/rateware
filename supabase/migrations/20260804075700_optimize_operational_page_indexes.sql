create index if not exists vendors_owner_created_id_idx
  on public.vendors (owner_email, created_at desc, id desc);

create index if not exists shippers_owner_updated_id_idx
  on public.shippers (owner_email, updated_at desc, id desc)
  where status <> 'archived';

create index if not exists rate_staging_owner_approved_rateware_page_idx
  on public.rate_staging (owner_email, quote_date desc nulls last, created_at desc, id desc)
  where status = 'approved';

analyze public.vendors;
analyze public.shippers;
analyze public.rate_staging;
