import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertProviderServiceCaseTransition,
  calculateProviderServiceDueAt,
  canTransitionProviderServiceCase,
  deriveProviderServiceWorkQueue,
  evaluateProviderServiceCaseSla,
  normalizeProviderServiceCaseType,
  providerServiceWorkPriorityScore,
  validateProviderServiceCaseDraft,
} from '../src/provider-service-case-domain.js';

const NOW = new Date('2026-08-13T20:00:00Z');

test('normalizes case types and validates drafts', () => {
  assert.equal(normalizeProviderServiceCaseType('Credit Application'), 'credit_application');
  assert.deepEqual(validateProviderServiceCaseDraft({ caseType: 'POD Issue', subject: 'Missing POD', priority: 'HIGH' }), {
    caseType: 'pod_issue',
    subject: 'Missing POD',
    priority: 'high',
  });
});

test('enforces explicit case lifecycle transitions', () => {
  assert.equal(canTransitionProviderServiceCase('new', 'open'), true);
  assert.equal(canTransitionProviderServiceCase('open', 'waiting_provider'), true);
  assert.equal(canTransitionProviderServiceCase('resolved', 'closed'), true);
  assert.equal(canTransitionProviderServiceCase('new', 'resolved'), false);
  assert.throws(() => assertProviderServiceCaseTransition('closed', 'open'), /Invalid Provider Service case transition/);
});

test('calculates deterministic SLA deadlines and states', () => {
  assert.equal(
    calculateProviderServiceDueAt('2026-08-13T18:00:00Z', 120).toISOString(),
    '2026-08-13T20:00:00.000Z',
  );
  assert.deepEqual(
    evaluateProviderServiceCaseSla({
      status: 'open',
      firstResponseDueAt: '2026-08-13T19:00:00Z',
      resolutionDueAt: '2026-08-14T20:00:00Z',
    }, NOW),
    { firstResponseState: 'breached', resolutionState: 'pending' },
  );
});

test('routes work to deterministic queues', () => {
  assert.equal(deriveProviderServiceWorkQueue({ status: 'waiting_provider' }, NOW), 'waiting_provider');
  assert.equal(deriveProviderServiceWorkQueue({ status: 'blocked' }, NOW), 'blocked');
  assert.equal(deriveProviderServiceWorkQueue({ status: 'open', firstResponseDueAt: '2026-08-13T19:00:00Z' }, NOW), 'overdue');
  assert.equal(deriveProviderServiceWorkQueue({ status: 'open', escalationLevel: 1 }, NOW), 'escalated');
});

test('prioritizes escalated and overdue cases above routine work', () => {
  const routine = providerServiceWorkPriorityScore({ status: 'open', priority: 'normal' }, NOW);
  const overdue = providerServiceWorkPriorityScore({ status: 'open', priority: 'normal', firstResponseDueAt: '2026-08-13T19:00:00Z' }, NOW);
  const escalated = providerServiceWorkPriorityScore({ status: 'escalated', priority: 'normal', escalationLevel: 1 }, NOW);
  assert.ok(overdue > routine);
  assert.ok(escalated > overdue);
});
