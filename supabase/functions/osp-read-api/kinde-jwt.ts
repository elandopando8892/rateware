import {
  base64url,
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'npm:jose@5.9.6';

import { requireOspIdentity, type OspAuthorizationIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';
import type {
  VerifiedApprovalIdentity,
  VerifiedWorkflowIdentity,
} from '../_shared/osp/workflow-authority.ts';

const OSP_API_AUDIENCE = 'https://osp.heymarksman.com/api';
const CLOCK_TOLERANCE_SECONDS = 30;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const JWKS_REFRESH_COOLDOWN_MS = 30_000;
const JWKS_MAX_AGE_MS = 600_000;

export type KindeJwtVerifier = {
  verify(token: string, signal?: AbortSignal): Promise<OspAuthorizationIdentity>;
  verifyWorkflow(token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity>;
  verifyApproval(token: string, signal?: AbortSignal): Promise<VerifiedApprovalIdentity>;
};

export type KindeJwtVerifierOptions = {
  issuer: string;
  clientId: string;
  audience?: string;
  jwksFetch: typeof fetch;
  clock?: () => number;
  elapsedClock?: () => number;
};

function isJsonWebKeySet(value: unknown): value is JSONWebKeySet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = (value as Record<string, unknown>).keys;
  return Array.isArray(keys) && keys.every((key) => key && typeof key === 'object' && !Array.isArray(key));
}

function requireCanonicalCompactJwt(token: string): void {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment === '' || !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new OspApiError('UNAUTHORIZED');
  }
  try {
    for (const [index, segment] of segments.entries()) {
      const decoded = base64url.decode(segment);
      if (base64url.encode(decoded) !== segment) throw new OspApiError('UNAUTHORIZED');
      if (index < 2) new TextDecoder('utf-8', { fatal: true }).decode(decoded);
    }
  } catch {
    throw new OspApiError('UNAUTHORIZED');
  }
}

function isRefreshableVerificationFailure(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' || code === 'ERR_JWKS_NO_MATCHING_KEY';
}

function canonicalWorkflowPermissions(payload: Record<string, unknown>): readonly string[] {
  const permissions = payload.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0 ||
      permissions.some((permission) => typeof permission !== 'string' || permission.trim() === '' ||
        permission.trim() !== permission || ![
          'osp:read', 'osp:operate', 'osp:signature-approve',
          'osp:sales-authorize', 'osp:send-authorized',
        ].includes(permission))) {
    throw new OspApiError('FORBIDDEN');
  }
  const canonical = [...permissions].sort();
  if (new Set(canonical).size !== canonical.length) throw new OspApiError('FORBIDDEN');
  return Object.freeze(canonical);
}

function canonicalApprovalSession(payload: Record<string, unknown>): Pick<
  VerifiedApprovalIdentity,
  'authorizationSessionId' | 'authorizationSessionIssuedAt'
> {
  const sessionId = payload.sid;
  const authTime = payload.auth_time;
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9:_-]{1,256}$/.test(sessionId) ||
      typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime < 0) {
    throw new OspApiError('FORBIDDEN');
  }
  const issuedAt = new Date(authTime * 1000);
  if (Number.isNaN(issuedAt.getTime())) throw new OspApiError('FORBIDDEN');
  return Object.freeze({
    authorizationSessionId: sessionId,
    authorizationSessionIssuedAt: issuedAt.toISOString(),
  });
}

type JwksSnapshot = {
  document: JSONWebKeySet;
  getKey: JWTVerifyGetKey;
  loadedAt: number;
};

type JwksFlight = {
  controller: AbortController;
  promise: Promise<JwksSnapshot>;
  cancelled: boolean;
  settled: boolean;
  waiters: number;
};

export function createKindeJwtVerifier({
  issuer,
  clientId,
  audience = OSP_API_AUDIENCE,
  jwksFetch,
  clock = Date.now,
  elapsedClock = () => performance.now(),
}: KindeJwtVerifierOptions): KindeJwtVerifier {
  const jwksUrl = new URL('/.well-known/jwks.json', issuer);
  let cached: JwksSnapshot | undefined;
  let flight: JwksFlight | undefined;
  let lastInitialFailureAt: number | undefined;
  let lastRefreshAttemptAt: number | undefined;

  const fetchJwks = async (signal: AbortSignal): Promise<JwksSnapshot> => {
    try {
      const response = await jwksFetch(jwksUrl, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS)]),
      });
      if (!response.ok) throw new OspApiError('UNAUTHORIZED');
      const document: unknown = await response.json();
      if (!isJsonWebKeySet(document)) throw new OspApiError('UNAUTHORIZED');
      return { document, getKey: createLocalJWKSet(document), loadedAt: elapsedClock() };
    } catch {
      throw new OspApiError('UNAUTHORIZED');
    }
  };

  const startFlight = (kind: 'initial' | 'refresh'): JwksFlight => {
    const controller = new AbortController();
    const active = {
      controller,
      cancelled: false,
      settled: false,
      waiters: 0,
      promise: undefined as unknown as Promise<JwksSnapshot>,
    };
    flight = active;
    active.promise = (async () => {
      try {
        const loaded = await fetchJwks(controller.signal);
        if (!active.cancelled) {
          cached = loaded;
          lastInitialFailureAt = undefined;
          if (kind === 'refresh') lastRefreshAttemptAt = elapsedClock();
        }
        return loaded;
      } catch {
        if (!active.cancelled) {
          const failedAt = elapsedClock();
          if (kind === 'initial') lastInitialFailureAt = failedAt;
          if (kind === 'refresh') lastRefreshAttemptAt = failedAt;
        }
        throw new OspApiError('UNAUTHORIZED');
      } finally {
        active.settled = true;
        if (flight === active) flight = undefined;
      }
    })();
    active.promise.catch(() => undefined);
    return active;
  };

  const joinFlight = async (active: JwksFlight, signal?: AbortSignal): Promise<JwksSnapshot> => {
    if (signal?.aborted) throw new OspApiError('UNAUTHORIZED');
    active.waiters += 1;
    let aborted = false;
    let onAbort: (() => void) | undefined;
    try {
      if (!signal) return await active.promise;
      return await new Promise<JwksSnapshot>((resolve, reject) => {
        onAbort = () => {
          aborted = true;
          reject(new OspApiError('UNAUTHORIZED'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        active.promise.then(resolve, reject);
      });
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      active.waiters -= 1;
      if (aborted && active.waiters === 0 && !active.settled) {
        active.cancelled = true;
        if (flight === active) flight = undefined;
        active.controller.abort();
      }
    }
  };

  const loadJwks = async (kind: 'initial' | 'refresh', signal?: AbortSignal): Promise<JwksSnapshot> => {
    if (signal?.aborted) throw new OspApiError('UNAUTHORIZED');
    if (flight) return await joinFlight(flight, signal);
    const now = elapsedClock();
    if (kind === 'initial' && lastInitialFailureAt !== undefined &&
        now - lastInitialFailureAt < JWKS_REFRESH_COOLDOWN_MS) {
      throw new OspApiError('UNAUTHORIZED');
    }
    if (kind === 'refresh' && lastRefreshAttemptAt !== undefined &&
        now - lastRefreshAttemptAt < JWKS_REFRESH_COOLDOWN_MS) {
      throw new OspApiError('UNAUTHORIZED');
    }
    return await joinFlight(startFlight(kind), signal);
  };

  const verifyJwt = async (token: string, snapshot: JwksSnapshot) => {
    return await jwtVerify(token, snapshot.getKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: new Date(clock()),
    });
  };

  const verifyPayload = async (token: string, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    try {
      if (signal?.aborted) throw new OspApiError('UNAUTHORIZED');
      if (typeof token !== 'string' || token === '' || token.trim() !== token) {
        throw new OspApiError('UNAUTHORIZED');
      }
      requireCanonicalCompactJwt(token);
      const header = decodeProtectedHeader(token);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid === '') {
        throw new OspApiError('UNAUTHORIZED');
      }

      let active = cached ?? await loadJwks('initial', signal);
      let refreshed = false;
      if (elapsedClock() - active.loadedAt >= JWKS_MAX_AGE_MS) {
        active = await loadJwks('refresh', signal);
        refreshed = true;
      }
      if (!active.document.keys.some((key) => key.kid === header.kid)) {
        active = await loadJwks('refresh', signal);
        refreshed = true;
      }
      let verified;
      try {
        verified = await verifyJwt(token, active);
      } catch (error) {
        if (refreshed || !isRefreshableVerificationFailure(error)) throw error;
        active = await loadJwks('refresh', signal);
        refreshed = true;
        verified = await verifyJwt(token, active);
      }
      return verified.payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof OspApiError) throw error;
      throw new OspApiError('UNAUTHORIZED');
    }
  };

  const requireIdentity = (payload: Record<string, unknown>): OspAuthorizationIdentity => {
    return requireOspIdentity(payload, {
        issuer,
        audience,
        clientId,
        nowEpochSeconds: () => Math.floor(clock() / 1_000),
        clockToleranceSeconds: CLOCK_TOLERANCE_SECONDS,
      });
  };

  const verify = async (token: string, signal?: AbortSignal): Promise<OspAuthorizationIdentity> => {
    return requireIdentity(await verifyPayload(token, signal));
  };

  const verifyWorkflow = async (token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity> => {
    const payload = await verifyPayload(token, signal);
    return Object.freeze({
      identity: requireIdentity(payload),
      permissions: canonicalWorkflowPermissions(payload),
    });
  };

  const verifyApproval = async (token: string, signal?: AbortSignal): Promise<VerifiedApprovalIdentity> => {
    const payload = await verifyPayload(token, signal);
    return Object.freeze({
      identity: requireIdentity(payload),
      permissions: canonicalWorkflowPermissions(payload),
      ...canonicalApprovalSession(payload),
    });
  };

  return Object.freeze({ verify, verifyWorkflow, verifyApproval });
}
