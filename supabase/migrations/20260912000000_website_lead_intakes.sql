create table if not exists public.website_lead_intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_site text not null check (source_site in ('marksman', 'xbf', 'holding')),
  source_channel text not null check (source_channel in ('marksman-web', 'xbf-web', 'holding-web')),
  idempotency_key text not null,
  payload_hash text not null,
  notification_status text not null default 'received'
    check (notification_status in ('received', 'sent', 'failed', 'uncertain')),
  notification_recipient text not null,
  notification_message_id text,
  notification_thread_id text,
  last_error text,
  lead jsonb not null,
  attribution jsonb not null default '{}'::jsonb,
  unique (source_site, idempotency_key)
);

create index if not exists website_lead_intakes_status_created_idx
  on public.website_lead_intakes (notification_status, created_at desc);

create index if not exists website_lead_intakes_source_created_idx
  on public.website_lead_intakes (source_site, created_at desc);

alter table public.website_lead_intakes enable row level security;
revoke all on table public.website_lead_intakes from anon, authenticated;

comment on table public.website_lead_intakes is
  'Signed public web lead intake. Leads are recorded before notification and are promoted only after human commercial review.';
