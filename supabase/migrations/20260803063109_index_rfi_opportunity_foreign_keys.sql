-- Cover populated RFI detail, demand snapshot, and Shipper CRM opportunity links.
do $migration$
declare
  matched_constraint_count integer;
begin
  select count(*)
  into matched_constraint_count
  from (
    values
      ('rfx_rfi_destinations_project_id_fkey', 'rfx_rfi_destinations', 'project_id'),
      ('rfx_rfi_origins_project_id_fkey', 'rfx_rfi_origins', 'project_id'),
      ('rfx_rfi_exception_notes_project_id_fkey', 'rfx_rfi_exception_notes', 'project_id'),
      ('rfx_rfi_submissions_magic_link_id_fkey', 'rfx_rfi_submissions', 'magic_link_id'),
      ('rfx_demand_snapshots_rfi_submission_id_fkey', 'rfx_demand_snapshots', 'rfi_submission_id'),
      ('rfx_rfi_business_rules_project_id_fkey', 'rfx_rfi_business_rules', 'project_id'),
      ('rfx_rfi_carrier_requirements_project_id_fkey', 'rfx_rfi_carrier_requirements', 'project_id'),
      ('rfx_rfi_service_requirements_project_id_fkey', 'rfx_rfi_service_requirements', 'project_id'),
      ('shipper_opportunities_rfx_project_id_fkey', 'shipper_opportunities', 'rfx_project_id')
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

  if matched_constraint_count <> 9 then
    raise exception 'Expected nine populated RFI and opportunity foreign keys, found %', matched_constraint_count;
  end if;
end;
$migration$;

create index rfx_rfi_destinations_project_fk_idx
  on public.rfx_rfi_destinations (project_id);

create index rfx_rfi_origins_project_fk_idx
  on public.rfx_rfi_origins (project_id);

create index rfx_rfi_exception_notes_project_fk_idx
  on public.rfx_rfi_exception_notes (project_id);

create index rfx_rfi_submissions_magic_link_fk_idx
  on public.rfx_rfi_submissions (magic_link_id);

create index rfx_demand_snapshots_submission_fk_idx
  on public.rfx_demand_snapshots (rfi_submission_id);

create index rfx_rfi_business_rules_project_fk_idx
  on public.rfx_rfi_business_rules (project_id);

create index rfx_rfi_carrier_requirements_project_fk_idx
  on public.rfx_rfi_carrier_requirements (project_id);

create index rfx_rfi_service_requirements_project_fk_idx
  on public.rfx_rfi_service_requirements (project_id);

create index shipper_opportunities_rfx_project_fk_idx
  on public.shipper_opportunities (rfx_project_id);

do $migration$
declare
  valid_index_count integer;
begin
  select count(*)
  into valid_index_count
  from pg_index indexes
  where indexes.indexrelid in (
    to_regclass('public.rfx_rfi_destinations_project_fk_idx'),
    to_regclass('public.rfx_rfi_origins_project_fk_idx'),
    to_regclass('public.rfx_rfi_exception_notes_project_fk_idx'),
    to_regclass('public.rfx_rfi_submissions_magic_link_fk_idx'),
    to_regclass('public.rfx_demand_snapshots_submission_fk_idx'),
    to_regclass('public.rfx_rfi_business_rules_project_fk_idx'),
    to_regclass('public.rfx_rfi_carrier_requirements_project_fk_idx'),
    to_regclass('public.rfx_rfi_service_requirements_project_fk_idx'),
    to_regclass('public.shipper_opportunities_rfx_project_fk_idx')
  )
    and indexes.indisvalid
    and indexes.indisready;

  if valid_index_count <> 9 then
    raise exception 'Expected nine valid RFI and opportunity foreign-key indexes, found %', valid_index_count;
  end if;
end;
$migration$;
