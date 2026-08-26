// @vitest-environment node

import { sign as signBytes, type KeyObject } from 'node:crypto';

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '../config/runtime';
import {
  assertVerifiedAccessTokenMatchesSession,
  bindVerifiedTokenPair,
  createKindeTokenVerifier,
} from './token-binding';

const runtime: RuntimeConfig = {
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: 'synthetic-public-client',
  VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
  VITE_SUPABASE_URL: 'https://project.example.test',
  VITE_OSP_BUILD_PROFILE: 'local-e2e',
};

const baseAccessClaims: Record<string, unknown> = {
  iss: 'https://auth.heymarksman.com',
  aud: 'https://osp.heymarksman.com/api',
  azp: 'synthetic-public-client',
  sub: 'user-a',
  org_code: 'org-a',
  email: [' Operator', 'Example.TEST '].join('@'),
  osp_email_verified: true,
  osp_verified_email: 'operator@example.test',
  permissions: ['osp:read'],
};

const baseIdClaims: Record<string, unknown> = {
  iss: 'https://auth.heymarksman.com',
  aud: 'synthetic-public-client',
  azp: 'synthetic-public-client',
  sub: 'user-a',
  org_code: 'org-a',
  email: 'operator@example.test',
  email_verified: true,
  name: 'Visible Operator',
};

function bind(
  accessOverrides: Record<string, unknown> = {},
  idOverrides: Record<string, unknown> = {},
) {
  return bindVerifiedTokenPair({
    accessClaims: { ...baseAccessClaims, ...accessOverrides },
    idClaims: { ...baseIdClaims, ...idOverrides },
    config: runtime,
  });
}

describe('bindVerifiedTokenPair', () => {
  it('binds the exact issuer, audience, authorized party, subject, organization, verified email, and permission', () => {
    expect(bind()).toEqual({
      identity: {
        issuer: 'https://auth.heymarksman.com',
        authorizedParty: 'synthetic-public-client',
        subject: 'user-a',
        organization: 'org-a',
        email: 'operator@example.test',
        emailVerified: true,
      },
      displayProfile: { displayName: 'Visible Operator' },
    });
  });

  it('accepts the required audience in a textual audience list', () => {
    expect(bind({ aud: ['another-audience', 'https://osp.heymarksman.com/api'] }).identity.subject)
      .toBe('user-a');
  });

  it.each([
    ['issuer', { iss: 'https://auth.heymarksman.com.evil.example.test' }, {}],
    ['audience', { aud: 'https://osp.heymarksman.com/api/v2' }, {}],
    ['authorized party', { azp: 'another-client' }, {}],
    ['subject', { sub: '' }, {}],
    ['organization', { org_code: '' }, {}],
    ['multiple organizations', { org_code: ['org-a', 'org-b'] }, {}],
    ['access email verification', { osp_email_verified: false }, {}],
    ['verified access email identity', { osp_verified_email: 'other@example.test' }, {}],
    ['ambiguous verified identities', { osp_verified_email: ['operator@example.test', 'other@example.test'] }, {}],
    ['permission', { permissions: ['another:permission'] }, {}],
    ['native ID-token email verification', {}, { email_verified: false }],
    ['ID-token subject match', {}, { sub: 'user-b' }],
    ['ID-token organization match', {}, { org_code: 'org-b' }],
    ['ID-token email match', {}, { email: 'other@example.test' }],
    ['ID-token issuer match', {}, { iss: 'https://other.example.test' }],
    ['ID-token authorized-party match', {}, { azp: 'another-client' }],
  ])('rejects a wrong or ambiguous %s', (_name, accessOverrides, idOverrides) => {
    expect(() => bind(accessOverrides, idOverrides)).toThrow();
  });

  it.each([
    ['iss', 7],
    ['azp', true],
    ['sub', {}],
    ['org_code', ['org-a']],
    ['email', null],
    ['osp_verified_email', 9],
    ['permissions', 'osp:read'],
  ])('rejects a non-contractual access-token %s claim', (claim, value) => {
    expect(() => bind({ [claim]: value })).toThrow();
  });

  it('keeps display name out of authorization identity', () => {
    const first = bind({}, { name: 'First Label' });
    const second = bind({}, { name: 'Second Label' });

    expect(first.identity).toEqual(second.identity);
    expect(first.displayProfile).not.toEqual(second.displayProfile);
    expect(Object.keys(first.identity)).not.toContain('displayName');
  });

});

describe('assertVerifiedAccessTokenMatchesSession', () => {
  it('returns the token only when every authorization claim matches the bound session', () => {
    const bound = bind();
    const token = 'cryptographically-verified-access-token';

    expect(assertVerifiedAccessTokenMatchesSession(
      token,
      baseAccessClaims,
      bound.identity,
      runtime,
    )).toBe(token);
  });

  it.each([
    ['subject', { sub: 'user-b' }],
    ['organization', { org_code: 'org-b' }],
    ['email', { email: 'other@example.test', osp_verified_email: 'other@example.test' }],
    ['issuer', { iss: 'https://other.example.test' }],
    ['authorized party', { azp: 'another-client' }],
  ])('rejects a refreshed access token with a changed %s', (_name, overrides) => {
    const bound = bind();
    expect(() => assertVerifiedAccessTokenMatchesSession(
      'cryptographically-verified-access-token',
      { ...baseAccessClaims, ...overrides },
      bound.identity,
      runtime,
    )).toThrow();
  });
});

describe('createKindeTokenVerifier', () => {
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let verifier: ReturnType<typeof createKindeTokenVerifier>;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    verifier = createKindeTokenVerifier(runtime, createLocalJWKSet({
      keys: [{ ...publicJwk, alg: 'RS256', kid: 'synthetic-kid', use: 'sig' }],
    }));
  });

  async function signed(
    claims: Record<string, unknown>,
    audience: string,
  ): Promise<string> {
    return new SignJWT({ ...claims, aud: audience })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-kid', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  const base64urlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function alternateUnusedTrailingBits(segment: string): string {
    const remainder = segment.length % 4;
    const unusedBits = remainder === 2 ? 4 : remainder === 3 ? 2 : 0;
    if (unusedBits === 0) throw new Error('fixture segment has no unused trailing bits');
    const lastIndex = base64urlAlphabet.indexOf(segment.at(-1) ?? '');
    if (lastIndex < 0) throw new Error('fixture segment is not base64url');
    const alternateIndex = (lastIndex & ~((1 << unusedBits) - 1)) | 1;
    return `${segment.slice(0, -1)}${base64urlAlphabet[alternateIndex]}`;
  }

  function payloadSegmentWithUnusedTrailingBits(): string {
    for (let paddingLength = 0; paddingLength < 4; paddingLength += 1) {
      const payload = Buffer.from(JSON.stringify({
        ...baseAccessClaims,
        fixture_padding: 'x'.repeat(paddingLength),
      })).toString('base64url');
      if (payload.length % 4 === 2 || payload.length % 4 === 3) return payload;
    }
    throw new Error('could not construct payload fixture with unused bits');
  }

  function canonicalHeaderSegment(): string {
    return Buffer.from(JSON.stringify({
      alg: 'RS256',
      kid: 'synthetic-kid',
      typ: 'JWT',
    })).toString('base64url');
  }

  function manuallySignedToken(header: string, payloadSegment: string): string {
    const input = `${header}.${payloadSegment}`;
    const signature = signBytes(
      'RSA-SHA256',
      Buffer.from(input),
      privateKey as KeyObject,
    ).toString('base64url');
    return `${input}.${signature}`;
  }

  function manuallySignedAccessToken(payloadSegment: string): string {
    return manuallySignedToken(canonicalHeaderSegment(), payloadSegment);
  }

  function jsonSegmentWithInvalidUtf8(value: Record<string, unknown>): string {
    const bytes = Buffer.from(JSON.stringify({ ...value, invalid_utf8: 'X' }));
    const marker = Buffer.from('"invalid_utf8":"X"');
    const markerStart = bytes.indexOf(marker);
    if (markerStart < 0) throw new Error('invalid UTF-8 fixture marker missing');
    bytes[markerStart + marker.length - 2] = 0xff;
    return bytes.toString('base64url');
  }

  it('verifies real RS256 signatures and the distinct access/ID audiences', async () => {
    const accessToken = await signed(baseAccessClaims, runtime.VITE_KINDE_AUDIENCE);
    const idToken = await signed(baseIdClaims, runtime.VITE_KINDE_CLIENT_ID);

    await expect(verifier.verifyAccessToken(accessToken)).resolves.toMatchObject({
      sub: 'user-a',
      aud: runtime.VITE_KINDE_AUDIENCE,
    });
    await expect(verifier.verifyIdToken(idToken)).resolves.toMatchObject({
      sub: 'user-a',
      aud: runtime.VITE_KINDE_CLIENT_ID,
    });
    await expect(verifier.verifyAccessToken(idToken)).rejects.toThrow();
    await expect(verifier.verifyIdToken(accessToken)).rejects.toThrow();
  });

  it('accepts the canonical locally RS256-signed compact-token control', async () => {
    const payload = payloadSegmentWithUnusedTrailingBits();
    const token = manuallySignedAccessToken(payload);

    await expect(verifier.verifyAccessToken(token)).resolves.toMatchObject({
      sub: 'user-a',
      aud: runtime.VITE_KINDE_AUDIENCE,
    });
  });

  it('rejects an otherwise valid RS256 token with alternate payload trailing bits', async () => {
    const canonicalPayload = payloadSegmentWithUnusedTrailingBits();
    const alternatePayload = alternateUnusedTrailingBits(canonicalPayload);
    expect(Buffer.from(alternatePayload, 'base64url')).toEqual(
      Buffer.from(canonicalPayload, 'base64url'),
    );
    const token = manuallySignedAccessToken(alternatePayload);

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects an otherwise valid RS256 token with alternate signature trailing bits', async () => {
    const payload = payloadSegmentWithUnusedTrailingBits();
    const canonical = manuallySignedAccessToken(payload);
    const [header, payloadSegment, signature] = canonical.split('.');
    if (!header || !payloadSegment || !signature) throw new Error('fixture token malformed');
    const alternateSignature = alternateUnusedTrailingBits(signature);
    expect(Buffer.from(alternateSignature, 'base64url')).toEqual(
      Buffer.from(signature, 'base64url'),
    );

    await expect(
      verifier.verifyAccessToken(`${header}.${payloadSegment}.${alternateSignature}`),
    ).rejects.toThrow();
  });

  it('rejects alg none and altered or unknown-key signatures', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const none = `${encode({ alg: 'none', kid: 'synthetic-kid' })}.${encode(baseAccessClaims)}.`;
    const valid = await signed(baseAccessClaims, runtime.VITE_KINDE_AUDIENCE);
    const altered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
    const unknownKid = await new SignJWT(baseAccessClaims)
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verifyAccessToken(none)).rejects.toThrow();
    await expect(verifier.verifyAccessToken(altered)).rejects.toThrow();
    await expect(verifier.verifyAccessToken(unknownKid)).rejects.toThrow();
  });

  it.each([
    ['whitespace', (token: string) => ` ${token}`],
    ['payload padding', (token: string) => {
      const [header, payload, signature] = token.split('.');
      return `${header}.${payload}=.${signature}`;
    }],
  ])('rejects non-canonical compact JWT %s', async (_name, mutate) => {
    const valid = await signed(baseAccessClaims, runtime.VITE_KINDE_AUDIENCE);
    await expect(verifier.verifyAccessToken(mutate(valid))).rejects.toThrow();
  });

  it('rejects a correctly signed payload containing invalid UTF-8', async () => {
    const header = Buffer.from(JSON.stringify({
      alg: 'RS256',
      kid: 'synthetic-kid',
      typ: 'JWT',
    })).toString('base64url');
    const payload = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url');
    const input = `${header}.${payload}`;
    const signature = signBytes(
      'RSA-SHA256',
      Buffer.from(input),
      privateKey as KeyObject,
    ).toString('base64url');

    await expect(verifier.verifyAccessToken(`${input}.${signature}`)).rejects.toThrow();
  });

  it('rejects a canonical signed header with invalid UTF-8 inside valid JSON shape', async () => {
    const header = jsonSegmentWithInvalidUtf8({
      alg: 'RS256',
      kid: 'synthetic-kid',
      typ: 'JWT',
    });
    const payload = Buffer.from(JSON.stringify(baseAccessClaims)).toString('base64url');
    const token = manuallySignedToken(header, payload);

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects a canonical signed payload with invalid UTF-8 inside valid JSON shape', async () => {
    const payload = jsonSegmentWithInvalidUtf8(baseAccessClaims);
    const token = manuallySignedAccessToken(payload);

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });
});
