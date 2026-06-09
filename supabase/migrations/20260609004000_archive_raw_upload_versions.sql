alter table public.raw_uploads
  drop constraint if exists raw_uploads_status_check;

alter table public.raw_uploads
  add constraint raw_uploads_status_check
  check (status in ('uploaded', 'staged', 'failed', 'archived'));

create index if not exists raw_uploads_archived_status_idx
  on public.raw_uploads (status, created_at desc);
