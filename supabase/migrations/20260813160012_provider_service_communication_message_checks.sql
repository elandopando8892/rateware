alter table public.provider_communication_messages
  add constraint provider_communication_messages_channel_check
  check (channel in ('email', 'portal', 'whatsapp', 'api', 'other'));
alter table public.provider_communication_messages
  add constraint provider_communication_messages_mailbox_not_blank
  check (btrim(mailbox_reference) <> '');
alter table public.provider_communication_messages
  add constraint provider_communication_messages_external_not_blank
  check (btrim(external_message_id) <> '');
alter table public.provider_communication_messages
  add constraint provider_communication_messages_direction_check
  check (direction in ('inbound', 'outbound', 'internal'));
alter table public.provider_communication_messages
  add constraint provider_communication_messages_sender_email_check
  check (sender_email is null or sender_email = lower(btrim(sender_email)));
alter table public.provider_communication_messages
  add constraint provider_communication_messages_sha256_check
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
alter table public.provider_communication_messages
  add constraint provider_communication_messages_sensitivity_check
  check (sensitivity in ('public', 'internal', 'confidential', 'restricted', 'highly_restricted'));
alter table public.provider_communication_messages
  add constraint provider_communication_messages_processing_check
  check (processing_status in ('received', 'processing', 'processed', 'needs_review', 'failed', 'ignored'));
alter table public.provider_communication_messages
  add constraint provider_communication_messages_error_check
  check (processing_status <> 'failed' or nullif(btrim(coalesce(processing_error, '')), '') is not null);
create index if not exists provider_communication_messages_thread_time_idx
  on public.provider_communication_messages (thread_id, message_at, id);
create index if not exists provider_communication_messages_processing_idx
  on public.provider_communication_messages (organization_id, processing_status, received_at, id);
