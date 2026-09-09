create function osp_private.claim_exact_gmail_ingest(
  p_organization_id uuid,
  p_job_id uuid,
  p_gmail_message_id text,
  p_lease_ms integer
)
returns table (
  id uuid,
  organization_id uuid,
  kind text,
  opaque_payload jsonb,
  attempt integer,
  lease_token uuid,
  leased_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  now_at timestamptz := clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_organization_id is null or p_job_id is null
     or p_gmail_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000 then
    raise exception using errcode = 'P0001', message = 'INVALID_CLAIM';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidate as (
      select job.id
      from osp_private.background_jobs job
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and control.outbound_enabled = false
        and job.organization_id = p_organization_id
        and job.id = p_job_id
        and job.kind = 'gmail_ingest'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          (jsonb_typeof(job.opaque_payload) = 'object'
           and job.opaque_payload = jsonb_build_object(
             'gmailMessageId', p_gmail_message_id,
             'deliveryIdempotencyKey', 'rateware-gmail:' || p_gmail_message_id
           ))
          or
          (jsonb_typeof(job.opaque_payload) = 'string'
           and job.opaque_payload #>> '{}' = format(
             '{"deliveryIdempotencyKey":"rateware-gmail:%s","gmailMessageId":"%s"}',
             p_gmail_message_id, p_gmail_message_id
           ))
        )
      for update of job skip locked
      limit 1
    )
    update osp_private.background_jobs job
       set attempt = job.attempt + 1,
           lease_token = extensions.gen_random_uuid(),
           leased_until = lease_deadline
      from candidate
     where job.id = candidate.id
    returning job.id, job.organization_id, job.kind, job.opaque_payload,
              job.attempt, job.lease_token, job.leased_until;
end;
$$;

revoke all on function osp_private.claim_exact_gmail_ingest(
  uuid, uuid, text, integer
) from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_exact_gmail_ingest(
  uuid, uuid, text, integer
) to osp_worker;
