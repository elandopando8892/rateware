alter table public.outreach_messages
  add column if not exists provider_message_id text,
  add column if not exists delivery_error text,
  add column if not exists delivered_by text;

create index if not exists outreach_messages_provider_message_idx
  on public.outreach_messages (owner_email, provider_message_id)
  where provider_message_id is not null;
