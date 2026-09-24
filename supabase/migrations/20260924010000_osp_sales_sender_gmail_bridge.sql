create or replace function osp_private.enqueue_rateware_gmail_messages(
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
    select 1 from osp_private.production_controls control
    where control.id = 'singleton'
      and control.release_mode in ('shadow', 'internal_send', 'bounded_cohort')
  ) then return 0; end if;

  with candidates as materialized (
    select message.organization_id, message.external_message_id,
      message.received_at, message.id
    from public.provider_communication_messages message
    join osp_private.gmail_ingest_sources source
      on source.organization_id = message.organization_id
     and source.mailbox_email = pg_catalog.lower(message.mailbox_reference)
    where source.enabled
      and message.received_at >= source.active_after
      and message.channel = 'email'
      and message.direction = 'inbound'
      and (
        pg_catalog.lower(message.sender_email) ~ '^[^@[:space:]]+@xbfreight\.com$'
        or pg_catalog.lower(message.sender_email) = 'sales@heymarksman.com'
      )
      and source.mailbox_email = any (
        select pg_catalog.lower(address)
        from pg_catalog.unnest(message.cc_emails) address
      )
      and exists (
        select 1 from pg_catalog.unnest(message.to_emails) address
        where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
          not in ('', 'xbfreight.com', 'heymarksman.com')
      )
      and message.external_message_id ~ '^[A-Za-z0-9_-]{1,128}$'
    order by message.received_at, message.id
    limit p_limit
  )
  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  )
  select extensions.gen_random_uuid(), candidate.organization_id, 'gmail_ingest',
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
