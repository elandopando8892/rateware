alter table public.email_suppression_list
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists replacement_email text;

create index if not exists email_suppression_active_owner_email_idx
  on public.email_suppression_list (owner_email, email, status, updated_at desc)
  where resolved_at is null;
