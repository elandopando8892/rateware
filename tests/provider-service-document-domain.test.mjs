import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSha256,
  computeProviderDocumentEffectiveState,
  documentQualifiesAsRequirementEvidence,
  isSha256,
  normalizeProviderDocumentKey,
  normalizeProviderDocumentSensitivity,
  normalizeProviderDocumentType,
  validateProviderDocumentDraft,
  validateProviderDocumentVersionDraft,
} from '../src/provider-service-document-domain.js';

const HASH = 'a'.repeat(64);
const TODAY = '2026-08-13';

test('normalizes document identity without inventing business semantics', () => {
  assert.equal(normalizeProviderDocumentType(' W-9 '), 'w_9');
  assert.equal(normalizeProviderDocumentKey('2026 Primary'), 'primary_2026_primary'.replace('primary_', ''));
  assert.throws(() => normalizeProviderDocumentType('1'), /snake_case/);
});

test('validates sensitivity and SHA-256 fingerprints', () => {
  assert.equal(normalizeProviderDocumentSensitivity('Restricted'), 'restricted');
  assert.equal(isSha256(HASH), true);
  assert.equal(assertSha256(HASH.toUpperCase()), HASH);
  assert.throws(() => assertSha256('abc'), /SHA-256/);
});

test('derives effective state with expiration and review precedence', () => {
  assert.equal(computeProviderDocumentEffectiveState({ processingStatus: 'ready', reviewDecision: 'approved' }, TODAY), 'verified');
  assert.equal(computeProviderDocumentEffectiveState({ processingStatus: 'ready' }, TODAY), 'needs_review');
  assert.equal(computeProviderDocumentEffectiveState({ processingStatus: 'ready', reviewDecision: 'approved', expirationDate: '2026-08-12' }, TODAY), 'expired');
  assert.equal(computeProviderDocumentEffectiveState({ processingStatus: 'ready', reviewDecision: 'rejected' }, TODAY), 'rejected');
  assert.equal(computeProviderDocumentEffectiveState({ lifecycleStatus: 'revoked', processingStatus: 'ready', reviewDecision: 'approved' }, TODAY), 'revoked');
});

test('only verified active evidence links qualify for activation evidence', () => {
  const base = {
    linkStatus: 'active',
    linkRole: 'evidence',
    processingStatus: 'ready',
    reviewDecision: 'approved',
  };
  assert.equal(documentQualifiesAsRequirementEvidence(base, TODAY), true);
  assert.equal(documentQualifiesAsRequirementEvidence({ ...base, linkRole: 'supporting' }, TODAY), false);
  assert.equal(documentQualifiesAsRequirementEvidence({ ...base, linkStatus: 'revoked' }, TODAY), false);
  assert.equal(documentQualifiesAsRequirementEvidence({ ...base, reviewDecision: 'correction_required' }, TODAY), false);
});

test('validates document and version drafts', () => {
  assert.deepEqual(
    validateProviderDocumentDraft({ documentType: 'W9', documentName: 'W-9', sensitivity: 'CONFIDENTIAL' }),
    {
      documentType: 'w9',
      documentKey: 'primary',
      documentName: 'W-9',
      sensitivity: 'confidential',
    },
  );

  assert.deepEqual(
    validateProviderDocumentVersionDraft({
      versionNumber: 2,
      originalFilename: 'w9.pdf',
      storageBucket: 'provider-documents',
      storagePath: 'tenant/vendor/w9-v2.pdf',
      fileSha256: HASH,
      sourceChannel: 'EMAIL',
      effectiveDate: '2026-08-01',
      expirationDate: '2027-08-01',
    }),
    {
      versionNumber: 2,
      originalFilename: 'w9.pdf',
      storageBucket: 'provider-documents',
      storagePath: 'tenant/vendor/w9-v2.pdf',
      fileSha256: HASH,
      sourceChannel: 'email',
      effectiveDate: '2026-08-01',
      expirationDate: '2027-08-01',
    },
  );

  assert.throws(
    () => validateProviderDocumentVersionDraft({
      versionNumber: 1,
      originalFilename: 'bad.pdf',
      storageBucket: 'provider-documents',
      storagePath: 'bad.pdf',
      fileSha256: HASH,
      effectiveDate: '2026-08-13',
      expirationDate: '2026-08-12',
    }),
    /cannot precede/,
  );
});
