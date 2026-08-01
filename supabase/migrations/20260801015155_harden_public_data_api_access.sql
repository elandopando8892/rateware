-- Rateware authenticates application users with Kinde inside the Edge Functions.
-- The browser does not use Supabase Data API tables directly, so application data
-- must not be readable or writable with the public anon/authenticated roles.
-- Edge Functions use the service role and remain the only data access boundary.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

-- Keep RLS enabled as defense in depth for every current public table. The
-- application authorization predicate remains in the Kinde-authenticated API;
-- revoking Data API table privileges prevents bypassing that boundary entirely.
do $$
declare
  table_row record;
begin
  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_row.schemaname,
      table_row.tablename
    );
  end loop;
end
$$;
