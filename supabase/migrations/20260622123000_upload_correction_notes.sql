alter table public.raw_uploads
  add column if not exists correction_note text,
  add column if not exists correction_history jsonb not null default '[]'::jsonb;

alter table public.interpretation_jobs
  add column if not exists correction_note text;
