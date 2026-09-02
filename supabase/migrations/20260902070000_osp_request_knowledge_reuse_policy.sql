-- Keep supervised OSP memory reusable across suppliers. Provider forms and
-- process instructions remain case evidence; only stable concepts can enter
-- the shared vocabulary. This migration has no network or outbound effects.

create or replace function osp_private.request_knowledge_reuse_policy(
  p_knowledge_kind text,
  p_canonical_key text,
  p_display_label text,
  p_aliases_json jsonb,
  p_value_type text
)
returns table (
  reuse_eligibility text,
  eligibility_reason text,
  target_canonical_key text,
  target_display_label text,
  target_aliases_json jsonb
)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_label text := lower(btrim(p_display_label));
  resolved_key text;
  resolved_label text;
  resolved_eligibility text := 'review_required';
  resolved_reason text := 'taxonomy_review_required';
  resolved_aliases jsonb;
begin
  if p_knowledge_kind not in ('field', 'document')
     or p_canonical_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
     or p_display_label is distinct from btrim(p_display_label)
     or char_length(p_display_label) not between 1 and 256
     or jsonb_typeof(p_aliases_json) <> 'array'
     or jsonb_array_length(p_aliases_json) not between 1 and 21
     or (p_knowledge_kind = 'field' and p_value_type not in ('text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown'))
     or (p_knowledge_kind = 'document' and p_value_type is not null) then
    raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_POLICY_INPUT_INVALID';
  end if;

  if normalized_label ~ '(cww[- _]?qf[- _]?[0-9]+|formato[[:space:]]+[0-9]+|supplier[[:space:]]+(registration|setup)[[:space:]]+(form|application)|provider[[:space:]]+(form|template)|cuestionario|questionnaire|plantilla|template)'
     or normalized_label ~ '^(llenado|completar|complete and sign|fill out|submit|enviar|firmado|signed)[[:space:]]' then
    resolved_eligibility := 'case_specific';
    resolved_reason := 'provider_specific_requirement';
  elsif p_knowledge_kind = 'document' then
    case
      when normalized_label ~ '(^|[^a-z0-9])w[ -]?9([^a-z0-9]|$)|^irs form w-9$|^tax form$' then
        resolved_key := 'fiscal.w9'; resolved_label := 'IRS Form W-9';
      when normalized_label in ('carátula del banco', 'caratula del banco', 'bank account evidence', 'bank account verification', 'voided check') then
        resolved_key := 'banking.account_evidence'; resolved_label := 'Bank account evidence';
      when normalized_label in ('bank reference', 'bank reference letter', 'bank letter', 'carta bancaria', 'carta de referencia bancaria') then
        resolved_key := 'banking.reference_letter'; resolved_label := 'Bank reference letter';
      when normalized_label in ('comprobante domicilio', 'comprobante de domicilio', 'proof of address', 'address proof') then
        resolved_key := 'legal.proof_of_address'; resolved_label := 'Proof of address';
      when normalized_label in ('constancia situación fiscal', 'constancia de situación fiscal', 'constancia situacion fiscal', 'constancia de situacion fiscal', 'tax status certificate') then
        resolved_key := 'fiscal.tax_status_certificate'; resolved_label := 'Tax status certificate';
      when normalized_label in ('acta constitutiva', 'articles of incorporation', 'certificate of formation') then
        resolved_key := 'legal.articles_of_incorporation'; resolved_label := 'Articles of incorporation';
      when normalized_label in ('ine representante', 'ine del representante', 'identificación del representante legal', 'identificacion del representante legal', 'legal representative id') then
        resolved_key := 'identity.legal_representative'; resolved_label := 'Legal representative identification';
      when normalized_label in ('opinión positiva sat', 'opinion positiva sat', 'opinión de cumplimiento sat', 'opinion de cumplimiento sat', 'sat positive opinion', 'tax compliance opinion') then
        resolved_key := 'fiscal.sat_compliance_opinion'; resolved_label := 'SAT tax compliance opinion';
      when normalized_label in ('poder notarial', 'power of attorney') then
        resolved_key := 'legal.power_of_attorney'; resolved_label := 'Power of attorney';
      when normalized_label in ('broker authority', 'mc authority', 'operating authority') then
        resolved_key := 'operations.broker_authority'; resolved_label := 'Broker operating authority';
      when normalized_label in ('bond insurance', 'surety bond', 'broker bond') then
        resolved_key := 'insurance.surety_bond'; resolved_label := 'Surety bond';
      else null;
    end case;
    if resolved_key is not null then
      resolved_eligibility := 'eligible';
      resolved_reason := 'curated_common_concept';
    end if;
  elsif p_knowledge_kind = 'field'
        and p_canonical_key = 'trade.references'
        and normalized_label ~ '^((three|3)[[:space:]])?trade references$' then
    resolved_key := 'business.trade.references';
    resolved_label := 'Trade references';
    resolved_eligibility := 'eligible';
    resolved_reason := 'curated_common_concept';
  elsif p_canonical_key ~ '^(supplier|business|fiscal|banking|legal|identity|contact|billing|shipping|operations|finance|credit|tax)\.[a-z0-9_.-]+$'
        and char_length(p_canonical_key) <= 96
        and char_length(p_display_label) <= 128 then
    resolved_key := p_canonical_key;
    resolved_label := p_display_label;
    resolved_eligibility := 'eligible';
    resolved_reason := 'stable_canonical_field';
  end if;

  if resolved_key is not null then
    select coalesce(jsonb_agg(candidate.value order by candidate.first_ordinal), '[]'::jsonb)
    into resolved_aliases
    from (
      select deduplicated.value, min(deduplicated.ordinality) as first_ordinal
      from (
        select resolved_label as value, 0::bigint as ordinality
        union all
        select alias.value, alias.ordinality
        from jsonb_array_elements_text(p_aliases_json) with ordinality alias(value, ordinality)
      ) deduplicated
      where btrim(deduplicated.value) <> ''
      group by lower(btrim(deduplicated.value)), deduplicated.value
      order by min(deduplicated.ordinality)
      limit 21
    ) candidate;
  else
    resolved_aliases := p_aliases_json;
  end if;

  return query select resolved_eligibility, resolved_reason, resolved_key,
    resolved_label, resolved_aliases;
end;
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
  candidate_policy record;
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
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
     or char_length(p_idempotency_key) not between 1 and 256
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
      from osp_private.request_knowledge_candidates(p_organization_id, p_case_id, p_review_id) available_candidate
      where available_candidate.knowledge_kind || ':' || available_candidate.canonical_key = selected.value
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
    select * into candidate_policy
    from osp_private.request_knowledge_reuse_policy(
      candidate.knowledge_kind, candidate.canonical_key, candidate.display_label,
      candidate.aliases_json, candidate.value_type
    );
    if candidate_policy.reuse_eligibility <> 'eligible'
       or candidate_policy.target_canonical_key is null
       or candidate_policy.target_display_label is null then
      raise exception using errcode = '22023', message = 'REQUEST_KNOWLEDGE_SELECTION_NOT_REUSABLE';
    end if;

    if exists (
      select 1 from osp_private.request_knowledge_catalog_entries entry
      where entry.organization_id = p_organization_id
        and entry.knowledge_kind = candidate.knowledge_kind
        and entry.canonical_key = candidate_policy.target_canonical_key
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
      candidate_policy.target_canonical_key, candidate_policy.target_display_label,
      candidate_policy.target_aliases_json, candidate.value_type, p_case_id,
      target_manifest.id, p_review_id, p_expected_candidate_sha256, p_actor_subject
    );
    inserted_ids := inserted_ids || jsonb_build_array(created_entry_id::text);
    promoted := promoted + 1;
  end loop;

  insert into osp_private.request_knowledge_promotions (
    id, organization_id, case_id, manifest_draft_id, review_id, review_version,
    idempotency_key, candidate_sha256, selection_sha256, selected_keys_json,
    inserted_entry_ids, promoted_count, unchanged_count, promoted_by_subject
  ) values (
    created_promotion_id, p_organization_id, p_case_id, target_manifest.id,
    p_review_id, target_review.review_version, p_idempotency_key,
    p_expected_candidate_sha256, selection_sha, normalized_selection,
    inserted_ids, promoted, unchanged, p_actor_subject
  );

  return query select created_promotion_id, 'applied'::text, promoted,
    unchanged, false;
end;
$$;

revoke all on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text)
from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant execute on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text)
to osp_workflow_api;

comment on function osp_private.request_knowledge_reuse_policy(text, text, text, jsonb, text) is
'Deterministically classifies reviewed request concepts as reusable, provider-specific or taxonomy-review-only and proposes a reusable canonical target. No values or external effects.';

comment on function osp_private.promote_request_knowledge_command(uuid, uuid, uuid, text, jsonb, text, text, text) is
'Promotes only exact human-selected candidates accepted by the supervised reuse policy. Provider-specific concepts fail closed; no external effects.';
