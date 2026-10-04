set role service_role;
select public.catalog_owner_assert((select count(*)=1 from public.rateware_catalog_items where raw_value=:'alias_value'), 'concurrent requests retain exactly one alias');
select public.catalog_owner_assert((select metadata->>'owner_email'='org:a' from public.rateware_catalog_items where raw_value=:'alias_value'), 'concurrent request does not transfer owner');
select public.catalog_owner_assert((select count(*)=1 from public.catalog_owner_mutations m join public.rateware_catalog_items t on t.id=m.row_id where raw_value=:'alias_value' and operation='INSERT'), 'concurrent duplicate performs one INSERT');
select public.catalog_owner_assert((select count(*)=(:'expected_updates')::int from public.catalog_owner_mutations m join public.rateware_catalog_items t on t.id=m.row_id where raw_value=:'alias_value' and operation='UPDATE'), 'only a matching owner performs the UPDATE');
