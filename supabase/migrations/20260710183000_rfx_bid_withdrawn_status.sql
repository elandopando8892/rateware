alter table public.rfx_lane_vendors
  drop constraint if exists rfx_lane_vendors_invitation_status_check;

alter table public.rfx_lane_vendors
  add constraint rfx_lane_vendors_invitation_status_check
  check (
    invitation_status in (
      'drafted',
      'shortlisted',
      'invited',
      'viewed',
      'responded',
      'quoted',
      'bid_submitted',
      'declined',
      'withdrawn',
      'awarded',
      'archived'
    )
  );
