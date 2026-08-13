export const PROVIDER_DOCUMENT_SENSITIVITY = Object.freeze([
  'public',
  'internal',
  'confidential',
  'restricted',
  'highly_restricted',
]);

export const PROVIDER_DOCUMENT_SOURCE_CHANNELS = Object.freeze([
  'email',
  'portal',
  'manual',
  'generated',
  'api',
  'import',
  'other',
]);

export const PROVIDER_DOCUMENT_REVIEW_DECISIONS = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'correction_required',
]);

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function normalizeCode(value, label) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!CODE_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a normalized snake_case identifier.`);
  }
  return normalized;
}

export function normalizeProviderDocumentType(value) {
  return normalizeCode(value, 'Document type');
}

export function normalizeProviderDocumentKey(value = 'primary') {
  return normalizeCode(value, 'Document key');
}

export function normalizeProviderDocumentSensitivity(value = 'internal') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!PROVIDER_DOCUMENT_SENSITIVITY.includes(normalized)) {
    throw new RangeError(`Unsupported document sensitivity: ${normalized}`);
  }
  return normalized;
}

export function isSha256(value) {
  return SHA256_PATTERN.test(String(value ?? '').trim());
}

export function assertSha256(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new TypeError('Document hash must be a lowercase 64-character SHA-256 value.');
  }
  return normalized;
}

function toDateOnly(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new TypeError('Date values must use YYYY-MM-DD.');
  }
  return text;
}

export function computeProviderDocumentEffectiveState(input, today = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Document state input must be an object.');
  }

  const lifecycle = String(input.lifecycleStatus ?? 'active').trim().toLowerCase();
  const processing = String(input.processingStatus ?? 'registered').trim().toLowerCase();
  const review = input.reviewDecision == null
    ? null
    : String(input.reviewDecision).trim().toLowerCase();
  const expirationDate = toDateOnly(input.expirationDate);
  const todayText = today instanceof Date
    ? today.toISOString().slice(0, 10)
    : toDateOnly(today);

  if (lifecycle === 'archived' || processing === 'archived') return 'archived';
  if (lifecycle === 'revoked') return 'revoked';
  if (processing === 'superseded') return 'superseded';
  if (expirationDate && expirationDate < todayText) return 'expired';
  if (review === 'rejected') return 'rejected';
  if (review === 'correction_required') return 'correction_required';
  if (review === 'approved' && processing === 'ready') return 'verified';
  if (processing === 'ready') return 'needs_review';
  return processing;
}

export function documentQualifiesAsRequirementEvidence(input, today = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (String(input.linkStatus ?? '').trim().toLowerCase() !== 'active') return false;
  if (String(input.linkRole ?? '').trim().toLowerCase() !== 'evidence') return false;
  return computeProviderDocumentEffectiveState(input, today) === 'verified';
}

export function validateProviderDocumentDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider document draft must be an object.');
  }

  const documentName = String(input.documentName ?? '').trim();
  if (!documentName) throw new TypeError('Document name is required.');

  return Object.freeze({
    documentType: normalizeProviderDocumentType(input.documentType),
    documentKey: normalizeProviderDocumentKey(input.documentKey ?? 'primary'),
    documentName,
    sensitivity: normalizeProviderDocumentSensitivity(input.sensitivity ?? 'internal'),
  });
}

export function validateProviderDocumentVersionDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider document version draft must be an object.');
  }

  const versionNumber = Number(input.versionNumber);
  if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
    throw new TypeError('Document version number must be a positive integer.');
  }

  const originalFilename = String(input.originalFilename ?? '').trim();
  const storageBucket = String(input.storageBucket ?? '').trim();
  const storagePath = String(input.storagePath ?? '').trim();
  const sourceChannel = String(input.sourceChannel ?? 'manual').trim().toLowerCase();

  if (!originalFilename) throw new TypeError('Original filename is required.');
  if (!storageBucket) throw new TypeError('Storage bucket is required.');
  if (!storagePath) throw new TypeError('Storage path is required.');
  if (!PROVIDER_DOCUMENT_SOURCE_CHANNELS.includes(sourceChannel)) {
    throw new RangeError(`Unsupported document source channel: ${sourceChannel}`);
  }

  const effectiveDate = toDateOnly(input.effectiveDate);
  const expirationDate = toDateOnly(input.expirationDate);
  if (effectiveDate && expirationDate && expirationDate < effectiveDate) {
    throw new RangeError('Document expiration date cannot precede the effective date.');
  }

  return Object.freeze({
    versionNumber,
    originalFilename,
    storageBucket,
    storagePath,
    fileSha256: assertSha256(input.fileSha256),
    sourceChannel,
    effectiveDate,
    expirationDate,
  });
}
