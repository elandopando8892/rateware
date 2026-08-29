-- PL/pgSQL exposes RETURNS TABLE column names as variables. Qualifying the
-- upsert by its named primary-key constraint prevents case_id from resolving
-- ambiguously inside bind_case_profile_command.

do $hotfix$
declare
  target_function constant regprocedure :=
    'osp_private.bind_case_profile_command(uuid,uuid,uuid,bigint,integer,text,text)'::regprocedure;
  definition text;
  ambiguous_target constant text :=
    'on conflict (organization_id, case_id) do update set';
  qualified_target constant text :=
    'on conflict on constraint case_profile_bindings_pkey do update set';
begin
  definition := pg_catalog.pg_get_functiondef(target_function);

  if pg_catalog.strpos(definition, ambiguous_target) > 0 then
    definition := pg_catalog.replace(definition, ambiguous_target, qualified_target);
    execute definition;
  end if;

  definition := pg_catalog.pg_get_functiondef(target_function);
  if pg_catalog.strpos(definition, ambiguous_target) > 0
     or pg_catalog.strpos(definition, qualified_target) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'OSP_CASE_PROFILE_BINDING_CONFLICT_TARGET_HOTFIX_FAILED';
  end if;
end;
$hotfix$;
