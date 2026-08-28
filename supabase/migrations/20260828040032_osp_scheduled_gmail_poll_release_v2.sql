alter table osp_private.production_controls
  add column gmail_poll_enabled boolean not null default false,
  add column gmail_poll_interval_seconds integer not null default 300,
  add column gmail_poll_last_started_at timestamptz,
  add column gmail_poll_last_completed_at timestamptz,
  add column gmail_poll_last_status text not null default 'disabled',
  add column gmail_poll_last_error_code text,
  add column gmail_poll_lease_id uuid,
  add column gmail_poll_consecutive_failures integer not null default 0,
  add column gmail_poll_last_receipt jsonb not null default '{}'::jsonb;

alter table osp_private.production_controls
  add constraint osp_gmail_poll_interval
    check (gmail_poll_interval_seconds between 60 and 3600),
  add constraint osp_gmail_poll_status
    check (gmail_poll_last_status in ('disabled', 'running', 'succeeded', 'failed')),
  add constraint osp_gmail_poll_enabled_status
    check (gmail_poll_enabled or gmail_poll_last_status = 'disabled'),
  add constraint osp_gmail_poll_timestamps
    check (
      (gmail_poll_last_status = 'disabled' and gmail_poll_last_started_at is null and gmail_poll_last_completed_at is null)
      or (gmail_poll_last_status = 'running' and gmail_poll_last_started_at is not null)
      or (gmail_poll_last_status in ('succeeded', 'failed') and gmail_poll_last_started_at is not null and gmail_poll_last_completed_at is not null and gmail_poll_last_completed_at >= gmail_poll_last_started_at)
    ),
  add constraint osp_gmail_poll_error
    check (
      (gmail_poll_last_status = 'failed' and gmail_poll_last_error_code ~ '^POLL_[A-Z0-9_]{3,96}$')
      or (gmail_poll_last_status <> 'failed' and gmail_poll_last_error_code is null)
    ),
  add constraint osp_gmail_poll_lease
    check ((gmail_poll_last_status = 'running') = (gmail_poll_lease_id is not null)),
  add constraint osp_gmail_poll_failure_count
    check (gmail_poll_consecutive_failures between 0 and 2147483647),
  add constraint osp_gmail_poll_receipt_object
    check (jsonb_typeof(gmail_poll_last_receipt) = 'object');

grant select (
  gmail_poll_enabled,
  gmail_poll_interval_seconds,
  gmail_poll_last_started_at,
  gmail_poll_last_completed_at,
  gmail_poll_last_status,
  gmail_poll_last_error_code,
  gmail_poll_consecutive_failures
) on osp_private.production_controls to osp_readonly_api;

comment on column osp_private.production_controls.gmail_poll_enabled is
  'Fail-closed switch for the no-Pub/Sub OSP Gmail polling path. Activation requires a separate authorized migration.';
comment on column osp_private.production_controls.gmail_poll_last_receipt is
  'Bounded operational counts only; never stores message bodies, addresses, filenames, or provider payloads.';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'osp-gmail-poll-every-5-minutes',
  '*/5 * * * *',
  $schedule$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'osp_gmail_poll_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'osp_gmail_poll_secret')
      ),
      body := jsonb_build_object('version', 1, 'action', 'poll_connected_provider_mailbox'),
      timeout_milliseconds := 120000
    ) as request_id
  $schedule$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'osp-gmail-poll-every-5-minutes'),
  active := false
);
