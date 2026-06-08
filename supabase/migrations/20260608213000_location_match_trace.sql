alter table public.rate_staging
  add column if not exists origin_match_reason text,
  add column if not exists destination_match_reason text,
  add column if not exists origin_location_candidates jsonb not null default '[]'::jsonb,
  add column if not exists destination_location_candidates jsonb not null default '[]'::jsonb;
