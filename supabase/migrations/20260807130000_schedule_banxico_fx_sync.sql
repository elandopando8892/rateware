-- Daily schedule for the Banxico FIX sync that feeds Bid Room offer comparison.
--
-- Banxico publishes the FIX around midday Mexico City time. Mexico City has had
-- no daylight saving since 2022, so it is permanently UTC-6 and 19:00 UTC is a
-- stable 13:00 local. Weekdays only: Banxico publishes no FIX on weekends, and
-- the Bid Room already falls back to the newest earlier rate.
--
-- Neither the function URL nor the shared secret is written here. Both are read
-- from Vault at run time so this migration stays safe to commit.

-- Both are relocatable = false, so no schema is forced here. pg_cron creates the
-- `cron` schema and pg_net the `net` schema, which is what the job body below uses.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: re-running the migration replaces the schedule instead of failing
-- or stacking duplicate jobs. A DO block, not `select ... where exists (...)`,
-- because Postgres folds constant expressions and would evaluate the unschedule
-- even when the guard is false; cron.unschedule() throws on an unknown job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-banxico-fx-daily') then
    perform cron.unschedule('sync-banxico-fx-daily');
  end if;
end
$$;

select cron.schedule(
  'sync-banxico-fx-daily',
  '0 19 * * 1-5',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'banxico_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'banxico_sync_secret')
    ),
    timeout_milliseconds := 20000
  );
  $job$
);
