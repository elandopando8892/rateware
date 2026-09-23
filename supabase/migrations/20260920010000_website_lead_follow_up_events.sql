create table if not exists public.website_lead_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  intake_id uuid not null references public.website_lead_intakes(id) on delete restrict,
  event_type text not null check (event_type in ('quote_sent')),
  quote_reference text not null check (char_length(quote_reference) between 1 and 120),
  recipient_email text not null,
  actor_email text not null,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null unique,
  source text not null default 'holding-follow-up',
  unique (intake_id, event_type)
);

create index if not exists website_lead_follow_up_intake_created_idx
  on public.website_lead_follow_up_events (intake_id, created_at desc);

alter table public.website_lead_follow_up_events enable row level security;
revoke all on table public.website_lead_follow_up_events from anon, authenticated;

comment on table public.website_lead_follow_up_events is
  'Human-confirmed website lead milestones. quote_sent records an attestation after sales sends the quote; it is not a Gmail delivery receipt.';
