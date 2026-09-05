-- Reuse the existing approved corporate-fact store, never arbitrary form answers.
-- Read-only candidate projection; no fact promotion, case mutation or disclosure.
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
    and (asset.expiration_date is null or asset.expiration_date >= current_date)
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
is 'Read-only approved XBF memory for the bound entity. Preserves fact provenance; never promotes answers, validates carrier-specific freshness, attaches documents or authorizes outgoing effects.';
