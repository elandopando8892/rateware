const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CELL_PATTERN = /^([A-Z]{1,3})([1-9][0-9]*)$/;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const MAX_XLSX_COLUMN = 16_384;
const MAX_XLSX_ROW = 1_048_576;

export type EvidenceLocator =
  | { kind: 'pdf_region'; sourceVersionId: string; page: number; polygon: readonly number[]; rawEvidenceHash: string }
  | { kind: 'xlsx_cell'; sourceVersionId: string; sheet: string; cellRange: string; rawEvidenceHash: string };

export type ExtractedField = {
  id: string;
  organizationId: string;
  caseId: string;
  extractionId: string;
  beforeSha256: string;
  afterSha256: string;
  fieldKey: string;
  presence: 'present' | 'blank' | 'absent' | 'uncertain';
  value: string | number | boolean | null;
  confidence: number;
  evidence: readonly EvidenceLocator[];
  provider: 'azure_document_intelligence' | 'openai_structured_outputs' | 'xlsx_structural';
  modelVersion: string;
  schemaVersion: 1;
  validation: 'valid' | 'low_confidence' | 'contradictory' | 'invalid';
};

export type EvidenceItem = { id: string; locator: EvidenceLocator; content: string; contentSha256: string };

export type ExtractionSnapshot = {
  id: string;
  organizationId: string;
  caseId: string;
  sourceVersionId: string;
  inputSha256: string;
  promptSha256: string;
  schemaSha256: string;
  fields: readonly ExtractedField[];
  status: 'review_required' | 'reviewed' | 'failed';
};

function requireRecord(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
  return record;
}

function requireUuid(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error(code);
}

function requireSha256(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new Error(code);
}

function xlsxCellCoordinates(cell: string): readonly [number, number] | null {
  const match = CELL_PATTERN.exec(cell);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  return column <= MAX_XLSX_COLUMN && row <= MAX_XLSX_ROW ? [column, row] : null;
}

function validCellRange(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length < 1 || parts.length > 2) return false;
  const start = xlsxCellCoordinates(parts[0]);
  const end = xlsxCellCoordinates(parts[1] ?? parts[0]);
  return start !== null && end !== null && start[0] <= end[0] && start[1] <= end[1];
}

export function assertEvidenceLocator(value: unknown): asserts value is EvidenceLocator {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EVIDENCE_LOCATOR_INVALID');
  const kind = (value as Record<string, unknown>).kind;
  const keys = kind === 'pdf_region'
    ? ['kind', 'sourceVersionId', 'page', 'polygon', 'rawEvidenceHash']
    : kind === 'xlsx_cell'
    ? ['kind', 'sourceVersionId', 'sheet', 'cellRange', 'rawEvidenceHash']
    : [];
  if (keys.length === 0) throw new Error('EVIDENCE_LOCATOR_KIND_INVALID');
  const locator = requireRecord(value, keys, 'EVIDENCE_LOCATOR_INVALID');
  requireUuid(locator.sourceVersionId, 'SOURCE_VERSION_ID_INVALID');
  requireSha256(locator.rawEvidenceHash, 'RAW_EVIDENCE_HASH_INVALID');
  if (kind === 'pdf_region') {
    if (!Number.isSafeInteger(locator.page) || (locator.page as number) < 1) throw new Error('EVIDENCE_PDF_PAGE_INVALID');
    if (!Array.isArray(locator.polygon) || locator.polygon.length < 8 || locator.polygon.length % 2 !== 0 ||
      locator.polygon.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate) || coordinate < 0)) {
      throw new Error('EVIDENCE_PDF_POLYGON_INVALID');
    }
    return;
  }
  if (typeof locator.sheet !== 'string' || locator.sheet.trim() !== locator.sheet || locator.sheet.length < 1 || locator.sheet.length > 128) {
    throw new Error('EVIDENCE_XLSX_SHEET_INVALID');
  }
  if (!validCellRange(locator.cellRange)) throw new Error('EVIDENCE_XLSX_RANGE_INVALID');
}

export function assertExtractedField(value: unknown): asserts value is ExtractedField {
  const field = requireRecord(value, [
    'id', 'organizationId', 'caseId', 'extractionId', 'beforeSha256', 'afterSha256',
    'fieldKey', 'presence', 'value', 'confidence', 'evidence', 'provider', 'modelVersion', 'schemaVersion', 'validation',
  ], 'FIELD_OBJECT_INVALID');
  requireUuid(field.id, 'FIELD_ID_INVALID');
  requireUuid(field.organizationId, 'FIELD_ORGANIZATION_INVALID');
  requireUuid(field.caseId, 'FIELD_CASE_INVALID');
  requireUuid(field.extractionId, 'FIELD_EXTRACTION_INVALID');
  requireSha256(field.beforeSha256, 'FIELD_BEFORE_HASH_INVALID');
  requireSha256(field.afterSha256, 'FIELD_AFTER_HASH_INVALID');
  if (typeof field.fieldKey !== 'string' || !FIELD_KEY_PATTERN.test(field.fieldKey)) throw new Error('FIELD_KEY_INVALID');
  if (typeof field.confidence !== 'number' || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) throw new Error('FIELD_CONFIDENCE_INVALID');
  const primitive = field.value === null || typeof field.value === 'string' || typeof field.value === 'boolean' ||
    (typeof field.value === 'number' && Number.isFinite(field.value));
  if (!primitive) throw new Error('FIELD_VALUE_INVALID');
  if (field.presence === 'present' && field.value === null) throw new Error('FIELD_PRESENT_VALUE_REQUIRED');
  if ((field.presence === 'absent' || field.presence === 'blank') && field.value !== null) throw new Error('FIELD_NONPRESENT_VALUE_FORBIDDEN');
  if (field.presence !== 'present' && field.presence !== 'blank' && field.presence !== 'absent' && field.presence !== 'uncertain') throw new Error('FIELD_PRESENCE_INVALID');
  if (!Array.isArray(field.evidence) || field.evidence.length === 0) throw new Error('FIELD_EVIDENCE_REQUIRED');
  for (const locator of field.evidence) assertEvidenceLocator(locator);
  if (!['azure_document_intelligence', 'openai_structured_outputs', 'xlsx_structural'].includes(field.provider as string)) throw new Error('FIELD_PROVIDER_INVALID');
  if (typeof field.modelVersion !== 'string' || field.modelVersion.trim() !== field.modelVersion || field.modelVersion.length < 1 || field.modelVersion.length > 128) throw new Error('FIELD_MODEL_VERSION_INVALID');
  if (field.schemaVersion !== 1) throw new Error('FIELD_SCHEMA_VERSION_INVALID');
  if (!['valid', 'low_confidence', 'contradictory', 'invalid'].includes(field.validation as string)) throw new Error('FIELD_VALIDATION_INVALID');
}

export function assertExtractionSnapshot(value: unknown): asserts value is ExtractionSnapshot {
  const snapshot = requireRecord(value, [
    'id', 'organizationId', 'caseId', 'sourceVersionId', 'inputSha256', 'promptSha256', 'schemaSha256', 'fields', 'status',
  ], 'EXTRACTION_OBJECT_INVALID');
  requireUuid(snapshot.id, 'EXTRACTION_ID_INVALID');
  requireUuid(snapshot.organizationId, 'EXTRACTION_ORGANIZATION_INVALID');
  requireUuid(snapshot.caseId, 'EXTRACTION_CASE_INVALID');
  requireUuid(snapshot.sourceVersionId, 'SOURCE_VERSION_ID_INVALID');
  requireSha256(snapshot.inputSha256, 'INPUT_SHA256_INVALID');
  requireSha256(snapshot.promptSha256, 'PROMPT_SHA256_INVALID');
  requireSha256(snapshot.schemaSha256, 'SCHEMA_SHA256_INVALID');
  if (!Array.isArray(snapshot.fields)) throw new Error('EXTRACTION_FIELDS_INVALID');
  const ids = new Set<string>();
  for (const value of snapshot.fields) {
    assertExtractedField(value);
    if (ids.has(value.id)) throw new Error('EXTRACTION_FIELD_DUPLICATE');
    ids.add(value.id);
    if (value.organizationId !== snapshot.organizationId || value.caseId !== snapshot.caseId || value.extractionId !== snapshot.id) {
      throw new Error('EXTRACTION_FIELD_SCOPE_MISMATCH');
    }
    if (value.evidence.some((locator) => locator.sourceVersionId !== snapshot.sourceVersionId)) {
      throw new Error('EXTRACTION_EVIDENCE_SOURCE_MISMATCH');
    }
  }
  if (!['review_required', 'reviewed', 'failed'].includes(snapshot.status as string)) throw new Error('EXTRACTION_STATUS_INVALID');
}

export const extractionContractPatterns = Object.freeze({ uuid: UUID_PATTERN, sha256: SHA256_PATTERN });
