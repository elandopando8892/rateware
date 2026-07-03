alter table public.outreach_campaigns
  add column if not exists sender_email text,
  add column if not exists sender_label text,
  add column if not exists sender_connection_status text not null default 'draft_only';

alter table public.outreach_messages
  add column if not exists sender_email text,
  add column if not exists sender_label text,
  add column if not exists sender_connection_status text not null default 'draft_only';

create index if not exists outreach_campaigns_sender_email_idx
  on public.outreach_campaigns (owner_email, sender_email, created_at desc);
