-- PostgreSQL's ARE engine rejects repetition bounds greater than 255. Keep the
-- intended 256-character subject limit as a separate length predicate and use
-- an unbounded character-class regex for the allowed alphabet.

alter table osp_private.case_profile_bindings
  drop constraint case_profile_bindings_bound_by_subject_check,
  add constraint case_profile_bindings_bound_by_subject_check check (
    pg_catalog.char_length(bound_by_subject) between 1 and 256
    and bound_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  );

alter table osp_private.case_profile_package_drafts
  drop constraint case_profile_package_drafts_created_by_subject_check,
  add constraint case_profile_package_drafts_created_by_subject_check check (
    pg_catalog.char_length(created_by_subject) between 1 and 256
    and created_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  );

do $hotfix$
declare
  target_function regprocedure;
  definition text;
  invalid_guard constant text := $guard$p_actor_subject !~ '^[A-Za-z0-9:_@.-]{1,256}$'$guard$;
  valid_guard constant text := $guard$(pg_catalog.char_length(p_actor_subject) not between 1 and 256 or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$')$guard$;
begin
  foreach target_function in array array[
    'osp_private.bind_case_profile_command(uuid,uuid,uuid,bigint,integer,text,text)'::regprocedure,
    'osp_private.assemble_case_profile_draft_command(uuid,uuid,bigint,integer,text,text,text)'::regprocedure
  ] loop
    definition := pg_catalog.pg_get_functiondef(target_function);
    if pg_catalog.strpos(definition, invalid_guard) > 0 then
      definition := pg_catalog.replace(definition, invalid_guard, valid_guard);
      execute definition;
    end if;
    if pg_catalog.strpos(pg_catalog.pg_get_functiondef(target_function), invalid_guard) > 0 then
      raise exception using errcode = 'P0001', message = 'OSP_CASE_PROFILE_SUBJECT_REGEX_HOTFIX_FAILED';
    end if;
  end loop;
end;
$hotfix$;
