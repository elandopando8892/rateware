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
  ]);
  const store = createPostgresOspReadStore({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    postgresFactory: fake.factory,
  });
  assert.equal(await store.resolveWorkspace(identity), organizationId);
  assert.equal((await store.readPipeline(organizationId)).requests_total, '1');
  assert.equal((await store.readGmail(organizationId)).connection_exists, false);

  assert.equal(fake.calls.length, 3);
  assert.match(fake.calls[0].text, /SELECT\s+organization_id\s+FROM\s+osp_identity_workspace_v1/i);
  assert.match(fake.calls[0].text, /issuer\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /subject\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /organization_code\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /lower\(btrim\(email\)\)\s*=\s*\$/i);
  assert.match(fake.calls[0].text, /identity_active\s*=\s*true/i);
  assert.match(fake.calls[0].text, /organization_reviewed\s*=\s*true/i);
  assert.match(fake.calls[0].text, /workspace_active\s*=\s*true/i);
  assert.deepEqual(fake.calls[0].values, [identity.issuer, identity.subject, identity.organization, identity.email]);

  assert.match(fake.calls[1].text, /SELECT\s+requests_total,\s*documents_pending,\s*under_review,\s*ready_for_approval\s+FROM\s+osp_provider_onboarding_metrics_v1/i);
  assert.match(fake.calls[2].text, /SELECT\s+connection_exists,\s*pubsub_configured,\s*watch_configured,\s*token_expires_at,\s*watch_expires_at,\s*error_present,\s*error_code\s+FROM\s+osp_provider_gmail_health_v1/i);
  for (const call of fake.calls.slice(1)) {
    assert.match(call.text, /WHERE\s+organization_id\s*=\s*\$/i);
    assert.deepEqual(call.values, [organizationId]);
  }
  assert.equal(fake.calls.some((call) => /\b(?:insert|update|delete|merge|call)\b/i.test(call.text)), false);
  assert.equal(fake.calls.some((call) => /select\s+\*/i.test(call.text)), false);
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
