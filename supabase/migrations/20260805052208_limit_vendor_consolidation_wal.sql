-- Keep each destructive consolidation transaction intentionally small. Exact
-- duplicate cleanup rewrites several carrier-linked tables, so large batches
-- can generate enough WAL to destabilize a constrained production database.
do $migration$
declare
  v_signature regprocedure := 'public.consolidate_exact_workspace_vendor_duplicates(text,text,boolean,integer)'::regprocedure;
  v_definition text;
  v_old text := $old$else greatest(1, least(coalesce(p_preview_limit, 50), 100))$old$;
  v_new text := $new$else greatest(1, least(coalesce(p_preview_limit, 10), 10))$new$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Could not locate consolidation batch limit in %', v_signature;
  end if;
end
$migration$;
