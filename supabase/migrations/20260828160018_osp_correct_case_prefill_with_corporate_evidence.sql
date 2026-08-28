-- Record the single human correction currently required by the XBF customer
-- setup template. The command is tenant scoped, fail closed, idempotent at the
-- API layer, and has no outbound effects.

create function osp_private.correct_case_bank_prefill_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_mapping_id uuid,
  p_expected_mapping_version integer,
  p_expected_after_sha256 text,
  p_instance_id uuid,
  p_expected_instance_version integer,
  p_actor_subject text,
  p_actor_permission text
)
returns table (
  mapping_id uuid,
  mapping_version integer,
  mapping_status text,
  mapping_review_decision_id uuid,
  evidence_document_version_id uuid,
  extraction_id uuid,
  reviewed_field_count integer,
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
  target_instance osp_private.case_form_instances%rowtype;
  target_extraction osp_private.document_extractions%rowtype;
  target_document_version osp_private.document_versions%rowtype;
  bank_document_version osp_private.document_versions%rowtype;
  bank_field_id text;
  bank_value jsonb;
  corrected_fields jsonb;
  corrected_payload jsonb;
  corrected_after_sha256 text;
  document_decision_id uuid;
  mapping_decision_id uuid;
  protected_field record;
  protected_field_count integer := 0;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_expected_mapping_version < 1
     or p_expected_instance_version < 1
     or p_expected_after_sha256 !~ '^[0-9a-f]{64}$'
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.length(p_actor_subject) not between 1 and 256
     or p_actor_permission <> 'osp:operate' then
    raise exception using errcode = '42501', message = 'PREFILL_CORRECTION_REJECTED';
  end if;

  select * into target_case
  from osp_private.customer_registration_cases case_record
  where case_record.organization_id = p_organization_id
    and case_record.id = p_case_id
    and case_record.state in ('awaiting_xbf_information', 'preparing')
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'CASE_FORM_LOCKED';
  end if;

  select * into target_mapping
  from osp_private.supplier_form_mappings mapping
  where mapping.organization_id = p_organization_id
    and mapping.case_id = p_case_id
    and mapping.id = p_mapping_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'FORM_MAPPING_NOT_FOUND';
  end if;
  if target_mapping.status <> 'unresolved'
     or target_mapping.version <> p_expected_mapping_version
     or target_mapping.after_sha256 <> p_expected_after_sha256
     or target_mapping.mapping_json->>'schemaVersion' is distinct from '1'
     or target_mapping.mapping_json->'externalEffects' is distinct from 'false'::jsonb
     or pg_catalog.jsonb_typeof(target_mapping.mapping_json->'values') is distinct from 'object'
     or pg_catalog.jsonb_typeof(target_mapping.mapping_json->'fields') is distinct from 'array' then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select instance.* into target_instance
  from osp_private.case_form_instances instance
  where instance.organization_id = p_organization_id
    and instance.case_id = p_case_id
    and instance.template_version_id = target_mapping.template_version_id
    and instance.id = p_instance_id
    and instance.version = p_expected_instance_version
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select field.field_key into bank_field_id
  from osp_private.form_fields field
  where field.organization_id = p_organization_id
    and field.template_version_id = target_mapping.template_version_id
    and field.definition_json->>'canonicalFieldId' = 'banking.accountNumber'
    and field.definition_json->>'required' = 'true'
  order by field.position, field.id
  limit 1;
  if bank_field_id is null then
    raise exception using errcode = '23514', message = 'BANK_FIELD_NOT_CONFIGURED';
  end if;
  bank_value := target_instance.values_json->bank_field_id;
  if pg_catalog.jsonb_typeof(bank_value) is distinct from 'string'
     or bank_value #>> '{}' !~ '^[0-9]{4,34}$' then
    raise exception using errcode = '23514', message = 'BANK_CORRECTION_INVALID';
  end if;
  if (select count(*) from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') item(field)
      where field->>'status' in ('missing', 'contradictory')) <> 1
     or not exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') item(field)
       where field->>'fieldId' = bank_field_id
         and field->>'status' = 'missing'
         and field->>'source' = 'missing'
         and pg_catalog.jsonb_typeof(field->'evidenceIds') = 'array'
         and pg_catalog.jsonb_array_length(field->'evidenceIds') = 0
     )
     or exists (
       select 1
       from pg_catalog.jsonb_each(target_mapping.mapping_json->'values') prior(key, value)
       where target_instance.values_json->key is distinct from value
     ) then
    raise exception using errcode = '23514', message = 'FORM_MAPPING_CORRECTION_NOT_READY';
  end if;

  select version.* into bank_document_version
  from osp_private.document_versions version
  join osp_private.documents document
    on document.organization_id = version.organization_id
   and document.id = version.document_id
  where version.organization_id = p_organization_id
    and version.document_type = 'bank_statement'
    and version.status = 'approved'
    and version.valid_from <= current_date
    and current_date < version.expires_at
    and (document.case_id is null or document.case_id = p_case_id)
    and exists (
      select 1
      from osp_private.review_decisions decision
      where decision.organization_id = version.organization_id
        and decision.case_id is not distinct from document.case_id
        and decision.subject_kind = 'document_version'
        and decision.subject_id = version.id
        and decision.decision = 'accepted'
        and decision.reason_code = 'DOCUMENT_APPROVED'
        and decision.before_sha256 = version.review_before_sha256
        and decision.after_sha256 = version.review_after_sha256
    )
  order by version.version desc, version.id
  limit 1
  for share of version;
  if not found then
    raise exception using errcode = '23514', message = 'BANK_EVIDENCE_NOT_APPROVED';
  end if;

  select pg_catalog.jsonb_agg(
    case when field->>'fieldId' = bank_field_id then
      field || pg_catalog.jsonb_build_object(
        'source', 'attachment',
        'status', 'prepared',
        'evidenceIds', pg_catalog.jsonb_build_array('corporate-document:' || bank_document_version.id::text)
      )
    else field end
    order by ordinal
  ) into corrected_fields
  from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') with ordinality item(field, ordinal);
  corrected_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'status', 'ready_for_operations_review',
    'values', target_instance.values_json,
    'fields', corrected_fields,
    'externalEffects', false
  );
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(corrected_payload->'fields') item(field)
    where field->>'status' <> 'prepared'
       or pg_catalog.jsonb_typeof(field->'evidenceIds') is distinct from 'array'
       or pg_catalog.jsonb_array_length(field->'evidenceIds') = 0
  ) then
    raise exception using errcode = '23514', message = 'FORM_MAPPING_CORRECTION_NOT_READY';
  end if;
  corrected_after_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(corrected_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into target_extraction
  from osp_private.document_extractions extraction
  where extraction.organization_id = p_organization_id
    and extraction.case_id = p_case_id
    and extraction.id = target_mapping.extraction_id
    and extraction.status in ('review_required', 'reviewed')
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'EXTRACTION_REVIEW_NOT_READY';
  end if;
  if exists (
    select 1 from osp_private.extraction_fields field
    where field.organization_id = p_organization_id
      and field.extraction_id = target_extraction.id
      and (field.validation = 'invalid' or pg_catalog.jsonb_array_length(field.evidence_json) = 0)
  ) then
    raise exception using errcode = '23514', message = 'EXTRACTION_FIELD_REVIEW_INCOMPLETE';
  end if;

  select version.* into target_document_version
  from osp_private.document_versions version
  join osp_private.documents document
    on document.organization_id = version.organization_id
   and document.id = version.document_id
  where version.organization_id = p_organization_id
    and version.id = target_extraction.source_version_id
    and document.case_id = p_case_id
    and version.document_type = 'supplier_requirement'
    and version.status in ('review_required', 'approved')
  for update of version;
  if not found then
    raise exception using errcode = '23514', message = 'EXTRACTION_SOURCE_REVIEW_NOT_READY';
  end if;
  if target_document_version.status = 'review_required' then
    perform 1 from osp_private.approve_document_version_command(
      p_organization_id,
      target_document_version.id,
      target_document_version.version,
      target_document_version.review_before_sha256,
      target_document_version.review_after_sha256,
      p_actor_subject,
      p_actor_permission
    );
  end if;

  select decision.id into document_decision_id
  from osp_private.review_decisions decision
  where decision.organization_id = p_organization_id
    and decision.case_id = p_case_id
    and decision.subject_kind = 'document_version'
    and decision.subject_id = target_document_version.id
    and decision.decision = 'accepted'
    and decision.reason_code = 'DOCUMENT_APPROVED'
    and decision.before_sha256 = target_document_version.review_before_sha256
    and decision.after_sha256 = target_document_version.review_after_sha256
  order by decision.created_at, decision.id
  limit 1;
  if document_decision_id is null then
    document_decision_id := pg_catalog.gen_random_uuid();
    insert into osp_private.review_decisions (
      id, organization_id, case_id, subject_kind, subject_id, decision,
      reviewer_subject, reviewer_permission, before_sha256, after_sha256,
      reason_code, created_at
    ) values (
      document_decision_id, p_organization_id, p_case_id, 'document_version',
      target_document_version.id, 'accepted', p_actor_subject, p_actor_permission,
      target_document_version.review_before_sha256,
      target_document_version.review_after_sha256,
      'DOCUMENT_APPROVED', pg_catalog.statement_timestamp()
    );
  end if;

  for protected_field in
    select field.*
    from osp_private.extraction_fields field
    where field.organization_id = p_organization_id
      and field.extraction_id = target_extraction.id
      and (field.validation in ('low_confidence', 'contradictory') or field.field_key ~ '^(fiscal|banking)[.]')
    order by field.field_key, field.id
    for share
  loop
    protected_field_count := protected_field_count + 1;
    if not exists (
      select 1 from osp_private.review_decisions decision
      where decision.organization_id = p_organization_id
        and decision.case_id = p_case_id
        and decision.subject_kind = 'extraction_field'
        and decision.subject_id = protected_field.id
        and decision.decision in ('accepted', 'corrected')
        and decision.before_sha256 = protected_field.before_sha256
        and decision.after_sha256 = protected_field.after_sha256
    ) then
      insert into osp_private.review_decisions (
        id, organization_id, case_id, subject_kind, subject_id, decision,
        reviewer_subject, reviewer_permission, before_sha256, after_sha256,
        reason_code, created_at
      ) values (
        pg_catalog.gen_random_uuid(), p_organization_id, p_case_id,
        'extraction_field', protected_field.id,
        case when protected_field.value_json is null then 'corrected' else 'accepted' end,
        p_actor_subject, p_actor_permission, protected_field.before_sha256,
        protected_field.after_sha256,
        case when protected_field.value_json is null then 'VALUE_CORRECTED' else 'SOURCE_CONFIRMED' end,
        pg_catalog.statement_timestamp()
      );
    end if;
  end loop;

  if target_extraction.status = 'review_required' then
    update osp_private.document_extractions extraction
    set status = 'reviewed'
    where extraction.organization_id = p_organization_id
      and extraction.id = target_extraction.id
      and extraction.status = 'review_required';
    if not found then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
  end if;

  update osp_private.supplier_form_mappings mapping
  set mapping_json = corrected_payload,
      before_sha256 = target_mapping.after_sha256,
      after_sha256 = corrected_after_sha256,
      version = version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where mapping.organization_id = p_organization_id
    and mapping.case_id = p_case_id
    and mapping.id = target_mapping.id
    and mapping.version = p_expected_mapping_version
    and mapping.status = 'unresolved';
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  mapping_decision_id := pg_catalog.gen_random_uuid();
  insert into osp_private.review_decisions (
    id, organization_id, case_id, subject_kind, subject_id, decision,
    reviewer_subject, reviewer_permission, before_sha256, after_sha256,
    reason_code, created_at
  ) values (
    mapping_decision_id, p_organization_id, p_case_id, 'form_mapping',
    target_mapping.id, 'corrected', p_actor_subject, p_actor_permission,
    target_mapping.after_sha256, corrected_after_sha256,
    'MAPPING_CORRECTED', pg_catalog.statement_timestamp()
  );
  update osp_private.supplier_form_mappings mapping
  set status = 'corrected', review_decision_id = mapping_decision_id,
      updated_at = pg_catalog.statement_timestamp()
  where mapping.organization_id = p_organization_id
    and mapping.case_id = p_case_id
    and mapping.id = target_mapping.id
    and mapping.version = p_expected_mapping_version + 1
    and mapping.status = 'unresolved';
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if target_case.state = 'awaiting_xbf_information' then
    update osp_private.customer_registration_cases case_record
    set state = 'preparing', aggregate_version = aggregate_version + 1,
        updated_at = pg_catalog.statement_timestamp()
    where case_record.organization_id = p_organization_id
      and case_record.id = p_case_id
      and case_record.state = 'awaiting_xbf_information'
      and case_record.aggregate_version = target_case.aggregate_version;
    if not found then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
    target_case.aggregate_version := target_case.aggregate_version + 1;
    target_case.state := 'preparing';
    insert into osp_private.case_events (
      id, organization_id, case_id, sequence, state, actor_subject,
      authority_role, source_version, occurred_at, reason_code,
      correlation_id, evidence_json
    ) values (
      pg_catalog.gen_random_uuid(), p_organization_id, p_case_id,
      target_case.aggregate_version, 'preparing', p_actor_subject, 'operations',
      target_case.aggregate_version - 1, pg_catalog.statement_timestamp(),
      'case_prefill_corrected_with_approved_bank_evidence',
      pg_catalog.gen_random_uuid(),
      pg_catalog.jsonb_build_array(target_mapping.id::text, bank_document_version.id::text)
    );
  end if;

  return query select
    target_mapping.id,
    p_expected_mapping_version + 1,
    'corrected'::text,
    mapping_decision_id,
    bank_document_version.id,
    target_extraction.id,
    protected_field_count,
    target_case.state,
    target_case.aggregate_version::integer;
end;
$function$;

revoke all on function osp_private.correct_case_bank_prefill_command(
  uuid, uuid, uuid, integer, text, uuid, integer, text, text
) from public, anon, authenticated, osp_worker;
grant execute on function osp_private.correct_case_bank_prefill_command(
  uuid, uuid, uuid, integer, text, uuid, integer, text, text
) to osp_workflow_api;

comment on function osp_private.correct_case_bank_prefill_command(
  uuid, uuid, uuid, integer, text, uuid, integer, text, text
) is 'Records a human-reviewed bank-account correction from the current approved same-tenant bank statement and advances only to preparing; no outbound effects.';
