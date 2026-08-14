-- Build 17: verified Gmail Pub/Sub delivery audit and idempotency ledger.
-- Push payloads contain only mailbox + Gmail history cursor; no message bodies.

create table if not exists public.provider_gmail_push_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  connection_id uuid not null references public.provider_gmail_connections(id) on delete restrict,
  pubsub_message_id text not null,
  subscription_name text,
  notification_email text not null,
  notification_history_id text not null,
  published_at timestamptz,
  status text not null default 'received',
  sync_run_id uuid references public.provider_gmail_sync_runs(id) on delete set null,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_gmail_push_events_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_gmail_push_events_message_unique
    unique (connection_id, pubsub_message_id),
  constraint provider_gmail_push_events_message_not_blank
    check (btrim(pubsub_message_id) <> ''),
  constraint provider_gmail_push_events_email_normalized
    check (notification_email = lower(btrim(notification_email)) and notification_email like '%@%'),
  constraint provider_gmail_push_events_history_numeric
    check (notification_history_id ~ '^[0-9]+$'),
  constraint provider_gmail_push_events_status_check
    check (status in ('received', 'processing', 'completed', 'ignored_stale', 'failed')),
  constraint provider_gmail_push_events_processed_check
    check (
      (status in ('received', 'processing') and processed_at is null)
      or (status in ('completed', 'ignored_stale', 'failed') and processed_at is not null)
    ),
  constraint provider_gmail_push_events_error_check
    check (status <> 'failed' or nullif(btrim(coalesce(error_message, '')), '') is not null)
);

create index if not exists provider_gmail_push_events_connection_received_idx
  on public.provider_gmail_push_events (connection_id, received_at desc);
create index if not exists provider_gmail_push_events_status_idx
  on public.provider_gmail_push_events (status, received_at)
  where status in ('received', 'processing', 'failed');

alter table public.provider_gmail_push_events enable row level security;
revoke all on table public.provider_gmail_push_events from public, anon, authenticated, service_role;
grant select, insert, update on table public.provider_gmail_push_events to service_role;

comment on table public.provider_gmail_push_events is
  'Build 17 service-role-only ledger for authenticated Gmail Pub/Sub push notifications, deduplication, retry state and resulting sync run.';
