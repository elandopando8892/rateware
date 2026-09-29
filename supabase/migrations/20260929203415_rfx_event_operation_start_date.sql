-- The operation's expected start ("arranque estimado"), set when the event is
-- created. Public: carriers see it in their Bid Room next to the bid deadline.
alter table public.rfx_events
  add column if not exists operation_start_date date;

comment on column public.rfx_events.operation_start_date is
  'When the awarded operation is expected to start (arranque estimado). Shown to carriers.';
