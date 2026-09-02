import type { OspClient } from '../api/osp-client';
import type { ApprovalCommunicationsWorkspace, CaseDetail, CaseFormWorkspace, CaseSummary, ClarificationReview, CorporateProfileReadModel, DocumentVersion, FormTemplateCatalog } from '../api/contracts';
import type { AuthPort, BoundSession } from '../auth/auth-port';
import { surveyJsonToCanonical } from '../features/forms/surveyjs-canonical-adapter';

const previewSession: BoundSession = Object.freeze({
  generation: 'osp-preview-synthetic-v1',
  identity: Object.freeze({
    issuer: 'https://auth.heymarksman.com',
    authorizedParty: 'synthetic-public-client',
    subject: 'preview-sales-superuser',
    organization: 'xbf-preview-organization',
    email: 'sales@heymarksman.com',
    emailVerified: true,
  }),
});

const caseId = '11111111-1111-4111-8111-111111111111';
const salzilloCaseId = '11111111-1111-4111-8111-111111111117';
const craneCaseId = '11111111-1111-4111-8111-111111111118';
const caseFormCaseId = '11111111-1111-4111-8111-111111111115';
const finalResponseCaseId = '11111111-1111-4111-8111-111111111116';
const payloadId = '22222222-2222-4222-8222-222222222222';
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const mxEntityId = '91000000-0000-4000-8000-000000000001';
const usEntityId = '91000000-0000-4000-8000-000000000002';

const previewProfileWorkspace: CaseDetail['profile_workspace'] = {
  candidates: [
    { entity_id: mxEntityId, entity_code: 'XBFMX', legal_name: 'XBF Demo Logistics, S. de R.L. de C.V.', country_code: 'MX', fact_count: '14', facts_sha256: shaA },
    { entity_id: usEntityId, entity_code: 'XBFUS', legal_name: 'XBF Demo Freight Systems LLC', country_code: 'US', fact_count: '21', facts_sha256: shaB },
  ],
  binding: null,
  draft: null,
  disclosure_locked: true,
};

const mxTaxReview = {
  review_id: '92000000-0000-4000-8000-000000000001', review_field_id: '93000000-0000-4000-8000-000000000001',
  review_revision: 1, review_status: 'pending' as const, ownership: 'available' as const, field_status: 'pending' as const,
  document_type: 'tax_status_certificate', evidence_label: 'Tax status certificate', proposed_display_value: 'General corporate regime',
  pending_field_count: '1', total_field_count: '1',
};
const usAuthorityReview = {
  review_id: '92000000-0000-4000-8000-000000000002', review_field_id: '93000000-0000-4000-8000-000000000002',
  review_revision: 3, review_status: 'in_review' as const, ownership: 'owned' as const, field_status: 'pending' as const,
  document_type: 'motor_carrier_authority', evidence_label: 'Motor carrier authority', proposed_display_value: 'Authority on file',
  pending_field_count: '1', total_field_count: '1',
};
const usBankReview = {
  review_id: '92000000-0000-4000-8000-000000000003', review_field_id: '93000000-0000-4000-8000-000000000003',
  review_revision: 2, review_status: 'in_review' as const, ownership: 'locked' as const, field_status: 'pending' as const,
  document_type: 'bank_letter', evidence_label: 'Bank letter', proposed_display_value: 'Withheld',
  pending_field_count: '1', total_field_count: '1',
};

const previewCorporateProfile: CorporateProfileReadModel = {
  disclosure_locked: true,
  entities: [
    {
      entity_id: '91000000-0000-4000-8000-000000000001', entity_code: 'XBFMX', legal_name: 'XBF Demo Logistics, S. de R.L. de C.V.',
      country_code: 'MX', default_currency: 'MXN', status: 'active', verified_fields: '4', review_fields: '1', total_fields: '5',
      fields: [
        { code: 'tax_identifier', label: 'Tax identifier', display_value: 'On file', verification_status: 'verified', sensitivity: 'restricted', support_status: 'verified_match', evidence_candidate_count: '2', reviewed_candidate_count: '2', review_candidates: [] },
        { code: 'tax_regime', label: 'Tax regime', display_value: 'General corporate regime', verification_status: 'verified', sensitivity: 'confidential', support_status: 'evidence_available', evidence_candidate_count: '1', reviewed_candidate_count: '0', review_candidates: [mxTaxReview] },
        { code: 'registered_address', label: 'Registered address', display_value: 'Querétaro, Querétaro · 76000', verification_status: 'verified', sensitivity: 'confidential', support_status: 'verified_match', evidence_candidate_count: '2', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'legal_representative', label: 'Legal representative', display_value: 'On file', verification_status: 'verified', sensitivity: 'restricted', support_status: 'conflict', evidence_candidate_count: '2', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'business_phone', label: 'Business phone', display_value: 'On file', verification_status: 'needs_review', sensitivity: 'restricted', support_status: 'unsupported', evidence_candidate_count: '0', reviewed_candidate_count: '0', review_candidates: [] },
      ],
      promotion_candidates: [],
      evidence: [
        { name: 'Tax status certificate', document_type: 'tax_certificate', verification_status: 'verified', sensitivity: 'restricted', release_policy: 'approval_required', expiry_state: 'current' },
        { name: 'Legal representative authority', document_type: 'legal_representative_authority', verification_status: 'needs_review', sensitivity: 'highly_restricted', release_policy: 'approval_required', expiry_state: 'no_expiry' },
      ],
    },
    {
      entity_id: '91000000-0000-4000-8000-000000000002', entity_code: 'XBFUS', legal_name: 'XBF Demo Freight Systems LLC',
      country_code: 'US', default_currency: 'USD', status: 'active', verified_fields: '6', review_fields: '2', total_fields: '8',
      fields: [
        { code: 'tax_identifier', label: 'Federal tax ID', display_value: 'On file', verification_status: 'verified', sensitivity: 'restricted', support_status: 'verified_match', evidence_candidate_count: '1', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'mc_number', label: 'MC authority', display_value: 'On file', verification_status: 'verified', sensitivity: 'internal', support_status: 'evidence_available', evidence_candidate_count: '1', reviewed_candidate_count: '0', review_candidates: [usAuthorityReview] },
        { code: 'usdot_number', label: 'USDOT', display_value: 'On file', verification_status: 'verified', sensitivity: 'internal', support_status: 'unsupported', evidence_candidate_count: '0', reviewed_candidate_count: '0', review_candidates: [] },
        { code: 'registered_address', label: 'Registered address', display_value: 'Austin, Texas · 78701', verification_status: 'verified', sensitivity: 'confidential', support_status: 'verified_match', evidence_candidate_count: '2', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'commercial_address', label: 'Commercial address', display_value: 'San Antonio, Texas · 78205', verification_status: 'verified', sensitivity: 'confidential', support_status: 'conflict', evidence_candidate_count: '2', reviewed_candidate_count: '1', review_candidates: [] },
        { code: 'website', label: 'Website', display_value: 'xbf.example', verification_status: 'verified', sensitivity: 'internal', support_status: 'unsupported', evidence_candidate_count: '0', reviewed_candidate_count: '0', review_candidates: [] },
        { code: 'requested_credit_amount', label: 'Credit requested', display_value: '$25,000 USD', verification_status: 'needs_review', sensitivity: 'confidential', support_status: 'unsupported', evidence_candidate_count: '0', reviewed_candidate_count: '0', review_candidates: [] },
        { code: 'bank_name', label: 'Bank reference', display_value: 'Withheld', verification_status: 'needs_review', sensitivity: 'restricted', support_status: 'evidence_available', evidence_candidate_count: '1', reviewed_candidate_count: '0', review_candidates: [usBankReview] },
      ],
      promotion_candidates: [{
        review_id: '92000000-0000-4000-8000-000000000004', review_revision: 6,
        document_type: 'formation_document', evidence_label: 'Formation document',
        candidate_sha256: '9'.repeat(64), candidate_count: '3', change_count: '2',
        unchanged_count: '1', withheld_count: '1', promotion_status: 'ready',
        expected_current_fact_ids: {
          entity_type: null,
          business_start_year: '94000000-0000-4000-8000-000000000001',
          affiliated_company: null,
        },
      }],
      evidence: [
        { name: 'W-9', document_type: 'w9', verification_status: 'needs_review', sensitivity: 'restricted', release_policy: 'approval_required', expiry_state: 'no_expiry' },
        { name: 'Broker authority', document_type: 'operating_authority', verification_status: 'verified', sensitivity: 'restricted', release_policy: 'approval_required', expiry_state: 'current' },
        { name: 'Signature specimen', document_type: 'authorized_signature', verification_status: 'needs_review', sensitivity: 'highly_restricted', release_policy: 'approval_required', expiry_state: 'no_expiry' },
      ],
    },
  ],
};

const previewRequestManifest: NonNullable<CaseDetail['request_manifest']> = Object.freeze<NonNullable<CaseDetail['request_manifest']>>({
  schemaVersion: 1,
  status: 'review_required',
  modelVersion: 'openai-structured-preview',
  sourceCount: 7,
  sourceCoverage: { email: 1, xlsx: 1, xlsm: 0, pdf: 3, docx: 1, image: 1 },
  spreadsheetProtection: { macroEnabledFiles: 0, macroExecution: 'blocked', analysisMode: 'not_required' },
  generatedAt: '2026-08-26T18:02:00.000Z',
  requestType: 'customer_setup',
  language: 'en',
  targetXbfEntity: 'XBFUS',
  requesterLegalName: 'Northstar Components',
  dueDate: '2026-09-08',
  forms: [
    { name: 'Supplier registration workbook.xlsx', format: 'xlsx', action: 'complete', required: true, evidenceIds: ['email:body', 'xlsx:registration:A1'] },
    { name: 'Bank reference authorization.docx', format: 'docx', action: 'sign', required: true, evidenceIds: ['docx:bank-reference:p1'] },
  ],
  requestedFields: [
    { id: 'business.legalName', sourceLabel: 'Legal business name', canonicalFieldId: 'business.legalName', valueType: 'text', required: true, evidenceIds: ['xlsx:registration:B6'] },
    { id: 'fiscal.taxIdentifier', sourceLabel: 'Federal Tax ID', canonicalFieldId: 'fiscal.taxIdentifier', valueType: 'text', required: true, evidenceIds: ['xlsx:registration:B7'] },
    { id: 'business.address', sourceLabel: 'Billing address', canonicalFieldId: 'business.commercialAddress', valueType: 'text', required: true, evidenceIds: ['xlsx:registration:B9'] },
    { id: 'credit.amount', sourceLabel: 'Amount of credit requested', canonicalFieldId: 'credit.requestedAmount', valueType: 'number', required: true, evidenceIds: ['xlsx:credit:C18'] },
    { id: 'credit.terms', sourceLabel: 'Payment terms', canonicalFieldId: 'credit.netDays', valueType: 'number', required: true, evidenceIds: ['xlsx:credit:C19'] },
    { id: 'trade.references', sourceLabel: 'Three trade references', canonicalFieldId: null, valueType: 'table', required: true, evidenceIds: ['xlsx:references:A23:F27'] },
    { id: 'signature.authorized', sourceLabel: 'Authorized signature', canonicalFieldId: 'signature.authorizedRepresentative', valueType: 'signature', required: true, evidenceIds: ['docx:bank-reference:p1'] },
  ],
  requestedDocuments: [
    { documentType: 'W-9', required: true, acceptableAlternatives: [], evidenceIds: ['email:body', 'xlsx:documents:A31'] },
    { documentType: 'Broker authority', required: true, acceptableAlternatives: ['Operating authority'], evidenceIds: ['xlsx:documents:A32'] },
    { documentType: 'Surety bond', required: true, acceptableAlternatives: ['Bond certificate'], evidenceIds: ['xlsx:documents:A33'] },
    { documentType: 'Bank letter', required: false, acceptableAlternatives: ['Voided check'], evidenceIds: ['docx:bank-reference:p2'] },
  ],
  signature: { required: true, signerTitle: 'Managing Director', evidenceIds: ['docx:bank-reference:p1'] },
  submission: { method: 'reply_email', recipients: ['onboarding@northstar.example'], instructions: 'Reply to the original thread with the completed forms and requested support.', evidenceIds: ['email:body'] },
  requirements: [
    { id: 'retain_format', text: 'Return the registration workbook without changing its layout.', evidenceIds: ['email:body'] },
    { id: 'signed_package', text: 'The authorization page must be signed by an authorized representative.', evidenceIds: ['docx:bank-reference:p1'] },
  ],
  contradictions: [],
  missingInformation: [
    { fieldId: 'trade.references.3', description: 'A third trade reference is requested but only two verified references are available.', evidenceIds: ['xlsx:references:A23:F27'] },
  ],
  clarificationQuestions: [
    { fieldId: 'trade.references.3', question: 'Provide or approve a third trade reference for this request.', evidenceIds: ['xlsx:references:A23:F27'] },
  ],
  readiness: { status: 'needs_clarification', reasonCodes: ['third_trade_reference_missing'] },
  aiGenerated: true,
  externalEffects: false,
});

const salzilloRequestManifest: NonNullable<CaseDetail['request_manifest']> = Object.freeze<NonNullable<CaseDetail['request_manifest']>>({
  schemaVersion: 1,
  status: 'review_required',
  modelVersion: 'openai-structured-preview',
  sourceCount: 2,
  sourceCoverage: { email: 1, xlsx: 0, xlsm: 1, pdf: 0, docx: 0, image: 0 },
  spreadsheetProtection: { macroEnabledFiles: 1, macroExecution: 'blocked', analysisMode: 'sanitized_copy' },
  generatedAt: '2026-08-31T23:40:00.000Z',
  requestType: 'customer_setup',
  language: 'es',
  targetXbfEntity: 'unknown',
  requesterLegalName: null,
  dueDate: null,
  forms: [{
    name: 'Copia de Formato 3.3 Alta Cliente.xlsm',
    format: 'xlsm',
    action: 'complete',
    required: true,
    evidenceIds: ['email:salzillo', 'xlsx:alta-cliente:workbook'],
  }],
  requestedFields: [],
  requestedDocuments: [],
  signature: { required: true, signerTitle: 'Representante legal', evidenceIds: ['email:salzillo'] },
  submission: { method: 'reply_email', recipients: [], instructions: 'Return the completed workbook in the original thread.', evidenceIds: ['email:salzillo'] },
  requirements: [
    { id: 'complete_both_pages', text: 'Complete both pages of the customer registration workbook in full.', evidenceIds: ['email:salzillo'] },
    { id: 'handwritten_signature', text: 'The legal representative must provide a handwritten signature.', evidenceIds: ['email:salzillo'] },
    { id: 'preserve_original', text: 'Preserve the original macro-enabled workbook as immutable source evidence.', evidenceIds: ['xlsx:alta-cliente:workbook'] },
  ],
  contradictions: [],
  missingInformation: [
    { fieldId: 'targetXbfEntity', description: 'The request does not identify which XBF legal entity must be registered.', evidenceIds: ['email:salzillo'] },
  ],
  clarificationQuestions: [
    { fieldId: 'targetXbfEntity', question: 'Should this registration use XBF Mexico or XBF US?', evidenceIds: ['email:salzillo'] },
  ],
  readiness: { status: 'needs_clarification', reasonCodes: ['target_entity_unresolved'] },
  aiGenerated: true,
  externalEffects: false,
});

const craneRequestManifest: NonNullable<CaseDetail['request_manifest']> = Object.freeze<NonNullable<CaseDetail['request_manifest']>>({
  schemaVersion: 1,
  status: 'review_required',
  modelVersion: 'openai-structured-preview',
  sourceCount: 3,
  sourceCoverage: { email: 1, xlsx: 0, xlsm: 0, pdf: 1, docx: 1, image: 0 },
  spreadsheetProtection: { macroEnabledFiles: 0, macroExecution: 'blocked', analysisMode: 'not_required' },
  generatedAt: '2026-09-01T09:30:00.000Z',
  requestType: 'customer_setup',
  language: 'en',
  targetXbfEntity: 'unknown',
  requesterLegalName: 'Crane Worldwide Logistics',
  dueDate: null,
  forms: [
    { name: 'CWW-QF-147 Supplier Registration.pdf', format: 'pdf', action: 'complete', required: true, evidenceIds: ['pdf:cww-qf-147:p1'] },
    { name: 'Supplier Credit Reference.docx', format: 'docx', action: 'complete', required: true, evidenceIds: ['docx:credit-reference:p1'] },
  ],
  requestedFields: [
    { id: 'business.legalName', sourceLabel: 'Legal company name', canonicalFieldId: 'business.legalName', valueType: 'text', required: true, evidenceIds: ['pdf:cww-qf-147:p1'] },
    { id: 'business.address', sourceLabel: 'Registered address', canonicalFieldId: 'business.registeredAddress', valueType: 'text', required: true, evidenceIds: ['pdf:cww-qf-147:p1'] },
    { id: 'fiscal.taxIdentifier', sourceLabel: 'Tax identification number', canonicalFieldId: 'fiscal.taxIdentifier', valueType: 'text', required: true, evidenceIds: ['pdf:cww-qf-147:p1'] },
    { id: 'business.tradeReferences', sourceLabel: 'Trade references', canonicalFieldId: 'business.tradeReferences', valueType: 'table', required: true, evidenceIds: ['docx:credit-reference:p1'] },
    { id: 'signature.authorized', sourceLabel: 'Authorized signature', canonicalFieldId: 'signature.authorizedRepresentative', valueType: 'signature', required: true, evidenceIds: ['pdf:cww-qf-147:p2'] },
    { id: 'submission.recipient', sourceLabel: 'Return instructions', canonicalFieldId: null, valueType: 'text', required: true, evidenceIds: ['email:body', 'pdf:cww-qf-147:p2'] },
  ],
  requestedDocuments: [
    { documentType: 'Tax form', required: true, acceptableAlternatives: ['W-9', 'Tax status certificate'], evidenceIds: ['pdf:cww-qf-147:p2'] },
    { documentType: 'Operating authority', required: false, acceptableAlternatives: ['Broker authority'], evidenceIds: ['docx:credit-reference:p2'] },
  ],
  signature: { required: true, signerTitle: null, evidenceIds: ['pdf:cww-qf-147:p2'] },
  submission: { method: 'unknown', recipients: [], instructions: null, evidenceIds: ['email:body'] },
  requirements: [
    { id: 'complete_pdf', text: 'Complete the supplier registration PDF without changing its layout.', evidenceIds: ['pdf:cww-qf-147:p1'] },
    { id: 'complete_credit_reference', text: 'Complete the attached credit reference document.', evidenceIds: ['docx:credit-reference:p1'] },
  ],
  contradictions: [
    { text: 'The effective-date language differs between the PDF and DOCX package.', evidenceIds: ['pdf:cww-qf-147:p2', 'docx:credit-reference:p2'] },
  ],
  missingInformation: [
    { fieldId: 'targetXbfEntity', description: 'The request does not identify whether Crane is registering XBF Mexico or XBF US.', evidenceIds: ['email:body'] },
    { fieldId: 'submission.recipient', description: 'The package does not provide an unambiguous return address or portal instruction.', evidenceIds: ['email:body', 'pdf:cww-qf-147:p2'] },
    { fieldId: 'signature.signerTitle', description: 'A signature is required, but the required signer authority is not stated.', evidenceIds: ['pdf:cww-qf-147:p2'] },
  ],
  clarificationQuestions: [
    { fieldId: 'targetXbfEntity', question: 'Should this Crane registration use XBF Mexico or XBF US?', evidenceIds: ['email:body'] },
    { fieldId: 'submission.recipient', question: 'Where should the completed package be returned?', evidenceIds: ['email:body', 'pdf:cww-qf-147:p2'] },
  ],
  readiness: { status: 'needs_clarification', reasonCodes: ['target_entity_unresolved', 'submission_instructions_unclear', 'signature_authority_unclear', 'date_contradiction'] },
  aiGenerated: true,
  externalEffects: false,
});

const salzilloRequestReview: NonNullable<CaseDetail['request_review']> = Object.freeze({
  manifestId: '98000000-0000-4000-8000-000000000001', manifestVersion: 1, manifestSha256: '1'.repeat(64), review: null,
});
const previewRequestReview: NonNullable<CaseDetail['request_review']> = Object.freeze({
  manifestId: '98000000-0000-4000-8000-000000000002', manifestVersion: 1, manifestSha256: '2'.repeat(64),
  review: {
    reviewId: '98100000-0000-4000-8000-000000000002',
    reviewVersion: 1,
    status: 'resolved' as const,
    decisions: [{
      decisionId: 'clarification:0',
      kind: 'clarification' as const,
      fieldId: 'trade.references.3',
      prompt: 'Provide or approve a third trade reference for this request.',
      evidenceIds: ['xlsx:references:A23:F27'],
      outcome: 'answered' as const,
      resolution: 'Use the third approved trade reference held by XBF.',
    }],
    canonicalSha256: '4'.repeat(64),
  },
});
const craneRequestReview: NonNullable<CaseDetail['request_review']> = Object.freeze({
  manifestId: '98000000-0000-4000-8000-000000000003', manifestVersion: 1, manifestSha256: '3'.repeat(64), review: null,
});

function previewDecisionSeeds(manifest: NonNullable<CaseDetail['request_manifest']>) {
  const clarified = new Set(manifest.clarificationQuestions.map((item) => item.fieldId));
  return [
    ...manifest.clarificationQuestions.map((item, index) => ({ decisionId: `clarification:${index}`, kind: 'clarification' as const, fieldId: item.fieldId, prompt: item.question, evidenceIds: item.evidenceIds })),
    ...manifest.contradictions.map((item, index) => ({ decisionId: `contradiction:${index}`, kind: 'contradiction' as const, fieldId: null, prompt: item.text, evidenceIds: item.evidenceIds })),
    ...manifest.missingInformation.map((item, index) => ({ item, index })).filter(({ item }) => !clarified.has(item.fieldId)).map(({ item, index }) => ({ decisionId: `missing:${index}`, kind: 'missing' as const, fieldId: item.fieldId, prompt: item.description, evidenceIds: item.evidenceIds })),
  ];
}

const previewCases: readonly CaseSummary[] = Object.freeze([
  {
    case_id: salzilloCaseId, supplier_name: 'Grupo Salzillo', state: 'analyzing_requirements', aggregate_version: 1,
    blocked_by_duplicate_review: false, created_at: '2026-08-10T15:00:00.000Z', updated_at: '2026-08-31T23:40:00.000Z',
    message_count: '1', attachment_count: '1', document_count: '1',
  },
  {
    case_id: caseId, supplier_name: 'Northstar Components', state: 'ready_to_send', aggregate_version: 12,
    blocked_by_duplicate_review: false, created_at: '2026-08-22T14:30:00.000Z', updated_at: '2026-08-26T18:20:00.000Z',
    message_count: '4', attachment_count: '8', document_count: '8',
  },
  {
    case_id: '11111111-1111-4111-8111-111111111112', supplier_name: 'Altura Industrial', state: 'operations_review', aggregate_version: 6,
    blocked_by_duplicate_review: false, created_at: '2026-08-24T16:15:00.000Z', updated_at: '2026-08-26T16:40:00.000Z',
    message_count: '2', attachment_count: '5', document_count: '4',
  },
  {
    case_id: '11111111-1111-4111-8111-111111111113', supplier_name: 'Lumen Packaging', state: 'awaiting_clarification', aggregate_version: 3,
    blocked_by_duplicate_review: false, created_at: '2026-08-25T15:05:00.000Z', updated_at: '2026-08-26T15:15:00.000Z',
    message_count: '3', attachment_count: '2', document_count: '1',
  },
  {
    case_id: '11111111-1111-4111-8111-111111111114', supplier_name: 'Meridian Freight Systems', state: 'received', aggregate_version: 1,
    blocked_by_duplicate_review: false, created_at: '2026-08-26T14:05:00.000Z', updated_at: '2026-08-26T14:05:00.000Z',
    message_count: '1', attachment_count: '3', document_count: '0',
  },
  {
    case_id: caseFormCaseId, supplier_name: 'Sierra Retail México', state: 'preparing', aggregate_version: 4,
    blocked_by_duplicate_review: false, created_at: '2026-08-25T19:30:00.000Z', updated_at: '2026-08-26T20:10:00.000Z',
    message_count: '2', attachment_count: '4', document_count: '3',
  },
  {
    case_id: finalResponseCaseId, supplier_name: 'Cumbre Manufacturing', state: 'sales_authorization', aggregate_version: 11,
    blocked_by_duplicate_review: false, created_at: '2026-08-26T12:10:00.000Z', updated_at: '2026-08-26T21:05:00.000Z',
    message_count: '3', attachment_count: '6', document_count: '6',
  },
  {
    case_id: craneCaseId, supplier_name: 'Crane canary · CWW-QF-147', state: 'awaiting_clarification', aggregate_version: 2,
    blocked_by_duplicate_review: false, created_at: '2026-09-01T09:20:00.000Z', updated_at: '2026-09-01T09:30:00.000Z',
    message_count: '1', attachment_count: '2', document_count: '2',
  },
]);

const salzilloCaseDetail: CaseDetail = Object.freeze<CaseDetail>({
  ...previewCases[0],
  latest_request: {
    subject: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN',
    sender_domain: 'example.test',
    received_at: '2026-08-10T15:00:00.000Z',
  },
  recent_events: [
    { sequence: 2, state: 'analyzing_requirements' as const, occurred_at: '2026-08-31T23:40:00.000Z', reason_code: 'historical_preview_analysis' },
    { sequence: 1, state: 'received' as const, occurred_at: '2026-08-10T15:00:00.000Z', reason_code: 'historical_request_identified' },
  ],
  request_manifest: salzilloRequestManifest,
  request_review: salzilloRequestReview,
  historical_intake: {
    status: 'preview_only',
    query: 'in:anywhere subject:"PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN" after:2026/08/18 before:2026/08/21',
    after_date: '2026-08-18',
    before_date: '2026-08-21',
    candidate_count: 1,
    duplicate_state: 'already_imported',
    checkpoint_unchanged: true,
    source_preserved: true,
    external_effects: false,
  },
  profile_workspace: previewProfileWorkspace,
});

const previewCaseDetail: CaseDetail = Object.freeze<CaseDetail>({
  ...previewCases[1],
  latest_request: {
    subject: 'Customer setup package and compliance questionnaire',
    sender_domain: 'northstar.example',
    received_at: '2026-08-26T17:55:00.000Z',
  },
  recent_events: [
    { sequence: 12, state: 'ready_to_send' as const, occurred_at: '2026-08-26T18:20:00.000Z', reason_code: 'sales_authorized' },
    { sequence: 11, state: 'sales_authorization' as const, occurred_at: '2026-08-26T17:40:00.000Z', reason_code: 'signature_applied' },
    { sequence: 10, state: 'signature_approval' as const, occurred_at: '2026-08-26T16:25:00.000Z', reason_code: 'operations_review_completed' },
    { sequence: 1, state: 'received' as const, occurred_at: '2026-08-22T14:30:00.000Z', reason_code: 'case_received' },
  ],
  request_manifest: previewRequestManifest,
  request_review: previewRequestReview,
  profile_workspace: previewProfileWorkspace,
});

const craneCaseDetail: CaseDetail = Object.freeze<CaseDetail>({
  ...previewCases[7]!,
  latest_request: {
    subject: 'Supplier registration package CWW-QF-147 — synthetic canary',
    sender_domain: 'example.test',
    received_at: '2026-09-01T09:20:00.000Z',
  },
  recent_events: [
    { sequence: 2, state: 'awaiting_clarification' as const, occurred_at: '2026-09-01T09:30:00.000Z', reason_code: 'adaptive_review_required' },
    { sequence: 1, state: 'received' as const, occurred_at: '2026-09-01T09:20:00.000Z', reason_code: 'pdf_docx_canary_received' },
  ],
  request_manifest: craneRequestManifest,
  request_review: craneRequestReview,
  profile_workspace: previewProfileWorkspace,
});

const previewDocuments: readonly DocumentVersion[] = Object.freeze([
  { id: '30000000-0000-4000-8000-000000000001', documentType: 'proof_of_address', version: 3, status: 'approved', validFrom: '2026-08-01', expiresAt: '2026-10-30' },
  { id: '30000000-0000-4000-8000-000000000002', documentType: 'sat_compliance_opinion', version: 2, status: 'review_required', validFrom: '2026-08-15', expiresAt: '2026-11-13' },
  { id: '30000000-0000-4000-8000-000000000003', documentType: 'tax_status_certificate', version: 4, status: 'approved', validFrom: '2026-07-15', expiresAt: '2026-10-13' },
]);

const previewClarification: ClarificationReview = {
  id: '40000000-0000-4000-8000-000000000001',
  caseId,
  caseVersion: 7,
  version: 1,
  status: 'operations_review_required',
  questions: [
    { kind: 'missing', fieldId: 'banking.accountNumber', question: 'Confirm the beneficiary account shown in the attached statement.', evidenceIds: ['bank-statement:page-1'] },
    { kind: 'contradiction', fieldId: 'supplier.address', question: 'Confirm which registered address should be used for this onboarding.', evidenceIds: ['tax-certificate:page-1', 'proof-of-address:page-1'] },
  ],
  evidenceIds: ['bank-statement:page-1', 'tax-certificate:page-1', 'proof-of-address:page-1'],
  canonicalSha256: shaA,
  authorizationMailbox: 'sales@heymarksman.com',
};

const previewWorkspace: ApprovalCommunicationsWorkspace = {
  caseId,
  caseVersion: 12,
  caseState: 'ready_to_send',
  inputSnapshot: { sha256: shaA, documentCount: 8, extractionCount: 42, reviewDecisionCount: 11, formInstanceVersion: 3 },
  supplierPackage: null,
  signedPackage: { packageId: '56000000-0000-4000-8000-000000000009', outputSha256: shaB, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  replyContext: null,
  signature: { positionVersion: 2, approvalStatus: 'approved', approvalId: '50000000-0000-4000-8000-000000000001', outputSha256: shaB },
  outbound: {
    payloadId,
    kind: 'final_response',
    status: 'authorized',
    caseVersion: 12,
    from: 'carriers@xbfreight.com',
    to: ['procurement@example.test'],
    cc: ['operations@example.test'],
    subject: 'XBF supplier onboarding package — synthetic preview',
    inReplyTo: null,
    references: [],
    bodyText: 'Synthetic preview only. The reviewed onboarding package is ready for controlled delivery.',
    attachmentSha256: [shaB],
    mimeSha256: shaA,
    salesAuthorizationId: '50000000-0000-4000-8000-000000000002',
    sendOutcome: null,
  },
  capabilities: {
    completeOperationsReview: false,
    approveAndApplySignature: false,
    saveOutboundDraft: false,
    freezeOutboundPayload: false,
    authorizeOutboundPayload: false,
    requestAuthorizedSend: false,
  },
};

const previewOperationsWorkspace: ApprovalCommunicationsWorkspace = {
  caseId: previewCases[2].case_id,
  caseVersion: previewCases[2].aggregate_version,
  caseState: 'operations_review',
  inputSnapshot: { sha256: shaB, documentCount: 4, extractionCount: 16, reviewDecisionCount: 5, formInstanceVersion: 2 },
  supplierPackage: {
    packageId: '56000000-0000-4000-8000-000000000001', version: 1,
    outputSha256: shaA,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    downloadUrl: null,
  },
  signedPackage: null,
  replyContext: null,
  signature: null,
  outbound: null,
  capabilities: {
    completeOperationsReview: true,
    approveAndApplySignature: false,
    saveOutboundDraft: false,
    freezeOutboundPayload: false,
    authorizeOutboundPayload: false,
    requestAuthorizedSend: false,
  },
};

const previewFinalResponseWorkspace: ApprovalCommunicationsWorkspace = {
  caseId: finalResponseCaseId,
  caseVersion: 11,
  caseState: 'sales_authorization',
  inputSnapshot: { sha256: shaA, documentCount: 6, extractionCount: 31, reviewDecisionCount: 9, formInstanceVersion: 2 },
  supplierPackage: null,
  signedPackage: { packageId: '56000000-0000-4000-8000-000000000010', outputSha256: shaB, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  replyContext: {
    to: ['requester@example.test'],
    cc: ['sales@heymarksman.com'],
    subject: 'Re: Supplier registration request | synthetic preview',
    inReplyTo: '<osp-preview-request@example.test>',
    references: ['<osp-preview-request@example.test>'],
  },
  signature: { positionVersion: 2, approvalStatus: 'approved', approvalId: '50000000-0000-4000-8000-000000000010', outputSha256: shaB },
  outbound: null,
  capabilities: {
    completeOperationsReview: false,
    approveAndApplySignature: false,
    saveOutboundDraft: true,
    freezeOutboundPayload: false,
    authorizeOutboundPayload: false,
    requestAuthorizedSend: false,
  },
};

function createPreviewAuthPort(): AuthPort {
  let current: BoundSession | null = previewSession;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return Object.freeze({
    initialize: async () => current,
    revalidate: async () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    getCurrentSession: () => current,
    async login() { current = previewSession; notify(); },
    async logout() { current = null; notify(); },
    async getAccessToken(expected: BoundSession) {
      if (current !== expected) throw new Error('Preview session changed');
      return 'synthetic-preview-token';
    },
  });
}

function createPreviewClient(): OspClient {
  let previewCaseRows = previewCases.map((caseRecord) => structuredClone(caseRecord));
  const profileWorkspaces = new Map<string, CaseDetail['profile_workspace']>(previewCaseRows.map((caseRecord) => [caseRecord.case_id, structuredClone(previewProfileWorkspace)]));
  const requestManifests = new Map<string, NonNullable<CaseDetail['request_manifest']>>([
    [salzilloCaseId, structuredClone(salzilloRequestManifest)], [caseId, structuredClone(previewRequestManifest)], [craneCaseId, structuredClone(craneRequestManifest)],
  ]);
  const requestReviews = new Map<string, NonNullable<CaseDetail['request_review']>>([
    [salzilloCaseId, structuredClone(salzilloRequestReview)], [caseId, structuredClone(previewRequestReview)], [craneCaseId, structuredClone(craneRequestReview)],
  ]);
  const reusableKnowledge = new Map<string, {
    canonicalKey: string;
    displayLabel: string;
    aliases: readonly string[];
    version: number;
    sourceCaseId: string;
  }>([
    ['field:supplier.legalname', { canonicalKey: 'supplier.legalname', displayLabel: 'Legal business name', aliases: ['Legal name', 'Company legal name'], version: 1, sourceCaseId: caseId }],
    ['field:fiscal.taxidentifier', { canonicalKey: 'fiscal.taxidentifier', displayLabel: 'Federal tax identifier', aliases: ['Federal tax ID', 'Tax ID'], version: 1, sourceCaseId: caseId }],
    ['document:w.9', { canonicalKey: 'w.9', displayLabel: 'W-9 / tax form', aliases: ['W-9', 'Tax form'], version: 2, sourceCaseId: salzilloCaseId }],
    ['document:bank.reference.letter', { canonicalKey: 'bank.reference.letter', displayLabel: 'Bank reference letter', aliases: ['Bank letter', 'Bank reference'], version: 1, sourceCaseId: salzilloCaseId }],
  ]);
  const knowledgePromotions = new Map<string, number>();
  const knowledgeKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 128);
  const knowledgeWorkspace = (requestedCaseId: string) => {
    const manifest = requestManifests.get(requestedCaseId);
    const envelope = requestReviews.get(requestedCaseId);
    if (!manifest || !envelope?.review || envelope.review.status !== 'resolved') throw new Error('REQUEST_KNOWLEDGE_REVIEW_NOT_FOUND');
    const candidates = [
      ...manifest.requestedFields.map((field) => ({
        kind: 'field' as const,
        canonicalKey: knowledgeKey(field.canonicalFieldId ?? field.id),
        displayLabel: field.sourceLabel,
        aliases: [field.sourceLabel],
        valueType: field.valueType,
        required: field.required,
        evidenceCount: field.evidenceIds.length,
      })),
      ...manifest.requestedDocuments.map((document) => ({
        kind: 'document' as const,
        canonicalKey: knowledgeKey(document.documentType),
        displayLabel: document.documentType,
        aliases: [document.documentType, ...document.acceptableAlternatives],
        valueType: null,
        required: document.required,
        evidenceCount: document.evidenceIds.length,
      })),
    ].filter((candidate, index, all) => candidate.canonicalKey.length > 0 && all.findIndex((item) => item.kind === candidate.kind && item.canonicalKey === candidate.canonicalKey) === index)
      .sort((left, right) => `${left.kind}:${left.canonicalKey}`.localeCompare(`${right.kind}:${right.canonicalKey}`))
      .map((candidate) => {
        const exact = reusableKnowledge.get(`${candidate.kind}:${candidate.canonicalKey}`);
        const aliasMatches = exact ? [] : [...reusableKnowledge.entries()]
          .filter(([key, entry]) => key.startsWith(`${candidate.kind}:`) && entry.aliases.some((alias) => alias.localeCompare(candidate.displayLabel, undefined, { sensitivity: 'accent' }) === 0))
          .map(([, entry]) => entry);
        const matched = exact ?? (aliasMatches.length === 1 ? aliasMatches[0] : null);
        const catalogMatch = exact ? 'exact' as const : aliasMatches.length === 1 ? 'alias' as const : aliasMatches.length > 1 ? 'ambiguous' as const : 'none' as const;
        return {
          ...candidate,
          catalogState: matched ? 'known' as const : 'new' as const,
          catalogMatch,
          matchedCanonicalKey: matched?.canonicalKey ?? null,
          matchedDisplayLabel: matched?.displayLabel ?? null,
          catalogVersion: matched?.version ?? null,
          sourceCaseId: matched?.sourceCaseId ?? null,
        };
      });
    return {
      caseId: requestedCaseId,
      manifestId: envelope.manifestId,
      reviewId: envelope.review.reviewId,
      reviewVersion: envelope.review.reviewVersion,
      candidateSha256: shaA,
      candidates,
      catalogEntryCount: reusableKnowledge.size,
      priorPromotionCount: knowledgePromotions.get(envelope.review.reviewId) ?? 0,
      externalEffects: false as const,
    };
  };
  let corporateProfile = structuredClone(previewCorporateProfile);
  const reviewCandidates = () => corporateProfile.entities.flatMap((entity) => entity.fields.flatMap((field) => field.review_candidates.map((candidate) => ({ entity, field, candidate }))));
  const replaceReviewCandidates = (reviewId: string, transform: (candidate: CorporateProfileReadModel['entities'][number]['fields'][number]['review_candidates'][number]) => CorporateProfileReadModel['entities'][number]['fields'][number]['review_candidates'][number] | null) => {
    corporateProfile = {
      ...corporateProfile,
      entities: corporateProfile.entities.map((entity) => ({
        ...entity,
        fields: entity.fields.map((field) => ({
          ...field,
          review_candidates: field.review_candidates.flatMap((candidate) => candidate.review_id === reviewId ? [transform(candidate)].filter((item): item is typeof candidate => item !== null) : [candidate]),
        })),
      })),
    };
  };
  const workflowWorkspaces = new Map<string, ApprovalCommunicationsWorkspace>([
    [previewWorkspace.caseId, structuredClone(previewWorkspace)],
    [previewOperationsWorkspace.caseId, structuredClone(previewOperationsWorkspace)],
    [previewFinalResponseWorkspace.caseId, structuredClone(previewFinalResponseWorkspace)],
  ]);
  const outboundHistories = new Map<string, NonNullable<ApprovalCommunicationsWorkspace['outbound']>[]>(
    [...workflowWorkspaces].map(([workspaceCaseId, workspace]) => [workspaceCaseId, workspace.outbound ? [structuredClone(workspace.outbound)] : []]),
  );
  let formCatalog: FormTemplateCatalog = {
    capabilities: { saveDraft: true, publish: true },
    templates: [
      {
        templateId: '71111111-1111-4111-8111-111111111111', name: 'XBF customer setup — Core', updatedAt: '2026-08-26T18:00:00.000Z',
        latest: { id: '72111111-1111-4111-8111-111111111111', templateId: '71111111-1111-4111-8111-111111111111', version: 3, status: 'published', schemaSha256: 'c'.repeat(64), fields: [
          { id: 'legal_name', label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: ['Razón social'], visibility: null, definition: { kind: 'text', minLength: 1, maxLength: 256 } },
          { id: 'tax_identifier', label: 'Tax identifier', required: true, canonicalFieldId: 'fiscal.taxIdentifier', supplierAliases: ['RFC', 'Tax ID'], visibility: null, definition: { kind: 'canonical_identifier', minLength: 8, maxLength: 32 } },
          { id: 'registered_address', label: 'Registered address', required: true, canonicalFieldId: 'supplier.address', supplierAliases: [], visibility: null, definition: { kind: 'textarea', minLength: 8, maxLength: 500 } },
        ] },
      },
      {
        templateId: '71111111-1111-4111-8111-111111111112', name: 'XBF customer setup — Banking', updatedAt: '2026-08-26T19:00:00.000Z',
        latest: { id: '72111111-1111-4111-8111-111111111112', templateId: '71111111-1111-4111-8111-111111111112', version: 1, status: 'draft', schemaSha256: 'd'.repeat(64), fields: [
          { id: 'bank_account', label: 'Bank account', required: true, canonicalFieldId: 'banking.accountNumber', supplierAliases: ['CLABE'], visibility: null, definition: { kind: 'text', minLength: 4, maxLength: 34 } },
        ] },
      },
    ],
  };
  let caseFormWorkspace: CaseFormWorkspace = {
    caseId: caseFormCaseId,
    supplierName: 'Sierra Retail México',
    caseVersion: 4,
    caseState: 'preparing',
    templateName: 'XBF customer setup — Core',
    template: structuredClone(formCatalog.templates[0].latest),
    instance: {
      id: '73111111-1111-4111-8111-111111111111',
      version: 2,
      values: { legal_name: 'Sierra Retail México', tax_identifier: 'SRM010101AA1', registered_address: 'Av. Insurgentes Sur 1602, Ciudad de México' },
      updatedAt: '2026-08-26T20:10:00.000Z',
    },
    mappings: [{
      id: '74111111-1111-4111-8111-111111111111', version: 1, status: 'unresolved', automaticStatus: 'ready_for_operations_review', afterSha256: 'e'.repeat(64), matchesCurrentDraft: true, updatedAt: '2026-08-26T20:10:00.000Z',
      fields: [
        { fieldId: 'legal_name', source: 'rateware', status: 'prepared', evidenceCount: 1 },
        { fieldId: 'tax_identifier', source: 'attachment', status: 'prepared', evidenceCount: 2 },
        { fieldId: 'registered_address', source: 'attachment', status: 'prepared', evidenceCount: 1 },
      ],
      evidence: {
        sourceDocumentVersionId: '76111111-1111-4111-8111-111111111111', sourceDocumentVersion: 1, sourceDocumentStatus: 'review_required', sourceDocumentFingerprint: 'f'.repeat(64),
        extractionId: '77111111-1111-4111-8111-111111111111', extractionStatus: 'review_required', totalFieldCount: 7, invalidFieldCount: 0,
        protectedFields: [{ id: '78111111-1111-4111-8111-111111111111', fieldKey: 'fiscal.taxIdentifier', presence: 'present', value: 'SRM010101AA1', confidence: 0.94, validation: 'valid', evidenceCount: 2, reviewed: false }],
      },
    }],
    evidenceReady: false,
    capabilities: { saveDraft: true, acceptMapping: true, correctMapping: false, submitForReview: false },
  };
  const client: OspClient = {
    listOnboardingWorkspace: async () => ({ requests_total: '26', documents_pending: '7', under_review: '5', ready_for_approval: '3' }),
    getGmailStatus: async () => ({
      connection_exists: true,
      pubsub_configured: false,
      watch_configured: false,
      scheduled_poll_configured: true,
      poll_interval_seconds: 300,
      poll_last_completed_at: '2026-08-26T20:15:00.000Z',
      poll_status: 'succeeded',
      token_expires_at: '2099-01-01T00:00:00.000Z',
      watch_expires_at: null,
      error_present: false,
      error_code: null,
      outbound_enabled: false,
    }),
    getCorporateProfile: async () => structuredClone(corporateProfile),
    claimProfileReview: async (input) => {
      const match = reviewCandidates().find(({ candidate }) => candidate.review_id === input.reviewId);
      if (!match || match.candidate.ownership !== 'available' || match.candidate.review_revision !== input.expectedRevision) throw new Error('Preview review conflict');
      const revision = input.expectedRevision + 1;
      replaceReviewCandidates(input.reviewId, (candidate) => ({ ...candidate, review_status: 'in_review', ownership: 'owned', review_revision: revision }));
      return { reviewId: input.reviewId, reviewStatus: 'in_review', revision };
    },
    decideProfileReviewField: async (input) => {
      const match = reviewCandidates().find(({ candidate }) => candidate.review_id === input.reviewId && candidate.review_field_id === input.fieldId);
      if (!match || match.candidate.ownership !== 'owned' || match.candidate.review_revision !== input.expectedRevision || match.candidate.field_status !== 'pending') throw new Error('Preview field conflict');
      const revision = input.expectedRevision + 1;
      replaceReviewCandidates(input.reviewId, (candidate) => ({
        ...candidate, review_revision: revision,
        field_status: candidate.review_field_id === input.fieldId ? input.decision : candidate.field_status,
        pending_field_count: candidate.review_field_id === input.fieldId ? String(Math.max(0, Number(candidate.pending_field_count) - 1)) : candidate.pending_field_count,
      }));
      return { reviewId: input.reviewId, fieldId: input.fieldId, fieldStatus: input.decision, revision };
    },
    finalizeProfileReview: async (input) => {
      const matches = reviewCandidates().filter(({ candidate }) => candidate.review_id === input.reviewId);
      if (matches.length === 0 || matches.some(({ candidate }) => candidate.ownership !== 'owned' || candidate.review_revision !== input.expectedRevision || candidate.field_status === 'pending')) throw new Error('Preview finalization conflict');
      corporateProfile = {
        ...corporateProfile,
        entities: corporateProfile.entities.map((entity) => ({
          ...entity,
          fields: entity.fields.map((field) => {
            const reviewed = field.review_candidates.find((candidate) => candidate.review_id === input.reviewId && ['accepted', 'corrected'].includes(candidate.field_status));
            return { ...field, reviewed_candidate_count: reviewed ? String(Number(field.reviewed_candidate_count) + 1) : field.reviewed_candidate_count, review_candidates: field.review_candidates.filter((candidate) => candidate.review_id !== input.reviewId) };
          }),
        })),
      };
      return { reviewId: input.reviewId, reviewStatus: input.decision, verificationStatus: input.decision === 'approved' ? 'verified' : input.decision === 'rejected' ? 'rejected' : 'needs_review', revision: input.expectedRevision + 1 };
    },
    promoteProfileReviewFacts: async (input) => {
      const entity = corporateProfile.entities.find((candidate) => candidate.promotion_candidates.some((promotion) => promotion.review_id === input.reviewId));
      const promotion = entity?.promotion_candidates.find((candidate) => candidate.review_id === input.reviewId);
      if (!entity || !promotion || promotion.promotion_status !== 'ready' || promotion.review_revision !== input.expectedRevision ||
          promotion.candidate_sha256 !== input.candidateSha256 || input.confirmation !== 'PROMOTE_VERIFIED_PROFILE_FACTS' ||
          JSON.stringify(promotion.expected_current_fact_ids) !== JSON.stringify(input.expectedCurrentFactIds)) throw new Error('Preview promotion conflict');
      corporateProfile = {
        ...corporateProfile,
        entities: corporateProfile.entities.map((candidate) => candidate.entity_id !== entity.entity_id ? candidate : {
          ...candidate,
          promotion_candidates: candidate.promotion_candidates.map((item) => item.review_id === input.reviewId ? { ...item, promotion_status: 'applied' as const } : item),
        }),
      };
      return {
        promotionId: '95000000-0000-4000-8000-000000000001', promotionStatus: 'applied' as const,
        promotedFactCount: Number(promotion.change_count), unchangedFactCount: Number(promotion.unchanged_count),
        withheldFieldCount: Number(promotion.withheld_count), reviewId: input.reviewId,
        reviewRevision: input.expectedRevision, replayed: false,
      };
    },
    listCustomerRegistrationCases: async () => structuredClone(previewCaseRows),
    getCustomerRegistrationCase: async (requestedCaseId) => {
      const caseRecord = previewCaseRows.find((candidate) => candidate.case_id === requestedCaseId) ?? previewCaseRows[4];
      const base = requestedCaseId === caseId ? previewCaseDetail : requestedCaseId === salzilloCaseId ? salzilloCaseDetail : requestedCaseId === craneCaseId ? craneCaseDetail : {
          ...caseRecord,
          latest_request: {
            subject: 'Supplier onboarding request — synthetic preview',
            sender_domain: 'example.test',
            received_at: '2026-08-26T14:05:00.000Z',
          },
          recent_events: [{ sequence: 1, state: 'received' as const, occurred_at: '2026-08-26T14:05:00.000Z', reason_code: 'case_received' }],
          request_manifest: null,
          profile_workspace: previewProfileWorkspace,
        };
      return structuredClone({ ...base, ...caseRecord, request_review: requestReviews.get(requestedCaseId) ?? base.request_review ?? null, profile_workspace: profileWorkspaces.get(requestedCaseId) ?? previewProfileWorkspace });
    },
    saveRequestManifestReview: async (input) => {
      const currentCase = previewCaseRows.find((candidate) => candidate.case_id === input.caseId);
      const manifest = requestManifests.get(input.caseId);
      const envelope = requestReviews.get(input.caseId);
      if (!currentCase || !manifest || !envelope || currentCase.aggregate_version !== input.expectedCaseVersion || envelope.manifestSha256 !== input.expectedManifestSha256) throw new Error('VERSION_CONFLICT');
      const seeds = previewDecisionSeeds(manifest);
      const submitted = new Map(input.decisions.map((decision) => [decision.decisionId, decision]));
      if (submitted.size !== seeds.length || seeds.some((seed) => {
        const decision = submitted.get(seed.decisionId);
        return !decision || decision.resolution.trim().length < 3 || !['answered', 'external', 'not_applicable'].includes(decision.outcome);
      })) throw new Error('REQUEST_MANIFEST_REVIEW_SCOPE_MISMATCH');
      const decisions = seeds.map((seed) => ({ ...seed, ...submitted.get(seed.decisionId)!, resolution: submitted.get(seed.decisionId)!.resolution.trim() }));
      const status = decisions.some((decision) => decision.outcome === 'external') ? 'needs_external_clarification' as const : 'resolved' as const;
      const reviewVersion = (envelope.review?.reviewVersion ?? 0) + 1;
      const reviewId = crypto.randomUUID();
      const canonicalSha256 = status === 'resolved' ? shaA : shaB;
      requestReviews.set(input.caseId, { ...envelope, review: { reviewId, reviewVersion, status, decisions, canonicalSha256 } });
      const caseVersion = currentCase.aggregate_version + 1;
      previewCaseRows = previewCaseRows.map((row) => row.case_id === input.caseId ? { ...row, aggregate_version: caseVersion, state: status === 'resolved' ? 'awaiting_xbf_information' : 'awaiting_clarification', updated_at: new Date().toISOString() } : row);
      return { reviewId, caseId: input.caseId, caseVersion, manifestId: envelope.manifestId, manifestVersion: envelope.manifestVersion, manifestSha256: envelope.manifestSha256, reviewVersion, status, decisions, canonicalSha256, replayed: false };
    },
    getRequestKnowledgeWorkspace: async (requestedCaseId) => structuredClone(knowledgeWorkspace(requestedCaseId)),
    promoteRequestKnowledge: async (input) => {
      const workspace = knowledgeWorkspace(input.caseId);
      if (workspace.reviewId !== input.reviewId || workspace.candidateSha256 !== input.expectedCandidateSha256 ||
          input.confirmation !== 'PROMOTE_REVIEWED_REQUEST_KNOWLEDGE' || input.selectedKeys.length < 1 ||
          input.selectedKeys.some((key) => !workspace.candidates.some((candidate) => `${candidate.kind}:${candidate.canonicalKey}` === key))) {
        throw new Error('REQUEST_KNOWLEDGE_VERSION_CONFLICT');
      }
      let promotedCount = 0;
      let unchangedCount = 0;
      for (const key of input.selectedKeys) {
        if (reusableKnowledge.has(key)) unchangedCount += 1;
        else {
          const candidate = workspace.candidates.find((item) => `${item.kind}:${item.canonicalKey}` === key);
          if (!candidate) throw new Error('REQUEST_KNOWLEDGE_SELECTION_INVALID');
          reusableKnowledge.set(key, { canonicalKey: candidate.canonicalKey, displayLabel: candidate.displayLabel, aliases: candidate.aliases, version: 1, sourceCaseId: input.caseId });
          promotedCount += 1;
        }
      }
      knowledgePromotions.set(input.reviewId, (knowledgePromotions.get(input.reviewId) ?? 0) + 1);
      return {
        promotionId: crypto.randomUUID(), promotionStatus: 'applied' as const,
        promotedCount, unchangedCount, replayed: false, externalEffects: false as const,
      };
    },
    bindCaseProfile: async (input) => {
      const currentCase = previewCaseRows.find((candidate) => candidate.case_id === input.caseId);
      const workspace = profileWorkspaces.get(input.caseId);
      const review = requestReviews.get(input.caseId)?.review;
      const candidate = workspace?.candidates.find((item) => item.entity_id === input.legalEntityId);
      if (!currentCase || !workspace || !candidate || (requestManifests.has(input.caseId) && review?.status !== 'resolved') || currentCase.aggregate_version !== input.expectedCaseVersion || (workspace.binding?.binding_revision ?? 0) !== input.expectedBindingRevision || input.confirmation !== 'BIND_CASE_TO_XBF_ENTITY') throw new Error('VERSION_CONFLICT');
      const replayed = workspace.binding?.legal_entity_id === candidate.entity_id;
      const bindingRevision = replayed ? workspace.binding!.binding_revision : (workspace.binding?.binding_revision ?? 0) + 1;
      const caseVersion = replayed ? currentCase.aggregate_version : currentCase.aggregate_version + 1;
      profileWorkspaces.set(input.caseId, { ...workspace, binding: { legal_entity_id: candidate.entity_id, entity_code: candidate.entity_code, binding_revision: bindingRevision, facts_sha256: candidate.facts_sha256 }, draft: replayed ? workspace.draft : null });
      if (!replayed) previewCaseRows = previewCaseRows.map((row) => row.case_id === input.caseId ? { ...row, aggregate_version: caseVersion, updated_at: new Date().toISOString() } : row);
      return { caseId: input.caseId, legalEntityId: candidate.entity_id, entityCode: candidate.entity_code, bindingRevision, caseVersion, replayed };
    },
    assembleCaseProfileDraft: async (input) => {
      const currentCase = previewCaseRows.find((candidate) => candidate.case_id === input.caseId);
      const workspace = profileWorkspaces.get(input.caseId);
      const review = requestReviews.get(input.caseId)?.review;
      const binding = workspace?.binding;
      const candidate = workspace?.candidates.find((item) => item.entity_id === binding?.legal_entity_id);
      if (!currentCase || !workspace || !binding || !candidate || (requestManifests.has(input.caseId) && review?.status !== 'resolved') || currentCase.aggregate_version !== input.expectedCaseVersion || binding.binding_revision !== input.expectedBindingRevision || binding.facts_sha256 !== input.expectedFactsSha256 || input.confirmation !== 'ASSEMBLE_INTERNAL_PROFILE_DRAFT') throw new Error('VERSION_CONFLICT');
      const replayed = workspace.draft?.binding_revision === binding.binding_revision && workspace.draft.manifest_sha256 === binding.facts_sha256;
      const caseVersion = replayed ? currentCase.aggregate_version : currentCase.aggregate_version + 1;
      const draft = { draft_id: workspace.draft?.draft_id ?? '96000000-0000-4000-8000-000000000001', manifest_sha256: binding.facts_sha256, fact_count: candidate.fact_count, restricted_fact_count: candidate.entity_code === 'XBFUS' ? '7' : '5', binding_revision: binding.binding_revision };
      profileWorkspaces.set(input.caseId, { ...workspace, draft });
      if (!replayed) previewCaseRows = previewCaseRows.map((row) => row.case_id === input.caseId ? { ...row, aggregate_version: caseVersion, updated_at: new Date().toISOString() } : row);
      return { draftId: draft.draft_id, manifestSha256: draft.manifest_sha256, factCount: Number(draft.fact_count), restrictedFactCount: Number(draft.restricted_fact_count), caseVersion, replayed };
    },
    syncGmailInbox: async () => ({
      discovered: 2,
      inserted_messages: 1,
      duplicates: 1,
      attachment_metadata_rows: 0,
      osp_enqueued: 1,
      osp_processed: 1,
      outbound_enabled: false,
    }),
    previewHistoricalGmailSearch: async (input) => ({
      query: `in:inbox subject:"${input.subjectPhrase}" after:${input.afterDate.replaceAll('-', '/')} before:${input.beforeDate.replaceAll('-', '/')}`,
      candidates: input.subjectPhrase.toLowerCase().includes('salzillo')
        ? [{
            candidate_id: 'salzillo_message_1',
            subject: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN',
            sender_domain: 'example.test',
            received_at: '2026-08-10T15:00:00.000Z',
            attachment_count: 1,
            duplicate_state: 'already_imported' as const,
          }]
        : [],
      checkpoint_unchanged: true,
      persisted: false,
      outbound_enabled: false,
    }),
    importHistoricalGmailMessage: async (input) => {
      if (input.candidateId !== 'salzillo_message_1' || !input.subjectPhrase.toLowerCase().includes('salzillo')) throw new Error('INVALID_REQUEST');
      return {
        candidate_id: input.candidateId,
        claim_id: '97000000-0000-4000-8000-000000000001',
        import_status: 'replayed' as const,
        attachment_metadata_rows: 0,
        osp_enqueued: 0,
        osp_processed: 0,
        checkpoint_unchanged: true,
        source_preserved: true,
        persisted: true,
        outbound_enabled: false,
      };
    },
    renewGmailWatch: async () => ({
      watch_configured: true,
      watch_expires_at: '2099-01-08T00:00:00.000Z',
      outbound_enabled: false,
    }),
    listDocumentVersions: async () => previewDocuments,
    uploadDocumentVersion: async (input) => ({ id: '30000000-0000-4000-8000-000000000099', version: 1, expiresAt: input.validFrom }),
    approveDocumentVersion: async (input) => ({ id: input.versionId, status: 'approved' }),
    listClarificationReviews: async () => [previewClarification],
    saveClarificationReview: async (input) => ({
      ...previewClarification,
      version: previewClarification.version + 1,
      caseVersion: input.expectedCaseVersion + 1,
      status: 'operations_reviewed',
      questions: input.questions.map((question) => ({ ...question, evidenceIds: [...question.evidenceIds] })),
    }),
    listFormTemplates: async () => structuredClone(formCatalog),
    saveFormTemplateDraft: async (input) => {
      const current = input.templateId === null ? null : formCatalog.templates.find((item) => item.templateId === input.templateId) ?? null;
      const templateId = current?.templateId ?? crypto.randomUUID();
      const version = (current?.latest.version ?? 0) + 1;
      const canonical = await surveyJsonToCanonical(input.surveyJson, { templateId, versionId: crypto.randomUUID(), version, status: 'draft', canonicalFieldIds: ['supplier.legalName', 'supplier.address', 'fiscal.taxIdentifier', 'banking.accountNumber'] });
      const template: FormTemplateCatalog['templates'][number] = { templateId, name: input.name, updatedAt: new Date().toISOString(), latest: structuredClone(canonical) as FormTemplateCatalog['templates'][number]['latest'] };
      formCatalog = { ...formCatalog, templates: [template, ...formCatalog.templates.filter((item) => item.templateId !== templateId)] };
      return { template, replayed: false };
    },
    publishFormTemplate: async (input) => {
      const current = formCatalog.templates.find((item) => item.templateId === input.templateId);
      if (!current || current.latest.id !== input.templateVersionId || current.latest.version !== input.expectedVersion) throw new Error('VERSION_CONFLICT');
      const template = { ...current, updatedAt: new Date().toISOString(), latest: { ...current.latest, status: 'published' as const } };
      formCatalog = { ...formCatalog, templates: formCatalog.templates.map((item) => item.templateId === template.templateId ? template : item) };
      return { template, replayed: false };
    },
    getCaseFormWorkspace: async (requestedCaseId) => {
      if (requestedCaseId === caseFormCaseId) return structuredClone(caseFormWorkspace);
      const caseRecord = previewCaseRows.find((candidate) => candidate.case_id === requestedCaseId) ?? previewCaseRows[0];
      return { caseId: requestedCaseId, supplierName: caseRecord.supplier_name, caseVersion: caseRecord.aggregate_version, caseState: caseRecord.state, templateName: caseFormWorkspace.templateName, template: structuredClone(caseFormWorkspace.template), instance: null, mappings: [], evidenceReady: false, capabilities: { saveDraft: false, acceptMapping: false, correctMapping: false, submitForReview: false } };
    },
    saveCaseFormDraft: async (input) => {
      if (input.caseId !== caseFormCaseId || input.templateVersionId !== caseFormWorkspace.template?.id || input.instanceId !== caseFormWorkspace.instance?.id || input.expectedVersion !== caseFormWorkspace.instance.version) throw new Error('VERSION_CONFLICT');
      const instance = { ...caseFormWorkspace.instance, version: caseFormWorkspace.instance.version + 1, values: structuredClone(input.values), updatedAt: new Date().toISOString() };
      caseFormWorkspace = { ...caseFormWorkspace, instance, mappings: caseFormWorkspace.mappings.map((mapping) => ({ ...mapping, matchesCurrentDraft: false })), evidenceReady: false, capabilities: { ...caseFormWorkspace.capabilities, acceptMapping: false, submitForReview: false } };
      return { instance: structuredClone(instance), replayed: false };
    },
    acceptCaseFormMapping: async (input) => {
      const mapping = caseFormWorkspace.mappings.find((item) => item.id === input.mappingId);
      if (input.caseId !== caseFormCaseId || !mapping || mapping.status !== 'unresolved' || mapping.version !== input.expectedMappingVersion || mapping.afterSha256 !== input.expectedAfterSha256 || !mapping.matchesCurrentDraft) throw new Error('VERSION_CONFLICT');
      const reviewDecisionId = '75111111-1111-4111-8111-111111111111';
      caseFormWorkspace = { ...caseFormWorkspace, mappings: caseFormWorkspace.mappings.map((item) => item.id === mapping.id ? { ...item, status: 'accepted' as const, evidence: { ...item.evidence, sourceDocumentStatus: 'approved' as const, extractionStatus: 'reviewed' as const, protectedFields: item.evidence.protectedFields.map((field) => ({ ...field, reviewed: true })) }, updatedAt: new Date().toISOString() } : item), evidenceReady: true, capabilities: { ...caseFormWorkspace.capabilities, acceptMapping: false, submitForReview: true } };
      return { mappingId: mapping.id, mappingVersion: mapping.version, status: 'accepted', reviewDecisionId, documentVersionId: mapping.evidence.sourceDocumentVersionId, extractionId: mapping.evidence.extractionId, reviewedFieldCount: mapping.evidence.protectedFields.length, replayed: false };
    },
    correctCaseFormMapping: async () => { throw new Error('FORM_MAPPING_NOT_FOUND'); },
    submitCaseFormForReview: async (input) => {
      if (input.caseId !== caseFormCaseId || input.expectedCaseVersion !== caseFormWorkspace.caseVersion || input.templateVersionId !== caseFormWorkspace.template?.id || input.instanceId !== caseFormWorkspace.instance?.id || input.expectedVersion !== caseFormWorkspace.instance.version) throw new Error('VERSION_CONFLICT');
      const instance = { ...caseFormWorkspace.instance, version: caseFormWorkspace.instance.version + 1, values: structuredClone(input.values), updatedAt: new Date().toISOString() };
      const caseVersion = caseFormWorkspace.caseVersion + 1;
      caseFormWorkspace = { ...caseFormWorkspace, caseVersion, caseState: 'operations_review', instance, capabilities: { saveDraft: false, acceptMapping: false, correctMapping: false, submitForReview: false } };
      previewCaseRows = previewCaseRows.map((caseRecord) => caseRecord.case_id === caseFormCaseId
        ? { ...caseRecord, state: 'operations_review', aggregate_version: caseVersion, updated_at: new Date().toISOString() }
        : caseRecord);
      workflowWorkspaces.set(caseFormCaseId, {
        caseId: caseFormCaseId, caseVersion, caseState: 'operations_review',
        inputSnapshot: { sha256: shaB, documentCount: 4, extractionCount: 12, reviewDecisionCount: 7, formInstanceVersion: instance.version },
        supplierPackage: {
          packageId: '56000000-0000-4000-8000-000000000002', version: 1,
          outputSha256: shaA,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          downloadUrl: null,
        },
        signedPackage: null,
        replyContext: null,
        signature: null, outbound: null,
        capabilities: { completeOperationsReview: true, approveAndApplySignature: false, saveOutboundDraft: false, freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false },
      });
      return { instance: structuredClone(instance), caseState: 'operations_review', caseVersion, snapshotSha256: shaB, replayed: false };
    },
    getApprovalCommunicationsWorkspace: async (input) => {
      const current = workflowWorkspaces.get(input.caseId) ?? { ...previewWorkspace, caseId: input.caseId };
      if (!input.payloadId) return structuredClone(current);
      const historical = outboundHistories.get(input.caseId)?.find((item) => item.payloadId === input.payloadId);
      if (!historical) return structuredClone(current);
      const isLatest = current.outbound?.payloadId === historical.payloadId;
      return structuredClone({
        ...current,
        outbound: historical,
        capabilities: isLatest ? current.capabilities : {
          completeOperationsReview: false, approveAndApplySignature: false, saveOutboundDraft: false,
          freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false,
        },
      });
    },
    completeOperationsReview: async (input) => {
      const current = workflowWorkspaces.get(input.caseId);
      if (!current || current.caseState !== 'operations_review' || input.expectedVersion !== current.caseVersion || input.inputSnapshotSha256 !== current.inputSnapshot?.sha256) throw new Error('VERSION_CONFLICT');
      const caseVersion = input.expectedVersion + 1;
      workflowWorkspaces.set(input.caseId, {
        ...current,
        caseVersion,
        caseState: 'signature_approval',
        signature: { positionVersion: 1, approvalStatus: 'pending', approvalId: null, outputSha256: null },
        capabilities: { completeOperationsReview: false, approveAndApplySignature: true, saveOutboundDraft: false, freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false },
      });
      previewCaseRows = previewCaseRows.map((caseRecord) => caseRecord.case_id === input.caseId
        ? { ...caseRecord, state: 'signature_approval', aggregate_version: caseVersion, updated_at: new Date().toISOString() }
        : caseRecord);
      return { caseId: input.caseId, state: 'signature_approval', caseVersion, replayed: false };
    },
    approveAndApplySignature: async (input) => ({ caseId: input.caseId, state: 'sales_authorization', caseVersion: input.expectedVersion + 1, replayed: false, approvalId: '50000000-0000-4000-8000-000000000001' }),
    saveOutboundDraft: async (input) => {
      const current = workflowWorkspaces.get(input.caseId);
      const context = current?.replyContext;
      if (!current?.signedPackage || !context || current.caseState !== 'sales_authorization' || current.caseVersion !== input.expectedVersion) throw new Error('VERSION_CONFLICT');
      if (JSON.stringify({ to: input.to, cc: input.cc, subject: input.subject, inReplyTo: input.inReplyTo, references: input.references }) !== JSON.stringify(context)) throw new Error('REPLY_CONTEXT_MISMATCH');
      const outbound: NonNullable<ApprovalCommunicationsWorkspace['outbound']> = {
        payloadId: input.payloadId, kind: 'final_response', status: 'draft', caseVersion: current.caseVersion,
        from: 'carriers@xbfreight.com', to: [...input.to], cc: [...input.cc], subject: input.subject,
        inReplyTo: input.inReplyTo, references: [...input.references], bodyText: input.bodyText,
        attachmentSha256: [current.signedPackage.outputSha256], mimeSha256: null, salesAuthorizationId: null, sendOutcome: null,
      };
      outboundHistories.set(input.caseId, [...(outboundHistories.get(input.caseId) ?? []), structuredClone(outbound)]);
      workflowWorkspaces.set(input.caseId, {
        ...current,
        outbound,
        capabilities: { ...current.capabilities, saveOutboundDraft: true, freezeOutboundPayload: true },
      });
      return { payloadId: input.payloadId, caseVersion: input.expectedVersion, kind: 'final_response' };
    },
    freezeOutboundPayload: async (input) => {
      const current = workflowWorkspaces.get(input.caseId);
      const latest = outboundHistories.get(input.caseId)?.at(-1);
      if (!current?.outbound || !latest || latest.payloadId !== input.payloadId || current.outbound.payloadId !== input.payloadId || current.outbound.status !== 'draft' || current.caseVersion !== input.expectedVersion) throw new Error('VERSION_CONFLICT');
      const frozen = { ...current.outbound, status: 'frozen' as const, mimeSha256: shaA };
      outboundHistories.set(input.caseId, [...(outboundHistories.get(input.caseId)?.slice(0, -1) ?? []), structuredClone(frozen)]);
      workflowWorkspaces.set(input.caseId, {
        ...current,
        outbound: frozen,
        capabilities: { ...current.capabilities, saveOutboundDraft: false, freezeOutboundPayload: false },
      });
      return { payloadId: input.payloadId, caseId: input.caseId, caseVersion: input.expectedVersion, kind: 'final_response', mimeSha256: shaA, attachmentSha256: [...current.outbound.attachmentSha256], replayed: false };
    },
    authorizeOutboundPayload: async (input) => ({ caseId: input.caseId, state: 'ready_to_send', caseVersion: input.expectedVersion + 1, replayed: false, authorizationId: '50000000-0000-4000-8000-000000000002' }),
    requestAuthorizedSend: async () => ({ attemptId: '60000000-0000-4000-8000-000000000001', jobId: '60000000-0000-4000-8000-000000000002', outcome: 'reserved', replayed: false }),
  };
  return Object.freeze(client);
}

export function createPreviewRuntime(): { authPort: AuthPort; apiClient: OspClient } {
  return Object.freeze({ authPort: createPreviewAuthPort(), apiClient: createPreviewClient() });
}
