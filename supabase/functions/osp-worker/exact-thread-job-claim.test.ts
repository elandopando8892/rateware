import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import {
  createInMemoryBackgroundJobStore,
  createPostgresBackgroundJobStore,
} from "../_shared/osp/background-jobs.ts";

Deno.test("background store enqueues one exact thread payload idempotently", async () => {
  const store = createInMemoryBackgroundJobStore();
  const input = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    kind: "exact_thread_association" as const,
    opaquePayload: {
      priorJobId: "33333333-3333-4333-8333-333333333333",
      targetCaseId: "44444444-4444-4444-8444-444444444444",
      deliveryIdempotencyKey: "exact-thread:target:a:b",
      originalGmailMessageId: "original_1",
      originalOuterRawMimeSha256: "a".repeat(64),
      originalEmlSha256: "b".repeat(64),
      amendmentGmailMessageId: "amendment_2",
      amendmentOuterRawMimeSha256: "c".repeat(64),
      amendmentOriginalEmlSha256: "d".repeat(64),
    },
    idempotencyKey: "exact-thread-association:target",
  };
  const first = await store.enqueue(input);
  const replay = await store.enqueue(input);
  assertEquals(replay, first);
});

Deno.test("background store binds every exact thread claim parameter", async () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const input = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    jobId: "22222222-2222-4222-8222-222222222222",
    priorJobId: "33333333-3333-4333-8333-333333333333",
    targetCaseId: "44444444-4444-4444-8444-444444444444",
    originalGmailMessageId: "original_1",
    originalOuterRawMimeSha256: "a".repeat(64),
    originalEmlSha256: "b".repeat(64),
    amendmentGmailMessageId: "amendment_2",
    amendmentOuterRawMimeSha256: "c".repeat(64),
    amendmentEmlSha256: "d".repeat(64),
    leaseMs: 300_000,
  };
  const rows = [[], [{
    id: input.jobId,
    organization_id: input.organizationId,
    kind: "exact_thread_association",
    opaque_payload: { targetCaseId: input.targetCaseId },
    attempt: 1,
    lease_token: "55555555-5555-4555-8555-555555555555",
    leased_until: "2026-09-19T00:05:00Z",
  }]];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve(rows.shift() ?? []);
  }) as SqlPort;
  sql.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(sql);
  const store = createPostgresBackgroundJobStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  const claimed = await store.claimExactThreadAssociation(input);
  assertEquals(claimed.length, 1);
  assertMatch(calls[0].text, /set local role osp_worker/i);
  assertMatch(calls[1].text, /claim_exact_thread_association/i);
  assertEquals(calls[1].values, [
    input.organizationId,
    input.jobId,
    input.priorJobId,
    input.targetCaseId,
    input.originalGmailMessageId,
    input.originalOuterRawMimeSha256,
    input.originalEmlSha256,
    input.amendmentGmailMessageId,
    input.amendmentOuterRawMimeSha256,
    input.amendmentEmlSha256,
    input.leaseMs,
  ]);
});
