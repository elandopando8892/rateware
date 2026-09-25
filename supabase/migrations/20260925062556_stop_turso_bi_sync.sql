-- Supabase is on the Pro plan again (2026-09-25) and BI reads PostgreSQL, so the
-- 2026-09-06 contingency copy of rates/vendors to Turso stops. Turso keeps its
-- data untouched as a cold backup. These objects exist only in production (the
-- contingency migrations are not in the repo), so every step is conditional.
set local lock_timeout = '5s';
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'rateware_source_capture' and tgrelid = 'public.rate_staging'::regclass) then
    alter table public.rate_staging disable trigger rateware_source_capture;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'rateware_source_capture_vendor' and tgrelid = 'public.vendors'::regclass) then
    alter table public.vendors disable trigger rateware_source_capture_vendor;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'rateware_bi_sync_capture_truncate' and tgrelid = 'public.rateware_bi_rate_facts'::regclass) then
    alter table public.rateware_bi_rate_facts disable trigger rateware_bi_sync_capture_truncate;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rateware-bi-sync';
  end if;
end $$;
