create extension if not exists pgcrypto with schema extensions;

alter table osp_private.background_jobs drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs add constraint background_jobs_kind_check check (kind in (
  'gmail_ingest', 'duplicate_review_refresh', 'document_extract', 'quarterly_document_check', 'form_ai_mapping'
));

create table osp_private.documents (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid,
  version integer not null check (version between 0 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.document_versions (
  id uuid primary key,
  organization_id uuid not null,
  document_id uuid not null,
  version integer not null check (version between 0 and 2147483647),
  document_type text not null,
  status text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  bucket_id text not null check (bucket_id in ('osp-corporate-documents', 'osp-derived-documents')),
  opaque_object_key text not null check (opaque_object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  content_type text not null,
  valid_from date,
  expires_at date,
  uploaded_by_subject text not null check (
    char_length(uploaded_by_subject) between 1 and 256
    and uploaded_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  review_before_sha256 text not null check (review_before_sha256 ~ '^[0-9a-f]{64}$'),
  review_after_sha256 text not null check (review_after_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz,
  approved_by_subject text,
  approved_by_permission text check (approved_by_permission = 'osp:operate'),
  supersedes_version_id uuid,
  retention_disposition text not null default 'retain' check (retention_disposition in ('retain', 'eligible_for_disposition', 'disposed')),
  retention_disposition_at timestamptz,
  retention_actor_subject text,
  disposed_at timestamptz,
  disposed_by_subject text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, document_id, id),
  unique (organization_id, document_id, version),
  foreign key (organization_id, document_id) references osp_private.documents(organization_id, id),
  foreign key (organization_id, document_id, supersedes_version_id) references osp_private.document_versions(organization_id, document_id, id),
  constraint osp_document_type_check check (document_type in (
    'proof_of_address', 'sat_compliance_opinion',
    'tax_status_certificate', 'bank_statement', 'supplier_requirement'
  )),
  constraint osp_document_status_check check (status in (
    'uploaded', 'analyzing', 'review_required', 'approved', 'rejected', 'superseded'
  )),
  constraint osp_quarterly_eligibility_check check (
    (document_type in (
      'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
    ) and valid_from is not null and expires_at = (valid_from + interval '3 months')::date)
    or (document_type = 'supplier_requirement' and valid_from is null and expires_at is null)
  ),
  constraint osp_document_approval_audit_check check (
    (status in ('approved', 'superseded') and approved_at is not null and approved_by_subject is not null and approved_by_permission = 'osp:operate')
    or (status not in ('approved', 'superseded') and approved_at is null and approved_by_subject is null and approved_by_permission is null)
  ),
  constraint osp_document_supersedes_check check (supersedes_version_id is null or supersedes_version_id <> id),
  constraint osp_retention_audit_check check (
    (retention_disposition = 'retain' and retention_disposition_at is null and retention_actor_subject is null
      and disposed_at is null and disposed_by_subject is null)
    or (retention_disposition = 'eligible_for_disposition' and retention_disposition_at is not null
      and char_length(retention_actor_subject) between 1 and 256
      and retention_actor_subject ~ '^[A-Za-z0-9:_@.-]+$' and disposed_at is null and disposed_by_subject is null)
    or (retention_disposition = 'disposed' and retention_disposition_at is not null
      and char_length(retention_actor_subject) between 1 and 256
      and retention_actor_subject ~ '^[A-Za-z0-9:_@.-]+$' and disposed_at is not null
      and disposed_at >= retention_disposition_at and char_length(disposed_by_subject) between 1 and 256
      and disposed_by_subject ~ '^[A-Za-z0-9:_@.-]+$')
  )
);

create table osp_private.source_safety_assessments (
  id uuid primary key,
  organization_id uuid not null,
  document_version_id uuid not null,
  version integer not null check (version between 0 and 2147483647),
  status text not null check (status in ('pending', 'safe', 'unsafe', 'failed')),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text not null,
  assessed_at timestamptz not null,
  unique (organization_id, id),
  unique (organization_id, document_version_id, version),
  foreign key (organization_id, document_version_id) references osp_private.document_versions(organization_id, id)
);

create table osp_private.document_extractions (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  source_version_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  schema_sha256 text not null check (schema_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('review_required', 'reviewed', 'failed')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, source_version_id) references osp_private.document_versions(organization_id, id)
);

create table osp_private.extraction_fields (
  id uuid primary key,
  organization_id uuid not null,
  extraction_id uuid not null,
  field_key text not null,
  presence text not null check (presence in ('present', 'blank', 'absent', 'uncertain')),
  value_json jsonb,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'array'),
  before_sha256 text not null check (before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text not null check (after_sha256 ~ '^[0-9a-f]{64}$'),
  provider text not null check (provider in ('azure_document_intelligence', 'openai_structured_outputs', 'xlsx_structural')),
  model_version text not null,
  schema_version integer not null check (schema_version = 1),
  validation text not null check (validation in ('valid', 'low_confidence', 'contradictory', 'invalid')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, extraction_id, field_key),
  foreign key (organization_id, extraction_id) references osp_private.document_extractions(organization_id, id),
  constraint osp_extraction_presence_value_check check (
    (presence = 'present' and value_json is not null and jsonb_typeof(value_json) in ('string', 'number', 'boolean')) or
    (presence in ('blank', 'absent') and value_json is null) or
    (presence = 'uncertain' and (value_json is null or jsonb_typeof(value_json) in ('string', 'number', 'boolean')))
  ),
  constraint osp_extraction_field_key_check check (field_key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'),
  constraint osp_extraction_evidence_nonempty_check check (jsonb_array_length(evidence_json) > 0),
  constraint osp_extraction_model_version_check check (model_version = btrim(model_version) and length(model_version) between 1 and 128)
);

create table osp_private.canonical_xbf_fields (
  id uuid primary key,
  organization_id uuid not null,
  field_key text not null,
  classification text not null check (classification in ('general', 'fiscal', 'banking')),
  version integer not null check (version between 0 and 2147483647),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, field_key)
);

create table osp_private.form_templates (
  id uuid primary key,
  organization_id uuid not null,
  name text not null,
  version integer not null check (version between 0 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table osp_private.form_template_versions (
  id uuid primary key,
  organization_id uuid not null,
  template_id uuid not null,
  version integer not null check (version between 0 and 2147483647),
  status text not null check (status in ('draft', 'published')),
  schema_sha256 text not null check (schema_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, template_id, version),
  foreign key (organization_id, template_id) references osp_private.form_templates(organization_id, id)
);

create table osp_private.form_fields (
  id uuid primary key,
  organization_id uuid not null,
  template_version_id uuid not null,
  position integer not null check (position >= 0),
  field_key text not null,
  definition_json jsonb not null check (jsonb_typeof(definition_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, template_version_id, id),
  unique (organization_id, template_version_id, field_key),
  unique (organization_id, template_version_id, position),
  foreign key (organization_id, template_version_id) references osp_private.form_template_versions(organization_id, id)
);

create table osp_private.form_rules (
  id uuid primary key,
  organization_id uuid not null,
  template_version_id uuid not null,
  target_field_id uuid not null,
  rule_json jsonb not null check (jsonb_typeof(rule_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, template_version_id) references osp_private.form_template_versions(organization_id, id),
  foreign key (organization_id, template_version_id, target_field_id) references osp_private.form_fields(organization_id, template_version_id, id)
);

create table osp_private.supplier_form_mappings (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  template_version_id uuid not null,
  extraction_id uuid not null,
  version integer not null check (version between 0 and 2147483647),
  status text not null check (status in ('unresolved', 'accepted', 'corrected', 'rejected')),
  mapping_json jsonb not null check (jsonb_typeof(mapping_json) = 'object'),
  before_sha256 text not null check (before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text not null check (after_sha256 ~ '^[0-9a-f]{64}$'),
  review_decision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, template_version_id) references osp_private.form_template_versions(organization_id, id),
  foreign key (organization_id, extraction_id) references osp_private.document_extractions(organization_id, id),
  constraint osp_mapping_review_link_check check (
    (status = 'unresolved' and review_decision_id is null)
    or (status in ('accepted', 'corrected', 'rejected') and review_decision_id is not null)
  )
);

create table osp_private.case_form_instances (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  template_version_id uuid not null,
  version integer not null check (version between 0 and 2147483647),
  values_json jsonb not null check (jsonb_typeof(values_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, case_id, template_version_id, id, version),
  unique (organization_id, case_id, id, version),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, template_version_id) references osp_private.form_template_versions(organization_id, id)
);

create table osp_private.review_decisions (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid,
  subject_kind text not null check (subject_kind in ('extraction_field', 'document_version', 'form_mapping')),
  subject_id uuid not null,
  decision text not null check (decision in ('accepted', 'corrected', 'rejected')),
  reviewer_subject text not null,
  reviewer_permission text not null check (reviewer_permission = 'osp:operate'),
  before_sha256 text not null check (before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text not null check (after_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text not null check (reason_code in (
    'SOURCE_CONFIRMED', 'VALUE_CORRECTED', 'DOCUMENT_APPROVED', 'MAPPING_CONFIRMED',
    'MAPPING_CORRECTED', 'REJECTED_INVALID', 'REJECTED_UNSUPPORTED'
  )),
  created_at timestamptz not null,
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  constraint osp_review_case_scope_check check (case_id is not null or subject_kind = 'document_version')
);

create table osp_private.case_package_input_snapshots (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  case_version integer not null check (case_version between 0 and 2147483647),
  document_version_ids uuid[] not null check (cardinality(document_version_ids) > 0),
  extraction_ids uuid[] not null check (cardinality(extraction_ids) > 0),
  template_version_id uuid not null,
  form_instance_id uuid not null,
  form_instance_version integer not null check (form_instance_version between 0 and 2147483647),
  review_decision_ids uuid[] not null check (cardinality(review_decision_ids) > 0),
  mapping_refs jsonb not null check (jsonb_typeof(mapping_refs) = 'array' and jsonb_array_length(mapping_refs) > 0),
  field_evidence_refs jsonb not null check (jsonb_typeof(field_evidence_refs) = 'array' and jsonb_array_length(field_evidence_refs) > 0),
  canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, canonical_sha256),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, template_version_id) references osp_private.form_template_versions(organization_id, id),
  foreign key (organization_id, form_instance_id) references osp_private.case_form_instances(organization_id, id),
  foreign key (organization_id, case_id, template_version_id, form_instance_id, form_instance_version)
    references osp_private.case_form_instances(organization_id, case_id, template_version_id, id, version)
);

alter table osp_private.supplier_form_mappings
  add foreign key (organization_id, case_id, review_decision_id)
  references osp_private.review_decisions(organization_id, case_id, id);

create table osp_private.document_renewal_alerts (
  id uuid primary key,
  organization_id uuid not null,
  document_version_id uuid not null,
  boundary_days integer not null check (boundary_days in (30, 14, 7, 0)),
  version integer not null check (version between 0 and 2147483647),
  status text not null check (status in ('pending', 'acknowledged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, document_version_id, boundary_days),
  foreign key (organization_id, document_version_id) references osp_private.document_versions(organization_id, id)
);

create function osp_private.xlsx_column_number(column_name text)
returns integer
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
declare
  result integer := 0;
  position integer;
begin
  if column_name !~ '^[A-Z]{1,3}$' then
    return null;
  end if;
  for position in 1..length(column_name) loop
    result := result * 26 + ascii(substr(column_name, position, 1)) - ascii('A') + 1;
  end loop;
  return result;
end;
$function$;

create function osp_private.validate_extraction_field_payload()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
declare
  expected_source_version_id uuid;
  evidence jsonb;
  key_count integer;
  range_parts text[];
  start_column text;
  end_column text;
  start_row_text text;
  end_row_text text;
  start_row integer;
  end_row integer;
begin
  if jsonb_typeof(new.evidence_json) <> 'array' or jsonb_array_length(new.evidence_json) = 0 then
    raise exception using errcode = '23514', message = 'EVIDENCE_ARRAY_INVALID';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(new.evidence_json) as item(locator)
     group by locator->>'kind', locator->>'sourceVersionId', locator->>'rawEvidenceHash'
    having count(*) > 1
  ) then
    raise exception using errcode = '23514', message = 'EVIDENCE_LOCATOR_DUPLICATE';
  end if;
  select source_version_id into expected_source_version_id
    from osp_private.document_extractions
   where organization_id = new.organization_id and id = new.extraction_id;
  if not found then
    raise exception using errcode = '23503', message = 'EXTRACTION_SCOPE_MISMATCH';
  end if;

  for evidence in select value from jsonb_array_elements(new.evidence_json) loop
    if jsonb_typeof(evidence) <> 'object' then
      raise exception using errcode = '23514', message = 'EVIDENCE_OBJECT_INVALID';
    end if;
    select count(*) into key_count from jsonb_object_keys(evidence);
    if key_count <> 5 or evidence->>'sourceVersionId' <> expected_source_version_id::text
       or coalesce(evidence->>'rawEvidenceHash', '') !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '23514', message = 'EVIDENCE_SOURCE_MISMATCH';
    end if;

    if evidence->>'kind' = 'pdf_region' then
      if not (evidence ?& array['kind', 'sourceVersionId', 'page', 'polygon', 'rawEvidenceHash'])
         or jsonb_typeof(evidence->'page') <> 'number' or (evidence->>'page') !~ '^[1-9][0-9]*$'
         or jsonb_typeof(evidence->'polygon') <> 'array'
         or jsonb_array_length(evidence->'polygon') < 8
         or mod(jsonb_array_length(evidence->'polygon'), 2) <> 0
         or exists (
           select 1 from jsonb_array_elements(evidence->'polygon') coordinate
            where jsonb_typeof(coordinate) <> 'number' or (coordinate #>> '{}')::numeric < 0
         ) then
        raise exception using errcode = '23514', message = 'PDF_REGION_INVALID';
      end if;
    elsif evidence->>'kind' = 'xlsx_cell' then
      if not (evidence ?& array['kind', 'sourceVersionId', 'sheet', 'cellRange', 'rawEvidenceHash'])
         or btrim(coalesce(evidence->>'sheet', '')) = ''
         or evidence->>'sheet' <> btrim(evidence->>'sheet')
         or length(evidence->>'sheet') > 128
         or coalesce(evidence->>'cellRange', '') !~ '^[A-Z]{1,3}[1-9][0-9]*(:[A-Z]{1,3}[1-9][0-9]*)?$' then
        raise exception using errcode = '23514', message = 'XLSX_RANGE_INVALID';
      end if;
      range_parts := regexp_split_to_array(evidence->>'cellRange', ':');
      start_column := substring(range_parts[1] from '^([A-Z]{1,3})');
      end_column := substring(coalesce(range_parts[2], range_parts[1]) from '^([A-Z]{1,3})');
      start_row_text := substring(range_parts[1] from '([0-9]+)$');
      end_row_text := substring(coalesce(range_parts[2], range_parts[1]) from '([0-9]+)$');
      if length(start_row_text) > 7 or length(end_row_text) > 7 then
        raise exception using errcode = '23514', message = 'XLSX_RANGE_INVALID';
      end if;
      start_row := start_row_text::integer;
      end_row := end_row_text::integer;
      if osp_private.xlsx_column_number(start_column) > 16384
         or osp_private.xlsx_column_number(end_column) > 16384
         or start_row > 1048576 or end_row > 1048576
         or osp_private.xlsx_column_number(start_column) > osp_private.xlsx_column_number(end_column)
         or start_row > end_row then
        raise exception using errcode = '23514', message = 'XLSX_RANGE_INVALID';
      end if;
    else
      raise exception using errcode = '23514', message = 'EVIDENCE_KIND_INVALID';
    end if;
  end loop;
  return new;
end;
$function$;

create function osp_private.validate_review_decision()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
declare
  expected_case_id uuid;
  expected_document_type text;
  expected_before_sha256 text;
  expected_after_sha256 text;
begin
  if new.subject_kind = 'extraction_field' then
    select extraction.case_id, field.before_sha256, field.after_sha256
      into expected_case_id, expected_before_sha256, expected_after_sha256
      from osp_private.extraction_fields field
      join osp_private.document_extractions extraction
        on extraction.organization_id = field.organization_id and extraction.id = field.extraction_id
     where field.organization_id = new.organization_id and field.id = new.subject_id;
  elsif new.subject_kind = 'document_version' then
    select document.case_id, version.document_type, version.review_before_sha256, version.review_after_sha256
      into expected_case_id, expected_document_type, expected_before_sha256, expected_after_sha256
      from osp_private.document_versions version
      join osp_private.documents document
        on document.organization_id = version.organization_id and document.id = version.document_id
     where version.organization_id = new.organization_id and version.id = new.subject_id;
  elsif new.subject_kind = 'form_mapping' then
    select mapping.case_id, mapping.before_sha256, mapping.after_sha256
      into expected_case_id, expected_before_sha256, expected_after_sha256
      from osp_private.supplier_form_mappings mapping
     where mapping.organization_id = new.organization_id and mapping.id = new.subject_id;
  end if;
  if not found or expected_case_id is distinct from new.case_id then
    raise exception using errcode = '23514', message = 'REVIEW_SUBJECT_SCOPE_MISMATCH';
  end if;
  if new.subject_kind = 'document_version' and new.case_id is null
     and expected_document_type not in (
       'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
     ) then
    raise exception using errcode = '23514', message = 'REVIEW_SUBJECT_SCOPE_MISMATCH';
  end if;
  if expected_before_sha256 is distinct from new.before_sha256 or expected_after_sha256 is distinct from new.after_sha256 then
    raise exception using errcode = '23514', message = 'REVIEW_DECISION_HASH_MISMATCH';
  end if;
  return new;
end;
$function$;

create function osp_private.validate_mapping_review_link()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if new.status = 'unresolved' then
    return new;
  end if;
  if not exists (
    select 1 from osp_private.review_decisions decision
     where decision.organization_id = new.organization_id
       and decision.case_id = new.case_id
       and decision.id = new.review_decision_id
       and decision.subject_kind = 'form_mapping'
       and decision.subject_id = new.id
       and decision.decision = new.status
       and decision.before_sha256 = new.before_sha256
       and decision.after_sha256 = new.after_sha256
  ) then
    raise exception using errcode = '23514', message = 'MAPPING_REVIEW_LINK_INVALID';
  end if;
  return new;
end;
$function$;

-- Canonical v2 cross-runtime test vector SHA-256:
-- 4a71993745a730eaeb337630cc40dd46c32f08bff57bf228ad968ef89c7db3c2
create function osp_private.compute_package_input_snapshot_sha256(
  p_organization_id uuid,
  p_case_id uuid,
  p_case_version integer,
  p_document_version_ids uuid[],
  p_extraction_ids uuid[],
  p_template_version_id uuid,
  p_form_instance_id uuid,
  p_form_instance_version integer,
  p_review_decision_ids uuid[],
  p_mapping_refs jsonb,
  p_field_evidence_refs jsonb
)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, extensions
as $function$
declare
  canonical_text text;
  segment text;
begin
  canonical_text := 'osp-package-input-snapshot-v2'
    || E'\norganizationId=' || p_organization_id::text
    || E'\ncaseId=' || p_case_id::text
    || E'\ncaseVersion=' || p_case_version::text;
  select string_agg('documentVersionId=' || item.value::text, E'\n' order by item.value::text)
    into segment from unnest(p_document_version_ids) as item(value);
  canonical_text := canonical_text || E'\n' || segment;
  select string_agg('extractionId=' || item.value::text, E'\n' order by item.value::text)
    into segment from unnest(p_extraction_ids) as item(value);
  canonical_text := canonical_text || E'\n' || segment
    || E'\ntemplateVersionId=' || p_template_version_id::text
    || E'\nformInstanceId=' || p_form_instance_id::text
    || E'\nformInstanceVersion=' || p_form_instance_version::text;
  select string_agg('reviewDecisionId=' || item.value::text, E'\n' order by item.value::text)
    into segment from unnest(p_review_decision_ids) as item(value);
  canonical_text := canonical_text || E'\n' || segment;
  select string_agg(
    concat(
      'mappingRef=', ref->>'mappingId', '|', ref->>'mappingVersion', '|', ref->>'mappingSha256',
      '|', ref->>'extractionId', '|', ref->>'reviewDecisionId'
    ),
    E'\n' order by ref->>'mappingId'
  ) into segment from jsonb_array_elements(p_mapping_refs) as item(ref);
  canonical_text := canonical_text || E'\n' || segment;
  select string_agg(
    concat(
      'fieldEvidenceRef=', ref->>'fieldId', '|', ref->>'extractionId', '|', ref->>'kind',
      '|', ref->>'sourceVersionId', '|', ref->>'rawEvidenceHash'
    ),
    E'\n' order by ref->>'fieldId', ref->>'extractionId', ref->>'kind', ref->>'sourceVersionId', ref->>'rawEvidenceHash'
  ) into segment from jsonb_array_elements(p_field_evidence_refs) as item(ref);
  canonical_text := canonical_text || E'\n' || segment;
  return encode(extensions.digest(convert_to(canonical_text, 'UTF8'), 'sha256'), 'hex');
end;
$function$;

create function osp_private.validate_package_input_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
declare
  expected_mapping_refs jsonb;
  expected_field_evidence_refs jsonb;
  proof_of_address_count integer;
  sat_compliance_opinion_count integer;
  tax_status_certificate_count integer;
  bank_statement_count integer;
begin
  if cardinality(new.document_version_ids) <> (select count(distinct value) from unnest(new.document_version_ids) as item(value))
     or cardinality(new.extraction_ids) <> (select count(distinct value) from unnest(new.extraction_ids) as item(value))
     or cardinality(new.review_decision_ids) <> (select count(distinct value) from unnest(new.review_decision_ids) as item(value)) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_REFERENCE_DUPLICATE';
  end if;
  new.document_version_ids := array(select value from unnest(new.document_version_ids) as item(value) order by value::text);
  new.extraction_ids := array(select value from unnest(new.extraction_ids) as item(value) order by value::text);
  new.review_decision_ids := array(select value from unnest(new.review_decision_ids) as item(value) order by value::text);
  if jsonb_typeof(new.mapping_refs) <> 'array' or jsonb_array_length(new.mapping_refs) = 0
     or exists (
       select 1 from jsonb_array_elements(new.mapping_refs) as item(ref)
        where jsonb_typeof(ref) <> 'object'
          or (select count(*) from jsonb_object_keys(ref)) <> 5
          or not (ref ?& array['mappingId', 'mappingVersion', 'mappingSha256', 'extractionId', 'reviewDecisionId'])
          or coalesce(ref->>'mappingId', '') !~ '^[0-9a-f-]{36}$'
          or coalesce(ref->>'mappingVersion', '') !~ '^(0|[1-9][0-9]*)$'
          or coalesce(ref->>'mappingSha256', '') !~ '^[0-9a-f]{64}$'
          or coalesce(ref->>'extractionId', '') !~ '^[0-9a-f-]{36}$'
          or coalesce(ref->>'reviewDecisionId', '') !~ '^[0-9a-f-]{36}$'
     ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_MAPPING_REFS_INVALID';
  end if;
  if jsonb_typeof(new.field_evidence_refs) <> 'array' or jsonb_array_length(new.field_evidence_refs) = 0
     or exists (
       select 1 from jsonb_array_elements(new.field_evidence_refs) as item(ref)
        where jsonb_typeof(ref) <> 'object'
          or (select count(*) from jsonb_object_keys(ref)) <> 5
          or not (ref ?& array['fieldId', 'extractionId', 'kind', 'sourceVersionId', 'rawEvidenceHash'])
          or coalesce(ref->>'fieldId', '') !~ '^[0-9a-f-]{36}$'
          or coalesce(ref->>'extractionId', '') !~ '^[0-9a-f-]{36}$'
          or ref->>'kind' not in ('pdf_region', 'xlsx_cell')
          or coalesce(ref->>'sourceVersionId', '') !~ '^[0-9a-f-]{36}$'
          or coalesce(ref->>'rawEvidenceHash', '') !~ '^[0-9a-f]{64}$'
     ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FIELD_EVIDENCE_REFS_INVALID';
  end if;
  perform 1 from osp_private.customer_registration_cases registration_case
   where registration_case.organization_id = new.organization_id
     and registration_case.id = new.case_id
     and registration_case.aggregate_version = new.case_version
     and registration_case.state = 'operations_review'
   for share;
  if not found then
    raise exception using errcode = '23514', message = 'SNAPSHOT_CASE_VERSION_MISMATCH';
  end if;
  if not exists (
    select 1 from osp_private.form_template_versions template
     where template.organization_id = new.organization_id and template.id = new.template_version_id and template.status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FORM_SCOPE_MISMATCH';
  end if;
  perform 1 from osp_private.case_form_instances form_instance
   where form_instance.organization_id = new.organization_id
     and form_instance.case_id = new.case_id
     and form_instance.template_version_id = new.template_version_id
     and form_instance.id = new.form_instance_id
     and form_instance.version = new.form_instance_version
   for update;
  if not found then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FORM_SCOPE_MISMATCH';
  end if;
  if cardinality(new.document_version_ids) <> (
    select count(*) from osp_private.document_versions version
      join osp_private.documents document
        on document.organization_id = version.organization_id and document.id = version.document_id
     where version.organization_id = new.organization_id
        and (
          (version.document_type = 'supplier_requirement' and document.case_id = new.case_id)
          or (
            version.document_type in (
              'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
            ) and (document.case_id = new.case_id or (
              document.case_id is null and version.document_type in (
                'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
              )
            ))
          )
        )
        and version.id = any(new.document_version_ids)
        and version.status = 'approved'
        and (
          version.document_type = 'supplier_requirement'
          or (
            version.valid_from <= (new.created_at at time zone 'UTC')::date
            and (new.created_at at time zone 'UTC')::date < version.expires_at
          )
        )
   ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_DOCUMENT_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1 from osp_private.document_versions version
     where version.organization_id = new.organization_id
       and version.id = any(new.document_version_ids)
       and version.document_type in (
         'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
       )
       and exists (
         select 1 from osp_private.document_versions other_version
          where other_version.organization_id = version.organization_id
            and other_version.document_type = version.document_type
            and other_version.id <> version.id
            and other_version.status = 'approved'
            and other_version.valid_from <= (new.created_at at time zone 'UTC')::date
            and (new.created_at at time zone 'UTC')::date < other_version.expires_at
       )
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_DOCUMENT_NOT_LATEST';
  end if;
  select
    count(*) filter (where version.document_type = 'proof_of_address'),
    count(*) filter (where version.document_type = 'sat_compliance_opinion'),
    count(*) filter (where version.document_type = 'tax_status_certificate'),
    count(*) filter (where version.document_type = 'bank_statement')
    into proof_of_address_count, sat_compliance_opinion_count, tax_status_certificate_count, bank_statement_count
    from osp_private.document_versions version
   where version.organization_id = new.organization_id and version.id = any(new.document_version_ids);
  if proof_of_address_count <> 1 or sat_compliance_opinion_count <> 1
     or tax_status_certificate_count <> 1 or bank_statement_count <> 1 then
    raise exception using errcode = '23514', message = 'SNAPSHOT_QUARTERLY_DOCUMENT_REQUIRED';
  end if;
  if cardinality(new.extraction_ids) <> (
    select count(*) from osp_private.document_extractions extraction
     where extraction.organization_id = new.organization_id
       and extraction.case_id = new.case_id
        and extraction.id = any(new.extraction_ids)
        and extraction.source_version_id = any(new.document_version_ids)
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_EXTRACTION_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1 from osp_private.document_extractions extraction
     where extraction.organization_id = new.organization_id
       and extraction.id = any(new.extraction_ids)
       and extraction.status <> 'reviewed'
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_EXTRACTION_NOT_REVIEWED';
  end if;
  if exists (
    select 1 from unnest(new.extraction_ids) as item(extraction_id)
     where not exists (
       select 1 from osp_private.extraction_fields field
        where field.organization_id = new.organization_id and field.extraction_id = extraction_id
     )
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_EXTRACTION_FIELDS_REQUIRED';
  end if;
  if cardinality(new.review_decision_ids) <> (
    select count(*) from osp_private.review_decisions decision
     where decision.organization_id = new.organization_id
       and decision.id = any(new.review_decision_ids)
       and decision.decision in ('accepted', 'corrected')
       and (decision.case_id = new.case_id or (
         decision.case_id is null and decision.subject_kind = 'document_version' and exists (
           select 1 from osp_private.document_versions version
           join osp_private.documents document
             on document.organization_id = version.organization_id and document.id = version.document_id
             where version.organization_id = new.organization_id and version.id = decision.subject_id
               and document.case_id is null and version.document_type in (
                 'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement'
               )
         )
       ))
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_REVIEW_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1 from osp_private.review_decisions decision
     where decision.organization_id = new.organization_id
       and (decision.case_id = new.case_id or decision.case_id is null)
       and decision.id = any(new.review_decision_ids)
       and not (
         (decision.subject_kind = 'document_version' and decision.subject_id = any(new.document_version_ids) and exists (
           select 1 from osp_private.document_versions version
           join osp_private.documents document
             on document.organization_id = version.organization_id and document.id = version.document_id
            where version.organization_id = new.organization_id and version.id = decision.subject_id
              and decision.case_id is not distinct from document.case_id
         ))
         or (decision.subject_kind = 'extraction_field' and exists (
           select 1 from osp_private.extraction_fields field
            where field.organization_id = new.organization_id and field.id = decision.subject_id and field.extraction_id = any(new.extraction_ids)
         ))
         or (decision.subject_kind = 'form_mapping' and exists (
           select 1 from osp_private.supplier_form_mappings mapping
            where mapping.organization_id = new.organization_id and mapping.case_id = new.case_id
              and mapping.id = decision.subject_id and mapping.template_version_id = new.template_version_id
              and mapping.extraction_id = any(new.extraction_ids)
         ))
       )
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_REVIEW_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1 from unnest(new.document_version_ids) as item(document_version_id)
     where not exists (
       select 1 from osp_private.review_decisions decision
       join osp_private.document_versions version
         on version.organization_id = decision.organization_id and version.id = decision.subject_id
       join osp_private.documents document
         on document.organization_id = version.organization_id and document.id = version.document_id
        where decision.organization_id = new.organization_id
           and decision.id = any(new.review_decision_ids) and decision.subject_kind = 'document_version'
           and decision.subject_id = document_version_id and decision.decision = 'accepted'
           and decision.reason_code = 'DOCUMENT_APPROVED'
           and decision.case_id is not distinct from document.case_id
     )
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_REVIEW_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1 from unnest(new.extraction_ids) as item(extraction_id)
     where not exists (
       select 1 from osp_private.supplier_form_mappings mapping
       join osp_private.review_decisions decision
         on decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id
        and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping' and decision.subject_id = mapping.id
        and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256
        where mapping.organization_id = new.organization_id and mapping.case_id = new.case_id
          and mapping.template_version_id = new.template_version_id and mapping.extraction_id = extraction_id
          and mapping.status in ('accepted', 'corrected') and decision.decision = mapping.status
          and decision.id = any(new.review_decision_ids)
     )
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_MAPPING_DECISION_MISMATCH';
  end if;
  if exists (
    select 1 from osp_private.extraction_fields field
     where field.organization_id = new.organization_id and field.extraction_id = any(new.extraction_ids)
       and (field.validation = 'invalid' or (
         (field.validation in ('low_confidence', 'contradictory') or field.field_key ~ '^(fiscal|banking)[.]')
         and not exists (
           select 1 from osp_private.review_decisions decision
            where decision.organization_id = new.organization_id and decision.case_id = new.case_id
              and decision.id = any(new.review_decision_ids) and decision.subject_kind = 'extraction_field'
              and decision.subject_id = field.id and decision.decision in ('accepted', 'corrected')
              and decision.before_sha256 = field.before_sha256 and decision.after_sha256 = field.after_sha256
         )
       ))
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FIELD_REVIEW_INCOMPLETE';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'mappingId', mapping.id::text,
      'mappingVersion', mapping.version,
      'mappingSha256', mapping.after_sha256,
      'extractionId', mapping.extraction_id::text,
      'reviewDecisionId', mapping.review_decision_id::text
    ) order by mapping.id::text
  ), '[]'::jsonb) into expected_mapping_refs
    from osp_private.supplier_form_mappings mapping
    join osp_private.review_decisions decision
      on decision.organization_id = mapping.organization_id and decision.case_id = mapping.case_id
     and decision.id = mapping.review_decision_id and decision.subject_kind = 'form_mapping'
     and decision.subject_id = mapping.id and decision.decision = mapping.status
     and decision.before_sha256 = mapping.before_sha256 and decision.after_sha256 = mapping.after_sha256
   where mapping.organization_id = new.organization_id and mapping.case_id = new.case_id
     and mapping.template_version_id = new.template_version_id and mapping.extraction_id = any(new.extraction_ids)
     and mapping.status in ('accepted', 'corrected');
  if new.mapping_refs <> expected_mapping_refs or jsonb_array_length(expected_mapping_refs) = 0 then
    raise exception using errcode = '23514', message = 'SNAPSHOT_MAPPING_SET_MISMATCH';
  end if;
  if exists (
    select 1 from jsonb_array_elements(expected_mapping_refs) as item(ref)
     where (ref->>'reviewDecisionId')::uuid <> all(new.review_decision_ids)
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_MAPPING_DECISION_MISMATCH';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'fieldId', field.id::text,
      'extractionId', field.extraction_id::text,
      'kind', evidence->>'kind',
      'sourceVersionId', evidence->>'sourceVersionId',
      'rawEvidenceHash', evidence->>'rawEvidenceHash'
    ) order by field.id::text, field.extraction_id::text, evidence->>'kind', evidence->>'sourceVersionId', evidence->>'rawEvidenceHash'
  ), '[]'::jsonb) into expected_field_evidence_refs
    from osp_private.extraction_fields field
    cross join lateral jsonb_array_elements(field.evidence_json) as item(evidence)
   where field.organization_id = new.organization_id and field.extraction_id = any(new.extraction_ids);
  if jsonb_array_length(expected_field_evidence_refs) <> (
    select count(distinct ref) from jsonb_array_elements(expected_field_evidence_refs) as item(ref)
  ) then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FIELD_EVIDENCE_REFS_DUPLICATE';
  end if;
  if new.field_evidence_refs <> expected_field_evidence_refs or jsonb_array_length(expected_field_evidence_refs) = 0 then
    raise exception using errcode = '23514', message = 'SNAPSHOT_FIELD_EVIDENCE_SET_MISMATCH';
  end if;
  new.mapping_refs := expected_mapping_refs;
  new.field_evidence_refs := expected_field_evidence_refs;
  new.canonical_sha256 := osp_private.compute_package_input_snapshot_sha256(
    new.organization_id, new.case_id, new.case_version, new.document_version_ids, new.extraction_ids,
    new.template_version_id, new.form_instance_id, new.form_instance_version, new.review_decision_ids,
    new.mapping_refs, new.field_evidence_refs
  );
  return new;
end;
$function$;

create function osp_private.protect_published_template_version()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if old.status = 'published' then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_TEMPLATE_APPEND_ONLY';
  end if;
  if old.status = 'draft' and new.status = 'published' then
    perform 1 from osp_private.form_template_versions parent_version
     where parent_version.organization_id = old.organization_id and parent_version.id = old.id
     for update;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create function osp_private.protect_published_template_child()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
declare
  parent_status text;
begin
  if tg_op = 'UPDATE' and (
    new.organization_id is distinct from old.organization_id
    or new.template_version_id is distinct from old.template_version_id
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_TEMPLATE_REPARENT_FORBIDDEN';
  end if;
  select status into parent_status
    from osp_private.form_template_versions
   where organization_id = case when tg_op = 'INSERT' then new.organization_id else old.organization_id end
     and id = case when tg_op = 'INSERT' then new.template_version_id else old.template_version_id end
   for share;
  if parent_status = 'published' then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_TEMPLATE_APPEND_ONLY';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create function osp_private.protect_document_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_IDENTITY_IMMUTABLE';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.case_id is distinct from old.case_id then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_IDENTITY_IMMUTABLE';
  end if;
  if new.version <> old.version + 1 then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_INVALID';
  end if;
  return new;
end;
$function$;

create function osp_private.protect_form_instance()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if exists (
    select 1 from osp_private.case_package_input_snapshots snapshot
     where snapshot.organization_id = old.organization_id and snapshot.form_instance_id = old.id
  ) then
    raise exception using errcode = 'P0001', message = 'FORM_INSTANCE_CONSUMED';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FORM_INSTANCE_IMMUTABLE';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.case_id is distinct from old.case_id
     or new.template_version_id is distinct from old.template_version_id then
    raise exception using errcode = 'P0001', message = 'FORM_INSTANCE_IMMUTABLE';
  end if;
  if new.values_json is distinct from old.values_json and new.version <> old.version + 1 then
    raise exception using errcode = 'P0001', message = 'FORM_INSTANCE_VERSION_INVALID';
  end if;
  if new.values_json is not distinct from old.values_json and new.version <> old.version then
    raise exception using errcode = 'P0001', message = 'FORM_INSTANCE_VERSION_INVALID';
  end if;
  return new;
end;
$function$;

create function osp_private.protect_accepted_review_decision()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if old.decision = 'accepted' then
    raise exception using errcode = 'P0001', message = 'ACCEPTED_REVIEW_APPEND_ONLY';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create function osp_private.protect_document_version_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'uploaded'
       or new.approved_at is not null or new.approved_by_subject is not null or new.approved_by_permission is not null
       or new.retention_disposition <> 'retain' or new.retention_disposition_at is not null
       or new.retention_actor_subject is not null or new.disposed_at is not null or new.disposed_by_subject is not null then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_INITIAL_STATE_INVALID';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_SOURCE_APPEND_ONLY';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.document_id is distinct from old.document_id
     or new.version is distinct from old.version
     or new.document_type is distinct from old.document_type
     or new.source_sha256 is distinct from old.source_sha256
     or new.bucket_id is distinct from old.bucket_id
     or new.opaque_object_key is distinct from old.opaque_object_key
     or new.content_type is distinct from old.content_type
     or new.valid_from is distinct from old.valid_from
     or new.expires_at is distinct from old.expires_at
     or new.uploaded_by_subject is distinct from old.uploaded_by_subject
     or new.supersedes_version_id is distinct from old.supersedes_version_id
     or new.review_before_sha256 is distinct from old.review_before_sha256
     or new.review_after_sha256 is distinct from old.review_after_sha256 then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_SOURCE_APPEND_ONLY';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'uploaded' and new.status in ('analyzing', 'review_required', 'rejected'))
    or (old.status = 'analyzing' and new.status in ('review_required', 'rejected'))
    or (old.status = 'review_required' and new.status in ('approved', 'rejected'))
    or (old.status = 'approved' and new.status = 'superseded')
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_STATUS_TRANSITION_INVALID';
  end if;
  if old.status in ('rejected', 'superseded') and new.status is distinct from old.status then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_STATUS_TRANSITION_INVALID';
  end if;
  if old.approved_at is not null and (
    new.approved_at is distinct from old.approved_at
    or new.approved_by_subject is distinct from old.approved_by_subject
    or new.approved_by_permission is distinct from old.approved_by_permission
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_APPROVAL_AUDIT_IMMUTABLE';
  end if;
  if old.approved_at is null and new.approved_at is not null
     and not (old.status = 'review_required' and new.status = 'approved') then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_APPROVAL_AUDIT_IMMUTABLE';
  end if;
  if new.retention_disposition is distinct from old.retention_disposition and not (
    (old.retention_disposition = 'retain' and new.retention_disposition in ('eligible_for_disposition', 'disposed'))
    or (old.retention_disposition = 'eligible_for_disposition' and new.retention_disposition = 'disposed')
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_RETENTION_TRANSITION_INVALID';
  end if;
  if old.retention_disposition_at is not null and (
    new.retention_disposition_at is distinct from old.retention_disposition_at
    or new.retention_actor_subject is distinct from old.retention_actor_subject
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_RETENTION_AUDIT_IMMUTABLE';
  end if;
  if old.disposed_at is not null and (
    new.disposed_at is distinct from old.disposed_at
    or new.disposed_by_subject is distinct from old.disposed_by_subject
    or new.retention_disposition <> 'disposed'
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_RETENTION_AUDIT_IMMUTABLE';
  end if;
  return new;
end;
$function$;

create function osp_private.protect_mapping_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  if tg_op = 'DELETE' or old.status in ('accepted', 'corrected') or exists (
    select 1 from osp_private.case_package_input_snapshots snapshot
    cross join lateral jsonb_array_elements(snapshot.mapping_refs) as item(ref)
     where snapshot.organization_id = old.organization_id and ref->>'mappingId' = old.id::text
  ) then
    raise exception using errcode = 'P0001', message = 'MAPPING_APPEND_ONLY';
  end if;
  return new;
end;
$function$;

create function osp_private.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, osp_private
as $function$
begin
  raise exception using errcode = 'P0001', message = 'SNAPSHOT_APPEND_ONLY';
end;
$function$;

create trigger osp_published_template_versions_append_only
before update or delete on osp_private.form_template_versions
for each row execute function osp_private.protect_published_template_version();

create trigger osp_document_identity_monotonic
before update or delete on osp_private.documents
for each row execute function osp_private.protect_document_identity();

create trigger osp_form_instance_integrity
before update or delete on osp_private.case_form_instances
for each row execute function osp_private.protect_form_instance();

create trigger osp_validate_extraction_field_payload
before insert or update on osp_private.extraction_fields
for each row execute function osp_private.validate_extraction_field_payload();

create trigger osp_validate_review_decision
before insert or update on osp_private.review_decisions
for each row execute function osp_private.validate_review_decision();

create trigger osp_validate_mapping_review_link
before insert or update on osp_private.supplier_form_mappings
for each row execute function osp_private.validate_mapping_review_link();

create trigger osp_mapping_identity_append_only
before update or delete on osp_private.supplier_form_mappings
for each row execute function osp_private.protect_mapping_identity();

create trigger osp_validate_package_input_snapshot
before insert on osp_private.case_package_input_snapshots
for each row execute function osp_private.validate_package_input_snapshot();

create trigger osp_published_template_fields_append_only
before insert or update or delete on osp_private.form_fields
for each row execute function osp_private.protect_published_template_child();

create trigger osp_published_template_rules_append_only
before insert or update or delete on osp_private.form_rules
for each row execute function osp_private.protect_published_template_child();

create trigger osp_accepted_review_decisions_append_only
before update or delete on osp_private.review_decisions
for each row execute function osp_private.protect_accepted_review_decision();

create trigger osp_document_version_sources_append_only
before insert or update or delete on osp_private.document_versions
for each row execute function osp_private.protect_document_version_lifecycle();

create trigger osp_extraction_snapshots_append_only
before update or delete on osp_private.document_extractions
for each row execute function osp_private.reject_append_only_mutation();

create trigger osp_package_snapshots_append_only
before update or delete on osp_private.case_package_input_snapshots
for each row execute function osp_private.reject_append_only_mutation();

revoke all on all tables in schema osp_private from public, anon, authenticated;

grant usage on schema extensions to osp_workflow_api;
grant execute on function extensions.digest(bytea, text) to osp_workflow_api;

grant select, insert, update on osp_private.documents to osp_workflow_api;
grant select, insert, update on osp_private.document_versions to osp_workflow_api;
grant select, insert on osp_private.source_safety_assessments to osp_workflow_api;
grant select, insert on osp_private.document_extractions to osp_workflow_api;
grant select, insert on osp_private.extraction_fields to osp_workflow_api;
grant select, insert, update on osp_private.canonical_xbf_fields to osp_workflow_api;
grant select, insert, update on osp_private.form_templates to osp_workflow_api;
grant select, insert, update on osp_private.form_template_versions to osp_workflow_api;
grant select, insert, update on osp_private.form_fields to osp_workflow_api;
grant select, insert, update on osp_private.form_rules to osp_workflow_api;
grant select, insert, update on osp_private.supplier_form_mappings to osp_workflow_api;
grant select, insert, update on osp_private.case_form_instances to osp_workflow_api;
grant select, insert on osp_private.review_decisions to osp_workflow_api;
grant select on osp_private.case_package_input_snapshots to osp_workflow_api;
grant insert (
  id, organization_id, case_id, case_version, document_version_ids, extraction_ids,
  template_version_id, form_instance_id, form_instance_version, review_decision_ids,
  mapping_refs, field_evidence_refs
) on osp_private.case_package_input_snapshots to osp_workflow_api;
grant select, insert, update on osp_private.document_renewal_alerts to osp_workflow_api;

grant select, insert, update on osp_private.documents to osp_worker;
grant select on osp_private.document_versions to osp_worker;
grant select, insert on osp_private.source_safety_assessments to osp_worker;
grant select, insert on osp_private.document_extractions to osp_worker;
grant select, insert on osp_private.extraction_fields to osp_worker;
grant select on osp_private.canonical_xbf_fields to osp_worker;
grant select, insert, update on osp_private.document_renewal_alerts to osp_worker;

alter table osp_private.documents enable row level security;
alter table osp_private.documents force row level security;
alter table osp_private.document_versions enable row level security;
alter table osp_private.document_versions force row level security;
alter table osp_private.source_safety_assessments enable row level security;
alter table osp_private.source_safety_assessments force row level security;
alter table osp_private.document_extractions enable row level security;
alter table osp_private.document_extractions force row level security;
alter table osp_private.extraction_fields enable row level security;
alter table osp_private.extraction_fields force row level security;
alter table osp_private.canonical_xbf_fields enable row level security;
alter table osp_private.canonical_xbf_fields force row level security;
alter table osp_private.form_templates enable row level security;
alter table osp_private.form_templates force row level security;
alter table osp_private.form_template_versions enable row level security;
alter table osp_private.form_template_versions force row level security;
alter table osp_private.form_fields enable row level security;
alter table osp_private.form_fields force row level security;
alter table osp_private.form_rules enable row level security;
alter table osp_private.form_rules force row level security;
alter table osp_private.supplier_form_mappings enable row level security;
alter table osp_private.supplier_form_mappings force row level security;
alter table osp_private.case_form_instances enable row level security;
alter table osp_private.case_form_instances force row level security;
alter table osp_private.review_decisions enable row level security;
alter table osp_private.review_decisions force row level security;
alter table osp_private.case_package_input_snapshots enable row level security;
alter table osp_private.case_package_input_snapshots force row level security;
alter table osp_private.document_renewal_alerts enable row level security;
alter table osp_private.document_renewal_alerts force row level security;

create policy osp_documents_tenant on osp_private.documents for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_document_versions_tenant on osp_private.document_versions for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_source_safety_tenant on osp_private.source_safety_assessments for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_document_extractions_tenant on osp_private.document_extractions for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_extraction_fields_tenant on osp_private.extraction_fields for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_canonical_fields_tenant on osp_private.canonical_xbf_fields for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_form_templates_tenant on osp_private.form_templates for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_form_template_versions_tenant on osp_private.form_template_versions for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_form_fields_tenant on osp_private.form_fields for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_form_rules_tenant on osp_private.form_rules for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_supplier_form_mappings_tenant on osp_private.supplier_form_mappings for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_case_form_instances_tenant on osp_private.case_form_instances for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_review_decisions_tenant on osp_private.review_decisions for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_package_snapshots_tenant on osp_private.case_package_input_snapshots for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_document_renewal_alerts_tenant on osp_private.document_renewal_alerts for all to osp_workflow_api, osp_worker using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

do $bucket_boundary$
declare
  existing_bucket record;
begin
  select id, name, public, file_size_limit, allowed_mime_types into existing_bucket
    from storage.buckets where id = 'osp-corporate-documents';
  if found then
    if existing_bucket.public is distinct from false
       or existing_bucket.name is distinct from 'osp-corporate-documents'
       or existing_bucket.file_size_limit is distinct from 26214400
       or existing_bucket.allowed_mime_types is distinct from array[
         'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]::text[] then
      raise exception using errcode = '23514', message = 'BUCKET_PRIVACY_CONFLICT';
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'osp-corporate-documents', 'osp-corporate-documents', false, 26214400,
      array[
        'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    );
  end if;

  select id, name, public, file_size_limit, allowed_mime_types into existing_bucket
    from storage.buckets where id = 'osp-derived-documents';
  if found then
    if existing_bucket.public is distinct from false
       or existing_bucket.name is distinct from 'osp-derived-documents'
       or existing_bucket.file_size_limit is distinct from 26214400
       or existing_bucket.allowed_mime_types is distinct from array['application/pdf']::text[] then
      raise exception using errcode = '23514', message = 'BUCKET_PRIVACY_CONFLICT';
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'osp-derived-documents', 'osp-derived-documents', false, 26214400,
      array['application/pdf']
    );
  end if;
end;
$bucket_boundary$;
