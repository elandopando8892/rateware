create table if not exists public.bid_room_chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_id uuid references public.rfx_lanes(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete cascade,
  thread_type text not null default 'event_group'
    check (thread_type in ('event_group', 'lane_group', 'carrier_private')),
  title text,
  status text not null default 'open'
    check (status in ('open', 'archived')),
  google_chat_space text,
  google_chat_thread_key text,
  google_chat_sync_status text not null default 'not_configured',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.bid_room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  thread_id uuid not null references public.bid_room_chat_threads(id) on delete cascade,
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_id uuid references public.rfx_lanes(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  sender_role text not null default 'procurement'
    check (sender_role in ('procurement', 'carrier', 'system')),
  sender_name text,
  sender_email text,
  body text not null,
  google_chat_message_name text,
  google_chat_sync_status text not null default 'not_configured',
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists bid_room_chat_threads_unique_scope_idx
  on public.bid_room_chat_threads (
    rfx_event_id,
    thread_type,
    coalesce(rfx_lane_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status <> 'archived';

create index if not exists bid_room_chat_threads_event_idx
  on public.bid_room_chat_threads (owner_email, rfx_event_id, thread_type, updated_at desc);

create index if not exists bid_room_chat_messages_thread_idx
  on public.bid_room_chat_messages (thread_id, created_at asc);

create index if not exists bid_room_chat_messages_event_idx
  on public.bid_room_chat_messages (owner_email, rfx_event_id, created_at desc);

alter table public.bid_room_chat_threads enable row level security;
alter table public.bid_room_chat_messages enable row level security;

create policy "authenticated users can read bid room chat threads"
  on public.bid_room_chat_threads for select
  to authenticated
  using (true);

create policy "authenticated users can write bid room chat threads"
  on public.bid_room_chat_threads for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read bid room chat messages"
  on public.bid_room_chat_messages for select
  to authenticated
  using (true);

create policy "authenticated users can write bid room chat messages"
  on public.bid_room_chat_messages for all
  to authenticated
  using (true)
  with check (true);
