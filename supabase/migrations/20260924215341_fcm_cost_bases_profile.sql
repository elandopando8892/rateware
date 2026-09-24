-- QuoteDesk: keep each FCM assumption set's applicability profile (operations,
-- services, truck types, trailers, configurations, drivers it may price), so
-- QuoteDesk picks and enforces a base per route the way the FCM does
-- (scopeForOperation + assertCalculationSupportedByProfile). Null for legacy
-- sets without a profile, which the FCM applies to any operation.
alter table public.fcm_cost_bases
  add column if not exists profile jsonb
  check (profile is null or jsonb_typeof(profile) = 'object');

comment on column public.fcm_cost_bases.profile is
  'FCM applicabilityContext of the assumption set (null for legacy sets).';
