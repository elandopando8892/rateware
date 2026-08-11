-- Retain the migration-owned rate index and the constraint-owned WhatsApp
-- index. Their duplicates add write amplification without changing query plans.
do $migration$
declare
  rate_indexes_equivalent boolean;
  whatsapp_indexes_equivalent boolean;
  whatsapp_constraint_count integer;
begin
  if to_regclass('public.rate_staging_vendor_domain_idx') is null then
    raise exception 'Canonical rate staging vendor index is missing';
  end if;

  if to_regclass('public.idx_rate_staging_vendor') is not null then
    select
      keeper.indrelid = duplicate.indrelid
      and keeper.indkey = duplicate.indkey
      and keeper.indclass = duplicate.indclass
      and keeper.indcollation = duplicate.indcollation
      and keeper.indoption = duplicate.indoption
      and keeper.indexprs is not distinct from duplicate.indexprs
      and keeper.indpred is not distinct from duplicate.indpred
      and keeper.indisunique = duplicate.indisunique
      and keeper.indisvalid
      and duplicate.indisvalid
    into rate_indexes_equivalent
    from pg_index keeper
    join pg_index duplicate on true
    where keeper.indexrelid = to_regclass('public.rate_staging_vendor_domain_idx')
      and duplicate.indexrelid = to_regclass('public.idx_rate_staging_vendor');

    if coalesce(rate_indexes_equivalent, false) is not true then
      raise exception 'Rate staging vendor indexes are no longer equivalent';
    end if;

    drop index public.idx_rate_staging_vendor;
  end if;

  if to_regclass('public.whatsapp_business_connections_owner_email_provider_connecti_key') is null then
    raise exception 'Canonical WhatsApp connection index is missing';
  end if;

  if to_regclass('public.whatsapp_business_connections_unique_idx') is not null then
    select
      keeper.indrelid = duplicate.indrelid
      and keeper.indkey = duplicate.indkey
      and keeper.indclass = duplicate.indclass
      and keeper.indcollation = duplicate.indcollation
      and keeper.indoption = duplicate.indoption
      and keeper.indexprs is not distinct from duplicate.indexprs
      and keeper.indpred is not distinct from duplicate.indpred
      and keeper.indisunique = duplicate.indisunique
      and keeper.indisvalid
      and duplicate.indisvalid
    into whatsapp_indexes_equivalent
    from pg_index keeper
    join pg_index duplicate on true
    where keeper.indexrelid = to_regclass('public.whatsapp_business_connections_owner_email_provider_connecti_key')
      and duplicate.indexrelid = to_regclass('public.whatsapp_business_connections_unique_idx');

    if coalesce(whatsapp_indexes_equivalent, false) is not true then
      raise exception 'WhatsApp connection indexes are no longer equivalent';
    end if;

    drop index public.whatsapp_business_connections_unique_idx;
  end if;

  select count(*)
  into whatsapp_constraint_count
  from pg_constraint
  where conindid = to_regclass('public.whatsapp_business_connections_owner_email_provider_connecti_key')
    and contype = 'u';

  if whatsapp_constraint_count <> 1 then
    raise exception 'Expected the retained WhatsApp index to back one UNIQUE constraint, found %', whatsapp_constraint_count;
  end if;

  if to_regclass('public.rate_staging_vendor_domain_idx') is null
    or to_regclass('public.whatsapp_business_connections_owner_email_provider_connecti_key') is null then
    raise exception 'A canonical index was removed unexpectedly';
  end if;

  if to_regclass('public.idx_rate_staging_vendor') is not null
    or to_regclass('public.whatsapp_business_connections_unique_idx') is not null then
    raise exception 'A duplicate index remains after cleanup';
  end if;
end;
$migration$;
