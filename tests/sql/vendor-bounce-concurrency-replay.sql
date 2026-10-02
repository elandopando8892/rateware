\set ON_ERROR_STOP on
begin;
set local application_name='bounce-second';
set local statement_timeout='20s';
set local role service_role;
do $$ declare reply jsonb;
begin
 reply:=public.resolve_vendor_email_bounce('org:a','00000000-0000-4000-8000-000000000100','bad100@example.test','good@example.test','00000000-0000-4000-8000-000000000102');
 if (reply->>'replayed')::boolean is distinct from true then raise exception 'Second request did not replay'; end if;
end $$;
commit;
