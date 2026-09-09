do $migration$
declare
  function_signature constant regprocedure :=
    'osp_private.record_historical_gmail_import(uuid,text,text,text,text,text,timestamp with time zone,text,text,text,boolean,integer)'::regprocedure;
  old_fragment constant text := $old$and exists (
      select 1
      from pg_catalog.unnest(
        pg_catalog.coalesce(message.to_emails, array[]::text[])
        || pg_catalog.coalesce(message.cc_emails, array[]::text[])
      ) address
      where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
        not in ('', 'xbfreight.com', 'heymarksman.com')
    )$old$;
  new_fragment constant text := $new$and (
      exists (
        select 1
        from pg_catalog.unnest(
          pg_catalog.coalesce(message.to_emails, array[]::text[])
          || pg_catalog.coalesce(message.cc_emails, array[]::text[])
        ) address
        where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
          not in ('', 'xbfreight.com', 'heymarksman.com')
      )
      or (
        pg_catalog.lower(message.sender_email) = 'sales@heymarksman.com'
        and message.subject ~* '^fwd:[[:space:]]+'
        and not exists (
          select 1
          from pg_catalog.unnest(
            pg_catalog.coalesce(message.to_emails, array[]::text[])
            || pg_catalog.coalesce(message.cc_emails, array[]::text[])
          ) address
          where pg_catalog.split_part(pg_catalog.lower(address), '@', 2)
            not in ('', 'xbfreight.com', 'heymarksman.com')
        )
        and exists (
          select 1
          from public.provider_communication_attachments attachment
          where attachment.organization_id = message.organization_id
            and attachment.message_id = message.id
            and attachment.mime_type = 'message/rfc822'
            and attachment.file_size_bytes > 0
            and attachment.processing_status = 'received'
        )
        and exists (
          select 1
          from public.provider_communication_attachments attachment
          where attachment.organization_id = message.organization_id
            and attachment.message_id = message.id
            and attachment.mime_type in (
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel.sheet.macroEnabled.12'
            )
            and attachment.file_size_bytes > 0
            and attachment.processing_status = 'received'
        )
      )
    )$new$;
  current_definition text;
begin
  select pg_catalog.pg_get_functiondef(function_signature)
  into strict current_definition;

  if pg_catalog.strpos(current_definition, old_fragment) = 0 then
    raise exception using
      errcode = '55000',
      message = 'OSP_INTERNAL_SALES_RELAY_SOURCE_GATE_PRECONDITION';
  end if;

  execute pg_catalog.replace(current_definition, old_fragment, new_fragment);
end;
$migration$;

comment on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) is 'Claims one exact preserved historical Gmail request. Internal Sales relays require an intact RFC822 source plus at least one supported document and never authorize outbound effects.';
