import type { VerifiedWorkflowIdentity } from '../_shared/osp/workflow-authority.ts';
import { jsonResponse, NO_CACHE_HEADERS, OspApiError, postCorsHeaders, safeErrorResponse } from '../osp-read-api/http.ts';
import type { DocumentApprovalInput, DocumentAuthority, DocumentUploadInput } from './document-service.ts';
import type { DocumentVersionSummary, ProfileFactPromotionInput, ProfileReviewClaimInput, ProfileReviewFieldDecisionInput, ProfileReviewFinalizationInput } from './postgres-document-store.ts';

const BODY_LIMIT_BYTES = 26_214_400;
const ORIGINS = new Set(['http://localhost:8791', 'https://osp.heymarksman.com']);
const DOCUMENT_TYPES = new Set(['proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement']);
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

type DocumentServicePort = {
  upload(authority: DocumentAuthority, input: DocumentUploadInput): Promise<{ id: string; version: number; expiresAt: string }>;
  approve(authority: DocumentAuthority, input: DocumentApprovalInput): Promise<{ id: string; status: 'approved' }>;
};

type ProfileReviewStorePort = {
  claimProfileReview(input: ProfileReviewClaimInput): Promise<{ reviewId: string; reviewStatus: 'in_review'; revision: number }>;
  decideProfileReviewField(input: ProfileReviewFieldDecisionInput): Promise<{ reviewId: string; fieldId: string; fieldStatus: ProfileReviewFieldDecisionInput['decision']; revision: number }>;
  finalizeProfileReview(input: ProfileReviewFinalizationInput): Promise<{ reviewId: string; reviewStatus: ProfileReviewFinalizationInput['decision']; verificationStatus: 'verified' | 'rejected' | 'needs_review'; revision: number }>;
  promoteProfileReviewFacts?(input: ProfileFactPromotionInput): Promise<{ promotionId: string; promotionStatus: 'applied'; promotedFactCount: number; unchangedFactCount: number; withheldFieldCount: number; reviewId: string; reviewRevision: number; replayed: boolean }>;
};

export type DocumentApiHandlerOptions = {
  verifyToken(token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity>;
  listVersions(organizationId: string): Promise<readonly DocumentVersionSummary[]>;
  documentService: DocumentServicePort;
  profileReviewStore?: ProfileReviewStorePort;
  incidentId?: () => string;
};

function incident(factory: () => string): string {
  try { const value = factory(); if (/^[A-Za-z0-9_-]{1,128}$/.test(value)) return value; } catch { /* use generated incident */ }
  return crypto.randomUUID();
}

function origin(request: Request): string {
  const value = request.headers.get('origin');
  if (!value || !ORIGINS.has(value)) throw new OspApiError('INVALID_REQUEST');
  return value;
}

function bearer(request: Request): string {
  const value = request.headers.get('authorization');
  const match = value ? /^Bearer ([^\s,]+)$/.exec(value) : null;
  if (!match) throw new OspApiError('UNAUTHORIZED');
  return match[1];
}

function exactPreflightHeaders(value: string | null, required: readonly string[]): boolean {
  if (value === null) return false;
  const names = value.split(',').map((name) => name.trim().toLowerCase());
  return names.length === required.length && new Set(names).size === names.length && names.sort().join(',') === [...required].sort().join(',');
}

function preflightHeaders(url: URL): readonly string[] {
  const action = url.searchParams.get('action');
  if (action === 'list_document_versions') {
    exactQuery(url, ['action']);
    return ['authorization'];
  }
  if (action === 'upload_document_version') {
    exactQuery(url, ['action', 'document_type', 'valid_from']);
    return ['authorization', 'content-type'];
  }
  if (action === 'approve_document_version') {
    exactQuery(url, ['action', 'version_id', 'expected_version', 'review_before_sha256', 'review_after_sha256']);
    return ['authorization'];
  }
  if (['claim_profile_review', 'decide_profile_review_field', 'finalize_profile_review', 'promote_profile_review_facts'].includes(action ?? '')) {
    exactQuery(url, ['action']);
    return ['authorization', 'content-type'];
  }
  throw new OspApiError('INVALID_REQUEST');
}

function permission(verified: VerifiedWorkflowIdentity, required: 'read' | 'operate'): DocumentAuthority {
  const permissions = verified.permissions;
  if (!Array.isArray(permissions) || (required === 'operate' ? !permissions.includes('osp:operate') : !permissions.some((value) => value === 'osp:read' || value === 'osp:operate'))) throw new OspApiError('FORBIDDEN');
  return Object.freeze({ organizationId: verified.identity.organization, subject: verified.identity.subject, permissions });
}

function exactQuery(url: URL, names: readonly string[]): Record<string, string> {
  const entries = [...url.searchParams.entries()];
  if (entries.length !== names.length || new Set(entries.map(([name]) => name)).size !== entries.length) throw new OspApiError('INVALID_REQUEST');
  const actual = entries.map(([name]) => name).sort();
  if (actual.join('\u0000') !== [...names].sort().join('\u0000')) throw new OspApiError('INVALID_REQUEST');
  return Object.fromEntries(entries);
}

async function requireEmptyBody(request: Request): Promise<void> {
  const declared = request.headers.get('content-length');
  if (
    request.headers.has('content-type') ||
    request.headers.has('content-encoding') ||
    request.headers.has('transfer-encoding') ||
    (declared !== null && declared !== '0')
  ) throw new OspApiError('INVALID_REQUEST');
  if (!request.body) return;
  const reader = request.body.getReader();
  const first = await reader.read();
  if (!first.done) {
    try { void reader.cancel().catch(() => undefined); } catch { /* request is already rejected */ }
    throw new OspApiError('INVALID_REQUEST');
  }
}

function declaredLength(request: Request): number | undefined {
  const value = request.headers.get('content-length');
  if (value === null) return undefined;
  if (!/^[0-9]+$/.test(value)) throw new OspApiError('INVALID_REQUEST');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new OspApiError('INVALID_REQUEST');
  if (parsed > BODY_LIMIT_BYTES) throw new OspApiError('CONTENT_TOO_LARGE');
  return parsed;
}

async function bytes(request: Request): Promise<Uint8Array> {
  const expected = declaredLength(request);
  if (!request.body) throw new OspApiError('INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT_BYTES) {
      try { void reader.cancel().catch(() => undefined); } catch { /* limit result is already fixed */ }
      throw new OspApiError('CONTENT_TOO_LARGE');
    }
    chunks.push(value);
  }
  if (total < 1 || (expected !== undefined && expected !== total)) throw new OspApiError('INVALID_REQUEST');
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function strictJsonObject(request: Request, keys: readonly string[]): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' ||
      request.headers.has('content-encoding') || request.headers.has('transfer-encoding')) throw new OspApiError('INVALID_REQUEST');
  const declared = declaredLength(request);
  if (declared !== undefined && declared > 8_192) throw new OspApiError('CONTENT_TOO_LARGE');
  const body = await bytes(request);
  if (body.byteLength > 8_192) throw new OspApiError('CONTENT_TOO_LARGE');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new OspApiError('INVALID_REQUEST'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new OspApiError('INVALID_REQUEST');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join('\u0000') !== [...keys].sort().join('\u0000')) throw new OspApiError('INVALID_REQUEST');
  return record;
}

function positiveRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2_147_483_647) throw new OspApiError('INVALID_REQUEST');
  return revision;
}

function note(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 3 || value.length > 1000 || /[<>]|(?:javascript|data):|https?:\/\//i.test(value)) throw new OspApiError('INVALID_REQUEST');
  return value;
}

function serviceError(error: unknown): OspApiError {
  const code = error instanceof Error ? error.message : '';
  if (code === 'FORBIDDEN') return new OspApiError('FORBIDDEN');
  if (/^(DOCUMENT_UPLOAD_REJECTED|DOCUMENT_APPROVAL_REJECTED|DOCUMENT_REVIEW_HASH_MISMATCH|DOCUMENT_VERSION_CONFLICT|DOCUMENT_NOT_FOUND|DOCUMENT_STORAGE_REJECTED|PROFILE_(?:REVIEW|FIELD|FACT|CORRECTION|WITHHOLD|RESTRICTED|EVIDENCE).*)$/.test(code)) return new OspApiError('INVALID_REQUEST');
  if (/^(DOCUMENT_PERSISTENCE_FAILED|DOCUMENT_STORAGE_(?:TEMPORARY|INTEGRITY)|MALWARE_SCAN_UNAVAILABLE)$/.test(code)) return new OspApiError('DEPENDENCY_UNAVAILABLE');
  return new OspApiError('INTERNAL_ERROR');
}

function errorResponse(error: unknown, incidentId: string, allowedOrigin?: string): Response {
  const response = safeErrorResponse(error, incidentId, allowedOrigin ? postCorsHeaders(allowedOrigin) : {});
  if (response.status === 401) response.headers.set('www-authenticate', 'Bearer realm="osp-document-api"');
  return response;
}

export function createDocumentApiHandler(options: DocumentApiHandlerOptions): (request: Request) => Promise<Response> {
  const nextIncident = options.incidentId ?? crypto.randomUUID;
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      try {
        const allowedOrigin = origin(request);
        const url = new URL(request.url);
        if (!url.pathname.endsWith('/osp-document-api') || url.hash) throw new OspApiError('INVALID_REQUEST');
        const requiredHeaders = preflightHeaders(url);
        if (request.headers.get('access-control-request-method') !== 'POST' || !exactPreflightHeaders(request.headers.get('access-control-request-headers'), requiredHeaders)) throw new OspApiError('INVALID_REQUEST');
        return new Response(null, { status: 204, headers: { ...NO_CACHE_HEADERS, 'access-control-allow-origin': allowedOrigin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': requiredHeaders.join(', '), 'access-control-max-age': '600', vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' } });
      } catch (error) { return errorResponse(error, incident(nextIncident)); }
    }
    const requestOrigin = request.headers.get('origin');
    const allowedOrigin = requestOrigin && ORIGINS.has(requestOrigin) ? requestOrigin : undefined;
    try {
      if (request.method !== 'POST') throw new OspApiError('METHOD_NOT_ALLOWED');
      const allowed = origin(request);
      const url = new URL(request.url);
      if (!url.pathname.endsWith('/osp-document-api') || url.hash) throw new OspApiError('INVALID_REQUEST');
      const token = bearer(request);
      const verified = await options.verifyToken(token, request.signal);
      const action = url.searchParams.get('action');
      if (action === 'list_document_versions') {
        exactQuery(url, ['action']);
        await requireEmptyBody(request);
        const authority = permission(verified, 'read');
        const versions = await options.listVersions(authority.organizationId);
        return jsonResponse({ data: { versions } }, 200, postCorsHeaders(allowed));
      }
      if (action === 'upload_document_version') {
        const query = exactQuery(url, ['action', 'document_type', 'valid_from']);
        const authority = permission(verified, 'read');
        const contentType = request.headers.get('content-type');
        const encoding = request.headers.get('content-encoding');
        if (!contentType || !CONTENT_TYPES.has(contentType) || (encoding && encoding.toLowerCase() !== 'identity') || request.headers.has('transfer-encoding') || !DOCUMENT_TYPES.has(query.document_type) || !DATE.test(query.valid_from)) throw new OspApiError('UNSUPPORTED_MEDIA_TYPE');
        const result = await options.documentService.upload(authority, { documentType: query.document_type as DocumentUploadInput['documentType'], contentType, validFrom: query.valid_from, bytes: await bytes(request) });
        return jsonResponse({ data: result }, 201, postCorsHeaders(allowed));
      }
      if (action === 'approve_document_version') {
        const query = exactQuery(url, ['action', 'version_id', 'expected_version', 'review_before_sha256', 'review_after_sha256']);
        await requireEmptyBody(request);
        const authority = permission(verified, 'operate');
        const expectedVersion = Number(query.expected_version);
        if (!UUID.test(query.version_id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !SHA.test(query.review_before_sha256) || !SHA.test(query.review_after_sha256)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.documentService.approve(authority, { versionId: query.version_id, expectedVersion, reviewBeforeSha256: query.review_before_sha256, reviewAfterSha256: query.review_after_sha256 });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      if (action === 'claim_profile_review') {
        exactQuery(url, ['action']);
        const authority = permission(verified, 'operate');
        const body = await strictJsonObject(request, ['expectedRevision', 'reviewId']);
        if (typeof body.reviewId !== 'string' || !UUID.test(body.reviewId)) throw new OspApiError('INVALID_REQUEST');
        if (!options.profileReviewStore) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
        const result = await options.profileReviewStore.claimProfileReview({ organizationId: authority.organizationId, reviewId: body.reviewId, expectedRevision: positiveRevision(body.expectedRevision), actorSubject: authority.subject, actorPermission: 'osp:operate' });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      if (action === 'decide_profile_review_field') {
        exactQuery(url, ['action']);
        const authority = permission(verified, 'operate');
        const body = await strictJsonObject(request, ['decision', 'decisionNote', 'expectedRevision', 'fieldId', 'reviewId', 'reviewerValue']);
        if (typeof body.reviewId !== 'string' || !UUID.test(body.reviewId) || typeof body.fieldId !== 'string' || !UUID.test(body.fieldId) ||
            typeof body.decision !== 'string' || !['accepted', 'corrected', 'rejected', 'withheld'].includes(body.decision)) throw new OspApiError('INVALID_REQUEST');
        const decision = body.decision as ProfileReviewFieldDecisionInput['decision'];
        if ((decision === 'corrected') !== (body.reviewerValue !== null)) throw new OspApiError('INVALID_REQUEST');
        if (!options.profileReviewStore) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
        const result = await options.profileReviewStore.decideProfileReviewField({ organizationId: authority.organizationId, reviewId: body.reviewId, fieldId: body.fieldId, expectedRevision: positiveRevision(body.expectedRevision), decision, decisionNote: note(body.decisionNote), reviewerValue: body.reviewerValue, actorSubject: authority.subject, actorPermission: 'osp:operate' });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      if (action === 'finalize_profile_review') {
        exactQuery(url, ['action']);
        const authority = permission(verified, 'operate');
        const body = await strictJsonObject(request, ['decision', 'decisionNote', 'expectedRevision', 'reviewId']);
        if (typeof body.reviewId !== 'string' || !UUID.test(body.reviewId) || typeof body.decision !== 'string' || !['approved', 'rejected', 'changes_required'].includes(body.decision)) throw new OspApiError('INVALID_REQUEST');
        if (!options.profileReviewStore) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
        const result = await options.profileReviewStore.finalizeProfileReview({ organizationId: authority.organizationId, reviewId: body.reviewId, expectedRevision: positiveRevision(body.expectedRevision), decision: body.decision as ProfileReviewFinalizationInput['decision'], decisionNote: note(body.decisionNote), actorSubject: authority.subject, actorPermission: 'osp:operate' });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      if (action === 'promote_profile_review_facts') {
        exactQuery(url, ['action']);
        const authority = permission(verified, 'operate');
        const body = await strictJsonObject(request, ['candidateSha256', 'confirmation', 'expectedCurrentFactIds', 'expectedRevision', 'reviewId']);
        if (typeof body.reviewId !== 'string' || !UUID.test(body.reviewId) || typeof body.candidateSha256 !== 'string' || !SHA.test(body.candidateSha256) ||
            body.confirmation !== 'PROMOTE_VERIFIED_PROFILE_FACTS' || !body.expectedCurrentFactIds || typeof body.expectedCurrentFactIds !== 'object' || Array.isArray(body.expectedCurrentFactIds)) throw new OspApiError('INVALID_REQUEST');
        const expectedCurrentFactIds = body.expectedCurrentFactIds as Record<string, unknown>;
        const expectations = Object.entries(expectedCurrentFactIds);
        if (expectations.length > 128 || expectations.some(([key, value]) => !/^[a-z][a-z0-9_]{1,127}$/.test(key) || !(value === null || typeof value === 'string' && UUID.test(value)))) throw new OspApiError('INVALID_REQUEST');
        if (!options.profileReviewStore?.promoteProfileReviewFacts) throw new OspApiError('DEPENDENCY_UNAVAILABLE');
        const result = await options.profileReviewStore.promoteProfileReviewFacts({
          organizationId: authority.organizationId,
          reviewId: body.reviewId,
          expectedRevision: positiveRevision(body.expectedRevision),
          candidateSha256: body.candidateSha256,
          expectedCurrentFactIds: expectedCurrentFactIds as Record<string, string | null>,
          actorSubject: authority.subject,
          actorPermission: 'osp:operate',
        });
        return jsonResponse({ data: result }, 200, postCorsHeaders(allowed));
      }
      throw new OspApiError('INVALID_REQUEST');
    } catch (error) {
      const normalized = error instanceof OspApiError ? error : serviceError(error);
      return errorResponse(normalized, incident(nextIncident), allowedOrigin);
    }
  };
}
