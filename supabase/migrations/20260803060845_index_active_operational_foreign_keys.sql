-- Cover active operational foreign keys across Lane Normalization, Carrier
-- communications, Shipper CRM, demand planning, and email suppression.
do $migration$
declare
  matched_constraint_count integer;
begin
  select count(*)
  into matched_constraint_count
  from (
    values
      ('rateware_lane_legs_border_pair_id_fkey', 'rateware_lane_legs', 'border_pair_id'),
      ('shipper_contacts_shipper_id_fkey', 'shipper_contacts', 'shipper_id'),
      ('outreach_campaigns_template_id_fkey', 'outreach_campaigns', 'template_id'),
      ('bid_room_chat_messages_rfx_lane_id_fkey', 'bid_room_chat_messages', 'rfx_lane_id'),
      ('bid_room_chat_messages_vendor_id_fkey', 'bid_room_chat_messages', 'vendor_id'),
      ('bid_room_chat_threads_rfx_lane_id_fkey', 'bid_room_chat_threads', 'rfx_lane_id'),
      ('bid_room_chat_threads_vendor_id_fkey', 'bid_room_chat_threads', 'vendor_id'),
      ('rfx_demand_lanes_project_id_fkey', 'rfx_demand_lanes', 'project_id'),
      ('rfx_demand_lanes_source_rfi_lane_id_fkey', 'rfx_demand_lanes', 'source_rfi_lane_id'),
      ('shipper_opportunities_shipper_id_fkey', 'shipper_opportunities', 'shipper_id'),
      ('email_suppression_list_outreach_message_id_fkey', 'email_suppression_list', 'outreach_message_id'),
      ('email_suppression_list_vendor_id_fkey', 'email_suppression_list', 'vendor_id')
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
    raise exception 'Expected twelve active operational foreign keys, found %', matched_constraint_count;
  end if;
end;
$migration$;

create index rateware_lane_legs_border_pair_fk_idx
  on public.rateware_lane_legs (border_pair_id);

create index shipper_contacts_shipper_fk_idx
  on public.shipper_contacts (shipper_id);

create index outreach_campaigns_template_fk_idx
  on public.outreach_campaigns (template_id);

create index bid_room_chat_messages_lane_fk_idx
  on public.bid_room_chat_messages (rfx_lane_id);

create index bid_room_chat_messages_vendor_fk_idx
  on public.bid_room_chat_messages (vendor_id);

create index bid_room_chat_threads_lane_fk_idx
  on public.bid_room_chat_threads (rfx_lane_id);

create index bid_room_chat_threads_vendor_fk_idx
  on public.bid_room_chat_threads (vendor_id);

create index rfx_demand_lanes_project_fk_idx
  on public.rfx_demand_lanes (project_id);

create index rfx_demand_lanes_source_rfi_lane_fk_idx
  on public.rfx_demand_lanes (source_rfi_lane_id);

create index shipper_opportunities_shipper_fk_idx
  on public.shipper_opportunities (shipper_id);

create index email_suppression_message_fk_idx
  on public.email_suppression_list (outreach_message_id);

create index email_suppression_vendor_fk_idx
  on public.email_suppression_list (vendor_id);

do $migration$
declare
  valid_index_count integer;
begin
  select count(*)
  into valid_index_count
  from pg_index indexes
  where indexes.indexrelid in (
    to_regclass('public.rateware_lane_legs_border_pair_fk_idx'),
    to_regclass('public.shipper_contacts_shipper_fk_idx'),
    to_regclass('public.outreach_campaigns_template_fk_idx'),
    to_regclass('public.bid_room_chat_messages_lane_fk_idx'),
    to_regclass('public.bid_room_chat_messages_vendor_fk_idx'),
    to_regclass('public.bid_room_chat_threads_lane_fk_idx'),
    to_regclass('public.bid_room_chat_threads_vendor_fk_idx'),
    to_regclass('public.rfx_demand_lanes_project_fk_idx'),
    to_regclass('public.rfx_demand_lanes_source_rfi_lane_fk_idx'),
    to_regclass('public.shipper_opportunities_shipper_fk_idx'),
    to_regclass('public.email_suppression_message_fk_idx'),
    to_regclass('public.email_suppression_vendor_fk_idx')
  )
    and indexes.indisvalid
    and indexes.indisready;

  if valid_index_count <> 12 then
    raise exception 'Expected twelve valid operational foreign-key indexes, found %', valid_index_count;
  end if;
end;
$migration$;
