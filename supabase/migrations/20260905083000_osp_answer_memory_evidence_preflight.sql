-- Read-only least-privilege preflight. No direct grants on corporate tables.
create function osp_private.load_answer_memory_evidence(
  p_organization_id uuid, p_case_id uuid, p_candidate_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(option)), '[]'::jsonb) from (
    select review.id as "reviewId", field.id as "reviewFieldId", review.revision as "reviewRevision",
          asset.id as "documentAssetId", field.field_code as "fieldCode",
          candidate.answer_value #>> '{}' as "reviewedValue", fact.id as "currentFactId",
          case when jsonb_typeof(fact.fact_value) = 'string' then fact.fact_value #>> '{}' end as "currentValue",
          to_char(asset.expiration_date, 'YYYY-MM-DD') as "evidenceExpiresOn",
          (select count(*)::integer from public.provider_entity_document_review_fields batch
            where batch.organization_id=review.organization_id and batch.review_id=review.id
              and batch.field_status in ('accepted','corrected')) as "documentFieldCount",
          case
            when fact.id is not null and fact.fact_value is distinct from candidate.answer_value then 'fact_conflict'
            when fact.id is null or promotion.promotion_status is distinct from 'applied' then 'document_promotion_required'
            when exists (select 1 from osp_private.load_xbf_customer_setup_candidates_for_case(candidate.organization_id,candidate.case_id) reusable
              where reusable.evidence_id='rateware:legal-entity-fact:' || fact.id::text and reusable.value_json=candidate.answer_value) then 'already_reusable'
            when original_review.review_status='approved' and original_review.decided_at is not null
              and original_field.field_code=fact.field_code and original_field.field_status in ('accepted','corrected')
              and fact.fact_value=case when original_field.field_status='corrected' then original_field.reviewer_value else original_field.proposed_value end
              and original_field.sensitivity in ('public','internal','confidential') and original_promotion.promotion_status='applied'
              and original_asset.lifecycle_status='active' and original_asset.verification_status='verified'
              and (original_asset.effective_date is null or original_asset.effective_date<=current_date)
              and original_asset.expiration_date<current_date and fact.effective_at<=statement_timestamp() then 'renewal_required'
            else 'blocked'
          end as state
        from osp_private.case_answer_memory_candidates candidate
        join osp_private.case_answer_memory_reviews answer_review on answer_review.organization_id=candidate.organization_id
          and answer_review.candidate_id=candidate.id and answer_review.decision='accepted' and answer_review.answer_sha256=candidate.answer_sha256
        join osp_private.case_form_instances instance on instance.organization_id=candidate.organization_id and instance.case_id=candidate.case_id
          and instance.id=candidate.source_instance_id and instance.version=candidate.source_instance_version
          and instance.template_version_id=candidate.source_template_version_id and instance.values_json->candidate.field_key=candidate.answer_value
        join osp_private.case_profile_bindings binding on binding.organization_id=candidate.organization_id and binding.case_id=candidate.case_id
          and binding.legal_entity_id=candidate.legal_entity_id and binding.revision=candidate.binding_revision
        join public.legal_entities entity on entity.organization_id=binding.organization_id and entity.id=binding.legal_entity_id and entity.status='active'
        join (values ('supplier.legalName','legal_name'),('supplier.address','fiscal_address'),('supplier.phone','phone'),
          ('supplier.email','email'),('supplier.website','website'),('legal.representativeName','legal_representative'),('fiscal.taxRegime','tax_regime'))
          vocabulary(canonical_key,field_code) on vocabulary.canonical_key=candidate.canonical_field_id
        join public.provider_entity_document_reviews review on review.organization_id=candidate.organization_id
          and review.legal_entity_id=candidate.legal_entity_id and review.review_status='approved' and review.decided_at is not null
        join public.provider_entity_document_review_fields field on field.organization_id=review.organization_id and field.review_id=review.id
          and field.field_code=vocabulary.field_code and field.field_status in ('accepted','corrected')
          and field.sensitivity in ('public','internal','confidential')
          and candidate.answer_value=case when field.field_status='corrected' then field.reviewer_value else field.proposed_value end
        join public.provider_legal_entity_document_assets asset on asset.organization_id=review.organization_id
          and asset.legal_entity_id=review.legal_entity_id and asset.id=review.document_asset_id
          and asset.lifecycle_status='active' and asset.verification_status='verified'
          and (asset.effective_date is null or asset.effective_date<=current_date)
          and (asset.expiration_date is null or asset.expiration_date>=current_date)
        left join public.provider_legal_entity_fact_promotions promotion on promotion.organization_id=review.organization_id
          and promotion.legal_entity_id=review.legal_entity_id and promotion.review_id=review.id
        left join public.provider_legal_entity_facts fact on fact.organization_id=review.organization_id
          and fact.legal_entity_id=review.legal_entity_id and fact.field_code=field.field_code and fact.fact_status='current'
        left join public.provider_entity_document_reviews original_review on original_review.organization_id=fact.organization_id
          and original_review.legal_entity_id=fact.legal_entity_id and original_review.id=fact.source_review_id
        left join public.provider_entity_document_review_fields original_field on original_field.organization_id=fact.organization_id
          and original_field.review_id=original_review.id and original_field.id=fact.source_review_field_id
        left join public.provider_legal_entity_fact_promotions original_promotion on original_promotion.organization_id=fact.organization_id
          and original_promotion.legal_entity_id=fact.legal_entity_id and original_promotion.review_id=original_review.id and original_promotion.id=fact.source_promotion_id
        left join public.provider_legal_entity_document_assets original_asset on original_asset.organization_id=fact.organization_id
          and original_asset.legal_entity_id=fact.legal_entity_id and original_asset.id=original_review.document_asset_id
        where candidate.organization_id=p_organization_id and candidate.case_id=p_case_id and candidate.id=p_candidate_id
          and nullif(current_setting('osp.organization_id',true),'')::uuid=candidate.organization_id
          and (fact.id is null or fact.sensitivity in ('public','internal','confidential'))
        order by review.decided_at desc, review.id, field.id limit 20
  ) option;
$$;
revoke all on function osp_private.load_answer_memory_evidence(uuid,uuid,uuid) from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.load_answer_memory_evidence(uuid,uuid,uuid) to osp_workflow_api;
comment on function osp_private.load_answer_memory_evidence(uuid,uuid,uuid) is 'Exact same-entity evidence comparison for accepted answers. Read only; no evidence link, renewal, fact promotion or release authority.';
