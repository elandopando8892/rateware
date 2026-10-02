\set ON_ERROR_STOP on
begin;
set local application_name='bounce-second';
set local statement_timeout='20s';
set local role service_role;
do $$ begin
 begin
  perform public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000200','bad200@example.test','different@example.test','00000000-0000-4000-8000-000000000203');
  raise exception 'Second decision unexpectedly overwrote the first';
 exception when others then if sqlerrm <> 'bounce_not_unresolved' then raise; end if; end;
end $$;
commit;
