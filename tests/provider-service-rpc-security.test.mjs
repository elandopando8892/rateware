import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/migrations/20260813235050_provider_service_rpc_execution_hardening.sql', import.meta.url), 'utf8');
const normalized = source.replace(/\s+/g, ' ').toLowerCase();

const serviceRoleOnly = [
  'public.provider_service_activate_relationship(uuid,uuid,text,text,uuid)',
  'public.provider_service_add_evidence_link(uuid,uuid,text,text,text,text,text,text,uuid,jsonb)',
  'public.provider_service_case_transition_allowed(text,text)',
  'public.provider_service_consume_approval(uuid,uuid,text,text)',
  'public.provider_service_create_activation(uuid,uuid,uuid,text,text,text,text,uuid)',
  'public.provider_service_decide_approval(uuid,uuid,text,text,text)',
  'public.provider_service_decide_exception(uuid,uuid,text,text,text,timestamptz,timestamptz,text,uuid)',
  'public.provider_service_enqueue_sync_command(uuid,uuid,uuid,text,text,jsonb,text,text,text,uuid,timestamptz)',
  'public.provider_service_lifecycle_transition_allowed(text,text)',
  'public.provider_service_refresh_activation_state(uuid,uuid,text,text,uuid)',
  'public.provider_service_request_approval(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz,jsonb)',
  'public.provider_service_request_exception(uuid,uuid,text,text,text,uuid,text,text,uuid,jsonb)',
  'public.provider_service_requirement_transition_allowed(text,text)',
  'public.provider_service_revoke_exception(uuid,uuid,text,text,text,uuid)',
  'public.provider_service_set_relationship_lifecycle(uuid,uuid,text,text,text,text,uuid)',
  'public.provider_service_set_requirement_state(uuid,uuid,text,text,text,text,uuid)',
];

const directDenied = [
  'public.provider_service_guard_activation_identity()',
  'public.provider_service_guard_case_identity_and_transition()',
  'public.provider_service_guard_communication_message_identity()',
  'public.provider_service_guard_compliance_evaluation_identity()',
  'public.provider_service_guard_compliance_result_snapshot()',
  'public.provider_service_guard_document_identity()',
  'public.provider_service_guard_document_version_file_identity()',
  'public.provider_service_guard_exception_approval()',
  'public.provider_service_guard_extraction_terminal_state()',
  'public.provider_service_guard_requirement_link_identity()',
  'public.provider_service_guard_requirement_snapshot()',
  'public.provider_service_guard_review_terminal_state()',
  'public.provider_service_guard_template_mutation()',
  'public.provider_service_guard_template_requirement_mutation()',
  'public.provider_service_reject_activation_event_mutation()',
  'public.provider_service_reject_approval_event_mutation()',
  'public.provider_service_reject_communication_event_mutation()',
  'public.provider_service_reject_compliance_event_mutation()',
  'public.provider_service_reject_document_event_mutation()',
  'public.provider_service_reject_portal_event_mutation()',
];

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('reviewed Provider Service commands and helpers end service-role-only', () => {
  assert.equal(serviceRoleOnly.length, 16);
  for (const signature of serviceRoleOnly) {
    const revoke = `revoke all on function ${signature} from public,anon,authenticated,service_role;`;
    const grant = `grant execute on function ${signature} to service_role;`;
    assert.ok(normalized.includes(revoke), `missing full revoke for ${signature}`);
    assert.ok(normalized.includes(grant), `missing service_role grant for ${signature}`);
    assert.equal(occurrences(normalized, grant), 1, `unexpected duplicate service_role grant for ${signature}`);
  }
});

test('reviewed trigger and guard functions remain directly non-invocable', () => {
  assert.equal(directDenied.length, 20);
  for (const signature of directDenied) {
    const revoke = `revoke all on function ${signature} from public,anon,authenticated,service_role;`;
    assert.ok(normalized.includes(revoke), `missing full revoke for ${signature}`);
    assert.equal(normalized.includes(`grant execute on function ${signature}`), false, `direct EXECUTE must stay denied for ${signature}`);
  }
});

test('the reviewed RPC boundary remains 36 explicitly classified surfaces', () => {
  assert.equal(new Set([...serviceRoleOnly, ...directDenied]).size, 36);
});
