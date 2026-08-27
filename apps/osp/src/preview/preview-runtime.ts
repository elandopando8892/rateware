import type { OspClient } from '../api/osp-client';
import type { ApprovalCommunicationsWorkspace, CaseDetail, CaseFormWorkspace, CaseSummary, ClarificationReview, DocumentVersion, FormTemplateCatalog } from '../api/contracts';
import type { AuthPort, BoundSession } from '../auth/auth-port';
import { surveyJsonToCanonical } from '../features/forms/surveyjs-canonical-adapter';

const previewSession: BoundSession = Object.freeze({
  generation: 'osp-preview-synthetic-v1',
  identity: Object.freeze({
    issuer: 'https://auth.heymarksman.com',
    authorizedParty: 'synthetic-public-client',
    subject: 'preview-operations-user',
    organization: 'xbf-preview-organization',
    email: 'preview.operations@xbfreight.com',
    emailVerified: true,
  }),
});

const caseId = '11111111-1111-4111-8111-111111111111';
const caseFormCaseId = '11111111-1111-4111-8111-111111111115';
const payloadId = '22222222-2222-4222-8222-222222222222';
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);

const previewCases: readonly CaseSummary[] = Object.freeze([
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
]);

const previewCaseDetail: CaseDetail = Object.freeze({
  ...previewCases[0],
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
    bodyText: 'Synthetic preview only. The reviewed onboarding package is ready for controlled delivery.',
    attachmentSha256: [shaB],
    mimeSha256: shaA,
    salesAuthorizationId: '50000000-0000-4000-8000-000000000002',
    sendOutcome: null,
  },
  capabilities: {
    completeOperationsReview: false,
    approveAndApplySignature: false,
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
      values: { legal_name: 'Sierra Retail México', registered_address: 'Av. Insurgentes Sur 1602, Ciudad de México' },
      updatedAt: '2026-08-26T20:10:00.000Z',
    },
    capabilities: { saveDraft: true, submitForReview: true },
  };
  let caseFormReviewWorkspace: ApprovalCommunicationsWorkspace | null = null;
  const client: OspClient = {
    listOnboardingWorkspace: async () => ({ requests_total: '26', documents_pending: '7', under_review: '5', ready_for_approval: '3' }),
    getGmailStatus: async () => ({
      connection_exists: true,
      pubsub_configured: false,
      watch_configured: false,
      token_expires_at: '2099-01-01T00:00:00.000Z',
      watch_expires_at: null,
      error_present: false,
      error_code: null,
      outbound_enabled: false,
    }),
    listCustomerRegistrationCases: async () => previewCases,
    getCustomerRegistrationCase: async (requestedCaseId) => requestedCaseId === caseId
      ? previewCaseDetail
      : {
          ...(previewCases.find((candidate) => candidate.case_id === requestedCaseId) ?? previewCases[3]),
          latest_request: {
            subject: 'Supplier onboarding request — synthetic preview',
            sender_domain: 'example.test',
            received_at: '2026-08-26T14:05:00.000Z',
          },
          recent_events: [{ sequence: 1, state: 'received' as const, occurred_at: '2026-08-26T14:05:00.000Z', reason_code: 'case_received' }],
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
      const caseRecord = previewCases.find((candidate) => candidate.case_id === requestedCaseId) ?? previewCases[0];
      return { caseId: requestedCaseId, supplierName: caseRecord.supplier_name, caseVersion: caseRecord.aggregate_version, caseState: caseRecord.state, templateName: caseFormWorkspace.templateName, template: structuredClone(caseFormWorkspace.template), instance: null, capabilities: { saveDraft: false, submitForReview: false } };
    },
    saveCaseFormDraft: async (input) => {
      if (input.caseId !== caseFormCaseId || input.templateVersionId !== caseFormWorkspace.template?.id || input.instanceId !== caseFormWorkspace.instance?.id || input.expectedVersion !== caseFormWorkspace.instance.version) throw new Error('VERSION_CONFLICT');
      const instance = { ...caseFormWorkspace.instance, version: caseFormWorkspace.instance.version + 1, values: structuredClone(input.values), updatedAt: new Date().toISOString() };
      caseFormWorkspace = { ...caseFormWorkspace, instance };
      return { instance: structuredClone(instance), replayed: false };
    },
    submitCaseFormForReview: async (input) => {
      if (input.caseId !== caseFormCaseId || input.expectedCaseVersion !== caseFormWorkspace.caseVersion || input.templateVersionId !== caseFormWorkspace.template?.id || input.instanceId !== caseFormWorkspace.instance?.id || input.expectedVersion !== caseFormWorkspace.instance.version) throw new Error('VERSION_CONFLICT');
      const instance = { ...caseFormWorkspace.instance, version: caseFormWorkspace.instance.version + 1, values: structuredClone(input.values), updatedAt: new Date().toISOString() };
      const caseVersion = caseFormWorkspace.caseVersion + 1;
      caseFormWorkspace = { ...caseFormWorkspace, caseVersion, caseState: 'operations_review', instance, capabilities: { saveDraft: false, submitForReview: false } };
      caseFormReviewWorkspace = {
        caseId: caseFormCaseId, caseVersion, caseState: 'operations_review',
        inputSnapshot: { sha256: shaB, documentCount: 4, extractionCount: 12, reviewDecisionCount: 7, formInstanceVersion: instance.version },
        signature: null, outbound: null,
        capabilities: { completeOperationsReview: true, approveAndApplySignature: false, freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false },
      };
      return { instance: structuredClone(instance), caseState: 'operations_review', caseVersion, snapshotSha256: shaB, replayed: false };
    },
    getApprovalCommunicationsWorkspace: async (input) => input.caseId === caseFormCaseId && caseFormReviewWorkspace ? structuredClone(caseFormReviewWorkspace) : previewWorkspace,
    completeOperationsReview: async (input) => ({ caseId: input.caseId, state: 'signature_approval', caseVersion: input.expectedVersion + 1, replayed: false }),
    approveAndApplySignature: async (input) => ({ caseId: input.caseId, state: 'sales_authorization', caseVersion: input.expectedVersion + 1, replayed: false, approvalId: '50000000-0000-4000-8000-000000000001' }),
    freezeOutboundPayload: async (input) => ({ payloadId: input.payloadId, caseId: input.caseId, caseVersion: input.expectedVersion + 1, kind: 'final_response', mimeSha256: shaA, attachmentSha256: [shaB], replayed: false }),
    authorizeOutboundPayload: async (input) => ({ caseId: input.caseId, state: 'ready_to_send', caseVersion: input.expectedVersion + 1, replayed: false, authorizationId: '50000000-0000-4000-8000-000000000002' }),
    requestAuthorizedSend: async () => ({ attemptId: '60000000-0000-4000-8000-000000000001', jobId: '60000000-0000-4000-8000-000000000002', outcome: 'reserved', replayed: false }),
  };
  return Object.freeze(client);
}

export function createPreviewRuntime(): { authPort: AuthPort; apiClient: OspClient } {
  return Object.freeze({ authPort: createPreviewAuthPort(), apiClient: createPreviewClient() });
}
