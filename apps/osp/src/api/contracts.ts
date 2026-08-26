import { z } from 'zod';

export const OSP_READ_ACTIONS = [
  'list_provider_onboarding_workspace',
  'provider_gmail_status',
] as const;

export const CanonicalCountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const OspReadRequestSchema = z.strictObject({
  version: z.literal(1),
  action: z.enum(OSP_READ_ACTIONS),
});

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

export type PipelineReadModel = z.infer<typeof PipelineReadModelSchema>;
export type GmailReadModel = z.infer<typeof GmailReadModelSchema>;
export type GmailSyncResult = z.infer<typeof GmailSyncSuccessResponseSchema>['data'];
export type OspReadAction = z.infer<typeof OspReadRequestSchema>['action'];
export type OspPublicErrorCode = z.infer<typeof OspPublicErrorCodeSchema>;
export type QuarterlyDocumentType = z.infer<typeof QuarterlyDocumentTypeSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;
export type ClarificationReview = z.infer<typeof ClarificationReviewSchema>;
export type ApprovalCommunicationsWorkspace = z.infer<typeof ApprovalCommunicationsWorkspaceSchema>;
