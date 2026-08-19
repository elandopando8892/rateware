import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_FACT_MAP, expectedFactsFor, planDocumentReview,
} from '../supabase/functions/_shared/provider-entity-review-seeding.mjs';
import { FIELDS, NEVER_INFERRED } from '../supabase/functions/_shared/provider-onboarding-ontology.mjs';

const asset = (overrides = {}) => ({
  id: 'asset-1', organization_id: 'org-1', legal_entity_id: 'entity-1',
  ingestion_id: 'ing-1', document_type: 'tax_form_w9', sensitivity: 'restricted', ...overrides,
});

// The table's own vocabulary — a field seeded outside it would be rejected on insert.
const TABLE_SENSITIVITIES = new Set(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']);
const FIELD_CODE = /^[a-z][a-z0-9_]{1,127}$/;

test('every mapped fact is a real ontology field', () => {
  for (const [documentType, codes] of Object.entries(DOCUMENT_FACT_MAP)) {
    for (const code of codes) {
      assert.ok(FIELDS[code], `${documentType} maps unknown field ${code}`);
    }
  }
});

test('every seeded field code satisfies the table check constraint', () => {
  for (const codes of Object.values(DOCUMENT_FACT_MAP)) {
    for (const code of codes) assert.match(code, FIELD_CODE);
  }
});

test('a W-9 seeds the facts it actually evidences', () => {
  const plan = planDocumentReview(asset());
  const codes = plan.fields.map((f) => f.field_code);
  assert.deepEqual(codes, ['legal_name', 'entity_type', 'ein', 'fiscal_address', 'signature_name', 'signature_date']);
  assert.equal(plan.review.review_reason, 'field_review');
  assert.equal(plan.review.review_status, 'pending');
  assert.equal(plan.review.document_asset_id, 'asset-1');
});

test('no value is ever proposed — the reviewer reads the document', () => {
  // §7 forbids inventing tax, bank, signature or regulatory values. Seeding a
  // proposal would be exactly that, so every seeded field starts empty.
  for (const documentType of Object.keys(DOCUMENT_FACT_MAP)) {
    const plan = planDocumentReview(asset({ document_type: documentType }));
    if (!plan) continue;
    for (const field of plan.fields) {
      assert.equal(field.proposed_value, null, `${documentType}.${field.field_code} proposed a value`);
      assert.equal(field.field_status, 'pending');
    }
  }
});

test('never-inferred facts are never pre-filled anywhere they are seeded', () => {
  const seeded = new Set(Object.values(DOCUMENT_FACT_MAP).flat());
  const seededNeverInferred = NEVER_INFERRED.filter((code) => seeded.has(code));
  assert.ok(seededNeverInferred.length > 0, 'the corpus does seed some never-inferred facts');
  for (const documentType of Object.keys(DOCUMENT_FACT_MAP)) {
    const plan = planDocumentReview(asset({ document_type: documentType }));
    if (!plan) continue;
    for (const field of plan.fields) {
      if (NEVER_INFERRED.includes(field.field_code)) assert.equal(field.proposed_value, null);
    }
  }
});

test('field sensitivity comes from the ontology, not the document', () => {
  // A restricted EIN inside a merely confidential document stays restricted, so the
  // review surface can still withhold it.
  const plan = planDocumentReview(asset({ document_type: 'tax_form_w9', sensitivity: 'confidential' }));
  const ein = plan.fields.find((f) => f.field_code === 'ein');
  assert.equal(ein.sensitivity, 'restricted');
  assert.equal(plan.review.sensitivity, 'confidential');
});

test('bank details are seeded as highly restricted', () => {
  const plan = planDocumentReview(asset({ document_type: 'bank_letter', sensitivity: 'highly_restricted' }));
  for (const field of plan.fields) assert.equal(field.sensitivity, 'highly_restricted');
});

test('an ontology-only sensitivity is mapped into the table vocabulary', () => {
  // mc_number is 'public_business' in the ontology, which the table would reject.
  assert.equal(FIELDS.mc_number.sensitivity, 'public_business');
  const plan = planDocumentReview(asset({ document_type: 'mc_authority', sensitivity: 'confidential' }));
  const mc = plan.fields.find((f) => f.field_code === 'mc_number');
  assert.equal(mc.sensitivity, 'public');
});

test('every seeded sensitivity is one the table accepts', () => {
  for (const documentType of Object.keys(DOCUMENT_FACT_MAP)) {
    const plan = planDocumentReview(asset({ document_type: documentType }));
    if (!plan) continue;
    assert.ok(TABLE_SENSITIVITIES.has(plan.review.sensitivity));
    for (const field of plan.fields) assert.ok(TABLE_SENSITIVITIES.has(field.sensitivity), `${field.field_code} → ${field.sensitivity}`);
  }
});

test('a document type that evidences nothing seeds no review', () => {
  assert.equal(planDocumentReview(asset({ document_type: 'appointment_receipt' })), null);
  assert.equal(planDocumentReview(asset({ document_type: 'unclassified' })), null);
  assert.deepEqual(expectedFactsFor('appointment_receipt'), []);
});

test('both jurisdictions seed their own tax identity', () => {
  const us = planDocumentReview(asset({ document_type: 'tax_form_w9' })).fields.map((f) => f.field_code);
  const mx = planDocumentReview(asset({ document_type: 'csf' })).fields.map((f) => f.field_code);
  assert.ok(us.includes('ein') && !us.includes('rfc'), 'the US form evidences the EIN, not the RFC');
  assert.ok(mx.includes('rfc') && !mx.includes('ein'), 'the MX certificate evidences the RFC, not the EIN');
});

test('the plan carries no document content, only codes and metadata', () => {
  const serialized = JSON.stringify(planDocumentReview(asset()));
  for (const forbidden of ['storage_path', 'sha256', 'bytes', 'original_filename']) {
    assert.ok(!serialized.includes(forbidden), `plan leaked ${forbidden}`);
  }
});
