do $migration$
declare
  function_signature constant regprocedure :=
    'osp_private.record_historical_gmail_import(uuid,text,text,text,text,text,timestamp with time zone,text,text,text,boolean,integer)'::regprocedure;
  current_definition text;
begin
  select pg_catalog.pg_get_functiondef(function_signature)
  into strict current_definition;

  if pg_catalog.strpos(current_definition, 'pg_catalog.coalesce') = 0 then
    raise exception using
      errcode = '55000',
      message = 'OSP_HISTORICAL_GMAIL_COALESCE_FIX_PRECONDITION';
  end if;

  execute pg_catalog.replace(
    current_definition,
    'pg_catalog.coalesce',
    'coalesce'
  );
end;
$migration$;

comment on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) is 'Claims one exact preserved historical Gmail request from an approved XBF or MARKSMAN identity, addressed to the OSP mailbox and at least one external recipient; enqueues intake only and never sends.';
