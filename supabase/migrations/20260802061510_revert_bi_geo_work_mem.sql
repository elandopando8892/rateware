-- Function-local work_mem changed the cached PL/pgSQL plan and regressed the
-- production geo RPC despite eliminating disk spill. Restore the database
-- default; the narrow geo projection remains the effective optimization.
alter function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer)
  reset work_mem;
