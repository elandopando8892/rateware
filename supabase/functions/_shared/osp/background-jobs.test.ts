import assert from "node:assert/strict";

import {
  createInMemoryBackgroundJobStore,
  createPostgresBackgroundJobStore,
} from "./background-jobs.ts";
import type { SqlPort } from "./database-context.ts";

const org = "11111111-1111-4111-8111-111111111111";

Deno.test("background jobs replay one idempotent receipt and lease a job to only one worker", async () => {
  const store = createInMemoryBackgroundJobStore();
  const input = {
    organizationId: org,
    kind: "gmail_ingest" as const,
    opaquePayload: { gmailMessageId: "opaque-message-id" },
    idempotencyKey: "gmail:opaque-message-id",
  };
  const first = await store.enqueue(input);
  assert.equal(await store.enqueue(input), first);
  const [one, two] = await Promise.all([
    store.claim({
      workerId: "worker-a",
      now: new Date("2026-08-23T00:00:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    }),
    store.claim({
      workerId: "worker-b",
      now: new Date("2026-08-23T00:00:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    }),
  ]);
  assert.equal(one.length + two.length, 1);
  const job = [...one, ...two][0];
  assert.deepEqual(job.opaquePayload, { gmailMessageId: "opaque-message-id" });
  await assert.rejects(
    store.complete({
      jobId: job.id,
      leaseToken: "wrong-lease",
      completedAt: new Date(),
    }),
    /LEASE_CONFLICT/,
  );
  await store.complete({
    jobId: job.id,
    leaseToken: job.leaseToken,
    completedAt: new Date(),
  });
  assert.deepEqual(
    await store.claim({
      workerId: "worker-c",
      now: new Date("2026-08-23T00:02:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    }),
    [],
  );
});

Deno.test("background jobs reject nonopaque payloads and incompatible idempotency replays", async () => {
  const store = createInMemoryBackgroundJobStore();
  await assert.rejects(
    store.enqueue({
      organizationId: org,
      kind: "gmail_ingest",
      opaquePayload: { source: "raw email body" },
      idempotencyKey: "key-1",
    }),
    /OPAQUE_PAYLOAD/,
  );
  await assert.rejects(
    store.enqueue({
      organizationId: org,
      kind: "gmail_ingest",
      opaquePayload: { source: "compact-but-not-an-id" },
      idempotencyKey: "key-2",
    }),
    /OPAQUE_PAYLOAD/,
  );
  await store.enqueue({
    organizationId: org,
    kind: "duplicate_review_refresh",
    opaquePayload: { caseId: "opaque-case-id" },
    idempotencyKey: "key-1",
  });
  await assert.rejects(
    store.enqueue({
      organizationId: org,
      kind: "duplicate_review_refresh",
      opaquePayload: { caseId: "other-opaque-case-id" },
      idempotencyKey: "key-1",
    }),
    /IDEMPOTENCY_CONFLICT/,
  );
});

Deno.test("gmail ingest accepts the delivery idempotency key required by the worker", async () => {
  const store = createInMemoryBackgroundJobStore();
  const id = await store.enqueue({
    organizationId: org,
    kind: "gmail_ingest",
    opaquePayload: {
      gmailMessageId: "gmail-message-1",
      deliveryIdempotencyKey: "rateware-gmail:gmail-message-1",
    },
    idempotencyKey: "rateware-gmail:gmail-message-1",
  });
  assert.equal(typeof id, "string");
});

Deno.test("terminal failures are completed and cannot be reclaimed", async () => {
  const store = createInMemoryBackgroundJobStore();
  const jobId = await store.enqueue({
    organizationId: org,
    kind: "gmail_ingest",
    opaquePayload: { gmailMessageId: "opaque-message-id" },
    idempotencyKey: "terminal-key",
  });
  const [job] = await store.claim({
    workerId: "worker-a",
    now: new Date("2026-08-23T00:00:00.000Z"),
    leaseMs: 60_000,
    limit: 1,
  });
  await store.fail({
    jobId,
    leaseToken: job.leaseToken,
    errorCode: "INVALID_INPUT",
    retryAt: null,
  });
  assert.deepEqual(
    await store.claim({
      workerId: "worker-b",
      now: new Date("2026-08-23T00:02:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    }),
    [],
  );
});

Deno.test("Sprint 2 extraction and form jobs retain the Sprint 1 lease contract", async () => {
  for (
    const [index, kind] of ([
      "document_extract",
      "quarterly_document_check",
      "form_ai_mapping",
    ] as const).entries()
  ) {
    const store = createInMemoryBackgroundJobStore();
    const jobId = await store.enqueue({
      organizationId: org,
      kind,
      opaquePayload: { caseId: `opaque-case-${index}` },
      idempotencyKey: `sprint2-${index}`,
    });
    const [job] = await store.claim({
      workerId: "worker-sprint2",
      now: new Date("2026-08-23T00:00:00.000Z"),
      leaseMs: 60_000,
      limit: 1,
    });
    assert.equal(job.id, jobId);
    assert.equal(job.kind, kind);
    await store.complete({
      jobId,
      leaseToken: job.leaseToken,
      completedAt: new Date("2026-08-23T00:00:30.000Z"),
    });
  }
});

Deno.test("Postgres background store scopes enqueue to one tenant and claims through the worker function", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const rows: Array<Array<Record<string, unknown>>> = [
    [],
    [],
    [{ id: "job-1", opaque_payload: { gmailMessageId: "opaque-message-id" } }],
    [],
    [{
      id: "job-1",
      organization_id: org,
      kind: "gmail_ingest",
      opaque_payload: { gmailMessageId: "opaque-message-id" },
      attempt: 1,
      lease_token: "lease-1",
      leased_until: "2026-08-23T00:01:00.000Z",
    }],
  ];
  const query = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve(rows.shift() ?? []);
  }) as SqlPort;
  query.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(query);
  const store = createPostgresBackgroundJobStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  assert.equal(
    await store.enqueue({
      organizationId: org,
      kind: "gmail_ingest",
      opaquePayload: { gmailMessageId: "opaque-message-id" },
      idempotencyKey: "gmail:opaque-message-id",
    }),
    "job-1",
  );
  const claimed = await store.claim({
    workerId: "worker-a",
    now: new Date("2026-08-23T00:00:00.000Z"),
    leaseMs: 60_000,
    limit: 1,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].leaseToken, "lease-1");
  assert.equal(calls[0].text, "set local role osp_workflow_api");
  assert.equal(
    calls[1].text,
    "select set_config('osp.organization_id', $, true)",
  );
  assert.match(calls[2].text, /insert into osp_private\.background_jobs/i);
  assert.match(calls[2].text, /::text::jsonb/i);
  assert.match(calls[3].text, /set local role osp_worker/i);
  assert.match(
    calls[4].text,
    /select \* from osp_private\.claim_next_background_jobs/i,
  );
  assert.doesNotMatch(calls[4].text, /job-1/);
  assert.deepEqual(calls[4].values, [60_000, 1]);
});

Deno.test("Postgres background store claims only an exact shadow XLSX extraction", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const caseId = "22222222-2222-4222-8222-222222222222";
  const jobId = "33333333-3333-4333-8333-333333333333";
  const documentVersionId = "44444444-4444-4444-8444-444444444444";
  const sourceSha256 = "a".repeat(64);
  const rows: Array<Array<Record<string, unknown>>> = [
    [],
    [{
      id: jobId,
      organization_id: org,
      kind: "document_extract",
      opaque_payload: JSON.stringify({ documentVersionId }),
      attempt: 1,
      lease_token: "55555555-5555-4555-8555-555555555555",
      leased_until: "2026-08-28T00:05:00.000Z",
    }],
  ];
  const query = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve(rows.shift() ?? []);
  }) as SqlPort;
  query.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(query);
  const store = createPostgresBackgroundJobStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const claimed = await store.claimShadowDocumentExtract({
    organizationId: org,
    caseId,
    jobId,
    documentVersionId,
    sourceSha256,
    leaseMs: 300_000,
  });
  assert.equal(claimed.length, 1);
  assert.deepEqual(claimed[0].opaquePayload, { documentVersionId });
  assert.match(calls[0].text, /set local role osp_worker/i);
  assert.match(
    calls[1].text,
    /select \* from osp_private\.claim_shadow_document_extract/i,
  );
  assert.deepEqual(calls[1].values, [
    org,
    caseId,
    jobId,
    documentVersionId,
    sourceSha256,
    300_000,
  ]);
});

Deno.test("Postgres background store claims only an exact supplier package snapshot", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const caseId = "22222222-2222-4222-8222-222222222222";
  const jobId = "33333333-3333-4333-8333-333333333333";
  const snapshotId = "44444444-4444-4444-8444-444444444444";
  const snapshotSha256 = "b".repeat(64);
  const rows: Array<Array<Record<string, unknown>>> = [
    [],
    [{
      id: jobId,
      organization_id: org,
      kind: "generate_supplier_package",
      opaque_payload: JSON.stringify({ caseId, snapshotId }),
      attempt: 1,
      lease_token: "55555555-5555-4555-8555-555555555555",
      leased_until: "2026-08-29T00:05:00.000Z",
    }],
  ];
  const query = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve(rows.shift() ?? []);
  }) as SqlPort;
  query.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(query);
  const store = createPostgresBackgroundJobStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const claimed = await store.claimSupplierPackageCanary({
    organizationId: org,
    caseId,
    jobId,
    snapshotId,
    snapshotSha256,
    leaseMs: 300_000,
  });
  assert.equal(claimed.length, 1);
  assert.deepEqual(claimed[0].opaquePayload, { caseId, snapshotId });
  assert.match(calls[0].text, /set local role osp_worker/i);
  assert.match(calls[1].text, /claim_supplier_package_canary/i);
  assert.deepEqual(calls[1].values, [
    org,
    caseId,
    jobId,
    snapshotId,
    snapshotSha256,
    300_000,
  ]);
});

Deno.test("Postgres background store rejects a worker lease token from another job", async () => {
  const query = ((strings: TemplateStringsArray) => {
    const text = strings.join("$");
    if (/set local role osp_worker/.test(text)) return Promise.resolve([]);
    if (/complete_background_job|fail_background_job/.test(text)) {
      return Promise.reject(new Error("LEASE_CONFLICT"));
    }
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }) as SqlPort;
  query.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(query);
  const store = createPostgresBackgroundJobStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assert.rejects(
    store.complete({
      jobId: "job-2",
      leaseToken: "11111111-1111-4111-8111-111111111111",
      completedAt: new Date(),
    }),
    /LEASE_CONFLICT/,
  );
});
