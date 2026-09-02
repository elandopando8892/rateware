-- PostgreSQL ARE bounds reject repetition counts above 255. Keep the public
-- 256-character contract by separating the alphabet and length checks.
alter table osp_private.request_knowledge_promotions
  drop constraint request_knowledge_promotions_idempotency_key_check;

alter table osp_private.request_knowledge_promotions
  add constraint request_knowledge_promotions_idempotency_key_check check (
    idempotency_key ~ '^[A-Za-z0-9:_-]+$'
    and char_length(idempotency_key) between 1 and 256
  );

do $hotfix$
declare
  function_signature constant regprocedure :=
    'osp_private.promote_request_knowledge_command(uuid,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  original_definition text;
  patched_definition text;
  invalid_bound constant text :=
    'p_idempotency_key !~ ''^[A-Za-z0-9:_-]{1,256}$''';
  valid_checks constant text :=
    'p_idempotency_key !~ ''^[A-Za-z0-9:_-]+$'' or char_length(p_idempotency_key) not between 1 and 256';
  shadowed_alias constant text :=
    'from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) candidate
      where candidate.knowledge_kind || '':'' || candidate.canonical_key = selected.value';
  safe_alias constant text :=
    'from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) available_candidate
      where available_candidate.knowledge_kind || '':'' || available_candidate.canonical_key = selected.value';
begin
  select pg_catalog.pg_get_functiondef(function_signature)
  into original_definition;

  if pg_catalog.strpos(original_definition, invalid_bound) = 0
     or pg_catalog.strpos(original_definition, shadowed_alias) = 0 then
    raise exception using
      errcode = '55000',
      message = 'REQUEST_KNOWLEDGE_HOTFIX_TARGET_MISMATCH';
  end if;

  patched_definition := pg_catalog.replace(
    original_definition,
    invalid_bound,
    valid_checks
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    shadowed_alias,
    safe_alias
  );

  if patched_definition = original_definition
     or pg_catalog.strpos(patched_definition, invalid_bound) > 0
     or pg_catalog.strpos(patched_definition, valid_checks) = 0
     or pg_catalog.strpos(patched_definition, shadowed_alias) > 0
     or pg_catalog.strpos(patched_definition, safe_alias) = 0 then
    raise exception using
      errcode = '55000',
      message = 'REQUEST_KNOWLEDGE_HOTFIX_FAILED';
  end if;

  execute patched_definition;
end;
$hotfix$;

comment on function osp_private.promote_request_knowledge_command(
  uuid, uuid, uuid, text, jsonb, text, text, text
) is
'Promotes an exact human-reviewed semantic selection. Idempotency keys allow 1-256 safe characters without unsupported regex bounds; candidate validation avoids PL/pgSQL record shadowing; no external effects.';
