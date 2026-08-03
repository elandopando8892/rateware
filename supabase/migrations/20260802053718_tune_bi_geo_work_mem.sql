-- The geo aggregation has a bounded 55k-row working set and otherwise spills
-- tens of MB to temporary disk. Keep the setting local to this RPC so ordinary
-- requests retain the database default.
alter function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer)
  set work_mem to '32MB';
