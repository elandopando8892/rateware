create table if not exists public.rfx_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  title text not null,
  customer_id uuid,
  customer_name text,
  customer_contact_name text,
  customer_contact_email text,
  opportunity_type text not null default 'spot'
    check (opportunity_type in ('benchmark', 'new_provider', 'capacity_addition', 'dedicated', 'spot', 'contract', 'backup')),
  operating_segments text[] not null default '{}'::text[],
  status text not null default 'draft'
    check (status in ('draft', 'rfi_sent', 'rfi_in_progress', 'rfi_submitted', 'demand_review', 'rfx_design', 'bid_room_open', 'bid_room_closed', 'bid_evaluation', 'awarded', 'implementation_ready', 'archived')),
  target_start_date date,
  due_date date,
  notes text,
  linked_rfx_event_id uuid references public.rfx_events(id) on delete set null
);

alter table public.rfx_events
  add column if not exists source_rfx_process_project_id uuid references public.rfx_projects(id) on delete set null,
  add column if not exists source_rfx_package_id uuid;

create table if not exists public.rfx_rfi_magic_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  magic_link_id uuid references public.rfx_rfi_magic_links(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reopened')),
  account_overview jsonb not null default '{}'::jsonb,
  operating_segments text[] not null default '{}'::text[],
  logistics_models jsonb not null default '{}'::jsonb,
  operational_criteria jsonb not null default '{}'::jsonb,
  business_rules jsonb not null default '{}'::jsonb,
  service_requirements jsonb not null default '{}'::jsonb,
  carrier_requirements jsonb not null default '{}'::jsonb,
  crossborder_details jsonb not null default '{}'::jsonb,
  notes_exceptions jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  response jsonb not null default '{}'::jsonb,
  frozen_snapshot jsonb not null default '{}'::jsonb,
  completeness_score numeric not null default 0 check (completeness_score >= 0 and completeness_score <= 100),
  submitted_at timestamptz,
  reopened_at timestamptz,
  constraint rfx_rfi_submissions_project_unique unique (project_id)
);

create table if not exists public.rfx_rfi_origins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  origin_key text,
  name text,
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  contact_name text,
  contact_phone text,
  contact_email text,
  loading_hours text,
  appointment_required boolean,
  loading_type text check (loading_type is null or loading_type in ('live', 'drop', 'preload', 'other')),
  average_loading_time_hours numeric,
  site_restrictions text,
  notes text
);

create table if not exists public.rfx_rfi_destinations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  destination_key text,
  name text,
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  contact_name text,
  contact_phone text,
  contact_email text,
  receiving_hours text,
  appointment_required boolean,
  unloading_type text check (unloading_type is null or unloading_type in ('live', 'drop', 'drop_and_hook', 'other')),
  average_unloading_time_hours numeric,
  late_delivery_penalties text,
  site_restrictions text,
  notes text
);

create table if not exists public.rfx_rfi_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  lane_id text,
  origin_id uuid references public.rfx_rfi_origins(id) on delete set null,
  destination_id uuid references public.rfx_rfi_destinations(id) on delete set null,
  origin_text text,
  destination_text text,
  operating_segment text check (operating_segment is null or operating_segment in ('expedited', 'time_critical', 'crossborder', 'local', 'regional', 'national')),
  operation_type text check (operation_type is null or operation_type in ('mx_domestic', 'us_domestic', 'crossborder', 'local', 'regional', 'national')),
  service_type text check (service_type is null or service_type in ('standard', 'expedited', 'time_critical', 'dedicated', 'spot', 'recurring')),
  equipment_type text,
  trailer_requirements text,
  commodity text,
  hazmat boolean not null default false,
  cargo_value numeric,
  cargo_value_currency text,
  weight numeric,
  pallets numeric,
  dimensions text,
  weekly_volume numeric,
  monthly_volume numeric,
  frequency text,
  pickup_lead_time_hours numeric,
  expected_transit_time_hours numeric,
  target_rate numeric,
  current_rate numeric,
  currency text,
  seasonality_notes text,
  special_requirements text,
  notes text,
  validation_issues jsonb not null default '[]'::jsonb,
  completeness_score numeric not null default 0 check (completeness_score >= 0 and completeness_score <= 100)
);

create table if not exists public.rfx_rfi_business_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  payment_terms text,
  rate_currency text,
  fuel_surcharge_policy text,
  detention_loading_free_time_hours numeric,
  detention_loading_rate numeric,
  detention_unloading_free_time_hours numeric,
  detention_unloading_rate numeric,
  layover_policy text,
  tonu_policy text,
  cancellation_policy text,
  redelivery_policy text,
  border_wait_policy text,
  claims_process text,
  insurance_requirements text,
  penalties text,
  accessorial_approval_required boolean,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_service_requirements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  gps_tracking_required boolean,
  tracking_frequency text,
  check_calls_required boolean,
  pod_required boolean,
  pod_submission_time_hours numeric,
  bol_required boolean,
  appointment_management_owner text,
  support_24_7_required boolean,
  escalation_sla text,
  reporting_requirements text,
  communication_channels jsonb not null default '[]'::jsonb,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_carrier_requirements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  allowed_carrier_types jsonb not null default '[]'::jsonb,
  mc_dot_required boolean,
  mx_authority_required boolean,
  crossborder_experience_required boolean,
  minimum_years_experience numeric,
  minimum_fleet_size numeric,
  fleet_ownership_preference text,
  cargo_insurance_minimum numeric,
  liability_insurance_minimum numeric,
  gps_required boolean,
  certifications_required jsonb not null default '[]'::jsonb,
  hazmat_certification_required boolean,
  customer_preapproval_required boolean,
  preferred_carriers jsonb not null default '[]'::jsonb,
  blocked_carriers jsonb not null default '[]'::jsonb,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_crossborder_details (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  rfi_lane_id uuid references public.rfx_rfi_lanes(id) on delete cascade,
  lane_id text,
  direction text check (direction is null or direction in ('mx_to_us', 'us_to_mx')),
  border_crossing text,
  mx_customs_broker text,
  us_customs_broker text,
  crossing_model text check (crossing_model is null or crossing_model in ('direct', 'transfer', 'swap', 'drayage', 'b1')),
  carta_porte_required boolean,
  pedimento_required boolean,
  documents_required jsonb not null default '[]'::jsonb,
  expected_border_time_hours numeric,
  broker_coordination_owner text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  name text,
  url text,
  reference text,
  attachment_type text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_rfi_exception_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  submission_id uuid references public.rfx_rfi_submissions(id) on delete cascade,
  section text,
  note_type text,
  severity text check (severity is null or severity in ('info', 'warning', 'critical')),
  note text,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  rfi_submission_id uuid references public.rfx_rfi_submissions(id) on delete set null,
  name text not null default 'Demand Snapshot',
  status text not null default 'draft' check (status in ('draft', 'locked', 'archived')),
  completeness_score numeric not null default 0 check (completeness_score >= 0 and completeness_score <= 100),
  validation_issues jsonb not null default '[]'::jsonb,
  frozen_rfi_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_demand_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  snapshot_id uuid not null references public.rfx_demand_snapshots(id) on delete cascade,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  source_rfi_lane_id uuid references public.rfx_rfi_lanes(id) on delete set null,
  lane_key text,
  origin text,
  origin_city text,
  origin_state text,
  origin_country text,
  origin_postal_code text,
  destination text,
  destination_city text,
  destination_state text,
  destination_country text,
  destination_postal_code text,
  operating_segment text,
  operation_type text,
  service_type text,
  equipment_type text,
  trailer_requirements text,
  weekly_volume numeric,
  monthly_volume numeric,
  frequency text,
  currency text,
  target_rate numeric,
  current_rate numeric,
  internal_notes text,
  validation_issues jsonb not null default '[]'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.rfx_packages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  demand_snapshot_id uuid not null references public.rfx_demand_snapshots(id) on delete restrict,
  linked_rfx_event_id uuid references public.rfx_events(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'locked', 'launched', 'archived')),
  sourcing_strategy text not null default 'closed_bid'
    check (sourcing_strategy in ('open_bid', 'closed_bid', 'semi_controlled', 'direct_award', 'csa_contract', 'dedicated_capacity')),
  pricing_structure text not null default 'all_in'
    check (pricing_structure in ('all_in', 'linehaul_plus_fuel', 'linehaul_plus_accessorials', 'detailed_breakdown')),
  price_weight numeric not null default 40,
  capacity_weight numeric not null default 25,
  service_weight numeric not null default 20,
  compliance_weight numeric not null default 10,
  risk_weight numeric not null default 5,
  carrier_eligibility_rules jsonb not null default '{}'::jsonb,
  accessorial_template jsonb not null default '{}'::jsonb,
  rate_guidance jsonb not null default '{}'::jsonb,
  bid_due_at timestamptz,
  bid_validity_days integer,
  locked_at timestamptz,
  notes text
);

create table if not exists public.rfx_package_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  package_id uuid not null references public.rfx_packages(id) on delete cascade,
  demand_lane_id uuid not null references public.rfx_demand_lanes(id) on delete cascade,
  lot_name text,
  strategy_override text,
  pricing_override text,
  evaluation_override jsonb not null default '{}'::jsonb,
  constraint rfx_package_lanes_unique unique (package_id, demand_lane_id)
);

create table if not exists public.rfx_award_packages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid not null references public.rfx_projects(id) on delete cascade,
  rfx_package_id uuid references public.rfx_packages(id) on delete set null,
  linked_rfx_event_id uuid references public.rfx_events(id) on delete set null,
  scenario_name text not null default 'Primary award scenario',
  scenario_type text not null default 'best_value'
    check (scenario_type in ('cheapest', 'best_value', 'primary_backup', 'capacity_split', 'incumbent_comparison')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'implementation_ready', 'archived')),
  evaluation_summary jsonb not null default '{}'::jsonb,
  implementation_checklist jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  notes text
);

create table if not exists public.rfx_award_package_lanes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  award_package_id uuid not null references public.rfx_award_packages(id) on delete cascade,
  lane_id uuid,
  awarded_carrier_id uuid references public.vendors(id) on delete set null,
  backup_carrier_id uuid references public.vendors(id) on delete set null,
  awarded_rate numeric,
  currency text,
  awarded_capacity numeric,
  service_requirements jsonb not null default '{}'::jsonb,
  accessorials jsonb not null default '{}'::jsonb,
  accepted_exceptions jsonb not null default '[]'::jsonb,
  implementation_notes text,
  status text not null default 'draft'
);

create table if not exists public.rfx_process_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  project_id uuid references public.rfx_projects(id) on delete cascade,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists rfx_projects_owner_status_idx on public.rfx_projects (owner_email, status, updated_at desc);
create index if not exists rfx_projects_due_idx on public.rfx_projects (owner_email, due_date);
create index if not exists rfx_rfi_magic_links_project_idx on public.rfx_rfi_magic_links (project_id, status);
create index if not exists rfx_rfi_magic_links_token_idx on public.rfx_rfi_magic_links (token_hash);
create index if not exists rfx_rfi_lanes_project_idx on public.rfx_rfi_lanes (project_id, created_at);
create index if not exists rfx_rfi_business_rules_submission_idx on public.rfx_rfi_business_rules (submission_id);
create index if not exists rfx_rfi_service_requirements_submission_idx on public.rfx_rfi_service_requirements (submission_id);
create index if not exists rfx_rfi_carrier_requirements_submission_idx on public.rfx_rfi_carrier_requirements (submission_id);
create index if not exists rfx_rfi_crossborder_details_submission_idx on public.rfx_rfi_crossborder_details (submission_id);
create index if not exists rfx_rfi_attachments_submission_idx on public.rfx_rfi_attachments (submission_id);
create index if not exists rfx_rfi_exception_notes_submission_idx on public.rfx_rfi_exception_notes (submission_id);
create index if not exists rfx_demand_snapshots_project_idx on public.rfx_demand_snapshots (project_id, created_at desc);
create index if not exists rfx_demand_lanes_snapshot_idx on public.rfx_demand_lanes (snapshot_id);
create index if not exists rfx_packages_project_idx on public.rfx_packages (project_id, status, created_at desc);
create index if not exists rfx_package_lanes_package_idx on public.rfx_package_lanes (package_id);
create index if not exists rfx_award_packages_project_idx on public.rfx_award_packages (project_id, status, created_at desc);
create index if not exists rfx_process_audit_project_idx on public.rfx_process_audit (project_id, created_at desc);

alter table public.rfx_projects enable row level security;
alter table public.rfx_rfi_magic_links enable row level security;
alter table public.rfx_rfi_submissions enable row level security;
alter table public.rfx_rfi_origins enable row level security;
alter table public.rfx_rfi_destinations enable row level security;
alter table public.rfx_rfi_lanes enable row level security;
alter table public.rfx_rfi_business_rules enable row level security;
alter table public.rfx_rfi_service_requirements enable row level security;
alter table public.rfx_rfi_carrier_requirements enable row level security;
alter table public.rfx_rfi_crossborder_details enable row level security;
alter table public.rfx_rfi_attachments enable row level security;
alter table public.rfx_rfi_exception_notes enable row level security;
alter table public.rfx_demand_snapshots enable row level security;
alter table public.rfx_demand_lanes enable row level security;
alter table public.rfx_packages enable row level security;
alter table public.rfx_package_lanes enable row level security;
alter table public.rfx_award_packages enable row level security;
alter table public.rfx_award_package_lanes enable row level security;
alter table public.rfx_process_audit enable row level security;

-- RFx Process tables are intentionally not exposed through direct anon/authenticated
-- table policies. Internal access is mediated by rateware-api after Kinde auth, and
-- customer RFI access is mediated by rfx-bid-api after scoped magic-link validation.
