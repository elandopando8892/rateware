-- Durable, payload-bound receipts for the private MARKSMAN Loads -> Rateware
-- Bid Room connector. This migration creates no link and enables no execution.

create table if not exists public.marksman_loads_bid_commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null default 'marksman_loads',
  request_id uuid not null,
  request_fingerprint text not null,
  operation_key text not null,
  external_organization_id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_organization_id text not null references public.workspace_registry(organization_id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  rfx_event_id uuid not null references public.rfx_events(id) on delete restrict,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete restrict,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete restrict,
  prepared_receipt_id text not null,
  quote_workspace_revision integer not null,
  payload_fingerprint text not null,
  actor_id text not null,
  actor_role text not null,
  confirmed_at timestamptz not null,
  status text not null default 'received',
  result jsonb,
  error_code text,
  error_detail text,
  external_execution boolean not null default false,
  rateware_submission boolean not null default false,
  execution_started_at timestamptz,
  reconciled_at timestamptz,
  constraint marksman_loads_bid_commands_provider_check
    check (provider = 'marksman_loads'),
  constraint marksman_loads_bid_commands_request_unique
    unique (provider, request_id),
  constraint marksman_loads_bid_commands_operation_unique
    unique (provider, operation_key),
  constraint marksman_loads_bid_commands_prepared_receipt_unique
    unique (provider, external_organization_id, prepared_receipt_id),
  constraint marksman_loads_bid_commands_request_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_bid_commands_operation_key_check
    check (operation_key ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_bid_commands_payload_fingerprint_check
    check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_bid_commands_external_org_normalized_check
    check (external_organization_id = lower(btrim(external_organization_id)) and external_organization_id <> ''),
  constraint marksman_loads_bid_commands_revision_check
    check (quote_workspace_revision >= 0),
  constraint marksman_loads_bid_commands_role_check
    check (actor_role in ('ADMIN', 'OPERATOR')),
  constraint marksman_loads_bid_commands_status_check
    check (status in ('received', 'executing', 'submitted', 'reconciled', 'reconcile_required', 'rejected'))
);

create index if not exists marksman_loads_bid_commands_lane_idx
  on public.marksman_loads_bid_commands (workspace_organization_id, rfx_lane_id, created_at desc);

create index if not exists marksman_loads_bid_commands_reconciliation_idx
  on public.marksman_loads_bid_commands (status, updated_at)
  where status in ('executing', 'submitted', 'reconcile_required');

alter table public.marksman_loads_bid_commands enable row level security;

revoke all on table public.marksman_loads_bid_commands from public, anon, authenticated;
grant select, insert, update on table public.marksman_loads_bid_commands to service_role;

comment on table public.marksman_loads_bid_commands is
  'Private MARKSMAN Loads bid-command ledger. Stores no invitation token or request signature; production execution remains controlled by Edge Function feature flags.';

comment on column public.marksman_loads_bid_commands.request_fingerprint is
  'SHA-256 of the signed request envelope excluding its signature, used to reject request-id reuse with changed content.';

comment on column public.marksman_loads_bid_commands.operation_key is
  'Stable SHA-256 of organization, vendor, event, lane, prepared receipt, quote revision and payload fingerprint. Prevents the same prepared quote from executing under a new request UUID.';

comment on column public.marksman_loads_bid_commands.result is
  'Sanitized execution and reconciliation receipt. Credential-shaped keys are prohibited by the Edge Function contract.';
