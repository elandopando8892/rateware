import { z } from 'zod';

export const OSP_READ_ACTIONS = [
  'list_provider_onboarding_workspace',
  'provider_gmail_status',
  'list_customer_registration_cases',
  'get_customer_registration_case',
  'get_corporate_profile',
] as const;

export const CanonicalCountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const OspReadRequestSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    action: z.enum([
      'list_provider_onboarding_workspace',
      'provider_gmail_status',
      'list_customer_registration_cases',
      'get_corporate_profile',
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

const dateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a real UTC calendar date');

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
  scheduled_poll_configured: z.null().optional(),
  poll_interval_seconds: z.null().optional(),
  poll_last_completed_at: z.null().optional(),
  poll_status: z.null().optional(),
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
  scheduled_poll_configured: z.boolean().optional(),
  poll_interval_seconds: z.number().int().min(60).max(3600).nullable().optional(),
  poll_last_completed_at: utcDate.nullable().optional(),
  poll_status: z.enum(['disabled', 'running', 'succeeded', 'failed']).optional(),
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
  if (value.scheduled_poll_configured === true && (value.poll_interval_seconds === null || value.poll_interval_seconds === undefined || value.poll_status === undefined)) {
    context.addIssue({ code: 'custom', message: 'Scheduled polling requires interval and status' });
  }
  if (value.scheduled_poll_configured === false && value.poll_status !== undefined && value.poll_status !== 'disabled') {
    context.addIssue({ code: 'custom', message: 'Disabled polling must have disabled status' });
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

const ManifestEvidenceIdsSchema = z.array(z.string().regex(/^[A-Za-z0-9:_.-]{1,256}$/)).max(20)
  .refine((values) => new Set(values).size === values.length);

export const RequestManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(['review_required', 'confirmed']),
  modelVersion: z.string().min(1).max(128),
  sourceCount: z.number().int().min(1).max(300),
  sourceCoverage: z.strictObject({
    email: z.number().int().min(1).max(100),
    xlsx: z.number().int().min(0).max(100),
    xlsm: z.number().int().min(0).max(100),
    pdf: z.number().int().min(0).max(100),
    docx: z.number().int().min(0).max(100),
    image: z.number().int().min(0).max(100),
  }).refine((coverage) => coverage.email + coverage.xlsx + coverage.xlsm + coverage.pdf + coverage.docx + coverage.image <= 300),
  spreadsheetProtection: z.strictObject({
    macroEnabledFiles: z.number().int().min(0).max(100),
    macroExecution: z.literal('blocked'),
    analysisMode: z.enum(['not_required', 'sanitized_copy']),
  }).refine((protection) => protection.macroEnabledFiles === 0
    ? protection.analysisMode === 'not_required'
    : protection.analysisMode === 'sanitized_copy'),
  generatedAt: utcDate,
  requestType: z.enum(['customer_setup', 'credit_application', 'compliance_update', 'unknown']),
  language: z.enum(['en', 'es', 'bilingual', 'unknown']),
  targetXbfEntity: z.enum(['XBFMX', 'XBFUS', 'unknown']),
  requesterLegalName: z.string().min(1).max(256).nullable(),
  dueDate: dateOnly.nullable(),
  forms: z.array(z.strictObject({
    name: z.string().min(1).max(256),
    format: z.enum(['xlsx', 'xlsm', 'pdf', 'docx', 'other']),
    action: z.enum(['complete', 'sign', 'review', 'attach']),
    required: z.boolean(),
    evidenceIds: ManifestEvidenceIdsSchema.min(1),
  })).max(100),
  requestedFields: z.array(z.strictObject({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/),
    sourceLabel: z.string().min(1).max(256),
    canonicalFieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).nullable(),
    valueType: z.enum(['text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown']),
    required: z.boolean(),
    evidenceIds: ManifestEvidenceIdsSchema.min(1),
  })).max(500),
  requestedDocuments: z.array(z.strictObject({
    documentType: z.string().min(1).max(128),
    required: z.boolean(),
    acceptableAlternatives: z.array(z.string().min(1).max(128)).max(20),
    evidenceIds: ManifestEvidenceIdsSchema.min(1),
  })).max(100),
  signature: z.strictObject({
    required: z.boolean(),
    signerTitle: z.string().min(1).max(256).nullable(),
    evidenceIds: ManifestEvidenceIdsSchema,
  }),
  submission: z.strictObject({
    method: z.enum(['reply_email', 'new_email', 'portal', 'unknown']),
    recipients: z.array(z.email()).max(50),
    instructions: z.string().min(1).max(10_000).nullable(),
    evidenceIds: ManifestEvidenceIdsSchema,
  }),
  requirements: z.array(z.strictObject({ id: z.string().min(1).max(128), text: z.string().min(1).max(10_000), evidenceIds: ManifestEvidenceIdsSchema.min(1) })).max(500),
  contradictions: z.array(z.strictObject({ text: z.string().min(1).max(10_000), evidenceIds: ManifestEvidenceIdsSchema.min(1) })).max(100),
  missingInformation: z.array(z.strictObject({ fieldId: z.string().min(1).max(128), description: z.string().min(1).max(500), evidenceIds: ManifestEvidenceIdsSchema })).max(200),
  clarificationQuestions: z.array(z.strictObject({ fieldId: z.string().min(1).max(128), question: z.string().min(3).max(500), evidenceIds: ManifestEvidenceIdsSchema })).max(100),
  readiness: z.strictObject({
    status: z.enum(['ready_for_prefill', 'needs_clarification', 'unsupported']),
    reasonCodes: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,127}$/)).max(50),
  }),
  aiGenerated: z.literal(true),
  externalEffects: z.literal(false),
}).superRefine((manifest, context) => {
  const coverage = manifest.sourceCoverage;
  const covered = coverage.email + coverage.xlsx + coverage.xlsm + coverage.pdf + coverage.docx + coverage.image;
  if (covered !== manifest.sourceCount) {
    context.addIssue({
      code: 'custom',
      path: ['sourceCoverage'],
      message: 'Source coverage must equal the preserved source count',
    });
  }
  if (manifest.spreadsheetProtection.macroEnabledFiles !== coverage.xlsm) {
    context.addIssue({
      code: 'custom',
      path: ['spreadsheetProtection', 'macroEnabledFiles'],
      message: 'Macro-enabled file count must match XLSM source coverage',
    });
  }
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
  request_manifest: RequestManifestSchema.nullable().optional(),
  request_review: z.strictObject({
    manifestId: z.uuid(),
    manifestVersion: z.number().int().min(1).max(2_147_483_647),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    review: z.strictObject({
      reviewId: z.uuid(),
      reviewVersion: z.number().int().min(1).max(2_147_483_647),
      status: z.enum(['resolved', 'needs_external_clarification']),
      decisions: z.array(z.strictObject({
        decisionId: z.string().regex(/^(?:clarification|contradiction|missing):(?:0|[1-9][0-9]{0,2})$/),
        kind: z.enum(['clarification', 'contradiction', 'missing']),
        fieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).nullable(),
        prompt: z.string().min(1).max(10_000),
        evidenceIds: ManifestEvidenceIdsSchema,
        outcome: z.enum(['answered', 'external', 'not_applicable']),
        resolution: z.string().min(3).max(2_000),
      })).max(200),
      canonicalSha256: z.string().regex(/^[0-9a-f]{64}$/),
    }).nullable(),
  }).nullable().optional(),
  historical_intake: z.strictObject({
    status: z.enum(['preview_only', 'imported']),
    query: z.string().min(1).max(512),
    after_date: dateOnly,
    before_date: dateOnly,
    candidate_count: z.number().int().min(0).max(25),
    duplicate_state: z.enum(['ready', 'already_imported']),
    checkpoint_unchanged: z.literal(true),
    source_preserved: z.literal(true),
    external_effects: z.literal(false),
  }).nullable().optional(),
  profile_workspace: z.strictObject({
    candidates: z.array(z.strictObject({
      entity_id: z.uuid(), entity_code: z.string().regex(/^[A-Z0-9]{2,16}$/), legal_name: z.string().min(1).max(256),
      country_code: z.string().regex(/^[A-Z]{2}$/), fact_count: CanonicalCountSchema, facts_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })).max(10),
    binding: z.strictObject({
      legal_entity_id: z.uuid(), entity_code: z.string().regex(/^[A-Z0-9]{2,16}$/), binding_revision: z.number().int().min(1).max(2_147_483_647), facts_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }).nullable(),
    draft: z.strictObject({
      draft_id: z.uuid(), manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/), fact_count: CanonicalCountSchema,
      restricted_fact_count: CanonicalCountSchema, binding_revision: z.number().int().min(1).max(2_147_483_647),
    }).nullable(),
    disclosure_locked: z.literal(true),
  }),
});

export const CaseProfileBindingResponseSchema = z.strictObject({ data: z.strictObject({
  caseId: z.uuid(), legalEntityId: z.uuid(), entityCode: z.string().regex(/^[A-Z0-9]{2,16}$/),
  bindingRevision: z.number().int().min(1).max(2_147_483_647), caseVersion: z.number().int().min(0).max(2_147_483_647), replayed: z.boolean(),
}) });

export const CaseProfileDraftResponseSchema = z.strictObject({ data: z.strictObject({
  draftId: z.uuid(), manifestSha256: z.string().regex(/^[0-9a-f]{64}$/), factCount: z.number().int().min(1).max(128),
  restrictedFactCount: z.number().int().min(0).max(128), caseVersion: z.number().int().min(0).max(2_147_483_647), replayed: z.boolean(),
}) });

export const RequestManifestReviewResponseSchema = z.strictObject({ data: z.strictObject({
  reviewId: z.uuid(), caseId: z.uuid(), caseVersion: z.number().int().min(0).max(2_147_483_647),
  manifestId: z.uuid(), manifestVersion: z.number().int().min(1).max(2_147_483_647), manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  reviewVersion: z.number().int().min(1).max(2_147_483_647), status: z.enum(['resolved', 'needs_external_clarification']),
  decisions: z.array(z.strictObject({
    decisionId: z.string().regex(/^(?:clarification|contradiction|missing):(?:0|[1-9][0-9]{0,2})$/),
    kind: z.enum(['clarification', 'contradiction', 'missing']), fieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).nullable(),
    prompt: z.string().min(1).max(10_000), evidenceIds: ManifestEvidenceIdsSchema,
    outcome: z.enum(['answered', 'external', 'not_applicable']), resolution: z.string().min(3).max(2_000),
  })).max(200), canonicalSha256: z.string().regex(/^[0-9a-f]{64}$/), replayed: z.boolean(),
}) });

const RequestKnowledgeCandidateBase = {
  canonicalKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  displayLabel: z.string().min(1).max(256),
  aliases: z.array(z.string().min(1).max(256)).min(1).max(21),
  required: z.boolean(),
  evidenceCount: z.number().int().min(1).max(20),
  catalogState: z.enum(['new', 'known']),
  catalogMatch: z.enum(['none', 'exact', 'alias', 'ambiguous']),
  matchedCanonicalKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/).nullable(),
  matchedDisplayLabel: z.string().min(1).max(256).nullable(),
  catalogVersion: z.number().int().min(1).max(2_147_483_647).nullable(),
  sourceCaseId: z.uuid().nullable(),
};

export const RequestKnowledgeCandidateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('field'),
    ...RequestKnowledgeCandidateBase,
    valueType: z.enum(['text', 'number', 'date', 'boolean', 'table', 'signature', 'unknown']),
  }),
  z.strictObject({
    kind: z.literal('document'),
    ...RequestKnowledgeCandidateBase,
    valueType: z.null(),
  }),
]);

export const RequestKnowledgeWorkspaceResponseSchema = z.strictObject({ data: z.strictObject({
  caseId: z.uuid(),
  manifestId: z.uuid(),
  reviewId: z.uuid(),
  reviewVersion: z.number().int().min(1).max(2_147_483_647),
  candidateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  candidates: z.array(RequestKnowledgeCandidateSchema).max(600),
  catalogEntryCount: z.number().int().min(0).max(100_000),
  priorPromotionCount: z.number().int().min(0).max(100_000),
  externalEffects: z.literal(false),
}) });

export const RequestKnowledgePromotionResponseSchema = z.strictObject({ data: z.strictObject({
  promotionId: z.uuid(),
  promotionStatus: z.literal('applied'),
  promotedCount: z.number().int().min(0).max(600),
  unchangedCount: z.number().int().min(0).max(600),
  replayed: z.boolean(),
  externalEffects: z.literal(false),
}) });

export const CaseListSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({ cases: z.array(CaseSummarySchema).max(100) }),
});

export const CaseDetailSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: CaseDetailSchema,
});

export const CorporateProfileFieldSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
  label: z.string().min(1).max(128),
  display_value: z.string().min(1).max(512),
  verification_status: z.enum(['verified', 'needs_review', 'unverified', 'rejected']),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']),
  support_status: z.enum(['verified_match', 'conflict', 'evidence_available', 'unsupported']),
  evidence_candidate_count: CanonicalCountSchema,
  reviewed_candidate_count: CanonicalCountSchema,
  review_candidates: z.array(z.strictObject({
    review_id: z.uuid(),
    review_field_id: z.uuid(),
    review_revision: z.number().int().min(1).max(2_147_483_647),
    review_status: z.enum(['pending', 'in_review']),
    ownership: z.enum(['available', 'owned', 'locked']),
    field_status: z.enum(['pending', 'accepted', 'corrected', 'rejected', 'withheld']),
    document_type: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
    evidence_label: z.string().min(1).max(256),
    proposed_display_value: z.string().min(1).max(512),
    pending_field_count: CanonicalCountSchema,
    total_field_count: CanonicalCountSchema,
  })).max(20),
});

export const ProfileReviewMutationResponseSchema = z.strictObject({
  data: z.strictObject({
    reviewId: z.uuid(),
    revision: z.number().int().min(1).max(2_147_483_647),
    reviewStatus: z.enum(['in_review', 'approved', 'rejected', 'changes_required']).optional(),
    fieldId: z.uuid().optional(),
    fieldStatus: z.enum(['accepted', 'corrected', 'rejected', 'withheld']).optional(),
    verificationStatus: z.enum(['verified', 'rejected', 'needs_review']).optional(),
  }),
});

export const ProfileFactPromotionCandidateSchema = z.strictObject({
  review_id: z.uuid(),
  review_revision: z.number().int().min(1).max(2_147_483_647),
  document_type: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
  evidence_label: z.string().min(1).max(256),
  candidate_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  candidate_count: CanonicalCountSchema,
  change_count: CanonicalCountSchema,
  unchanged_count: CanonicalCountSchema,
  withheld_count: CanonicalCountSchema,
  expected_current_fact_ids: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,127}$/), z.uuid().nullable()),
  promotion_status: z.enum(['ready', 'pending', 'applied', 'conflict', 'failed']),
});

export const ProfileFactPromotionResponseSchema = z.strictObject({
  data: z.strictObject({
    promotionId: z.uuid(),
    promotionStatus: z.literal('applied'),
    promotedFactCount: z.number().int().min(0).max(128),
    unchangedFactCount: z.number().int().min(0).max(128),
    withheldFieldCount: z.number().int().min(0).max(128),
    reviewId: z.uuid(),
    reviewRevision: z.number().int().min(1).max(2_147_483_647),
    replayed: z.boolean(),
  }),
});

export const CorporateProfileEvidenceSchema = z.strictObject({
  name: z.string().min(1).max(256),
  document_type: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
  verification_status: z.enum(['verified', 'needs_review', 'unverified', 'rejected']),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']),
  release_policy: z.enum(['automatic', 'review_required', 'approval_required', 'never_release']),
  expiry_state: z.enum(['no_expiry', 'expired', 'expiring_soon', 'current']),
});

export const CorporateProfileEntitySchema = z.strictObject({
  entity_id: z.uuid(),
  entity_code: z.string().regex(/^[A-Z0-9]{2,16}$/),
  legal_name: z.string().min(1).max(256),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  default_currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  status: z.enum(['draft', 'active']),
  verified_fields: CanonicalCountSchema,
  review_fields: CanonicalCountSchema,
  total_fields: CanonicalCountSchema,
  fields: z.array(CorporateProfileFieldSchema).max(128),
  promotion_candidates: z.array(ProfileFactPromotionCandidateSchema).max(20).default([]),
  evidence: z.array(CorporateProfileEvidenceSchema).max(64),
});

export const CorporateProfileSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({
    entities: z.array(CorporateProfileEntitySchema).min(1).max(10),
    disclosure_locked: z.literal(true),
  }),
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

export const GmailWatchSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({
    watch_configured: z.literal(true),
    watch_expires_at: utcDate,
    outbound_enabled: z.literal(false),
  }),
});

export const HistoricalGmailPreviewSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({
    query: z.string().min(1).max(512),
    candidates: z.array(z.strictObject({
      candidate_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      subject: z.string().min(1).max(998),
      sender_domain: z.string().regex(/^[a-z0-9.-]{1,253}$/),
      received_at: utcDate,
      attachment_count: z.number().int().min(0).max(100),
      duplicate_state: z.enum(['ready', 'already_imported']),
    })).max(25),
    checkpoint_unchanged: z.literal(true),
    persisted: z.literal(false),
    outbound_enabled: z.literal(false),
  }),
});

export const HistoricalGmailImportSuccessResponseSchema = z.strictObject({
  version: z.literal(1),
  data: z.strictObject({
    candidate_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    claim_id: z.uuid(),
    import_status: z.enum(['imported', 'replayed']),
    attachment_metadata_rows: z.number().int().min(0).max(100),
    osp_enqueued: z.number().int().min(0).max(100),
    osp_processed: z.number().int().min(0).max(100),
    checkpoint_unchanged: z.literal(true),
    source_preserved: z.literal(true),
    persisted: z.literal(true),
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
const workflowMessageId = z.string().min(5).max(998).regex(/^<[^<>\s@]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$/);
const capabilitySchema = z.strictObject({
  completeOperationsReview: z.boolean(),
  approveAndApplySignature: z.boolean(),
  saveOutboundDraft: z.boolean().default(false),
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
  supplierPackage: z.strictObject({
    packageId: z.uuid(),
    version: z.number().int().min(1).max(2_147_483_647),
    outputSha256: workflowSha,
    contentType: z.literal('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    downloadUrl: z.url().nullable(),
  }).nullable().default(null),
  signedPackage: z.strictObject({
    packageId: z.uuid(),
    outputSha256: workflowSha,
    contentType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  }).nullable().default(null),
  replyContext: z.strictObject({
    to: z.array(z.email()).min(1).max(50),
    cc: z.array(z.email()).max(50),
    subject: z.string().min(1).max(998),
    inReplyTo: workflowMessageId,
    references: z.array(workflowMessageId).min(1).max(50),
  }).nullable().default(null),
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
    inReplyTo: z.string().nullable().default(null),
    references: z.array(z.string()).max(50).default([]),
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

export const SaveOutboundDraftReceiptSchema = z.strictObject({
  data: z.strictObject({
    payloadId: z.uuid(),
    caseVersion: workflowVersion,
    kind: z.literal('final_response'),
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

export const CaseFormMappingReviewSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(['unresolved', 'accepted', 'corrected', 'rejected']),
  automaticStatus: z.enum(['ready_for_operations_review', 'awaiting_xbf_information', 'awaiting_clarification']),
  afterSha256: z.string().regex(/^[0-9a-f]{64}$/),
  matchesCurrentDraft: z.boolean(),
  fields: z.array(z.strictObject({
    fieldId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    source: z.enum(['existing_draft', 'rateware', 'attachment', 'missing']),
    status: z.enum(['prepared', 'missing', 'contradictory']),
    evidenceCount: z.number().int().min(0).max(10_000),
  })).max(200),
  evidence: z.strictObject({
    sourceDocumentVersionId: z.uuid(),
    sourceDocumentVersion: z.number().int().min(1).max(2_147_483_647),
    sourceDocumentStatus: z.enum(['uploaded', 'analyzing', 'review_required', 'approved', 'rejected', 'superseded']),
    sourceDocumentFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    extractionId: z.uuid(),
    extractionStatus: z.enum(['review_required', 'reviewed', 'failed']),
    totalFieldCount: z.number().int().min(1).max(10_000),
    invalidFieldCount: z.number().int().min(0).max(10_000),
    protectedFields: z.array(z.strictObject({
      id: z.uuid(),
      fieldKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/),
      presence: z.enum(['present', 'blank', 'absent', 'uncertain']),
      value: z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null()]),
      confidence: z.number().min(0).max(1),
      validation: z.enum(['valid', 'low_confidence', 'contradictory', 'invalid']),
      evidenceCount: z.number().int().min(0).max(10_000),
      reviewed: z.boolean(),
    })).max(1_000),
  }),
  updatedAt: utcDate,
});

export const CaseFormWorkspaceResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    caseId: z.uuid(), supplierName: z.string().min(1).max(256), caseVersion: z.number().int().min(0).max(2_147_483_647),
    caseState: CaseStateSchema, templateName: z.string().min(3).max(128).nullable(), template: FormTemplateVersionSchema.nullable(),
    instance: CaseFormInstanceSchema.nullable(), mappings: z.array(CaseFormMappingReviewSchema).max(100), evidenceReady: z.boolean(),
    capabilities: z.strictObject({ saveDraft: z.boolean(), acceptMapping: z.boolean(), correctMapping: z.boolean(), submitForReview: z.boolean() }),
  }),
});

export const CaseFormMutationResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({ instance: CaseFormInstanceSchema, replayed: z.boolean() }),
});

export const CaseFormMappingReviewResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    mappingId: z.uuid(),
    mappingVersion: z.number().int().min(1).max(2_147_483_647),
    status: z.literal('accepted'),
    reviewDecisionId: z.uuid(),
    documentVersionId: z.uuid(),
    extractionId: z.uuid(),
    reviewedFieldCount: z.number().int().min(0).max(10_000),
    replayed: z.boolean(),
  }),
});

export const CaseFormMappingCorrectionResponseSchema = z.strictObject({
  version: z.literal(1), data: z.strictObject({
    mappingId: z.uuid(),
    mappingVersion: z.number().int().min(1).max(2_147_483_647),
    status: z.literal('corrected'),
    reviewDecisionId: z.uuid(),
    evidenceDocumentVersionId: z.uuid(),
    extractionId: z.uuid(),
    reviewedFieldCount: z.number().int().min(0).max(10_000),
    caseState: z.literal('preparing'),
    caseVersion: z.number().int().min(1).max(2_147_483_647),
    replayed: z.boolean(),
  }),
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
export type CorporateProfileReadModel = z.infer<typeof CorporateProfileSuccessResponseSchema>['data'];
export type CorporateProfileEntity = z.infer<typeof CorporateProfileEntitySchema>;
export type ProfileFactPromotionReceipt = z.infer<typeof ProfileFactPromotionResponseSchema>['data'];
export type ProfileReviewMutationReceipt = z.infer<typeof ProfileReviewMutationResponseSchema>['data'];
export type GmailReadModel = z.infer<typeof GmailReadModelSchema>;
export type GmailSyncResult = z.infer<typeof GmailSyncSuccessResponseSchema>['data'];
export type GmailWatchResult = z.infer<typeof GmailWatchSuccessResponseSchema>['data'];
export type HistoricalGmailPreviewResult = z.infer<typeof HistoricalGmailPreviewSuccessResponseSchema>['data'];
export type HistoricalGmailImportResult = z.infer<typeof HistoricalGmailImportSuccessResponseSchema>['data'];
export type OspReadRequest = z.infer<typeof OspReadRequestSchema>;
export type OspPublicErrorCode = z.infer<typeof OspPublicErrorCodeSchema>;
export type CaseState = z.infer<typeof CaseStateSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
export type RequestManifestReadModel = z.infer<typeof RequestManifestSchema>;
export type RequestManifestReviewReadModel = NonNullable<z.infer<typeof CaseDetailSchema>['request_review']>;
export type RequestManifestReviewReceipt = z.infer<typeof RequestManifestReviewResponseSchema>['data'];
export type RequestKnowledgeWorkspace = z.infer<typeof RequestKnowledgeWorkspaceResponseSchema>['data'];
export type RequestKnowledgePromotionReceipt = z.infer<typeof RequestKnowledgePromotionResponseSchema>['data'];
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
export type CaseFormMappingReviewReceipt = z.infer<typeof CaseFormMappingReviewResponseSchema>['data'];
export type CaseFormMappingCorrectionReceipt = z.infer<typeof CaseFormMappingCorrectionResponseSchema>['data'];
export type CaseFormSubmissionReceipt = z.infer<typeof CaseFormSubmissionResponseSchema>['data'];
