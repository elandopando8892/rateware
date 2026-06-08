create table if not exists public.vendor_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  segment_name text not null,
  description text,
  tags text[] not null default '{}',
  status text,
  preferred_channel text,
  notes text
);

create index if not exists vendor_segments_created_at_idx on public.vendor_segments (created_at desc);
create index if not exists vendor_segments_tags_idx on public.vendor_segments using gin (tags);

alter table public.vendor_segments enable row level security;

create policy "authenticated users can read vendor segments"
  on public.vendor_segments for select
  to authenticated
  using (true);
