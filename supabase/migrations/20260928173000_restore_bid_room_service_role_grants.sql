-- A fresh migration replay does not inherit Data API grants for these RFx
-- tables. Bid Room Edge Functions use service_role; browser roles remain denied.
grant select, insert, update on table public.rfx_events to service_role;
grant select, insert, update on table public.rfx_lanes to service_role;
grant select, insert, update on table public.rfx_lane_vendors to service_role;
