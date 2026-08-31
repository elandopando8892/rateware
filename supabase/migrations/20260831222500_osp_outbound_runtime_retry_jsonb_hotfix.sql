do $$
declare
  function_definition text;
  unavailable_call constant text :=
    'pg_catalog.jsonb_object_length(failed_job.opaque_payload)';
  compatible_call constant text :=
    '(select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(failed_job.opaque_payload))';
begin
  select pg_catalog.pg_get_functiondef(
    'osp_private.prepare_outbound_runtime_retry(uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure
  )
  into function_definition;

  if pg_catalog.strpos(function_definition, unavailable_call) = 0 then
    if pg_catalog.strpos(function_definition, compatible_call) > 0 then
      return;
    end if;
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_RETRY_HOTFIX_SOURCE_MISMATCH';
  end if;

  execute pg_catalog.replace(
    function_definition,
    unavailable_call,
    compatible_call
  );
end;
$$;
