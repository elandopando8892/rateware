-- Prepared engine tests. Execute only after explicit human SQL authorization.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
end $$;
create function pg_temp.check_result(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
insert into public.vendors(id, owner_email, vendor_name, primary_email, secondary_emails, tags, profile_data)
values ('00000000-0000-4000-8000-000000000001', 'org:a', 'Synthetic carrier', 'bad@example.test',
 array[' BAD@example.test ', 'other@example.test', 'other@example.test'], array['keep','email_bounce','later'],
 '{"note":"preserve","bounced_emails":[{"email":"bad@example.test","reason":"5.1.1"}]}');
insert into public.email_suppression_list(id,owner_email,email,status)
 values('00000000-0000-4000-8000-000000000003','org:a','bad@example.test','hard_bounce');
select pg_temp.check_result(not has_function_privilege('anon', 'public.resolve_vendor_email_bounce(text,uuid,text,text,uuid)', 'execute'), 'anon denied');
select pg_temp.check_result(not has_function_privilege('authenticated', 'public.resolve_vendor_email_bounce(text,uuid,text,text,uuid)', 'execute'), 'authenticated denied');
select pg_temp.check_result(not has_table_privilege('authenticated', 'public.vendor_email_bounce_resolutions', 'select'), 'private receipts');

-- Actual service_role call on the PostgreSQL engine; its updates are granted explicitly.
set local role service_role;
select public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001',
 'bad@example.test','good@example.test','00000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.check_result((select primary_email='good@example.test' and secondary_emails=array['other@example.test']
 and tags=array['keep','later'] and profile_data->>'note'='preserve'
 and profile_data->'bounced_emails'->0->>'resolved_at' is not null from public.vendors), 'contacts/bounce preserved');
select pg_temp.check_result((select resolved_at is not null and replacement_email='good@example.test' from public.email_suppression_list), 'suppression committed');
select pg_temp.check_result((select count(*)=1 from public.vendor_email_bounce_resolutions), 'one receipt');

do $$ declare before_vendor jsonb; before_suppression jsonb; reply jsonb;
begin
 select to_jsonb(v) into before_vendor from public.vendors v;
 select to_jsonb(s) into before_suppression from public.email_suppression_list s;
 reply := public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001','bad@example.test','good@example.test','00000000-0000-4000-8000-000000000002');
 perform pg_temp.check_result((reply->>'replayed')::boolean, 'same operation replay');
 perform pg_temp.check_result(before_vendor=(select to_jsonb(v) from public.vendors v) and before_suppression=(select to_jsonb(s) from public.email_suppression_list s), 'replay does not update');
 begin
  perform public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001','bad@example.test','different@example.test','00000000-0000-4000-8000-000000000002');
  raise exception 'Expected operation conflict';
 exception when others then if sqlerrm <> 'bounce_operation_conflict' then raise; end if; end;
 begin
  perform public.resolve_vendor_email_bounce('org:foreign','00000000-0000-4000-8000-000000000001','bad@example.test','good@example.test','00000000-0000-4000-8000-000000000004');
  raise exception 'Expected foreign owner rejection';
 exception when others then if sqlerrm <> 'bounce_vendor_not_found' then raise; end if; end;
 perform pg_temp.check_result(before_vendor=(select to_jsonb(v) from public.vendors v), 'denials do not update');
end $$;

-- A new failure must not be silently closed by the old receipt.
update public.vendors set profile_data=jsonb_set(profile_data,'{bounced_emails}','[{"email":"bad@example.test","detected_at":"2026-10-02T00:00:00Z"}]'), tags=array['keep','email_bounce'];
update public.email_suppression_list set resolved_at=null;
do $$ begin
 begin
  perform public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001','bad@example.test','good@example.test','00000000-0000-4000-8000-000000000002');
  raise exception 'Expected stale receipt rejection';
 exception when others then if sqlerrm <> 'bounce_resolution_state_changed' then raise; end if; end;
 perform pg_temp.check_result((select resolved_at is null from public.email_suppression_list), 'new bounce still blocked');
end $$;

-- Force an exception after the vendor UPDATE, before suppression/receipt completion.
create function public.test_reject_suppression() returns trigger language plpgsql as $$
begin raise exception 'synthetic_suppression_failure'; end $$;
create trigger test_reject_suppression before update on public.email_suppression_list
 for each row execute function public.test_reject_suppression();
do $$ declare before_vendor jsonb; before_suppression jsonb; before_receipts bigint;
begin
 select to_jsonb(v) into before_vendor from public.vendors v;
 select to_jsonb(s) into before_suppression from public.email_suppression_list s;
 select count(*) into before_receipts from public.vendor_email_bounce_resolutions;
 begin
  perform public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001','bad@example.test','new@example.test','00000000-0000-4000-8000-000000000005');
  raise exception 'Expected suppression error';
 exception when others then if sqlerrm <> 'synthetic_suppression_failure' then raise; end if; end;
 perform pg_temp.check_result(before_vendor=(select to_jsonb(v) from public.vendors v) and before_suppression=(select to_jsonb(s) from public.email_suppression_list s)
 and before_receipts=(select count(*) from public.vendor_email_bounce_resolutions), 'both rows and receipt rolled back');
end $$;
drop trigger test_reject_suppression on public.email_suppression_list;
drop function public.test_reject_suppression();

insert into public.email_suppression_list(id,owner_email,email,status)
 values('00000000-0000-4000-8000-000000000006','org:a','blocked@example.test','manual');
do $$ declare before_vendor jsonb;
begin
 select to_jsonb(v) into before_vendor from public.vendors v;
 begin
  perform public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000001','bad@example.test','blocked@example.test','00000000-0000-4000-8000-000000000007');
  raise exception 'Expected replacement block';
 exception when others then if sqlerrm <> 'bounce_replacement_blocked' then raise; end if; end;
 perform pg_temp.check_result(before_vendor=(select to_jsonb(v) from public.vendors v), 'blocked replacement unchanged');
end $$;

select 'PASS: contacts, suppression, receipt, replay, conflict, owner, stale receipt, rollback, blocked replacement and privileges';
rollback;
