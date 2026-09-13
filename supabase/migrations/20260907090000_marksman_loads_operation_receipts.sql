-- Operation-bound readback evidence for the private MARKSMAN Loads connector.
-- This migration does not enable connector flags or create tenant links.

create table if not exists public.marksman_loads_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null default 'marksman_loads',
  external_organization_id text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_organization_id text not null references public.workspace_registry(organization_id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  rfx_event_id uuid not null references public.rfx_events(id) on delete restrict,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete restrict,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete restrict,
  effect text not null,
  operation_id text not null,
  payload_fingerprint text not null,
  segment_key text,
  record_id uuid not null,
  staging_record_id uuid,
  source_command_id uuid references public.marksman_loads_bid_commands(id) on delete restrict,
  source_fit_command_id uuid references public.marksman_loads_fit_commands(id) on delete restrict,
  outcome text not null default 'committed',
  committed_at timestamptz not null,
  constraint marksman_loads_operation_receipts_provider_check check (provider = 'marksman_loads'),
  constraint marksman_loads_operation_receipts_effect_check check (effect in ('fit', 'quote')),
  constraint marksman_loads_operation_receipts_outcome_check check (outcome = 'committed'),
  constraint marksman_loads_operation_receipts_operation_check check (operation_id ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_operation_receipts_payload_check check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marksman_loads_operation_receipts_external_org_check
    check (external_organization_id = lower(btrim(external_organization_id)) and external_organization_id <> ''),
  constraint marksman_loads_operation_receipts_effect_shape_check check (
    (effect = 'fit' and nullif(btrim(segment_key), '') is not null and staging_record_id is null and source_command_id is null and source_fit_command_id is not null)
    or
    (effect = 'quote' and segment_key is null and staging_record_id is not null and source_command_id is not null and source_fit_command_id is null)
  ),
  constraint marksman_loads_operation_receipts_operation_unique unique (provider, effect, operation_id)
);

create index if not exists marksman_loads_operation_receipts_scope_idx
  on public.marksman_loads_operation_receipts
  (external_organization_id, vendor_id, rfx_event_id, rfx_lane_id, rfx_lane_vendor_id, effect, committed_at desc);

alter table public.marksman_loads_operation_receipts enable row level security;
revoke all on table public.marksman_loads_operation_receipts from public, anon, authenticated;
grant select, insert on table public.marksman_loads_operation_receipts to service_role;

comment on table public.marksman_loads_operation_receipts is
  'Minimal operation-bound evidence for server-only MARKSMAN Loads readback. Stores no invitation token, request signature or quote payload.';

comment on column public.marksman_loads_operation_receipts.operation_id is
  'Provider operation identity. A matching current bid without this receipt is not proof that this operation committed.';

comment on column public.marksman_loads_operation_receipts.payload_fingerprint is
  'SHA-256 of the canonical effect payload. The payload itself is intentionally not stored here.';
