-- Public buckets serve known object URLs without a SELECT policy. Remove the
-- broad policy that also lets browser clients enumerate every carrier logo.
do $migration$
declare
  matching_bucket_count integer;
  matching_policy_count integer;
begin
  select count(*)
  into matching_bucket_count
  from storage.buckets
  where id = 'vendor-logos'
    and public is true;

  if matching_bucket_count <> 1 then
    raise exception 'Expected vendor-logos to exist as one public bucket, found %', matching_bucket_count;
  end if;

  select count(*)
  into matching_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'public can read vendor logos'
    and cmd = 'SELECT'
    and 'public' = any(roles)
    and coalesce(qual, '') = '(bucket_id = ''vendor-logos''::text)';

  if matching_policy_count <> 1 then
    raise exception 'Expected one broad vendor-logo listing policy, found %', matching_policy_count;
  end if;

  drop policy "public can read vendor logos" on storage.objects;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname = 'public can read vendor logos'
        or coalesce(qual, '') like '%vendor-logos%'
      )
      and cmd = 'SELECT'
  ) then
    raise exception 'A public vendor-logo listing policy remains';
  end if;
end;
$migration$;
