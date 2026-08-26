import type { JWTPayload } from 'npm:jose@5.9.6';

import { OspApiError } from './http.ts';

export type OspAuthorizationIdentity = {
  issuer: string;
  authorizedParty: string;
  subject: string;
  organization: string;
  email: string;
  emailVerified: true;
};

export type OspClaimPolicy = {
  issuer: string;
  audience: string;
  clientId: string;
  nowEpochSeconds: () => number;
  clockToleranceSeconds: number;
};

function requiredExactText(
  payload: Record<string, unknown>,
  claim: string,
  code: 'UNAUTHORIZED' | 'FORBIDDEN',
): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OspApiError(code);
  }
  return value;
}

function normalizedText(
  payload: Record<string, unknown>,
  claim: string,
  code: 'UNAUTHORIZED' | 'FORBIDDEN',
): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.trim() === '') throw new OspApiError(code);
  return value.trim();
}

function requiredEpoch(payload: Record<string, unknown>, claim: string): number {
  const value = payload[claim];
  if (!Number.isSafeInteger(value)) throw new OspApiError('UNAUTHORIZED');
  return value as number;
}

export function requireOspIdentity(
  verifiedPayload: JWTPayload | Record<string, unknown>,
  policy: OspClaimPolicy,
): OspAuthorizationIdentity {
  const payload = verifiedPayload as Record<string, unknown>;
  const issuer = requiredExactText(payload, 'iss', 'UNAUTHORIZED');
  const authorizedParty = requiredExactText(payload, 'azp', 'UNAUTHORIZED');
  const subject = requiredExactText(payload, 'sub', 'UNAUTHORIZED');
  if (issuer !== policy.issuer || payload.aud !== policy.audience || authorizedParty !== policy.clientId) {
    throw new OspApiError('UNAUTHORIZED');
  }

  const now = policy.nowEpochSeconds();
  const exp = requiredEpoch(payload, 'exp');
  const nbf = requiredEpoch(payload, 'nbf');
  if (exp <= now - policy.clockToleranceSeconds || nbf > now + policy.clockToleranceSeconds) {
    throw new OspApiError('UNAUTHORIZED');
  }

  const organization = requiredExactText(payload, 'org_code', 'FORBIDDEN');
  const email = normalizedText(payload, 'email', 'FORBIDDEN').toLowerCase();
  const verifiedEmail = normalizedText(payload, 'osp_verified_email', 'FORBIDDEN').toLowerCase();
  const permissions = payload.permissions;
  if (payload.osp_email_verified !== true || verifiedEmail !== email ||
      !Array.isArray(permissions) || permissions.some((value) => typeof value !== 'string') ||
      !permissions.includes('osp:read')) {
    throw new OspApiError('FORBIDDEN');
  }

  return {
    issuer,
    authorizedParty,
    subject,
    organization,
    email,
    emailVerified: true,
  };
}
