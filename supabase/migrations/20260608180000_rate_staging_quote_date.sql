alter table public.rate_staging
  add column if not exists quote_date date;

create index if not exists rate_staging_quote_date_idx on public.rate_staging (quote_date desc);
