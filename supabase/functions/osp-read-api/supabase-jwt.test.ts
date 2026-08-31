import assert from 'node:assert/strict';

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';

import { OspApiError } from './http.ts';
import { createSupabaseJwtVerifier } from './supabase-jwt.ts';

const NOW = 1_800_000_000;
const ISSUER = 'https://alqjqzqagdmcywpjtnnr.supabase.co/auth/v1';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';

async function fixture() {
  const pair = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(pair.publicKey), alg: 'ES256', kid: 'supabase-test-key', use: 'sig' };
  const verifier = createSupabaseJwtVerifier({
    issuer: ISSUER,
    getKey: createLocalJWKSet({ keys: [jwk] }),
    clock: () => NOW * 1_000,
  });
  const sign = async (overrides: Record<string, unknown> = {}) => await new SignJWT({
    iss: ISSUER,
    aud: 'authenticated',
    role: 'authenticated',
    sub: USER_ID,
    session_id: SESSION_ID,
    email: 'jgonzalez@xbfreight.com',
    is_anonymous: false,
    amr: [{ method: 'otp', timestamp: NOW - 60 }],
    osp_organization_id: ORGANIZATION_ID,
    osp_permissions: ['osp:read', 'osp:signature-approve'],
    nbf: NOW - 10,
    exp: NOW + 60,
    ...overrides,
  }).setProtectedHeader({ alg: 'ES256', kid: 'supabase-test-key', typ: 'JWT' }).sign(pair.privateKey);
  return { verifier, sign };
}

async function expectCode(operation: Promise<unknown>, code: 'UNAUTHORIZED' | 'FORBIDDEN') {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

Deno.test('Supabase JWT verifier binds the reviewed XBF role and fresh session proof', async () => {
  const { verifier, sign } = await fixture();
  const token = await sign();

  const workflow = await verifier.verifyWorkflow(token);
  assert.deepEqual(workflow, {
    identity: {
      issuer: ISSUER,
      authorizedParty: 'authenticated',
      subject: USER_ID,
      organization: ORGANIZATION_ID,
      email: 'jgonzalez@xbfreight.com',
      emailVerified: true,
    },
    permissions: ['osp:read', 'osp:signature-approve'],
  });

  const approval = await verifier.verifyApproval(token, token);
  assert.equal(approval.authorizationSessionId, SESSION_ID);
  assert.equal(approval.authorizationSessionIssuedAt, new Date((NOW - 60) * 1_000).toISOString());
});

Deno.test('Supabase JWT verifier grants only the reviewed Operations permission', async () => {
  const { verifier, sign } = await fixture();
  const token = await sign({
    email: 'ops@xbfreight.com',
    osp_permissions: ['osp:read', 'osp:operate'],
  });

  const workflow = await verifier.verifyWorkflow(token);
  assert.equal(workflow.identity.email, 'ops@xbfreight.com');
  assert.deepEqual(workflow.permissions, ['osp:read', 'osp:operate']);

  await expectCode(verifier.verifyWorkflow(await sign({
    email: 'ops@xbfreight.com',
    osp_permissions: ['osp:read', 'osp:operate', 'osp:sales-authorize'],
  })), 'FORBIDDEN');
});

Deno.test('Supabase JWT verifier rejects claim smuggling and cross-proof composition', async () => {
  const { verifier, sign } = await fixture();
  await expectCode(verifier.verifyWorkflow(await sign({
    osp_permissions: ['osp:read', 'osp:signature-approve', 'osp:sales-authorize'],
  })), 'FORBIDDEN');
  await expectCode(verifier.verifyWorkflow(await sign({
    osp_organization_id: '33333333-3333-4333-8333-333333333333',
  })), 'UNAUTHORIZED');
  const access = await sign();
  const another = await sign({ session_id: '44444444-4444-4444-8444-444444444444' });
  await expectCode(verifier.verifyApproval(access, another), 'FORBIDDEN');
});

Deno.test('Supabase approval freshness derives from AMR rather than refresh-token issue time', async () => {
  const { verifier, sign } = await fixture();
  const refreshed = await sign({ iat: NOW, amr: [{ method: 'otp', timestamp: NOW - 600 }] });
  const approval = await verifier.verifyApproval(refreshed, refreshed);
  assert.equal(approval.authorizationSessionIssuedAt, new Date((NOW - 600) * 1_000).toISOString());
});
