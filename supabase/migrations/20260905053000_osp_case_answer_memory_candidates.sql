-- Capture a review inbox from future saved form revisions. Not approved memory.
-- No backfill, no promotion into provider_legal_entity_facts, no external effects.
create table osp_private.case_answer_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  source_instance_id uuid not null,
  source_instance_version integer not null check (source_instance_version > 0),
  source_template_version_id uuid not null,
  source_schema_sha256 text not null check (source_schema_sha256 ~ '^[0-9a-f]{64}$'),
  field_key text not null,
  canonical_field_id text not null,
  source_label text not null,
  answer_value jsonb not null check (jsonb_typeof(answer_value) = 'string'),
  answer_sha256 text not null check (answer_sha256 ~ '^[0-9a-f]{64}$'),
  legal_entity_id uuid,
  binding_revision integer,
  reuse_scope text not null default 'case_only' check (reuse_scope = 'case_only'),
  review_status text not null default 'pending_review' check (review_status = 'pending_review'),
  captured_at timestamptz not null default statement_timestamp(),
  unique (organization_id, source_instance_id, source_instance_version, field_key),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, source_instance_id) references osp_private.case_form_instances(organization_id, id),
  foreign key (organization_id, source_template_version_id) references osp_private.form_template_versions(organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.legal_entities(organization_id, id),
  check ((legal_entity_id is null and binding_revision is null) or (legal_entity_id is not null and binding_revision > 0)),
  check (canonical_field_id in ('supplier.legalName', 'supplier.address', 'supplier.phone',
    'supplier.email', 'supplier.website', 'legal.representativeName', 'fiscal.taxRegime'))
);

create index case_answer_memory_candidates_case_idx on osp_private.case_answer_memory_candidates (organization_id, case_id);

alter table osp_private.case_answer_memory_candidates enable row level security;
revoke all on osp_private.case_answer_memory_candidates from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select on osp_private.case_answer_memory_candidates to osp_workflow_api;
create policy case_answer_memory_candidates_tenant_read on osp_private.case_answer_memory_candidates
  for select to osp_workflow_api using (
    organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid
  );

create function osp_private.capture_case_answer_memory_candidates()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.organization_id is distinct from old.organization_id
    or new.case_id is distinct from old.case_id or new.template_version_id is distinct from old.template_version_id
    or new.id is distinct from old.id
    or (new.values_json is distinct from old.values_json and new.version <= old.version)) then
    raise exception using errcode = '23514', message = 'ANSWER_MEMORY_REVISION_REQUIRED';
  end if;
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from new.organization_id then
    raise exception using errcode = '42501', message = 'ANSWER_MEMORY_TENANT_MISMATCH';
  end if;
  if new.version < 1 then return new; end if;
  insert into osp_private.case_answer_memory_candidates (
    organization_id, case_id, source_instance_id, source_instance_version,
    source_template_version_id, source_schema_sha256, field_key, canonical_field_id,
    source_label, answer_value, answer_sha256, legal_entity_id, binding_revision
  )
  select new.organization_id, new.case_id, new.id, new.version, new.template_version_id,
    template.schema_sha256, field.field_key, field.definition_json->>'canonicalFieldId',
    field.definition_json->>'label', new.values_json->field.field_key,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((new.values_json->field.field_key)::text, 'UTF8')), 'hex'),
    binding.legal_entity_id, binding.revision
  from osp_private.form_template_versions template
  join osp_private.form_fields field on field.organization_id = template.organization_id
    and field.template_version_id = template.id
  left join osp_private.case_profile_bindings binding on binding.organization_id = new.organization_id
    and binding.case_id = new.case_id
  where template.organization_id = new.organization_id and template.id = new.template_version_id
    and template.status = 'published'
    and field.definition_json->>'canonicalFieldId' in ('supplier.legalName', 'supplier.address', 'supplier.phone',
      'supplier.email', 'supplier.website', 'legal.representativeName', 'fiscal.taxRegime')
    and field.definition_json->'definition'->>'kind' in ('text', 'textarea', 'phone', 'email')
    and pg_catalog.jsonb_typeof(new.values_json->field.field_key) = 'string'
    and pg_catalog.length(pg_catalog.btrim(new.values_json->>field.field_key)) between 1 and 2000
  on conflict (organization_id, source_instance_id, source_instance_version, field_key) do nothing;
  return new;
end;
$$;
revoke all on function osp_private.capture_case_answer_memory_candidates() from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
create trigger osp_capture_case_answer_memory_candidates
  after insert or update on osp_private.case_form_instances
  for each row execute function osp_private.capture_case_answer_memory_candidates();

comment on table osp_private.case_answer_memory_candidates is
'Immutable pending candidates from saved form versions. case_only is not permission to reuse. Never queried by approved-memory autocompletion; no human approval or source validity inferred.';
