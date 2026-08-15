import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProviderAgentAction, getProviderAgentApprovalMode, validateProviderAgentProposal } from '../src/provider-service-agent-policy.js';
import { buildProviderAgentContext } from '../src/provider-service-agent-context.js';

test('forbids structural and liability actions', () => {
  assert.equal(getProviderAgentApprovalMode('merge_provider'), 'forbidden');
  assert.equal(getProviderAgentApprovalMode('personal_guarantee'), 'forbidden');
  assert.equal(evaluateProviderAgentAction({ actionCode: 'force_provider_activation' }).decision, 'forbidden');
});

test('requires approval for external side effects even when the base action is auto', () => {
  const result = evaluateProviderAgentAction({ actionCode: 'schedule_followup', externalSideEffect: true });
  assert.equal(result.decision, 'approval_required');
  assert.equal(result.approvalMode, 'human');
});

test('blocks provider-dependent actions while provider resolution is incomplete', () => {
  const result = evaluateProviderAgentAction({ actionCode: 'create_service_case', providerResolved: false });
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reason, 'provider_unresolved');
});

test('restricted data escalates automatic actions to human review', () => {
  const result = evaluateProviderAgentAction({ actionCode: 'prepare_form', sensitivity: 'restricted' });
  assert.equal(result.approvalMode, 'human');
});

test('finance legal and executive actions preserve specialized approval', () => {
  assert.equal(evaluateProviderAgentAction({ actionCode: 'disclose_bank_account' }).approvalMode, 'finance');
  assert.equal(evaluateProviderAgentAction({ actionCode: 'accept_contract_terms' }).approvalMode, 'legal');
  assert.equal(evaluateProviderAgentAction({ actionCode: 'apply_authorized_signature' }).approvalMode, 'executive');
});

test('proposal validation records policy decision', () => {
  const result = validateProviderAgentProposal({ actionCode: 'draft_reply', rationale: 'Respond to requested setup fields.', confidence: 0.98 });
  assert.equal(result.decision, 'allowed');
});

test('context rejects cross-entity data', () => {
  assert.throws(() => buildProviderAgentContext({ organizationId: 'org-1', legalEntityId: 'xbf-us', documents: [{ legalEntityId: 'xbf-mx' }] }), /cross-entity/);
});
