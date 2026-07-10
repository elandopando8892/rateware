alter table public.outreach_messages
  drop constraint if exists outreach_messages_status_check;

alter table public.outreach_messages
  add constraint outreach_messages_status_check
  check (status in ('drafted', 'queued', 'sent', 'replied', 'failed', 'bounced', 'archived'));

alter table public.outreach_messages
  add column if not exists bounce_detected_at timestamptz,
  add column if not exists bounce_status text;

create table if not exists public.email_suppression_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  email text not null,
  status text not null default 'hard_bounce'
    check (status in ('hard_bounce', 'soft_bounce', 'delivery_incomplete', 'complaint', 'unsubscribed', 'manual')),
  reason text,
  source text not null default 'gmail_bounce',
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, email)
);

create index if not exists email_suppression_owner_status_idx
  on public.email_suppression_list (owner_email, status, updated_at desc);

create index if not exists email_suppression_email_idx
  on public.email_suppression_list (email);

create index if not exists outreach_messages_bounce_idx
  on public.outreach_messages (owner_email, status, bounce_detected_at desc)
  where status in ('bounced', 'failed');

alter table public.email_suppression_list enable row level security;

create policy "authenticated users can read email suppressions"
  on public.email_suppression_list for select
  to authenticated
  using (true);

create policy "authenticated users can create email suppressions"
  on public.email_suppression_list for insert
  to authenticated
  with check (true);

create policy "authenticated users can update email suppressions"
  on public.email_suppression_list for update
  to authenticated
  using (true)
  with check (true);
