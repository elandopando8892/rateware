create table if not exists public.provider_sync_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  command_id uuid not null,
  receipt_status text not null,
  external_reference text,
  response_fingerprint text,
  error_message text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
