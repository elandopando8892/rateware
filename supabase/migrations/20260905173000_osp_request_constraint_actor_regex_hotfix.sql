-- Release preflight: PostgreSQL rejects repetition bounds above 255.
-- Preserve the already-versioned Sprint 11 migration and patch only its actor
-- predicate. No data changes, new grants, provider calls or outbound authority.
do $hotfix$
declare
  target constant regprocedure :=
    'osp_private.record_request_knowledge_constraints_command(uuid,uuid,text)'::regprocedure;
  original_definition text;
  patched_definition text;
  previous_check constant text :=
    'p_actor_subject !~ ''^[A-Za-z0-9:_@.-]{1,256}$''';
  next_check constant text :=
    'p_actor_subject is null or p_actor_subject !~ ''^[A-Za-z0-9:_@.-]+$'' or char_length(p_actor_subject) not between 1 and 256';
begin
  select pg_catalog.pg_get_functiondef(target) into original_definition;
  if pg_catalog.strpos(original_definition, previous_check) = 0
     or pg_catalog.strpos(original_definition, next_check) > 0 then
    raise exception using errcode = '55000',
      message = 'REQUEST_CONSTRAINT_ACTOR_HOTFIX_TARGET_MISMATCH';
  end if;
  patched_definition := pg_catalog.replace(
    original_definition, previous_check, next_check
  );
  if patched_definition = original_definition
     or pg_catalog.strpos(patched_definition, previous_check) > 0
     or pg_catalog.strpos(patched_definition, next_check) = 0 then
    raise exception using errcode = '55000',
      message = 'REQUEST_CONSTRAINT_ACTOR_HOTFIX_FAILED';
  end if;
  execute patched_definition;
end;
$hotfix$;
