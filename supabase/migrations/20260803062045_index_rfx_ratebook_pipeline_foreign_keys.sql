-- Cover the active RFx Process -> package -> Ratebook -> shipper pipeline.
do $migration$
declare
  matched_constraint_count integer;
begin
  select count(*)
  into matched_constraint_count
  from (
    values
      ('rfx_package_lanes_demand_lane_id_fkey', 'rfx_package_lanes', 'demand_lane_id'),
      ('rfx_packages_demand_snapshot_id_fkey', 'rfx_packages', 'demand_snapshot_id'),
      ('rfx_packages_linked_rfx_event_id_fkey', 'rfx_packages', 'linked_rfx_event_id'),
      ('rfx_ratebook_segments_source_package_segment_id_fkey', 'rfx_ratebook_segments', 'source_package_segment_id'),
      ('rfx_ratebooks_rfx_package_id_fkey', 'rfx_ratebooks', 'rfx_package_id'),
      ('rfx_ratebooks_shipper_id_fkey', 'rfx_ratebooks', 'shipper_id'),
      ('rfx_projects_linked_rfx_event_id_fkey', 'rfx_projects', 'linked_rfx_event_id'),
      ('rfx_events_source_rfx_process_project_id_fkey', 'rfx_events', 'source_rfx_process_project_id'),
      ('rfx_events_customer_id_fkey', 'rfx_events', 'customer_id'),
      ('rfx_rfi_lanes_submission_id_fkey', 'rfx_rfi_lanes', 'submission_id'),
      ('rfx_rfi_origins_submission_id_fkey', 'rfx_rfi_origins', 'submission_id'),
      ('rfx_rfi_destinations_submission_id_fkey', 'rfx_rfi_destinations', 'submission_id')
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

  if matched_constraint_count <> 12 then
    raise exception 'Expected twelve active RFx and Ratebook foreign keys, found %', matched_constraint_count;
  end if;
end;
$migration$;

create index rfx_package_lanes_demand_lane_fk_idx
  on public.rfx_package_lanes (demand_lane_id);

create index rfx_packages_demand_snapshot_fk_idx
  on public.rfx_packages (demand_snapshot_id);

create index rfx_packages_linked_event_fk_idx
  on public.rfx_packages (linked_rfx_event_id);

create index rfx_ratebook_segments_source_segment_fk_idx
  on public.rfx_ratebook_segments (source_package_segment_id);

create index rfx_ratebooks_package_fk_idx
  on public.rfx_ratebooks (rfx_package_id);

create index rfx_ratebooks_shipper_fk_idx
  on public.rfx_ratebooks (shipper_id);

create index rfx_projects_linked_event_fk_idx
  on public.rfx_projects (linked_rfx_event_id);

create index rfx_events_source_process_fk_idx
  on public.rfx_events (source_rfx_process_project_id);

create index rfx_events_customer_fk_idx
  on public.rfx_events (customer_id);

create index rfx_rfi_lanes_submission_fk_idx
  on public.rfx_rfi_lanes (submission_id);

create index rfx_rfi_origins_submission_fk_idx
  on public.rfx_rfi_origins (submission_id);

create index rfx_rfi_destinations_submission_fk_idx
  on public.rfx_rfi_destinations (submission_id);

do $migration$
declare
  valid_index_count integer;
begin
  select count(*)
  into valid_index_count
  from pg_index indexes
  where indexes.indexrelid in (
    to_regclass('public.rfx_package_lanes_demand_lane_fk_idx'),
    to_regclass('public.rfx_packages_demand_snapshot_fk_idx'),
    to_regclass('public.rfx_packages_linked_event_fk_idx'),
    to_regclass('public.rfx_ratebook_segments_source_segment_fk_idx'),
    to_regclass('public.rfx_ratebooks_package_fk_idx'),
    to_regclass('public.rfx_ratebooks_shipper_fk_idx'),
    to_regclass('public.rfx_projects_linked_event_fk_idx'),
    to_regclass('public.rfx_events_source_process_fk_idx'),
    to_regclass('public.rfx_events_customer_fk_idx'),
    to_regclass('public.rfx_rfi_lanes_submission_fk_idx'),
    to_regclass('public.rfx_rfi_origins_submission_fk_idx'),
    to_regclass('public.rfx_rfi_destinations_submission_fk_idx')
  )
    and indexes.indisvalid
    and indexes.indisready;

  if valid_index_count <> 12 then
    raise exception 'Expected twelve valid RFx and Ratebook foreign-key indexes, found %', valid_index_count;
  end if;
end;
$migration$;
