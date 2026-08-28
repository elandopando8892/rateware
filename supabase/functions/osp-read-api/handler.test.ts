import assert from 'node:assert/strict';

import { createOspReadHandler } from './handler.ts';
import { OspApiError } from './http.ts';
import type { OspReadStore } from './store.ts';

const origins = [
  'http://localhost:8791',
  'https://osp.heymarksman.com',
] as const;
const organizationId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const identity = {
  issuer: 'https://auth.heymarksman.com',
  authorizedParty: 'synthetic-public-client',
  subject: 'synthetic-subject',
  organization: 'synthetic-org',
  email: 'operator@example.test',
  emailVerified: true as const,
};

function baseStore(overrides: Partial<OspReadStore> = {}): OspReadStore {
  return {
    async resolveWorkspace() { return organizationId; },
    async readPipeline() {
      return {
        requests_total: '9007199254740993',
        documents_pending: '2',
        under_review: '3',
        ready_for_approval: '4',
      };
    },
    async readGmail() {
      return {
        connection_exists: true,
        pubsub_configured: true,
        watch_configured: true,
        scheduled_poll_configured: true,
        poll_interval_seconds: 300,
        poll_last_completed_at: '2030-01-01T23:55:00Z',
        poll_status: 'succeeded',
        token_expires_at: '2030-01-01T00:00:00Z',
        watch_expires_at: '2030-01-02T00:00:00Z',
        error_present: false,
        error_code: null,
      };
    },
    async readCases() { return []; },
    async readCase() {
      return {
        case_id: caseId, supplier_name: 'Synthetic Supplier', state: 'received', aggregate_version: 1,
        blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T01:00:00Z',
        message_count: 1, attachment_count: 2, document_count: 0,
        latest_subject: 'Customer setup request', latest_sender_domain: 'supplier.example', latest_received_at: '2030-01-01T00:00:00Z',
        recent_events: [{ sequence: 1, state: 'received', occurred_at: '2030-01-01T00:00:00Z', reason_code: 'case_received' }],
      };
    },
    async readCorporateProfile() {
      return [{
        entity_id: '33333333-3333-4333-8333-333333333333', entity_code: 'XBFMX', legal_name: 'Synthetic XBF Mexico',
        country_code: 'MX', default_currency: 'MXN', status: 'active', verified_fields: '1', review_fields: '0', total_fields: '1',
        fields: [{ code: 'legal_name', label: 'Legal name', display_value: 'Synthetic XBF Mexico', verification_status: 'verified', sensitivity: 'internal' }],
        evidence: [],
      }];
    },
    ...overrides,
  };
}

function handler(options: {
  store?: OspReadStore;
  verifyToken?: (token: string) => Promise<typeof identity>;
  incidentId?: () => string;
} = {}) {
  return createOspReadHandler({
    store: options.store ?? baseStore(),
    verifyToken: options.verifyToken ?? (async () => identity),
    incidentId: options.incidentId ?? (() => 'incident-synthetic'),
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('https://project.example.test/functions/v1/osp-read-api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-token',
      'content-type': 'application/json',
      origin: origins[0],
      ...headers,
    },
    body,
  });
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function assertExactPostCors(response: Response, origin: string) {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.has('access-control-allow-credentials'), false);
  assert.equal(response.headers.has('access-control-allow-methods'), false);
  assert.equal(response.headers.has('access-control-allow-headers'), false);
}

Deno.test('createOspReadHandler returns the exact pipeline, Gmail and case read responses', async () => {
  const subject = handler();
  const pipeline = await subject(post(JSON.stringify({
    version: 1,
    action: 'list_provider_onboarding_workspace',
  })));
  assert.equal(pipeline.status, 200);
  assert.deepEqual(await json(pipeline), {
    version: 1,
    data: {
      requests_total: '9007199254740993',
      documents_pending: '2',
      under_review: '3',
      ready_for_approval: '4',
    },
  });

  const gmail = await subject(post(JSON.stringify({
    version: 1,
    action: 'provider_gmail_status',
  })));
  assert.equal(gmail.status, 200);
  assert.deepEqual(await json(gmail), {
    version: 1,
    data: {
      connection_exists: true,
      pubsub_configured: true,
      watch_configured: true,
      scheduled_poll_configured: true,
      poll_interval_seconds: 300,
      poll_last_completed_at: '2030-01-01T23:55:00.000Z',
      poll_status: 'succeeded',
      token_expires_at: '2030-01-01T00:00:00.000Z',
      watch_expires_at: '2030-01-02T00:00:00.000Z',
      error_present: false,
      error_code: null,
      outbound_enabled: false,
    },
  });

  const cases = await subject(post(JSON.stringify({ version: 1, action: 'list_customer_registration_cases' })));
  assert.equal(cases.status, 200);
  assert.deepEqual(await json(cases), { version: 1, data: { cases: [] } });

  const detail = await subject(post(JSON.stringify({ version: 1, action: 'get_customer_registration_case', case_id: caseId })));
  assert.equal(detail.status, 200);
  assert.deepEqual(await json(detail), {
    version: 1,
    data: {
      case_id: caseId, supplier_name: 'Synthetic Supplier', state: 'received', aggregate_version: 1,
      blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T01:00:00.000Z',
      message_count: '1', attachment_count: '2', document_count: '0',
      latest_request: { subject: 'Customer setup request', sender_domain: 'supplier.example', received_at: '2030-01-01T00:00:00.000Z' },
      recent_events: [{ sequence: 1, state: 'received', occurred_at: '2030-01-01T00:00:00.000Z', reason_code: 'case_received' }],
    },
  });

  const profile = await subject(post(JSON.stringify({ version: 1, action: 'get_corporate_profile' })));
  assert.equal(profile.status, 200);
  assert.deepEqual(await json(profile), {
    version: 1,
    data: {
      entities: [{
        entity_id: '33333333-3333-4333-8333-333333333333', entity_code: 'XBFMX', legal_name: 'Synthetic XBF Mexico',
        country_code: 'MX', default_currency: 'MXN', status: 'active', verified_fields: '1', review_fields: '0', total_fields: '1',
        fields: [{ code: 'legal_name', label: 'Legal name', display_value: 'Synthetic XBF Mexico', verification_status: 'verified', sensitivity: 'internal' }],
        evidence: [],
      }],
      disclosure_locked: true,
    },
  });
});

for (const action of [
  'sync_gmail',
  'renew_watch',
  'send_email',
  'oauth_start',
  'mutate_provider',
  '',
  7,
  null,
]) {
  Deno.test(`createOspReadHandler rejects unapproved action ${JSON.stringify(action)}`, async () => {
    const response = await handler()(post(JSON.stringify({ version: 1, action })));
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error instanceof Object, true);
  });
}

for (const body of [
  { version: 2, action: 'provider_gmail_status' },
  { action: 'provider_gmail_status' },
  { version: 1, action: 'provider_gmail_status', extra: true },
  { version: 1, action: 'provider_gmail_status', organization_id: organizationId },
  { version: 1, action: 'provider_gmail_status', tenant: 'synthetic-org' },
  { version: 1, action: 'get_customer_registration_case' },
  { version: 1, action: 'get_customer_registration_case', case_id: 'not-a-uuid' },
  { version: 1, action: 'list_customer_registration_cases', case_id: caseId },
]) {
  Deno.test(`createOspReadHandler rejects strict-request violation ${JSON.stringify(body)}`, async () => {
    const response = await handler()(post(JSON.stringify(body)));
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error instanceof Object, true);
  });
}

Deno.test('createOspReadHandler rejects missing bearer before reading the body', async () => {
  let bodyReads = 0;
  let verified = 0;
  const baseRequest = new Request('https://project.example.test/functions/v1/osp-read-api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origins[0] },
  });
  const request = new Proxy(baseRequest, {
    get(target, property) {
      if (property === 'body') bodyReads += 1;
      return Reflect.get(target, property, target);
    },
  });
  const response = await handler({ verifyToken: async () => { verified += 1; return identity; } })(request);
  assert.equal(response.status, 401);
  assert.equal(verified, 0);
  assert.equal(bodyReads, 0);
  assert.match(response.headers.get('www-authenticate') ?? '', /^Bearer /);
});

Deno.test('createOspReadHandler reads no body or database before cryptographic claims and permission success', async () => {
  for (const code of ['UNAUTHORIZED', 'FORBIDDEN'] as const) {
    let bodyReads = 0;
    let databaseReads = 0;
    const baseRequest = post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }));
    const request = new Proxy(baseRequest, {
      get(target, property) {
        if (property === 'body') bodyReads += 1;
        return Reflect.get(target, property, target);
      },
    });
    const store = baseStore({
      async resolveWorkspace() { databaseReads += 1; return organizationId; },
      async readPipeline() { databaseReads += 1; throw new Error('must not run'); },
      async readGmail() { databaseReads += 1; throw new Error('must not run'); },
    });
    const response = await handler({
      store,
      verifyToken: async () => { throw new OspApiError(code); },
    })(request);
    assert.equal(response.status, code === 'UNAUTHORIZED' ? 401 : 403);
    assert.equal(bodyReads, 0);
    assert.equal(databaseReads, 0);
  }
});

Deno.test('createOspReadHandler performs no database read before strict body and action validation', async () => {
  let reads = 0;
  const store = baseStore({
    async resolveWorkspace() { reads += 1; return organizationId; },
    async readPipeline() { reads += 1; throw new Error('must not run'); },
    async readGmail() { reads += 1; throw new Error('must not run'); },
  });
  const invalidJson = await handler({ store })(post('{'));
  assert.equal(invalidJson.status, 400);
  const invalidAction = await handler({ store })(post(JSON.stringify({ version: 1, action: 'send_email' })));
  assert.equal(invalidAction.status, 400);
  assert.equal(reads, 0);
});

Deno.test('createOspReadHandler maps ambiguous workspace safely', async () => {
  const store = baseStore({
    async resolveWorkspace() { throw new OspApiError('WORKSPACE_UNAVAILABLE'); },
  });
  const response = await handler({ store })(post(JSON.stringify({
    version: 1,
    action: 'provider_gmail_status',
  })));
  assert.equal(response.status, 403);
  assert.deepEqual(await json(response), {
    error: { code: 'WORKSPACE_UNAVAILABLE', incident_id: 'incident-synthetic' },
  });
});

Deno.test('createOspReadHandler rejects unsupported methods and normalized media types', async () => {
  const get = await handler()(new Request('https://project.example.test/functions/v1/osp-read-api', {
    method: 'GET',
  }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');

  for (const contentType of [
    'text/plain',
    'application/json; charset=latin1',
    'application/json; profile=test',
    'application/json; charset=utf-8; charset=utf-8',
  ]) {
    const response = await handler()(post('{}', { 'content-type': contentType }));
    assert.equal(response.status, 415);
  }
  for (const contentType of ['application/json', 'Application/JSON; Charset=UTF-8']) {
    const response = await handler()(post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), {
      'content-type': contentType,
    }));
    assert.equal(response.status, 200);
  }
});

Deno.test('createOspReadHandler rejects every non-identity content encoding before body parsing', async () => {
  for (const encoding of ['gzip', 'br', 'deflate', 'identity, gzip']) {
    const response = await handler()(post('{}', { 'content-encoding': encoding }));
    assert.equal(response.status, 415);
  }
  const accepted = await handler()(post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), {
    'content-encoding': 'identity',
  }));
  assert.equal(accepted.status, 200);
});

Deno.test('createOspReadHandler rejects every Transfer-Encoding before authentication or body parsing', async () => {
  for (const transferEncoding of ['chunked', 'identity', 'gzip', 'chunked, gzip']) {
    let verified = 0;
    const response = await handler({
      verifyToken: async () => { verified += 1; return identity; },
    })(post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), {
      'transfer-encoding': transferEncoding,
    }));
    assert.equal(response.status, 400);
    assert.equal(verified, 0);
  }
});

Deno.test('createOspReadHandler rejects declared and streamed bodies over 1,024 bytes', async () => {
  const declared = await handler()(post('{}', { 'content-length': '1025' }));
  assert.equal(declared.status, 413);
  const streamed = await handler()(post(JSON.stringify({
    version: 1,
    action: 'provider_gmail_status',
    padding: 'x'.repeat(1_024),
  })));
  assert.equal(streamed.status, 413);
  const invalidLength = await handler()(post('{}', { 'content-length': '-1' }));
  assert.equal(invalidLength.status, 400);
});

Deno.test('createOspReadHandler requires Content-Length to equal the streamed byte count exactly', async () => {
  const body = JSON.stringify({ version: 1, action: 'provider_gmail_status' });
  const actualLength = new TextEncoder().encode(body).byteLength;
  for (const declared of ['0', '1', String(actualLength - 1), String(actualLength + 1)]) {
    const response = await handler()(post(body, { 'content-length': declared }));
    assert.equal(response.status, 400, `declared ${declared}`);
  }
  assert.equal((await handler()(post(body, { 'content-length': String(actualLength) }))).status, 200);
});

Deno.test('createOspReadHandler rejects escaped duplicate top-level keys through nested adversarial values', async () => {
  for (const body of [
    '{"version":1,"action":"send_email","\\u0061ction":"provider_gmail_status"}',
    '{"version":1,"action":{"nested":{"action":"send_email"}},"\\u0061ction":"provider_gmail_status"}',
    '{"version":1,"action":"send_email","\\u0061ction":"provider_gmail_status","note":"} , \\\"action\\\": \\\"provider_gmail_status\\\""}',
  ]) {
    const response = await handler()(post(body));
    assert.equal(response.status, 400);
  }
});

Deno.test('createOspReadHandler contains and never awaits reader cancellation on oversize input', async () => {
  for (const cancellation of [
    () => new Promise<void>(() => {}),
    () => Promise.reject(new Error('private synthetic cancellation failure')),
  ]) {
    let cancellations = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_025));
      },
      cancel() {
        cancellations += 1;
        return cancellation();
      },
    });
    const request = new Request('https://project.example.test/functions/v1/osp-read-api', {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-token',
        'content-type': 'application/json',
        origin: origins[0],
      },
      body: stream,
    });
    const response = await Promise.race([
      handler()(request),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
    ]);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 413);
    assert.equal(cancellations, 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

Deno.test('createOspReadHandler rejects malformed JSON and invalid UTF-8 safely', async () => {
  assert.equal((await handler()(post('{'))).status, 400);
  const invalidUtf8 = new Request('https://project.example.test/functions/v1/osp-read-api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-token',
      'content-type': 'application/json',
      origin: origins[0],
    },
    body: new Uint8Array([0xff]),
  });
  assert.equal((await handler()(invalidUtf8)).status, 400);
});

for (const origin of origins) {
  Deno.test(`createOspReadHandler reflects allowed POST origin ${origin} with no-cache headers`, async () => {
    const response = await handler()(post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), { origin }));
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(response.headers.has('access-control-allow-credentials'), false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('pragma'), 'no-cache');
  });
}

Deno.test('createOspReadHandler decorates every allowed-origin POST error including early framing errors', async () => {
  const body = JSON.stringify({ version: 1, action: 'provider_gmail_status' });
  const cases = [
    post(body, { origin: origins[1], 'content-type': 'text/plain' }),
    post(body, { origin: origins[1], 'content-length': '1025' }),
    post(body, { origin: origins[1], 'transfer-encoding': 'chunked' }),
    new Request('https://project.example.test/functions/v1/osp-read-api', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: origins[1] }, body,
    }),
  ];
  for (const request of cases) {
    const response = await handler()(request);
    assert.notEqual(response.status, 200);
    assertExactPostCors(response, origins[1]);
  }
});

Deno.test('createOspReadHandler propagates the request AbortSignal through token verification', async () => {
  let seenSignal: AbortSignal | undefined;
  const subject = handler({
    verifyToken: (async (_token: string, signal?: AbortSignal) => {
      seenSignal = signal;
      return identity;
    }) as unknown as (token: string) => Promise<typeof identity>,
  });
  const request = post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }));
  assert.equal((await subject(request)).status, 200);
  assert.equal(seenSignal, request.signal);
});

Deno.test('createOspReadHandler rejects absent and disallowed POST origins without permissive headers', async () => {
  for (const origin of ['', 'https://evil.example.test']) {
    const request = post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), { origin });
    const response = await handler()(request);
    assert.equal(response.status, 400);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal(response.headers.has('access-control-allow-methods'), false);
    assert.equal(response.headers.has('access-control-allow-headers'), false);
  }
});

Deno.test('createOspReadHandler rejects a disallowed origin before authentication and body access', async () => {
  let verified = 0;
  let bodyReads = 0;
  const baseRequest = post(JSON.stringify({ version: 1, action: 'provider_gmail_status' }), {
    origin: 'https://evil.example.test',
  });
  const request = new Proxy(baseRequest, {
    get(target, property) {
      if (property === 'body') bodyReads += 1;
      return Reflect.get(target, property, target);
    },
  });
  const response = await handler({ verifyToken: async () => { verified += 1; return identity; } })(request);
  assert.equal(response.status, 400);
  assert.equal(verified, 0);
  assert.equal(bodyReads, 0);
});

for (const origin of origins) {
  Deno.test(`createOspReadHandler accepts exact preflight for ${origin} without bearer or body`, async () => {
    const response = await handler()(new Request('https://project.example.test/functions/v1/osp-read-api', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Content-Type, Authorization',
      },
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(response.headers.get('access-control-allow-headers'), 'authorization, content-type');
    assert.equal(response.headers.get('access-control-max-age'), '600');
    assert.equal(response.headers.get('vary'), 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    assert.equal(response.headers.has('access-control-allow-credentials'), false);
  });
}

for (const [name, headers] of [
  ['method', { origin: origins[0], 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' }],
  ['header', { origin: origins[0], 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-extra' }],
  ['duplicate header', { origin: origins[0], 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, Authorization' }],
  ['origin', { origin: 'https://evil.example.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' }],
  ['missing origin', { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' }],
] as const) {
  Deno.test(`createOspReadHandler rejects malformed preflight ${name} without permissive headers`, async () => {
    const response = await handler()(new Request('https://project.example.test/functions/v1/osp-read-api', {
      method: 'OPTIONS',
      headers,
    }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal(response.headers.has('access-control-allow-methods'), false);
    assert.equal(response.headers.has('access-control-allow-headers'), false);
  });
}

Deno.test('createOspReadHandler reduces raw dependency exceptions to INTERNAL_ERROR', async () => {
  const store = baseStore({
    async resolveWorkspace() { throw new Error('private table and claim details'); },
  });
  const response = await handler({ store })(post(JSON.stringify({ version: 1, action: 'provider_gmail_status' })));
  assert.equal(response.status, 500);
  const raw = JSON.stringify(await json(response));
  assert.equal(raw.includes('private table'), false);
  assert.match(raw, /INTERNAL_ERROR/);
});
