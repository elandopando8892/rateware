alter table public.rate_staging
  add column if not exists rfx_bid_outcome text;

alter table public.rate_staging
  drop constraint if exists rate_staging_rfx_bid_outcome_check;

alter table public.rate_staging
  add constraint rate_staging_rfx_bid_outcome_check
  check (rfx_bid_outcome is null or rfx_bid_outcome in (
    'submitted',
    'revised',
    'best_and_final',
    'awarded',
    'backup',
    'not_awarded',
    'withdrawn'
  ));

create index if not exists rate_staging_owner_rfx_bid_outcome_idx
  on public.rate_staging (owner_email, rfx_bid_outcome, created_at desc)
  where rfx_bid_outcome is not null;

-- Backfill ownership and historical outcomes for RFx bids captured before workspace scoping.
update public.rate_staging rs
set owner_email = event.owner_email
from public.rfx_lane_vendors invitation
join public.rfx_events event on event.id = invitation.rfx_event_id
where invitation.bid_rate_staging_id = rs.id
  and nullif(btrim(rs.owner_email), '') is null
  and event.owner_email is not null;

update public.rate_staging rs
set owner_email = event.owner_email
from public.rfx_events event
where rs.extracted_payload ->> 'import_method' = 'rfx_bid_submission'
  and rs.extracted_payload -> 'rfx_event' ->> 'id' = event.id::text
  and nullif(btrim(rs.owner_email), '') is null
  and event.owner_email is not null;

update public.rate_staging rs
set rfx_bid_outcome = case
  when invitation.invitation_status = 'withdrawn' then 'withdrawn'
  when invitation.award_role = 'primary' then 'awarded'
  when invitation.award_role = 'backup' then 'backup'
  when invitation.bid_rate is not null then 'submitted'
  else rs.rfx_bid_outcome
end
from public.rfx_lane_vendors invitation
where invitation.bid_rate_staging_id = rs.id
  and rs.rfx_bid_outcome is null;

comment on column public.rate_staging.rfx_bid_outcome is
  'Lifecycle outcome for the preserved carrier cost captured from an RFx bid. It is history, not automatic Rateware approval.';
