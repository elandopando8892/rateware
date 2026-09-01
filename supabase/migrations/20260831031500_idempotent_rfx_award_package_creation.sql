-- P3: durable, payload-bound creation receipts for RFx award packages.

alter table public.rfx_award_packages
  add column if not exists operation_id uuid,
  add column if not exists operation_payload_fingerprint text,
  add column if not exists operation_completed_at timestamptz;

alter table public.rfx_award_package_lanes
  add column if not exists operation_line_index integer;

alter table public.rfx_process_audit
  add column if not exists operation_id uuid;

create unique index if not exists rfx_award_packages_owner_operation_uidx
  on public.rfx_award_packages (owner_email, operation_id);

create unique index if not exists rfx_award_package_lanes_operation_line_uidx
  on public.rfx_award_package_lanes (award_package_id, operation_line_index);

create unique index if not exists rfx_process_audit_owner_action_operation_uidx
  on public.rfx_process_audit (owner_email, action, operation_id);

alter table public.rfx_award_packages
  drop constraint if exists rfx_award_packages_operation_fingerprint_check;

alter table public.rfx_award_packages
  add constraint rfx_award_packages_operation_fingerprint_check
  check (
    operation_id is null
    or operation_payload_fingerprint ~ '^[0-9a-f]{64}$'
  );

alter table public.rfx_award_package_lanes
  drop constraint if exists rfx_award_package_lanes_operation_line_index_check;

alter table public.rfx_award_package_lanes
  add constraint rfx_award_package_lanes_operation_line_index_check
  check (operation_line_index is null or operation_line_index between 0 and 999);

comment on column public.rfx_award_packages.operation_id is
  'Caller operation id used to resume package creation without duplicating the package.';

comment on column public.rfx_award_packages.operation_payload_fingerprint is
  'SHA-256 of the normalized package and lane payload bound to operation_id.';

comment on column public.rfx_award_package_lanes.operation_line_index is
  'Stable ordinal used to upsert a partially created package during an authorized retry.';

