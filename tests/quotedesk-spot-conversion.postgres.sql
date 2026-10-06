-- Prepared acceptance, NOT RUN. Apply only in the disposable fixture after human authorization.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'quotedesk_spot_fixture' then raise exception 'Disposable fixture database required'; end if;
end $$;
begin;
insert into public.shippers(id, owner_email, shipper_name) values ('00000000-0000-4000-8000-000000000001', 'org:fixture', 'Synthetic shipper');
insert into public.rfx_projects(id, owner_email, title, customer_id)
select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'org:fixture', 'Synthetic Spot', '00000000-0000-4000-8000-000000000001'::uuid
from generate_series(1,6) n;
insert into public.rfx_rfi_submissions(owner_email, project_id, updated_at, frozen_snapshot)
select 'org:fixture', id, '2026-10-06T12:00:00.123456Z', '{"account_overview":{"currency":"USD","contact":"Fixture contact"},"lanes":[{"origin_location":"Monterrey, NL","origin_country":"MX","origin_city":"Monterrey","origin_state":"NL","destination_location":"Dallas, TX","destination_country":"US","destination_place":{"city":"Dallas","state_code":"TX","country":"US","zip_prefix":"752"},"truck_type":"Tractor","trailer_requirements":"Dry Van 53","operation":"US/CA Northbound","border_crossing":"Laredo / Nuevo Laredo","average_weight":2205,"weekly_volume":2,"product":"Glass"}]}'::jsonb
from public.rfx_projects where owner_email = 'org:fixture';
set local role service_role;
update public.rfx_rfi_submissions set frozen_snapshot = jsonb_set(frozen_snapshot,
  '{account_overview,contact_email}', '"recipient@example.test"') where owner_email = 'org:fixture';
do $$
declare first_result jsonb; repeated jsonb; q uuid; count_before integer;
begin
  first_result := public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
    '00000000-0000-4000-8000-000000000001','2026-10-06T12:00:00.123456Z');
  q := (first_result #>> '{quote,id}')::uuid;
  assert first_result->>'replayed' = 'false';
  assert first_result #>> '{quote,folio}' = 'Q-1001';
  assert (select notes like '%Contacto: Fixture contact · recipient@example.test%' from public.quotedesk_quotes where id = q);
  assert (select organization_id = 'fixture' from public.saas_audit_log where entity_id = q::text);
  assert (select count(*) = 1 from public.quotedesk_quote_lanes where quote_id = q and weight_lb = 2205
    and origin_postal_code is null and destination_postal_code = '752' and weekly_volume is null
    and operation = 'US Northbound' and border_crossing = 'Nuevo Laredo / Laredo');
  update public.quotedesk_quote_lanes set all_in_rate = 1700, notes = 'Manual pricing' where quote_id = q;
  repeated := public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
    '00000000-0000-4000-8000-000000000001','2026-10-06T12:00:00.123456Z');
  assert repeated->'quote' = first_result->'quote' and repeated->>'replayed' = 'true';
  assert (select count(*) = 1 from public.quotedesk_quotes);
  assert (select all_in_rate = 1700 and notes = 'Manual pricing' from public.quotedesk_quote_lanes where quote_id = q);
  assert (select count(*) = 1 from public.saas_audit_log where actor_email = 'operator@example.test');
  begin
    perform public.quotedesk_convert_spot_request('org:other','owner','other','other@example.test',
      '00000000-0000-4000-8000-000000000001','2026-10-06T12:00:00.123456Z');
    raise exception 'Expected source isolation';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
      '00000000-0000-4000-8000-000000000001','2026-10-06T12:00:00.123455Z');
    raise exception 'Expected version conflict at microsecond precision';
  exception when sqlstate 'PT409' then null; end;
  update public.rfx_rfi_submissions set status = 'draft' where project_id = '00000000-0000-4000-8000-000000000002';
  begin
    perform public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
      '00000000-0000-4000-8000-000000000002','2026-10-06T12:00:00.123456Z');
    raise exception 'Expected submitted-only conversion';
  exception when sqlstate 'PT409' then null; end;
  update public.rfx_projects set notes = 'QuoteDesk ' || (first_result #>> '{quote,folio}') || ' · ' || q
    where id = '00000000-0000-4000-8000-000000000003';
  begin
    perform public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
      '00000000-0000-4000-8000-000000000003','2026-10-06T12:00:00.123456Z');
    raise exception 'Expected historical reconciliation';
  exception when sqlstate 'PT409' then null; end;
  select count(*) into count_before from public.quotedesk_quotes;
  update public.rfx_rfi_submissions set frozen_snapshot = jsonb_set(frozen_snapshot,'{lanes,0,weekly_volume}','0')
    where project_id = '00000000-0000-4000-8000-000000000004';
  begin
    perform public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
      '00000000-0000-4000-8000-000000000004','2026-10-06T12:00:00.123456Z');
    raise exception 'Expected invalid route rejection';
  exception when sqlstate 'PT422' then null; end;
  assert (select count(*) = count_before from public.quotedesk_quotes);
end $$;
reset role;
-- Inject a failure at every persistence stage; the late audit case follows all other writes.
create function public.fixture_fail_write() returns trigger language plpgsql as $$ begin
  if current_setting('fixture.fail_table', true) = tg_table_name then raise exception 'fixture_write_failure'; end if;
  return new;
end $$;
create trigger fixture_fail_write before insert on public.quotedesk_quotes for each row execute function public.fixture_fail_write();
create trigger fixture_fail_write before insert on public.quotedesk_quote_lanes for each row execute function public.fixture_fail_write();
create trigger fixture_fail_write before insert on public.quotedesk_spot_conversions for each row execute function public.fixture_fail_write();
create trigger fixture_fail_write before insert on public.saas_audit_log for each row execute function public.fixture_fail_write();
set local role service_role;
do $$ declare before_count integer; failed_table text; begin
  select count(*) into before_count from public.quotedesk_quotes;
  foreach failed_table in array array['quotedesk_quotes','quotedesk_quote_lanes','quotedesk_spot_conversions','saas_audit_log'] loop
  perform set_config('fixture.fail_table', failed_table, true);
  begin
    perform public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test',
      '00000000-0000-4000-8000-000000000005','2026-10-06T12:00:00.123456Z');
    raise exception 'Write fault did not occur';
  exception when raise_exception then
    if sqlerrm <> 'fixture_write_failure' then raise; end if;
  end;
  assert (select count(*) = before_count from public.quotedesk_quotes);
  assert not exists(select 1 from public.quotedesk_spot_conversions where source_project_id = '00000000-0000-4000-8000-000000000005');
  assert (select notes is null from public.rfx_projects where id = '00000000-0000-4000-8000-000000000005');
  end loop;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)','EXECUTE');
  assert not has_function_privilege('authenticated','public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)','EXECUTE');
  assert has_function_privilege('service_role','public.quotedesk_convert_spot_request(text,text,text,text,uuid,timestamptz)','EXECUTE');
  assert not has_table_privilege('authenticated','public.quotedesk_spot_conversions','SELECT');
  assert not has_table_privilege('service_role','public.quotedesk_spot_conversions','TRUNCATE');
  assert not has_table_privilege('service_role','public.quotedesk_spot_conversions','UPDATE');
end $$;
rollback;
\echo 'Sequential fixture checks passed; separate concurrent sessions remain required.'
