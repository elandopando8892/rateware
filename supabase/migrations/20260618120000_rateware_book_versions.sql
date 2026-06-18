create table if not exists public.rateware_book_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  name text not null,
  description text,
  filter_summary jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  rows_snapshot jsonb not null default '[]'::jsonb
);

create index if not exists rateware_book_versions_owner_created_idx
  on public.rateware_book_versions (owner_email, created_at desc);

alter table public.rateware_book_versions enable row level security;

create policy "authenticated users can read rateware book versions"
  on public.rateware_book_versions for select
  to authenticated
  using (true);

create policy "authenticated users can create rateware book versions"
  on public.rateware_book_versions for insert
  to authenticated
  with check (true);
