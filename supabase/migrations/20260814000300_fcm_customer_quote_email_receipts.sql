begin;

create table if not exists public.fcm_customer_quote_email_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  owner_user_id text,
  owner_email text not null,
  organization_id uuid,
  source_organization_id text not null,
  source_system text not null check (source_system = 'Freight Cost Model'),
  contract_version text not null check (contract_version = 'fcm.rateware-gmail-send.v1'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  email_draft_id text not null,
  customer_quote_id text not null,
  folio text not null,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'delivery_unknown')),
  gmail_connection_id uuid references public.gmail_mailbox_connections(id) on delete set null,
  provider_message_id text,
  provider_thread_id text,
  provider_response_status text,
  error text,
  payload_metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, idempotency_key)
);

create index if not exists fcm_customer_quote_email_receipts_owner_status_idx
  on public.fcm_customer_quote_email_receipts (owner_email, status, created_at desc);

create index if not exists fcm_customer_quote_email_receipts_source_idx
  on public.fcm_customer_quote_email_receipts
  (owner_email, source_organization_id, email_draft_id, created_at desc);

alter table public.fcm_customer_quote_email_receipts enable row level security;
revoke all on table public.fcm_customer_quote_email_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.fcm_customer_quote_email_receipts to service_role;

comment on table public.fcm_customer_quote_email_receipts is
  'Idempotent delivery ledger for customer quote emails accepted from Freight Cost Model. It stores evidence and provider receipts, never tariff production data or OAuth secrets.';

comment on column public.fcm_customer_quote_email_receipts.payload_metadata is
  'Sanitized contract metadata. Raw HTML/text and OAuth credentials must not be stored here.';

commit;
