import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDocumentGaps, normalizeRequestText, resolveRequestedDocument, vaultTypesFor,
} from '../supabase/functions/_shared/provider-onboarding-document-request.mjs';

// The exact seven documents GPT-4o extracted from the real carrier email, verbatim.
const SALZILLO_REQUEST = [
  'Copia del acta constitutiva',
  'INE del Representante Legal',
  'Poder Notarial',
  'Opinion positiva expedida por el SAT',
  'Constancia de situacion fiscal',
  'Caratula del banco emisor',
  'Comprobante de domicilio',
];

// The XBFMX vault as production actually holds it, including the two vocabularies
// that different ingestion runs produced for the same documents.
const XBFMX_VAULT = [
  { document_type: 'acta_constitutiva', document_name: 'Acta Constitutiva.pdf', verification_status: 'needs_review' },
  { document_type: 'acta_constitutiva', document_name: 'Acta Constitutiva copia certificada.pdf', verification_status: 'needs_review' },
  { document_type: 'government_id', document_name: 'INE — Representante Legal', verification_status: 'needs_review' },
  { document_type: 'csf', document_name: 'XBFmx - CSF.pdf', verification_status: 'needs_review' },
  { document_type: 'mx_tax_status_certificate', document_name: 'Constancia de Situación Fiscal', verification_status: 'verified' },
  { document_type: 'mx_rfc_registration_acknowledgement', document_name: 'Acuse de inscripción al RFC', verification_status: 'verified' },
  { document_type: 'cif', document_name: 'XBFmx - CIF.pdf', verification_status: 'needs_review' },
  { document_type: 'lease_contract', document_name: 'Contrato de Arrendamiento.pdf', verification_status: 'needs_review' },
  { document_type: 'governance_document', document_name: 'Escrito Socios 2026.pdf', verification_status: 'needs_review' },
];

test('accents never decide whether a document is recognised', () => {
  assert.equal(normalizeRequestText('Constancia de situación fiscal'), 'constancia de situacion fiscal');
  assert.equal(
    resolveRequestedDocument('Constancia de situación fiscal').document_type,
    resolveRequestedDocument('Constancia de situacion fiscal').document_type,
  );
  assert.equal(resolveRequestedDocument('Opinión positiva expedida por el SAT').document_type, 'sat_compliance_opinion');
});

test('the SAT certificate is recognised by either name it is given', () => {
  // The carrier says "opinión positiva"; the SAT calls it "opinión de cumplimiento".
  assert.equal(resolveRequestedDocument('Opinion positiva expedida por el SAT').document_type, 'sat_compliance_opinion');
  assert.equal(resolveRequestedDocument('Opinión de cumplimiento').document_type, 'sat_compliance_opinion');
});

test('every document in the real request resolves to a canonical type', () => {
  for (const request of SALZILLO_REQUEST) {
    const resolution = resolveRequestedDocument(request);
    assert.equal(resolution.requires_human_mapping, false, `unmapped: ${request}`);
    assert.ok(resolution.document_type, `no type for: ${request}`);
  }
});

test('an unrecognised phrase asks for a human, and is never called missing', () => {
  // Reporting an unknown phrase as missing sends an operator to collect something
  // they may already hold under a name this does not know.
  const resolution = resolveRequestedDocument('Formato interno XYZ-42');
  assert.equal(resolution.requires_human_mapping, true);
  assert.equal(resolution.document_type, null);
  const gaps = analyzeDocumentGaps(['Formato interno XYZ-42'], XBFMX_VAULT);
  assert.equal(gaps.unmapped.length, 1);
  assert.equal(gaps.missing.length, 0, 'an unmapped phrase must not be counted as a gap');
});

test('both vault vocabularies satisfy the same canonical type', () => {
  // Different ingestion runs classified the same document differently. Treating
  // them as distinct would report a held document as missing.
  assert.ok(vaultTypesFor('tax_status_certificate').includes('csf'));
  assert.ok(vaultTypesFor('tax_status_certificate').includes('mx_tax_status_certificate'));
  assert.ok(vaultTypesFor('rfc_registration').includes('mx_rfc_registration_acknowledgement'));
});

test('the real request against the real vault reports the true gaps', () => {
  const gaps = analyzeDocumentGaps(SALZILLO_REQUEST, XBFMX_VAULT);
  const satisfied = gaps.satisfied.map((item) => item.document_type).sort();
  const missing = gaps.missing.map((item) => item.document_type).sort();

  assert.deepEqual(satisfied, ['acta_constitutiva', 'government_id', 'tax_status_certificate']);
  // Four are genuinely absent from the XBFMX vault. The SAT compliance opinion is
  // among them: the vault's copy carries a typo in its filename, so it ingested as
  // unclassified and cannot satisfy the request until a human classifies it.
  //
  // proof_of_address is deliberately NOT satisfied by the lease contract the vault
  // holds. A lease is commonly accepted as a comprobante de domicilio in Mexico,
  // but deciding that a draft lease satisfies a carrier's requirement is a human
  // call, not a mapping this should make silently.
  assert.deepEqual(missing, ['bank_letter', 'power_of_attorney', 'proof_of_address', 'sat_compliance_opinion']);
  assert.equal(gaps.unmapped.length, 0);
  assert.equal(gaps.summary.requested, 7);
  assert.equal(gaps.summary.satisfied, 3);
  assert.equal(gaps.summary.missing, 4);
});

test('verification is reported, not required', () => {
  // A carrier asking for a document "no older than one month" still needs a human
  // to judge recency, so holding it and having verified it are reported separately.
  const gaps = analyzeDocumentGaps(SALZILLO_REQUEST, XBFMX_VAULT);
  const csf = gaps.satisfied.find((item) => item.document_type === 'tax_status_certificate');
  assert.equal(csf.verified, true, 'one of the two CSF rows is verified');
  const acta = gaps.satisfied.find((item) => item.document_type === 'acta_constitutiva');
  assert.equal(acta.verified, false);
  assert.equal(acta.held_count, 2, 'both copies are reported');
});

test('a document named twice is reported once', () => {
  const gaps = analyzeDocumentGaps(['Acta constitutiva', 'Copia del acta constitutiva'], XBFMX_VAULT);
  assert.equal(gaps.satisfied.length, 1);
});

test('an empty vault makes every mapped request a gap', () => {
  const gaps = analyzeDocumentGaps(SALZILLO_REQUEST, []);
  assert.equal(gaps.summary.satisfied, 0);
  assert.equal(gaps.summary.missing, 7);
});

test('empty input is handled without throwing', () => {
  assert.equal(analyzeDocumentGaps([], []).summary.requested, 0);
  assert.equal(analyzeDocumentGaps(null, null).summary.requested, 0);
  assert.equal(resolveRequestedDocument('').requires_human_mapping, true);
});

test('the analysis carries no document content, only types and names', () => {
  const serialized = JSON.stringify(analyzeDocumentGaps(SALZILLO_REQUEST, XBFMX_VAULT));
  for (const forbidden of ['storage_path', 'sha256', 'file_size', 'bytes']) {
    assert.ok(!serialized.includes(forbidden), `analysis leaked ${forbidden}`);
  }
});
