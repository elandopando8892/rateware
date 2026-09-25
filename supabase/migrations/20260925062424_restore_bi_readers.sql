-- BI rate facts are rebuilt in PostgreSQL (2026-09-25). Restore the service_role
-- access that the 2026-09-07 Turso retirement revoked; anon/authenticated stay
-- without access, exactly as the original BI migrations left them.
grant select, insert, update, delete on table public.rateware_bi_rate_facts to service_role;
grant execute on function public.rateware_bi_drilldown_for_owner(text, text[], text[], text[], text, jsonb, integer) to service_role;
grant execute on function public.rateware_bi_geo_density_for_owner(text, text, text, text, jsonb, integer) to service_role;
grant execute on function public.rateware_bi_geo_density_market_fast(text, text, text, integer) to service_role;
grant execute on function public.rateware_bi_pivot_for_owner(text, text[], text[], text, text, jsonb, integer, integer) to service_role;
grant execute on function public.rateware_bi_summary_for_owner(text, jsonb) to service_role;
grant execute on function public.rateware_bi_vendor_metrics_for_owner(text, jsonb) to service_role;
grant execute on function public.rateware_bi_vendor_metrics_for_owner_v2(text, jsonb) to service_role;
grant execute on function public.rfx_benchmark_candidate_rate_ids(text, uuid, integer) to service_role;
grant execute on function public.vendor_rate_metrics_for_owner_ids(text, uuid[], text) to service_role;
