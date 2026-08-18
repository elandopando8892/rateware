import test from 'node:test';
import assert from 'node:assert/strict';
import {
  disclosureDisposition, expiryLabel, formatFileSize, isRestricted,
  normalizeVaultQueue, summarizeVault, vaultPriority,
} from '../src/provider-entity-vault-domain.js';

const doc = (overrides = {}) => ({
  sensitivity: 'confidential', verification_status: 'verified',
  expiry_state: 'current', is_releasable: true, ...overrides,
});

test('an unknown queue name falls back to all', () => {
  assert.equal(normalizeVaultQueue('nonsense'), 'all');
  assert.equal(normalizeVaultQueue('RESTRICTED'), 'restricted');
  assert.equal(normalizeVaultQueue(''), 'all');
});

test('restricted material is flagged by sensitivity or by the release-approval flag', () => {
  assert.equal(isRestricted(doc({ sensitivity: 'restricted' })), true);
  assert.equal(isRestricted(doc({ sensitivity: 'highly_restricted' })), true);
  assert.equal(isRestricted(doc({ sensitivity: 'confidential', requires_human_release_approval: true })), true);
  assert.equal(isRestricted(doc({ sensitivity: 'public' })), false);
});

test('priority puts expiry ahead of verification ahead of restriction', () => {
  assert.equal(vaultPriority(doc({ expiry_state: 'expired' })), 'critical');
  assert.equal(vaultPriority(doc({ expiry_state: 'expiring_soon' })), 'expiring');
  assert.equal(vaultPriority(doc({ verification_status: 'pending' })), 'unverified');
  assert.equal(vaultPriority(doc({ sensitivity: 'restricted' })), 'restricted');
  assert.equal(vaultPriority(doc()), 'normal');
  // An expired restricted document is surfaced as expired, the more urgent state.
  assert.equal(vaultPriority(doc({ expiry_state: 'expired', sensitivity: 'restricted' })), 'critical');
});

test('disclosure disposition never offers to release unverified or expired material', () => {
  assert.equal(disclosureDisposition(doc()), 'releasable');
  assert.equal(disclosureDisposition(doc({ sensitivity: 'restricted' })), 'requires_approval');
  assert.equal(disclosureDisposition(doc({ verification_status: 'pending' })), 'blocked_unverified');
  assert.equal(disclosureDisposition(doc({ expiry_state: 'expired' })), 'blocked_expired');
  // Expiry blocks even a document that would otherwise be releasable.
  assert.equal(disclosureDisposition(doc({ expiry_state: 'expired', is_releasable: true })), 'blocked_expired');
  // A verified, in-policy document that the view did not mark releasable still
  // requires a human rather than defaulting to release.
  assert.equal(disclosureDisposition(doc({ is_releasable: false })), 'requires_approval');
});

test('expiry label never invents a date the document lacks', () => {
  assert.equal(expiryLabel(doc({ expiry_state: 'expired' })), 'Expired');
  assert.equal(expiryLabel(doc({ expiry_state: 'expiring_soon' })), 'Expiring soon');
  assert.equal(expiryLabel({ expiry_state: 'current', expiration_date: '2027-01-01' }), 'Current');
  assert.equal(expiryLabel({ expiry_state: 'none', expiration_date: null }), 'No expiry');
});

test('file size is compact and never throws on a bad value', () => {
  assert.equal(formatFileSize(0), '—');
  assert.equal(formatFileSize(-5), '—');
  assert.equal(formatFileSize(undefined), '—');
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(1572864), '1.5 MB');
});

test('the fallback summary counts what an operator triages by', () => {
  const summary = summarizeVault([
    doc({ expiry_state: 'expired' }),
    doc({ verification_status: 'pending' }),
    doc({ sensitivity: 'highly_restricted' }),
    doc(),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.expired, 1);
  assert.equal(summary.unverified, 1);
  assert.equal(summary.restricted, 1);
});

test('the summary of an empty vault is all zeros, not a crash', () => {
  assert.deepEqual(summarizeVault([]), { total: 0, expired: 0, unverified: 0, restricted: 0 });
  assert.deepEqual(summarizeVault(null), { total: 0, expired: 0, unverified: 0, restricted: 0 });
});
