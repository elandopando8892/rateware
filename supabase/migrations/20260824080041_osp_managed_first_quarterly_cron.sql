create extension if not exists pg_cron with schema pg_catalog;

do $remove_existing_job$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'osp-quarterly-document-check';
  if found then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$remove_existing_job$;

select cron.schedule(
  'osp-quarterly-document-check',
  '0 6 * * *',
  $schedule$
    with schedule_day as (
      select (statement_timestamp() at time zone 'UTC')::date as value
    )
    insert into osp_private.background_jobs (
      id, organization_id, kind, opaque_payload, idempotency_key
    )
    select extensions.gen_random_uuid(),
           organizations.organization_id,
           'quarterly_document_check',
           jsonb_build_object('scheduleRunId', to_char(schedule_day.value, 'YYYYMMDD')),
           'quarterly:' || to_char(schedule_day.value, 'YYYYMMDD')
      from (select distinct organization_id from osp_private.customer_registration_cases) organizations
      cross join schedule_day
    on conflict (organization_id, kind, idempotency_key) do nothing
  $schedule$
);
