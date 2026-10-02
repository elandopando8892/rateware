\set ON_ERROR_STOP on
begin;
set local application_name='bounce-first';
set local statement_timeout='20s';
set local role service_role;
select public.resolve_vendor_email_bounce('org:a', :'vendor_id', :'bounced_email', 'good@example.test', :'operation_id');
select pg_sleep(10);
commit;
