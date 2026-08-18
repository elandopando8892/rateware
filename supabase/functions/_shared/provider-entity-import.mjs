// Private Entity Vault import planning.
//
// Pure functions only: hashing, real-format sniffing, sensitivity classification and
// duplicate detection. Transport lives in tools/import-entity-vault.mjs so the risky
// part — deciding what a file is and how restricted it is — is testable without a
// database, a bucket or a real document.
//
// Nothing here reads or logs file contents beyond the leading magic bytes.

export const IMPORT_CORE_VERSION = '2026.08.17';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Container families. xlsx/docx are both ZIP; xls/doc are both OLE2 compound files.
// Sniffing therefore proves the family, not the member — the extension selects within
// it, and a family mismatch is a hard error.
const SIGNATURES = [
  { family: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { family: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { family: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { family: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { family: 'ole2', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

// Cryptographic key material must never enter the vault under any circumstance.
// The SAT e.firma (FIEL) and CSD bundles ship a private key alongside ordinary PDFs;
// a single mis-aimed --source would otherwise ingest a signing key as a "document".
// This is a hard block ahead of every other rule, not a classification.
const KEY_MATERIAL_EXTENSIONS = new Set(['key', 'cer', 'req', 'pfx', 'p12', 'pem', 'crt', 'jks', 'keystore']);
// Name matching is deliberately narrow: it targets actual key-bundle filenames
// (Claveprivada_FIEL_..., FIEL_XXXX_..., CSD_XXXX_...), not documents that merely
// mention the e.firma — an appointment receipt named "AcuseCita efirma.pdf" is an
// ordinary PDF and must not be refused.
const KEY_MATERIAL_NAME = /clave\s*privada|claveprivada|private[_\s-]?key|\b(?:fiel|csd)_[a-z0-9]{8,}/i;

const EXTENSION_FAMILY = Object.freeze({
  pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg',
  xlsx: 'zip', docx: 'zip', xls: 'ole2', doc: 'ole2',
});

const EXTENSION_MIME = Object.freeze({
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
});

// Disclosure classification from the onboarding brief §9. Ordered: the first pattern
// that matches wins, so specific rules precede general ones.
const CLASSIFICATION_RULES = [
  [/\bfirma\b|signature|specimen/i, 'authorized_signature', 'highly_restricted'],
  // Underscore is a word character, so \bINE\b misses "INE_Name" — a real filename
  // shape in this corpus. Match on letter boundaries instead.
  [/(?<![a-z])(ine|ife)(?![a-z])|passport|pasaporte|identificacion oficial/i, 'government_id', 'highly_restricted'],
  [/bank letter|carta bancaria|bank statement|estado de cuenta|caratula bancaria/i, 'bank_letter', 'highly_restricted'],
  [/\bw-?9\b/i, 'w9', 'restricted'],
  [/\bein\b|employer identification/i, 'ein_assignation', 'restricted'],
  [/acta constitutiva/i, 'acta_constitutiva', 'restricted'],
  [/\bcsf\b|constancia de situacion fiscal/i, 'csf', 'restricted'],
  [/\brfc\b|acuse de inscripcion/i, 'rfc_registration', 'restricted'],
  [/bmc-?84|surety|bond|fianza/i, 'surety_bond', 'confidential'],
  // Tax authorizations and filings carry taxpayer identifiers; restricted, like the W-9.
  [/tax information authorization|\bss-?4\b|comptroller|opinion de cumplimiento|buzon tributario/i, 'tax_filing', 'restricted'],
  [/\bcif\b|cedula de identificacion fiscal/i, 'cif', 'restricted'],
  // Regulatory registrations are public-record adjacent; confidential is enough.
  [/\bucr\b|unified registration|unified carrier registration/i, 'ucr_registration', 'confidential'],
  [/boc-?3|process agent|registered agent|agente registrado/i, 'process_agent', 'confidential'],
  [/\bmc\b.*authority|operating authority|autoridad mc/i, 'mc_authority', 'confidential'],
  [/operating agreement|statement of the organizer|escrito socios|acta de asamblea/i, 'governance_document', 'restricted'],
  [/articles of organization|articles of incorporation/i, 'articles_of_organization', 'confidential'],
  [/boleta.*inscripcion|registro publico|\brpc\b/i, 'commercial_registry', 'confidential'],
  // A lease is a commercial contract, not onboarding evidence, but it lives in the
  // same folder — classify it so it is never mistaken for a releasable document.
  [/contrato de arrendamiento|lease agreement/i, 'lease_contract', 'restricted'],
  [/acuse\s*cita|acuse de cita/i, 'appointment_receipt', 'confidential'],
];

const DEFAULT_CLASSIFICATION = Object.freeze({
  document_type: 'unclassified',
  sensitivity: 'restricted',
  requires_human_classification: true,
});

export function extensionOf(filename) {
  return String(filename ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
}

/** Identifies the container family from leading magic bytes. Reads at most 8 bytes. */
export function sniffFamily(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  for (const { family, bytes: signature } of SIGNATURES) {
    if (view.length >= signature.length && signature.every((byte, index) => view[index] === byte)) {
      return family;
    }
  }
  return null;
}

/**
 * Classifies a document by filename.
 * An unmatched name is NOT treated as harmless: it defaults to restricted and is flagged
 * for human classification, so an unrecognized file can never be released by default.
 */
export function classifyDocument(filename) {
  const name = String(filename ?? '');
  for (const [pattern, documentType, sensitivity] of CLASSIFICATION_RULES) {
    if (pattern.test(name)) {
      return Object.freeze({ document_type: documentType, sensitivity, requires_human_classification: false });
    }
  }
  return DEFAULT_CLASSIFICATION;
}

export async function sha256Hex(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rejection(filename, reason, detail = null) {
  return Object.freeze({ filename, outcome: 'rejected', reason, detail });
}

/**
 * Plans an import without performing one.
 *
 * @param files  [{ filename, bytes }]
 * @param options.existingHashes  SHA-256 values already in the vault for this entity
 * @param options.legalEntityId
 * @returns { plans, duplicates, rejections } — plans are what a transport may upload.
 */
export async function planEntityVaultImport(files = [], options = {}) {
  const existing = new Set(options.existingHashes ?? []);
  const seen = new Map();
  const plans = [];
  const duplicates = [];
  const rejections = [];

  for (const file of Array.isArray(files) ? files : []) {
    const filename = String(file?.filename ?? '').trim();
    if (!filename || /[\\/]/.test(filename) || filename === '.' || filename === '..') {
      rejections.push(rejection(filename, 'invalid_filename'));
      continue;
    }
    const bytes = file?.bytes instanceof Uint8Array ? file.bytes : null;
    if (!bytes || bytes.byteLength === 0) {
      rejections.push(rejection(filename, 'empty_file'));
      continue;
    }
    if (bytes.byteLength > MAX_FILE_SIZE) {
      rejections.push(rejection(filename, 'file_too_large', `${bytes.byteLength} bytes`));
      continue;
    }
    const extension = extensionOf(filename);
    // Ahead of every other check: refuse key material outright. Both the extension
    // and the filename are tested, because a .key renamed to .pdf is still a key.
    if ((extension && KEY_MATERIAL_EXTENSIONS.has(extension)) || KEY_MATERIAL_NAME.test(filename)) {
      rejections.push(rejection(filename, 'key_material_refused', 'cryptographic key material is never stored in the vault'));
      continue;
    }
    const expectedFamily = extension ? EXTENSION_FAMILY[extension] : null;
    if (!expectedFamily) {
      rejections.push(rejection(filename, 'unsupported_extension', extension));
      continue;
    }
    const actualFamily = sniffFamily(bytes);
    if (!actualFamily) {
      rejections.push(rejection(filename, 'unrecognized_content'));
      continue;
    }
    // A .pdf whose bytes are a ZIP is the shape of a malicious upload, not a mislabel.
    if (actualFamily !== expectedFamily) {
      rejections.push(rejection(filename, 'content_extension_mismatch', `${extension} declared, ${actualFamily} found`));
      continue;
    }

    const sha256 = await sha256Hex(bytes);
    if (existing.has(sha256)) {
      duplicates.push(Object.freeze({ filename, outcome: 'duplicate', scope: 'vault', sha256 }));
      continue;
    }
    if (seen.has(sha256)) {
      duplicates.push(Object.freeze({ filename, outcome: 'duplicate', scope: 'batch', sha256, first_seen_as: seen.get(sha256) }));
      continue;
    }
    seen.set(sha256, filename);

    const classification = classifyDocument(filename);
    plans.push(Object.freeze({
      filename,
      outcome: 'plan',
      legal_entity_id: options.legalEntityId ?? null,
      sha256,
      size_bytes: bytes.byteLength,
      mime_type: EXTENSION_MIME[extension],
      extension,
      container_family: actualFamily,
      document_type: classification.document_type,
      sensitivity: classification.sensitivity,
      requires_human_classification: classification.requires_human_classification,
      // Restricted material is never auto-released; review is queued regardless.
      queue_review: true,
      import_core_version: IMPORT_CORE_VERSION,
    }));
  }

  return Object.freeze({
    plans: Object.freeze(plans),
    duplicates: Object.freeze(duplicates),
    rejections: Object.freeze(rejections),
  });
}

/** Redacts a plan for logging: filenames and hashes are identifying, so both are dropped. */
export function summarizeForLog(plan) {
  return Object.freeze({
    document_type: plan.document_type,
    sensitivity: plan.sensitivity,
    extension: plan.extension,
    size_bytes: plan.size_bytes,
    sha256_prefix: String(plan.sha256 ?? '').slice(0, 8),
    requires_human_classification: plan.requires_human_classification,
  });
}
