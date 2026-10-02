\set ON_ERROR_STOP on
do $$ declare n integer; vendor_uuid uuid;
begin
 if current_database()<>'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
 foreach n in array array[100,200] loop
  vendor_uuid:=('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
  if (select primary_email from public.vendors where id=vendor_uuid)<>'good@example.test'
   or (select count(*) from public.vendor_email_bounce_resolutions where vendor_id=vendor_uuid)<>1
   or (select count(*) from public.bounce_test_updates where vendor_id=vendor_uuid and table_name='vendors')<>1
   or (select count(*) from public.bounce_test_updates where vendor_id=vendor_uuid and table_name='email_suppression_list')<>1
   or not exists(select 1 from public.email_suppression_list where owner_email='org:a' and email='bad' || n || '@example.test' and resolved_at is not null and replacement_email='good@example.test') then
   raise exception 'FAIL: concurrent replay/decision for %',n;
  end if;
 end loop;
end $$;
select 'PASS: two overlapping connections, one contact update, one suppression update and one receipt per scenario';
