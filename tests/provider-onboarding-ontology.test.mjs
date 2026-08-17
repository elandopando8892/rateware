import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS, FIELD_CODES, NEVER_INFERRED, ONTOLOGY_VERSION,
  mapExtractedFields, normalizeLabel, requiresCanonicalFact, resolveField,
} from '../supabase/functions/_shared/provider-onboarding-ontology.mjs';

const REQUIRED_CODES = ['legal_name','trade_name','entity_type','tax_id','ein','rfc','state_entity_id','formation_date','years_in_business','fiscal_address','commercial_address','billing_address','remittance_email','accounts_payable_contact','general_manager','legal_representative','phone','mobile','website','bank_name','bank_address','bank_officer','bank_phone','trade_reference_1','trade_reference_2','mc_number','dot_number','broker_authority_status','bond_provider','bond_amount','credit_requested','payment_terms','signature_name','signature_title','signature_date'];

test('ontology covers every field required by the onboarding brief', () => {
  for (const code of REQUIRED_CODES) assert.ok(FIELD_CODES.includes(code), `missing field ${code}`);
  assert.equal(FIELD_CODES.length, new Set(FIELD_CODES).size, 'field codes must be unique');
  assert.match(ONTOLOGY_VERSION, /^\d{4}\.\d{2}\.\d{2}$/);
});

test('every field carries a data type and a disclosure sensitivity', () => {
  const allowed = new Set(['public_business', 'confidential', 'restricted', 'highly_restricted']);
  for (const code of FIELD_CODES) {
    assert.ok(FIELDS[code].data_type, `${code} has no data_type`);
    assert.ok(allowed.has(FIELDS[code].sensitivity), `${code} has invalid sensitivity`);
  }
});

test('banking fields are highly restricted and never inferred', () => {
  for (const code of ['bank_name', 'bank_address', 'bank_officer', 'bank_phone']) {
    assert.equal(FIELDS[code].sensitivity, 'highly_restricted');
    assert.ok(requiresCanonicalFact(code), `${code} must require a canonical fact`);
  }
  for (const code of NEVER_INFERRED) assert.ok(FIELD_CODES.includes(code));
});

test('label normalization strips accents, punctuation and filler words', () => {
  assert.equal(normalizeLabel('  Razón   Social:  '), 'razon social');
  assert.equal(normalizeLabel('Please enter your Legal Name*'), 'legal name');
  assert.equal(normalizeLabel('MC #'), 'mc #');
});

test('documented alias examples from the brief resolve exactly', () => {
  const expected = {
    'Federal Tax ID': 'ein',
    'Taxpayer ID': 'tax_id',
    'RFC Federal': 'rfc',
    'MC #': 'mc_number',
    'USDOT': 'dot_number',
    'Requested Credit Line': 'credit_requested',
    'Terms Requested': 'payment_terms',
    'Authorized Signer': 'signature_name',
  };
  for (const [label, code] of Object.entries(expected)) {
    const result = resolveField(label);
    assert.equal(result.field_code, code, `${label} resolved to ${result.field_code}`);
    assert.equal(result.confidence, 1);
    assert.equal(result.requires_review, false);
  }
});

test('Spanish aliases resolve to the same canonical codes as English', () => {
  assert.equal(resolveField('Razón Social').field_code, 'legal_name');
  assert.equal(resolveField('Domicilio Fiscal').field_code, 'fiscal_address');
  assert.equal(resolveField('Línea de crédito solicitada').field_code, 'credit_requested');
  assert.equal(resolveField('Representante Legal').field_code, 'legal_representative');
});

test('unknown and empty labels are unmapped and flagged for review, never guessed', () => {
  for (const label of ['', '   ', 'Favourite colour of your logo']) {
    const result = resolveField(label);
    assert.equal(result.field_code, null);
    assert.equal(result.confidence, 0);
    assert.equal(result.requires_review, true);
  }
});

test('a label matching several fields is ambiguous rather than silently chosen', () => {
  const result = resolveField('address');
  assert.equal(result.field_code, null);
  assert.equal(result.match_kind, 'ambiguous');
  assert.ok(result.candidate_codes.length > 1);
  assert.ok(result.candidate_codes.includes('fiscal_address'));
});

test('a partial single-candidate match is accepted only at low confidence with review', () => {
  const result = resolveField('Company Website URL');
  assert.equal(result.field_code, 'website');
  assert.equal(result.match_kind, 'contains');
  assert.equal(result.confidence, 0.6);
  assert.equal(result.requires_review, true);
});

test('mapping produces provenance and leaves missing values pending', () => {
  const facts = { legal_name: { value: 'Synthetic Freight Systems LLC', evidence_document_id: 'doc-1' } };
  const rows = mapExtractedFields(['Legal Name', 'Requested Credit Line', 'Unrelated question'], facts);
  assert.equal(rows.length, 3);

  assert.equal(rows[0].field_code, 'legal_name');
  assert.equal(rows[0].proposed_value, 'Synthetic Freight Systems LLC');
  assert.equal(rows[0].evidence_document_id, 'doc-1');
  assert.equal(rows[0].status, 'proposed');
  assert.equal(rows[0].confidence, 1);

  assert.equal(rows[1].field_code, 'credit_requested');
  assert.equal(rows[1].proposed_value, null, 'missing fact must never be approximated');
  assert.equal(rows[1].status, 'pending');
  assert.equal(rows[1].reason, 'canonical_fact_missing');

  assert.equal(rows[2].field_code, null);
  assert.equal(rows[2].status, 'pending');
  assert.equal(rows[2].reason, 'unmapped_label');
  for (const row of rows) assert.equal(row.ontology_version, ONTOLOGY_VERSION);
});

test('never-inferred fields require review even when a canonical fact exists', () => {
  const facts = { payment_terms: { value: 'NET 30', evidence_document_id: 'doc-9' } };
  const [row] = mapExtractedFields(['Payment Terms'], facts);
  assert.equal(row.field_code, 'payment_terms');
  assert.equal(row.status, 'needs_review');
  assert.equal(row.requires_review, true);
});

test('blank canonical values are treated as missing, not as answers', () => {
  const [row] = mapExtractedFields(['Legal Name'], { legal_name: { value: '   ' } });
  assert.equal(row.status, 'pending');
  assert.equal(row.proposed_value, null);
});

test('ontology tables are frozen so runtime learning cannot mutate them', () => {
  assert.ok(Object.isFrozen(FIELDS));
  assert.ok(Object.isFrozen(FIELD_CODES));
  assert.throws(() => { FIELDS.legal_name.aliases.push('hijack'); });
});
