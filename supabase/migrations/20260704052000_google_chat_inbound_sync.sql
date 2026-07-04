alter table public.bid_room_chat_threads
  add column if not exists google_chat_thread_name text;

alter table public.bid_room_chat_messages
  add column if not exists google_chat_sender_name text;

create index if not exists bid_room_chat_threads_google_name_idx
  on public.bid_room_chat_threads (owner_email, google_chat_space, google_chat_thread_name)
  where google_chat_thread_name is not null;

create unique index if not exists bid_room_chat_messages_google_name_idx
  on public.bid_room_chat_messages (owner_email, google_chat_message_name)
  where google_chat_message_name is not null;
