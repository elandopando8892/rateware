import {
  base64url,
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'npm:jose@5.9.6';

import type { OspAuthorizationIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';
import type {
  VerifiedApprovalIdentity,
  VerifiedWorkflowIdentity,
} from '../_shared/osp/workflow-authority.ts';

const CANONICAL_ORGANIZATION = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_PERMISSIONS = Object.freeze({
  'carriers@xbfreight.com': Object.freeze(['osp:read']),
  'jgonzalez@xbfreight.com': Object.freeze(['osp:read', 'osp:signature-approve']),
  'sales@heymarksman.com': Object.freeze(['osp:read', 'osp:sales-authorize']),
} satisfies Record<string, readonly string[]>);

export type SupabaseJwtVerifier = {
  verify(token: string, signal?: AbortSignal): Promise<OspAuthorizationIdentity>;
  verifyWorkflow(token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity>;
  verifyApproval(accessToken: string, approvalProof: string, signal?: AbortSignal): Promise<VerifiedApprovalIdentity>;
};

export type SupabaseJwtVerifierOptions = {
  issuer: string;
  getKey?: JWTVerifyGetKey;
  clock?: () => number;
};

function unauthorized(): never {
  throw new OspApiError('UNAUTHORIZED');
}

function forbidden(): never {
  throw new OspApiError('FORBIDDEN');
}

function canonicalJwt(token: string): void {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment === '' || !/^[A-Za-z0-9_-]+$/.test(segment))) {
    unauthorized();
  }
  try {
    for (const [index, segment] of segments.entries()) {
      const decoded = base64url.decode(segment);
      if (base64url.encode(decoded) !== segment) unauthorized();
      if (index < 2) new TextDecoder('utf-8', { fatal: true }).decode(decoded);
    }
  } catch {
    unauthorized();
  }
}

function requiredString(payload: Record<string, unknown>, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.trim() === '') unauthorized();
  return value;
}

function exactPermissions(payload: Record<string, unknown>, email: string): readonly string[] {
  const expected = EXPECTED_PERMISSIONS[email as keyof typeof EXPECTED_PERMISSIONS];
  if (!expected) forbidden();
  const actual = payload.osp_permissions;
  if (!Array.isArray(actual) || actual.length !== expected.length ||
      actual.some((permission, index) => permission !== expected[index])) {
    forbidden();
  }
  return expected;
}

function approvalIssuedAt(payload: Record<string, unknown>): string {
  const amr = payload.amr;
  if (!Array.isArray(amr) || amr.length === 0) forbidden();
  const timestamps = amr.map((entry) => {
    if (!entry || typeof entry !== 'object' || !Number.isSafeInteger((entry as { timestamp?: unknown }).timestamp)) {
      forbidden();
    }
    return (entry as { timestamp: number }).timestamp;
  });
  const result = new Date(Math.min(...timestamps) * 1_000);
  if (Number.isNaN(result.getTime())) forbidden();
  return result.toISOString();
}

function bindIdentity(payload: Record<string, unknown>, issuer: string): OspAuthorizationIdentity {
  const subject = requiredString(payload, 'sub');
  const email = requiredString(payload, 'email').trim().toLowerCase();
  if (
    !UUID.test(subject)
    || payload.iss !== issuer
    || payload.aud !== 'authenticated'
    || payload.role !== 'authenticated'
    || payload.is_anonymous === true
    || payload.osp_organization_id !== CANONICAL_ORGANIZATION
  ) unauthorized();
  exactPermissions(payload, email);
  return Object.freeze({
    issuer,
    authorizedParty: 'authenticated',
    subject,
    organization: CANONICAL_ORGANIZATION,
    email,
    emailVerified: true,
  });
}

export function createSupabaseJwtVerifier({
  issuer,
  getKey = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
    timeoutDuration: 5_000,
  }),
  clock = Date.now,
}: SupabaseJwtVerifierOptions): SupabaseJwtVerifier {
  const verifyPayload = async (token: string, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    try {
      if (signal?.aborted || typeof token !== 'string' || token.trim() !== token || token === '') unauthorized();
      canonicalJwt(token);
      const header = decodeProtectedHeader(token);
      if (typeof header.alg !== 'string' || !['ES256', 'EdDSA', 'RS256'].includes(header.alg) ||
          typeof header.kid !== 'string' || header.kid === '') {
        unauthorized();
      }
      const verified = await jwtVerify(token, getKey, {
        algorithms: ['ES256', 'EdDSA', 'RS256'],
        audience: 'authenticated',
        issuer,
        clockTolerance: 30,
        currentDate: new Date(clock()),
      });
      if (signal?.aborted) unauthorized();
      return verified.payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof OspApiError) throw error;
      unauthorized();
    }
  };

  const verifyWorkflow = async (token: string, signal?: AbortSignal): Promise<VerifiedWorkflowIdentity> => {
    const payload = await verifyPayload(token, signal);
    const identity = bindIdentity(payload, issuer);
    return Object.freeze({ identity, permissions: exactPermissions(payload, identity.email) });
  };

  return Object.freeze({
    async verify(token, signal) {
      return (await verifyWorkflow(token, signal)).identity;
    },
    verifyWorkflow,
    async verifyApproval(accessToken, approvalProof, signal) {
      if (accessToken !== approvalProof) forbidden();
      const payload = await verifyPayload(accessToken, signal);
      const identity = bindIdentity(payload, issuer);
      const sessionId = requiredString(payload, 'session_id');
      if (!UUID.test(sessionId)) forbidden();
      return Object.freeze({
        identity,
        permissions: exactPermissions(payload, identity.email),
        authorizationSessionId: sessionId,
        authorizationSessionIssuedAt: approvalIssuedAt(payload),
      });
    },
  });
}
