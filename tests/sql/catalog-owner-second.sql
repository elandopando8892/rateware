set application_name='catalog-owner-second';
set role service_role;
insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata,active)
values ('rateware_manual_catalog','config',:'alias_value','Single',jsonb_build_object('owner_email',:'peer_owner'),true)
on conflict (source,category,raw_value,normalized_value) do nothing;
-- Separate autocommit statement, like the handler's second HTTP request.
update public.rateware_catalog_items set active=true,metadata=jsonb_build_object('owner_email',:'peer_owner','note','peer')
where source='rateware_manual_catalog' and category='config' and raw_value=:'alias_value' and normalized_value='Single'
  and metadata->>'owner_email'=:'peer_owner';
