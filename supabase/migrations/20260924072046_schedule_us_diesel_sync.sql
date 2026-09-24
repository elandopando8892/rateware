-- Weekly schedule for the EIA diesel sync that keeps the US fuel surcharge
-- current for QuoteDesk suggestions and rate normalization.
--
-- EIA publishes Monday's on-highway diesel prices on Monday afternoon Eastern
-- (Tuesday after a federal holiday). Tuesday 16:00 UTC catches the normal
-- release; Wednesday repeats as a fallback and is idempotent (same week, same
-- rows).
--
-- Neither the function URL nor the shared secret is written here: both are read
-- from Vault at run time, like the Banxico schedule. The secret is the shared
-- SYNC_CRON_SECRET the Banxico job already sends (Vault name banxico_sync_secret).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-us-diesel-weekly') then
    perform cron.unschedule('sync-us-diesel-weekly');
  end if;
end
$$;

select cron.schedule(
  'sync-us-diesel-weekly',
  '0 16 * * 2,3',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'us_diesel_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'banxico_sync_secret')
    ),
    timeout_milliseconds := 20000
  );
  $job$
);
