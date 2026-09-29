-- Declaring a lane void ("desierto"): the event closes without awarding it
-- to anyone. Null means the lane can still be awarded. The reason is internal;
-- award notices never carry it.
alter table public.rfx_lanes
  add column if not exists no_award_at timestamptz,
  add column if not exists no_award_reason text,
  add column if not exists no_award_by text;

comment on column public.rfx_lanes.no_award_at is
  'When the lane was declared void (closed without an award); null while it can still be awarded.';
comment on column public.rfx_lanes.no_award_reason is
  'Why the lane was declared void. Internal: award notices never include it.';
comment on column public.rfx_lanes.no_award_by is
  'Who declared the lane void.';
