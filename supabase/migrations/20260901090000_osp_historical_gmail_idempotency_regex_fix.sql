do $migration$
declare
  function_signature constant regprocedure :=
    'osp_private.record_historical_gmail_import(uuid,text,text,text,text,text,timestamp with time zone,text,text,text,boolean,integer)'::regprocedure;
  old_fragment constant text := $old$or p_idempotency_key !~ '^[A-Za-z0-9:_-]{1,256}$'$old$;
  new_fragment constant text := $new$or p_idempotency_key is null
     or pg_catalog.length(p_idempotency_key) < 1
     or pg_catalog.length(p_idempotency_key) > 256
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'$new$;
  current_definition text;
begin
  select pg_catalog.pg_get_functiondef(function_signature)
  into strict current_definition;

  if pg_catalog.strpos(current_definition, old_fragment) = 0 then
    raise exception using
      errcode = '55000',
      message = 'OSP_HISTORICAL_GMAIL_IDEMPOTENCY_FIX_PRECONDITION';
  end if;

  execute pg_catalog.replace(current_definition, old_fragment, new_fragment);
end;
$migration$;

comment on function osp_private.record_historical_gmail_import(
  uuid, text, text, text, text, text, timestamptz, text, text, text, boolean, integer
) is 'Claims one exact preserved historical Gmail request from an approved XBF or MARKSMAN identity, addressed to the OSP mailbox and at least one external recipient; enqueues intake only and never sends.';
