-- A duplicate group may contain many loser vendors. Limit each destructive
-- execution to one loser so relationship rewrites and WAL stay bounded.
-- Dry-run previews remain complete.
do $migration$
declare
  v_signature regprocedure := 'public.consolidate_exact_workspace_vendor_duplicates(text,text,boolean,integer)'::regprocedure;
  v_definition text;
  v_old text := $old$where r.priority_rank > 1;$old$;
  v_new text := $new$where r.priority_rank > 1
  and (
    p_dry_run
    or r.id = (
      select r2.id
      from ranked r2
      where r2.priority_rank > 1
      order by
        r2.organization_key,
        r2.normalized_name,
        r2.normalized_domain,
        r2.priority_rank,
        r2.id
      limit 1
    )
  );$new$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_new in v_definition) > 0 then
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate duplicate loser selection in %', v_signature;
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;
