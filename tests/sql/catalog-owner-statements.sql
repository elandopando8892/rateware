-- Native INSERT/PATCH-equivalent statements. Transport/JWT/RLS are separately scoped.
set role service_role;
insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata,active)
values ('rateware_manual_catalog','config','Existing','Single','{"owner_email":"org:a","note":"original"}',false),
       ('rateware_manual_catalog','config','Legacy','Single','{}',true),
       ('rateware_seed','config','Existing','Single','{}',true);

do $$ declare affected integer; original jsonb;
begin
  select to_jsonb(t) into original from public.rateware_catalog_items t where source='rateware_manual_catalog' and raw_value='Existing';
  insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata)
  values ('rateware_manual_catalog','config','Existing','Single','{"owner_email":"org:b","note":"attack"}')
  on conflict (source,category,raw_value,normalized_value) do nothing;
  get diagnostics affected = row_count;
  perform public.catalog_owner_assert(affected=0, 'foreign INSERT collision changes zero rows');
  update public.rateware_catalog_items set metadata='{"owner_email":"org:b","note":"attack"}',active=true
  where source='rateware_manual_catalog' and category='config' and raw_value='Existing' and normalized_value='Single'
    and metadata->>'owner_email'='org:b';
  get diagnostics affected = row_count;
  perform public.catalog_owner_assert(affected=0, 'foreign PATCH changes zero rows');
  perform public.catalog_owner_assert(original=(select to_jsonb(t) from public.rateware_catalog_items t where source='rateware_manual_catalog' and raw_value='Existing'), 'foreign save preserves owner and entire existing row');
  update public.rateware_catalog_items set active=true,metadata='{"owner_email":"org:a","note":"changed"}'
  where source='rateware_manual_catalog' and category='config' and raw_value='Existing' and normalized_value='Single'
    and metadata->>'owner_email'='org:a';
  get diagnostics affected = row_count;
  perform public.catalog_owner_assert(affected=1, 'own PATCH reactivates one historical row');
  perform public.catalog_owner_assert((select active and metadata->>'note'='changed' from public.rateware_catalog_items where source='rateware_manual_catalog' and raw_value='Existing'), 'own patch retains canonical key and records note');
  update public.rateware_catalog_items set active=false where source='rateware_manual_catalog' and raw_value='Existing' and metadata->>'owner_email'='org:b';
  get diagnostics affected = row_count;
  perform public.catalog_owner_assert(affected=0, 'foreign archive changes zero rows');
  update public.rateware_catalog_items set metadata='{"owner_email":"org:a"}' where source='rateware_manual_catalog' and raw_value='Legacy' and metadata->>'owner_email'='org:a';
  get diagnostics affected = row_count;
  perform public.catalog_owner_assert(affected=0, 'ownerless manual row cannot be claimed');
  perform public.catalog_owner_assert((select active and metadata='{}'::jsonb from public.rateware_catalog_items where source='rateware_seed' and raw_value='Existing'), 'reference row unaffected');
end $$;

-- Response-loss retry: the second INSERT is ignored; native uniqueness keeps one ID.
insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata)
values ('rateware_manual_catalog','config','Retry','Single','{"owner_email":"org:a"}')
on conflict (source,category,raw_value,normalized_value) do nothing;
insert into public.rateware_catalog_items(source,category,raw_value,normalized_value,metadata)
values ('rateware_manual_catalog','config','Retry','Single','{"owner_email":"org:a"}')
on conflict (source,category,raw_value,normalized_value) do nothing;
select public.catalog_owner_assert((select count(*)=1 from public.rateware_catalog_items where raw_value='Retry'), 'retry retains a single row');
select public.catalog_owner_assert((select count(*)=1 from public.catalog_owner_mutations m join public.rateware_catalog_items t on t.id=m.row_id where t.raw_value='Retry' and m.operation='INSERT'), 'retry does not fire another INSERT effect');

-- A failed request in the outer layer cannot roll back the prior HTTP write;
-- do not claim transactional audit behavior from this statement test.
