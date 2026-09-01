do $migration$
declare
  function_signature constant regprocedure :=
    'osp_private.record_historical_gmail_import(uuid,text,text,text,text,text,timestamp with time zone,text,text,text,boolean,integer)'::regprocedure;
  old_fragment constant text := $old$and pg_catalog.lower(message.sender_email) ~ '^[^@[:space:]]+@(xbfreight\.com|heymarksman\.com)$'$old$;
  new_fragment constant text := $new$and (
      pg_catalog.lower(message.sender_email) ~ '^[^@[:space:]]+@xbfreight\.com$'
      or pg_catalog.lower(message.sender_email) = 'sales@heymarksman.com'
    )$new$;
  current_definition text;
begin
  select pg_catalog.pg_get_functiondef(function_signature)
  into strict current_definition;

  if pg_catalog.strpos(current_definition, old_fragment) = 0 then
    raise exception using
      errcode = '55000',
      message = 'OSP_HISTORICAL_GMAIL_APPROVED_SENDER_FIX_PRECONDITION';
  end if;

  execute pg_catalog.replace(current_definition, old_fragment, new_fragment);
end;
$migration$;

comment on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) is 'Claims one exact preserved historical Gmail request from an XBF identity or sales@heymarksman.com, addressed to the OSP mailbox and at least one external recipient; enqueues intake only and never sends.';
