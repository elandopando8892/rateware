// Turns "what the carrier asked for" into "what we have and what is missing".
//
// The classifier extracts a carrier's requested documents as free prose — real
// examples from a live thread: "Copia del acta constitutiva", "Opinión positiva
// expedida por el SAT", "Carátula del banco emisor de sus pagos en mxn". The vault
// holds documents under canonical types. Nothing joined the two, so an operator
// still had to read the email and check the vault by hand.
//
// Three things this must get right, all learned from the real request:
//
//   Accents. "Constancia de situación fiscal" and "situacion fiscal" are the same
//   document. Matching without normalising misses most Spanish requests.
//
//   Two vault vocabularies. Documents ingested by different runs carry different
//   type names for the same thing — 'csf' and 'mx_tax_status_certificate' both mean
//   the Constancia de Situación Fiscal. A canonical type therefore maps to a SET of
//   vault types, not one.
//
//   Unknown is not absent. A phrase this cannot map is reported as needing a human
//   mapping, never silently counted as missing — telling an operator a document is
//   missing when it is really unrecognised sends them to collect what they already
//   have.

export const DOCUMENT_REQUEST_VERSION = '2026.08.19';

/** Lowercases and strips accents so Spanish matches with or without them. */
export function normalizeRequestText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical document types a carrier can ask for, with the phrasings observed in
 * real requests. Patterns run against accent-stripped lowercase text.
 */
const REQUEST_RULES = [
  [/acta constitutiva|articles of incorporation|articles of organization/, 'acta_constitutiva'],
  [/poder notarial|poder general|carta poder|power of attorney/, 'power_of_attorney'],
  [/(?<![a-z])(ine|ife)(?![a-z])|identificacion oficial|identificacion del representante|passport|pasaporte/, 'government_id'],
  // Salzillo asks for the "opinión positiva"; the SAT itself calls the document an
  // "opinión de cumplimiento". Both name the same certificate.
  [/opinion (positiva|de cumplimiento)|32-?d|cumplimiento de obligaciones/, 'sat_compliance_opinion'],
  [/constancia de situacion fiscal|situacion fiscal|(?<![a-z])csf(?![a-z])/, 'tax_status_certificate'],
  [/comprobante de domicilio|proof of address|utility bill/, 'proof_of_address'],
  // "Carátula del banco emisor de sus pagos" is a bank cover page, same evidence as
  // a bank letter or account statement.
  [/caratula (del |de |bancaria)|banco emisor|bank letter|carta bancaria|estado de cuenta|bank statement|voided check/, 'bank_letter'],
  [/acuse de inscripcion|inscripcion al rfc|(?<![a-z])rfc(?![a-z])/, 'rfc_registration'],
  [/(?<![a-z])cif(?![a-z])|cedula de identificacion fiscal/, 'cif'],
  [/(?<![a-z])w-?9(?![a-z])/, 'w9'],
  [/(?<![a-z])ein(?![a-z])|employer identification/, 'ein_assignation'],
  [/registro publico de comercio|boleta de inscripcion|(?<![a-z])rpc(?![a-z])/, 'commercial_registry'],
  [/operating authority|autoridad mc|(?<![a-z])mc(?![a-z]).{0,20}authority/, 'mc_authority'],
  [/(?<![a-z])ucr(?![a-z])|unified carrier registration/, 'ucr_registration'],
  [/poliza|insurance certificate|certificate of insurance|constancia de seguro/, 'insurance_certificate'],
  [/fianza|surety|bmc-?84/, 'surety_bond'],
  [/acta de asamblea|escrito socios|operating agreement/, 'governance_document'],
];

/**
 * Vault type names that satisfy each canonical type.
 *
 * More than one appears per row because documents ingested by different runs were
 * classified under different vocabularies. Treating them as distinct would report a
 * document as missing while it sits in the vault.
 */
const VAULT_EQUIVALENTS = Object.freeze({
  acta_constitutiva: ['acta_constitutiva'],
  power_of_attorney: ['power_of_attorney', 'poder_notarial'],
  government_id: ['government_id'],
  sat_compliance_opinion: ['sat_compliance_opinion', 'tax_compliance_opinion'],
  tax_status_certificate: ['csf', 'mx_tax_status_certificate'],
  proof_of_address: ['proof_of_address', 'utility_bill'],
  bank_letter: ['bank_letter'],
  rfc_registration: ['rfc_registration', 'mx_rfc_registration_acknowledgement'],
  cif: ['cif'],
  w9: ['w9', 'tax_form_w9'],
  ein_assignation: ['ein_assignation', 'ein_assignment'],
  commercial_registry: ['commercial_registry', 'mx_public_commerce_registry_registration'],
  mc_authority: ['mc_authority', 'motor_carrier_authority'],
  ucr_registration: ['ucr_registration'],
  insurance_certificate: ['insurance_certificate'],
  surety_bond: ['surety_bond'],
  governance_document: ['governance_document'],
});

/** Resolves one requested phrase to a canonical document type, or declines. */
export function resolveRequestedDocument(requestedText) {
  const normalized = normalizeRequestText(requestedText);
  if (!normalized) return Object.freeze({ document_type: null, requires_human_mapping: true, reason: 'empty_request' });
  for (const [pattern, documentType] of REQUEST_RULES) {
    if (pattern.test(normalized)) {
      return Object.freeze({ document_type: documentType, requires_human_mapping: false, reason: null });
    }
  }
  // Never guessed: an unmapped phrase is a question for a person, not a gap.
  return Object.freeze({ document_type: null, requires_human_mapping: true, reason: 'no_matching_document_type' });
}

/** Vault types that would satisfy a canonical type. */
export function vaultTypesFor(documentType) {
  return VAULT_EQUIVALENTS[String(documentType || '')] || [];
}

/**
 * Compares a carrier's requested documents against what the vault holds.
 *
 * @param requested  free-text document names, as the classifier extracted them
 * @param vault      [{ document_type, document_name, verification_status }]
 * @returns { satisfied, missing, unmapped, summary }
 */
export function analyzeDocumentGaps(requested = [], vault = []) {
  const held = new Map();
  for (const row of Array.isArray(vault) ? vault : []) {
    const type = String(row?.document_type || '').trim();
    if (!type) continue;
    if (!held.has(type)) held.set(type, []);
    held.get(type).push(row);
  }

  const satisfied = [];
  const missing = [];
  const unmapped = [];
  const seen = new Set();

  for (const request of Array.isArray(requested) ? requested : []) {
    const resolution = resolveRequestedDocument(request);
    if (resolution.requires_human_mapping) {
      unmapped.push(Object.freeze({ requested: String(request), reason: resolution.reason }));
      continue;
    }
    // A carrier often names the same document twice; report it once.
    if (seen.has(resolution.document_type)) continue;
    seen.add(resolution.document_type);

    const matches = vaultTypesFor(resolution.document_type).flatMap((type) => held.get(type) || []);
    if (!matches.length) {
      missing.push(Object.freeze({ requested: String(request), document_type: resolution.document_type }));
      continue;
    }
    // Verification is reported, not required: a carrier asking for a recent document
    // still needs a human to judge whether what we hold is recent enough.
    const verified = matches.some((row) => String(row.verification_status || '') === 'verified');
    satisfied.push(Object.freeze({
      requested: String(request),
      document_type: resolution.document_type,
      held_count: matches.length,
      verified,
      document_names: Object.freeze(matches.map((row) => String(row.document_name || '')).filter(Boolean)),
    }));
  }

  return Object.freeze({
    satisfied: Object.freeze(satisfied),
    missing: Object.freeze(missing),
    unmapped: Object.freeze(unmapped),
    summary: Object.freeze({
      requested: Array.isArray(requested) ? requested.length : 0,
      satisfied: satisfied.length,
      missing: missing.length,
      unmapped: unmapped.length,
      verified: satisfied.filter((item) => item.verified).length,
    }),
    version: DOCUMENT_REQUEST_VERSION,
  });
}
