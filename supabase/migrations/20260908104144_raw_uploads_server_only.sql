-- CANDIDATE ONLY. Requires explicit deployment approval and backend access review.
-- Source files stay in place. Rateware uses its authorized service-side gateway.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'raw-uploads' and public = false)
     or not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity) then
    raise exception 'RAW_STORAGE_PREFLIGHT: private bucket and enabled RLS required';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls)
     or not has_schema_privilege('service_role', 'storage', 'USAGE')
     or not has_table_privilege('service_role', 'storage.objects', 'SELECT')
     or not has_table_privilege('service_role', 'storage.objects', 'INSERT') then
    raise exception 'RAW_STORAGE_PREFLIGHT: existing service access must be verified';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'authenticated users can read raw source files'
      and cmd = 'SELECT' and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual = '(bucket_id = ''raw-uploads''::text)' and with_check is null
  ) or not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'authenticated users can upload raw source files'
      and cmd = 'INSERT' and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and qual is null and with_check = '(bucket_id = ''raw-uploads''::text)'
  ) then
    raise exception 'RAW_STORAGE_PREFLIGHT: policy drift; review before applying';
  end if;
end;
$$;

-- Restrictive AND fence survives an unrelated future permissive policy.
-- It does not grant access to any other bucket. Their existing policies remain.
create policy raw_uploads_server_only on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'raw-uploads')
  with check (bucket_id <> 'raw-uploads');

drop policy "authenticated users can read raw source files" on storage.objects;
drop policy "authenticated users can upload raw source files" on storage.objects;

commit;
