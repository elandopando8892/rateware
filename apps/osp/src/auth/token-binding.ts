import {
  base64url,
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';

import type { RuntimeConfig } from '../config/runtime';
import type {
  OspAuthorizationIdentity,
  OspDisplayProfile,
} from './auth-port';

type VerifiedTokenPairInput = {
  accessClaims: Record<string, unknown>;
  idClaims: Record<string, unknown>;
  config: RuntimeConfig;
};

type BoundTokenPair = {
  identity: OspAuthorizationIdentity;
  displayProfile: OspDisplayProfile;
};

const PRODUCTION_READONLY_EMAILS = new Set([
  'sales@heymarksman.com',
  'carriers@xbfreight.com',
  'jgonzalez@xbfreight.com',
]);
const PRODUCTION_KINDE_ORGANIZATION = 'org_dbc2fd12c76';
const PRODUCTION_RATEWARE_ORGANIZATION = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';

export type KindeTokenVerifier = {
  verifyAccessToken(token: string): Promise<Record<string, unknown>>;
  verifyIdToken(token: string): Promise<Record<string, unknown>>;
};

function assertCanonicalCompactJwt(token: string): void {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw new Error('JWT must use canonical compact serialization');
  }

  const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });
  for (const [index, segment] of segments.entries()) {
    let decoded: Uint8Array;
    try {
      decoded = base64url.decode(segment);
    } catch (error) {
      throw new Error('JWT must use canonical compact serialization', { cause: error });
    }
    if (base64url.encode(decoded) !== segment) {
      throw new Error('JWT must use canonical compact serialization');
    }
    if (index < 2) {
      try {
        fatalUtf8.decode(decoded);
      } catch (error) {
        throw new Error('JWT header and payload must use valid UTF-8', { cause: error });
      }
    }
  }
}

export function createKindeTokenVerifier(
  config: RuntimeConfig,
  jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(`${config.VITE_KINDE_DOMAIN}/.well-known/jwks.json`),
  ),
): KindeTokenVerifier {
  const verify = async (
    token: string,
    audience: string,
  ): Promise<Record<string, unknown>> => {
    assertCanonicalCompactJwt(token);
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      audience,
      issuer: config.VITE_KINDE_DOMAIN,
      clockTolerance: 30,
    });
    return payload;
  };

  return {
    verifyAccessToken: (token) => verify(token, config.VITE_KINDE_AUDIENCE),
    verifyIdToken: (token) => verify(token, config.VITE_KINDE_CLIENT_ID),
  };
}

function requiredString(claims: Record<string, unknown>, claim: string): string {
  const value = claims[claim];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Required textual claim missing: ${claim}`);
  }
  return value;
}

function normalizedEmail(claims: Record<string, unknown>, claim: string): string {
  return requiredString(claims, claim).trim().toLowerCase();
}

function optionalExactString(claims: Record<string, unknown>, claim: string): string | undefined {
  const value = claims[claim];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid textual claim: ${claim}`);
  }
  return value;
}

function requireProductionOrganizationMembership(claims: Record<string, unknown>): void {
  const organization = optionalExactString(claims, 'org_code');
  const organizations = claims.org_codes;
  if (
    organizations !== undefined
    && (!Array.isArray(organizations)
      || organizations.length === 0
      || organizations.some((entry) => typeof entry !== 'string' || entry.trim() === ''))
  ) {
    throw new Error('Invalid organization membership claim');
  }
  if (
    organization !== PRODUCTION_KINDE_ORGANIZATION
    && !(Array.isArray(organizations) && organizations.includes(PRODUCTION_KINDE_ORGANIZATION))
  ) {
    throw new Error('ID token is not a member of the approved production organization');
  }
}

function requireAudience(claims: Record<string, unknown>, expected: string): void {
  const audience = claims.aud;
  if (typeof audience === 'string') {
    if (audience !== expected) {
      throw new Error('Token audience mismatch');
    }
    return;
  }

  if (
    !Array.isArray(audience)
    || audience.length === 0
    || audience.some((entry) => typeof entry !== 'string')
    || !audience.includes(expected)
  ) {
    throw new Error('Token audience mismatch');
  }
}

function validateAccessClaims(
  claims: Record<string, unknown>,
  config: RuntimeConfig,
): OspAuthorizationIdentity {
  const issuer = requiredString(claims, 'iss');
  const authorizedParty = requiredString(claims, 'azp');
  const subject = requiredString(claims, 'sub');
  const email = normalizedEmail(claims, 'email');
  const productionReadonly = config.VITE_OSP_BUILD_PROFILE === 'production-readonly';
  const externalOrganization = productionReadonly
    ? optionalExactString(claims, 'org_code')
    : requiredString(claims, 'org_code');

  requireAudience(claims, config.VITE_KINDE_AUDIENCE);
  if (issuer !== config.VITE_KINDE_DOMAIN) {
    throw new Error('Token issuer mismatch');
  }
  if (authorizedParty !== config.VITE_KINDE_CLIENT_ID) {
    throw new Error('Token authorized party mismatch');
  }
  if (
    productionReadonly && !PRODUCTION_READONLY_EMAILS.has(email)
  ) {
    throw new Error('Email is not approved for the production read-only workspace');
  }
  if (productionReadonly && externalOrganization !== undefined
      && externalOrganization !== PRODUCTION_KINDE_ORGANIZATION) {
    throw new Error('Access token organization is not approved for production');
  }

  return {
    issuer,
    authorizedParty,
    subject,
    organization: productionReadonly
      ? PRODUCTION_RATEWARE_ORGANIZATION
      : externalOrganization as string,
    email,
    emailVerified: true,
  };
}

function validateIdClaims(
  claims: Record<string, unknown>,
  identity: OspAuthorizationIdentity,
  config: RuntimeConfig,
): OspDisplayProfile {
  requireAudience(claims, config.VITE_KINDE_CLIENT_ID);
  const issuer = requiredString(claims, 'iss');
  const authorizedParty = requiredString(claims, 'azp');
  const subject = requiredString(claims, 'sub');
  const email = normalizedEmail(claims, 'email');
  const productionReadonly = config.VITE_OSP_BUILD_PROFILE === 'production-readonly';
  const organization = productionReadonly
    ? PRODUCTION_RATEWARE_ORGANIZATION
    : requiredString(claims, 'org_code');

  if (productionReadonly) requireProductionOrganizationMembership(claims);

  if (
    issuer !== identity.issuer
    || authorizedParty !== identity.authorizedParty
    || subject !== identity.subject
    || organization !== identity.organization
    || email !== identity.email
    || claims.email_verified !== true
  ) {
    throw new Error('ID-token identity does not match access-token authorization identity');
  }

  return {
    displayName: typeof claims.name === 'string' ? claims.name.trim() : '',
  };
}

export function bindVerifiedTokenPair({
  accessClaims,
  idClaims,
  config,
}: VerifiedTokenPairInput): BoundTokenPair {
  const identity = validateAccessClaims(accessClaims, config);
  const displayProfile = validateIdClaims(idClaims, identity, config);
  return { identity, displayProfile };
}

export function assertVerifiedAccessTokenMatchesSession(
  accessToken: string,
  accessClaims: Record<string, unknown>,
  expected: OspAuthorizationIdentity,
  config: RuntimeConfig,
): string {
  const actual = validateAccessClaims(accessClaims, config);

  if (
    actual.issuer !== expected.issuer
    || actual.authorizedParty !== expected.authorizedParty
    || actual.subject !== expected.subject
    || actual.organization !== expected.organization
    || actual.email !== expected.email
  ) {
    throw new Error('Access token does not match the bound session');
  }

  return accessToken;
}
