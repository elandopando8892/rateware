import type { VerifiedWorkflowIdentity } from '../_shared/osp/workflow-authority.ts';
import { jsonResponse, NO_CACHE_HEADERS, OspApiError, postCorsHeaders, safeErrorResponse } from '../osp-read-api/http.ts';
import { surveyJsonToCanonical } from '../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts';
import type { FormStore } from './store.ts';

const ORIGINS = new Set(['http://localhost:8791', 'https://osp.heymarksman.com']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const BODY_LIMIT = 1_048_576;

export type FormApiHandlerOptions = {
  verifyToken(token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity>;
  store: FormStore;
  canonicalFieldIds: readonly string[];
  incidentId?: () => string;
};

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OspApiError('INVALID_REQUEST');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join('\u0000') !== [...keys].sort().join('\u0000')) throw new OspApiError('INVALID_REQUEST');
  return row;
}

function safeName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 3 || value.length > 128 || /[<>]|(?:javascript|data):|https?:\/\//i.test(value)) throw new OspApiError('INVALID_REQUEST');
  return value;
}

function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > 2_147_483_647) throw new OspApiError('INVALID_REQUEST');
  return value as number;
}

function safeFormValue(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 10_000;
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => safeFormValue(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 50 && entries.every(([key, item]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) && safeFormValue(item, depth + 1));
}

function formValues(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OspApiError('INVALID_REQUEST');
  const values = value as Record<string, unknown>;
  if (Object.keys(values).length > 200 || Object.entries(values).some(([key, item]) => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || !safeFormValue(item))) throw new OspApiError('INVALID_REQUEST');
  return values;
}

function origin(request: Request): string {
  const value = request.headers.get('origin');
  if (!value || !ORIGINS.has(value)) throw new OspApiError('INVALID_REQUEST');
  return value;
}

function bearer(request: Request): string {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new OspApiError('UNAUTHORIZED');
  return match[1];
}

function canRead(verified: VerifiedWorkflowIdentity): boolean {
  return verified.permissions.includes('osp:read') || verified.permissions.includes('osp:operate') || verified.permissions.includes('osp:superuser');
}

function canOperate(verified: VerifiedWorkflowIdentity): boolean {
  return verified.permissions.includes('osp:operate') || verified.permissions.includes('osp:superuser');
}

async function body(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' || request.headers.has('content-encoding') || request.headers.has('transfer-encoding')) throw new OspApiError('UNSUPPORTED_MEDIA_TYPE');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) throw new OspApiError('CONTENT_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < 2 || bytes.byteLength > BODY_LIMIT || (declared !== null && Number(declared) !== bytes.byteLength)) throw new OspApiError('INVALID_REQUEST');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new OspApiError('INVALID_REQUEST'); }
}

function serviceError(error: unknown): OspApiError {
  const code = error instanceof Error ? error.message : '';
  if (/^(FORM_|CASE_|SNAPSHOT_|VERSION_|IDEMPOTENCY_)/.test(code)) return new OspApiError('INVALID_REQUEST');
  if (/^(DATABASE_|PERSISTENCE_)/.test(code)) return new OspApiError('DEPENDENCY_UNAVAILABLE');
  return new OspApiError('INTERNAL_ERROR');
}

export function createFormApiHandler(options: FormApiHandlerOptions): (request: Request) => Promise<Response> {
  const incident = options.incidentId ?? crypto.randomUUID;
  return async (request) => {
    const requestOrigin = request.headers.get('origin');
    const allowedOrigin = requestOrigin && ORIGINS.has(requestOrigin) ? requestOrigin : undefined;
    try {
      if (request.method === 'OPTIONS') {
        const allowed = origin(request);
        const url = new URL(request.url);
        const headers = (request.headers.get('access-control-request-headers') ?? '').split(',').map((name) => name.trim().toLowerCase()).sort();
        if (!url.pathname.endsWith('/osp-form-api') || url.search || url.hash || request.headers.get('access-control-request-method') !== 'POST' || headers.join(',') !== 'authorization,content-type') throw new OspApiError('INVALID_REQUEST');
        return new Response(null, { status: 204, headers: { ...NO_CACHE_HEADERS, 'access-control-allow-origin': allowed, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600', vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' } });
      }
      if (request.method !== 'POST') throw new OspApiError('METHOD_NOT_ALLOWED');
      const allowed = origin(request);
      const url = new URL(request.url);
      if (!url.pathname.endsWith('/osp-form-api') || url.search || url.hash) throw new OspApiError('INVALID_REQUEST');
      const payload = await body(request);
      const verified = await options.verifyToken(bearer(request), request.signal);
      if (!canRead(verified)) throw new OspApiError('FORBIDDEN');
      if ((payload as { action?: unknown })?.action === 'list_form_templates') {
        exact(payload, ['action', 'version']);
        if ((payload as { version?: unknown }).version !== 1) throw new OspApiError('INVALID_REQUEST');
        return jsonResponse({ version: 1, data: { templates: await options.store.list(verified.identity.organization), capabilities: { saveDraft: canOperate(verified), publish: canOperate(verified) } } }, 200, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'get_case_form_workspace') {
        const row = exact(payload, ['action', 'case_id', 'version']);
        if (row.version !== 1 || row.action !== 'get_case_form_workspace' || typeof row.case_id !== 'string' || !UUID.test(row.case_id)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.getCaseFormWorkspace(verified.identity.organization, row.case_id);
        const { saveDraftAllowed, acceptMappingAllowed, correctMappingAllowed, submitForReviewAllowed, ...workspace } = result;
        return jsonResponse({ version: 1, data: { ...workspace, capabilities: { saveDraft: canOperate(verified) && saveDraftAllowed, acceptMapping: canOperate(verified) && acceptMappingAllowed, correctMapping: canOperate(verified) && correctMappingAllowed, submitForReview: canOperate(verified) && submitForReviewAllowed } } }, 200, postCorsHeaders(allowed));
      }
      if (!canOperate(verified)) throw new OspApiError('FORBIDDEN');
      if ((payload as { action?: unknown })?.action === 'save_form_template_draft') {
        const row = exact(payload, ['action', 'expected_version', 'idempotency_key', 'name', 'survey_json', 'template_id', 'version']);
        if (row.version !== 1 || row.action !== 'save_form_template_draft' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || !(row.template_id === null || typeof row.template_id === 'string' && UUID.test(row.template_id))) throw new OspApiError('INVALID_REQUEST');
        const expectedVersion = integer(row.expected_version, row.template_id === null ? 0 : 1);
        if (row.template_id === null && expectedVersion !== 0) throw new OspApiError('INVALID_REQUEST');
        let canonical;
        try {
          canonical = await surveyJsonToCanonical(row.survey_json, { templateId: row.template_id as string | null ?? crypto.randomUUID(), versionId: crypto.randomUUID(), version: Math.max(1, expectedVersion + 1), status: 'draft', canonicalFieldIds: options.canonicalFieldIds });
        } catch { throw new OspApiError('INVALID_REQUEST'); }
        const result = await options.store.saveDraft({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, templateId: row.template_id as string | null, expectedVersion, name: safeName(row.name), fields: canonical.fields, schemaSha256: canonical.schemaSha256 });
        return jsonResponse({ version: 1, data: result }, 201, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'publish_form_template') {
        const row = exact(payload, ['action', 'expected_version', 'idempotency_key', 'template_id', 'template_version_id', 'version']);
        if (row.version !== 1 || row.action !== 'publish_form_template' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || typeof row.template_id !== 'string' || !UUID.test(row.template_id) || typeof row.template_version_id !== 'string' || !UUID.test(row.template_version_id)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.publish({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, templateId: row.template_id, templateVersionId: row.template_version_id, expectedVersion: integer(row.expected_version, 1) });
        return jsonResponse({ version: 1, data: result }, 200, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'save_case_form_draft') {
        const row = exact(payload, ['action', 'case_id', 'expected_version', 'idempotency_key', 'instance_id', 'template_version_id', 'values', 'version']);
        if (row.version !== 1 || row.action !== 'save_case_form_draft' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || typeof row.case_id !== 'string' || !UUID.test(row.case_id) || typeof row.template_version_id !== 'string' || !UUID.test(row.template_version_id) || !(row.instance_id === null || typeof row.instance_id === 'string' && UUID.test(row.instance_id))) throw new OspApiError('INVALID_REQUEST');
        const expectedVersion = integer(row.expected_version, row.instance_id === null ? 0 : 1);
        if ((row.instance_id === null) !== (expectedVersion === 0)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.saveCaseFormDraft({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, caseId: row.case_id, templateVersionId: row.template_version_id, instanceId: row.instance_id as string | null, expectedVersion, values: formValues(row.values) });
        return jsonResponse({ version: 1, data: result }, 200, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'accept_case_form_mapping') {
        const row = exact(payload, ['action', 'case_id', 'expected_after_sha256', 'expected_mapping_version', 'idempotency_key', 'mapping_id', 'version']);
        if (row.version !== 1 || row.action !== 'accept_case_form_mapping' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || typeof row.case_id !== 'string' || !UUID.test(row.case_id) || typeof row.mapping_id !== 'string' || !UUID.test(row.mapping_id) || typeof row.expected_after_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.expected_after_sha256)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.acceptCaseFormMapping({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, caseId: row.case_id, mappingId: row.mapping_id, expectedMappingVersion: integer(row.expected_mapping_version, 1), expectedAfterSha256: row.expected_after_sha256 });
        return jsonResponse({ version: 1, data: result }, 200, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'correct_case_form_mapping') {
        const row = exact(payload, ['action', 'case_id', 'expected_after_sha256', 'expected_instance_version', 'expected_mapping_version', 'idempotency_key', 'instance_id', 'mapping_id', 'version']);
        if (row.version !== 1 || row.action !== 'correct_case_form_mapping' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || typeof row.case_id !== 'string' || !UUID.test(row.case_id) || typeof row.mapping_id !== 'string' || !UUID.test(row.mapping_id) || typeof row.instance_id !== 'string' || !UUID.test(row.instance_id) || typeof row.expected_after_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.expected_after_sha256)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.correctCaseFormMapping({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, caseId: row.case_id, mappingId: row.mapping_id, expectedMappingVersion: integer(row.expected_mapping_version, 1), expectedAfterSha256: row.expected_after_sha256, instanceId: row.instance_id, expectedInstanceVersion: integer(row.expected_instance_version, 1) });
        return jsonResponse({ version: 1, data: result }, 200, postCorsHeaders(allowed));
      }
      if ((payload as { action?: unknown })?.action === 'submit_case_form_for_review') {
        const row = exact(payload, ['action', 'case_id', 'expected_case_version', 'expected_version', 'idempotency_key', 'instance_id', 'template_version_id', 'values', 'version']);
        if (row.version !== 1 || row.action !== 'submit_case_form_for_review' || typeof row.idempotency_key !== 'string' || !OPAQUE.test(row.idempotency_key) || typeof row.case_id !== 'string' || !UUID.test(row.case_id) || typeof row.template_version_id !== 'string' || !UUID.test(row.template_version_id) || !(row.instance_id === null || typeof row.instance_id === 'string' && UUID.test(row.instance_id))) throw new OspApiError('INVALID_REQUEST');
        const expectedVersion = integer(row.expected_version, row.instance_id === null ? 0 : 1);
        if ((row.instance_id === null) !== (expectedVersion === 0)) throw new OspApiError('INVALID_REQUEST');
        const result = await options.store.submitCaseFormForReview({ organizationId: verified.identity.organization, subject: verified.identity.subject, idempotencyKey: row.idempotency_key, caseId: row.case_id, expectedCaseVersion: integer(row.expected_case_version, 0), templateVersionId: row.template_version_id, instanceId: row.instance_id as string | null, expectedVersion, values: formValues(row.values) });
        return jsonResponse({ version: 1, data: result }, 200, postCorsHeaders(allowed));
      }
      throw new OspApiError('INVALID_REQUEST');
    } catch (error) {
      const response = safeErrorResponse(error instanceof OspApiError ? error : serviceError(error), (() => { try { return incident(); } catch { return crypto.randomUUID(); } })(), allowedOrigin ? postCorsHeaders(allowedOrigin) : {});
      if (response.status === 401) response.headers.set('www-authenticate', 'Bearer realm="osp-form-api"');
      return response;
    }
  };
}
