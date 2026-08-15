-- Convergence hardening: Provider 360 is a broad internal operational summary.
-- Do not surface free-text case/email subjects through this projection because specialized
-- Legal/Finance/communications authorization is not part of the read-only drawer contract.

create or replace view public.provider_service_360_activity_feed as
select
  r.organization_id,
  r.vendor_id,
  c.provider_relationship_id,
  c.legal_entity_id,
  'case'::text item_type,
  c.id item_id,
  c.case_code item_code,
  (c.case_category || ' case')::text title,
  c.status,
  c.priority,
  c.last_activity_at occurred_at,
  (c.status in ('blocked','escalated') or c.escalation_level>0) attention
from public.provider_service_cases c
join public.provider_relationships r
  on r.organization_id=c.organization_id and r.id=c.provider_relationship_id
union all
select
  r.organization_id,
  r.vendor_id,
  t.provider_relationship_id,
  t.legal_entity_id,
  'communication',
  t.id,
  null,
  (t.channel || ' communication')::text,
  t.communication_status,
  null,
  t.last_message_at,
  (t.needs_reply or t.matching_status in ('unmatched','candidate','needs_review'))
from public.provider_communication_threads t
join public.provider_relationships r
  on r.organization_id=t.organization_id and r.id=t.provider_relationship_id
union all
select
  r.organization_id,
  r.vendor_id,
  a.provider_relationship_id,
  a.legal_entity_id,
  'approval',
  a.id,
  a.approval_code,
  a.action_code,
  a.status,
  a.approval_mode,
  a.requested_at,
  (a.status='requested' and (a.expires_at is null or a.expires_at>now()))
from public.provider_approval_requests a
join public.provider_relationships r
  on r.organization_id=a.organization_id and r.id=a.provider_relationship_id
union all
select
  r.organization_id,
  r.vendor_id,
  e.provider_relationship_id,
  e.legal_entity_id,
  'compliance',
  e.id,
  e.rule_set_code_snapshot,
  e.rule_set_name_snapshot,
  e.status,
  e.evaluation_type,
  coalesce(e.completed_at,e.created_at),
  (e.status in ('review_required','non_compliant','error'))
from public.provider_compliance_evaluations e
join public.provider_relationships r
  on r.organization_id=e.organization_id and r.id=e.provider_relationship_id;

revoke all on table public.provider_service_360_activity_feed from public,anon,authenticated,service_role;
grant select on table public.provider_service_360_activity_feed to service_role;
