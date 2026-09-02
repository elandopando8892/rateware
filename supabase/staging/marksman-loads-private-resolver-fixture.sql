-- MARKSMAN Loads private resolver staging fixture.
-- Purpose: remote canary evidence only. Never apply this file to production.
-- This file intentionally lives outside supabase/migrations so it cannot ride a release.

begin;

delete from public.rfx_lane_vendors
where id = '50000000-0000-4000-8000-000000000001'::uuid;

delete from public.rfx_lanes
where id = '40000000-0000-4000-8000-000000000001'::uuid;

delete from public.rfx_events
where id = '30000000-0000-4000-8000-000000000001'::uuid;

delete from public.vendors
where id = '20000000-0000-4000-8000-000000000001'::uuid;

insert into public.vendors (id, vendor_name, legal_name, domain, status, source, notes)
values (
  '20000000-0000-4000-8000-000000000001'::uuid,
  'MARKSMAN LOADS STAGING FIXTURE CARRIER',
  'MARKSMAN LOADS STAGING FIXTURE CARRIER',
  'fixture.invalid',
  'active',
  'staging_fixture',
  'Synthetic carrier. No commercial or operational effect.'
);

insert into public.rfx_events (
  id, owner_user_id, owner_email, rfx_id, name, customer,
  event_type, status, due_date, notes
)
values (
  '30000000-0000-4000-8000-000000000001'::uuid,
  'staging-fixture-owner',
  'fixture@invalid',
  'RFX-STAGING-CANARY-001',
  'MARKSMAN Loads resolver canary',
  'SYNTHETIC SHIPPER',
  'spot',
  'open',
  '2099-12-31'::date,
  'Synthetic event. Resolver validation only; bid submission is disabled.'
);

insert into public.rfx_lanes (
  id, rfx_event_id, lane_number, origin, origin_city, origin_state,
  origin_country, destination, destination_city, destination_state,
  destination_country, equipment, operation, service, currency, notes
)
values (
  '40000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  1,
  'Laredo, TX',
  'Laredo',
  'TX',
  'US',
  'Dallas, TX',
  'Dallas',
  'TX',
  'US',
  'Dry Van',
  'Domestic US',
  'FTL',
  'USD',
  'Synthetic lane for resolver canary only.'
);

insert into public.rfx_lane_vendors (
  id, rfx_event_id, rfx_lane_id, vendor_id, invitation_status,
  invitation_token, invited_at, viewed_at, currency, response_source, notes
)
values (
  '50000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  '40000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  'viewed',
  'staging-canary-token-not-returned',
  now(),
  now(),
  'USD',
  'staging_fixture',
  'No bid is created by the resolver canary.'
);

commit;
