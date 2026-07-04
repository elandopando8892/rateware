alter table public.rfx_lane_vendors
  add column if not exists bid_source_thread_id uuid references public.bid_room_chat_threads(id) on delete set null,
  add column if not exists bid_source_message_id uuid references public.bid_room_chat_messages(id) on delete set null,
  add column if not exists bid_source_note text,
  add column if not exists bid_updated_from_chat_at timestamptz;

create index if not exists rfx_lane_vendors_chat_source_idx
  on public.rfx_lane_vendors (bid_source_thread_id, bid_source_message_id);
