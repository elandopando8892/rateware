create table osp_private.gmail_ingest_sources (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  mailbox_email text not null,
  active_after timestamptz not null,
  enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, mailbox_email),
  constraint osp_gmail_ingest_source_mailbox
    check (
      mailbox_email = pg_catalog.lower(mailbox_email)
      and mailbox_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    )
);

alter table osp_private.gmail_ingest_sources enable row level security;
alter table osp_private.gmail_ingest_sources force row level security;
revoke all on osp_private.gmail_ingest_sources
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

insert into osp_private.gmail_ingest_sources (
  organization_id,
  mailbox_email,
  active_after,
  enabled
)
select connection.organization_id, connection.mailbox_email, statement_timestamp(), true
from public.provider_gmail_connections connection
where connection.mailbox_email = 'carriers@xbfreight.com'
on conflict (organization_id, mailbox_email) do update
set active_after = greatest(
      osp_private.gmail_ingest_sources.active_after,
      excluded.active_after
    ),
    enabled = true,
    updated_at = statement_timestamp();

create function osp_private.enqueue_rateware_gmail_messages(
  p_limit integer default 25
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  inserted_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'INVALID_BRIDGE_LIMIT';
  end if;

  if not exists (
    select 1
    from osp_private.production_controls control
    where control.id = 'singleton'
      and control.release_mode in ('shadow', 'internal_send', 'bounded_cohort')
  ) then
    return 0;
  end if;

  with candidates as materialized (
    select
      message.organization_id,
      message.external_message_id,
      message.received_at,
      message.id
    from public.provider_communication_messages message
    join osp_private.gmail_ingest_sources source
      on source.organization_id = message.organization_id
     and source.mailbox_email = pg_catalog.lower(message.mailbox_reference)
    where source.enabled
      and message.received_at >= source.active_after
      and message.channel = 'email'
      and message.direction = 'inbound'
      and pg_catalog.lower(message.sender_email) ~ '^[^@[:space:]]+@xbfreight\.com$'
      and source.mailbox_email = any (
        select pg_catalog.lower(address)
        from pg_catalog.unnest(message.cc_emails) address
      )
      and exists (
        select 1
        from pg_catalog.unnest(message.to_emails) address
        where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
          not in ('', 'xbfreight.com')
      )
      and message.external_message_id ~ '^[A-Za-z0-9_-]{1,128}$'
    order by message.received_at, message.id
    limit p_limit
  )
  insert into osp_private.background_jobs (
    id,
    organization_id,
    kind,
    opaque_payload,
    idempotency_key
  )
  select
    extensions.gen_random_uuid(),
    candidate.organization_id,
    'gmail_ingest',
    pg_catalog.jsonb_build_object(
      'gmailMessageId', candidate.external_message_id,
      'deliveryIdempotencyKey', 'rateware-gmail:' || candidate.external_message_id
    ),
    'rateware-gmail:' || candidate.external_message_id
  from candidates candidate
  on conflict (organization_id, kind, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function osp_private.enqueue_rateware_gmail_messages(integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.enqueue_rateware_gmail_messages(integer)
  to osp_worker;

create or replace function osp_private.claim_next_background_jobs(
  p_lease_ms integer,
  p_limit integer
) returns table (
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
  if p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');

  return query
    with candidates as (
      select job.id
      from osp_private.background_jobs job
      cross join osp_private.production_controls control
      where control.id = 'singleton'
        and job.completed_at is null
        and (job.retry_at is null or job.retry_at <= now_at)
        and (job.leased_until is null or job.leased_until <= now_at)
        and (
          control.release_mode in ('internal_send', 'bounded_cohort')
          or (
            control.release_mode = 'shadow'
            and job.kind in ('gmail_ingest', 'duplicate_review_refresh')
          )
        )
      order by job.created_at
      for update of job skip locked
      limit p_limit
    )
    update osp_private.background_jobs job
    set attempt = job.attempt + 1,
        lease_token = extensions.gen_random_uuid(),
        leased_until = lease_deadline
    from candidates
    where job.id = candidates.id
    returning job.id, job.organization_id, job.kind, job.opaque_payload,
      job.attempt, job.lease_token, job.leased_until;
end;
$$;

revoke all on function osp_private.claim_next_background_jobs(integer, integer)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.claim_next_background_jobs(integer, integer)
  to osp_worker;
