import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertProviderLifecycleTransition,
  canTransitionProviderLifecycle,
  formatVendorCode,
  normalizeEntityCode,
  normalizeProviderRoleCode,
  parseVendorCode,
  validateProviderRelationshipDraft,
} from '../src/provider-service-domain.js';

const TEST_UUIDS = Object.freeze({
  organizationId: '2fdb8040-7f91-4e3c-9e2d-35f6fefac011',
  vendorId: '11982c73-8e18-44e9-9cd4-79e82c5698df',
  legalEntityId: '3d09002c-2bf3-4d56-9c64-2f74c41f8981',
});

test('normalizes XBF legal entity codes for stable vendor IDs', () => {
  assert.equal(normalizeEntityCode(' XBF_US '), 'XBFUS');
  assert.equal(normalizeEntityCode('xbf-mx'), 'XBFMX');
  assert.throws(() => normalizeEntityCode('x'), /2 to 16/);
});

test('formats and parses stable human-readable vendor codes', () => {
  assert.equal(formatVendorCode({ entityCode: 'XBF_US', sequence: 184 }), 'VND-XBFUS-000184');
  assert.deepEqual(parseVendorCode('vnd-xbfus-000184'), {
    vendorCode: 'VND-XBFUS-000184',
    entityCode: 'XBFUS',
    sequence: 184,
  });
  assert.equal(parseVendorCode('VEN-US-184'), null);
  assert.throws(() => formatVendorCode({ entityCode: 'XBF_US', sequence: 0 }), /positive/);
});

test('normalizes provider role codes without inventing role semantics', () => {
  assert.equal(normalizeProviderRoleCode('Drayage Carrier'), 'drayage_carrier');
  assert.equal(normalizeProviderRoleCode('Customs-Broker'), 'customs_broker');
  assert.throws(() => normalizeProviderRoleCode('1'), /snake_case/);
});

test('allows forward lifecycle progress and explicit review holds', () => {
  assert.equal(canTransitionProviderLifecycle('identified', 'contactable'), true);
  assert.equal(canTransitionProviderLifecycle('under_review', 'compliance_hold'), true);
  assert.equal(canTransitionProviderLifecycle('suspended', 'activated'), true);
  assert.equal(canTransitionProviderLifecycle('identified', 'activated'), false);
  assert.equal(assertProviderLifecycleTransition('approved', 'activated'), 'activated');
  assert.throws(
    () => assertProviderLifecycleTransition('contactable', 'recurrent'),
    /Invalid provider lifecycle transition/,
  );
});

test('validates a provider relationship draft and preserves the canonical IDs', () => {
  assert.deepEqual(
    validateProviderRelationshipDraft({
      ...TEST_UUIDS,
      lifecycleStatus: 'UNDER_REVIEW',
      activationStatus: 'IN_PROGRESS',
      vendorCode: 'vnd-xbfus-000184',
    }),
    {
      ...TEST_UUIDS,
      lifecycleStatus: 'under_review',
      activationStatus: 'in_progress',
      vendorCode: 'VND-XBFUS-000184',
    },
  );

  assert.throws(
    () => validateProviderRelationshipDraft({ ...TEST_UUIDS, vendorId: 'not-a-uuid' }),
    /vendorId must be a valid UUID/,
  );
});
