import assert from 'node:assert/strict';

import {
  assertEvidenceLocator,
  assertExtractedField,
  assertExtractionSnapshot,
  type EvidenceLocator,
  type ExtractedField,
} from './extraction-contracts.ts';

const sourceVersionId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const extractionId = '44444444-4444-4444-8444-444444444444';
const fieldId = '55555555-5555-4555-8555-555555555555';
const hash = 'a'.repeat(64);

const pdfLocator: EvidenceLocator = {
  kind: 'pdf_region', sourceVersionId, page: 1,
  polygon: [0, 0, 10, 0, 10, 5, 0, 5], rawEvidenceHash: hash,
};
const xlsxLocator: EvidenceLocator = {
  kind: 'xlsx_cell', sourceVersionId, sheet: 'Requirements', cellRange: 'B2:C4', rawEvidenceHash: hash,
};

type ReviewedFieldFixture = ExtractedField & {
  id: string;
  organizationId: string;
  caseId: string;
  extractionId: string;
  beforeSha256: string;
  afterSha256: string;
};

function presentField(overrides: Partial<ReviewedFieldFixture> = {}): ReviewedFieldFixture {
  return {
    id: fieldId, organizationId, caseId, extractionId,
    beforeSha256: hash, afterSha256: 'b'.repeat(64),
    fieldKey: 'supplier.legalName', presence: 'present', value: 'Synthetic Supplier', confidence: 0.95,
    evidence: [pdfLocator], provider: 'azure_document_intelligence', modelVersion: '2024-11-30',
    schemaVersion: 1, validation: 'valid', ...overrides,
  };
}

Deno.test('evidence locators require complete page or sheet evidence', () => {
  assert.doesNotThrow(() => assertEvidenceLocator(pdfLocator));
  assert.doesNotThrow(() => assertEvidenceLocator(xlsxLocator));
  assert.throws(() => assertEvidenceLocator({ ...pdfLocator, page: 0 }), /EVIDENCE_PDF_PAGE_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...xlsxLocator, sheet: '' }), /EVIDENCE_XLSX_SHEET_INVALID/);
});

Deno.test('evidence locators reject malformed polygons and cell ranges', () => {
  assert.throws(() => assertEvidenceLocator({ ...pdfLocator, polygon: [0, 0, 1, 0, 1, 1] }), /EVIDENCE_PDF_POLYGON_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...pdfLocator, polygon: [0, 0, 1, 0, 1, Number.NaN, 0, 1] }), /EVIDENCE_PDF_POLYGON_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...xlsxLocator, cellRange: 'requirements!b2' }), /EVIDENCE_XLSX_RANGE_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...xlsxLocator, cellRange: 'XFE1' }), /EVIDENCE_XLSX_RANGE_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...xlsxLocator, cellRange: 'XFD1048577' }), /EVIDENCE_XLSX_RANGE_INVALID/);
});

Deno.test('evidence locators require canonical UUID and lowercase SHA-256 values', () => {
  assert.throws(() => assertEvidenceLocator({ ...pdfLocator, sourceVersionId: 'source-1' }), /SOURCE_VERSION_ID_INVALID/);
  assert.throws(() => assertEvidenceLocator({ ...pdfLocator, rawEvidenceHash: hash.toUpperCase() }), /RAW_EVIDENCE_HASH_INVALID/);
});

Deno.test('extracted fields enforce confidence and presence-value consistency', () => {
  assert.doesNotThrow(() => assertExtractedField(presentField()));
  assert.throws(() => assertExtractedField(presentField({ confidence: 1.01 })), /FIELD_CONFIDENCE_INVALID/);
  assert.throws(() => assertExtractedField(presentField({ presence: 'present', value: null })), /FIELD_PRESENT_VALUE_REQUIRED/);
  assert.throws(() => assertExtractedField(presentField({ presence: 'absent', value: 'invented' })), /FIELD_NONPRESENT_VALUE_FORBIDDEN/);
  assert.throws(() => assertExtractedField(presentField({ presence: 'blank', value: false })), /FIELD_NONPRESENT_VALUE_FORBIDDEN/);
});

Deno.test('extracted fields reject unknown shapes and nonprimitive runtime values', () => {
  for (const invalid of [null, [], 'field']) {
    assert.throws(() => assertExtractedField(invalid as unknown as ExtractedField), /FIELD_OBJECT_INVALID/);
  }
  for (const invalid of [undefined, { fabricated: 'object' }, ['array']]) {
    assert.throws(
      () => assertExtractedField(presentField({ value: invalid as unknown as ExtractedField['value'] })),
      /FIELD_VALUE_INVALID/,
    );
  }
});

Deno.test('extracted fields require stable UUID identity, scope, extraction, and review hashes', () => {
  assert.throws(() => assertExtractedField(presentField({ id: 'field-key' })), /FIELD_ID_INVALID/);
  assert.throws(() => assertExtractedField(presentField({ extractionId: 'extract-1' })), /FIELD_EXTRACTION_INVALID/);
  assert.throws(() => assertExtractedField(presentField({ beforeSha256: hash.toUpperCase() })), /FIELD_BEFORE_HASH_INVALID/);
});

Deno.test('extraction snapshots validate tenant, source, hashes, and every field', () => {
  const snapshot = {
    id: extractionId,
    organizationId,
    caseId, sourceVersionId,
    inputSha256: hash, promptSha256: 'b'.repeat(64), schemaSha256: 'c'.repeat(64),
    fields: [presentField()], status: 'review_required' as const,
  };
  assert.doesNotThrow(() => assertExtractionSnapshot(snapshot));
  assert.throws(() => assertExtractionSnapshot({ ...snapshot, promptSha256: `A${'a'.repeat(63)}` }), /PROMPT_SHA256_INVALID/);
  assert.throws(() => assertExtractionSnapshot({ ...snapshot, fields: [presentField({ confidence: -0.1 })] }), /FIELD_CONFIDENCE_INVALID/);
});

Deno.test('extraction snapshots reject cross-source and cross-scope field evidence', () => {
  const snapshot = {
    id: extractionId, organizationId, caseId, sourceVersionId,
    inputSha256: hash, promptSha256: 'b'.repeat(64), schemaSha256: 'c'.repeat(64),
    fields: [presentField()], status: 'review_required' as const,
  };
  const other = '66666666-6666-4666-8666-666666666666';
  assert.throws(
    () => assertExtractionSnapshot({ ...snapshot, fields: [presentField({ evidence: [{ ...pdfLocator, sourceVersionId: other }] })] }),
    /EXTRACTION_EVIDENCE_SOURCE_MISMATCH/,
  );
  assert.throws(() => assertExtractionSnapshot({ ...snapshot, fields: [presentField({ organizationId: other })] }), /EXTRACTION_FIELD_SCOPE_MISMATCH/);
  assert.throws(() => assertExtractionSnapshot({ ...snapshot, fields: [presentField({ extractionId: other })] }), /EXTRACTION_FIELD_SCOPE_MISMATCH/);
});
