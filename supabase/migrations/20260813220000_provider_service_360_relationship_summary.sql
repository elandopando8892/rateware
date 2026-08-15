-- Provider Service Build 11: private summary used only by the Provider Service API.
create or replace view public.provider_service_360_relationship_summary as
select
  r.organization_id,
  r.vendor_id,
  r.id as provider_relationship_id,
  r.legal_entity_id,
  r.legal_entity_code,
  r.vendor_code,
  e.legal_name as legal_entity_name,
  e.country_code,
  e.default_currency,
  r.lifecycle_status,
  r.activation_status,
  r.risk_tier,
  r.primary_blocker,
  r.assigned_owner_user_id,
  r.updated_at,
  (select count(*)::integer from public.provider_documents d where d.organization_id=r.organization_id and d.provider_relationship_id=r.id) as document_count,
  (select count(*)::integer from public.provider_document_version_effective_state d where d.organization_id=r.organization_id and d.provider_relationship_id=r.id and d.effective_state='verified') as verified_document_count,
  (select count(*)::integer from public.provider_document_version_effective_state d where d.organization_id=r.organization_id and d.provider_relationship_id=r.id and d.effective_state in ('needs_review','correction_required','rejected','expired')) as document_attention_count,
  (select count(*)::integer from public.provider_service_cases c where c.organization_id=r.organization_id and c.provider_relationship_id=r.id and c.status not in ('resolved','closed','cancelled')) as open_case_count,
  (select count(*)::integer from public.provider_service_cases c where c.organization_id=r.organization_id and c.provider_relationship_id=r.id and (c.status in ('blocked','escalated') or c.escalation_level>0)) as case_attention_count,
  (select count(*)::integer from public.provider_communication_threads t where t.organization_id=r.organization_id and t.provider_relationship_id=r.id and t.communication_status not in ('resolved','archived')) as open_thread_count,
  (select count(*)::integer from public.provider_communication_threads t where t.organization_id=r.organization_id and t.provider_relationship_id=r.id and t.needs_reply and t.communication_status not in ('resolved','archived')) as needs_reply_count,
  (select count(*)::integer from public.provider_approval_requests a where a.organization_id=r.organization_id and a.provider_relationship_id=r.id and a.status='requested' and (a.expires_at is null or a.expires_at>now())) as pending_approval_count,
  (select count(*)::integer from public.provider_portal_invitations p where p.organization_id=r.organization_id and p.provider_relationship_id=r.id and p.status in ('active','viewed') and p.expires_at>now()) as active_portal_invitation_count,
  coalesce((select c.status from public.provider_compliance_evaluations c where c.organization_id=r.organization_id and c.provider_relationship_id=r.id order by coalesce(c.completed_at,c.created_at) desc,c.id desc limit 1),'not_evaluated') as compliance_status,
  (select count(*)::integer from public.provider_system_links s where s.organization_id=r.organization_id and s.provider_relationship_id=r.id and s.required_for_activation) as required_integration_count,
  (select count(*)::integer from public.provider_system_links s where s.organization_id=r.organization_id and s.provider_relationship_id=r.id and s.required_for_activation and s.status='active' and s.external_reference_id is not null and s.expected_fingerprint is not distinct from s.actual_fingerprint) as ready_integration_count
from public.provider_relationships r
join public.legal_entities e on e.organization_id=r.organization_id and e.id=r.legal_entity_id;

revoke all on table public.provider_service_360_relationship_summary from public,anon,authenticated,service_role;
grant select on table public.provider_service_360_relationship_summary to service_role;
