\set ON_ERROR_STOP on
do $$
begin
 if current_database()<>'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
 if to_regprocedure('public.resolve_vendor_email_bounce(text,uuid,text,text,uuid)') is not null then
  raise exception 'FAIL: rollback left the function available';
 end if;
 if (select count(*) from public.vendor_email_bounce_resolutions)<>2
  or (select count(*) from public.vendors where primary_email='good@example.test')<>2
  or (select count(*) from public.email_suppression_list where resolved_at is not null and replacement_email='good@example.test')<>2 then
  raise exception 'FAIL: rollback changed confirmed corrections or receipts';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.vendor_email_bounce_resolutions'::regclass)
  or has_table_privilege('anon','public.vendor_email_bounce_resolutions','SELECT')
  or has_table_privilege('authenticated','public.vendor_email_bounce_resolutions','SELECT') then
  raise exception 'FAIL: rollback exposed private receipts';
 end if;
end $$;
select 'PASS: migration rollback removes only the RPC and preserves corrections, private receipts and RLS';
