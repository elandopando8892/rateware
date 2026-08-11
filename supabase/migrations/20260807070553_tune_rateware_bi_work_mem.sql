ALTER FUNCTION public.rateware_bi_geo_density_market_fast(text,text,text,integer) SET work_mem = '32MB';
ALTER FUNCTION public.rateware_bi_geo_density_for_owner(text,text,text,text,jsonb,integer) SET work_mem = '32MB';
ANALYZE public.rate_staging;
ANALYZE public.rateware_bi_rate_facts;
