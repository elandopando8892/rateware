-- Supervised, tenant-scoped memory for reusable supplier-request semantics.
-- The catalog stores labels and document/field concepts only. It never stores
-- customer values, signatures, attachments, recipients, messages or secrets.

create table osp_private.request_knowledge_catalog_entries (
  id uuid primary key,
  organization_id uuid not null,
  knowledge_kind text not null check (knowledge_kind in ('field', 'document')),
  canonical_key text not null check (canonical_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  display_label text not null check (
    display_label = btrim(display_label)
    and char_length(display_label) between 1 and 256
    and display_label !~ '[[:cntrl:]]'
  ),
  aliases_json jsonb not null check (
    jsonb_typeof(aliases_json) = 'array'
    and jsonb_array_length(aliases_json) between 1 and 21
    and octet_length(aliases_json::text) between 3 and 8192
  ),
  value_type text check (value_type in ('text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown')),
  version integer not null default 1 check (version between 1 and 2147483647),
  source_case_id uuid not null,
  source_manifest_draft_id uuid not null,
  source_review_id uuid not null,
  source_candidate_sha256 text not null check (source_candidate_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_subject text not null check (
    created_by_subject = btrim(created_by_subject)
    and char_length(created_by_subject) between 1 and 256
    and created_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, knowledge_kind, canonical_key),
  foreign key (organization_id, source_case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, source_manifest_draft_id)
    references osp_private.request_manifest_drafts(organization_id, id) on delete restrict,
  foreign key (organization_id, source_review_id)
    references osp_private.request_manifest_decision_reviews(organization_id, id) on delete restrict,
  constraint request_knowledge_value_type_check check (
    (knowledge_kind = 'field' and value_type is not null)
    or (knowledge_kind = 'document' and value_type is null)
  )
);

create table osp_private.request_knowledge_promotions (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  manifest_draft_id uuid not null,
  review_id uuid not null,
  review_version integer not null check (review_version between 1 and 2147483647),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_-]{1,256}$'),
  candidate_sha256 text not null check (candidate_sha256 ~ '^[0-9a-f]{64}$'),
  selection_sha256 text not null check (selection_sha256 ~ '^[0-9a-f]{64}$'),
  selected_keys_json jsonb not null check (
    jsonb_typeof(selected_keys_json) = 'array'
    and jsonb_array_length(selected_keys_json) between 1 and 600
    and octet_length(selected_keys_json::text) between 3 and 131072
  ),
  inserted_entry_ids jsonb not null check (jsonb_typeof(inserted_entry_ids) = 'array'),
  promoted_count integer not null check (promoted_count between 0 and 600),
  unchanged_count integer not null check (unchanged_count between 0 and 600),
  promoted_by_subject text not null check (
    promoted_by_subject = btrim(promoted_by_subject)
    and char_length(promoted_by_subject) between 1 and 256
    and promoted_by_subject ~ '^[A-Za-z0-9:_@.-]+$'
  ),
  promoted_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id) on delete restrict,
  foreign key (organization_id, manifest_draft_id)
    references osp_private.request_manifest_drafts(organization_id, id) on delete restrict,
  foreign key (organization_id, review_id)
    references osp_private.request_manifest_decision_reviews(organization_id, id) on delete restrict,
  check (promoted_count + unchanged_count = jsonb_array_length(selected_keys_json))
);

create or replace function osp_private.normalize_request_knowledge_key(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select left(
    trim(both '.' from regexp_replace(lower(btrim(p_value)), '[^a-z0-9]+', '.', 'g')),
    128
  );
$$;

create or replace function osp_private.request_knowledge_candidates(
  p_organization_id uuid,
  p_case_id uuid,
  p_review_id uuid
)
returns table (
  knowledge_kind text,
  canonical_key text,
  display_label text,
  aliases_json jsonb,
  value_type text,
  required boolean,
  evidence_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with source as (
    select manifest.manifest_json
    from osp_private.request_manifest_decision_reviews review
    join osp_private.request_manifest_drafts manifest
      on manifest.organization_id = review.organization_id
     and manifest.id = review.manifest_draft_id
     and manifest.case_id = review.case_id
     and manifest.version = review.manifest_version
     and manifest.manifest_sha256 = review.manifest_sha256
    where review.organization_id = p_organization_id
      and review.case_id = p_case_id
      and review.id = p_review_id
      and review.status = 'resolved'
      and not exists (
        select 1
        from osp_private.request_manifest_decision_reviews later
        where later.organization_id = review.organization_id
          and later.case_id = review.case_id
          and later.manifest_draft_id = review.manifest_draft_id
          and later.review_version > review.review_version
      )
  ), raw_candidates as (
    select
      'field'::text as knowledge_kind,
      osp_private.normalize_request_knowledge_key(coalesce(nullif(item.value->>'canonicalFieldId', ''), item.value->>'id')) as canonical_key,
      btrim(item.value->>'sourceLabel') as display_label,
      jsonb_build_array(btrim(item.value->>'sourceLabel')) as aliases_json,
      item.value->>'valueType' as value_type,
      (item.value->>'required')::boolean as required,
      jsonb_array_length(item.value->'evidenceIds')::integer as evidence_count
    from source
    cross join lateral jsonb_array_elements(source.manifest_json->'requestedFields') item(value)
    where jsonb_typeof(item.value) = 'object'
      and item.value->>'id' ~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'
      and item.value->>'sourceLabel' = btrim(item.value->>'sourceLabel')
      and char_length(item.value->>'sourceLabel') between 1 and 256
      and item.value->>'sourceLabel' !~ '[[:cntrl:]]'
      and item.value->>'valueType' in ('text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown')
      and jsonb_typeof(item.value->'required') = 'boolean'
      and jsonb_typeof(item.value->'evidenceIds') = 'array'
      and jsonb_array_length(item.value->'evidenceIds') between 1 and 20
    union all
    select
      'document'::text,
      osp_private.normalize_request_knowledge_key(item.value->>'documentType'),
      btrim(item.value->>'documentType'),
      (
        select jsonb_agg(alias.value order by alias.ordinality)
        from (
          select to_jsonb(btrim(item.value->>'documentType')) as value, 0::bigint as ordinality
          union all
          select to_jsonb(btrim(alternative.value)), alternative.ordinality
          from jsonb_array_elements_text(item.value->'acceptableAlternatives') with ordinality alternative(value, ordinality)
          where btrim(alternative.value) <> ''
        ) alias
      ),
      null::text,
      (item.value->>'required')::boolean,
      jsonb_array_length(item.value->'evidenceIds')::integer
    from source
    cross join lateral jsonb_array_elements(source.manifest_json->'requestedDocuments') item(value)
    where jsonb_typeof(item.value) = 'object'
      and item.value->>'documentType' = btrim(item.value->>'documentType')
      and char_length(item.value->>'documentType') between 1 and 128
      and item.value->>'documentType' !~ '[[:cntrl:]]'
      and jsonb_typeof(item.value->'acceptableAlternatives') = 'array'
      and jsonb_array_length(item.value->'acceptableAlternatives') between 0 and 20
      and not exists (
        select 1
        from jsonb_array_elements(item.value->'acceptableAlternatives') alternative(value)
        where jsonb_typeof(alternative.value) <> 'string'
          or (alternative.value #>> '{}') <> btrim(alternative.value #>> '{}')
          or char_length(alternative.value #>> '{}') not between 1 and 256
          or (alternative.value #>> '{}') ~ '[[:cntrl:]]'
      )
      and jsonb_typeof(item.value->'required') = 'boolean'
      and jsonb_typeof(item.value->'evidenceIds') = 'array'
      and jsonb_array_length(item.value->'evidenceIds') between 1 and 20
  )
  select distinct on (candidate.knowledge_kind, candidate.canonical_key)
    candidate.knowledge_kind,
    candidate.canonical_key,
    candidate.display_label,
    candidate.aliases_json,
    candidate.value_type,
    candidate.required,
    candidate.evidence_count
  from raw_candidates candidate
  where candidate.canonical_key ~ '^[a-z][a-z0-9_.-]{0,127}$'
  order by candidate.knowledge_kind, candidate.canonical_key, candidate.display_label;
$$;

create or replace function osp_private.request_knowledge_candidate_sha256(
  p_organization_id uuid,
  p_case_id uuid,
  p_review_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(
    'osp-request-knowledge-v1' || E'\norganizationId=' || p_organization_id::text
      || E'\ncaseId=' || p_case_id::text
      || E'\nreviewId=' || p_review_id::text
      || coalesce(E'\n' || string_agg(
        candidate.knowledge_kind || '|' || candidate.canonical_key || '|'
          || pg_catalog.to_jsonb(candidate.display_label)::text || '|'
          || osp_private.canonical_jsonb_text(candidate.aliases_json) || '|'
          || coalesce(candidate.value_type, '') || '|'
          || candidate.required::text || '|' || candidate.evidence_count::text,
        E'\n' order by candidate.knowledge_kind, candidate.canonical_key
      ), ''),
    'UTF8'
  ), 'sha256'), 'hex')
  from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) candidate;
$$;

create or replace function osp_private.promote_request_knowledge_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_review_id uuid,
  p_expected_candidate_sha256 text,
  p_selected_keys jsonb,
  p_idempotency_key text,
  p_actor_subject text,
  p_actor_permission text
)
returns table (
  promotion_id uuid,
  promotion_status text,
  promoted_count integer,
  unchanged_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_review osp_private.request_manifest_decision_reviews%rowtype;
  target_manifest osp_private.request_manifest_drafts%rowtype;
  prior osp_private.request_knowledge_promotions%rowtype;
  candidate record;
  selection_sha text;
  actual_candidate_sha text;
  normalized_selection jsonb;
  inserted_ids jsonb := '[]'::jsonb;
  created_promotion_id uuid := gen_random_uuid();
  created_entry_id uuid;
  promoted integer := 0;
  unchanged integer := 0;
begin
  if p_actor_permission not in ('osp:operate', 'osp:superuser')
     or p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$'
     or char_length(p_actor_subject) not between 1 and 256
     or p_expected_candidate_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{1,256}$'
     or jsonb_typeof(p_selected_keys) <> 'array'
     or jsonb_array_length(p_selected_keys) not between 1 and 600
     or nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'REQUEST_KNOWLEDGE_PROMOTION_FORBIDDEN';
  end if;

  select jsonb_agg(item.value order by item.value)
  into normalized_selection
  from (select distinct value from jsonb_array_elements_text(p_selected_keys)) item;
  if jsonb_array_length(normalized_selection) <> jsonb_array_length(p_selected_keys)
     or exists (
       select 1 from jsonb_array_elements_text(normalized_selection) item(value)
       where item.value !~ '^(field|document):[a-z][a-z0-9_.-]{0,127}$'
     ) then
    raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_SELECTION_INVALID';
  end if;

  selection_sha := encode(extensions.digest(convert_to(
    'osp-request-knowledge-selection-v1'
      || E'\ncandidateSha256=' || p_expected_candidate_sha256
      || E'\nselected=' || osp_private.canonical_jsonb_text(normalized_selection),
    'UTF8'
  ), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_review_id::text, 0)
  );

  select * into prior
  from osp_private.request_knowledge_promotions promotion
  where promotion.organization_id = p_organization_id
    and promotion.idempotency_key = p_idempotency_key;
  if found then
    if prior.case_id is distinct from p_case_id
       or prior.review_id is distinct from p_review_id
       or prior.candidate_sha256 is distinct from p_expected_candidate_sha256
       or prior.selection_sha256 is distinct from selection_sha then
      raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select prior.id, 'applied'::text, prior.promoted_count,
      prior.unchanged_count, true;
    return;
  end if;

  select * into target_review
  from osp_private.request_manifest_decision_reviews review
  where review.organization_id = p_organization_id
    and review.case_id = p_case_id
    and review.id = p_review_id
    and review.status = 'resolved'
  for share;
  if not found or exists (
    select 1 from osp_private.request_manifest_decision_reviews later
    where later.organization_id = target_review.organization_id
      and later.case_id = target_review.case_id
      and later.manifest_draft_id = target_review.manifest_draft_id
      and later.review_version > target_review.review_version
  ) then
    raise exception using errcode = '40001', message = 'REQUEST_KNOWLEDGE_REVIEW_VERSION_CONFLICT';
  end if;

  select * into target_manifest
  from osp_private.request_manifest_drafts manifest
  where manifest.organization_id = p_organization_id
    and manifest.case_id = p_case_id
    and manifest.id = target_review.manifest_draft_id
    and manifest.version = target_review.manifest_version
    and manifest.manifest_sha256 = target_review.manifest_sha256;
  if not found then
    raise exception using errcode = '40001', message = 'REQUEST_KNOWLEDGE_REVIEW_VERSION_CONFLICT';
  end if;

  actual_candidate_sha := osp_private.request_knowledge_candidate_sha256(
    p_organization_id, p_case_id, p_review_id
  );
  if actual_candidate_sha is distinct from p_expected_candidate_sha256 then
    raise exception using errcode = '40001', message = 'REQUEST_KNOWLEDGE_CANDIDATE_CHANGED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(normalized_selection) selected(value)
    where not exists (
      select 1
      from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) candidate
      where candidate.knowledge_kind || ':' || candidate.canonical_key = selected.value
    )
  ) then
    raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_SELECTION_INVALID';
  end if;

  for candidate in
    select source.*
    from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) source
    where normalized_selection ? (source.knowledge_kind || ':' || source.canonical_key)
    order by source.knowledge_kind, source.canonical_key
  loop
    if exists (
      select 1 from osp_private.request_knowledge_catalog_entries entry
      where entry.organization_id = p_organization_id
        and entry.knowledge_kind = candidate.knowledge_kind
        and entry.canonical_key = candidate.canonical_key
    ) then
      unchanged := unchanged + 1;
      continue;
    end if;
    created_entry_id := gen_random_uuid();
    insert into osp_private.request_knowledge_catalog_entries (
      id, organization_id, knowledge_kind, canonical_key, display_label,
      aliases_json, value_type, source_case_id, source_manifest_draft_id,
      source_review_id, source_candidate_sha256, created_by_subject
    ) values (
      created_entry_id, p_organization_id, candidate.knowledge_kind,
      candidate.canonical_key, candidate.display_label, candidate.aliases_json,
      candidate.value_type, p_case_id, target_manifest.id, p_review_id,
      p_expected_candidate_sha256, p_actor_subject
    );
    inserted_ids := inserted_ids || jsonb_build_array(created_entry_id::text);
    promoted := promoted + 1;
  end loop;

  insert into osp_private.request_knowledge_promotions (
    id, organization_id, case_id, manifest_draft_id, review_id, review_version,
    idempotency_key, candidate_sha256, selection_sha256, selected_keys_json, inserted_entry_ids,
    promoted_count, unchanged_count, promoted_by_subject
  ) values (
    created_promotion_id, p_organization_id, p_case_id, target_manifest.id,
    p_review_id, target_review.review_version, p_idempotency_key, p_expected_candidate_sha256,
    selection_sha, normalized_selection, inserted_ids, promoted, unchanged,
    p_actor_subject
  );

  return query select created_promotion_id, 'applied'::text, promoted,
    unchanged, false;
end;
$$;

create function osp_private.reject_request_knowledge_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'REQUEST_KNOWLEDGE_LEDGER_APPEND_ONLY';
end;
$function$;

create trigger request_knowledge_entries_append_only
before update or delete on osp_private.request_knowledge_catalog_entries
for each row execute function osp_private.reject_request_knowledge_ledger_mutation();

create trigger request_knowledge_promotions_append_only
before update or delete on osp_private.request_knowledge_promotions
for each row execute function osp_private.reject_request_knowledge_ledger_mutation();

alter table osp_private.request_knowledge_catalog_entries enable row level security;
alter table osp_private.request_knowledge_catalog_entries force row level security;
alter table osp_private.request_knowledge_promotions enable row level security;
alter table osp_private.request_knowledge_promotions force row level security;

revoke all on osp_private.request_knowledge_catalog_entries,
  osp_private.request_knowledge_promotions
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select on osp_private.request_knowledge_catalog_entries,
  osp_private.request_knowledge_promotions to osp_workflow_api;
grant select on osp_private.request_knowledge_catalog_entries to osp_worker;

create policy request_knowledge_entries_workflow_read_tenant
on osp_private.request_knowledge_catalog_entries for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create policy request_knowledge_entries_worker_read_tenant
on osp_private.request_knowledge_catalog_entries for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create policy request_knowledge_promotions_workflow_read_tenant
on osp_private.request_knowledge_promotions for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

revoke all on function osp_private.normalize_request_knowledge_key(text),
  osp_private.request_knowledge_candidates(uuid, uuid, uuid),
  osp_private.request_knowledge_candidate_sha256(uuid, uuid, uuid),
  osp_private.promote_request_knowledge_command(uuid, uuid, uuid, text, jsonb, text, text, text),
  osp_private.reject_request_knowledge_ledger_mutation()
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;

grant execute on function osp_private.request_knowledge_candidates(uuid, uuid, uuid),
  osp_private.request_knowledge_candidate_sha256(uuid, uuid, uuid),
  osp_private.promote_request_knowledge_command(uuid, uuid, uuid, text, jsonb, text, text, text)
to osp_workflow_api;

comment on table osp_private.request_knowledge_catalog_entries is
'Human-promoted semantic labels and document requirements for future OSP request interpretation. Contains no business values or external-action authority.';
comment on table osp_private.request_knowledge_promotions is
'Append-only receipt for an exact, human-selected request-knowledge promotion. No outbound effects.';
