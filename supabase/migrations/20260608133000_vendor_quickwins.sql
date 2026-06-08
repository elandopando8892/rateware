alter table public.vendors
  add column if not exists tags text[] not null default '{}',
  add column if not exists coverage_notes text;

create index if not exists vendors_tags_idx on public.vendors using gin (tags);
