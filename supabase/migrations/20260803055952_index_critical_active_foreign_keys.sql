-- Cover the active foreign keys on the two largest operational tables. These
-- indexes support joins and prevent full child-table scans during parent-row
-- updates or deletes.
do $migration$
declare
  matched_constraint_count integer;
begin
  select count(*)
  into matched_constraint_count
  from (
    values
      ('rate_staging_interpretation_job_id_fkey', 'rate_staging', 'interpretation_job_id'),
      ('outreach_messages_template_id_fkey', 'outreach_messages', 'template_id'),
      ('outreach_messages_rfx_event_id_fkey', 'outreach_messages', 'rfx_event_id'),
      ('outreach_messages_rfx_lane_id_fkey', 'outreach_messages', 'rfx_lane_id'),
      ('outreach_messages_rfx_lane_vendor_id_fkey', 'outreach_messages', 'rfx_lane_vendor_id')
  ) as targets(constraint_name, table_name, column_name)
  join pg_constraint constraints
    on constraints.conname = targets.constraint_name
   and constraints.conrelid = to_regclass(format('public.%I', targets.table_name))
   and constraints.contype = 'f'
   and cardinality(constraints.conkey) = 1
  join pg_attribute attributes
    on attributes.attrelid = constraints.conrelid
   and attributes.attnum = constraints.conkey[1]
   and attributes.attname = targets.column_name;

  if matched_constraint_count <> 5 then
    raise exception 'Expected five active foreign keys before indexing, found %', matched_constraint_count;
  end if;
end;
$migration$;

create index rate_staging_interpretation_job_idx
  on public.rate_staging (interpretation_job_id);

create index outreach_messages_template_fk_idx
  on public.outreach_messages (template_id);

create index outreach_messages_rfx_event_fk_idx
  on public.outreach_messages (rfx_event_id);

create index outreach_messages_rfx_lane_fk_idx
  on public.outreach_messages (rfx_lane_id);

create index outreach_messages_rfx_lane_vendor_fk_idx
  on public.outreach_messages (rfx_lane_vendor_id);

do $migration$
declare
  valid_index_count integer;
begin
  select count(*)
  into valid_index_count
  from pg_index indexes
  where indexes.indexrelid in (
    to_regclass('public.rate_staging_interpretation_job_idx'),
    to_regclass('public.outreach_messages_template_fk_idx'),
    to_regclass('public.outreach_messages_rfx_event_fk_idx'),
    to_regclass('public.outreach_messages_rfx_lane_fk_idx'),
    to_regclass('public.outreach_messages_rfx_lane_vendor_fk_idx')
  )
    and indexes.indisvalid
    and indexes.indisready;

  if valid_index_count <> 5 then
    raise exception 'Expected five valid foreign-key indexes, found %', valid_index_count;
  end if;
end;
$migration$;
