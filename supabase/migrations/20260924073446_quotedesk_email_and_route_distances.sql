-- QuoteDesk (Bidware), phase 2.
--
-- quotedesk_quote_emails: one receipt per attempt to email a quote to a
-- shipper from the organization's Gmail mailbox. The idempotency key hashes the
-- exact email (recipients, subject, bodies), so a retry never sends twice and a
-- changed quote is a new email. Bodies and tokens are never stored here.
--
-- quotedesk_route_distances: Google Routes distances for legs the mileage
-- catalog does not have, cached so the same leg is paid for once. Distances
-- are public facts, so the cache is platform-wide (no tenant columns).
-- Only the quotedesk-api edge function (service role) reads or writes these.

create table if not exists public.quotedesk_quote_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  quote_id uuid not null references public.quotedesk_quotes(id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  mailbox_email text not null,
  recipient_email text not null,
  cc_emails text[] not null default '{}',
  subject text not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'delivery_unknown')),
  attempt integer not null default 1 check (attempt > 0),
  provider_message_id text,
  provider_thread_id text,
  error text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  requested_by_user_id text,
  unique (owner_email, idempotency_key)
);

create index if not exists quotedesk_quote_emails_quote_idx
  on public.quotedesk_quote_emails (owner_email, quote_id, created_at desc);

create table if not exists public.quotedesk_route_distances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null check (provider in ('google_routes')),
  origin_key text not null,
  destination_key text not null,
  origin_query text not null,
  destination_query text not null,
  meters numeric(12, 1) not null check (meters >= 0),
  miles numeric(10, 1) not null check (miles >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  fetched_at timestamptz not null default now(),
  unique (provider, origin_key, destination_key)
);

alter table public.quotedesk_quote_emails enable row level security;
alter table public.quotedesk_route_distances enable row level security;
revoke all on table public.quotedesk_quote_emails from anon, authenticated;
revoke all on table public.quotedesk_route_distances from anon, authenticated;

comment on table public.quotedesk_quote_emails is
  'Bidware QuoteDesk: receipts of quote emails sent from the organization Gmail mailbox (idempotent per exact email). No bodies or tokens.';
comment on table public.quotedesk_route_distances is
  'Bidware QuoteDesk: cached Google Routes distances for legs missing from rateware_lane_mileage.';
