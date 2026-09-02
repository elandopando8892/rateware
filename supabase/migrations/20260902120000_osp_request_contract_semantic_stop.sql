-- Sprint 11: preserve exact carrier-request constraints and stop every
-- consequential final-response step until reviewed evidence satisfies them.
-- This migration creates no provider, billable resource or outbound authority.

alter table osp_private.document_versions
  drop constraint if exists osp_document_type_check;
alter table osp_private.document_versions
  add constraint osp_document_type_check check (document_type in (
    'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate',
    'bank_statement', 'supplier_requirement', 'articles_of_incorporation',
    'legal_representative_id', 'power_of_attorney', 'signed_supplier_form',
    'w9', 'broker_authority', 'surety_bond', 'other_supporting_document'
  )) not valid;

alter table osp_private.document_versions
  drop constraint if exists osp_quarterly_eligibility_check;
alter table osp_private.document_versions
  add constraint osp_quarterly_eligibility_check check (
    (document_type in (
      'proof_of_address', 'sat_compliance_opinion',
      'tax_status_certificate', 'bank_statement'
    ) and valid_from is not null
      and expires_at = (valid_from + interval '3 months')::date)
    or
    (document_type not in (
      'proof_of_address', 'sat_compliance_opinion',
      'tax_status_certificate', 'bank_statement'
    ) and (
      (valid_from is null and expires_at is null)
      or (valid_from is not null and expires_at is not null and expires_at > valid_from)
    ))
  ) not valid;

do $request_contract_derived_bucket$
declare
  target storage.buckets%rowtype;
  previous_types constant text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  next_types constant text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
begin
  select * into target from storage.buckets
  where id = 'osp-derived-documents' for update;
  if not found or target.public is distinct from false
     or target.file_size_limit is distinct from 26214400
     or (target.allowed_mime_types is distinct from previous_types
         and target.allowed_mime_types is distinct from next_types) then
    raise exception using errcode = '23514', message = 'OSP_DERIVED_BUCKET_CONFLICT';
  end if;
  update storage.buckets set allowed_mime_types = next_types
  where id = 'osp-derived-documents';
end;
$request_contract_derived_bucket$;

alter table osp_private.generated_packages
  drop constraint if exists generated_packages_content_type_check;
alter table osp_private.generated_packages
  add constraint generated_packages_content_type_check check (
    content_type is null or content_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ) not valid;

-- Final responses may now carry the signed form plus every reviewed document
-- named by the carrier. Keep the legacy function identity and grants while
-- admitting the already-private DOCX/XLSM custody formats.
create or replace function osp_private.valid_outbound_attachments(value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) <= 100
    and not exists (
      select 1
      from jsonb_array_elements(value) attachment
      where jsonb_typeof(attachment) <> 'object'
         or (select array_agg(key order by key) from jsonb_object_keys(attachment) key)
              <> array['bucketId', 'contentType', 'name', 'objectId', 'sha256']::text[]
         or attachment->>'bucketId' not in ('osp-corporate-documents', 'osp-derived-documents')
         or attachment->>'contentType' not in (
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel.sheet.macroEnabled.12',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg', 'image/png', 'image/tiff'
            )
         or attachment->>'name' !~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$'
         or attachment->>'objectId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or attachment->>'sha256' !~ '^[0-9a-f]{64}$'
    );
$$;

create table osp_private.request_knowledge_constraint_rules (
  id uuid primary key,
  organization_id uuid not null,
  promotion_id uuid not null,
  case_id uuid not null,
  review_id uuid not null,
  knowledge_kind text not null check (knowledge_kind in ('field', 'document')),
  canonical_key text not null check (canonical_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint_json jsonb not null check (
    jsonb_typeof(constraint_json) = 'object'
    and constraint_json @> '{"humanReviewed":true,"externalEffects":false}'::jsonb
    and octet_length(constraint_json::text) between 2 and 131072
  ),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_subject text not null check (
    created_by_subject = btrim(created_by_subject)
    and char_length(created_by_subject) between 1 and 256
    and created_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, promotion_id, knowledge_kind, canonical_key),
  foreign key (organization_id, promotion_id)
    references osp_private.request_knowledge_promotions(organization_id, id) on delete restrict,
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, review_id)
    references osp_private.request_manifest_decision_reviews(organization_id, id) on delete restrict
);

create trigger request_knowledge_constraint_rules_append_only
before update or delete on osp_private.request_knowledge_constraint_rules
for each row execute function osp_private.reject_request_knowledge_ledger_mutation();

alter table osp_private.request_knowledge_constraint_rules enable row level security;
alter table osp_private.request_knowledge_constraint_rules force row level security;
revoke all on osp_private.request_knowledge_constraint_rules
from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select on osp_private.request_knowledge_constraint_rules to osp_workflow_api;
grant select on osp_private.request_knowledge_constraint_rules to osp_worker;

create policy request_knowledge_constraint_workflow_read_tenant
on osp_private.request_knowledge_constraint_rules for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy request_knowledge_constraint_worker_read_tenant
on osp_private.request_knowledge_constraint_rules for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create function osp_private.record_request_knowledge_constraints_command(
  p_organization_id uuid,
  p_promotion_id uuid,
  p_actor_subject text
) returns table (recorded_count integer, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  target_promotion osp_private.request_knowledge_promotions%rowtype;
  target_manifest osp_private.request_manifest_drafts%rowtype;
  before_count integer;
  after_count integer;
begin
  if p_actor_subject !~ '^[A-Za-z0-9:_@.-]{1,256}$'
     or nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'REQUEST_KNOWLEDGE_CONSTRAINT_FORBIDDEN';
  end if;
  select * into target_promotion
  from osp_private.request_knowledge_promotions promotion
  where promotion.organization_id = p_organization_id
    and promotion.id = p_promotion_id;
  if not found or target_promotion.promoted_by_subject is distinct from p_actor_subject then
    raise exception using errcode = '42501', message = 'REQUEST_KNOWLEDGE_CONSTRAINT_FORBIDDEN';
  end if;
  select * into target_manifest
  from osp_private.request_manifest_drafts manifest
  where manifest.organization_id = p_organization_id
    and manifest.id = target_promotion.manifest_draft_id
    and manifest.case_id = target_promotion.case_id;
  if not found then
    raise exception using errcode = '40001', message = 'REQUEST_KNOWLEDGE_CONSTRAINT_SOURCE_STALE';
  end if;
  select count(*)::integer into before_count
  from osp_private.request_knowledge_constraint_rules rule
  where rule.organization_id = p_organization_id
    and rule.promotion_id = p_promotion_id;

  insert into osp_private.request_knowledge_constraint_rules (
    id, organization_id, promotion_id, case_id, review_id, knowledge_kind,
    canonical_key, constraint_json, source_manifest_sha256, created_by_subject
  )
  select gen_random_uuid(), p_organization_id, target_promotion.id,
    target_promotion.case_id, target_promotion.review_id,
    candidate.knowledge_kind, policy.target_canonical_key,
    jsonb_build_object(
      'required', candidate.required,
      'sourceLabel', candidate.display_label,
      'sourceRequirements', coalesce((
        select jsonb_agg(requirement.value->>'text' order by requirement.ordinality)
        from jsonb_array_elements(target_manifest.manifest_json->'requirements')
          with ordinality requirement(value, ordinality)
        where jsonb_typeof(requirement.value) = 'object'
          and requirement.value->>'text' is not null
          and (
            position(lower(candidate.display_label) in lower(requirement.value->>'text')) > 0
            or exists (
              select 1
              from jsonb_array_elements_text(candidate.aliases_json) alias(value)
              where char_length(alias.value) >= 4
                and position(lower(alias.value) in lower(requirement.value->>'text')) > 0
            )
          )
      ), '[]'::jsonb),
      'humanReviewed', true,
      'externalEffects', false
    ),
    target_manifest.manifest_sha256, p_actor_subject
  from osp_private.request_knowledge_candidates(
    p_organization_id, target_promotion.case_id, target_promotion.review_id
  ) candidate
  cross join lateral osp_private.request_knowledge_reuse_policy(
    candidate.knowledge_kind, candidate.canonical_key, candidate.display_label,
    candidate.aliases_json, candidate.value_type
  ) policy
  where target_promotion.selected_keys_json ?
      (candidate.knowledge_kind || ':' || candidate.canonical_key)
    and policy.reuse_eligibility = 'eligible'
    and policy.target_canonical_key is not null
  on conflict (organization_id, promotion_id, knowledge_kind, canonical_key)
  do nothing;

  select count(*)::integer into after_count
  from osp_private.request_knowledge_constraint_rules rule
  where rule.organization_id = p_organization_id
    and rule.promotion_id = p_promotion_id;
  return query select after_count, before_count = after_count and after_count > 0;
end;
$$;

revoke all on function osp_private.record_request_knowledge_constraints_command(uuid, uuid, text)
from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant execute on function osp_private.record_request_knowledge_constraints_command(uuid, uuid, text)
to osp_workflow_api;
comment on table osp_private.request_knowledge_constraint_rules is
'Append-only, human-reviewed request qualifiers. They guide future interpretation but never prove evidence exists and never authorize an external effect.';
