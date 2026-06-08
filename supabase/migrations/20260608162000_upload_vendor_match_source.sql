alter table public.raw_uploads
  add column if not exists vendor_match_source text
  check (vendor_match_source in ('manual', 'auto'));
