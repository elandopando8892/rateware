alter table public.rfx_events
  add column if not exists bid_visibility_mode text not null default 'anonymous_rank';

alter table public.rfx_events
  drop constraint if exists rfx_events_bid_visibility_mode_check;

alter table public.rfx_events
  add constraint rfx_events_bid_visibility_mode_check
  check (bid_visibility_mode in ('private', 'anonymous_rank', 'open_leaderboard'));

comment on column public.rfx_events.bid_visibility_mode is
  'Controls what invited carriers can see in the Private Bid Room: private, anonymous_rank, or open_leaderboard.';
