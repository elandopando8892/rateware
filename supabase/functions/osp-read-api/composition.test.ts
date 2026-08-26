import assert from 'node:assert/strict';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createOspReadRuntime } from './composition.ts';

const NOW = 1_800_000_000;
const issuer = 'https://auth.heymarksman.com';
const clientId = 'synthetic-public-client';
const databaseUrl = 'postgresql://synthetic.example.test/db';
const organizationId = '11111111-1111-4111-8111-111111111111';

function env(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    OSP_KINDE_ISSUER: issuer,
    OSP_KINDE_CLIENT_ID: clientId,
    OSP_READ_DATABASE_URL: databaseUrl,
    ...overrides,
  };
  return { get: (name: string) => values[name] };
}

Deno.test('createOspReadRuntime connects validated env, verifier, Postgres store, and handler without eager network', async () => {
  const pair = await generateKeyPair('RS256');
  const publicJwk = { ...await exportJWK(pair.publicKey), alg: 'RS256', kid: 'runtime-kid', use: 'sig' };
  const token = await new SignJWT({
    iss: issuer,
    aud: 'https://osp.heymarksman.com/api',
    azp: clientId,
    sub: 'synthetic-subject',
    email: 'sales@heymarksman.com',
    osp_email_verified: true,
    osp_verified_email: 'operator@example.test',
    permissions: ['osp:read'],
    nbf: NOW - 10,
    exp: NOW + 60,
  }).setProtectedHeader({ alg: 'RS256', kid: 'runtime-kid' }).sign(pair.privateKey);

  let fetches = 0;
  let queries = 0;
  let seenUrl = '';
  let seenOptions: Record<string, unknown> | undefined;
  const jwksFetch = (() => {
    fetches += 1;
    return Promise.resolve(new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  const postgresFactory = ((url: string, options: Record<string, unknown>) => {
    seenUrl = url;
    seenOptions = options;
    const sql = ((strings: TemplateStringsArray) => {
      queries += 1;
      const text = strings.join('$');
      if (text.includes('public.external_identities')) return Promise.resolve([{ organization_id: organizationId }]);
      if (text.includes('osp_private.customer_registration_cases')) {
        return Promise.resolve([{
          requests_total: '1', documents_pending: '2', under_review: '3', ready_for_approval: '4',
        }]);
      }
      return Promise.resolve([]);
    }) as unknown;
    return sql;
  });

  const runtime = createOspReadRuntime({
    env: env(),
    jwksFetch,
    postgresFactory,
    clock: () => NOW * 1_000,
  });
  assert.equal(fetches, 0);
  assert.equal(queries, 0);
  assert.equal(seenUrl, databaseUrl);
  assert.equal((seenOptions?.connection as Record<string, string>).default_transaction_read_only, 'on');

  const response = await runtime(new Request('https://project.example.test/functions/v1/osp-read-api', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'http://localhost:8791',
    },
    body: JSON.stringify({ version: 1, action: 'list_provider_onboarding_workspace' }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    version: 1,
    data: { requests_total: '1', documents_pending: '2', under_review: '3', ready_for_approval: '4' },
  });
  assert.equal(fetches, 1);
  assert.equal(queries, 2);
});

Deno.test('createOspReadRuntime accepts only the standard required TLS database query', () => {
  let seenUrl = '';
  createOspReadRuntime({
    env: env({ OSP_READ_DATABASE_URL: `${databaseUrl}?sslmode=require` }),
    jwksFetch: (() => Promise.reject(new Error('must not fetch'))) as typeof fetch,
    postgresFactory: (url: string) => {
      seenUrl = url;
      return (() => Promise.resolve([])) as unknown;
    },
    clock: () => NOW * 1_000,
  });
  assert.equal(seenUrl, `${databaseUrl}?sslmode=require`);
});

Deno.test('createOspReadRuntime upgrades a provider prefer mode to required TLS', () => {
  let seenUrl = '';
  createOspReadRuntime({
    env: env({ OSP_READ_DATABASE_URL: `${databaseUrl}?sslmode=prefer` }),
    jwksFetch: (() => Promise.reject(new Error('must not fetch'))) as typeof fetch,
    postgresFactory: (url: string) => {
      seenUrl = url;
      return (() => Promise.resolve([])) as unknown;
    },
    clock: () => NOW * 1_000,
  });
  assert.equal(seenUrl, `${databaseUrl}?sslmode=require`);
});

for (const variable of ['OSP_KINDE_ISSUER', 'OSP_KINDE_CLIENT_ID', 'OSP_READ_DATABASE_URL']) {
  Deno.test(`createOspReadRuntime fails closed when ${variable} is absent`, () => {
    assert.throws(() => createOspReadRuntime({
      env: env({ [variable]: undefined }),
      jwksFetch: (() => Promise.reject(new Error('must not fetch'))) as typeof fetch,
      postgresFactory: (() => { throw new Error('must not create store'); }),
      clock: () => NOW * 1_000,
    }), /INVALID_RUNTIME_CONFIGURATION/);
  });
}

for (const suffix of [
  '?statement_timeout=0',
  '?default_transaction_read_only=off',
  '?application_name=attacker',
  '#default_transaction_read_only=off',
]) {
  Deno.test(`createOspReadRuntime rejects database URL override surface ${suffix}`, () => {
    let factoryCalls = 0;
    assert.throws(() => createOspReadRuntime({
      env: env({ OSP_READ_DATABASE_URL: `${databaseUrl}${suffix}` }),
      jwksFetch: (() => Promise.reject(new Error('must not fetch'))) as typeof fetch,
      postgresFactory: () => { factoryCalls += 1; return (() => Promise.resolve([])) as unknown; },
      clock: () => NOW * 1_000,
    }), /INVALID_RUNTIME_CONFIGURATION/);
    assert.equal(factoryCalls, 0);
  });
}
