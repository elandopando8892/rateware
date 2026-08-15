create or replace view public.provider_sync_worker_queue with (security_invoker = true) as
select
  command.id as command_id,
  command.organization_id,
  command.provider_relationship_id,
  command.legal_entity_id,
  command.system_code,
  command.action_code,
  command.payload,
  command.idempotency_key,
  command.attempt_count,
  command.next_attempt_at,
  command.correlation_id,
  policy.id as integration_policy_id,
  policy.required_for_activation
from public.provider_sync_commands command
join public.provider_integration_action_policies policy
  on policy.organization_id=command.organization_id and policy.id=command.integration_policy_id and policy.status='published'
left join public.provider_approval_requests approval
  on approval.organization_id=command.organization_id and approval.id=command.approval_request_id
where command.status='pending'
  and coalesce(command.next_attempt_at,command.created_at) <= now()
  and (not policy.requires_approval or approval.status='consumed');

revoke all on table public.provider_sync_worker_queue from public,anon,authenticated,service_role;
grant select on table public.provider_sync_worker_queue to service_role;
