-- Close the human-review gap between automatic preparation and the immutable
-- package snapshot. This migration creates no provider resources and performs
-- no outbound effects.

create or replace function osp_private.protect_extraction_review_transition()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'EXTRACTION_APPEND_ONLY';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.case_id is distinct from old.case_id
     or new.source_version_id is distinct from old.source_version_id
     or new.input_sha256 is distinct from old.input_sha256
     or new.prompt_sha256 is distinct from old.prompt_sha256
     or new.schema_sha256 is distinct from old.schema_sha256
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'EXTRACTION_APPEND_ONLY';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status <> 'review_required' or new.status <> 'reviewed' then
    raise exception using errcode = 'P0001', message = 'EXTRACTION_STATUS_TRANSITION_INVALID';
  end if;
  if not exists (
    select 1
    from osp_private.document_versions version
    join osp_private.documents document
      on document.organization_id = version.organization_id
     and document.id = version.document_id
    join osp_private.review_decisions decision
      on decision.organization_id = version.organization_id
     and decision.case_id is not distinct from document.case_id
     and decision.subject_kind = 'document_version'
     and decision.subject_id = version.id
     and decision.decision = 'accepted'
     and decision.reason_code = 'DOCUMENT_APPROVED'
     and decision.before_sha256 = version.review_before_sha256
     and decision.after_sha256 = version.review_after_sha256
    where version.organization_id = new.organization_id
      and version.id = new.source_version_id
      and document.case_id = new.case_id
      and version.document_type = 'supplier_requirement'
      and version.status = 'approved'
  ) then
    raise exception using errcode = '23514', message = 'EXTRACTION_DOCUMENT_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from osp_private.extraction_fields field
    where field.organization_id = new.organization_id
      and field.extraction_id = new.id
      and (
        field.validation = 'invalid'
        or pg_catalog.jsonb_array_length(field.evidence_json) = 0
        or (
          (field.validation in ('low_confidence', 'contradictory') or field.field_key ~ '^(fiscal|banking)[.]')
          and not exists (
            select 1
            from osp_private.review_decisions decision
            where decision.organization_id = field.organization_id
              and decision.case_id = new.case_id
              and decision.subject_kind = 'extraction_field'
              and decision.subject_id = field.id
              and decision.decision in ('accepted', 'corrected')
              and decision.before_sha256 = field.before_sha256
              and decision.after_sha256 = field.after_sha256
          )
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'EXTRACTION_FIELD_REVIEW_INCOMPLETE';
  end if;
  return new;
end;
$function$;

drop trigger osp_extraction_snapshots_append_only on osp_private.document_extractions;
create trigger osp_extraction_review_transition_guard
before update or delete on osp_private.document_extractions
for each row execute function osp_private.protect_extraction_review_transition();

create function osp_private.accept_case_prefill_evidence_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_mapping_id uuid,
  p_expected_mapping_version integer,
  p_expected_after_sha256 text,
  p_actor_subject text,
  p_actor_permission text
)
returns table (
  mapping_id uuid,
  mapping_version integer,
  mapping_status text,
  mapping_review_decision_id uuid,
  document_version_id uuid,
  extraction_id uuid,
  reviewed_field_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_mapping osp_private.supplier_form_mappings%rowtype;
  target_extraction osp_private.document_extractions%rowtype;
  target_document_version osp_private.document_versions%rowtype;
  current_values jsonb;
  document_decision_id uuid;
  mapping_decision_id uuid;
  protected_field record;
  protected_field_count integer := 0;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_expected_mapping_version < 1
     or p_expected_after_sha256 !~ '^[0-9a-f]{64}$'
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or pg_catalog.length(p_actor_subject) not between 1 and 256
     or p_actor_permission <> 'osp:operate' then
    raise exception using errcode = '42501', message = 'PREFILL_EVIDENCE_REVIEW_REJECTED';
  end if;

  perform 1
  from osp_private.customer_registration_cases case_record
  where case_record.organization_id = p_organization_id
    and case_record.id = p_case_id
    and case_record.state = 'preparing'
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
     or target_mapping.after_sha256 <> p_expected_after_sha256 then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if target_mapping.mapping_json->>'schemaVersion' is distinct from '1'
     or target_mapping.mapping_json->>'status' is distinct from 'ready_for_operations_review'
     or target_mapping.mapping_json->'externalEffects' is distinct from 'false'::jsonb
     or pg_catalog.jsonb_typeof(target_mapping.mapping_json->'values') is distinct from 'object'
     or pg_catalog.jsonb_typeof(target_mapping.mapping_json->'fields') is distinct from 'array'
     or pg_catalog.jsonb_array_length(target_mapping.mapping_json->'fields') = 0
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') item(field)
       where pg_catalog.jsonb_typeof(field) is distinct from 'object'
         or field->>'status' is distinct from 'prepared'
         or pg_catalog.jsonb_typeof(field->'evidenceIds') is distinct from 'array'
         or pg_catalog.jsonb_array_length(field->'evidenceIds') = 0
     ) then
    raise exception using errcode = '23514', message = 'FORM_MAPPING_NOT_READY';
  end if;

  select instance.values_json into current_values
  from osp_private.case_form_instances instance
  where instance.organization_id = p_organization_id
    and instance.case_id = p_case_id
    and instance.template_version_id = target_mapping.template_version_id
  order by instance.updated_at desc, instance.id asc
  limit 1
  for update;
  if not found or current_values is distinct from target_mapping.mapping_json->'values' then
    raise exception using errcode = '40001', message = 'FORM_MAPPING_NOT_READY';
  end if;

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

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_mapping.mapping_json->'fields') item(field)
    cross join lateral pg_catalog.jsonb_array_elements_text(field->'evidenceIds') evidence(id)
    where evidence.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1
         from osp_private.extraction_fields source_field
         where source_field.organization_id = p_organization_id
           and source_field.extraction_id = target_extraction.id
           and source_field.id::text = evidence.id
       )
  ) or exists (
    select 1
    from osp_private.extraction_fields field
    where field.organization_id = p_organization_id
      and field.extraction_id = target_extraction.id
      and (field.validation = 'invalid' or pg_catalog.jsonb_array_length(field.evidence_json) = 0)
  ) then
    raise exception using errcode = '23514', message = 'EXTRACTION_FIELD_REVIEW_INCOMPLETE';
  end if;

  if target_document_version.status = 'review_required' then
    perform 1
    from osp_private.approve_document_version_command(
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
      select 1
      from osp_private.review_decisions decision
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
        'extraction_field', protected_field.id, 'accepted', p_actor_subject,
        p_actor_permission, protected_field.before_sha256,
        protected_field.after_sha256, 'SOURCE_CONFIRMED',
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

  mapping_decision_id := pg_catalog.gen_random_uuid();
  insert into osp_private.review_decisions (
    id, organization_id, case_id, subject_kind, subject_id, decision,
    reviewer_subject, reviewer_permission, before_sha256, after_sha256,
    reason_code, created_at
  ) values (
    mapping_decision_id, p_organization_id, p_case_id, 'form_mapping',
    target_mapping.id, 'accepted', p_actor_subject, p_actor_permission,
    target_mapping.before_sha256, target_mapping.after_sha256,
    'MAPPING_CONFIRMED', pg_catalog.statement_timestamp()
  );

  update osp_private.supplier_form_mappings mapping
  set status = 'accepted', review_decision_id = mapping_decision_id,
      updated_at = pg_catalog.statement_timestamp()
  where mapping.organization_id = p_organization_id
    and mapping.case_id = p_case_id
    and mapping.id = target_mapping.id
    and mapping.version = p_expected_mapping_version
    and mapping.status = 'unresolved';
  if not found then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  return query select
    target_mapping.id,
    target_mapping.version,
    'accepted'::text,
    mapping_decision_id,
    target_document_version.id,
    target_extraction.id,
    protected_field_count;
end;
$function$;

-- Earlier approvals already carry immutable actor, timestamp, permission, and
-- exact review hashes. Canonicalize that existing audit evidence so those
-- approved documents are eligible for future snapshots.
insert into osp_private.review_decisions (
  id, organization_id, case_id, subject_kind, subject_id, decision,
  reviewer_subject, reviewer_permission, before_sha256, after_sha256,
  reason_code, created_at
)
select
  pg_catalog.gen_random_uuid(), version.organization_id, document.case_id,
  'document_version', version.id, 'accepted', version.approved_by_subject,
  version.approved_by_permission, version.review_before_sha256,
  version.review_after_sha256, 'DOCUMENT_APPROVED', version.approved_at
from osp_private.document_versions version
join osp_private.documents document
  on document.organization_id = version.organization_id
 and document.id = version.document_id
where version.status = 'approved'
  and document.case_id is null
  and version.document_type in (
    'proof_of_address', 'sat_compliance_opinion',
    'tax_status_certificate', 'bank_statement'
  )
  and version.approved_at is not null
  and version.approved_by_subject is not null
  and version.approved_by_permission = 'osp:operate'
  and not exists (
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
  );

revoke all on function osp_private.protect_extraction_review_transition() from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.accept_case_prefill_evidence_command(uuid, uuid, uuid, integer, text, text, text) from public, anon, authenticated, osp_worker;
grant execute on function osp_private.accept_case_prefill_evidence_command(uuid, uuid, uuid, integer, text, text, text) to osp_workflow_api;
