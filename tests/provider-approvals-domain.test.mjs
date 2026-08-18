import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalIsActionable, approvalPosture, approvalPriority, approvalProgress,
  normalizeApprovalQueue, summarizeApprovals,
} from '../src/provider-approvals-domain.js';

const pkg = (overrides = {}) => ({
  required_approval_count: 2, approved_count: 0, rejected_count: 0,
  approval_complete: false, authorization_expired: false, separation_conflict: false,
  revoked_at: null, ...overrides,
});

test('an unknown queue falls back to all', () => {
  assert.equal(normalizeApprovalQueue('nope'), 'all');
  assert.equal(normalizeApprovalQueue('PENDING'), 'pending');
});

test('progress reports approved of required and what remains', () => {
  assert.deepEqual(approvalProgress(pkg({ approved_count: 1, required_approval_count: 2 })), { approved: 1, required: 2, remaining: 1 });
  // required is floored at 1 so a zero never yields a divide-by-nothing posture.
  assert.deepEqual(approvalProgress(pkg({ approved_count: 0, required_approval_count: 0 })), { approved: 0, required: 1, remaining: 1 });
});

test('posture ranks revocation and expiry above the counts', () => {
  assert.equal(approvalPosture(pkg({ revoked_at: '2026-08-18', approval_complete: true })), 'revoked');
  assert.equal(approvalPosture(pkg({ authorization_expired: true, approval_complete: true })), 'expired');
});

test('a separation conflict blocks an otherwise-complete package', () => {
  // The requester also approved: the count says complete, but it can never be sent.
  const row = pkg({ approved_count: 2, approval_complete: true, separation_conflict: true });
  assert.equal(approvalPosture(row), 'blocked_separation');
  assert.equal(approvalPriority(row), 'critical');
  assert.equal(approvalIsActionable(row), false);
});

test('a complete package with no conflict reads complete', () => {
  assert.equal(approvalPosture(pkg({ approved_count: 2, approval_complete: true })), 'complete');
});

test('a rejected approval surfaces as changes_required', () => {
  assert.equal(approvalPosture(pkg({ rejected_count: 1 })), 'changes_required');
});

test('a genuinely pending package is awaiting and actionable', () => {
  const row = pkg({ approved_count: 1 });
  assert.equal(approvalPosture(row), 'awaiting');
  assert.equal(approvalIsActionable(row), true);
});

test('an expired pending package is not actionable', () => {
  assert.equal(approvalIsActionable(pkg({ approved_count: 1, authorization_expired: true })), false);
});

test('the summary counts what an approver triages by', () => {
  const summary = summarizeApprovals([
    pkg({ approved_count: 1 }),
    pkg({ approved_count: 2, approval_complete: true }),
    pkg({ separation_conflict: true, approval_complete: true }),
    pkg({ revoked_at: '2026-08-18' }),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.pending, 1);
  assert.equal(summary.complete, 1);
  assert.equal(summary.blocked, 2);
});
