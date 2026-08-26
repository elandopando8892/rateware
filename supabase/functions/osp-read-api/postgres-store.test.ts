import assert from 'node:assert/strict';

import { OspApiError } from './http.ts';
import { createPostgresOspReadStore } from './postgres-store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const identity = {
  issuer: 'https://auth.heymarksman.com',
  authorizedParty: 'synthetic-public-client',
  subject: 'synthetic-subject',
  organization: 'synthetic-org',
  email: 'operator@example.test',
  emailVerified: true as const,
};

type QueryRecord = { text: string; values: unknown[] };

function fakeFactory(rows: unknown[][]) {
  const calls: QueryRecord[] = [];
  let options: Record<string, unknown> | undefined;
  let databaseUrl: string | undefined;
  const factory = ((url: string, supplied: Record<string, unknown>) => {
    databaseUrl = url;
    options = supplied;
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('$'), values });
      return Promise.resolve(rows.shift() ?? []);
    }) as unknown;
    return sql;
  });
  return { factory, calls, get options() { return options; }, get databaseUrl() { return databaseUrl; } };
}

function expectCode(code: 'WORKSPACE_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE') {
  return (error: unknown) => error instanceof OspApiError && error.code === code && error.message === code;
}

Deno.test('createPostgresOspReadStore uses transaction-pooler-safe least-connection read-only options', () => {
  const fake = fakeFactory([]);
  createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: fake.factory,
  });
  assert.equal(fake.databaseUrl, 'postgresql://synthetic.example.test/db');
  assert.deepEqual(fake.options, {
    ssl: 'verify-full',
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: 'osp-read-api',
      statement_timeout: '3000',
      default_transaction_read_only: 'on',
    },
  });
});

Deno.test('createPostgresOspReadStore rejects database URL query and hash override surfaces', () => {
  for (const suffix of [
    '?statement_timeout=0',
    '?default_transaction_read_only=off',
    '?application_name=attacker',
    '#statement_timeout=0',
  ]) {
    assert.throws(() => createPostgresOspReadStore({
      databaseUrl: `postgresql://synthetic.example.test/db${suffix}`,
      postgresFactory: () => { throw new Error('must not construct'); },
    }), /INVALID_RUNTIME_CONFIGURATION/);
  }
});

Deno.test('createPostgresOspReadStore emits only exact static scoped SELECT queries', async () => {
  const fake = fakeFactory([
    [{ organization_id: organizationId }],
    [{ requests_total: '1', documents_pending: '2', under_review: '3', ready_for_approval: '4' }],
    [{
      connection_exists: false, pubsub_configured: null, watch_configured: null,
      token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null,
    }],
    [],
    [{
      case_id: '22222222-2222-4222-8222-222222222222', supplier_name: 'Synthetic Supplier', state: 'received',
      aggregate_version: '1', blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z',
      message_count: '1', attachment_count: '0', document_count: '0', latest_subject: null, latest_sender_domain: null,
      latest_received_at: null, recent_events: [],
    }],
  ]);
  const store = createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: fake.factory,
  });
  assert.equal(await store.resolveWorkspace(identity), organizationId);
  assert.equal((await store.readPipeline(organizationId)).requests_total, '1');
  assert.equal((await store.readGmail(organizationId)).connection_exists, false);
  assert.deepEqual(await store.readCases(organizationId), []);
  assert.equal((await store.readCase(organizationId, '22222222-2222-4222-8222-222222222222')).state, 'received');

  assert.equal(fake.calls.length, 5);
  assert.match(fake.calls[0].text, /FROM\s+public\.external_identities\s+identity_record/i);
  assert.match(fake.calls[0].text, /JOIN\s+public\.external_organization_links\s+organization_link/i);
  assert.match(fake.calls[0].text, /identity_record\.external_subject\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /lower\(btrim\(identity_record\.email\)\)\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /identity_record\.status\s*=\s*'kinde'|identity_record\.provider\s*=\s*'kinde'/i);
  assert.match(fake.calls[0].text, /identity_record\.status\s*=\s*'active'/i);
  assert.match(fake.calls[0].text, /organization_link\.external_organization_id\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /organization_link\.organization_id\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /organization_link\.status\s*=\s*'active'/i);
  assert.deepEqual(fake.calls[0].values, [identity.subject, identity.email, identity.organization, identity.organization]);

  assert.match(fake.calls[1].text, /FROM\s+osp_private\.customer_registration_cases/i);
  assert.match(fake.calls[1].text, /count\(\*\)\s+FILTER\s*\(WHERE\s+state\s*=\s*'operations_review'\)/i);
  assert.match(fake.calls[2].text, /FROM\s+public\.provider_gmail_connections/i);
  assert.match(fake.calls[2].text, /purpose\s*=\s*'provider_onboarding'/i);
  assert.match(fake.calls[2].text, /mailbox_email\s*=\s*'carriers@xbfreight\.com'/i);
  assert.match(fake.calls[3].text, /FROM\s+osp_private\.customer_registration_cases\s+case_record/i);
  assert.match(fake.calls[3].text, /LIMIT\s+100/i);
  assert.match(fake.calls[4].text, /case_record\.organization_id\s*=\s*\$/i);
  assert.match(fake.calls[4].text, /case_record\.id\s*=\s*\$/i);
  assert.deepEqual(fake.calls[1].values, [organizationId]);
  assert.deepEqual(fake.calls[2].values, [organizationId]);
  assert.deepEqual(fake.calls[3].values, [organizationId]);
  assert.deepEqual(fake.calls[4].values, [organizationId, '22222222-2222-4222-8222-222222222222']);
  assert.equal(fake.calls.some((call) => /\b(?:insert|update|delete|merge|call)\b/i.test(call.text)), false);
  assert.equal(fake.calls.some((call) => /select\s+\*/i.test(call.text)), false);
});

Deno.test('createPostgresOspReadStore resolves a canonical tenant through its reviewed external organization', async () => {
  const fake = fakeFactory([[{ organization_id: organizationId }]]);
  const store = createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: fake.factory,
  });
  const canonicalIdentity = {
    ...identity,
    organization: organizationId,
    externalOrganization: 'org_dbc2fd12c76',
  };
  assert.equal(await store.resolveWorkspace(canonicalIdentity), organizationId);
  assert.deepEqual(fake.calls[0].values, [
    identity.subject,
    identity.email,
    'org_dbc2fd12c76',
    organizationId,
  ]);
});

Deno.test('createPostgresOspReadStore requires exactly one row for every operation', async () => {
  for (const rows of [[], [{ organization_id: organizationId }, { organization_id: organizationId }]]) {
    const fake = fakeFactory([rows]);
    const store = createPostgresOspReadStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: fake.factory });
    await assert.rejects(store.resolveWorkspace(identity), expectCode('WORKSPACE_UNAVAILABLE'));
  }
  for (const method of ['readPipeline', 'readGmail'] as const) {
    for (const rows of [[], [{ value: 1 }, { value: 2 }]]) {
      const fake = fakeFactory([rows]);
      const store = createPostgresOspReadStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: fake.factory });
      await assert.rejects(store[method](organizationId), expectCode('DEPENDENCY_UNAVAILABLE'));
    }
  }
});

Deno.test('createPostgresOspReadStore reduces raw SQL failures to safe dependency errors', async () => {
  const factory = (() => {
    const sql = (() => Promise.reject(new Error('private relation and SQLSTATE'))) as unknown;
    return sql;
  });
  const store = createPostgresOspReadStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: factory });
  await assert.rejects(store.readPipeline(organizationId), (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(error.message.includes('private relation'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

Deno.test('createPostgresOspReadStore reduces synchronous query-construction failures to safe dependency errors', async () => {
  const factory = (() => {
    const sql = (() => { throw new Error('private synchronous adapter detail'); }) as unknown;
    return sql;
  });
  const store = createPostgresOspReadStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: factory });
  await assert.rejects(store.resolveWorkspace(identity), (error) => {
    assert.ok(error instanceof OspApiError);
    assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(error.message, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(error.cause, undefined);
    return true;
  });
});

Deno.test('createPostgresOspReadStore rejects a non-rowset adapter result safely', async () => {
  const factory = (() => {
    const sql = (() => Promise.resolve(null)) as unknown;
    return sql;
  });
  const store = createPostgresOspReadStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: factory });
  await assert.rejects(store.readPipeline(organizationId), expectCode('DEPENDENCY_UNAVAILABLE'));
});

Deno.test('createPostgresOspReadStore rejects request abort immediately and ignores stale completion', async () => {
  let cancels = 0;
  let resolveQuery!: (rows: unknown[]) => void;
  const factory = (() => {
    const sql = (() => {
      const pending = new Promise<unknown[]>((resolve) => { resolveQuery = resolve; }) as
        Promise<unknown[]> & { cancel: () => void };
      pending.cancel = () => { cancels += 1; };
      return pending;
    }) as unknown;
    return sql;
  });
  const store = createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: factory,
  });
  const controller = new AbortController();
  const started = performance.now();
  const aborted = store.readPipeline(organizationId, controller.signal);
  controller.abort();
  await assert.rejects(aborted, expectCode('DEPENDENCY_UNAVAILABLE'));
  assert.ok(performance.now() - started < 100);
  resolveQuery([{ requests_total: '99' }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(aborted, expectCode('DEPENDENCY_UNAVAILABLE'));
  assert.equal(cancels, 0);
});

Deno.test('createPostgresOspReadStore never invokes a cancel method with an uncontainable detached rejection', async () => {
  let cancels = 0;
  let unhandled = 0;
  const onUnhandled = (event: PromiseRejectionEvent) => {
    if (String(event.reason).includes('private detached cancellation detail')) {
      unhandled += 1;
      event.preventDefault();
    }
  };
  globalThis.addEventListener('unhandledrejection', onUnhandled);
  const factory = (() => {
    const sql = (() => {
      const pending = new Promise<never>(() => {}) as Promise<never> & { cancel: () => void };
      pending.cancel = () => {
        cancels += 1;
        void Promise.reject(new Error('private detached cancellation detail'));
      };
      return pending;
    }) as unknown;
    return sql;
  });
  const store = createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: factory,
  });
  const controller = new AbortController();
  try {
    const operation = store.readPipeline(organizationId, controller.signal);
    controller.abort();
    await assert.rejects(operation, expectCode('DEPENDENCY_UNAVAILABLE'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cancels, 0);
    assert.equal(unhandled, 0);
  } finally {
    globalThis.removeEventListener('unhandledrejection', onUnhandled);
  }
});

Deno.test({
  name: 'createPostgresOspReadStore uses the fixed three-second client fail-closed timeout',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    let cancels = 0;
    const factory = (() => {
      const sql = (() => {
        const pending = new Promise<never>(() => {}) as Promise<never> & { cancel: () => void };
        pending.cancel = () => { cancels += 1; };
        return pending;
      }) as unknown;
      return sql;
    });
    const store = createPostgresOspReadStore({
      databaseUrl: 'postgresql://synthetic.example.test/db',
      postgresFactory: factory,
    });
    const started = performance.now();
    await assert.rejects(store.readGmail(organizationId), expectCode('DEPENDENCY_UNAVAILABLE'));
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 2_900 && elapsed < 4_000, `elapsed ${elapsed}`);
    assert.equal(cancels, 0);
  },
});
