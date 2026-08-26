export const OSP_PUBLIC_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'METHOD_NOT_ALLOWED',
  'CONTENT_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'WORKSPACE_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type OspPublicErrorCode = typeof OSP_PUBLIC_ERROR_CODES[number];

export type OspSafeError = {
  error: {
    code: OspPublicErrorCode;
    incident_id: string;
  };
};

export const OSP_STATUS_BY_ERROR_CODE: Readonly<Record<OspPublicErrorCode, number>> = Object.freeze({
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

export class OspApiError extends Error {
  readonly code: OspPublicErrorCode;

  constructor(code: OspPublicErrorCode) {
    super(code);
    this.name = 'OspApiError';
    this.code = code;
  }
}

export const NO_CACHE_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  pragma: 'no-cache',
});

export function postCorsHeaders(origin: string): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...NO_CACHE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function safeErrorResponse(
  error: unknown,
  incidentId: string,
  extraHeaders: HeadersInit = {},
): Response {
  const candidate = error instanceof OspApiError ? error.code : undefined;
  const code: OspPublicErrorCode = typeof candidate === 'string' &&
      OSP_PUBLIC_ERROR_CODES.includes(candidate as OspPublicErrorCode)
    ? candidate as OspPublicErrorCode
    : 'INTERNAL_ERROR';
  const headers = new Headers({ ...NO_CACHE_HEADERS, ...extraHeaders });
  headers.set('content-type', 'application/json; charset=utf-8');
  if (code === 'METHOD_NOT_ALLOWED') headers.set('allow', 'POST, OPTIONS');
  if (code === 'UNAUTHORIZED') headers.set('www-authenticate', 'Bearer realm="osp-read-api"');
  const body: OspSafeError = {
    error: { code, incident_id: incidentId },
  };
  return new Response(JSON.stringify(body), {
    status: OSP_STATUS_BY_ERROR_CODE[code],
    headers,
  });
}
