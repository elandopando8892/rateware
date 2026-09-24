-- Resume the existing five-minute OSP Gmail intake only after a successful
-- bounded manual read/sync. This does not enable outgoing email or create a
-- new scheduler, provider, or credential.
do $$
begin
  if not exists (
    select 1 from osp_private.production_controls
    where id = 'singleton'
      and outbound_enabled = false
      and gmail_poll_enabled = true
  ) then
    raise exception using errcode = 'P0001', message = 'OSP_GMAIL_POLL_PRECONDITION_FAILED';
  end if;

  if not exists (
    select 1 from public.provider_gmail_connections
    where organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
      and purpose = 'provider_onboarding'
      and mailbox_email = 'carriers@xbfreight.com'
      and status = 'connected'
      and last_sync_completed_at > now() - interval '1 hour'
      and last_error is null
  ) then
    raise exception using errcode = 'P0001', message = 'OSP_GMAIL_CONNECTION_NOT_RECENTLY_PROVEN';
  end if;

  if not exists (
    select 1 from cron.job
    where jobid = 3
      and jobname = 'osp-gmail-poll-every-5-minutes'
      and schedule = '*/5 * * * *'
      and active = false
      and command like '%osp_gmail_poll_url%'
      and command like '%osp_gmail_poll_secret%'
  ) then
    raise exception using errcode = 'P0001', message = 'OSP_GMAIL_CRON_NOT_EXACT';
  end if;

  perform cron.alter_job(job_id := 3, active := true);
end;
$$;
