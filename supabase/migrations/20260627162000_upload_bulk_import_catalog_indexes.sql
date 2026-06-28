create index if not exists rateware_locations_state_active_idx
  on public.rateware_locations (state_code, active);

create index if not exists rateware_locations_location_key_active_idx
  on public.rateware_locations (location_key, active);
