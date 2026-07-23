create index if not exists whatsapp_business_connections_webhook_route_idx
  on public.whatsapp_business_connections (
    coalesce(meta_phone_number_id, phone_number_id),
    coalesce(meta_waba_id, waba_id),
    updated_at desc
  )
  where status <> 'revoked';

create index if not exists outreach_messages_whatsapp_webhook_route_idx
  on public.outreach_messages (whatsapp_connection_id, provider_message_id)
  where channel = 'whatsapp' and provider_message_id is not null;

comment on index public.whatsapp_business_connections_webhook_route_idx is
  'Resolves Meta webhook events to the exact workspace connection by Phone Number ID and WABA.';

comment on index public.outreach_messages_whatsapp_webhook_route_idx is
  'Scopes Meta delivery callbacks to the connection that sent the outreach message.';
