alter table public.raw_uploads
  add column if not exists interpretation_audit jsonb not null default '{}'::jsonb,
  add column if not exists audit_status text,
  add column if not exists audit_warnings text[] not null default '{}',
  add column if not exists expected_rate_rows integer,
  add column if not exists interpreted_rate_rows integer,
  add column if not exists reprocess_count integer not null default 0,
  add column if not exists last_reprocessed_at timestamptz;

alter table public.raw_uploads
  drop constraint if exists raw_uploads_audit_status_check;

alter table public.raw_uploads
  add constraint raw_uploads_audit_status_check
  check (audit_status is null or audit_status in ('ok', 'needs_review', 'repaired', 'failed'));

create index if not exists raw_uploads_audit_status_idx
  on public.raw_uploads (audit_status);

alter table public.rate_staging
  add column if not exists field_confidence jsonb not null default '{}'::jsonb,
  add column if not exists source_evidence jsonb not null default '{}'::jsonb,
  add column if not exists audit_flags text[] not null default '{}';

create index if not exists rate_staging_audit_flags_idx
  on public.rate_staging using gin (audit_flags);
