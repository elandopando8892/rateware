-- Event and campaign timelines are filtered by their owning resource before
-- stable timestamp/id ordering. These indexes also cover the corresponding
-- foreign keys for deletes and integrity checks.
create index if not exists contact_history_event_timeline_idx
  on public.contact_history (rfx_event_id, occurred_at desc, id desc)
  where rfx_event_id is not null;

create index if not exists contact_history_campaign_timeline_idx
  on public.contact_history (campaign_id, occurred_at desc, id desc)
  where campaign_id is not null;

create index if not exists contact_history_outreach_message_idx
  on public.contact_history (outreach_message_id)
  where outreach_message_id is not null;

create index if not exists bid_room_chat_messages_event_timeline_idx
  on public.bid_room_chat_messages (rfx_event_id, created_at desc, id desc)
  where rfx_event_id is not null;
