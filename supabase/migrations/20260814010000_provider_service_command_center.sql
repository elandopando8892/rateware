-- Build 14: sanitized Provider Service command-center projection.
-- Private/service-role read model only; no direct browser access.

create or replace view public.provider_service_command_center as
with base as (
  select
    summary.organization_id,
    registry.organization_id as workspace_id,
    summary.vendor_id,
    summary.provider_relationship_id,
    summary.legal_entity_id,
    summary.legal_entity_code,
    summary.vendor_code,
    vendor.vendor_name,
    vendor.legal_name as vendor_legal_name,
    vendor.status as vendor_status,
    vendor.segment as vendor_segment,
    summary.legal_entity_name,
    summary.country_code,
    summary.default_currency,
    summary.lifecycle_status,
    summary.activation_status,
    summary.risk_tier,
    summary.primary_blocker,
    summary.assigned_owner_user_id,
    summary.document_count,
    summary.verified_document_count,
    summary.document_attention_count,
    summary.open_case_count,
    summary.case_attention_count,
    summary.open_thread_count,
    summary.needs_reply_count,
    summary.pending_approval_count,
    summary.active_portal_invitation_count,
    summary.compliance_status,
    summary.required_integration_count,
    summary.ready_integration_count,
    health.health_score,
    health.health_state,
    health.hard_blocker,
    health.blocker_codes,
    health.evaluated_at as health_evaluated_at,
    summary.updated_at,
    case
      when coalesce(health.health_state, 'unknown') = 'critical'
        or summary.primary_blocker is not null
        or summary.compliance_status in ('non_compliant', 'error') then 'critical'
      when coalesce(health.health_state, 'unknown') = 'at_risk'
        or summary.case_attention_count > 0
        or summary.document_attention_count > 0
        or summary.needs_reply_count > 0
        or summary.pending_approval_count > 0
        or summary.required_integration_count > summary.ready_integration_count
        or summary.activation_status in ('blocked', 'suspended') then 'attention'
      when coalesce(health.health_state, 'unknown') in ('watch', 'unknown')
        or summary.compliance_status in ('review_required', 'warning', 'not_evaluated') then 'watch'
      else 'healthy'
    end as attention_state,
    case
      when coalesce(health.health_state, 'unknown') = 'critical'
        or summary.primary_blocker is not null
        or summary.compliance_status in ('non_compliant', 'error') then 10
      when coalesce(health.health_state, 'unknown') = 'at_risk'
        or summary.case_attention_count > 0
        or summary.document_attention_count > 0
        or summary.needs_reply_count > 0
        or summary.pending_approval_count > 0
        or summary.required_integration_count > summary.ready_integration_count
        or summary.activation_status in ('blocked', 'suspended') then 20
      when coalesce(health.health_state, 'unknown') in ('watch', 'unknown')
        or summary.compliance_status in ('review_required', 'warning', 'not_evaluated') then 30
      else 40
    end as attention_rank
  from public.provider_service_360_relationship_summary summary
  join public.workspace_registry registry
    on registry.organization_uuid = summary.organization_id
  join public.vendors vendor
    on vendor.id = summary.vendor_id
   and vendor.organization_id = registry.organization_id
  left join public.provider_health_latest health
    on health.organization_id = summary.organization_id
   and health.provider_relationship_id = summary.provider_relationship_id
)
select
  base.*,
  count(*) over (partition by organization_id)::integer as total_relationships,
  count(*) filter (where attention_state = 'critical') over (partition by organization_id)::integer as critical_relationships,
  count(*) filter (where attention_state = 'attention') over (partition by organization_id)::integer as attention_relationships,
  count(*) filter (where needs_reply_count > 0) over (partition by organization_id)::integer as needs_reply_relationships,
  count(*) filter (where pending_approval_count > 0) over (partition by organization_id)::integer as pending_approval_relationships,
  count(*) filter (where activation_status in ('blocked', 'suspended')) over (partition by organization_id)::integer as blocked_activation_relationships
from base;

revoke all on table public.provider_service_command_center from public, anon, authenticated, service_role;
grant select on table public.provider_service_command_center to service_role;

comment on view public.provider_service_command_center is
  'Build 14 private Provider Service operational queue. Sanitized relationship/vendor status only; excludes banking, tax identifiers, document storage, message bodies, tokens and approval payloads.';
