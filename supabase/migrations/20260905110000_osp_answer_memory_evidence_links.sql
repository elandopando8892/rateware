-- Local/preview only until explicitly deployed. No fact-value writes, outgoing
-- jobs, document promotion or release authority. Receipts contain references,
-- expectations and rationale, not a second corporate-value catalogue.
create table osp_private.answer_memory_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  case_id uuid not null,
  candidate_id uuid not null references osp_private.case_answer_memory_candidates(id),
  answer_review_id uuid not null references osp_private.case_answer_memory_reviews(id),
  legal_entity_id uuid not null,
  fact_id uuid not null,
  review_id uuid not null,
  review_field_id uuid not null,
  review_revision integer not null check (review_revision > 0),
  document_asset_id uuid not null,
  evidence_effective_on date,
  evidence_expires_on date,
  action text not null check (action in ('link','renew')),
  expectation_sha256 text not null check (expectation_sha256 ~ '^[0-9a-f]{64}$'),
  answer_sha256 text not null check (answer_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(idempotency_key) between 1 and 256 and idempotency_key ~ '^[A-Za-z0-9:_-]+$'),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  actor_subject text not null check (length(actor_subject) between 1 and 256),
  recorded_at timestamptz not null default statement_timestamp(),
  unique(organization_id,idempotency_key),
  unique(organization_id,candidate_id,fact_id,review_field_id,review_revision,action),
  foreign key (organization_id,legal_entity_id) references public.legal_entities(organization_id,id),
  foreign key (organization_id,fact_id) references public.provider_legal_entity_facts(organization_id,id),
  foreign key (organization_id,review_id) references public.provider_entity_document_reviews(organization_id,id),
  foreign key (organization_id,review_field_id) references public.provider_entity_document_review_fields(organization_id,id)
);
create index answer_memory_evidence_links_fact on osp_private.answer_memory_evidence_links(organization_id,fact_id) where action='renew';
alter table osp_private.answer_memory_evidence_links enable row level security;
revoke all on osp_private.answer_memory_evidence_links from public,anon,authenticated,service_role,osp_worker,osp_workflow_api;

-- Includes the unmasked source rows, but only a SHA-256 leaves this function.
-- A metadata/revision/date/value change between comparison and confirmation
-- requires another comparison; old receipts are never interpreted as authority.
create function osp_private.answer_memory_evidence_fingerprint(p_org uuid,p_candidate uuid,p_field uuid,p_fact uuid)
returns text language sql stable security definer set search_path='' as $$
  select encode(extensions.digest(convert_to(jsonb_build_array(
    to_jsonb(c),to_jsonb(i),to_jsonb(b),to_jsonb(a),to_jsonb(e),to_jsonb(f),
    to_jsonb(r),to_jsonb(d),to_jsonb(p),to_jsonb(v),to_jsonb(o),to_jsonb(ofield),to_jsonb(od),to_jsonb(op)
  )::text,'UTF8'),'sha256'),'hex')
  from osp_private.case_answer_memory_candidates c
  join osp_private.case_form_instances i on i.organization_id=c.organization_id and i.id=c.source_instance_id and i.case_id=c.case_id
  join osp_private.case_profile_bindings b on b.organization_id=c.organization_id and b.case_id=c.case_id
  join osp_private.case_answer_memory_reviews a on a.organization_id=c.organization_id and a.candidate_id=c.id
  join public.legal_entities e on e.organization_id=c.organization_id and e.id=c.legal_entity_id
  join public.provider_entity_document_review_fields f on f.organization_id=c.organization_id and f.id=p_field
  join public.provider_entity_document_reviews r on r.organization_id=f.organization_id and r.id=f.review_id and r.legal_entity_id=e.id
  join public.provider_legal_entity_document_assets d on d.organization_id=r.organization_id and d.id=r.document_asset_id and d.legal_entity_id=e.id
  join public.provider_legal_entity_fact_promotions p on p.organization_id=r.organization_id and p.review_id=r.id and p.legal_entity_id=e.id
  join public.provider_legal_entity_facts v on v.organization_id=c.organization_id and v.id=p_fact and v.legal_entity_id=e.id
  join public.provider_entity_document_reviews o on o.organization_id=v.organization_id and o.id=v.source_review_id and o.legal_entity_id=e.id
  join public.provider_entity_document_review_fields ofield on ofield.organization_id=v.organization_id and ofield.id=v.source_review_field_id and ofield.review_id=o.id
  join public.provider_legal_entity_document_assets od on od.organization_id=o.organization_id and od.id=o.document_asset_id and od.legal_entity_id=e.id
  join public.provider_legal_entity_fact_promotions op on op.organization_id=v.organization_id and op.id=v.source_promotion_id and op.review_id=o.id and op.legal_entity_id=e.id
  where c.organization_id=p_org and c.id=p_candidate
    and p.expected_review_revision=r.revision and op.expected_review_revision=o.revision
    and nullif(current_setting('osp.organization_id',true),'')::uuid=p_org;
$$;
revoke all on function osp_private.answer_memory_evidence_fingerprint(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,osp_worker,osp_workflow_api;

create function osp_private.load_answer_memory_evidence_intents(p_org uuid,p_case uuid,p_candidate uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(option || case when fingerprint is not null then jsonb_build_object('expectationSha256',fingerprint) else '{}'::jsonb end),'[]'::jsonb)
  from jsonb_array_elements(osp_private.load_answer_memory_evidence(p_org,p_case,p_candidate)) option
  cross join lateral (select osp_private.answer_memory_evidence_fingerprint(p_org,p_candidate,(option->>'reviewFieldId')::uuid,(option->>'currentFactId')::uuid) as fingerprint) stamp;
$$;
revoke all on function osp_private.load_answer_memory_evidence_intents(uuid,uuid,uuid) from public,anon,authenticated,service_role,osp_worker;
grant execute on function osp_private.load_answer_memory_evidence_intents(uuid,uuid,uuid) to osp_workflow_api;

create function osp_private.link_answer_memory_evidence(
  p_org uuid,p_case uuid,p_candidate uuid,p_field uuid,p_fact uuid,
  p_answer_hash text,p_expectation text,p_action text,p_reason text,p_subject text,p_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c osp_private.case_answer_memory_candidates%rowtype;
  f public.provider_legal_entity_facts%rowtype;
  locked_fact public.provider_legal_entity_facts%rowtype;
  selected_review uuid;
  prior osp_private.answer_memory_evidence_links%rowtype;
  receipt osp_private.answer_memory_evidence_links%rowtype;
  option jsonb;
begin
  if nullif(current_setting('osp.organization_id',true),'')::uuid is distinct from p_org
    or nullif(current_setting('osp.actor_subject',true),'') is distinct from p_subject
    or coalesce(current_setting('osp.actor_permission',true),'') not in ('osp:operate','osp:superuser') then
    raise exception using errcode='42501',message='FORM_MEMORY_FORBIDDEN';
  end if;
  if p_org is null or p_case is null or p_candidate is null or p_field is null or p_fact is null
    or p_answer_hash is null or p_answer_hash !~ '^[0-9a-f]{64}$'
    or p_expectation is null or p_expectation !~ '^[0-9a-f]{64}$'
    or p_action is null or p_action not in ('link','renew')
    or p_reason is null or length(btrim(p_reason)) not between 10 and 1000
    or p_subject is null or length(p_subject) not between 1 and 256
    or p_key is null or length(p_key) not between 1 and 256 or p_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode='22023',message='FORM_MEMORY_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':answer-evidence:' || p_key,0));
  select * into prior from osp_private.answer_memory_evidence_links where organization_id=p_org and idempotency_key=p_key;
  if found then
    if prior.case_id<>p_case or prior.candidate_id<>p_candidate or prior.review_field_id<>p_field or prior.fact_id<>p_fact
      or prior.answer_sha256<>p_answer_hash or prior.expectation_sha256<>p_expectation or prior.action<>p_action
      or prior.reason<>btrim(p_reason) or prior.actor_subject<>p_subject then
      raise exception using errcode='23514',message='IDEMPOTENCY_CONFLICT';
    end if;
    -- Historical receipt only. Reuse always re-evaluates current evidence.
    return jsonb_build_object('receiptId',prior.id,'factId',prior.fact_id,'action',prior.action,'replayed',true,'externalEffects',false);
  end if;

  -- Same initial order as answer review/form preparation. NOWAIT on all source
  -- rows makes contention a fail-closed conflict, never a retry inside a write.
  select * into c from osp_private.case_answer_memory_candidates where organization_id=p_org and case_id=p_case and id=p_candidate for share nowait;
  if not found or c.answer_sha256<>p_answer_hash then raise exception using errcode='23514',message='FORM_MEMORY_STALE'; end if;
  perform 1 from osp_private.case_form_instances where organization_id=p_org and case_id=p_case and id=c.source_instance_id for share nowait;
  perform 1 from osp_private.case_profile_bindings where organization_id=p_org and case_id=p_case for share nowait;
  perform 1 from osp_private.case_answer_memory_reviews where organization_id=p_org and candidate_id=p_candidate for share nowait;
  perform 1 from public.legal_entities where organization_id=p_org and id=c.legal_entity_id for share nowait;
  select * into f from public.provider_legal_entity_facts where organization_id=p_org and id=p_fact and legal_entity_id=c.legal_entity_id;
  select review_id into selected_review from public.provider_entity_document_review_fields where organization_id=p_org and id=p_field;
  -- Review-before-field/fact matches the documentary review and promotion commands.
  perform 1 from public.provider_entity_document_reviews where organization_id=p_org and id in (selected_review,f.source_review_id) order by id for share nowait;
  perform 1 from public.provider_entity_document_review_fields where organization_id=p_org and id in (p_field,f.source_review_field_id) order by id for share nowait;
  perform 1 from public.provider_legal_entity_document_assets where organization_id=p_org and id in
    (select document_asset_id from public.provider_entity_document_reviews where organization_id=p_org and id in (selected_review,f.source_review_id)) order by id for share nowait;
  perform 1 from public.provider_legal_entity_fact_promotions where organization_id=p_org and review_id in (selected_review,f.source_review_id) order by id for share nowait;
  select * into locked_fact from public.provider_legal_entity_facts where organization_id=p_org and id=p_fact for share nowait;
  if to_jsonb(locked_fact) is distinct from to_jsonb(f) or exists (
    select 1 from public.provider_entity_document_review_fields where organization_id=p_org and id=p_field and review_id is distinct from selected_review
  ) then raise exception using errcode='40001',message='FORM_MEMORY_EVIDENCE_CONFLICT'; end if;

  select item into option from jsonb_array_elements(osp_private.load_answer_memory_evidence_intents(p_org,p_case,p_candidate)) item
    where item->>'reviewFieldId'=p_field::text and item->>'currentFactId'=p_fact::text;
  if option is null or option->>'expectationSha256' is distinct from p_expectation
    or option->>'state' is distinct from (case when p_action='renew' then 'renewal_required' else 'already_reusable' end) then
    raise exception using errcode='23514',message='FORM_MEMORY_EVIDENCE_CHANGED';
  end if;
  insert into osp_private.answer_memory_evidence_links(organization_id,case_id,candidate_id,answer_review_id,legal_entity_id,fact_id,
    review_id,review_field_id,review_revision,document_asset_id,evidence_effective_on,evidence_expires_on,
    action,expectation_sha256,answer_sha256,idempotency_key,reason,actor_subject)
  select p_org,p_case,p_candidate,a.id,c.legal_entity_id,p_fact,r.id,p_field,r.revision,d.id,d.effective_date,d.expiration_date,
    p_action,p_expectation,p_answer_hash,p_key,btrim(p_reason),p_subject
  from osp_private.case_answer_memory_reviews a
  join public.provider_entity_document_reviews r on r.organization_id=p_org and r.id=selected_review
  join public.provider_legal_entity_document_assets d on d.organization_id=r.organization_id and d.id=r.document_asset_id and d.legal_entity_id=c.legal_entity_id
  where a.organization_id=p_org and a.candidate_id=p_candidate and a.decision='accepted'
  returning * into receipt;
  if receipt.id is null then raise exception using errcode='23514',message='FORM_MEMORY_EVIDENCE_CHANGED'; end if;
  return jsonb_build_object('receiptId',receipt.id,'factId',receipt.fact_id,'action',receipt.action,'replayed',false,'externalEffects',false);
exception when lock_not_available or unique_violation then
  raise exception using errcode='40001',message='FORM_MEMORY_EVIDENCE_CONFLICT';
end;
$$;
revoke all on function osp_private.link_answer_memory_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role,osp_worker;
grant execute on function osp_private.link_answer_memory_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text) to osp_workflow_api;
comment on table osp_private.answer_memory_evidence_links is 'Append-only answer/evidence receipts. Renewals back an unchanged fact, never overwrite its original source or authorize carrier disclosure.';

-- Preserve every original provenance guard. Only an expired (not withdrawn or
-- rejected) source may use an explicitly confirmed, currently valid backup.
create or replace function osp_private.load_xbf_customer_setup_candidates_for_case(
  p_organization_id uuid,
  p_case_id uuid
) returns table (field_key text, value_json jsonb, evidence_id text)
language sql stable security definer set search_path = ''
as $$
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
  ) vocabulary(field_code, canonical_key) on vocabulary.field_code = fact.field_code
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
    and promotion.id = fact.source_promotion_id and promotion.promotion_status = 'applied'
  join public.provider_legal_entity_document_assets asset
    on asset.organization_id = fact.organization_id
    and asset.legal_entity_id = fact.legal_entity_id
    and asset.id = review.document_asset_id
    and asset.lifecycle_status = 'active' and asset.verification_status = 'verified'
    and (asset.effective_date is null or asset.effective_date <= current_date)
    and (asset.expiration_date is null or asset.expiration_date >= current_date or (
      asset.expiration_date < current_date and fact.field_code in ('legal_name','fiscal_address','phone','email','website','legal_representative','tax_regime')
      and exists (
        select 1 from osp_private.answer_memory_evidence_links link
        join public.provider_entity_document_reviews backup_review on backup_review.organization_id=link.organization_id
          and backup_review.id=link.review_id and backup_review.legal_entity_id=fact.legal_entity_id
          and backup_review.revision=link.review_revision and backup_review.review_status='approved' and backup_review.decided_at is not null
        join public.provider_entity_document_review_fields backup_field on backup_field.organization_id=link.organization_id
          and backup_field.id=link.review_field_id and backup_field.review_id=backup_review.id and backup_field.field_code=fact.field_code
          and backup_field.field_status in ('accepted','corrected') and backup_field.sensitivity in ('public','internal','confidential')
          and fact.fact_value=case when backup_field.field_status='corrected' then backup_field.reviewer_value else backup_field.proposed_value end
        join public.provider_legal_entity_document_assets backup_asset on backup_asset.organization_id=link.organization_id
          and backup_asset.id=link.document_asset_id and backup_asset.id=backup_review.document_asset_id and backup_asset.legal_entity_id=fact.legal_entity_id
          and backup_asset.lifecycle_status='active' and backup_asset.verification_status='verified'
          and backup_asset.effective_date is not distinct from link.evidence_effective_on
          and backup_asset.expiration_date is not distinct from link.evidence_expires_on
          and (backup_asset.effective_date is null or backup_asset.effective_date<=current_date)
          and (backup_asset.expiration_date is null or backup_asset.expiration_date>=current_date)
        join public.provider_legal_entity_fact_promotions backup_promotion on backup_promotion.organization_id=link.organization_id
          and backup_promotion.review_id=backup_review.id and backup_promotion.legal_entity_id=fact.legal_entity_id
          and backup_promotion.promotion_status='applied' and backup_promotion.expected_review_revision=link.review_revision
        where link.organization_id=fact.organization_id and link.legal_entity_id=fact.legal_entity_id and link.fact_id=fact.id and link.action='renew'
      )
    ))
  where binding.organization_id = p_organization_id and binding.case_id = p_case_id
    and nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid = p_organization_id
    and fact.effective_at <= pg_catalog.statement_timestamp()
    -- Restricted facts require their separate disclosure/review path, not generic reuse.
    and fact.sensitivity in ('public', 'internal', 'confidential')
    and reviewed_field.sensitivity in ('public', 'internal', 'confidential')
    and pg_catalog.jsonb_typeof(fact.fact_value) in ('string', 'number', 'boolean')
  order by vocabulary.canonical_key, fact.field_code, fact.id;
$$;

revoke all on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
  from public, anon, authenticated;
grant execute on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
  to osp_worker, osp_workflow_api;

comment on function osp_private.load_xbf_customer_setup_candidates_for_case(uuid, uuid)
is 'Read-only approved XBF memory for the bound entity, including explicitly renewed evidence for unchanged basic facts. Preserves fact provenance; never promotes answers, validates carrier-specific freshness, attaches documents or authorizes outgoing effects.';
