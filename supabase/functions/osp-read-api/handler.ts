import { parseOspReadRequest } from './actions.ts';
import type { OspAuthorizationIdentity } from './auth-policy.ts';
import {
  jsonResponse,
  NO_CACHE_HEADERS,
  OspApiError,
  postCorsHeaders,
  safeErrorResponse,
} from './http.ts';
import { getCorporateProfile, getCustomerRegistrationCase, getGmailHealth, listCustomerRegistrationCases, listOnboardingWorkspace } from './read-models.ts';
import type { OspReadStore } from './store.ts';
import { resolveWorkspace } from './workspace.ts';

const BODY_LIMIT_BYTES = 1_024;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:8791',
  'https://osp.heymarksman.com',
]);
const PREFLIGHT_ALLOW_HEADERS = ['authorization', 'content-type'] as const;

export type OspReadHandlerOptions = {
  verifyToken(token: string, signal?: AbortSignal): Promise<OspAuthorizationIdentity>;
  store: OspReadStore;
  incidentId?: () => string;
};

function nextIncidentId(factory: () => string): string {
  try {
    const value = factory();
    if (/^[A-Za-z0-9_-]{1,128}$/.test(value)) return value;
  } catch {
    // A request still receives a safe opaque incident identifier.
  }
  return crypto.randomUUID();
}

function requireAllowedOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) throw new OspApiError('INVALID_REQUEST');
  return origin;
}

function validateContentType(request: Request): void {
  const raw = request.headers.get('content-type');
  if (!raw) throw new OspApiError('UNSUPPORTED_MEDIA_TYPE');
  const parts = raw.split(';').map((part) => part.trim());
  if (parts[0].toLowerCase() !== 'application/json' || parts.length > 2 ||
      (parts.length === 2 && !/^charset\s*=\s*utf-8$/i.test(parts[1]))) {
    throw new OspApiError('UNSUPPORTED_MEDIA_TYPE');
  }
}

function validateContentEncoding(request: Request): void {
  const encoding = request.headers.get('content-encoding');
  if (encoding !== null && encoding.trim() !== '' && encoding.trim().toLowerCase() !== 'identity') {
    throw new OspApiError('UNSUPPORTED_MEDIA_TYPE');
  }
}

function validateTransferEncoding(request: Request): void {
  if (request.headers.has('transfer-encoding')) throw new OspApiError('INVALID_REQUEST');
}

function validateDeclaredLength(request: Request): number | undefined {
  const declared = request.headers.get('content-length');
  if (declared === null) return undefined;
  if (!/^[0-9]+$/.test(declared)) throw new OspApiError('INVALID_REQUEST');
  try {
    const length = BigInt(declared);
    if (length > BigInt(BODY_LIMIT_BYTES)) throw new OspApiError('CONTENT_TOO_LARGE');
    return Number(length);
  } catch (error) {
    if (error instanceof OspApiError) throw error;
    throw new OspApiError('INVALID_REQUEST');
  }
}

function requireBearer(request: Request): string {
  const authorization = request.headers.get('authorization');
  const match = authorization ? /^Bearer ([^\s,]+)$/.exec(authorization) : null;
  if (!match) throw new OspApiError('UNAUTHORIZED');
  return match[1];
}

function skipJsonString(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') return index + 1;
    index += 1;
  }
  throw new OspApiError('INVALID_REQUEST');
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function skipJsonValue(text: string, start: number): number {
  let index = skipWhitespace(text, start);
  if (text[index] === '"') return skipJsonString(text, index);
  if (text[index] === '{') {
    index = skipWhitespace(text, index + 1);
    if (text[index] === '}') return index + 1;
    while (index < text.length) {
      if (text[index] !== '"') throw new OspApiError('INVALID_REQUEST');
      index = skipWhitespace(text, skipJsonString(text, index));
      if (text[index] !== ':') throw new OspApiError('INVALID_REQUEST');
      index = skipWhitespace(text, skipJsonValue(text, index + 1));
      if (text[index] === '}') return index + 1;
      if (text[index] !== ',') throw new OspApiError('INVALID_REQUEST');
      index = skipWhitespace(text, index + 1);
    }
  }
  if (text[index] === '[') {
    index = skipWhitespace(text, index + 1);
    if (text[index] === ']') return index + 1;
    while (index < text.length) {
      index = skipWhitespace(text, skipJsonValue(text, index));
      if (text[index] === ']') return index + 1;
      if (text[index] !== ',') throw new OspApiError('INVALID_REQUEST');
      index = skipWhitespace(text, index + 1);
    }
  }
  while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1;
  return index;
}

function rejectDuplicateTopLevelKeys(text: string): void {
  let index = skipWhitespace(text, 0);
  if (text[index] !== '{') return;
  index = skipWhitespace(text, index + 1);
  const keys = new Set<string>();
  if (text[index] === '}') return;
  while (index < text.length) {
    if (text[index] !== '"') throw new OspApiError('INVALID_REQUEST');
    const end = skipJsonString(text, index);
    const key = JSON.parse(text.slice(index, end));
    if (typeof key !== 'string' || keys.has(key)) throw new OspApiError('INVALID_REQUEST');
    keys.add(key);
    index = skipWhitespace(text, end);
    if (text[index] !== ':') throw new OspApiError('INVALID_REQUEST');
    index = skipWhitespace(text, skipJsonValue(text, index + 1));
    if (text[index] === '}') return;
    if (text[index] !== ',') throw new OspApiError('INVALID_REQUEST');
    index = skipWhitespace(text, index + 1);
  }
  throw new OspApiError('INVALID_REQUEST');
}

async function readStrictJson(request: Request, declaredLength: number | undefined): Promise<unknown> {
  if (!request.body) throw new OspApiError('INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT_BYTES) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // The public result is determined solely by the byte limit.
      }
      throw new OspApiError('CONTENT_TOO_LARGE');
    }
    chunks.push(value);
  }
  if (declaredLength !== undefined && declaredLength !== length) throw new OspApiError('INVALID_REQUEST');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    rejectDuplicateTopLevelKeys(text);
    return parsed;
  } catch {
    throw new OspApiError('INVALID_REQUEST');
  }
}

function requestedHeaderNames(request: Request): string[] {
  const raw = request.headers.get('access-control-request-headers');
  if (raw === null || raw.trim() === '') return [];
  const names = raw.split(',').map((name) => name.trim().toLowerCase());
  if (names.some((name) => name === '') || new Set(names).size !== names.length ||
      names.some((name) => !PREFLIGHT_ALLOW_HEADERS.includes(name as typeof PREFLIGHT_ALLOW_HEADERS[number]))) {
    throw new OspApiError('INVALID_REQUEST');
  }
  return names;
}

function handlePreflight(request: Request, incidentFactory: () => string): Response {
  try {
    const origin = requireAllowedOrigin(request);
    if (request.headers.get('access-control-request-method') !== 'POST') {
      throw new OspApiError('INVALID_REQUEST');
    }
    requestedHeaderNames(request);
    return new Response(null, {
      status: 204,
      headers: {
        ...NO_CACHE_HEADERS,
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
        vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      },
    });
  } catch (error) {
    return safeErrorResponse(error, nextIncidentId(incidentFactory));
  }
}

export function createOspReadHandler({
  verifyToken,
  store,
  incidentId = () => crypto.randomUUID(),
}: OspReadHandlerOptions): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return handlePreflight(request, incidentId);

    const requestOrigin = request.headers.get('origin');
    const allowedOrigin = request.method === 'POST' && requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : undefined;
    try {
      if (request.method !== 'POST') throw new OspApiError('METHOD_NOT_ALLOWED');
      validateContentType(request);
      validateContentEncoding(request);
      validateTransferEncoding(request);
      const declaredLength = validateDeclaredLength(request);
      const origin = requireAllowedOrigin(request);
      const identity = await verifyToken(requireBearer(request), request.signal);
      const parsed = parseOspReadRequest(await readStrictJson(request, declaredLength));
      const organizationId = await resolveWorkspace(store, identity, request.signal);
      let data;
      if (parsed.action === 'list_provider_onboarding_workspace') {
        data = await listOnboardingWorkspace(store, organizationId, request.signal);
      } else if (parsed.action === 'provider_gmail_status') {
        data = await getGmailHealth(store, organizationId, request.signal);
      } else if (parsed.action === 'list_customer_registration_cases') {
        data = await listCustomerRegistrationCases(store, organizationId, request.signal);
      } else if (parsed.action === 'get_corporate_profile') {
        data = await getCorporateProfile(store, organizationId, request.signal);
      } else if ('case_id' in parsed) {
        data = await getCustomerRegistrationCase(store, organizationId, parsed.case_id, request.signal);
      } else {
        throw new OspApiError('INVALID_REQUEST');
      }
      return jsonResponse({ version: 1, data }, 200, postCorsHeaders(origin));
    } catch (error) {
      const cors = allowedOrigin ? postCorsHeaders(allowedOrigin) : {};
      return safeErrorResponse(error, nextIncidentId(incidentId), cors);
    }
  };
}
