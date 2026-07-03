alter table public.vendor_segments
  add column if not exists owner_user_id text,
  add column if not exists owner_email text,
  add column if not exists segment_type text not null default 'dynamic',
  add column if not exists vendor_ids uuid[] not null default '{}';

create index if not exists vendor_segments_owner_email_idx
  on public.vendor_segments (owner_email, created_at desc);

create index if not exists vendor_segments_vendor_ids_idx
  on public.vendor_segments using gin (vendor_ids);
