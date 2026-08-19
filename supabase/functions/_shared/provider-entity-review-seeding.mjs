// Seeds the human review of a vault document.
//
// The gap this closes: documents reach the vault verified-pending, and the review
// commands (claim / decide / finalize) and fact promotion both exist — but nothing
// created the review rows they operate on, so no document could ever be reviewed.
//
// A vault document is EVIDENCE, not a fillable form: a W-9 evidences the EIN, an
// acta constitutiva evidences the formation date. So a review is seeded with the
// canonical facts that document type is expected to prove, each left unanswered.
// Values are never invented — the reviewer reads the document and records the
// value, which is exactly what §7's "nunca inventes" requires. Fourteen ontology
// fields are flagged NEVER_INFERRED (bank details, references, signatures); those
// are human-entered by construction here, since nothing is proposed at all.
import { FIELDS } from './provider-onboarding-ontology.mjs';

export const REVIEW_SEEDING_VERSION = '2026.08.19';

// The review_fields table admits a narrower sensitivity vocabulary than the
// ontology: 'public_business' is an ontology-only value and maps to 'public'.
const TABLE_SENSITIVITIES = new Set(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']);
function tableSensitivity(value) {
  const raw = String(value || '').trim();
  if (TABLE_SENSITIVITIES.has(raw)) return raw;
  if (raw === 'public_business') return 'public';
  return 'confidential';
}

/**
 * Which canonical facts each document type is expected to evidence.
 * Deliberately conservative: a document seeds only the facts it actually proves,
 * so a reviewer is never asked to read a value out of a document that cannot
 * carry it. Types absent here seed no fields and need no field review.
 */
export const DOCUMENT_FACT_MAP = Object.freeze({
  // United States
  tax_form_w9: ['legal_name', 'entity_type', 'ein', 'fiscal_address', 'signature_name', 'signature_date'],
  w9: ['legal_name', 'entity_type', 'ein', 'fiscal_address', 'signature_name', 'signature_date'],
  ein_assignment: ['legal_name', 'ein'],
  ein_assignation: ['legal_name', 'ein'],
  articles_of_organization: ['legal_name', 'entity_type', 'state_entity_id', 'formation_date'],
  governance_document: ['legal_representative', 'general_manager'],
  motor_carrier_authority: ['legal_name', 'mc_number', 'broker_authority_status'],
  mc_authority: ['legal_name', 'mc_number', 'broker_authority_status'],
  ucr_registration: ['legal_name', 'dot_number'],
  process_agent: ['legal_name', 'commercial_address'],
  bank_letter: ['bank_name', 'bank_address', 'bank_officer', 'bank_phone'],
  surety_bond: ['bond_provider', 'bond_amount'],
  // Mexico
  csf: ['legal_name', 'rfc', 'fiscal_address'],
  mx_tax_status_certificate: ['legal_name', 'rfc', 'fiscal_address'],
  rfc_registration: ['legal_name', 'rfc'],
  mx_rfc_registration_acknowledgement: ['legal_name', 'rfc'],
  cif: ['legal_name', 'rfc', 'fiscal_address'],
  acta_constitutiva: ['legal_name', 'entity_type', 'formation_date', 'legal_representative'],
  commercial_registry: ['legal_name', 'state_entity_id', 'formation_date'],
  mx_public_commerce_registry_registration: ['legal_name', 'state_entity_id', 'formation_date'],
  government_id: ['legal_representative'],
  lease_contract: ['commercial_address'],
  tax_filing: ['legal_name', 'tax_id'],
});

/** The canonical facts a document type evidences; empty when it evidences none. */
export function expectedFactsFor(documentType) {
  return DOCUMENT_FACT_MAP[String(documentType || '').trim()] || [];
}

/**
 * Plans the review for one vault asset. Returns null when the document type
 * evidences no canonical fact — seeding an empty review would give a reviewer a
 * screen with nothing to decide.
 *
 * The review row carries the ASSET's sensitivity; each field carries the
 * ontology sensitivity of that fact, so a restricted value stays withholdable in
 * the review surface even inside a merely confidential document.
 */
export function planDocumentReview(asset = {}) {
  const documentType = String(asset.document_type || '').trim();
  const codes = expectedFactsFor(documentType).filter((code) => FIELDS[code]);
  if (!codes.length) return null;

  return Object.freeze({
    review: Object.freeze({
      organization_id: asset.organization_id,
      legal_entity_id: asset.legal_entity_id,
      ingestion_id: asset.ingestion_id,
      document_asset_id: asset.id,
      review_status: 'pending',
      review_reason: 'field_review',
      sensitivity: tableSensitivity(asset.sensitivity),
      requested_by_actor_type: 'system',
      metadata: Object.freeze({
        document_type: documentType,
        seeded_by: 'review-seeding',
        seeding_version: REVIEW_SEEDING_VERSION,
        expected_fact_count: codes.length,
      }),
    }),
    fields: Object.freeze(codes.map((code) => Object.freeze({
      organization_id: asset.organization_id,
      field_code: code,
      // Never proposed: the value is read from the document by a person. A null
      // proposal keeps the reviewer honest — they must record what they see.
      proposed_value: null,
      sensitivity: tableSensitivity(FIELDS[code].sensitivity),
      field_status: 'pending',
      metadata: Object.freeze({ data_type: FIELDS[code].data_type, source_document_type: documentType }),
    }))),
  });
}
