import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [approval, portal, sync, activationInitial, activationFinal, messageScope, communicationMatches] = await Promise.all([
  read('supabase/migrations/20260813235000_provider_service_request_approval.sql'),
  read('supabase/migrations/20260813235010_provider_portal_terminal_security.sql'),
  read('supabase/migrations/20260813235020_provider_sync_enqueue_command.sql'),
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
  assert.match(sync, /approval_row\.status<>'approved'/);
  assert.match(sync, /provider_service_consume_approval/);
  assert.match(sync, /insert into public\.provider_sync_commands/);
  assert.match(sync, /grant execute on function public\.provider_service_enqueue_sync_command[\s\S]*to service_role/);
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
