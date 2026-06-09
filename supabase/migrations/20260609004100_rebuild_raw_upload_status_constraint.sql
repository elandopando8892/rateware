do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.raw_uploads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.raw_uploads drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.raw_uploads
  add constraint raw_uploads_status_check
  check (status in ('uploaded', 'staged', 'failed', 'archived'));
