import { z } from 'zod';

export const OSP_READ_ACTIONS = [
  'list_provider_onboarding_workspace',
  'provider_gmail_status',
  'list_customer_registration_cases',
  'get_customer_registration_case',
] as const;

export const CanonicalCountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const OspReadRequestSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    action: z.enum([
      'list_provider_onboarding_workspace',
      'provider_gmail_status',
      'list_customer_registration_cases',
    ]),
  }),
  z.strictObject({
    version: z.literal(1),
    action: z.literal('get_customer_registration_case'),
    case_id: z.uuid(),
  }),
]);

export const PipelineReadModelSchema = z.strictObject({
  requests_total: CanonicalCountSchema,
  documents_pending: CanonicalCountSchema,
  under_review: CanonicalCountSchema,
  ready_for_approval: CanonicalCountSchema,
});

const utcDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}, 'Expected normalized RFC3339 UTC date');

export const GmailErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'WATCH_EXPIRED',
  'PUBSUB_NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'UNKNOWN',
]);

const disconnectedGmail = z.strictObject({
  connection_exists: z.literal(false),
  pubsub_configured: z.null(),
  watch_configured: z.null(),
  token_expires_at: z.null(),
  watch_expires_at: z.null(),
  error_present: z.literal(false),
  error_code: z.null(),
  outbound_enabled: z.literal(false),
});

const connectedGmail = z.strictObject({
  connection_exists: z.literal(true),
  pubsub_configured: z.boolean(),
  watch_configured: z.boolean(),
  token_expires_at: utcDate.nullable(),
  watch_expires_at: utcDate.nullable(),
  error_present: z.boolean(),
  error_code: GmailErrorCodeSchema.nullable(),
  outbound_enabled: z.literal(false),
}).superRefine((value, context) => {
  if (!value.watch_configured && value.watch_expires_at !== null) {
    context.addIssue({ code: 'custom', message: 'Disabled watch must not have an expiration' });
  }
  if (value.error_present !== (value.error_code !== null)) {
    context.addIssue({ code: 'custom', message: 'Error presence must match error code' });
  }
});

export const GmailReadModelSchema = z.discriminatedUnion('connection_exists', [
  disconnectedGmail,
  connectedGmail,
]);

export const PipelineSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: PipelineReadModelSchema,
});

export const GmailSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: GmailReadModelSchema,
});

export const CaseStateSchema = z.enum([
  'received', 'analyzing_requirements', 'awaiting_clarification',
  'awaiting_xbf_information', 'preparing', 'operations_review',
  'signature_approval', 'sales_authorization', 'ready_to_send',
  'sent', 'manual_reconciliation_required', 'accepted', 'rejected', 'closed',
]);

export const CaseSummarySchema = z.strictObject({
  case_id: z.uuid(),
  supplier_name: z.string().min(1).max(256),
  state: CaseStateSchema,
  aggregate_version: z.number().int().min(0).max(2_147_483_647),
  blocked_by_duplicate_review: z.boolean(),
  created_at: utcDate,
  updated_at: utcDate,
  message_count: CanonicalCountSchema,
  attachment_count: CanonicalCountSchema,
  document_count: CanonicalCountSchema,
});

export const CaseEventSchema = z.strictObject({
  sequence: z.number().int().min(1).max(2_147_483_647),
  state: CaseStateSchema,
  occurred_at: utcDate,
  reason_code: z.string().min(1).max(128),
});

export const CaseDetailSchema = CaseSummarySchema.extend({
  latest_request: z.strictObject({
    subject: z.string().min(1).max(998).nullable(),
    sender_domain: z.string().min(1).max(253).nullable(),
    received_at: utcDate.nullable(),
  }).refine((value) => {
    const populated = [value.subject, value.sender_domain, value.received_at].filter((item) => item !== null).length;
    return populated === 0 || populated === 3;
  }, 'Latest request fields must be populated together'),
  recent_events: z.array(CaseEventSchema).max(20),
});

export const CaseListSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({ cases: z.array(CaseSummarySchema).max(100) }),
});

export const CaseDetailSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: CaseDetailSchema,
});

export const GmailSyncSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({
    discovered: z.number().int().min(0).max(100_000),
    inserted_messages: z.number().int().min(0).max(100_000),
    duplicates: z.number().int().min(0).max(100_000),
    attachment_metadata_rows: z.number().int().min(0).max(100_000),
    osp_enqueued: z.number().int().min(0).max(100_000),
    osp_processed: z.number().int().min(0).max(100_000),
    outbound_enabled: z.literal(false),
  }),
});

export const OspPublicErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'METHOD_NOT_ALLOWED',
  'CONTENT_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'WORKSPACE_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export const OspErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: OspPublicErrorCodeSchema,
    incident_id: z.string().min(1),
  }),
});

export const QuarterlyDocumentTypeSchema = z.enum([
  'proof_of_address',
  'sat_compliance_opinion',
  'tax_status_certificate',
  'bank_statement',
]);

const dateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a real UTC calendar date');

export const DocumentVersionSchema = z.strictObject({
  id: z.uuid(),
  documentType: QuarterlyDocumentTypeSchema,
  version: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(['uploaded', 'analyzing', 'review_required', 'approved', 'rejected', 'superseded']),
  validFrom: dateOnly,
  expiresAt: dateOnly,
});

export const DocumentVersionsResponseSchema = z.strictObject({
  data: z.strictObject({ versions: z.array(DocumentVersionSchema).max(10_000) }),
});

export const DocumentUploadResponseSchema = z.strictObject({
  data: z.strictObject({ id: z.uuid(), version: z.number().int().min(1).max(2_147_483_647), expiresAt: dateOnly }),
});

export const DocumentApprovalResponseSchema = z.strictObject({
  data: z.strictObject({ id: z.uuid(), status: z.literal('approved') }),
});

const clarificationEvidenceId = z.string().regex(/^[A-Za-z0-9:_-]{1,256}$/);
export const ClarificationQuestionSchema = z.strictObject({
  kind: z.enum(['missing', 'contradiction']),
  fieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/),
  question: z.string().min(3).max(500).refine((value) => value.trim() === value && !/[<>]|(?:javascript|data):|https?:\/\//i.test(value)),
  evidenceIds: z.array(clarificationEvidenceId).min(1).max(20).refine((values) => new Set(values).size === values.length),
});

export const ClarificationReviewSchema = z.strictObject({
  id: z.uuid(),
  caseId: z.uuid(),
  caseVersion: z.number().int().min(0).max(2_147_483_647),
  version: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(['operations_review_required', 'operations_reviewed']),
  questions: z.array(ClarificationQuestionSchema).min(1).max(50),
  evidenceIds: z.array(clarificationEvidenceId).min(1).max(1_000),
  canonicalSha256: z.string().regex(/^[0-9a-f]{64}$/),
  authorizationMailbox: z.literal('sales@heymarksman.com'),
});

export const ClarificationReviewsResponseSchema = z.strictObject({
  data: z.strictObject({ drafts: z.array(ClarificationReviewSchema).max(100) }),
});

export const ClarificationReviewResponseSchema = z.strictObject({ data: ClarificationReviewSchema });

const workflowSha = z.string().regex(/^[0-9a-f]{64}$/);
const workflowVersion = z.number().int().min(0).max(2_147_483_647);
const capabilitySchema = z.strictObject({
  completeOperationsReview: z.boolean(),
  approveAndApplySignature: z.boolean(),
  freezeOutboundPayload: z.boolean(),
  authorizeOutboundPayload: z.boolean(),
  requestAuthorizedSend: z.boolean(),
});

export const ApprovalCommunicationsWorkspaceSchema = z.strictObject({
  caseId: z.uuid(),
  caseVersion: workflowVersion,
  caseState: z.enum([
    'received', 'analyzing_requirements', 'awaiting_clarification',
    'awaiting_xbf_information', 'preparing', 'operations_review',
    'signature_approval', 'sales_authorization', 'ready_to_send',
    'sent', 'manual_reconciliation_required', 'accepted', 'rejected', 'closed',
  ]),
  inputSnapshot: z.strictObject({
    sha256: workflowSha,
    documentCount: z.number().int().min(0).max(10_000),
    extractionCount: z.number().int().min(0).max(100_000),
    reviewDecisionCount: z.number().int().min(0).max(100_000),
    formInstanceVersion: z.number().int().min(1).max(2_147_483_647),
  }).nullable(),
  signature: z.strictObject({
    positionVersion: z.number().int().min(1).max(2_147_483_647),
    approvalStatus: z.enum(['pending', 'approved']),
    approvalId: z.uuid().nullable(),
    outputSha256: workflowSha.nullable(),
  }).nullable(),
  outbound: z.strictObject({
    payloadId: z.uuid(),
    kind: z.enum(['clarification', 'final_response']),
    status: z.enum(['draft', 'frozen', 'authorized', 'send_pending', 'sent', 'failed', 'manual_reconciliation_required']),
    caseVersion: workflowVersion,
    from: z.literal('carriers@xbfreight.com'),
    to: z.array(z.email()).min(1).max(50),
    cc: z.array(z.email()).max(50),
    subject: z.string().min(1).max(998),
    bodyText: z.string().min(1).max(100_000),
    attachmentSha256: z.array(workflowSha).max(100),
    mimeSha256: workflowSha.nullable(),
    salesAuthorizationId: z.uuid().nullable(),
    sendOutcome: z.enum(['reserved', 'sent', 'failed', 'manual_reconciliation_required']).nullable(),
  }).nullable(),
  capabilities: capabilitySchema,
});

export const ApprovalCommunicationsWorkspaceResponseSchema = z.strictObject({
  data: ApprovalCommunicationsWorkspaceSchema,
});

export const ApprovalCommandReceiptSchema = z.strictObject({
  data: z.strictObject({
    caseId: z.uuid(),
    state: z.enum(['signature_approval', 'sales_authorization', 'ready_to_send']),
    caseVersion: workflowVersion,
    replayed: z.boolean(),
    approvalId: z.uuid().optional(),
    authorizationId: z.uuid().optional(),
  }),
});

export const FreezeCommandReceiptSchema = z.strictObject({
  data: z.strictObject({
    payloadId: z.uuid(),
    caseId: z.uuid(),
    caseVersion: workflowVersion,
    kind: z.enum(['clarification', 'final_response']),
    mimeSha256: workflowSha,
    attachmentSha256: z.array(workflowSha).max(100),
    replayed: z.boolean(),
  }),
});

export const SendCommandReceiptSchema = z.strictObject({
  data: z.strictObject({
    attemptId: z.uuid(),
    jobId: z.uuid(),
    outcome: z.enum(['reserved', 'sending', 'sent', 'failed', 'manual_reconciliation_required']),
    replayed: z.boolean(),
  }),
});

const FormRuleConditionSchema = z.strictObject({
  fieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'is_blank', 'is_present']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()).min(1).max(20)]).optional(),
});

const FormDefinitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['section', 'instruction']), text: z.string().min(1).max(2_000) }),
  z.strictObject({ kind: z.enum(['text', 'textarea', 'email', 'phone', 'canonical_identifier']), minLength: z.number().int().min(0).max(10_000), maxLength: z.number().int().min(1).max(10_000) }),
  z.strictObject({ kind: z.enum(['date', 'number', 'currency']), minimum: z.number().finite().nullable(), maximum: z.number().finite().nullable() }),
  z.strictObject({ kind: z.enum(['single_select', 'multi_select']), options: z.array(z.strictObject({ value: z.string().min(1).max(64), label: z.string().min(1).max(128) })).min(1).max(100) }),
  z.strictObject({ kind: z.enum(['yes_no', 'checkbox']) }),
  z.strictObject({ kind: z.literal('repeating_table'), columns: z.array(z.strictObject({ id: z.string().min(1).max(64), label: z.string().min(1).max(128), valueType: z.enum(['text', 'number', 'date']) })).min(1).max(20), maxRows: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal('document_request'), documentType: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal('derived_readonly'), sourceFieldIds: z.array(z.string().min(1).max(64)).min(1).max(20), operation: z.enum(['join', 'sum', 'copy']) }),
  z.strictObject({ kind: z.literal('signature_position'), page: z.number().int().min(1), anchor: z.string().min(1).max(128), x: z.number().finite().min(0), y: z.number().finite().min(0), width: z.number().finite().positive(), height: z.number().finite().positive() }),
]);

export const FormComponentSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  label: z.string().min(1).max(256),
  required: z.boolean(),
  canonicalFieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).nullable(),
  supplierAliases: z.array(z.string().min(1).max(128)).max(20),
  visibility: z.strictObject({ all: z.array(FormRuleConditionSchema).min(1).max(10) }).nullable(),
  definition: FormDefinitionSchema,
});

export const FormTemplateVersionSchema = z.strictObject({
  id: z.uuid(), templateId: z.uuid(), version: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(['draft', 'published']), fields: z.array(FormComponentSchema).min(1).max(200), schemaSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const FormTemplateCatalogItemSchema = z.strictObject({
  templateId: z.uuid(), name: z.string().min(3).max(128), updatedAt: utcDate, latest: FormTemplateVersionSchema,
});

export const FormTemplateCatalogResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    templates: z.array(FormTemplateCatalogItemSchema).max(100),
    capabilities: z.strictObject({ saveDraft: z.boolean(), publish: z.boolean() }),
  }),
});

export const FormTemplateMutationResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({ template: FormTemplateCatalogItemSchema, replayed: z.boolean() }),
});

function isSafeFormValue(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 10_000;
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => isSafeFormValue(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 50 && entries.every(([key, item]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) && isSafeFormValue(item, depth + 1));
}

export const FormValuesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/), z.unknown())
  .refine((value) => Object.keys(value).length <= 200 && Object.values(value).every((item) => isSafeFormValue(item)), 'Unsafe form values');

export const CaseFormInstanceSchema = z.strictObject({
  id: z.uuid(), version: z.number().int().min(1).max(2_147_483_647), values: FormValuesSchema, updatedAt: utcDate,
});

export const CaseFormWorkspaceResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    caseId: z.uuid(), supplierName: z.string().min(1).max(256), caseVersion: z.number().int().min(0).max(2_147_483_647),
    caseState: CaseStateSchema, templateName: z.string().min(3).max(128).nullable(), template: FormTemplateVersionSchema.nullable(),
    instance: CaseFormInstanceSchema.nullable(), capabilities: z.strictObject({ saveDraft: z.boolean(), submitForReview: z.boolean() }),
  }),
});

export const CaseFormMutationResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({ instance: CaseFormInstanceSchema, replayed: z.boolean() }),
});

export const CaseFormSubmissionResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    instance: CaseFormInstanceSchema,
    caseState: z.literal('operations_review'),
    caseVersion: z.number().int().min(1).max(2_147_483_647),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
    replayed: z.boolean(),
  }),
});

export type PipelineReadModel = z.infer<typeof PipelineReadModelSchema>;
export type GmailReadModel = z.infer<typeof GmailReadModelSchema>;
export type GmailSyncResult = z.infer<typeof GmailSyncSuccessResponseSchema>['data'];
export type OspReadRequest = z.infer<typeof OspReadRequestSchema>;
export type OspPublicErrorCode = z.infer<typeof OspPublicErrorCodeSchema>;
export type CaseState = z.infer<typeof CaseStateSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
export type QuarterlyDocumentType = z.infer<typeof QuarterlyDocumentTypeSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;
export type ClarificationReview = z.infer<typeof ClarificationReviewSchema>;
export type ApprovalCommunicationsWorkspace = z.infer<typeof ApprovalCommunicationsWorkspaceSchema>;
export type FormTemplateCatalog = z.infer<typeof FormTemplateCatalogResponseSchema>['data'];
export type FormTemplateCatalogItem = z.infer<typeof FormTemplateCatalogItemSchema>;
export type FormTemplateMutationReceipt = z.infer<typeof FormTemplateMutationResponseSchema>['data'];
export type FormValues = z.infer<typeof FormValuesSchema>;
export type CaseFormInstance = z.infer<typeof CaseFormInstanceSchema>;
export type CaseFormWorkspace = z.infer<typeof CaseFormWorkspaceResponseSchema>['data'];
export type CaseFormMutationReceipt = z.infer<typeof CaseFormMutationResponseSchema>['data'];
export type CaseFormSubmissionReceipt = z.infer<typeof CaseFormSubmissionResponseSchema>['data'];
