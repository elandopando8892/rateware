-- Route conditions per RFx lane (decided 2026-10-22). The team picks concrete
-- requirements from the catalog in _shared/rfx-lane-conditions.mjs, marks each
-- required or preferred, and the carrier answers each with a datum through the
-- existing rfx_segment_confirmations rows (rubric_key "cond.<key>",
-- segment_key "lane"). Additive only: the six legacy rubrics and their answers
-- are untouched, and an event without conditions behaves exactly as before.

create table if not exists public.rfx_lane_conditions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete cascade,
  condition_key text not null check (condition_key ~ '^[a-z0-9_]{2,60}$'),
  importance text not null default 'required' check (importance in ('required', 'preferred')),
  -- The team's target, of the catalog entry's kind (number, boolean, text or choice).
  target jsonb,
  note text check (note is null or char_length(note) <= 600),
  sort_order integer not null default 0,
  -- Grows when importance, target or note change, so an earlier answer reads as stale.
  revision integer not null default 1 check (revision >= 1),
  constraint rfx_lane_conditions_unique unique (rfx_lane_id, condition_key)
);

create index if not exists rfx_lane_conditions_event_idx on public.rfx_lane_conditions(rfx_event_id);

-- The carrier's datum and the revision it answered.
alter table public.rfx_segment_confirmations
  add column if not exists value jsonb,
  add column if not exists condition_revision integer;

-- Server-only, like the rest of the Bid Room writes since 20260803: the edge
-- functions use the service role; browsers never read or write this table.
alter table public.rfx_lane_conditions enable row level security;
revoke all on public.rfx_lane_conditions from anon, authenticated;
grant select, insert, update, delete on public.rfx_lane_conditions to service_role;
