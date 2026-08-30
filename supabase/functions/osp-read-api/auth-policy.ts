import type { JWTPayload } from 'npm:jose@5.9.6';

import { OspApiError } from './http.ts';

export type OspAuthorizationIdentity = {
  issuer: string;
  authorizedParty: string;
  subject: string;
  organization: string;
  externalOrganization?: string;
  email: string;
  emailVerified: true;
};

export type OspOrganizationBinding = {
  externalOrganization: string;
  canonicalOrganization: string;
  allowMissingExternalClaim: boolean;
};

export const OSP_PRODUCTION_ORGANIZATION_BINDING: OspOrganizationBinding = Object.freeze({
  externalOrganization: 'org_dbc2fd12c76',
  canonicalOrganization: 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920',
  allowMissingExternalClaim: true,
});

export type OspOperatorEntitlement = {
  email: string;
  externalOrganization: string;
};

export type OspSignatureEntitlement = {
  email: string;
  externalOrganization: string;
};

export const OSP_PRODUCTION_OPERATOR_ENTITLEMENTS: readonly OspOperatorEntitlement[] = Object.freeze([]);

export const OSP_PRODUCTION_SIGNATURE_ENTITLEMENTS: readonly OspSignatureEntitlement[] = Object.freeze([
  Object.freeze({
    email: 'jgonzalez@xbfreight.com',
    externalOrganization: OSP_PRODUCTION_ORGANIZATION_BINDING.externalOrganization,
  }),
]);

export type OspClaimPolicy = {
  issuer: string;
  audience: string;
  clientId: string;
  allowedEmails: readonly string[];
  organizationBinding?: OspOrganizationBinding;
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

function hasAudience(value: unknown, expected: string): boolean {
  return typeof value === 'string'
    ? value === expected
    : Array.isArray(value)
      && value.length > 0
      && value.every((entry) => typeof entry === 'string')
      && value.includes(expected);
}

export function requireOspIdentity(
  verifiedPayload: JWTPayload | Record<string, unknown>,
  policy: OspClaimPolicy,
): OspAuthorizationIdentity {
  const payload = verifiedPayload as Record<string, unknown>;
  const issuer = requiredExactText(payload, 'iss', 'UNAUTHORIZED');
  const authorizedParty = requiredExactText(payload, 'azp', 'UNAUTHORIZED');
  const subject = requiredExactText(payload, 'sub', 'UNAUTHORIZED');
  if (issuer !== policy.issuer || !hasAudience(payload.aud, policy.audience) || authorizedParty !== policy.clientId) {
    throw new OspApiError('UNAUTHORIZED');
  }

  const now = policy.nowEpochSeconds();
  const exp = requiredEpoch(payload, 'exp');
  const nbf = payload.nbf;
  if (
    exp <= now - policy.clockToleranceSeconds
    || (nbf !== undefined && (!Number.isSafeInteger(nbf) || (nbf as number) > now + policy.clockToleranceSeconds))
  ) {
    throw new OspApiError('UNAUTHORIZED');
  }

  const email = normalizedText(payload, 'email', 'FORBIDDEN').toLowerCase();
  if (!policy.allowedEmails.includes(email)) {
    throw new OspApiError('FORBIDDEN');
  }

  const binding = policy.organizationBinding;
  const presentedOrganization = payload.org_code;
  let organization: string;
  let externalOrganization: string | undefined;
  if (!binding) {
    organization = requiredExactText(payload, 'org_code', 'FORBIDDEN');
  } else {
    if (presentedOrganization === undefined) {
      if (!binding.allowMissingExternalClaim) throw new OspApiError('FORBIDDEN');
    } else if (
      typeof presentedOrganization !== 'string'
      || presentedOrganization.trim() === ''
      || presentedOrganization !== binding.externalOrganization
    ) {
      throw new OspApiError('FORBIDDEN');
    }
    organization = binding.canonicalOrganization;
    externalOrganization = binding.externalOrganization;
  }

  return {
    issuer,
    authorizedParty,
    subject,
    organization,
    ...(externalOrganization ? { externalOrganization } : {}),
    email,
    emailVerified: true,
  };
}
