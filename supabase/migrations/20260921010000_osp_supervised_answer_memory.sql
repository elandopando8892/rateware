-- OSP supervised answer memory.
-- Stores human-reviewed reusable answers without promoting them to documentary legal facts.
-- Values are tenant/entity scoped and may optionally be narrowed to one external counterparty.

create table if not exists osp_private.supervised_answer_memory (
  id uuid primary key,
  organization_id uuid not null,
  legal_entity_id uuid not null,
  scope_kind text not null check (scope_kind in ('entity', 'counterparty')),
  scope_key text not null,
  canonical_key text not null,
  display_label text not null,
  value_json jsonb not null,
  value_type text not null check (value_type in ('text', 'number', 'boolean', 'table')),
  value_sha256 text not null check (value_sha256 ~ '^[0-9a-f]{64}$'),
  sensitivity text not null check (sensitivity in ('public', 'internal', 'confidential', 'restricted', 'highly_restricted')),
  status text not null default 'current' check (status in ('current', 'superseded')),
  version integer not null check (version between 1 and 2147483647),
  source_case_id uuid,
  source_artifact_sha256 text check (source_artifact_sha256 is null or source_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  source_reference text not null,
  reviewed_by_subject text not null,
  reviewed_at timestamptz not null default statement_timestamp(),
  review_after date,
  supersedes_memory_id uuid,
  superseded_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id),
  foreign key (organization_id, source_case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, supersedes_memory_id)
    references osp_private.supervised_answer_memory(organization_id, id),
  constraint osp_supervised_answer_scope_check check (
    (scope_kind = 'entity' and scope_key = '*')
    or (
      scope_kind = 'counterparty'
      and scope_key = lower(btrim(scope_key))
      and scope_key ~ '^[a-z0-9][a-z0-9._:-]{0,255}$'
    )
  ),
  constraint osp_supervised_answer_key_check check (
    canonical_key ~ '^[a-z][a-z0-9_.-]{0,127}$'
  ),
  constraint osp_supervised_answer_label_check check (
    display_label = btrim(display_label)
    and char_length(display_label) between 1 and 256
  ),
  constraint osp_supervised_answer_value_shape_check check (
    (value_type = 'text' and jsonb_typeof(value_json) = 'string')
    or (value_type = 'number' and jsonb_typeof(value_json) = 'number')
    or (value_type = 'boolean' and jsonb_typeof(value_json) = 'boolean')
    or (value_type = 'table' and jsonb_typeof(value_json) in ('array', 'object'))
  ),
  constraint osp_supervised_answer_source_check check (
    source_reference = btrim(source_reference)
    and char_length(source_reference) between 3 and 512
    and reviewed_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
    and char_length(reviewed_by_subject) between 1 and 256
    and idempotency_key ~ '^[A-Za-z0-9:_-]+$'
    and char_length(idempotency_key) between 1 and 256
  ),
  constraint osp_supervised_answer_supersede_check check (
    (status = 'current' and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
  )
);

create unique index if not exists supervised_answer_memory_one_current
  on osp_private.supervised_answer_memory
    (organization_id, legal_entity_id, scope_kind, scope_key, canonical_key)
  where status = 'current';

create index if not exists supervised_answer_memory_case_idx
  on osp_private.supervised_answer_memory (organization_id, source_case_id)
  where source_case_id is not null;

create or replace function osp_private.protect_supervised_answer_memory()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'SUPERVISED_ANSWER_APPEND_ONLY';
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.legal_entity_id is distinct from old.legal_entity_id
     or new.scope_kind is distinct from old.scope_kind
     or new.scope_key is distinct from old.scope_key
     or new.canonical_key is distinct from old.canonical_key
     or new.display_label is distinct from old.display_label
     or new.value_json is distinct from old.value_json
     or new.value_type is distinct from old.value_type
     or new.value_sha256 is distinct from old.value_sha256
     or new.sensitivity is distinct from old.sensitivity
     or new.version is distinct from old.version
     or new.source_case_id is distinct from old.source_case_id
     or new.source_artifact_sha256 is distinct from old.source_artifact_sha256
     or new.source_reference is distinct from old.source_reference
     or new.reviewed_by_subject is distinct from old.reviewed_by_subject
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_after is distinct from old.review_after
     or new.supersedes_memory_id is distinct from old.supersedes_memory_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.metadata is distinct from old.metadata then
    raise exception using errcode = 'P0001', message = 'SUPERVISED_ANSWER_APPEND_ONLY';
  end if;

  if old.status <> 'current'
     or new.status <> 'superseded'
     or old.superseded_at is not null
     or new.superseded_at is null then
    raise exception using errcode = 'P0001', message = 'SUPERVISED_ANSWER_STATUS_INVALID';
  end if;
  return new;
end;
$function$;

drop trigger if exists osp_supervised_answer_append_only
  on osp_private.supervised_answer_memory;
create trigger osp_supervised_answer_append_only
before update or delete on osp_private.supervised_answer_memory
for each row execute function osp_private.protect_supervised_answer_memory();

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
     or p_canonical_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
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

create or replace function osp_private.load_supervised_answer_memory_for_case(
  p_organization_id uuid,
  p_case_id uuid
)
returns table(field_key text, value_json jsonb, evidence_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct on (memory.canonical_key)
    memory.canonical_key as field_key,
    memory.value_json,
    'memory:supervised-answer:' || memory.id::text as evidence_id
  from osp_private.case_profile_bindings binding
  join osp_private.customer_registration_cases case_record
    on case_record.organization_id = binding.organization_id
   and case_record.id = binding.case_id
  join osp_private.supplier_counterparties supplier
    on supplier.organization_id = case_record.organization_id
   and supplier.id = case_record.supplier_id
  join osp_private.supervised_answer_memory memory
    on memory.organization_id = binding.organization_id
   and memory.legal_entity_id = binding.legal_entity_id
   and memory.status = 'current'
   and (
     (memory.scope_kind = 'entity' and memory.scope_key = '*')
     or (
       memory.scope_kind = 'counterparty'
       and memory.scope_key = lower(pg_catalog.btrim(supplier.legal_name))
     )
   )
  where binding.organization_id = p_organization_id
    and binding.case_id = p_case_id
    and nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
      = p_organization_id
    and memory.sensitivity in ('public', 'internal', 'confidential')
    and (memory.review_after is null or memory.review_after >= pg_catalog.current_date)
    and pg_catalog.jsonb_typeof(memory.value_json) in ('string', 'number', 'boolean')
  order by memory.canonical_key,
    case when memory.scope_kind = 'counterparty' then 0 else 1 end,
    memory.version desc,
    memory.id;
$function$;

create or replace function osp_private.load_verified_legal_entity_facts_for_case(
  p_organization_id uuid,
  p_case_id uuid
)
returns table(field_key text, value_json jsonb, evidence_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  select vocabulary.canonical_key, fact.fact_value,
    'rateware:legal-entity-fact:' || fact.id::text
  from osp_private.case_profile_bindings binding
  join public.legal_entities entity
    on entity.organization_id = binding.organization_id
    and entity.id = binding.legal_entity_id and entity.status = 'active'
  join public.provider_legal_entity_facts fact
    on fact.organization_id = binding.organization_id
    and fact.legal_entity_id = binding.legal_entity_id
    and fact.fact_status = 'current'
  join (values
    ('legal_name', 'supplier.legalName'),
    ('rfc', 'fiscal.taxIdentifier'),
    ('tax_id', 'fiscal.taxIdentifier'),
    ('fiscal_address', 'supplier.address'),
    ('phone', 'supplier.phone'),
    ('email', 'supplier.email'),
    ('website', 'supplier.website'),
    ('legal_representative', 'legal.representativeName'),
    ('tax_regime', 'fiscal.taxRegime'),
    ('bank_name', 'banking.bankName'),
    ('bank_account', 'banking.accountNumber'),
    ('bank_account_number', 'banking.accountNumber'),
    ('clabe', 'banking.accountNumber')
  ) vocabulary(field_code, canonical_key)
    on vocabulary.field_code = fact.field_code
  join public.provider_entity_document_reviews review
    on review.organization_id = fact.organization_id
    and review.legal_entity_id = fact.legal_entity_id
    and review.id = fact.source_review_id and review.review_status = 'approved'
    and review.decided_at is not null
  join public.provider_entity_document_review_fields reviewed_field
    on reviewed_field.organization_id = fact.organization_id
    and reviewed_field.review_id = review.id
    and reviewed_field.id = fact.source_review_field_id
    and reviewed_field.field_code = fact.field_code
    and reviewed_field.field_status in ('accepted', 'corrected')
    and fact.fact_value = case when reviewed_field.field_status = 'corrected'
      then reviewed_field.reviewer_value else reviewed_field.proposed_value end
  join public.provider_legal_entity_fact_promotions promotion
    on promotion.organization_id = fact.organization_id
    and promotion.legal_entity_id = fact.legal_entity_id
    and promotion.review_id = review.id
    and promotion.id = fact.source_promotion_id
    and promotion.promotion_status = 'applied'
  join public.provider_legal_entity_document_assets asset
    on asset.organization_id = fact.organization_id
    and asset.legal_entity_id = fact.legal_entity_id
    and asset.id = review.document_asset_id
    and asset.lifecycle_status = 'active'
    and asset.verification_status = 'verified'
    and (asset.effective_date is null or asset.effective_date <= pg_catalog.current_date)
    and (
      asset.expiration_date is null
      or asset.expiration_date >= pg_catalog.current_date
      or (
        asset.expiration_date < pg_catalog.current_date
        and fact.field_code in (
          'legal_name','fiscal_address','phone','email','website',
          'legal_representative','tax_regime'
        )
        and exists (
          select 1
          from osp_private.answer_memory_evidence_links link
          join public.provider_entity_document_reviews backup_review
            on backup_review.organization_id = link.organization_id
            and backup_review.id = link.review_id
            and backup_review.legal_entity_id = fact.legal_entity_id
            and backup_review.revision = link.review_revision
            and backup_review.review_status = 'approved'
            and backup_review.decided_at is not null
          join public.provider_entity_document_review_fields backup_field
            on backup_field.organization_id = link.organization_id
            and backup_field.id = link.review_field_id
            and backup_field.review_id = backup_review.id
            and backup_field.field_code = fact.field_code
            and backup_field.field_status in ('accepted','corrected')
            and backup_field.sensitivity in ('public','internal','confidential')
            and fact.fact_value = case
              when backup_field.field_status='corrected'
                then backup_field.reviewer_value
              else backup_field.proposed_value
            end
          join public.provider_legal_entity_document_assets backup_asset
            on backup_asset.organization_id = link.organization_id
            and backup_asset.id = link.document_asset_id
            and backup_asset.id = backup_review.document_asset_id
            and backup_asset.legal_entity_id = fact.legal_entity_id
            and backup_asset.lifecycle_status = 'active'
            and backup_asset.verification_status = 'verified'
            and backup_asset.effective_date is not distinct from link.evidence_effective_on
            and backup_asset.expiration_date is not distinct from link.evidence_expires_on
            and (backup_asset.effective_date is null
              or backup_asset.effective_date <= pg_catalog.current_date)
            and (backup_asset.expiration_date is null
              or backup_asset.expiration_date >= pg_catalog.current_date)
          join public.provider_legal_entity_fact_promotions backup_promotion
            on backup_promotion.organization_id = link.organization_id
            and backup_promotion.review_id = backup_review.id
            and backup_promotion.legal_entity_id = fact.legal_entity_id
            and backup_promotion.promotion_status = 'applied'
            and backup_promotion.expected_review_revision = link.review_revision
          where link.organization_id = fact.organization_id
            and link.legal_entity_id = fact.legal_entity_id
            and link.fact_id = fact.id
            and link.action = 'renew'
        )
      )
    )
  where binding.organization_id = p_organization_id
    and binding.case_id = p_case_id
    and nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
      = p_organization_id
    and fact.effective_at <= pg_catalog.statement_timestamp()
    and fact.sensitivity in ('public', 'internal', 'confidential')
    and reviewed_field.sensitivity in ('public', 'internal', 'confidential')
    and pg_catalog.jsonb_typeof(fact.fact_value) in ('string', 'number', 'boolean')
  order by vocabulary.canonical_key, fact.field_code, fact.id;
$function$;

create or replace function osp_private.load_xbf_customer_setup_candidates_for_case(
  p_organization_id uuid,
  p_case_id uuid
)
returns table(field_key text, value_json jsonb, evidence_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct on (candidate.field_key)
    candidate.field_key, candidate.value_json, candidate.evidence_id
  from (
    select verified.field_key, verified.value_json, verified.evidence_id, 0 as priority
    from osp_private.load_verified_legal_entity_facts_for_case(
      p_organization_id, p_case_id
    ) verified
    union all
    select memory.field_key, memory.value_json, memory.evidence_id, 1 as priority
    from osp_private.load_supervised_answer_memory_for_case(
      p_organization_id, p_case_id
    ) memory
  ) candidate
  order by candidate.field_key, candidate.priority, candidate.evidence_id;
$function$;

revoke all on osp_private.supervised_answer_memory
  from public, anon, authenticated;
grant select, insert, update on osp_private.supervised_answer_memory
  to osp_workflow_api;
grant select on osp_private.supervised_answer_memory to osp_worker;

alter table osp_private.supervised_answer_memory enable row level security;
alter table osp_private.supervised_answer_memory force row level security;

drop policy if exists osp_supervised_answer_memory_workflow
  on osp_private.supervised_answer_memory;
create policy osp_supervised_answer_memory_workflow
  on osp_private.supervised_answer_memory
  for all to osp_workflow_api
  using (
    organization_id = nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
  )
  with check (
    organization_id = nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
  );

drop policy if exists osp_supervised_answer_memory_worker
  on osp_private.supervised_answer_memory;
create policy osp_supervised_answer_memory_worker
  on osp_private.supervised_answer_memory
  for select to osp_worker
  using (
    organization_id = nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid
  );

revoke all on function osp_private.record_supervised_answer_memory(
  uuid, uuid, text, text, text, text, jsonb, text, text, uuid, text, text,
  date, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function osp_private.record_supervised_answer_memory(
  uuid, uuid, text, text, text, text, jsonb, text, text, uuid, text, text,
  date, text, text, text, jsonb
) to osp_workflow_api;

revoke all on function osp_private.load_supervised_answer_memory_for_case(uuid, uuid)
  from public, anon, authenticated;
revoke all on function osp_private.load_verified_legal_entity_facts_for_case(uuid, uuid)
  from public, anon, authenticated;
revoke all on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
  from public, anon, authenticated;

grant execute on function osp_private.load_supervised_answer_memory_for_case(uuid, uuid)
  to osp_workflow_api, osp_worker;
grant execute on function osp_private.load_verified_legal_entity_facts_for_case(uuid, uuid)
  to osp_workflow_api, osp_worker;
grant execute on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
  to osp_workflow_api, osp_worker;
