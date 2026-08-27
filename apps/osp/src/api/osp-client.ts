import type { AuthPort, BoundSession } from '../auth/auth-port';
import { createWorkflowClient, type WorkflowClient } from './workflow-client';
import type { ZodType } from 'zod';
import {
  CaseDetailSuccessResponseSchema,
  CaseListSuccessResponseSchema,
  type CaseDetail,
  type CaseSummary,
  DocumentApprovalResponseSchema,
  DocumentUploadResponseSchema,
  DocumentVersionsResponseSchema,
  ClarificationReviewResponseSchema,
  ClarificationReviewsResponseSchema,
  type ClarificationQuestion,
  type ClarificationReview,
  FormTemplateCatalogResponseSchema,
  FormTemplateMutationResponseSchema,
  CaseFormWorkspaceResponseSchema,
  CaseFormMutationResponseSchema,
  CaseFormSubmissionResponseSchema,
  FormValuesSchema,
  type CaseFormWorkspace,
  type CaseFormMutationReceipt,
  type CaseFormSubmissionReceipt,
  type FormValues,
  type FormTemplateCatalog,
  type FormTemplateMutationReceipt,
  GmailSyncSuccessResponseSchema,
  type GmailSyncResult,
  GmailSuccessResponseSchema,
  GmailWatchSuccessResponseSchema,
  type GmailWatchResult,
  type DocumentVersion,
  type GmailReadModel,
  OspErrorResponseSchema,
  type OspPublicErrorCode,
  type OspReadRequest,
  PipelineSuccessResponseSchema,
  type PipelineReadModel,
  type QuarterlyDocumentType,
} from './contracts';

type OspClientAuth = Pick<AuthPort, 'getCurrentSession' | 'getAccessToken'>;

export interface OspReadClient {
  listOnboardingWorkspace(): Promise<PipelineReadModel>;
  getGmailStatus(): Promise<GmailReadModel>;
}

export interface OspCaseReadClient {
  listCustomerRegistrationCases(): Promise<readonly CaseSummary[]>;
  getCustomerRegistrationCase(caseId: string): Promise<CaseDetail>;
}

export type DocumentUploadInput = { documentType: QuarterlyDocumentType; validFrom: string; contentType: string; bytes: Uint8Array };
export type DocumentApprovalInput = { versionId: string; expectedVersion: number; reviewBeforeSha256: string; reviewAfterSha256: string };
export type ClarificationReviewInput = { draftId: string; expectedCaseVersion: number; expectedCanonicalSha256: string; questions: readonly ClarificationQuestion[] };
export type SaveFormTemplateDraftInput = { idempotencyKey: string; templateId: string | null; expectedVersion: number; name: string; surveyJson: unknown };
export type PublishFormTemplateInput = { idempotencyKey: string; templateId: string; templateVersionId: string; expectedVersion: number };
export type SaveCaseFormDraftInput = { idempotencyKey: string; caseId: string; templateVersionId: string; instanceId: string | null; expectedVersion: number; values: FormValues };
export type SubmitCaseFormForReviewInput = SaveCaseFormDraftInput & { expectedCaseVersion: number };

export interface OspClient extends OspReadClient, OspCaseReadClient, WorkflowClient {
  syncGmailInbox?(): Promise<GmailSyncResult>;
  renewGmailWatch?(): Promise<GmailWatchResult>;
  listDocumentVersions(): Promise<readonly DocumentVersion[]>;
  uploadDocumentVersion(input: DocumentUploadInput): Promise<{ id: string; version: number; expiresAt: string }>;
  approveDocumentVersion(input: DocumentApprovalInput): Promise<{ id: string; status: 'approved' }>;
  listClarificationReviews(): Promise<readonly ClarificationReview[]>;
  saveClarificationReview(input: ClarificationReviewInput): Promise<ClarificationReview>;
  listFormTemplates(): Promise<FormTemplateCatalog>;
  saveFormTemplateDraft(input: SaveFormTemplateDraftInput): Promise<FormTemplateMutationReceipt>;
  publishFormTemplate(input: PublishFormTemplateInput): Promise<FormTemplateMutationReceipt>;
  getCaseFormWorkspace(caseId: string): Promise<CaseFormWorkspace>;
  saveCaseFormDraft(input: SaveCaseFormDraftInput): Promise<CaseFormMutationReceipt>;
  submitCaseFormForReview(input: SubmitCaseFormForReviewInput): Promise<CaseFormSubmissionReceipt>;
}

export type OspClientErrorCode = OspPublicErrorCode | 'NO_SESSION' | 'NETWORK_UNAVAILABLE' | 'INVALID_RESPONSE' | 'STALE_SESSION';

export class OspClientError extends Error {
  readonly code: OspClientErrorCode;
  readonly incidentId?: string;

  constructor(code: OspClientErrorCode, incidentId?: string) {
    super(code);
    this.name = 'OspClientError';
    this.code = code;
    this.incidentId = incidentId;
  }
}

const STATUS_BY_ERROR_CODE: Readonly<Record<OspPublicErrorCode, number>> = Object.freeze({
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  METHOD_NOT_ALLOWED: 405,
  CONTENT_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  WORKSPACE_UNAVAILABLE: 403,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
});

type ClientOptions = OspClientAuth & {
  supabaseUrl: string;
  fetch?: typeof globalThis.fetch;
};

function endpointFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-read-api`;
}

function documentEndpointFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-document-api`;
}

function gmailSyncEndpointFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-gmail-sync-api`;
}

function formEndpointFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-form-api`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const DOCUMENT_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);
const DOCUMENT_TYPES = new Set(['proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement']);

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createOspClient(options: ClientOptions): OspClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const endpoint = endpointFor(options.supabaseUrl);
  const documentEndpoint = documentEndpointFor(options.supabaseUrl);
  const gmailSyncEndpoint = gmailSyncEndpointFor(options.supabaseUrl);
  const formEndpoint = formEndpointFor(options.supabaseUrl);
  const caseEndpoint = `${options.supabaseUrl.replace(/\/+$/, '')}/functions/v1/osp-case-api`;
  const workflow = createWorkflowClient(options);

  async function formRequest<T>(request: unknown, schema: ZodType<T>, expectedStatus = 200): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspClientError('NO_SESSION');
    let refreshed = false;
    for (;;) {
      let token: string;
      try { token = await options.getAccessToken(captured, refreshed); }
      catch { throw new OspClientError('NO_SESSION'); }
      assertCurrent(options, captured);
      let response: Response;
      try {
        response = await fetchImplementation(formEndpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(request) });
      } catch { assertCurrent(options, captured); throw new OspClientError('NETWORK_UNAVAILABLE'); }
      assertCurrent(options, captured);
      if (!response.ok) {
        const error = parseSafeError(await safeJson(response), response.status);
        assertCurrent(options, captured);
        if (error.code === 'UNAUTHORIZED' && !refreshed) { refreshed = true; continue; }
        throw error;
      }
      if (response.status !== expectedStatus || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new OspClientError('INVALID_RESPONSE');
      const parsed = schema.safeParse(await safeJson(response));
      assertCurrent(options, captured);
      if (!parsed.success) throw new OspClientError('INVALID_RESPONSE');
      return parsed.data;
    }
  }

  async function read<T>(request: OspReadRequest, schema: ZodType<{ version: 1; data: T }>): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspClientError('NO_SESSION');
    let refreshed = false;
    let forceNextToken = false;
    let transientRetried = false;

    for (;;) {
      const forceRefresh = forceNextToken;
      forceNextToken = false;
      let token: string;
      try {
        token = await options.getAccessToken(captured, forceRefresh);
      } catch {
        throw new OspClientError('NO_SESSION');
      }
      assertCurrent(options, captured);

      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
        });
      } catch {
        assertCurrent(options, captured);
        if (!transientRetried) {
          transientRetried = true;
          continue;
        }
        throw new OspClientError('NETWORK_UNAVAILABLE');
      }

      assertCurrent(options, captured);
      if (!response.ok) {
        const errorBody = await safeJson(response);
        assertCurrent(options, captured);
        const error = parseSafeError(errorBody, response.status);
        if (error.code === 'INVALID_RESPONSE') throw error;
        if (error.code === 'UNAUTHORIZED' && !refreshed) {
          refreshed = true;
          forceNextToken = true;
          continue;
        }
        if (
          (error.code === 'INTERNAL_ERROR' || error.code === 'DEPENDENCY_UNAVAILABLE')
          && !transientRetried
        ) {
          transientRetried = true;
          continue;
        }
        throw error;
      }

      const body = await safeJson(response);
      assertCurrent(options, captured);

      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new OspClientError('INVALID_RESPONSE');
      assertCurrent(options, captured);
      return parsed.data.data as T;
    }
  }

  async function documentRequest<T>(input: {
    query: readonly (readonly [string, string])[];
    expectedStatus: number;
    schema: ZodType<T>;
    body?: ArrayBuffer;
    contentType?: string;
  }): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspClientError('NO_SESSION');
    let refreshed = false;
    for (;;) {
      let token: string;
      try {
        token = await options.getAccessToken(captured, refreshed);
      } catch {
        throw new OspClientError('NO_SESSION');
      }
      assertCurrent(options, captured);
      const url = new URL(documentEndpoint);
      for (const [name, value] of input.query) url.searchParams.append(name, value);
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (input.contentType) headers['content-type'] = input.contentType;
      let response: Response;
      try {
        response = await fetchImplementation(url.toString(), { method: 'POST', headers, ...(input.body ? { body: input.body } : {}) });
      } catch {
        assertCurrent(options, captured);
        throw new OspClientError('NETWORK_UNAVAILABLE');
      }
      assertCurrent(options, captured);
      if (!response.ok) {
        const errorBody = await safeJson(response);
        assertCurrent(options, captured);
        const error = parseSafeError(errorBody, response.status);
        if (error.code === 'UNAUTHORIZED' && !refreshed) {
          refreshed = true;
          continue;
        }
        throw error;
      }
      if (response.status !== input.expectedStatus || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new OspClientError('INVALID_RESPONSE');
      const body = await safeJson(response);
      assertCurrent(options, captured);
      const parsed = input.schema.safeParse(body);
      if (!parsed.success) throw new OspClientError('INVALID_RESPONSE');
      return parsed.data;
    }
  }

  async function gmailMutation<T>(
    action: 'sync_provider_gmail_inbox' | 'renew_provider_gmail_watch',
    schema: ZodType<{ version: 1; data: T }>,
  ): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspClientError('NO_SESSION');
    let refreshed = false;
    for (;;) {
      let token: string;
      try { token = await options.getAccessToken(captured, refreshed); }
      catch { throw new OspClientError('NO_SESSION'); }
      assertCurrent(options, captured);
      let response: Response;
      try {
        response = await fetchImplementation(gmailSyncEndpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ version: 1, action }),
        });
      } catch {
        assertCurrent(options, captured);
        throw new OspClientError('NETWORK_UNAVAILABLE');
      }
      assertCurrent(options, captured);
      if (!response.ok) {
        const body = await safeJson(response);
        assertCurrent(options, captured);
        const error = parseSafeError(body, response.status);
        if (error.code === 'UNAUTHORIZED' && !refreshed) { refreshed = true; continue; }
        throw error;
      }
      if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        throw new OspClientError('INVALID_RESPONSE');
      }
      const body = await safeJson(response);
      assertCurrent(options, captured);
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new OspClientError('INVALID_RESPONSE');
      return parsed.data.data;
    }
  }

  function syncGmailInbox(): Promise<GmailSyncResult> {
    return gmailMutation('sync_provider_gmail_inbox', GmailSyncSuccessResponseSchema);
  }

  function renewGmailWatch(): Promise<GmailWatchResult> {
    return gmailMutation('renew_provider_gmail_watch', GmailWatchSuccessResponseSchema);
  }

  async function caseRequest<T>(input: {
    query: readonly (readonly [string, string])[];
    schema: ZodType<T>;
    body?: string;
  }): Promise<T> {
    const captured = options.getCurrentSession();
    if (!captured) throw new OspClientError('NO_SESSION');
    let refreshed = false;
    for (;;) {
      let token: string;
      try { token = await options.getAccessToken(captured, refreshed); }
      catch { throw new OspClientError('NO_SESSION'); }
      assertCurrent(options, captured);
      const url = new URL(caseEndpoint);
      for (const [name, value] of input.query) url.searchParams.append(name, value);
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (input.body !== undefined) headers['content-type'] = 'application/json';
      let response: Response;
      try { response = await fetchImplementation(url.toString(), { method: 'POST', headers, ...(input.body !== undefined ? { body: input.body } : {}) }); }
      catch { assertCurrent(options, captured); throw new OspClientError('NETWORK_UNAVAILABLE'); }
      assertCurrent(options, captured);
      if (!response.ok) {
        const errorBody = await safeJson(response);
        assertCurrent(options, captured);
        const error = parseSafeError(errorBody, response.status);
        if (error.code === 'UNAUTHORIZED' && !refreshed) { refreshed = true; continue; }
        throw error;
      }
      if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new OspClientError('INVALID_RESPONSE');
      const body = await safeJson(response);
      assertCurrent(options, captured);
      const parsed = input.schema.safeParse(body);
      if (!parsed.success) throw new OspClientError('INVALID_RESPONSE');
      return parsed.data;
    }
  }

  function validClarificationQuestion(value: ClarificationQuestion): boolean {
    return !!value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'evidenceIds,fieldId,kind,question' &&
      (value.kind === 'missing' || value.kind === 'contradiction') && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value.fieldId) &&
      typeof value.question === 'string' && value.question.trim() === value.question && value.question.length >= 3 && value.question.length <= 500 &&
      !/[<>]|(?:javascript|data):|https?:\/\//i.test(value.question) && Array.isArray(value.evidenceIds) && value.evidenceIds.length >= 1 && value.evidenceIds.length <= 20 &&
      new Set(value.evidenceIds).size === value.evidenceIds.length && value.evidenceIds.every((id) => /^[A-Za-z0-9:_-]{1,256}$/.test(id));
  }

  return Object.freeze({
    ...workflow,
    listOnboardingWorkspace: () => read<PipelineReadModel>(
      { version: 1, action: 'list_provider_onboarding_workspace' }, PipelineSuccessResponseSchema,
    ),
    getGmailStatus: () => read<GmailReadModel>(
      { version: 1, action: 'provider_gmail_status' }, GmailSuccessResponseSchema,
    ),
    listCustomerRegistrationCases: async () => (await read(
      { version: 1, action: 'list_customer_registration_cases' }, CaseListSuccessResponseSchema,
    )).cases,
    getCustomerRegistrationCase: (caseId: string) => {
      if (!UUID.test(caseId)) return Promise.reject(new OspClientError('INVALID_REQUEST'));
      return read({ version: 1, action: 'get_customer_registration_case', case_id: caseId }, CaseDetailSuccessResponseSchema);
    },
    syncGmailInbox,
    renewGmailWatch,
    listDocumentVersions: async () => (await documentRequest({
      query: [['action', 'list_document_versions']], expectedStatus: 200, schema: DocumentVersionsResponseSchema,
    })).data.versions,
    uploadDocumentVersion: async (input: DocumentUploadInput) => {
      if (!DOCUMENT_TYPES.has(input.documentType) || !isRealDate(input.validFrom) || !DOCUMENT_CONTENT_TYPES.has(input.contentType) || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > 26_214_400) throw new OspClientError('INVALID_REQUEST');
      const response = await documentRequest({
        query: [['action', 'upload_document_version'], ['document_type', input.documentType], ['valid_from', input.validFrom]],
        expectedStatus: 201,
        schema: DocumentUploadResponseSchema,
        contentType: input.contentType,
        body: input.bytes.slice().buffer,
      });
      return response.data;
    },
    approveDocumentVersion: async (input: DocumentApprovalInput) => {
      if (!UUID.test(input.versionId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion > 2_147_483_647 || !SHA.test(input.reviewBeforeSha256) || input.reviewBeforeSha256 !== input.reviewAfterSha256) throw new OspClientError('INVALID_REQUEST');
      const response = await documentRequest({
        query: [
          ['action', 'approve_document_version'],
          ['version_id', input.versionId],
          ['expected_version', String(input.expectedVersion)],
          ['review_before_sha256', input.reviewBeforeSha256],
          ['review_after_sha256', input.reviewAfterSha256],
        ],
        expectedStatus: 200,
        schema: DocumentApprovalResponseSchema,
      });
      return response.data;
    },
    listClarificationReviews: async () => (await caseRequest({
      query: [['action', 'list_clarification_reviews']], schema: ClarificationReviewsResponseSchema,
    })).data.drafts,
    saveClarificationReview: async (input: ClarificationReviewInput) => {
      if (!UUID.test(input.draftId) || !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 0 || input.expectedCaseVersion > 2_147_483_647 ||
          !SHA.test(input.expectedCanonicalSha256) || !Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 50 ||
          input.questions.some((question) => !validClarificationQuestion(question)) || new Set(input.questions.map((question) => question.fieldId)).size !== input.questions.length) {
        throw new OspClientError('INVALID_REQUEST');
      }
      const response = await caseRequest({
        query: [
          ['action', 'save_clarification_review'],
          ['draft_id', input.draftId],
          ['expected_case_version', String(input.expectedCaseVersion)],
          ['expected_canonical_sha256', input.expectedCanonicalSha256],
        ],
        schema: ClarificationReviewResponseSchema,
        body: JSON.stringify({ questions: input.questions }),
      });
      return response.data;
    },
    listFormTemplates: async () => (await formRequest({ version: 1, action: 'list_form_templates' }, FormTemplateCatalogResponseSchema)).data,
    saveFormTemplateDraft: async (input: SaveFormTemplateDraftInput) => {
      if (!OPAQUE.test(input.idempotencyKey) || !(input.templateId === null || UUID.test(input.templateId)) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2_147_483_647 || typeof input.name !== 'string' || input.name.trim() !== input.name || input.name.length < 3 || input.name.length > 128 || !input.surveyJson || typeof input.surveyJson !== 'object') throw new OspClientError('INVALID_REQUEST');
      return (await formRequest({ version: 1, action: 'save_form_template_draft', idempotency_key: input.idempotencyKey, template_id: input.templateId, expected_version: input.expectedVersion, name: input.name, survey_json: input.surveyJson }, FormTemplateMutationResponseSchema, 201)).data;
    },
    publishFormTemplate: async (input: PublishFormTemplateInput) => {
      if (!OPAQUE.test(input.idempotencyKey) || !UUID.test(input.templateId) || !UUID.test(input.templateVersionId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion > 2_147_483_647) throw new OspClientError('INVALID_REQUEST');
      return (await formRequest({ version: 1, action: 'publish_form_template', idempotency_key: input.idempotencyKey, template_id: input.templateId, template_version_id: input.templateVersionId, expected_version: input.expectedVersion }, FormTemplateMutationResponseSchema)).data;
    },
    getCaseFormWorkspace: async (caseId: string) => {
      if (!UUID.test(caseId)) throw new OspClientError('INVALID_REQUEST');
      return (await formRequest({ version: 1, action: 'get_case_form_workspace', case_id: caseId }, CaseFormWorkspaceResponseSchema)).data;
    },
    saveCaseFormDraft: async (input: SaveCaseFormDraftInput) => {
      if (!OPAQUE.test(input.idempotencyKey) || !UUID.test(input.caseId) || !UUID.test(input.templateVersionId) || !(input.instanceId === null || UUID.test(input.instanceId)) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2_147_483_647 || !FormValuesSchema.safeParse(input.values).success || (input.instanceId === null) !== (input.expectedVersion === 0)) throw new OspClientError('INVALID_REQUEST');
      return (await formRequest({ version: 1, action: 'save_case_form_draft', idempotency_key: input.idempotencyKey, case_id: input.caseId, template_version_id: input.templateVersionId, instance_id: input.instanceId, expected_version: input.expectedVersion, values: input.values }, CaseFormMutationResponseSchema)).data;
    },
    submitCaseFormForReview: async (input: SubmitCaseFormForReviewInput) => {
      if (!OPAQUE.test(input.idempotencyKey) || !UUID.test(input.caseId) || !UUID.test(input.templateVersionId) || !(input.instanceId === null || UUID.test(input.instanceId)) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2_147_483_647 || !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 0 || input.expectedCaseVersion > 2_147_483_647 || !FormValuesSchema.safeParse(input.values).success || (input.instanceId === null) !== (input.expectedVersion === 0)) throw new OspClientError('INVALID_REQUEST');
      return (await formRequest({ version: 1, action: 'submit_case_form_for_review', idempotency_key: input.idempotencyKey, case_id: input.caseId, expected_case_version: input.expectedCaseVersion, template_version_id: input.templateVersionId, instance_id: input.instanceId, expected_version: input.expectedVersion, values: input.values }, CaseFormSubmissionResponseSchema)).data;
    },
  });
}

function assertCurrent(options: OspClientAuth, captured: BoundSession): void {
  const current = options.getCurrentSession();
  if (!current || current.generation !== captured.generation ||
      current.identity.issuer !== captured.identity.issuer ||
      current.identity.authorizedParty !== captured.identity.authorizedParty ||
      current.identity.subject !== captured.identity.subject ||
      current.identity.organization !== captured.identity.organization ||
      current.identity.email !== captured.identity.email ||
      current.identity.emailVerified !== captured.identity.emailVerified) {
    throw new OspClientError('STALE_SESSION');
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OspClientError('INVALID_RESPONSE');
  }
}

function parseSafeError(value: unknown, status: number): OspClientError {
  const parsed = OspErrorResponseSchema.safeParse(value);
  if (!parsed.success) return new OspClientError('INVALID_RESPONSE');
  if (STATUS_BY_ERROR_CODE[parsed.data.error.code] !== status) {
    return new OspClientError('INVALID_RESPONSE');
  }
  return new OspClientError(parsed.data.error.code, parsed.data.error.incident_id);
}
