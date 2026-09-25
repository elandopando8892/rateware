-- Daily watch over the automatic jobs QuoteDesk and the Bid Room depend on
-- (supabase/functions/ops-daily-watch): it posts to the team's Google Chat
-- space when something needs a look, and on Mondays when all is well.
-- 14:00 UTC is 8:00 in Mexico City.
--
-- As with the Banxico, diesel and FCM schedules, neither the function URL nor
-- the shared secret is written here: both are read from Vault at run time
-- (ops_watch_url, banxico_sync_secret = SYNC_CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ops-daily-watch') then
    perform cron.unschedule('ops-daily-watch');
  end if;
end
$$;

select cron.schedule(
  'ops-daily-watch',
  '0 14 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ops_watch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'banxico_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
