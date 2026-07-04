alter table public.bid_room_chat_threads
  add column if not exists communication_status text not null default 'open'
    check (communication_status in ('open', 'needs_reply', 'resolved')),
  add column if not exists needs_reply boolean not null default false,
  add column if not exists read_status text not null default 'read'
    check (read_status in ('read', 'unread')),
  add column if not exists assigned_to text,
  add column if not exists internal_note text,
  add column if not exists last_read_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists last_action_at timestamptz;

create index if not exists bid_room_chat_threads_action_queue_idx
  on public.bid_room_chat_threads (owner_email, communication_status, read_status, updated_at desc)
  where status <> 'archived';
