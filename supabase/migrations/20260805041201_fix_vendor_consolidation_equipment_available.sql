-- Refresh already-deployed consolidation functions that predate the nullable
-- boolean merge fix. Fresh environments receive the corrected definition in
-- 20260804234412_consolidate_exact_vendor_duplicates.sql and safely no-op here.
do $migration$
declare
  v_signature regprocedure := 'public.consolidate_exact_workspace_vendor_duplicates(text,text,boolean,integer)'::regprocedure;
  v_definition text;
  v_old text := $old$equipment_available = coalesce(nullif(keeper.equipment_available, ''), v_lane_vendor.equipment_available),$old$;
  v_new text := $new$equipment_available = case
              when keeper.equipment_available is true or v_lane_vendor.equipment_available is true then true
              when keeper.equipment_available is false or v_lane_vendor.equipment_available is false then false
              else null
            end,$new$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Could not locate equipment_available merge expression in %', v_signature;
  end if;
end
$migration$;
