set application_name='catalog-owner-first';
set role service_role;
begin;
insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata,active)
values ('rateware_manual_catalog','config',:'alias_value','Single','{"owner_email":"org:a"}',true)
on conflict (source,category,raw_value,normalized_value) do nothing;
-- The runner requires observing the peer blocked by this transaction.
select pg_sleep(6);
commit;
