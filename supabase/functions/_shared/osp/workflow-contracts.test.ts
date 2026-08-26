import assert from 'node:assert/strict';

import {
  CASE_STATES,
  allowedCaseTransition,
  assertExpectedVersion,
  assertKnownReasonCode,
  type CaseState,
} from './workflow-contracts.ts';

const validEdges: Array<[CaseState, CaseState]> = [
  ['received', 'analyzing_requirements'],
  ['analyzing_requirements', 'awaiting_clarification'],
  ['analyzing_requirements', 'awaiting_xbf_information'],
  ['analyzing_requirements', 'preparing'],
  ['awaiting_clarification', 'analyzing_requirements'],
  ['awaiting_xbf_information', 'preparing'],
  ['preparing', 'operations_review'],
  ['operations_review', 'preparing'],
  ['operations_review', 'signature_approval'],
  ['signature_approval', 'operations_review'],
  ['signature_approval', 'sales_authorization'],
  ['sales_authorization', 'ready_to_send'],
  ['ready_to_send', 'sent'],
];

Deno.test('allowedCaseTransition permits every Sprint 1 workflow edge', () => {
  for (const [from, to] of validEdges) assert.equal(allowedCaseTransition(from, to), true, `${from} -> ${to}`);
});

Deno.test('allowedCaseTransition fails closed for skipped and terminal-state transitions', () => {
  for (const [from, to] of [
    ['received', 'preparing'],
    ['operations_review', 'ready_to_send'],
    ['signature_approval', 'ready_to_send'],
    ['closed', 'analyzing_requirements'],
    ['sent', 'preparing'],
    ['accepted', 'operations_review'],
    ['rejected', 'preparing'],
  ] as Array<[CaseState, CaseState]>) {
    assert.equal(allowedCaseTransition(from, to), false, `${from} -> ${to}`);
  }
  assert.deepEqual(CASE_STATES.slice(-4), ['sent', 'accepted', 'rejected', 'closed']);
});

Deno.test('assertExpectedVersion rejects stale aggregate writes', () => {
  assert.throws(() => assertExpectedVersion(8, 7), /VERSION_CONFLICT/);
  assert.doesNotThrow(() => assertExpectedVersion(8, 8));
});

Deno.test('assertKnownReasonCode rejects unknown and blank event reasons', () => {
  assert.doesNotThrow(() => assertKnownReasonCode('case_received'));
  for (const value of ['', 'unknown_reason', 'CASE_RECEIVED']) {
    assert.throws(() => assertKnownReasonCode(value), /INVALID_REASON_CODE/);
  }
});
