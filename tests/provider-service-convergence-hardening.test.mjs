import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  approval,
  portal,
  sync,
  relationshipWrites,
  activityRedaction,
  activationInitial,
  activationFinal,
  messageScope,
  communicationMatches,
] = await Promise.all([
  read('supabase/migrations/20260813235000_provider_service_request_approval.sql'),
  read('supabase/migrations/20260813235010_provider_portal_terminal_security.sql'),
  read('supabase/migrations/20260813235020_provider_sync_enqueue_command.sql'),
  read('supabase/migrations/20260813235030_provider_relationship_runtime_write_hardening.sql'),
  read('supabase/migrations/20260813235040_provider_360_activity_redaction.sql'),
  read('supabase/migrations/20260813132100_provider_service_activation_commands.sql'),
  read('supabase/migrations/20260813132600_provider_service_requirement_state_command.sql'),
  read('supabase/migrations/20260813160013_provider_service_communication_message_entity_scope.sql'),
  read('supabase/migrations/20260813160030_provider_service_communication_matches.sql'),
]);

test('approval requests are bounded, scoped and service-role-only', () => {
  assert.match(approval, /provider_service_request_approval/);
  assert.match(approval, /proposal\.policy_decision <> 'approval_required'/);
  assert.match(approval, /proposal\.approval_mode/);
  assert.match(approval, /relationship\.id=p_provider_relationship_id/);
  assert.match(approval, /relationship\.legal_entity_id=p_legal_entity_id/);
  assert.match(approval, /p_agent_run_id is not null and p_action_proposal_id is null/);
  assert.match(approval, /run_row\.provider_relationship_id is distinct from p_provider_relationship_id/);
  assert.match(approval, /status in \('requested','approved'\)/);
  assert.match(approval, /approval_requested/);
  assert.match(approval, /proposal_state='awaiting_approval'/);
  assert.match(approval, /revoke all on function public\.provider_service_request_approval/);
  assert.match(approval, /grant execute on function public\.provider_service_request_approval[\s\S]*to service_role/);
});

test('portal terminal reviews require reviewer evidence and event writes stay closed', () => {
  assert.match(portal, /status not in \('accepted','rejected','correction_required'\)/);
  assert.match(portal, /reviewed_at is not null/);
  assert.match(portal, /reviewed_by_user_id/);
  assert.match(portal, /status not in \('rejected','correction_required'\)[\s\S]*review_note/);
  assert.match(portal, /alter table public\.provider_portal_events enable row level security/);
  assert.match(portal, /revoke all on table public\.provider_portal_events from public,anon,authenticated,service_role/);
});

test('integration enqueue is idempotent, policy-gated and approval-consuming', () => {
  assert.match(sync, /provider_service_enqueue_sync_command/);
  assert.match(sync, /idempotency key must be a lowercase sha-256 digest/i);
  assert.match(sync, /provider_system_links/);
  assert.match(sync, /provider_integration_action_policies/);
  assert.match(sync, /status='published'/);
  assert.match(sync, /policy_row\.requires_approval/);
  assert.match(sync, /approval_row\.action_payload_snapshot is distinct from body/);
  assert.match(sync, /approval payload does not match the command payload/i);
  assert.match(sync, /approval_row\.status<>'approved'/);
  assert.match(sync, /provider_service_consume_approval/);
  assert.match(sync, /insert into public\.provider_sync_commands/);
  assert.match(sync, /grant execute on function public\.provider_service_enqueue_sync_command[\s\S]*to service_role/);
});

test('relationship creation cannot inject activation state and generic state updates stay revoked', () => {
  assert.match(relationshipWrites, /revoke insert, update on table public\.provider_relationships from service_role/);
  const insertGrant = relationshipWrites.match(/grant insert \(([\s\S]*?)\) on table public\.provider_relationships to service_role/)?.[1] || '';
  assert.match(insertGrant, /organization_id/);
  assert.match(insertGrant, /vendor_id/);
  assert.doesNotMatch(insertGrant, /lifecycle_status/);
  assert.doesNotMatch(insertGrant, /activation_status/);
  assert.doesNotMatch(insertGrant, /activated_at/);
  assert.doesNotMatch(insertGrant, /suspended_at/);

  const updateGrant = relationshipWrites.match(/grant update \(([\s\S]*?)\) on table public\.provider_relationships to service_role/)?.[1] || '';
  assert.match(updateGrant, /risk_tier/);
  assert.match(updateGrant, /assigned_owner_user_id/);
  assert.doesNotMatch(updateGrant, /lifecycle_status/);
  assert.doesNotMatch(updateGrant, /activation_status/);
  assert.doesNotMatch(updateGrant, /primary_blocker/);
  assert.doesNotMatch(updateGrant, /activated_at/);
  assert.doesNotMatch(updateGrant, /suspended_at/);
});

test('ordinary lifecycle transitions are audited while operational terminal states require dedicated commands', () => {
  assert.match(relationshipWrites, /provider_service_set_relationship_lifecycle/);
  assert.match(relationshipWrites, /provider_service_lifecycle_transition_allowed/);
  assert.match(relationshipWrites, /target_status in \('activated','suspended','offboarded'\)/);
  assert.match(relationshipWrites, /Executed or recurrent lifecycle requires an activated relationship/);
  assert.match(relationshipWrites, /insert into public\.provider_relationship_events/);
  assert.match(relationshipWrites, /'lifecycle_changed'/);
  assert.match(relationshipWrites, /revoke all on function public\.provider_service_set_relationship_lifecycle/);
  assert.match(relationshipWrites, /grant execute on function public\.provider_service_set_relationship_lifecycle[\s\S]*to service_role/);
});

test('Provider 360 activity does not expose free-text case or communication subjects', () => {
  assert.doesNotMatch(activityRedaction, /c\.subject/);
  assert.doesNotMatch(activityRedaction, /t\.subject/);
  assert.match(activityRedaction, /c\.case_category \|\| ' case'/);
  assert.match(activityRedaction, /t\.channel \|\| ' communication'/);
  assert.match(activityRedaction, /revoke all on table public\.provider_service_360_activity_feed from public,anon,authenticated,service_role/);
  assert.match(activityRedaction, /grant select on table public\.provider_service_360_activity_feed to service_role/);
});

test('Build 2 replay regression cannot restore the invalid multi-target rowtype SELECT', () => {
  assert.doesNotMatch(activationInitial, /select requirement, activation\.status/);
  assert.doesNotMatch(activationInitial, /create or replace function public\.provider_service_set_requirement_state/);
  assert.match(activationFinal, /create or replace function public\.provider_service_set_requirement_state/);
  assert.match(activationFinal, /select requirement\.\*[\s\S]*into requirement_row/);
  assert.match(activationFinal, /select activation\.status[\s\S]*into activation_status/);
});

test('communication entity key exists before the message FK and is not recreated later', () => {
  assert.match(messageScope, /provider_communication_threads_org_id_entity_unique/);
  assert.match(messageScope, /unique \(organization_id, id, legal_entity_id\)/);
  assert.match(messageScope, /provider_communication_messages_thread_entity_fkey/);
  assert.doesNotMatch(communicationMatches, /provider_communication_threads_org_id_entity_unique/);
});
