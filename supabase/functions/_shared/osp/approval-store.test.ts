import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  createInMemoryApprovalStore,
  createPostgresApprovalStore,
} from "./approval-store.ts";
import type { SqlPort } from "./database-context.ts";
import type { ApprovalActor } from "./approval-types.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const snapshotSha256 = "a".repeat(64);
const payloadId = "33333333-3333-4333-8333-333333333333";
const payloadSha256 = "b".repeat(64);

const operations: ApprovalActor = {
  organizationId,
  subject: "operations-subject",
  verifiedEmail: "operations@example.test",
  permissions: ["osp:read", "osp:operate"],
  role: "operations_reviewer",
  authorizationSessionId: "session-operations-1",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
  active: true,
};

const jose: ApprovalActor = {
  ...operations,
  subject: "jose-subject",
  verifiedEmail: "jgonzalez@xbfreight.com",
  permissions: ["osp:read", "osp:signature-approve"],
  role: "signature_approver",
  authorizationSessionId: "session-signature-1",
};

Deno.test("approval store advances Operations and signature exactly once with immutable events", async () => {
  const store = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "operations_review",
      version: 10,
      currentSnapshotSha256: snapshotSha256,
    }],
    payloads: [{ organizationId, caseId, payloadId, payloadSha256 }],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  const command = {
    type: "complete_operations_review" as const,
    organizationId,
    caseId,
    inputSnapshotSha256: snapshotSha256,
    expectedCaseVersion: 10,
    idempotencyKey: "operations-1",
    actor: operations,
  };
  const completed = await store.transact(command);
  assertEquals(completed, {
    caseId,
    state: "signature_approval",
    caseVersion: 11,
    replayed: false,
  });
  assertEquals(await store.transact(command), { ...completed, replayed: true });
  assertEquals((await store.events(caseId)).length, 1);

  const signed = await store.transact({
    type: "approve_signature",
    organizationId,
    caseId,
    inputSnapshotSha256: snapshotSha256,
    signatureVaultRef: "vault-signature-1",
    signaturePositionVersion: 1,
    expectedCaseVersion: 11,
    idempotencyKey: "signature-1",
    actor: jose,
  });
  assertEquals(signed.state, "signature_approval");
  assertEquals(signed.caseVersion, 12);
  assertEquals((await store.events(caseId)).length, 2);
});

Deno.test("approval store rejects hash drift, cross-tenant scope, stale versions, and conflicting replay", async () => {
  const store = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "operations_review",
      version: 10,
      currentSnapshotSha256: snapshotSha256,
    }],
    payloads: [{ organizationId, caseId, payloadId, payloadSha256 }],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  const base = {
    type: "complete_operations_review" as const,
    organizationId,
    caseId,
    inputSnapshotSha256: snapshotSha256,
    expectedCaseVersion: 10,
    idempotencyKey: "operations-1",
    actor: operations,
  };
  await store.transact(base);
  for (
    const [candidate, code] of [
      [
        { ...base, inputSnapshotSha256: "c".repeat(64) },
        "IDEMPOTENCY_CONFLICT",
      ],
      [{ ...base, idempotencyKey: "operations-2" }, "VERSION_CONFLICT"],
      [{
        ...base,
        idempotencyKey: "operations-3",
        organizationId: "44444444-4444-4444-8444-444444444444",
      }, "APPROVAL_SCOPE_MISMATCH"],
    ] as const
  ) {
    await assertRejects(() => store.transact(candidate), Error, code);
  }
  assertEquals((await store.events(caseId)).length, 1);
});

Deno.test("Task 1 store cannot reserve or record an outbound send", async () => {
  const store = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "ready_to_send",
      version: 13,
      currentSnapshotSha256: snapshotSha256,
    }],
    payloads: [{ organizationId, caseId, payloadId, payloadSha256 }],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  await assertRejects(
    () =>
      store.transact({
        type: "request_authorized_send",
        organizationId,
        caseId,
        salesAuthorizationId: "55555555-5555-4555-8555-555555555555",
        payloadSha256,
        expectedCaseVersion: 13,
        idempotencyKey: "send-not-implemented",
        actor: {
          ...operations,
          subject: "carriers-subject",
          verifiedEmail: "carriers@xbfreight.com",
          permissions: ["osp:send-authorized"],
          role: "carriers_sender",
          authorizationSessionId: "session-carriers-1",
        },
      }),
    Error,
    "APPROVAL_TRANSITION_INVALID",
  );
  assertEquals(await store.events(caseId), []);
});

Deno.test("Postgres approval store uses one tenant transaction and only the reviewed command function", async () => {
  const statements: string[] = [];
  const transaction = ((strings: TemplateStringsArray) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push(sql);
    if (sql.includes("complete_operations_review_command")) {
      return Promise.resolve([{
        case_id: caseId,
        state: "signature_approval",
        case_version: 11,
        approval_id: null,
        authorization_id: null,
      }]);
    }
    return Promise.resolve([]);
  }) as SqlPort;
  transaction.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
    return await operation(transaction);
  };
  let options: Record<string, unknown> | undefined;
  const store = createPostgresApprovalStore({
    databaseUrl: "postgresql://synthetic.example.test/osp",
    postgresFactory: (_url, received) => {
      options = received;
      return transaction;
    },
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  const result = await store.transact({
    type: "complete_operations_review",
    organizationId,
    caseId,
    inputSnapshotSha256: snapshotSha256,
    expectedCaseVersion: 10,
    idempotencyKey: "operations-postgres-1",
    actor: operations,
  });
  assertEquals(result, {
    caseId,
    state: "signature_approval",
    caseVersion: 11,
    replayed: false,
  });
  assertEquals(
    (options?.connection as Record<string, unknown>).statement_timeout,
    "3000",
  );
  assertEquals(
    statements.some((sql) => sql === "set local role osp_workflow_api"),
    true,
  );
  assertEquals(
    statements.some((sql) =>
      sql === "set local statement_timeout = '3000ms'"
    ),
    true,
  );
  assertEquals(
    statements.filter((sql) =>
      sql.includes("complete_operations_review_command")
    ).length,
    1,
  );
  assertEquals(
    statements.some((sql) => sql.includes("approve_signature_command")),
    false,
  );
  assertEquals(
    statements.some((sql) => sql.includes("authorize_outbound_command")),
    false,
  );
});

Deno.test("Postgres approval store reduces private dependency failures to a safe code", async () => {
  const transaction = ((strings: TemplateStringsArray) => {
    const statement = strings.join("?");
    if (statement.includes("pg_advisory_xact_lock")) {
      return Promise.reject({
        code: "XX000",
        message: "private database value",
      });
    }
    return Promise.resolve([]);
  }) as SqlPort;
  transaction.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
    return await operation(transaction);
  };
  const store = createPostgresApprovalStore({
    databaseUrl: "postgresql://synthetic.example.test/osp",
    postgresFactory: () => transaction,
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  await assertRejects(
    () =>
      store.transact({
        type: "complete_operations_review",
        organizationId,
        caseId,
        inputSnapshotSha256: snapshotSha256,
        expectedCaseVersion: 10,
        idempotencyKey: "operations-private-error",
        actor: operations,
      }),
    Error,
    "APPROVAL_PERSISTENCE_FAILED",
  );
});

Deno.test("Postgres approval store maps only reviewed constraint messages", async () => {
  const transaction = ((strings: TemplateStringsArray) => {
    const statement = strings.join("?");
    if (statement.includes("complete_operations_review_command")) {
      return Promise.reject(new Error("OSP_PAYLOAD_MISMATCH"));
    }
    return Promise.resolve([]);
  }) as SqlPort;
  transaction.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
    return await operation(transaction);
  };
  const store = createPostgresApprovalStore({
    databaseUrl: "postgresql://synthetic.example.test/osp",
    postgresFactory: () => transaction,
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  await assertRejects(
    () =>
      store.transact({
        type: "complete_operations_review",
        organizationId,
        caseId,
        inputSnapshotSha256: snapshotSha256,
        expectedCaseVersion: 10,
        idempotencyKey: "operations-reviewed-error",
        actor: operations,
      }),
    Error,
    "PAYLOAD_HASH_MISMATCH",
  );
});
