-- Cover the only remaining populated foreign key reported by the performance advisor.
do $migration$
declare
  matched_constraint_count integer;
begin
  select count(*)
  into matched_constraint_count
  from pg_constraint constraints
  join pg_attribute attributes
    on attributes.attrelid = constraints.conrelid
   and attributes.attnum = constraints.conkey[1]
  where constraints.conname = 'whatsapp_outreach_template_mappings_outreach_template_id_fkey'
    and constraints.conrelid = to_regclass('public.whatsapp_outreach_template_mappings')
    and constraints.contype = 'f'
    and cardinality(constraints.conkey) = 1
    and attributes.attname = 'outreach_template_id';

  if matched_constraint_count <> 1 then
    raise exception 'Expected the WhatsApp outreach-template mapping foreign key, found %', matched_constraint_count;
  end if;
end;
$migration$;

create index whatsapp_template_mappings_outreach_template_fk_idx
  on public.whatsapp_outreach_template_mappings (outreach_template_id);

do $migration$
declare
  index_is_valid boolean;
begin
  select indexes.indisvalid and indexes.indisready
  into index_is_valid
  from pg_index indexes
  where indexes.indexrelid = to_regclass('public.whatsapp_template_mappings_outreach_template_fk_idx');

  if index_is_valid is distinct from true then
    raise exception 'WhatsApp outreach-template mapping index is not valid and ready';
  end if;
end;
$migration$;
