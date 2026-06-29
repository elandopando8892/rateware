alter table public.vendors
  add column if not exists profile_data jsonb not null default '{}'::jsonb;

create index if not exists vendors_profile_data_idx
  on public.vendors using gin (profile_data);
