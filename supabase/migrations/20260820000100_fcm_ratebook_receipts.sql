-- Durable, tenant-bound receipt ledger for Freight Cost Model RateBook handoffs.
create table if not exists public.fcm_ratebook_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_email text not null,
  source_system text not null check (source_system = 'Freight Cost Model'),
  source_organization_id text not null,
  source_ratebook_id text not null,
  ratebook_code text not null,
  contract_version text not null check (contract_version = 'fcm.rateware-ratebook.v1'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'rejected')),
  received_by text,
  receiver_revision text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_email, idempotency_key)
);

create index if not exists fcm_ratebook_receipts_owner_received_idx
  on public.fcm_ratebook_receipts (owner_email, received_at desc);

create index if not exists fcm_ratebook_receipts_source_idx
  on public.fcm_ratebook_receipts (source_organization_id, source_ratebook_id, received_at desc);

alter table public.fcm_ratebook_receipts enable row level security;
revoke all on table public.fcm_ratebook_receipts from public, anon, authenticated;
grant select, insert on table public.fcm_ratebook_receipts to service_role;

comment on table public.fcm_ratebook_receipts is
  'Immutable receipt ledger for explicitly approved FCM RateBook packages. Accessible only to service_role.';

comment on column public.fcm_ratebook_receipts.payload is
  'Exact validated fcm.rateware-ratebook.v1 package received from Freight Cost Model.';
