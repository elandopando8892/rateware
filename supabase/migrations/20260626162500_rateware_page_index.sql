create index if not exists rate_staging_approved_rateware_page_idx
  on public.rate_staging (quote_date desc nulls last, created_at desc, id desc)
  where status = 'approved';
