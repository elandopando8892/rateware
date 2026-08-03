-- Match the Bid Room's workspace/event/channel sort so PostgREST can page
-- without sorting the full outreach history for every queue refresh.
create index if not exists outreach_messages_owner_event_channel_created_idx
  on public.outreach_messages (owner_email, rfx_event_id, channel, created_at desc, id desc)
  where rfx_event_id is not null;

create index if not exists outreach_messages_owner_campaign_created_idx
  on public.outreach_messages (owner_email, campaign_id, created_at desc, id desc)
  where campaign_id is not null;

analyze public.outreach_messages;
