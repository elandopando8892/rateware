import assert from 'node:assert/strict';

import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type KeyLike,
} from 'jose';

import { OspApiError } from './http.ts';
import { createKindeJwtVerifier } from './kinde-jwt.ts';

const NOW = 1_800_000_000;
const issuer = 'https://auth.heymarksman.com';
const audience = 'https://osp.heymarksman.com/api';
const clientId = 'synthetic-public-client';
const allowedEmails = ['operator@example.test'];

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: issuer,
    aud: audience,
    azp: clientId,
    sub: 'synthetic-subject',
    org_code: 'synthetic-org',
    email: 'operator@example.test',
    osp_email_verified: true,
    osp_verified_email: 'operator@example.test',
    permissions: ['osp:read'],
    nbf: NOW - 10,
    exp: NOW + 60,
    ...overrides,
  };
}

async function setup() {
  const first = await generateKeyPair('RS256');
  const second = await generateKeyPair('RS256');
  const firstJwk = { ...await exportJWK(first.publicKey), alg: 'RS256', kid: 'first-kid', use: 'sig' };
  const secondJwk = { ...await exportJWK(second.publicKey), alg: 'RS256', kid: 'second-kid', use: 'sig' };
  return { first, second, firstJwk, secondJwk };
}

async function sign(
  privateKey: KeyLike | Uint8Array,
  kid: string,
  overrides: Record<string, unknown> = {},
) {
  return await new SignJWT(claims(overrides))
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .sign(privateKey);
}

function verifier(jwksFetch: typeof fetch) {
  return createKindeJwtVerifier({
    issuer,
    clientId,
    audience,
    allowedEmails,
    jwksFetch,
    clock: () => NOW * 1_000,
  });
}

function verifierAt(jwksFetch: typeof fetch, clock: () => number) {
  return createKindeJwtVerifier({ issuer, clientId, audience, allowedEmails, jwksFetch, clock, elapsedClock: clock });
}

function verifierWithElapsedClock(
  jwksFetch: typeof fetch,
  clock: () => number,
  elapsedClock: () => number,
) {
  return createKindeJwtVerifier({ issuer, clientId, audience, allowedEmails, jwksFetch, clock, elapsedClock });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function signCompactInput(privateKey: CryptoKey, protectedSegment: string, payloadSegment: string) {
  const signingInput = `${protectedSegment}.${payloadSegment}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return ((_input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }))) as typeof fetch;
}

async function expectUnauthorized(operation: Promise<unknown>) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(error.message, 'UNAUTHORIZED');
    assert.equal(error.cause, undefined);
    return true;
  });
}

async function expectForbidden(operation: Promise<unknown>) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.message, 'FORBIDDEN');
    assert.equal(error.cause, undefined);
    return true;
  });
}

Deno.test('createKindeJwtVerifier verifies a real RS256 token against synthetic JWKS', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  const identity = await verifier(jsonFetch({ keys: [fixture.firstJwk] })).verify(token);
  assert.equal(identity.subject, 'synthetic-subject');
  assert.equal(identity.organization, 'synthetic-org');
});

Deno.test('createKindeJwtVerifier projects frozen canonical workflow permissions from a verified payload', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid', {
    permissions: ['osp:read', 'osp:operate'],
  });
  const subject = verifier(jsonFetch({ keys: [fixture.firstJwk] }));
  const unchangedReadIdentity = await subject.verify(token);
  const workflow = await subject.verifyWorkflow(token);
  assert.deepEqual(workflow.identity, unchangedReadIdentity);
  assert.deepEqual(workflow.permissions, ['osp:operate', 'osp:read']);
  assert.equal(Object.isFrozen(workflow.permissions), true);
  assert.throws(() => (workflow.permissions as string[]).push('osp:operate'), TypeError);
});

Deno.test('createKindeJwtVerifier projects only the approved consequential permissions', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid', {
    permissions: ['osp:read', 'osp:signature-approve'],
  });
  const workflow = await verifier(jsonFetch({ keys: [fixture.firstJwk] })).verifyWorkflow(token);
  assert.deepEqual(workflow.permissions, ['osp:read', 'osp:signature-approve']);
});

Deno.test('createKindeJwtVerifier projects approval session proof only from signed claims', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid', {
    permissions: ['osp:read', 'osp:signature-approve'],
    sid: 'approval-session-1',
    auth_time: NOW - 60,
  });
  const approval = await verifier(jsonFetch({ keys: [fixture.firstJwk] })).verifyApproval(token);
  assert.equal(approval.authorizationSessionId, 'approval-session-1');
  assert.equal(approval.authorizationSessionIssuedAt, '2027-01-15T07:59:00.000Z');
  assert.deepEqual(approval.permissions, ['osp:read', 'osp:signature-approve']);
});

Deno.test('createKindeJwtVerifier rejects missing or malformed approval session claims', async () => {
  const fixture = await setup();
  for (const overrides of [
    { permissions: ['osp:read', 'osp:signature-approve'] },
    { permissions: ['osp:read', 'osp:signature-approve'], sid: 'approval-session-1', auth_time: 'not-a-time' },
  ]) {
    const token = await sign(fixture.first.privateKey, 'first-kid', overrides);
    await expectForbidden(verifier(jsonFetch({ keys: [fixture.firstJwk] })).verifyApproval(token));
  }
});

for (const [label, permissions] of [
  ['duplicate', ['osp:read', 'osp:read']],
  ['non-string', ['osp:read', 7]],
  ['blank', ['osp:read', '']],
  ['unsupported', ['osp:read', 'osp:admin']],
] as Array<[string, unknown]>) {
  Deno.test(`createKindeJwtVerifier rejects ${label} workflow permissions after signature verification`, async () => {
    const fixture = await setup();
    const token = await sign(fixture.first.privateKey, 'first-kid', { permissions });
    const subject = verifier(jsonFetch({ keys: [fixture.firstJwk] }));
    await expectForbidden(subject.verifyWorkflow(token));
    assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  });
}

Deno.test('createKindeJwtVerifier grants approved identities read-only workflow access without paid OSP permissions', async () => {
  const fixture = await setup();
  for (const permissions of [undefined, [], ['dashboard:read']]) {
    const token = await sign(fixture.first.privateKey, 'first-kid', { permissions });
    const workflow = await verifier(jsonFetch({ keys: [fixture.firstJwk] })).verifyWorkflow(token);
    assert.deepEqual(workflow.permissions, ['osp:read']);
  }
});

Deno.test('createKindeJwtVerifier rejects an altered real signature without leaking details', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  const parts = token.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  await expectUnauthorized(verifier(jsonFetch({ keys: [fixture.firstJwk] })).verify(parts.join('.')));
});

Deno.test('createKindeJwtVerifier rejects unknown kid, wrong kid, and a key from another set', async () => {
  const fixture = await setup();
  const unknownKid = await sign(fixture.first.privateKey, 'unknown-kid');
  const wrongKid = await sign(fixture.first.privateKey, 'second-kid');
  const wrongSet = await sign(fixture.first.privateKey, 'first-kid');
  await expectUnauthorized(verifier(jsonFetch({ keys: [fixture.firstJwk] })).verify(unknownKid));
  await expectUnauthorized(verifier(jsonFetch({ keys: [fixture.secondJwk] })).verify(wrongKid));
  await expectUnauthorized(verifier(jsonFetch({ keys: [{ ...fixture.secondJwk, kid: 'first-kid' }] })).verify(wrongSet));
});

Deno.test('createKindeJwtVerifier rejects malformed JWKS and network failure safely', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  await expectUnauthorized(verifier(jsonFetch({ keys: 'malformed' })).verify(token));
  const failedFetch = (() => Promise.reject(new Error('private synthetic network detail'))) as typeof fetch;
  await expectUnauthorized(verifier(failedFetch).verify(token));
});

Deno.test('createKindeJwtVerifier refreshes its cache once when a new kid appears', async () => {
  const fixture = await setup();
  const firstToken = await sign(fixture.first.privateKey, 'first-kid');
  const secondToken = await sign(fixture.second.privateKey, 'second-kid');
  let calls = 0;
  const rotatingFetch = (() => {
    calls += 1;
    const keys = calls === 1 ? [fixture.firstJwk] : [fixture.secondJwk];
    return Promise.resolve(new Response(JSON.stringify({ keys }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifier(rotatingFetch);
  assert.equal((await subject.verify(firstToken)).subject, 'synthetic-subject');
  assert.equal((await subject.verify(secondToken)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier single-flights a concurrent initial JWKS load', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchOnce = (async () => {
    calls += 1;
    await gate;
    return new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const subject = verifier(fetchOnce);
  const operations = Array.from({ length: 12 }, () => subject.verify(token));
  await Promise.resolve();
  try {
    assert.equal(calls, 1);
  } finally {
    release();
    await Promise.allSettled(operations);
  }
  assert.deepEqual((await Promise.all(operations)).map((value) => value.subject),
    Array.from({ length: 12 }, () => 'synthetic-subject'));
});

Deno.test('createKindeJwtVerifier publishes an initial shared flight when its starter aborts', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let calls = 0;
  let release!: () => void;
  const sharedFetch = ((_input: RequestInfo | URL) => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
        headers: { 'content-type': 'application/json' },
      }));
    });
  }) as typeof fetch;
  const subject = verifier(sharedFetch);
  const starterController = new AbortController();
  const starter = subject.verify(token, starterController.signal);
  while (calls === 0) await Promise.resolve();
  const survivor = subject.verify(token);
  starterController.abort();
  await expectUnauthorized(starter);
  release();

  assert.equal((await survivor).subject, 'synthetic-subject');
  assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  assert.equal(calls, 1);
});

Deno.test('createKindeJwtVerifier bounds random unknown-kid refreshes with a 30-second cooldown', async () => {
  const fixture = await setup();
  const valid = await sign(fixture.first.privateKey, 'first-kid');
  let now = NOW * 1_000;
  let calls = 0;
  const boundedFetch = (() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifierAt(boundedFetch, () => now);
  await subject.verify(valid);

  const [, payload, signature] = valid.split('.');
  const encodeHeader = (kid: string) => base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    alg: 'RS256', kid, typ: 'JWT',
  })));
  for (let index = 0; index < 12; index += 1) {
    await expectUnauthorized(subject.verify(`${encodeHeader(`random-${index}`)}.${payload}.${signature}`));
  }
  assert.equal(calls, 2);

  now += 30_001;
  await expectUnauthorized(subject.verify(`${encodeHeader('after-cooldown')}.${payload}.${signature}`));
  assert.equal(calls, 3);
});

Deno.test('createKindeJwtVerifier negative-caches failed JWKS loads for 30 seconds', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let now = NOW * 1_000;
  let calls = 0;
  const failedFetch = (() => {
    calls += 1;
    return Promise.reject(new Error('private synthetic network detail'));
  }) as typeof fetch;
  const subject = verifierAt(failedFetch, () => now);
  for (let attempt = 0; attempt < 3; attempt += 1) await expectUnauthorized(subject.verify(token));
  assert.equal(calls, 1);
  now += 30_001;
  await expectUnauthorized(subject.verify(token));
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier fails closed when a ten-minute JWKS snapshot cannot refresh', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid', { exp: NOW + 1_000 });
  let now = NOW * 1_000;
  let calls = 0;
  const expiringFetch = (() => {
    calls += 1;
    if (calls > 1) return Promise.reject(new Error('synthetic refresh unavailable'));
    return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifierAt(expiringFetch, () => now);
  assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  now += 600_000;
  await expectUnauthorized(subject.verify(token));
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier expires JWKS by elapsed time despite wall-clock rollback', async () => {
  const fixture = await setup();
  const oldToken = await sign(fixture.first.privateKey, 'old-kid', {
    nbf: NOW - 7_200,
    exp: NOW + 7_200,
  });
  let wallNow = NOW * 1_000;
  let elapsedNow = 10_000;
  let calls = 0;
  const rotatingFetch = (() => {
    calls += 1;
    const key = calls === 1
      ? { ...fixture.firstJwk, kid: 'old-kid' }
      : { ...fixture.secondJwk, kid: 'new-kid' };
    return Promise.resolve(new Response(JSON.stringify({ keys: [key] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifierWithElapsedClock(rotatingFetch, () => wallNow, () => elapsedNow);
  assert.equal((await subject.verify(oldToken)).subject, 'synthetic-subject');

  wallNow -= 60 * 60 * 1_000;
  elapsedNow += 20 * 60 * 1_000;
  await expectUnauthorized(subject.verify(oldToken));
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier expires initial failure cooldown by elapsed time despite wall-clock rollback', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid', {
    nbf: NOW - 7_200,
    exp: NOW + 7_200,
  });
  let wallNow = NOW * 1_000;
  let elapsedNow = 20_000;
  let calls = 0;
  const recoveringFetch = (() => {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error('synthetic initial failure'));
    return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifierWithElapsedClock(recoveringFetch, () => wallNow, () => elapsedNow);
  await expectUnauthorized(subject.verify(token));
  assert.equal(calls, 1);

  wallNow -= 60 * 60 * 1_000;
  elapsedNow += 29_999;
  await expectUnauthorized(subject.verify(token));
  assert.equal(calls, 1);

  elapsedNow += 2;
  assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier refreshes once for same-kid key rotation', async () => {
  const fixture = await setup();
  const oldToken = await sign(fixture.first.privateKey, 'shared-kid');
  const newToken = await sign(fixture.second.privateKey, 'shared-kid');
  let calls = 0;
  const rotatingFetch = (() => {
    calls += 1;
    const key = calls === 1
      ? { ...fixture.firstJwk, kid: 'shared-kid' }
      : { ...fixture.secondJwk, kid: 'shared-kid' };
    return Promise.resolve(new Response(JSON.stringify({ keys: [key] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifier(rotatingFetch);
  assert.equal((await subject.verify(oldToken)).subject, 'synthetic-subject');
  assert.equal((await subject.verify(newToken)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier publishes a same-kid rotation flight when its starter aborts', async () => {
  const fixture = await setup();
  const oldToken = await sign(fixture.first.privateKey, 'shared-kid');
  const newToken = await sign(fixture.second.privateKey, 'shared-kid');
  let calls = 0;
  let releaseRotation!: () => void;
  const rotatingFetch = (() => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(new Response(JSON.stringify({
        keys: [{ ...fixture.firstJwk, kid: 'shared-kid' }],
      }), { headers: { 'content-type': 'application/json' } }));
    }
    return new Promise<Response>((resolve) => {
      releaseRotation = () => resolve(new Response(JSON.stringify({
        keys: [{ ...fixture.secondJwk, kid: 'shared-kid' }],
      }), { headers: { 'content-type': 'application/json' } }));
    });
  }) as typeof fetch;
  const subject = verifier(rotatingFetch);
  assert.equal((await subject.verify(oldToken)).subject, 'synthetic-subject');

  const starterController = new AbortController();
  const starter = subject.verify(newToken, starterController.signal);
  const survivor = subject.verify(newToken);
  while (calls < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  starterController.abort();
  releaseRotation();
  await expectUnauthorized(starter);

  assert.equal((await survivor).subject, 'synthetic-subject');
  assert.equal((await subject.verify(newToken)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier expires refresh cooldown by elapsed time despite wall-clock rollback', async () => {
  const fixture = await setup();
  const valid = await sign(fixture.first.privateKey, 'first-kid', {
    nbf: NOW - 7_200,
    exp: NOW + 7_200,
  });
  const unknownOne = await sign(fixture.first.privateKey, 'unknown-one', {
    nbf: NOW - 7_200,
    exp: NOW + 7_200,
  });
  const unknownTwo = await sign(fixture.first.privateKey, 'unknown-two', {
    nbf: NOW - 7_200,
    exp: NOW + 7_200,
  });
  let wallNow = NOW * 1_000;
  let elapsedNow = 30_000;
  let calls = 0;
  const stableFetch = (() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const subject = verifierWithElapsedClock(stableFetch, () => wallNow, () => elapsedNow);
  assert.equal((await subject.verify(valid)).subject, 'synthetic-subject');
  await expectUnauthorized(subject.verify(unknownOne));
  assert.equal(calls, 2);

  wallNow -= 60 * 60 * 1_000;
  elapsedNow += 30_001;
  await expectUnauthorized(subject.verify(unknownTwo));
  assert.equal(calls, 3);
});

Deno.test('createKindeJwtVerifier propagates request abort to the JWKS fetch', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let capturedSignal: AbortSignal | undefined;
  let release!: () => void;
  const abortableFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      capturedSignal = init?.signal ?? undefined;
      capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true });
      release = () => resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
        headers: { 'content-type': 'application/json' },
      }));
    })) as typeof fetch;
  const subject = verifier(abortableFetch);
  const controller = new AbortController();
  const operation = (subject.verify as unknown as (
    value: string,
    signal: AbortSignal,
  ) => Promise<unknown>)(token, controller.signal);
  while (!capturedSignal) await Promise.resolve();
  controller.abort();
  try {
    const outcome = await Promise.race([
      operation.then(() => 'resolved', () => 'rejected'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ]);
    assert.equal(outcome, 'rejected');
    assert.equal(capturedSignal.aborted, true);
  } finally {
    release();
    await operation.catch(() => undefined);
  }
});

Deno.test('createKindeJwtVerifier aborts a shared fetch only after all waiters abort without negative caching', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let calls = 0;
  let fetchSignal: AbortSignal | undefined;
  const abortThenRecover = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls > 1) {
      return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
        headers: { 'content-type': 'application/json' },
      }));
    }
    fetchSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true });
    });
  }) as typeof fetch;
  const subject = verifier(abortThenRecover);
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = subject.verify(token, firstController.signal);
  while (!fetchSignal) await Promise.resolve();
  const second = subject.verify(token, secondController.signal);

  firstController.abort();
  await expectUnauthorized(first);
  assert.equal(fetchSignal.aborted, false);
  secondController.abort();
  await expectUnauthorized(second);
  assert.equal(fetchSignal.aborted, true);

  assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier discards a cancelled shared flight when fetch ignores abort', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let calls = 0;
  let fetchSignal: AbortSignal | undefined;
  let releaseIgnoredFetch!: () => void;
  const ignoresAbort = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls > 1) {
      return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
        headers: { 'content-type': 'application/json' },
      }));
    }
    fetchSignal = init?.signal ?? undefined;
    return new Promise<Response>((resolve) => {
      releaseIgnoredFetch = () => resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] }), {
        headers: { 'content-type': 'application/json' },
      }));
    });
  }) as typeof fetch;
  const subject = verifier(ignoresAbort);
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = subject.verify(token, firstController.signal);
  while (!fetchSignal) await Promise.resolve();
  const second = subject.verify(token, secondController.signal);
  firstController.abort();
  secondController.abort();
  await Promise.all([expectUnauthorized(first), expectUnauthorized(second)]);
  assert.equal(fetchSignal.aborted, true);

  releaseIgnoredFetch();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal((await subject.verify(token)).subject, 'synthetic-subject');
  assert.equal(calls, 2);
});

Deno.test('createKindeJwtVerifier performs no JWKS fetch for a pre-aborted request', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  let calls = 0;
  const subject = verifier((() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ keys: [fixture.firstJwk] })));
  }) as typeof fetch);
  const controller = new AbortController();
  controller.abort();
  await expectUnauthorized((subject.verify as unknown as (
    value: string,
    signal: AbortSignal,
  ) => Promise<unknown>)(token, controller.signal));
  assert.equal(calls, 0);
});

Deno.test('createKindeJwtVerifier rejects noncanonical base64url in every compact JWT segment', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  const [protectedSegment, payloadSegment, signatureSegment] = token.split('.');
  const pad = (segment: string) => `${segment}=`;
  const noncanonicalHeader = await signCompactInput(
    fixture.first.privateKey as CryptoKey,
    pad(protectedSegment),
    payloadSegment,
  );
  const noncanonicalPayload = await signCompactInput(
    fixture.first.privateKey as CryptoKey,
    protectedSegment,
    pad(payloadSegment),
  );
  const noncanonicalSignature = `${protectedSegment}.${payloadSegment}.${signatureSegment}==`;
  const subject = verifier(jsonFetch({ keys: [fixture.firstJwk] }));
  for (const value of [noncanonicalHeader, noncanonicalPayload, noncanonicalSignature]) {
    await expectUnauthorized(subject.verify(value));
  }
});

Deno.test('createKindeJwtVerifier rejects canonical segments whose JSON is not fatal UTF-8', async () => {
  const fixture = await setup();
  const token = await sign(fixture.first.privateKey, 'first-kid');
  const [protectedSegment, payloadSegment] = token.split('.');
  const malformedJson = (prefix: string, suffix: string) => {
    const before = new TextEncoder().encode(prefix);
    const after = new TextEncoder().encode(suffix);
    const bytes = new Uint8Array(before.length + 2 + after.length);
    bytes.set(before);
    bytes.set([0xc3, 0x28], before.length);
    bytes.set(after, before.length + 2);
    return base64UrlEncode(bytes);
  };
  const malformedHeader = malformedJson(
    '{"ignored":"',
    '","alg":"RS256","kid":"first-kid","typ":"JWT"}',
  );
  const malformedPayload = malformedJson(
    '{"ignored":"',
    `",${JSON.stringify(claims()).slice(1)}`,
  );
  const subject = verifier(jsonFetch({ keys: [fixture.firstJwk] }));
  await expectUnauthorized(subject.verify(await signCompactInput(
    fixture.first.privateKey as CryptoKey,
    malformedHeader,
    payloadSegment,
  )));
  await expectUnauthorized(subject.verify(await signCompactInput(
    fixture.first.privateKey as CryptoKey,
    protectedSegment,
    malformedPayload,
  )));
});

Deno.test('createKindeJwtVerifier rejects alg none and a wrong asymmetric algorithm before trust', async () => {
  const fixture = await setup();
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const none = `${encode({ alg: 'none', kid: 'first-kid' })}.${encode(claims())}.`;
  const esPair = await generateKeyPair('ES256');
  const esToken = await new SignJWT(claims())
    .setProtectedHeader({ alg: 'ES256', kid: 'first-kid' })
    .sign(esPair.privateKey);
  const subject = verifier(jsonFetch({ keys: [fixture.firstJwk] }));
  await expectUnauthorized(subject.verify(none));
  await expectUnauthorized(subject.verify(esToken));
});

Deno.test('createKindeJwtVerifier exposes only a safe public error for a private token value', async () => {
  const privateToken = 'private.synthetic.token';
  let caught: unknown;
  try {
    await verifier(jsonFetch({ keys: [] })).verify(privateToken);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof OspApiError);
  assert.equal(JSON.stringify(caught).includes(privateToken), false);
  assert.equal(String(caught).includes(privateToken), false);
});
