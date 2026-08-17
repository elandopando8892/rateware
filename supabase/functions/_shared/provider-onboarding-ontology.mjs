// Provider onboarding field ontology.
// Versioned, auditable mapping from raw form labels (EN/ES) to canonical field codes.
// Learned aliases must be promoted through review; nothing here mutates at runtime.

export const ONTOLOGY_VERSION = '2026.08.17';

const FIELD_DEFINITIONS = [
  ['legal_name', 'string', 'confidential', ['legal name', 'company legal name', 'full legal name', 'registered name', 'razon social', 'nombre legal', 'denominacion social']],
  ['trade_name', 'string', 'public_business', ['trade name', 'dba', 'doing business as', 'nombre comercial']],
  ['entity_type', 'enum', 'public_business', ['entity type', 'type of organization', 'business structure', 'tipo de persona', 'tipo de entidad']],
  ['tax_id', 'identifier', 'restricted', ['tax id', 'taxpayer id', 'taxpayer identification number', 'tin', 'identificacion fiscal']],
  ['ein', 'identifier', 'restricted', ['ein', 'federal tax id', 'federal ein', 'employer identification number', 'fein']],
  ['rfc', 'identifier', 'restricted', ['rfc', 'rfc federal', 'registro federal de contribuyentes', 'clave rfc']],
  ['state_entity_id', 'identifier', 'confidential', ['state entity id', 'state id number', 'state registration number', 'folio mercantil', 'registro publico de comercio']],
  ['formation_date', 'date', 'public_business', ['formation date', 'date of incorporation', 'date established', 'inception date', 'fecha de constitucion']],
  ['years_in_business', 'number', 'public_business', ['years in business', 'years of operation', 'anos de operacion', 'antiguedad']],
  ['fiscal_address', 'address', 'confidential', ['fiscal address', 'tax address', 'registered address', 'legal address', 'domicilio fiscal']],
  ['commercial_address', 'address', 'public_business', ['commercial address', 'business address', 'physical address', 'street address', 'domicilio comercial']],
  ['billing_address', 'address', 'confidential', ['billing address', 'invoice address', 'remit to address', 'domicilio de facturacion']],
  ['remittance_email', 'email', 'confidential', ['remittance email', 'remit to email', 'invoice email', 'billing email', 'correo de facturacion']],
  ['accounts_payable_contact', 'contact', 'confidential', ['accounts payable contact', 'ap contact', 'accounts payable', 'contacto de cuentas por pagar']],
  ['general_manager', 'contact', 'public_business', ['general manager', 'gm', 'managing director', 'gerente general']],
  ['legal_representative', 'contact', 'confidential', ['legal representative', 'authorized representative', 'representante legal', 'apoderado legal']],
  ['phone', 'phone', 'public_business', ['phone', 'telephone', 'phone number', 'main phone', 'office phone', 'telefono']],
  ['mobile', 'phone', 'confidential', ['mobile', 'cell', 'cell phone', 'mobile number', 'celular', 'movil']],
  ['website', 'url', 'public_business', ['website', 'web site', 'url', 'company website', 'sitio web', 'pagina web']],
  ['bank_name', 'string', 'highly_restricted', ['bank name', 'name of bank', 'financial institution', 'nombre del banco', 'institucion bancaria']],
  ['bank_address', 'address', 'highly_restricted', ['bank address', 'bank branch address', 'domicilio del banco']],
  ['bank_officer', 'contact', 'highly_restricted', ['bank officer', 'account officer', 'bank contact', 'ejecutivo bancario']],
  ['bank_phone', 'phone', 'highly_restricted', ['bank phone', 'bank telephone', 'telefono del banco']],
  ['trade_reference_1', 'reference', 'confidential', ['trade reference 1', 'trade reference #1', 'first trade reference', 'reference 1', 'referencia comercial 1']],
  ['trade_reference_2', 'reference', 'confidential', ['trade reference 2', 'trade reference #2', 'second trade reference', 'reference 2', 'referencia comercial 2']],
  ['mc_number', 'identifier', 'public_business', ['mc number', 'mc #', 'mc', 'motor carrier number', 'docket number', 'numero mc']],
  ['dot_number', 'identifier', 'public_business', ['dot number', 'usdot', 'usdot number', 'dot #', 'us dot', 'numero dot']],
  ['broker_authority_status', 'enum', 'public_business', ['broker authority status', 'authority status', 'operating authority', 'estatus de autoridad']],
  ['bond_provider', 'string', 'confidential', ['bond provider', 'surety', 'surety company', 'bmc-84 provider', 'afianzadora']],
  ['bond_amount', 'money', 'confidential', ['bond amount', 'surety bond amount', 'bond value', 'monto de fianza']],
  ['credit_requested', 'money', 'confidential', ['credit requested', 'requested credit line', 'credit line requested', 'credit limit requested', 'linea de credito solicitada']],
  ['payment_terms', 'enum', 'confidential', ['payment terms', 'terms requested', 'terms', 'credit terms', 'condiciones de pago', 'terminos de pago']],
  ['signature_name', 'string', 'restricted', ['signature name', 'authorized signer', 'printed name', 'name of signer', 'nombre del firmante']],
  ['signature_title', 'string', 'restricted', ['signature title', 'title', 'signer title', 'cargo', 'puesto del firmante']],
  ['signature_date', 'date', 'restricted', ['signature date', 'date signed', 'date', 'fecha de firma']],
];

export const FIELD_CODES = Object.freeze(FIELD_DEFINITIONS.map(([code]) => code));

export const FIELDS = Object.freeze(Object.fromEntries(FIELD_DEFINITIONS.map(
  ([code, dataType, sensitivity, aliases]) => [code, Object.freeze({
    code, data_type: dataType, sensitivity, aliases: Object.freeze([...aliases]),
  })],
)));

// Fields that must never be inferred, defaulted, or produced by the agent.
// A missing value stays pending; it is never approximated. See brief §7.
export const NEVER_INFERRED = Object.freeze([
  'bank_name', 'bank_address', 'bank_officer', 'bank_phone',
  'trade_reference_1', 'trade_reference_2', 'credit_requested', 'payment_terms',
  'bond_provider', 'bond_amount', 'years_in_business',
  'signature_name', 'signature_title', 'signature_date',
]);

const DIACRITICS = /[̀-ͯ]/g;

/** Normalizes a raw form label for alias comparison: case, accents, punctuation, noise words. */
export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[*:()\[\]]/g, ' ')
    .replace(/[^a-z0-9#/ -]/g, ' ')
    .replace(/\b(please|provide|enter|the|your|of|for|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_INDEX = new Map();
for (const [code, , , aliases] of FIELD_DEFINITIONS) {
  for (const alias of aliases) {
    const key = normalizeLabel(alias);
    if (!ALIAS_INDEX.has(key)) ALIAS_INDEX.set(key, code);
  }
  const codeKey = normalizeLabel(code.replaceAll('_', ' '));
  if (!ALIAS_INDEX.has(codeKey)) ALIAS_INDEX.set(codeKey, code);
}

/**
 * Resolves a raw form label to a canonical field code.
 * Exact alias match => confidence 1. Containment match => 0.6, review required.
 * Anything else => unmapped. Never guesses across unrelated fields.
 */
export function resolveField(rawLabel) {
  const normalized = normalizeLabel(rawLabel);
  if (!normalized) {
    return Object.freeze({ field_code: null, confidence: 0, match_kind: 'empty', requires_review: true, normalized_label: '', ontology_version: ONTOLOGY_VERSION });
  }
  const exact = ALIAS_INDEX.get(normalized);
  if (exact) {
    return Object.freeze({ field_code: exact, confidence: 1, match_kind: 'exact_alias', requires_review: false, normalized_label: normalized, ontology_version: ONTOLOGY_VERSION });
  }
  const candidates = [];
  for (const [alias, code] of ALIAS_INDEX) {
    if (alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized))) candidates.push({ alias, code });
  }
  const codes = [...new Set(candidates.map((item) => item.code))];
  if (codes.length !== 1) {
    return Object.freeze({
      field_code: null,
      confidence: 0,
      match_kind: codes.length > 1 ? 'ambiguous' : 'unmapped',
      requires_review: true,
      candidate_codes: Object.freeze(codes.sort()),
      normalized_label: normalized,
      ontology_version: ONTOLOGY_VERSION,
    });
  }
  return Object.freeze({ field_code: codes[0], confidence: 0.6, match_kind: 'contains', requires_review: true, normalized_label: normalized, ontology_version: ONTOLOGY_VERSION });
}

/** True when the field may never be produced without a reviewed canonical fact. */
export function requiresCanonicalFact(fieldCode) {
  return NEVER_INFERRED.includes(String(fieldCode ?? ''));
}

/**
 * Maps extracted form questions against canonical facts.
 * Returns one provenance record per question. Missing values stay pending —
 * this function never substitutes a default, an empty string, or a guess.
 */
export function mapExtractedFields(questions = [], facts = {}) {
  return Object.freeze((Array.isArray(questions) ? questions : []).map((question, index) => {
    const rawLabel = typeof question === 'string' ? question : question?.label;
    const resolution = resolveField(rawLabel);
    const code = resolution.field_code;
    const fact = code ? facts[code] : null;
    const hasValue = fact != null && fact.value != null && String(fact.value).trim() !== '';
    let status = 'pending';
    let reason = 'unmapped_label';
    if (code && !hasValue) reason = 'canonical_fact_missing';
    if (code && hasValue) {
      status = resolution.requires_review || requiresCanonicalFact(code) ? 'needs_review' : 'proposed';
      reason = resolution.requires_review ? 'low_confidence_mapping' : 'canonical_fact_matched';
    }
    return Object.freeze({
      index,
      original_question: String(rawLabel ?? ''),
      normalized_label: resolution.normalized_label,
      field_code: code,
      data_type: code ? FIELDS[code].data_type : null,
      sensitivity: code ? FIELDS[code].sensitivity : null,
      proposed_value: status === 'pending' ? null : fact.value,
      evidence_document_id: hasValue ? (fact.evidence_document_id ?? null) : null,
      confidence: status === 'pending' ? 0 : resolution.confidence,
      match_kind: resolution.match_kind,
      status,
      requires_review: status !== 'proposed',
      reason,
      ontology_version: ONTOLOGY_VERSION,
    });
  }));
}
