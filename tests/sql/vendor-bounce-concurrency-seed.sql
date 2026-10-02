-- Only the isolated disposable database; no production data or URLs.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
end $$;
insert into public.vendors(id,owner_email,vendor_name,primary_email,secondary_emails,tags,profile_data)
 select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'org:a','Synthetic concurrent carrier',
 'bad' || n || '@example.test',array['other@example.test'],array['email_bounce'],
 jsonb_build_object('bounced_emails',jsonb_build_array(jsonb_build_object('email','bad' || n || '@example.test')))
 from (values (100),(200)) t(n);
insert into public.email_suppression_list(id,owner_email,email,status)
 select ('00000000-0000-4000-8000-' || lpad((n+1)::text,12,'0'))::uuid,'org:a','bad' || n || '@example.test','hard_bounce'
 from (values (100),(200)) t(n);
create table public.bounce_test_updates(vendor_id uuid, table_name text);
grant insert on public.bounce_test_updates to service_role;
create function public.test_count_bounce_updates() returns trigger language plpgsql as $$
declare vendor_uuid uuid;
begin
 if tg_table_name='vendors' then vendor_uuid:=new.id;
 else select id into vendor_uuid from public.vendors where owner_email=new.owner_email and profile_data->'bounced_emails'->0->>'email'=new.email;
 end if;
 insert into public.bounce_test_updates values (vendor_uuid,tg_table_name);
 return new;
end $$;
create trigger count_vendor_updates after update on public.vendors
 for each row execute function public.test_count_bounce_updates();
create trigger count_suppression_updates after update on public.email_suppression_list
 for each row execute function public.test_count_bounce_updates();
