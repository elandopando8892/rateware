-- Provider Service Build 3: deterministic document projections.

create or replace view public.provider_document_latest_reviews
with (security_invoker = true)
as
select distinct on (review.organization_id, review.document_version_id)
  review.id,
  review.organization_id,
  review.document_version_id,
  review.review_type,
  review.decision,
  review.reviewed_by_user_id,
  review.reviewed_at,
  review.decision_note,
  review.created_at
from public.provider_document_reviews review
where review.decision <> 'pending'
order by
  review.organization_id,
  review.document_version_id,
  coalesce(review.reviewed_at, review.created_at) desc,
  review.created_at desc,
  review.id desc;

create or replace view public.provider_document_version_effective_state
with (security_invoker = true)
as
select
  version.id as document_version_id,
  version.organization_id,
  version.provider_document_id,
  version.provider_relationship_id,
  version.legal_entity_id,
  version.version_number,
  version.processing_status,
  version.classification_status,
  version.effective_date,
  version.expiration_date,
  document.document_type,
  document.document_key,
  document.document_name,
  document.direction,
  document.lifecycle_status,
  document.sensitivity,
  review.id as latest_review_id,
  review.review_type as latest_review_type,
  review.decision as latest_review_decision,
  review.reviewed_at as latest_reviewed_at,
  case
    when document.lifecycle_status = 'archived' then 'archived'
    when document.lifecycle_status = 'revoked' then 'revoked'
    when version.processing_status = 'archived' then 'archived'
    when version.processing_status = 'superseded' then 'superseded'
    when version.expiration_date is not null and version.expiration_date < current_date then 'expired'
    when review.decision = 'rejected' then 'rejected'
    when review.decision = 'correction_required' then 'correction_required'
    when review.decision = 'approved' and version.processing_status = 'ready' then 'verified'
    when version.processing_status = 'ready' then 'needs_review'
    else version.processing_status
  end as effective_state
from public.provider_document_versions version
join public.provider_documents document
  on document.organization_id = version.organization_id
 and document.id = version.provider_document_id
left join public.provider_document_latest_reviews review
  on review.organization_id = version.organization_id
 and review.document_version_id = version.id;

create or replace view public.provider_current_document_versions
with (security_invoker = true)
as
with ranked as (
  select
    effective.*,
    row_number() over (
      partition by effective.organization_id, effective.provider_document_id
      order by effective.version_number desc, effective.document_version_id desc
    ) as version_rank
  from public.provider_document_version_effective_state effective
  where effective.effective_state not in ('superseded', 'archived')
)
select *
from ranked
where version_rank = 1;

create or replace view public.provider_document_requirement_evidence_status
with (security_invoker = true)
as
select
  link.id as requirement_link_id,
  link.organization_id,
  link.provider_relationship_id,
  link.legal_entity_id,
  link.activation_id,
  link.activation_requirement_id,
  link.document_version_id,
  link.link_role,
  link.status as link_status,
  effective.provider_document_id,
  effective.document_type,
  effective.document_key,
  effective.document_name,
  effective.version_number,
  effective.expiration_date,
  effective.latest_review_decision,
  effective.effective_state,
  (
    link.status = 'active'
    and link.link_role = 'evidence'
    and effective.effective_state = 'verified'
  ) as qualifies_as_evidence
from public.provider_document_requirement_links link
join public.provider_document_version_effective_state effective
  on effective.organization_id = link.organization_id
 and effective.document_version_id = link.document_version_id
 and effective.provider_relationship_id = link.provider_relationship_id
 and effective.legal_entity_id = link.legal_entity_id;

comment on view public.provider_document_latest_reviews is
  'Latest terminal review decision for each Provider Service document version.';
comment on view public.provider_document_version_effective_state is
  'Current effective state derived from lifecycle, processing, expiration, and latest review decision.';
comment on view public.provider_current_document_versions is
  'Latest non-superseded, non-archived version for each logical Provider Service document.';
comment on view public.provider_document_requirement_evidence_status is
  'Typed activation evidence links. Only active evidence links to verified document versions qualify as document evidence.';
