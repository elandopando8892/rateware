import assert from 'node:assert/strict';

import { requireOspIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';

const NOW = 1_800_000_000;
const policy = {
  issuer: 'https://auth.heymarksman.com',
  audience: 'https://osp.heymarksman.com/api',
  clientId: 'synthetic-public-client',
  nowEpochSeconds: () => NOW,
  clockToleranceSeconds: 30,
} as const;

const baseClaims: Record<string, unknown> = {
  iss: policy.issuer,
  aud: policy.audience,
  azp: policy.clientId,
  sub: 'synthetic-subject',
  org_code: 'synthetic-org',
  email: [' Operator', 'Example.Test '].join('@'),
  osp_email_verified: true,
  osp_verified_email: 'operator@example.test',
  permissions: ['osp:read'],
  exp: NOW + 60,
  nbf: NOW - 60,
};

function claims(overrides: Record<string, unknown> = {}) {
  return { ...baseClaims, ...overrides };
}

function expectCode(fn: () => unknown, code: 'UNAUTHORIZED' | 'FORBIDDEN') {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

Deno.test('requireOspIdentity returns only the bound canonical authorization identity', () => {
  assert.deepEqual(requireOspIdentity(claims(), policy), {
    issuer: policy.issuer,
    authorizedParty: policy.clientId,
    subject: 'synthetic-subject',
    organization: 'synthetic-org',
    email: 'operator@example.test',
    emailVerified: true,
  });
});

for (const [name, overrides] of [
  ['wrong audience', { aud: 'https://osp.heymarksman.com/other' }],
  ['multiple audiences', { aud: [policy.audience, 'another-audience'] }],
  ['wrong issuer', { iss: 'https://other.example.test' }],
  ['issuer with leading whitespace', { iss: ` ${policy.issuer}` }],
  ['missing authorized party', { azp: undefined }],
  ['wrong authorized party', { azp: 'another-client' }],
  ['authorized party with trailing whitespace', { azp: `${policy.clientId} ` }],
  ['expired beyond tolerance', { exp: NOW - 31 }],
  ['future beyond tolerance', { nbf: NOW + 31 }],
  ['missing expiration', { exp: undefined }],
  ['missing not-before', { nbf: undefined }],
  ['missing subject', { sub: undefined }],
  ['blank subject', { sub: '  ' }],
] as const) {
  Deno.test(`requireOspIdentity rejects ${name}`, () => {
    expectCode(() => requireOspIdentity(claims(overrides), policy), 'UNAUTHORIZED');
  });
}

for (const [name, overrides] of [
  ['missing verified flag', { osp_email_verified: undefined }],
  ['false verified flag', { osp_email_verified: false }],
  ['missing verified email', { osp_verified_email: undefined }],
  ['mismatched verified email', { osp_verified_email: 'other@example.test' }],
  ['missing email', { email: undefined }],
  ['missing organization', { org_code: undefined }],
  ['multiple organizations', { org_code: ['synthetic-org', 'other-org'] }],
  ['missing permission', { permissions: [] }],
  ['non-array permission', { permissions: 'osp:read' }],
] as const) {
  Deno.test(`requireOspIdentity rejects ${name}`, () => {
    expectCode(() => requireOspIdentity(claims(overrides), policy), 'FORBIDDEN');
  });
}

Deno.test('requireOspIdentity preserves authoritative subject and organization bytes without trimming', () => {
  const identity = requireOspIdentity(claims({
    sub: ' synthetic-subject',
    org_code: 'synthetic-org ',
  }), policy);
  assert.equal(identity.subject, ' synthetic-subject');
  assert.equal(identity.organization, 'synthetic-org ');
});

Deno.test('requireOspIdentity matches jose at the exact 30-second clock boundaries', () => {
  expectCode(() => requireOspIdentity(claims({ exp: NOW - 30 }), policy), 'UNAUTHORIZED');
  assert.equal(requireOspIdentity(claims({ nbf: NOW + 30 }), policy).subject, 'synthetic-subject');
});

Deno.test('requireOspIdentity rejects one second outside both clock boundaries', () => {
  expectCode(() => requireOspIdentity(claims({ exp: NOW - 31 }), policy), 'UNAUTHORIZED');
  expectCode(() => requireOspIdentity(claims({ nbf: NOW + 31 }), policy), 'UNAUTHORIZED');
});
