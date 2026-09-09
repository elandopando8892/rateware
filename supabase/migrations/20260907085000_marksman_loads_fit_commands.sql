-- Durable write-ahead commands for private Operational Fit submissions.
-- This migration does not enable the connector or submit carrier responses.

create table if not exists public.marksman_loads_fit_commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null default 'marksman_loads',
  request_id uuid not null,
  request_fingerprint text not null,
  operation_id text not null,
  prepared_receipt_id text not null,
  external_organization_id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_organization_id text not null references public.workspace_registry(organization_id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  rfx_event_id uuid not null references public.rfx_events(id) on delete restrict,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete restrict,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete restrict,
  segment_key text not null,
  payload_fingerprint text not null,
  actor_id text not null,
  actor_role text not null,
  confirmed_at timestamptz not null,
  status text not null default 'received',
  result jsonb,
  error_code text,
  error_detail text,
  external_execution boolean not null default false,
  rateware_fit_submission boolean not null default false,
  execution_started_at timestamptz,
  reconciled_at timestamptz,
  constraint marksman_loads_fit_commands_provider_check check (provider = 'marksman_loads'),
  constraint marksman_loads_fit_commands_request_unique unique (provider, request_id),
  constraint marksman_loads_fit_commands_operation_unique unique (provider, operation_id),
  constraint marksman_loads_fit_commands_prepared_unique unique (provider, prepared_receipt_id),
  constraint marksman_loads_fit_commands_request_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_fit_commands_operation_check check (operation_id ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_fit_commands_prepared_check check (nullif(btrim(prepared_receipt_id), '') is not null and length(prepared_receipt_id) <= 191),
  constraint marksman_loads_fit_commands_payload_check check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_fit_commands_external_org_check
    check (external_organization_id = lower(btrim(external_organization_id)) and external_organization_id <> ''),
  constraint marksman_loads_fit_commands_segment_check check (nullif(btrim(segment_key), '') is not null and length(segment_key) <= 200),
  constraint marksman_loads_fit_commands_role_check check (actor_role in ('ADMIN','OPERATOR')),
  constraint marksman_loads_fit_commands_status_check
    check (status in ('received','executing','submitted','reconciled','reconcile_required','rejected'))
);

create index if not exists marksman_loads_fit_commands_scope_idx
  on public.marksman_loads_fit_commands
  (external_organization_id,vendor_id,rfx_event_id,rfx_lane_id,rfx_lane_vendor_id,prepared_receipt_id,segment_key,created_at desc);

alter table public.marksman_loads_fit_commands enable row level security;
revoke all on table public.marksman_loads_fit_commands from public,anon,authenticated;
grant select,insert,update on table public.marksman_loads_fit_commands to service_role;

comment on table public.marksman_loads_fit_commands is
  'Private MARKSMAN Loads Operational Fit command ledger. Stores fingerprints and sanitized results, never the six-answer payload or invitation credential.';
