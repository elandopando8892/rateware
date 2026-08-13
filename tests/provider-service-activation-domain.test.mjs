import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertProviderActivationReady,
  assertProviderRequirementTransition,
  canTransitionProviderRequirement,
  evaluateProviderActivationReadiness,
  evaluateProviderTrackReadiness,
  getProviderRequirementEffectiveState,
  isEffectiveProviderException,
  isProviderRequirementSatisfied,
  normalizeActivationTrackCode,
  normalizeRequirementCode,
} from '../src/provider-service-activation-domain.js';

const ACTIVATION_ID = '9d5f8673-53f6-4664-b05e-11a899ae98a4';
const NOW = new Date('2026-08-13T18:00:00.000Z');

function requirement({ id, trackCode, code, state = 'pending', required = true, blocking = true, reviewedAt, reviewedByUserId }) {
  return {
    id,
    activationId: ACTIVATION_ID,
    trackCode,
    requirementCode: code,
    state,
    required,
    blocking,
    reviewedAt,
    reviewedByUserId,
  };
}

test('normalizes canonical tracks and requirement codes', () => {
  assert.equal(normalizeActivationTrackCode(' XBF_CUSTOMER_SETUP '), 'xbf_customer_setup');
  assert.equal(normalizeRequirementCode('MC Authority / FMCSA'), 'mc_authority_fmcsa');
  assert.throws(() => normalizeActivationTrackCode('finance'), /Unsupported/);
});

test('validates requirement state transitions', () => {
  assert.equal(canTransitionProviderRequirement('pending', 'submitted'), true);
  assert.equal(canTransitionProviderRequirement('passed', 'pending'), false);
  assert.equal(assertProviderRequirementTransition('correction_required', 'in_progress'), 'in_progress');
  assert.throws(() => assertProviderRequirementTransition('passed', 'pending'), /Invalid/);
});

test('treats passed and reviewed not-applicable requirements as satisfied', () => {
  assert.equal(isProviderRequirementSatisfied(requirement({
    id: 'r1',
    trackCode: 'provider_readiness',
    code: 'w9',
    state: 'passed',
  }), [], NOW), true);

  assert.equal(isProviderRequirementSatisfied(requirement({
    id: 'r2',
    trackCode: 'provider_readiness',
    code: 'mc_authority',
    state: 'not_applicable',
    reviewedAt: '2026-08-12T16:00:00.000Z',
    reviewedByUserId: 'user_123',
  }), [], NOW), true);

  assert.equal(isProviderRequirementSatisfied(requirement({
    id: 'r3',
    trackCode: 'provider_readiness',
    code: 'insurance',
    state: 'not_applicable',
  }), [], NOW), false);
});

test('treats a passed requirement as expired after its validity date', () => {
  const row = {
    ...requirement({
      id: 'expired-pass',
      trackCode: 'provider_readiness',
      code: 'insurance',
      state: 'passed',
    }),
    expiresAt: '2026-08-12T00:00:00.000Z',
  };

  assert.equal(getProviderRequirementEffectiveState(row, NOW), 'expired');
  assert.equal(isProviderRequirementSatisfied(row, [], NOW), false);
});

test('uses only currently effective approved exceptions', () => {
  const activeException = {
    activationId: ACTIVATION_ID,
    scopeType: 'requirement',
    activationRequirementId: 'r1',
    status: 'approved',
    effectiveFrom: '2026-08-10T00:00:00.000Z',
    expiresAt: '2026-08-20T00:00:00.000Z',
  };
  const expiredException = { ...activeException, expiresAt: '2026-08-12T00:00:00.000Z' };

  assert.equal(isEffectiveProviderException(activeException, NOW), true);
  assert.equal(isEffectiveProviderException(expiredException, NOW), false);
  assert.equal(isProviderRequirementSatisfied(requirement({
    id: 'r1',
    trackCode: 'provider_readiness',
    code: 'insurance',
    state: 'failed',
  }), [activeException], NOW), true);
});

test('calculates a ready track from explicit satisfied requirements', () => {
  const result = evaluateProviderTrackReadiness({
    activationId: ACTIVATION_ID,
    trackCode: 'provider_readiness',
    at: NOW,
    requirements: [
      requirement({ id: 'r1', trackCode: 'provider_readiness', code: 'w9', state: 'passed' }),
      requirement({ id: 'r2', trackCode: 'provider_readiness', code: 'insurance', state: 'passed' }),
      requirement({ id: 'r3', trackCode: 'provider_readiness', code: 'optional_note', state: 'pending', required: false }),
    ],
  });

  assert.equal(result.readinessState, 'ready');
  assert.equal(result.requiredRequirementCount, 2);
  assert.equal(result.satisfiedRequiredCount, 2);
  assert.equal(result.completionPercentage, 100);
});

test('returns blocked for an unresolved required blocking failure', () => {
  const result = evaluateProviderTrackReadiness({
    activationId: ACTIVATION_ID,
    trackCode: 'commercial_operational_readiness',
    at: NOW,
    requirements: [
      requirement({ id: 'r1', trackCode: 'commercial_operational_readiness', code: 'approved_rate', state: 'passed' }),
      requirement({ id: 'r2', trackCode: 'commercial_operational_readiness', code: 'test_shipment', state: 'correction_required' }),
    ],
  });

  assert.equal(result.readinessState, 'blocked');
  assert.equal(result.blockerCount, 1);
  assert.deepEqual(result.blockerRequirementCodes, ['test_shipment']);
});

test('returns not-configured when a canonical track has no required configuration', () => {
  const result = evaluateProviderTrackReadiness({
    activationId: ACTIVATION_ID,
    trackCode: 'xbf_customer_setup',
    requirements: [],
    at: NOW,
  });
  assert.equal(result.readinessState, 'not_configured');
});

test('requires all three tracks to be ready before activation', () => {
  const requirements = [
    requirement({ id: 'r1', trackCode: 'provider_readiness', code: 'provider_identity', state: 'passed' }),
    requirement({ id: 'r2', trackCode: 'xbf_customer_setup', code: 'credit_decision', state: 'passed' }),
    requirement({ id: 'r3', trackCode: 'commercial_operational_readiness', code: 'test_shipment', state: 'passed' }),
  ];

  const readiness = evaluateProviderActivationReadiness({ activationId: ACTIVATION_ID, requirements, at: NOW });
  assert.equal(readiness.readinessState, 'ready');
  assert.equal(readiness.canActivate, true);
  assert.equal(assertProviderActivationReady({ activationId: ACTIVATION_ID, requirements, at: NOW }).canActivate, true);

  const blocked = requirements.map((row) => row.id === 'r3' ? { ...row, state: 'failed' } : row);
  assert.throws(
    () => assertProviderActivationReady({ activationId: ACTIVATION_ID, requirements: blocked, at: NOW }),
    /not ready: blocked/,
  );
});
