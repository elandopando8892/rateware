-- A fresh migration replay does not inherit Data API grants for these RFx
-- tables. Bid Room Edge Functions use service_role; browser roles remain denied.
grant select, insert, update on table public.rfx_events to service_role;
grant select, insert, update on table public.rfx_lanes to service_role;
grant select, insert, update on table public.rfx_lane_vendors to service_role;
-- RFx invitation writes trigger rateware_promote_vendor_lifecycle(), which
-- updates the related CRM vendor under the caller's service_role identity.
grant update on table public.vendors to service_role;
