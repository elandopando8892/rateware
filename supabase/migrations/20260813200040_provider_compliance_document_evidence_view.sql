create or replace view public.provider_compliance_document_evidence
with (security_invoker=true)
as
select e.id as evidence_id,e.organization_id,e.rule_result_id,e.provider_relationship_id,e.legal_entity_id,e.document_version_id,
  d.effective_state,
  (e.status='active' and d.effective_state='verified') as qualifies_as_evidence
from public.provider_compliance_evidence_links e
join public.provider_document_version_effective_state d
  on d.organization_id=e.organization_id
 and d.document_version_id=e.document_version_id
 and d.provider_relationship_id=e.provider_relationship_id
 and d.legal_entity_id=e.legal_entity_id
where e.evidence_kind='document';
