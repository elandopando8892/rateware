-- One confirmed execution may consolidate exactly one duplicate group. This
-- prevents UI retries or large requests from generating sustained WAL and I/O.
do $migration$
declare
  v_signature regprocedure := 'public.consolidate_exact_workspace_vendor_duplicates(text,text,boolean,integer)'::regprocedure;
  v_definition text;
  v_limit_100 text := $old$else greatest(1, least(coalesce(p_preview_limit, 50), 100))$old$;
  v_limit_10 text := $old$else greatest(1, least(coalesce(p_preview_limit, 10), 10))$old$;
  v_limit_1 text := $new$else 1$new$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_limit_10 in v_definition) > 0 then
    execute replace(v_definition, v_limit_10, v_limit_1);
  elsif position(v_limit_100 in v_definition) > 0 then
    execute replace(v_definition, v_limit_100, v_limit_1);
  elsif position(v_limit_1 in v_definition) = 0 then
    raise exception 'Could not locate consolidation batch limit in %', v_signature;
  end if;
end
$migration$;
