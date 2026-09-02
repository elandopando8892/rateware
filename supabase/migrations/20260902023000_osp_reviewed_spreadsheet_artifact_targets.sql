-- Preserve human-reviewed spreadsheet placement inside a new immutable mapping.
-- Existing mappings and snapshots remain append-only; outbound controls are not
-- changed by this command.

create function osp_private.record_reviewed_spreadsheet_targets_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_mapping_id uuid,
  p_expected_mapping_version integer,
  p_expected_after_sha256 text,
  p_targets jsonb,
  p_actor_subject text,
  p_actor_permission text
)
returns table (
  mapping_id uuid,
  mapping_version integer,
  mapping_sha256 text,
  mapping_review_decision_id uuid,
  case_state text,
  case_version integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_case osp_private.customer_registration_cases%rowtype;
  target_mapping osp_private.supplier_form_mappings%rowtype;
  source_version osp_private.document_versions%rowtype;
  form_instance osp_private.case_form_instances%rowtype;
  normalized_targets jsonb;
  new_mapping_id uuid := extensions.gen_random_uuid();
  new_decision_id uuid := extensions.gen_random_uuid();
  new_payload jsonb;
  new_sha256 text;
  next_case_version integer;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
       is distinct from p_organization_id
     or p_expected_mapping_version < 1
     or p_expected_after_sha256 !~ '^[0-9a-f]{64}$'
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.length(p_actor_subject) not between 1 and 256
     or p_actor_permission <> 'osp:operate'
     or pg_catalog.jsonb_typeof(p_targets) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_targets) not between 1 and 100 then
    raise exception using errcode = '42501', message = 'ARTIFACT_TARGET_REVIEW_REJECTED';
  end if;

  select * into target_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id
    and candidate.id = p_case_id
    and candidate.state = 'operations_review'
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'CASE_FORM_LOCKED';
  end if;

  select * into target_mapping
  from osp_private.supplier_form_mappings candidate
  where candidate.organization_id = p_organization_id
    and candidate.case_id = p_case_id
    and candidate.id = p_mapping_id
    and candidate.version = p_expected_mapping_version
    and candidate.after_sha256 = p_expected_after_sha256
    and candidate.status in ('accepted', 'corrected')
    and candidate.mapping_json->>'schemaVersion' = '1'
    and candidate.mapping_json->'externalEffects' = 'false'::jsonb
  for share;
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select version.* into source_version
  from osp_private.document_extractions extraction
  join osp_private.document_versions version
    on version.organization_id = extraction.organization_id
   and version.id = extraction.source_version_id
  join osp_private.documents document
    on document.organization_id = version.organization_id
   and document.id = version.document_id
  where extraction.organization_id = p_organization_id
    and extraction.case_id = p_case_id
    and extraction.id = target_mapping.extraction_id
    and extraction.status = 'reviewed'
    and document.case_id = p_case_id
    and version.document_type = 'supplier_requirement'
    and version.status = 'approved'
    and version.content_type in (
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    )
  for share of version;
  if not found then
    raise exception using errcode = '23514', message = 'ARTIFACT_SOURCE_NOT_REVIEWED';
  end if;

  select instance.* into form_instance
  from osp_private.case_package_input_snapshots snapshot
  join osp_private.case_form_instances instance
    on instance.organization_id = snapshot.organization_id
   and instance.case_id = snapshot.case_id
   and instance.id = snapshot.form_instance_id
   and instance.version = snapshot.form_instance_version
  where snapshot.organization_id = p_organization_id
    and snapshot.case_id = p_case_id
    and snapshot.case_version = target_case.aggregate_version
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(snapshot.mapping_refs) item(ref)
      where ref->>'mappingId' = target_mapping.id::text
        and ref->>'mappingVersion' = target_mapping.version::text
        and ref->>'mappingSha256' = target_mapping.after_sha256
    )
  order by snapshot.created_at desc, snapshot.id
  limit 1
  for share of instance;
  if not found then
    raise exception using errcode = '23514', message = 'PACKAGE_SNAPSHOT_NOT_CURRENT';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_targets) item(target)
    where pg_catalog.jsonb_typeof(target) is distinct from 'object'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(target)) <> 3
       or not (target ? 'canonicalFieldId' and target ? 'sheet' and target ? 'cell')
       or target->>'canonicalFieldId' !~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'
       or target->>'sheet' !~ '^[^!]{1,128}$'
       or target->>'cell' !~ '^[A-Z]{1,3}[1-9][0-9]*$'
  ) or (
    select pg_catalog.count(distinct target->>'canonicalFieldId')
    from pg_catalog.jsonb_array_elements(p_targets) item(target)
  ) <> pg_catalog.jsonb_array_length(p_targets)
  or (
    select pg_catalog.count(distinct (target->>'sheet') || '!' || (target->>'cell'))
    from pg_catalog.jsonb_array_elements(p_targets) item(target)
  ) <> pg_catalog.jsonb_array_length(p_targets) then
    raise exception using errcode = '23514', message = 'ARTIFACT_TARGET_INVALID';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'canonicalFieldId', target->>'canonicalFieldId',
      'sheet', target->>'sheet',
      'cell', target->>'cell'
    )
    order by target->>'canonicalFieldId'
  ) into normalized_targets
  from pg_catalog.jsonb_array_elements(p_targets) item(target);

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(normalized_targets) item(target)
    join osp_private.form_fields field
      on field.organization_id = p_organization_id
     and field.template_version_id = target_mapping.template_version_id
     and field.definition_json->>'canonicalFieldId' = target->>'canonicalFieldId'
    where pg_catalog.jsonb_typeof(form_instance.values_json->field.field_key)
      in ('string', 'number', 'boolean')
  ) <> pg_catalog.jsonb_array_length(normalized_targets)
  or pg_catalog.jsonb_array_length(normalized_targets) <> (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') item(field)
    where field->>'status' = 'prepared'
  ) then
    raise exception using errcode = '23514', message = 'ARTIFACT_TARGET_COVERAGE_INVALID';
  end if;

  new_payload := target_mapping.mapping_json || pg_catalog.jsonb_build_object(
    'artifactTargets', normalized_targets,
    'externalEffects', false
  );
  new_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(new_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into osp_private.supplier_form_mappings (
    id, organization_id, case_id, template_version_id, extraction_id,
    version, status, mapping_json, before_sha256, after_sha256
  ) values (
    new_mapping_id, p_organization_id, p_case_id,
    target_mapping.template_version_id, target_mapping.extraction_id,
    target_mapping.version + 1, 'unresolved', new_payload,
    target_mapping.after_sha256, new_sha256
  );

  insert into osp_private.review_decisions (
    id, organization_id, case_id, subject_kind, subject_id, decision,
    reviewer_subject, reviewer_permission, before_sha256, after_sha256,
    reason_code, created_at
  ) values (
    new_decision_id, p_organization_id, p_case_id, 'form_mapping',
    new_mapping_id, 'corrected', p_actor_subject, p_actor_permission,
    target_mapping.after_sha256, new_sha256,
    'ARTIFACT_TARGETS_CONFIRMED', pg_catalog.statement_timestamp()
  );

  update osp_private.supplier_form_mappings mapping
  set status = 'corrected', review_decision_id = new_decision_id,
      updated_at = pg_catalog.statement_timestamp()
  where mapping.organization_id = p_organization_id
    and mapping.id = new_mapping_id
    and mapping.status = 'unresolved';
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  update osp_private.customer_registration_cases candidate
  set state = 'preparing', aggregate_version = aggregate_version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where candidate.organization_id = p_organization_id
    and candidate.id = p_case_id
    and candidate.state = 'operations_review'
    and candidate.aggregate_version = target_case.aggregate_version
  returning aggregate_version into next_case_version;
  if next_case_version is null then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  insert into osp_private.case_events (
    id, organization_id, case_id, sequence, state, actor_subject,
    authority_role, source_version, occurred_at, reason_code,
    correlation_id, evidence_json
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    next_case_version, 'preparing', p_actor_subject, 'operations',
    target_case.aggregate_version, pg_catalog.statement_timestamp(),
    'spreadsheet_artifact_targets_confirmed', extensions.gen_random_uuid(),
    pg_catalog.jsonb_build_array(new_mapping_id::text, source_version.id::text)
  );

  return query select new_mapping_id, target_mapping.version + 1,
    new_sha256, new_decision_id, 'preparing'::text, next_case_version;
end;
$function$;

revoke all on function osp_private.record_reviewed_spreadsheet_targets_command(
  uuid, uuid, uuid, integer, text, jsonb, text, text
) from public, anon, authenticated, service_role;

grant execute on function osp_private.record_reviewed_spreadsheet_targets_command(
  uuid, uuid, uuid, integer, text, jsonb, text, text
) to osp_workflow_api;

