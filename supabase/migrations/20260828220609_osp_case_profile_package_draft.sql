-- Sprint 8: bind each supplier request to one XBF legal entity and freeze an
-- internal-only package draft from the current canonical fact ledger. These
-- objects have no document-release, signature, email, webhook or send authority.

create table osp_private.case_profile_bindings (
  organization_id uuid not null,
  case_id uuid not null,
  legal_entity_id uuid not null,
  revision integer not null default 1,
  bound_by_subject text not null,
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, case_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id) on delete restrict,
  check (revision between 1 and 2147483647),
  check (pg_catalog.char_length(bound_by_subject) between 1 and 256
    and bound_by_subject ~ '^[A-Za-z0-9:_@.-]+$')
);

create table osp_private.case_profile_package_drafts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  legal_entity_id uuid not null,
  binding_revision integer not null,
  source_case_version bigint not null,
  facts_sha256 text not null,
  manifest_sha256 text not null,
  draft_status text not null default 'current',
  fact_count integer not null,
  restricted_fact_count integer not null,
  created_by_subject text not null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id) on delete restrict,
  check (binding_revision between 1 and 2147483647),
  check (source_case_version between 0 and 2147483647),
  check (facts_sha256 ~ '^[0-9a-f]{64}$' and manifest_sha256 ~ '^[0-9a-f]{64}$'),
  check (draft_status in ('current', 'superseded')),
  check (fact_count between 1 and 128 and restricted_fact_count between 0 and fact_count),
  check (pg_catalog.char_length(created_by_subject) between 1 and 256
    and created_by_subject ~ '^[A-Za-z0-9:_@.-]+$'),
  check ((draft_status = 'current' and superseded_at is null) or draft_status = 'superseded')
);

create unique index case_profile_package_drafts_current_unique
  on osp_private.case_profile_package_drafts(organization_id, case_id)
  where draft_status = 'current';

create table osp_private.case_profile_package_draft_items (
  organization_id uuid not null,
  draft_id uuid not null,
  source_fact_id uuid not null,
  field_code text not null,
  fact_value_sha256 text not null,
  sensitivity text not null,
  disclosure_mode text not null default 'reference_only',
  primary key (organization_id, draft_id, field_code),
  foreign key (organization_id, draft_id)
    references osp_private.case_profile_package_drafts(organization_id, id) on delete restrict,
  foreign key (organization_id, source_fact_id)
    references public.provider_legal_entity_facts(organization_id, id) on delete restrict,
  check (field_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  check (fact_value_sha256 ~ '^[0-9a-f]{64}$'),
  check (sensitivity in ('public','internal','confidential','restricted','highly_restricted')),
  check (disclosure_mode = 'reference_only')
);

alter table osp_private.case_profile_bindings enable row level security;
alter table osp_private.case_profile_bindings force row level security;
alter table osp_private.case_profile_package_drafts enable row level security;
alter table osp_private.case_profile_package_drafts force row level security;
alter table osp_private.case_profile_package_draft_items enable row level security;
alter table osp_private.case_profile_package_draft_items force row level security;

revoke all on osp_private.case_profile_bindings,
  osp_private.case_profile_package_drafts,
  osp_private.case_profile_package_draft_items
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

create or replace function osp_private.case_profile_facts_sha256(
  p_organization_id uuid,
  p_legal_entity_id uuid
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'osp-case-profile-facts-v1' || E'\norganizationId=' || p_organization_id::text
      || E'\nlegalEntityId=' || p_legal_entity_id::text
      || coalesce(E'\n' || pg_catalog.string_agg(
        fact.field_code || '|' || fact.id::text || '|' || fact.fact_value_sha256 || '|' || fact.sensitivity,
        E'\n' order by fact.field_code, fact.id
      ), ''),
    'UTF8'
  ), 'sha256'), 'hex')
  from public.provider_legal_entity_facts fact
  where fact.organization_id = p_organization_id
    and fact.legal_entity_id = p_legal_entity_id
    and fact.fact_status = 'current';
$$;

create or replace function osp_private.bind_case_profile_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_legal_entity_id uuid,
  p_expected_case_version bigint,
  p_expected_binding_revision integer,
  p_actor_subject text,
  p_actor_permission text
) returns table (
  case_id uuid,
  legal_entity_id uuid,
  entity_code text,
  binding_revision integer,
  case_version bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case osp_private.customer_registration_cases%rowtype;
  target_entity public.legal_entities%rowtype;
  current_binding osp_private.case_profile_bindings%rowtype;
  next_revision integer;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_expected_case_version < 0 or p_expected_case_version > 2147483647
     or p_expected_binding_revision < 0 or p_expected_binding_revision > 2147483647
     or pg_catalog.char_length(p_actor_subject) not between 1 and 256
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or p_actor_permission <> 'osp:operate' then
    raise exception using errcode = '42501', message = 'CASE_PROFILE_BINDING_FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_organization_id::text || ':' || p_case_id::text || ':profile-binding', 0
  ));
  select * into target_case from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or target_case.aggregate_version <> p_expected_case_version
     or target_case.state not in ('received','analyzing_requirements','awaiting_clarification','awaiting_xbf_information','preparing')
     or target_case.blocked_by_duplicate_review then
    raise exception using errcode = '40001', message = 'CASE_PROFILE_BINDING_CONFLICT';
  end if;
  select * into target_entity from public.legal_entities entity
  where entity.organization_id = p_organization_id and entity.id = p_legal_entity_id
    and entity.status = 'active';
  if not found or not exists (
    select 1 from public.provider_legal_entity_facts fact
    where fact.organization_id = p_organization_id
      and fact.legal_entity_id = p_legal_entity_id and fact.fact_status = 'current'
  ) then
    raise exception using errcode = '23514', message = 'CASE_PROFILE_ENTITY_NOT_READY';
  end if;
  select * into current_binding from osp_private.case_profile_bindings binding
  where binding.organization_id = p_organization_id and binding.case_id = p_case_id
  for update;
  if found and current_binding.legal_entity_id = p_legal_entity_id then
    if current_binding.revision <> p_expected_binding_revision then
      raise exception using errcode = '40001', message = 'CASE_PROFILE_BINDING_CONFLICT';
    end if;
    return query select p_case_id, p_legal_entity_id, target_entity.entity_code,
      current_binding.revision, target_case.aggregate_version, true;
    return;
  end if;
  if (not found and p_expected_binding_revision <> 0)
     or (found and current_binding.revision <> p_expected_binding_revision) then
    raise exception using errcode = '40001', message = 'CASE_PROFILE_BINDING_CONFLICT';
  end if;
  next_revision := case when found then current_binding.revision + 1 else 1 end;
  insert into osp_private.case_profile_bindings(
    organization_id, case_id, legal_entity_id, revision, bound_by_subject
  ) values (
    p_organization_id, p_case_id, p_legal_entity_id, next_revision, p_actor_subject
  ) on conflict (organization_id, case_id) do update set
    legal_entity_id = excluded.legal_entity_id,
    revision = excluded.revision,
    bound_by_subject = excluded.bound_by_subject,
    bound_at = pg_catalog.statement_timestamp(),
    updated_at = pg_catalog.statement_timestamp();
  update osp_private.case_profile_package_drafts draft
    set draft_status = 'superseded', superseded_at = pg_catalog.statement_timestamp()
  where draft.organization_id = p_organization_id and draft.case_id = p_case_id
    and draft.draft_status = 'current';
  update osp_private.customer_registration_cases candidate
    set aggregate_version = aggregate_version + 1, updated_at = pg_catalog.statement_timestamp()
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
    and candidate.aggregate_version = p_expected_case_version;
  if not found then raise exception using errcode = '40001', message = 'CASE_PROFILE_BINDING_CONFLICT'; end if;
  insert into osp_private.case_events(
    id, organization_id, case_id, sequence, state, actor_subject, authority_role,
    source_version, occurred_at, reason_code, correlation_id, evidence_json
  ) values (
    pg_catalog.gen_random_uuid(), p_organization_id, p_case_id, p_expected_case_version + 1,
    target_case.state, p_actor_subject, 'operations', p_expected_case_version,
    pg_catalog.statement_timestamp(), 'case_profile_bound', pg_catalog.gen_random_uuid()::text,
    pg_catalog.jsonb_build_array('legal-entity:' || p_legal_entity_id::text)
  );
  return query select p_case_id, p_legal_entity_id, target_entity.entity_code,
    next_revision, p_expected_case_version + 1, false;
end;
$$;

create or replace function osp_private.assemble_case_profile_draft_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_expected_case_version bigint,
  p_expected_binding_revision integer,
  p_expected_facts_sha256 text,
  p_actor_subject text,
  p_actor_permission text
) returns table (
  draft_id uuid,
  manifest_sha256 text,
  fact_count integer,
  restricted_fact_count integer,
  case_version bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case osp_private.customer_registration_cases%rowtype;
  target_binding osp_private.case_profile_bindings%rowtype;
  existing_draft osp_private.case_profile_package_drafts%rowtype;
  actual_facts_sha256 text;
  created_draft_id uuid;
  created_manifest_sha256 text;
  total_facts integer;
  restricted_facts integer;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id
     or p_expected_case_version < 0 or p_expected_case_version > 2147483647
     or p_expected_binding_revision < 1 or p_expected_binding_revision > 2147483647
     or p_expected_facts_sha256 !~ '^[0-9a-f]{64}$'
     or pg_catalog.char_length(p_actor_subject) not between 1 and 256
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or p_actor_permission <> 'osp:operate' then
    raise exception using errcode = '42501', message = 'CASE_PROFILE_DRAFT_FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_organization_id::text || ':' || p_case_id::text || ':profile-draft', 0
  ));
  select * into target_case from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or target_case.aggregate_version <> p_expected_case_version
     or target_case.state not in ('received','analyzing_requirements','awaiting_clarification','awaiting_xbf_information','preparing')
     or target_case.blocked_by_duplicate_review then
    raise exception using errcode = '40001', message = 'CASE_PROFILE_DRAFT_CONFLICT';
  end if;
  select * into target_binding from osp_private.case_profile_bindings binding
  where binding.organization_id = p_organization_id and binding.case_id = p_case_id
    and binding.revision = p_expected_binding_revision
  for update;
  if not found then raise exception using errcode = '40001', message = 'CASE_PROFILE_DRAFT_CONFLICT'; end if;
  actual_facts_sha256 := osp_private.case_profile_facts_sha256(p_organization_id, target_binding.legal_entity_id);
  if actual_facts_sha256 is distinct from p_expected_facts_sha256 then
    raise exception using errcode = '40001', message = 'CASE_PROFILE_FACTS_CHANGED';
  end if;
  select count(*)::integer,
    count(*) filter (where sensitivity in ('restricted','highly_restricted'))::integer
  into total_facts, restricted_facts
  from public.provider_legal_entity_facts fact
  where fact.organization_id = p_organization_id
    and fact.legal_entity_id = target_binding.legal_entity_id and fact.fact_status = 'current';
  if total_facts < 1 or total_facts > 128 then
    raise exception using errcode = '23514', message = 'CASE_PROFILE_FACT_SET_INVALID';
  end if;
  select * into existing_draft from osp_private.case_profile_package_drafts draft
  where draft.organization_id = p_organization_id and draft.case_id = p_case_id
    and draft.draft_status = 'current'
  for update;
  if found and existing_draft.binding_revision = p_expected_binding_revision
     and existing_draft.facts_sha256 = p_expected_facts_sha256 then
    return query select existing_draft.id, existing_draft.manifest_sha256,
      existing_draft.fact_count, existing_draft.restricted_fact_count,
      target_case.aggregate_version, true;
    return;
  end if;
  if found then
    update osp_private.case_profile_package_drafts draft
      set draft_status = 'superseded', superseded_at = pg_catalog.statement_timestamp()
    where draft.organization_id = p_organization_id and draft.id = existing_draft.id
      and draft.draft_status = 'current';
  end if;
  created_draft_id := pg_catalog.gen_random_uuid();
  created_manifest_sha256 := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'osp-case-profile-draft-v1' || E'\norganizationId=' || p_organization_id::text
      || E'\ncaseId=' || p_case_id::text
      || E'\ncaseVersion=' || p_expected_case_version::text
      || E'\nlegalEntityId=' || target_binding.legal_entity_id::text
      || E'\nbindingRevision=' || p_expected_binding_revision::text
      || E'\nfactsSha256=' || p_expected_facts_sha256,
    'UTF8'
  ), 'sha256'), 'hex');
  insert into osp_private.case_profile_package_drafts(
    id, organization_id, case_id, legal_entity_id, binding_revision,
    source_case_version, facts_sha256, manifest_sha256, fact_count,
    restricted_fact_count, created_by_subject, metadata
  ) values (
    created_draft_id, p_organization_id, p_case_id, target_binding.legal_entity_id,
    p_expected_binding_revision, p_expected_case_version, p_expected_facts_sha256,
    created_manifest_sha256, total_facts, restricted_facts, p_actor_subject,
    pg_catalog.jsonb_build_object('external_effects', false, 'disclosure_locked', true)
  );
  insert into osp_private.case_profile_package_draft_items(
    organization_id, draft_id, source_fact_id, field_code, fact_value_sha256, sensitivity
  ) select p_organization_id, created_draft_id, fact.id, fact.field_code,
      fact.fact_value_sha256, fact.sensitivity
    from public.provider_legal_entity_facts fact
    where fact.organization_id = p_organization_id
      and fact.legal_entity_id = target_binding.legal_entity_id and fact.fact_status = 'current'
    order by fact.field_code, fact.id;
  update osp_private.customer_registration_cases candidate
    set aggregate_version = aggregate_version + 1, updated_at = pg_catalog.statement_timestamp()
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
    and candidate.aggregate_version = p_expected_case_version;
  if not found then raise exception using errcode = '40001', message = 'CASE_PROFILE_DRAFT_CONFLICT'; end if;
  insert into osp_private.case_events(
    id, organization_id, case_id, sequence, state, actor_subject, authority_role,
    source_version, occurred_at, reason_code, correlation_id, evidence_json
  ) values (
    pg_catalog.gen_random_uuid(), p_organization_id, p_case_id, p_expected_case_version + 1,
    target_case.state, p_actor_subject, 'operations', p_expected_case_version,
    pg_catalog.statement_timestamp(), 'case_profile_draft_assembled', pg_catalog.gen_random_uuid()::text,
    pg_catalog.jsonb_build_array('profile-draft:' || created_draft_id::text)
  );
  return query select created_draft_id, created_manifest_sha256, total_facts,
    restricted_facts, p_expected_case_version + 1, false;
end;
$$;

create or replace function osp_private.load_xbf_customer_setup_candidates_for_case(
  p_organization_id uuid,
  p_case_id uuid
) returns table (field_key text, value_json jsonb, evidence_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select case
      when fact.field_code = 'legal_name' then 'supplier.legalName'
      when fact.field_code in ('rfc', 'tax_id') then 'fiscal.taxIdentifier'
      when fact.field_code = 'fiscal_address' then 'supplier.address'
      when fact.field_code in ('bank_account', 'bank_account_number', 'clabe') then 'banking.accountNumber'
    end,
    fact.fact_value,
    'rateware:legal-entity-fact:' || fact.id::text
  from osp_private.case_profile_bindings binding
  join public.provider_legal_entity_facts fact
    on fact.organization_id = binding.organization_id
   and fact.legal_entity_id = binding.legal_entity_id
   and fact.fact_status = 'current'
   and fact.field_code in ('legal_name','rfc','tax_id','fiscal_address','bank_account','bank_account_number','clabe')
  where binding.organization_id = p_organization_id and binding.case_id = p_case_id
    and nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid = p_organization_id
  order by 1, fact.field_code, fact.id;
$$;

revoke all on function osp_private.case_profile_facts_sha256(uuid, uuid),
  osp_private.bind_case_profile_command(uuid, uuid, uuid, bigint, integer, text, text),
  osp_private.assemble_case_profile_draft_command(uuid, uuid, bigint, integer, text, text, text),
  osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

grant execute on function osp_private.case_profile_facts_sha256(uuid, uuid) to osp_workflow_api;
grant execute on function osp_private.bind_case_profile_command(uuid, uuid, uuid, bigint, integer, text, text) to osp_workflow_api;
grant execute on function osp_private.assemble_case_profile_draft_command(uuid, uuid, bigint, integer, text, text, text) to osp_workflow_api;
grant execute on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid) to osp_worker;

comment on function osp_private.assemble_case_profile_draft_command(uuid, uuid, bigint, integer, text, text, text)
is 'Freezes internal references to current canonical XBF facts. It cannot disclose documents, sign, send, email or call webhooks.';
