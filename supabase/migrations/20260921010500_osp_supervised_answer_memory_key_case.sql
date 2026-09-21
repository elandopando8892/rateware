-- Allow OSP canonical field IDs such as supplier.legalName while keeping a lower-case namespace root.
alter table osp_private.supervised_answer_memory
  drop constraint if exists osp_supervised_answer_key_check;
alter table osp_private.supervised_answer_memory
  add constraint osp_supervised_answer_key_check
  check (canonical_key ~ '^[a-z][A-Za-z0-9_.-]{0,127}$');

create or replace function osp_private.record_supervised_answer_memory(
  p_organization_id uuid,
  p_legal_entity_id uuid,
  p_scope_kind text,
  p_scope_key text,
  p_canonical_key text,
  p_display_label text,
  p_value_json jsonb,
  p_value_type text,
  p_sensitivity text,
  p_source_case_id uuid,
  p_source_artifact_sha256 text,
  p_source_reference text,
  p_review_after date,
  p_actor_subject text,
  p_actor_permission text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  prior osp_private.supervised_answer_memory%rowtype;
  current_row osp_private.supervised_answer_memory%rowtype;
  next_version integer;
  next_id uuid := gen_random_uuid();
  normalized_scope_key text;
  value_sha text;
begin
  normalized_scope_key := case
    when p_scope_kind = 'entity' then '*'
    else lower(btrim(p_scope_key))
  end;

  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
       is distinct from p_organization_id
     or coalesce(pg_catalog.current_setting('osp.actor_subject', true), '')
       is distinct from p_actor_subject
     or coalesce(pg_catalog.current_setting('osp.actor_permission', true), '')
       not in ('osp:operate', 'osp:superuser')
     or p_actor_permission not in ('osp:operate', 'osp:superuser')
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.char_length(p_actor_subject) not between 1 and 256
     or p_scope_kind not in ('entity', 'counterparty')
     or (p_scope_kind = 'counterparty'
       and normalized_scope_key !~ '^[a-z0-9][a-z0-9._:-]{0,255}$')
     or p_canonical_key !~ '^[a-z][A-Za-z0-9_.-]{0,127}$'
     or p_display_label is distinct from pg_catalog.btrim(p_display_label)
     or pg_catalog.char_length(p_display_label) not between 1 and 256
     or p_value_type not in ('text', 'number', 'boolean', 'table')
     or p_sensitivity not in ('public', 'internal', 'confidential', 'restricted', 'highly_restricted')
     or p_source_reference is distinct from pg_catalog.btrim(p_source_reference)
     or pg_catalog.char_length(p_source_reference) not between 3 and 512
     or (p_source_artifact_sha256 is not null
       and p_source_artifact_sha256 !~ '^[0-9a-f]{64}$')
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 256
     or pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or (p_value_type = 'text' and pg_catalog.jsonb_typeof(p_value_json) <> 'string')
     or (p_value_type = 'number' and pg_catalog.jsonb_typeof(p_value_json) <> 'number')
     or (p_value_type = 'boolean' and pg_catalog.jsonb_typeof(p_value_json) <> 'boolean')
     or (p_value_type = 'table' and pg_catalog.jsonb_typeof(p_value_json) not in ('array', 'object')) then
    raise exception using errcode = '42501', message = 'SUPERVISED_ANSWER_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.legal_entities entity
    where entity.organization_id = p_organization_id
      and entity.id = p_legal_entity_id
      and entity.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'SUPERVISED_ANSWER_ENTITY_INVALID';
  end if;

  if p_source_case_id is not null and not exists (
    select 1 from osp_private.customer_registration_cases case_record
    where case_record.organization_id = p_organization_id
      and case_record.id = p_source_case_id
  ) then
    raise exception using errcode = '22023', message = 'SUPERVISED_ANSWER_CASE_INVALID';
  end if;

  value_sha := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value_json::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_organization_id::text || ':' || p_legal_entity_id::text || ':'
      || p_scope_kind || ':' || normalized_scope_key || ':' || p_canonical_key,
    0
  ));

  select * into prior
  from osp_private.supervised_answer_memory memory
  where memory.organization_id = p_organization_id
    and memory.idempotency_key = p_idempotency_key;
  if found then
    if prior.legal_entity_id is distinct from p_legal_entity_id
       or prior.scope_kind is distinct from p_scope_kind
       or prior.scope_key is distinct from normalized_scope_key
       or prior.canonical_key is distinct from p_canonical_key
       or prior.value_sha256 is distinct from value_sha
       or prior.source_reference is distinct from p_source_reference
       or prior.reviewed_by_subject is distinct from p_actor_subject then
      raise exception using errcode = '23514', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'memoryId', prior.id,
      'version', prior.version,
      'replayed', true,
      'unchanged', true,
      'externalEffects', false
    );
  end if;

  select * into current_row
  from osp_private.supervised_answer_memory memory
  where memory.organization_id = p_organization_id
    and memory.legal_entity_id = p_legal_entity_id
    and memory.scope_kind = p_scope_kind
    and memory.scope_key = normalized_scope_key
    and memory.canonical_key = p_canonical_key
    and memory.status = 'current'
  for update;

  if found and current_row.value_sha256 = value_sha then
    return pg_catalog.jsonb_build_object(
      'memoryId', current_row.id,
      'version', current_row.version,
      'replayed', false,
      'unchanged', true,
      'externalEffects', false
    );
  end if;

  select coalesce(max(memory.version), 0) + 1
    into next_version
  from osp_private.supervised_answer_memory memory
  where memory.organization_id = p_organization_id
    and memory.legal_entity_id = p_legal_entity_id
    and memory.scope_kind = p_scope_kind
    and memory.scope_key = normalized_scope_key
    and memory.canonical_key = p_canonical_key;

  if current_row.id is not null then
    update osp_private.supervised_answer_memory memory
    set status = 'superseded',
        superseded_at = pg_catalog.statement_timestamp()
    where memory.organization_id = p_organization_id
      and memory.id = current_row.id
      and memory.status = 'current';
    if not found then
      raise exception using errcode = '40001', message = 'SUPERVISED_ANSWER_VERSION_CONFLICT';
    end if;
  end if;

  insert into osp_private.supervised_answer_memory (
    id, organization_id, legal_entity_id, scope_kind, scope_key,
    canonical_key, display_label, value_json, value_type, value_sha256,
    sensitivity, status, version, source_case_id, source_artifact_sha256,
    source_reference, reviewed_by_subject, review_after,
    supersedes_memory_id, idempotency_key, metadata
  ) values (
    next_id, p_organization_id, p_legal_entity_id, p_scope_kind,
    normalized_scope_key, p_canonical_key, p_display_label, p_value_json,
    p_value_type, value_sha, p_sensitivity, 'current', next_version,
    p_source_case_id, p_source_artifact_sha256, p_source_reference,
    p_actor_subject, p_review_after, current_row.id, p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return pg_catalog.jsonb_build_object(
    'memoryId', next_id,
    'version', next_version,
    'replayed', false,
    'unchanged', false,
    'externalEffects', false
  );
end;
$function$;
