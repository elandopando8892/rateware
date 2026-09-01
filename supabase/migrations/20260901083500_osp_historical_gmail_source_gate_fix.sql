create or replace function osp_private.record_historical_gmail_import(
  p_organization_id uuid,
  p_mailbox_email text,
  p_external_message_id text,
  p_external_thread_id text,
  p_subject_sha256 text,
  p_sender_domain text,
  p_message_at timestamptz,
  p_requested_by_subject text,
  p_idempotency_key text,
  p_request_sha256 text,
  p_provider_message_inserted boolean,
  p_attachment_metadata_rows integer
) returns table (
  claim_id uuid,
  import_status text,
  osp_enqueued integer,
  attachment_metadata_rows integer
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $$
declare
  operation_name constant text := 'historical_gmail_import';
  prior_receipt osp_private.command_receipts%rowtype;
  source_message public.provider_communication_messages%rowtype;
  historical_claim osp_private.gmail_historical_ingest_claims%rowtype;
  created_claim boolean := false;
  inserted_jobs integer := 0;
  response jsonb;
begin
  if p_organization_id is null
     or p_mailbox_email <> pg_catalog.lower(p_mailbox_email)
     or p_mailbox_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$'
     or p_external_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_external_thread_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_subject_sha256 !~ '^[0-9a-f]{64}$'
     or p_sender_domain !~ '^[a-z0-9.-]{1,253}$'
     or p_message_at is null
     or pg_catalog.btrim(pg_catalog.coalesce(p_requested_by_subject, '')) = ''
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{1,256}$'
     or p_request_sha256 !~ '^[0-9a-f]{64}$'
     or p_provider_message_inserted is null
     or p_attachment_metadata_rows is null
     or p_attachment_metadata_rows < 0
     or p_attachment_metadata_rows > 100 then
    raise exception using errcode = '22023', message = 'INVALID_HISTORICAL_GMAIL_IMPORT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(p_organization_id, operation_name, p_idempotency_key)::text,
    0
  ));

  select receipt.* into prior_receipt
  from osp_private.command_receipts receipt
  where receipt.organization_id = p_organization_id
    and receipt.operation = operation_name
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if prior_receipt.request_hash <> p_request_sha256 then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return query select
      (prior_receipt.response_json ->> 'claim_id')::uuid,
      'replayed'::text,
      0::integer,
      (prior_receipt.response_json ->> 'attachment_metadata_rows')::integer;
    return;
  end if;

  select message.* into source_message
  from public.provider_communication_messages message
  where message.organization_id = p_organization_id
    and message.channel = 'email'
    and pg_catalog.lower(message.mailbox_reference) = p_mailbox_email
    and message.external_message_id = p_external_message_id
    and (message.metadata ->> 'gmail_thread_id') = p_external_thread_id
    and message.direction = 'inbound'
    and message.message_at = p_message_at
    and pg_catalog.split_part(pg_catalog.lower(message.sender_email), '@', 2) = p_sender_domain
    and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.coalesce(message.subject, ''), 'UTF8'), 'sha256'), 'hex') = p_subject_sha256
    and pg_catalog.lower(message.sender_email) ~ '^[^@[:space:]]+@(xbfreight\.com|heymarksman\.com)$'
    and p_mailbox_email = any (
      select pg_catalog.lower(address)
      from pg_catalog.unnest(
        pg_catalog.coalesce(message.to_emails, array[]::text[])
        || pg_catalog.coalesce(message.cc_emails, array[]::text[])
      ) address
    )
    and exists (
      select 1
      from pg_catalog.unnest(
        pg_catalog.coalesce(message.to_emails, array[]::text[])
        || pg_catalog.coalesce(message.cc_emails, array[]::text[])
      ) address
      where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
        not in ('', 'xbfreight.com', 'heymarksman.com')
    )
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_GMAIL_SOURCE_MISMATCH';
  end if;

  insert into osp_private.gmail_historical_ingest_claims (
    organization_id,
    mailbox_email,
    external_message_id,
    external_thread_id,
    subject_sha256,
    sender_domain,
    message_at,
    requested_by_subject
  ) values (
    p_organization_id,
    p_mailbox_email,
    p_external_message_id,
    p_external_thread_id,
    p_subject_sha256,
    p_sender_domain,
    p_message_at,
    p_requested_by_subject
  )
  on conflict (organization_id, mailbox_email, external_message_id) do nothing
  returning * into historical_claim;
  created_claim := found;

  if not created_claim then
    select claim.* into strict historical_claim
    from osp_private.gmail_historical_ingest_claims claim
    where claim.organization_id = p_organization_id
      and claim.mailbox_email = p_mailbox_email
      and claim.external_message_id = p_external_message_id;
    if historical_claim.external_thread_id <> p_external_thread_id
       or historical_claim.subject_sha256 <> p_subject_sha256
       or historical_claim.sender_domain <> p_sender_domain
       or historical_claim.message_at <> p_message_at then
      raise exception using errcode = '23505', message = 'HISTORICAL_GMAIL_CLAIM_CONFLICT';
    end if;
  end if;

  if exists (
    select 1 from osp_private.production_controls control
    where control.id = 'singleton'
      and control.release_mode in ('shadow', 'internal_send', 'bounded_cohort')
  ) then
    insert into osp_private.background_jobs (
      id,
      organization_id,
      kind,
      opaque_payload,
      idempotency_key
    ) values (
      extensions.gen_random_uuid(),
      p_organization_id,
      'gmail_ingest',
      pg_catalog.jsonb_build_object(
        'gmailMessageId', p_external_message_id,
        'deliveryIdempotencyKey', 'rateware-gmail:' || p_external_message_id
      ),
      'rateware-gmail:' || p_external_message_id
    )
    on conflict (organization_id, kind, idempotency_key) do nothing;
    get diagnostics inserted_jobs = row_count;
  end if;

  response := pg_catalog.jsonb_build_object(
    'claim_id', historical_claim.id,
    'import_status', case when p_provider_message_inserted or created_claim then 'imported' else 'replayed' end,
    'osp_enqueued', inserted_jobs,
    'attachment_metadata_rows', p_attachment_metadata_rows,
    'checkpoint_unchanged', true,
    'outbound_enabled', false
  );
  insert into osp_private.command_receipts (
    id,
    organization_id,
    operation,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    extensions.gen_random_uuid(),
    p_organization_id,
    operation_name,
    p_idempotency_key,
    p_request_sha256,
    response
  );

  return query select
    historical_claim.id,
    (response ->> 'import_status')::text,
    inserted_jobs,
    p_attachment_metadata_rows;
end;
$$;

revoke all on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) to osp_workflow_api;

comment on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) is 'Claims one exact preserved historical Gmail request from an approved XBF or MARKSMAN identity, addressed to the OSP mailbox and at least one external recipient; enqueues intake only and never sends.';
