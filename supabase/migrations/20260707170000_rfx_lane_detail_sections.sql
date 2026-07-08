alter table public.rfx_lanes
  add column if not exists logistics_model text,
  add column if not exists operation_criteria text,
  add column if not exists business_rules text,
  add column if not exists service_specifications text,
  add column if not exists other_notes text;

