import assert from 'node:assert/strict';

import { requireOspIdentity } from './auth-policy.ts';
import { OspApiError } from './http.ts';

const NOW = 1_800_000_000;
const policy = {
  issuer: 'https://auth.heymarksman.com',
  audience: 'https://osp.heymarksman.com/api',
  clientId: 'synthetic-public-client',
  allowedEmails: ['operator@example.test'],
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
  ['audience array without OSP', { aud: ['another-audience'] }],
  ['wrong issuer', { iss: 'https://other.example.test' }],
  ['issuer with leading whitespace', { iss: ` ${policy.issuer}` }],
  ['missing authorized party', { azp: undefined }],
  ['wrong authorized party', { azp: 'another-client' }],
  ['authorized party with trailing whitespace', { azp: `${policy.clientId} ` }],
  ['expired beyond tolerance', { exp: NOW - 31 }],
  ['future beyond tolerance', { nbf: NOW + 31 }],
  ['missing expiration', { exp: undefined }],
  ['malformed not-before', { nbf: 'soon' }],
  ['missing subject', { sub: undefined }],
  ['blank subject', { sub: '  ' }],
] as const) {
  Deno.test(`requireOspIdentity rejects ${name}`, () => {
    expectCode(() => requireOspIdentity(claims(overrides), policy), 'UNAUTHORIZED');
  });
}

for (const [name, overrides] of [
  ['missing email', { email: undefined }],
  ['unapproved email', { email: 'other@example.test' }],
  ['missing organization', { org_code: undefined }],
  ['multiple organizations', { org_code: ['synthetic-org', 'other-org'] }],
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

Deno.test('requireOspIdentity accepts a Kinde audience array and an omitted not-before claim', () => {
  const identity = requireOspIdentity(claims({
    aud: ['another-audience', policy.audience],
    nbf: undefined,
  }), policy);
  assert.equal(identity.email, 'operator@example.test');
});

Deno.test('requireOspIdentity matches jose at the exact 30-second clock boundaries', () => {
  expectCode(() => requireOspIdentity(claims({ exp: NOW - 30 }), policy), 'UNAUTHORIZED');
  assert.equal(requireOspIdentity(claims({ nbf: NOW + 30 }), policy).subject, 'synthetic-subject');
});

Deno.test('requireOspIdentity rejects one second outside both clock boundaries', () => {
  expectCode(() => requireOspIdentity(claims({ exp: NOW - 31 }), policy), 'UNAUTHORIZED');
  expectCode(() => requireOspIdentity(claims({ nbf: NOW + 31 }), policy), 'UNAUTHORIZED');
});
