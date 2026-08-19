import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WAIVER_DAYS, WAIVABLE_STATUSES, applyWaivers, evaluateWaiver, validateWaiverRequest,
} from '../supabase/functions/_shared/provider-onboarding-requirement-waiver.mjs';

const NOW = '2026-08-19T12:00:00.000Z';
const LATER = '2026-10-01T00:00:00.000Z';
const EARLIER = '2026-08-01T00:00:00.000Z';

const requirement = (code, overrides = {}) => ({
  id: `req-${code}`, requirement_code: code, is_required: true, ...overrides,
});
const row = (code, status, overrides = {}) => ({
  requirement: requirement(code), status,
  reason: 'required_document_missing', fact_id: null, asset_id: null, evidence_sha256: null,
  ...overrides,
});
const waiver = (code, overrides = {}) => ({
  id: `wv-${code}`, requirement_id: `req-${code}`, requirement_code: code,
  program_code: 'xbf_customer_setup', requirement_set_version: 1,
  waiver_status: 'active', expires_at: LATER, ...overrides,
});

test('an active, unexpired waiver on a missing requirement applies', () => {
  const verdict = evaluateWaiver({ waiver: waiver('bank_statement'), row: row('bank_statement', 'missing'), now: NOW });
  assert.deepEqual(verdict, { applied: true, reason: 'operator_waiver_applied' });
});

test('an expired waiver is not honoured', () => {
  // Expiry is the whole point: it forces the exception back in front of a human.
  const verdict = evaluateWaiver({
    waiver: waiver('bank_statement', { expires_at: EARLIER }),
    row: row('bank_statement', 'missing'), now: NOW,
  });
  assert.deepEqual(verdict, { applied: false, reason: 'waiver_expired' });
});

test('a revoked waiver is not honoured', () => {
  const verdict = evaluateWaiver({
    waiver: waiver('bank_statement', { waiver_status: 'revoked' }),
    row: row('bank_statement', 'missing'), now: NOW,
  });
  assert.equal(verdict.reason, 'waiver_not_active');
});

test('contradictory evidence cannot be waived', () => {
  // A conflict is not a gap. Waiving it would hide a data-integrity fault behind an
  // operator's signature instead of resolving it.
  const verdict = evaluateWaiver({ waiver: waiver('rfc'), row: row('rfc', 'conflict'), now: NOW });
  assert.deepEqual(verdict, { applied: false, reason: 'conflicting_evidence_not_waivable' });
  assert.ok(!WAIVABLE_STATUSES.includes('conflict'));
});

test('a waiver on an already-satisfied requirement is inert', () => {
  // The document arrived after the waiver was issued. It must still count as satisfied.
  const verdict = evaluateWaiver({ waiver: waiver('csf'), row: row('csf', 'satisfied'), now: NOW });
  assert.deepEqual(verdict, { applied: false, reason: 'requirement_already_satisfied' });
});

test('a waived row never carries evidence', () => {
  // The security property: an override must not be able to dress itself as a document.
  const result = applyWaivers({
    rows: [row('address_proof', 'expired', { asset_id: 'asset-1', evidence_sha256: 'a'.repeat(64) })],
    waivers: [waiver('address_proof')], now: NOW,
  });
  const waived = result.rows[0];
  assert.equal(waived.status, 'waived');
  assert.equal(waived.evidence_sha256, null);
  assert.equal(waived.asset_id, null);
  assert.equal(waived.fact_id, null);
  assert.equal(waived.waiver_id, 'wv-address_proof');
});

test('a waived evaluation is complete_with_waivers, never complete', () => {
  // Anything that accepts only 'complete' keeps refusing this, which is the safe default.
  const result = applyWaivers({
    rows: [row('csf', 'satisfied'), row('bank_statement', 'missing'), row('address_proof', 'expired')],
    waivers: [waiver('bank_statement'), waiver('address_proof')], now: NOW,
  });
  assert.equal(result.evaluation_status, 'complete_with_waivers');
  assert.deepEqual(result.counts, {
    required_count: 3, satisfied_count: 1, waived_count: 2, missing_count: 0, blocking_count: 0,
  });
});

test('counts satisfy the table constraint satisfied+missing+waived=required', () => {
  const result = applyWaivers({
    rows: [row('a', 'satisfied'), row('b', 'missing'), row('c', 'missing'), row('d', 'unverified')],
    waivers: [waiver('c')], now: NOW,
  });
  const { required_count, satisfied_count, missing_count, waived_count } = result.counts;
  assert.equal(satisfied_count + missing_count + waived_count, required_count);
  assert.equal(result.evaluation_status, 'blocked', 'an unverified row still blocks');
});

test('with nothing waived the status is unchanged', () => {
  const result = applyWaivers({ rows: [row('a', 'satisfied')], waivers: [], now: NOW });
  assert.equal(result.evaluation_status, 'complete');
  assert.equal(result.counts.waived_count, 0);
});

test('a waiver from another requirement-set version does not carry forward', () => {
  // Requirements are re-versioned when policy changes; the thing the waiver excused may
  // no longer be the same requirement.
  const result = applyWaivers({
    rows: [row('bank_statement', 'missing')],
    waivers: [waiver('bank_statement', { requirement_set_version: 1 })],
    program_code: 'xbf_customer_setup', requirement_set_version: 2, now: NOW,
  });
  assert.equal(result.rows[0].status, 'missing');
  assert.equal(result.evaluation_status, 'incomplete');
  assert.deepEqual(result.refused, [{
    waiver_id: 'wv-bank_statement', requirement_code: 'bank_statement', reason: 'waiver_version_mismatch',
  }]);
});

test('a waiver from another program does not carry forward', () => {
  const result = applyWaivers({
    rows: [row('bank_statement', 'missing')],
    waivers: [waiver('bank_statement', { program_code: 'other_program' })],
    program_code: 'xbf_customer_setup', requirement_set_version: 1, now: NOW,
  });
  assert.equal(result.refused[0].reason, 'waiver_program_mismatch');
});

test('a refused waiver is reported, not silently dropped', () => {
  const result = applyWaivers({
    rows: [row('rfc', 'conflict')], waivers: [waiver('rfc')], now: NOW,
  });
  assert.equal(result.applied.length, 0);
  assert.deepEqual(result.refused, [{
    requirement_code: 'rfc', waiver_id: 'wv-rfc', reason: 'conflicting_evidence_not_waivable',
  }]);
});

test('optional requirements do not enter the counts', () => {
  const result = applyWaivers({
    rows: [
      { ...row('optional_doc', 'missing'), requirement: requirement('optional_doc', { is_required: false }) },
      row('csf', 'satisfied'),
    ],
    waivers: [], now: NOW,
  });
  assert.equal(result.counts.required_count, 1);
  assert.equal(result.evaluation_status, 'complete');
});

test('a justification must actually say something', () => {
  assert.throws(() => validateWaiverRequest({ justification: 'ok', expires_at: LATER, authorized_at: NOW }), /at least 20 characters/);
});

test('a waiver cannot run forever', () => {
  assert.throws(() => validateWaiverRequest({
    justification: 'Landlord utility bill accepted with executed lease.',
    authorized_at: NOW, expires_at: '2030-01-01T00:00:00.000Z',
  }), new RegExp(`${MAX_WAIVER_DAYS} days`));
});

test('a waiver cannot expire in the past', () => {
  assert.throws(() => validateWaiverRequest({
    justification: 'Landlord utility bill accepted with executed lease.',
    authorized_at: NOW, expires_at: EARLIER,
  }), /must be in the future/);
});

test('a valid request normalises to what gets written', () => {
  const result = validateWaiverRequest({
    justification: '  Comprobante a nombre del arrendador; se acompana contrato de arrendamiento.  ',
    substitute_reference: '  Recibo Agua y Drenaje + contrato  ', authorized_at: NOW, expires_at: LATER,
  });
  assert.equal(result.justification.startsWith('Comprobante'), true);
  assert.equal(result.substitute_reference, 'Recibo Agua y Drenaje + contrato');
  assert.equal(result.expires_at, new Date(LATER).toISOString());
});

test('an absent substitute reference is null, not an empty string', () => {
  const result = validateWaiverRequest({
    justification: 'La entidad operativa aun no tiene cuenta bancaria abierta.',
    authorized_at: NOW, expires_at: LATER,
  });
  assert.equal(result.substitute_reference, null);
});
