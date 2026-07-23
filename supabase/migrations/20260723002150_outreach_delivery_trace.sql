alter table public.outreach_messages
  add column if not exists gmail_connection_id uuid
    references public.gmail_mailbox_connections(id) on delete set null,
  add column if not exists sender_address text,
  add column if not exists sender_connection_type text,
  add column if not exists provider_response_status text,
  add column if not exists provider_thread_id text,
  add column if not exists send_result jsonb not null default '{}'::jsonb;

create index if not exists outreach_messages_gmail_connection_idx
  on public.outreach_messages (gmail_connection_id, updated_at desc)
  where gmail_connection_id is not null;

create index if not exists outreach_messages_delivery_trace_idx
  on public.outreach_messages (owner_email, channel, provider, provider_response_status, updated_at desc);

alter table public.contact_history
  add column if not exists gmail_connection_id uuid
    references public.gmail_mailbox_connections(id) on delete set null;

create index if not exists contact_history_gmail_connection_idx
  on public.contact_history (gmail_connection_id, occurred_at desc)
  where gmail_connection_id is not null;

comment on column public.outreach_messages.sender_address is
  'Non-secret sender identity used for this outreach, such as an email address or display phone number.';

comment on column public.outreach_messages.sender_connection_type is
  'Resolved connection mode used for delivery, such as gmail_oauth, internal_managed, tenant_connected, or manual_group.';

comment on column public.outreach_messages.provider_response_status is
  'Latest normalized provider result, independent from the Rateware workflow status.';

comment on column public.outreach_messages.send_result is
  'Sanitized delivery trace. Must not contain access tokens, secrets, or raw provider payloads.';

update public.outreach_messages
set
  provider = coalesce(
    nullif(provider, ''),
    case
      when channel = 'email' then 'gmail'
      when channel in ('whatsapp', 'whatsapp_group') then 'meta'
      else channel
    end
  ),
  sender_address = coalesce(
    nullif(sender_address, ''),
    nullif(sender_email, ''),
    nullif(metadata ->> 'sender_display_phone', '')
  ),
  sender_connection_type = coalesce(
    nullif(sender_connection_type, ''),
    case
      when gmail_connection_id is not null then 'gmail_oauth'
      when channel = 'email' then 'gmail_draft_only'
      when channel = 'whatsapp_group' then 'manual_group'
      when whatsapp_connection_id is not null then coalesce(nullif(metadata ->> 'whatsapp_connection_mode', ''), 'meta')
      else 'unresolved'
    end
  ),
  provider_response_status = coalesce(
    nullif(provider_response_status, ''),
    nullif(delivery_status, ''),
    nullif(status, '')
  ),
  send_result = case
    when send_result = '{}'::jsonb then jsonb_strip_nulls(jsonb_build_object(
      'stage', 'backfilled',
      'recorded_at', coalesce(updated_at, created_at),
      'channel', channel,
      'provider', coalesce(
        nullif(provider, ''),
        case when channel = 'email' then 'gmail' when channel in ('whatsapp', 'whatsapp_group') then 'meta' else channel end
      ),
      'outcome', coalesce(nullif(delivery_status, ''), nullif(status, '')),
      'connection_id', coalesce(gmail_connection_id::text, whatsapp_connection_id::text),
      'sender', coalesce(nullif(sender_address, ''), nullif(sender_email, ''), nullif(metadata ->> 'sender_display_phone', '')),
      'provider_message_id', provider_message_id
    ))
    else send_result
  end;
