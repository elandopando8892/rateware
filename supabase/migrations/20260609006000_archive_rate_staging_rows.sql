do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.rate_staging'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.rate_staging drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.rate_staging
  add constraint rate_staging_status_check
  check (status in ('pending_review', 'approved', 'rejected', 'archived'));
