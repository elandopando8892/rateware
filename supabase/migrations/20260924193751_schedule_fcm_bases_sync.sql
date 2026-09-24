-- Hourly sync of the Freight Cost Model bases into QuoteDesk's fcm_* tables.
--
-- sync-fcm-bases reads the FCM database through a read-only role
-- (FCM_DATABASE_URL) and refreshes fcm_cost_bases for every FCM organization
-- whose users' emails belong to a rateware workspace, plus the FCM reference
-- tables when they changed. fcm_sync_runs keeps one row per run (30 days).
--
-- As with the Banxico and diesel schedules, neither the function URL nor the
-- shared secret is written here: both are read from Vault at run time
-- (fcm_sync_url, banxico_sync_secret = SYNC_CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.fcm_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  trigger text not null default 'cron',
  counts jsonb not null default '{}'::jsonb,
  reference_checksum text check (reference_checksum is null or reference_checksum ~ '^[0-9a-f]{64}$'),
  error text
);
create index if not exists fcm_sync_runs_started_idx on public.fcm_sync_runs (started_at desc);
alter table public.fcm_sync_runs enable row level security;
revoke all on table public.fcm_sync_runs from anon, authenticated;
comment on table public.fcm_sync_runs is
  'Bidware QuoteDesk: one row per sync-fcm-bases run (status, counts, reference checksum). Service role only.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-fcm-bases-hourly') then
    perform cron.unschedule('sync-fcm-bases-hourly');
  end if;
end
$$;

select cron.schedule(
  'sync-fcm-bases-hourly',
  '17 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fcm_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'banxico_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
