alter table public.rfx_rfi_submissions
  add column if not exists segment_checklists jsonb not null default '[]'::jsonb;

alter table public.rfx_rfi_lanes
  add column if not exists origin_name text,
  add column if not exists origin_address text,
  add column if not exists origin_city text,
  add column if not exists origin_state text,
  add column if not exists origin_country text,
  add column if not exists origin_postal_code text,
  add column if not exists origin_contact_name text,
  add column if not exists origin_contact_phone text,
  add column if not exists origin_contact_email text,
  add column if not exists origin_hours text,
  add column if not exists origin_handling_type text,
  add column if not exists origin_appointment_required boolean not null default false,
  add column if not exists origin_average_time_hours numeric,
  add column if not exists origin_site_restrictions text,
  add column if not exists destination_name text,
  add column if not exists destination_address text,
  add column if not exists destination_city text,
  add column if not exists destination_state text,
  add column if not exists destination_country text,
  add column if not exists destination_postal_code text,
  add column if not exists destination_contact_name text,
  add column if not exists destination_contact_phone text,
  add column if not exists destination_contact_email text,
  add column if not exists destination_hours text,
  add column if not exists destination_handling_type text,
  add column if not exists destination_appointment_required boolean not null default false,
  add column if not exists destination_average_time_hours numeric,
  add column if not exists destination_site_restrictions text,
  add column if not exists config text,
  add column if not exists temperature_controlled boolean not null default false,
  add column if not exists annual_volume numeric,
  add column if not exists transit_days numeric,
  add column if not exists logistics_model text,
  add column if not exists operation_criteria text,
  add column if not exists business_rules text,
  add column if not exists service_specifications text,
  add column if not exists carrier_requirements text,
  add column if not exists other_notes text,
  add column if not exists attachment_links text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists rfx_rfi_lanes_origin_route_idx
  on public.rfx_rfi_lanes (project_id, origin_city, origin_state, destination_city, destination_state);

alter table public.rfx_lanes
  add column if not exists carrier_requirements text;

alter table public.rfx_package_segments
  add column if not exists carrier_requirements text;
