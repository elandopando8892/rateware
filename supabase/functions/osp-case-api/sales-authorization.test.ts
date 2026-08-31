import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createInMemoryApprovalStore } from "../_shared/osp/approval-store.ts";
import type { ApprovalActor } from "../_shared/osp/approval-types.ts";
import {
  authorizeOutbound,
  createPostgresCurrentOutboundAuthorizationSource,
} from "./sales-authorization.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";
const payloadSha256 = "a".repeat(64);
const attachmentSha256 = ["b".repeat(64)];

const sales: ApprovalActor = {
  organizationId,
  subject: "sales-subject",
  verifiedEmail: "sales@heymarksman.com",
  permissions: ["osp:sales-authorize"],
  role: "sales_authorizer",
  authorizationSessionId: "session-sales",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
  active: true,
};

function source(kind: "clarification" | "final_response") {
  return {
    resolveCurrent: () =>
      Promise.resolve({
        organizationId,
        caseId,
        payloadId,
        kind,
        caseVersion: 7,
        mimeSha256: payloadSha256,
        attachmentSha256,
      }),
  };
}

Deno.test("Sales authorization binds current payload hash and full attachment list for both workflows without enqueueing send", async () => {
  for (const kind of ["clarification", "final_response"] as const) {
    const store = createInMemoryApprovalStore({
      cases: [{
        organizationId,
        caseId,
        state: kind === "clarification"
          ? "awaiting_clarification"
          : "sales_authorization",
        version: 7,
        currentSnapshotSha256: "c".repeat(64),
      }],
      payloads: [{
        organizationId,
        caseId,
        payloadId,
        payloadSha256,
        kind,
        attachmentSha256,
      }],
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });
    const result = await authorizeOutbound({
      organizationId,
      caseId,
      payloadId,
      payloadSha256,
      attachmentSha256,
      expectedCaseVersion: 7,
      idempotencyKey: `sales-${kind}`,
      actor: sales,
    }, {
      payloads: source(kind),
      approvals: store,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });
    assertEquals(result.state, "ready_to_send");
    assertEquals(result.caseVersion, 8);
    assertEquals((await store.events(caseId)).length, 1);
    assertEquals("enqueueSend" in store, false);
  }
});

Deno.test("authorization rejects wrong Sales identity, multi-role claims, stale hash, stale version, and changed attachment list", async () => {
  const approvals = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "sales_authorization",
      version: 7,
      currentSnapshotSha256: "c".repeat(64),
    }],
    payloads: [{
      organizationId,
      caseId,
      payloadId,
      payloadSha256,
      kind: "final_response",
      attachmentSha256,
    }],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  const base = {
    organizationId,
    caseId,
    payloadId,
    payloadSha256,
    attachmentSha256,
    expectedCaseVersion: 7,
    idempotencyKey: "sales-final",
    actor: sales,
  };
  for (
    const candidate of [
      { ...base, actor: { ...sales, verifiedEmail: "other@example.test" } },
      {
        ...base,
        actor: {
          ...sales,
          permissions: ["osp:sales-authorize", "osp:signature-approve"],
        },
      },
      { ...base, payloadSha256: "d".repeat(64) },
      { ...base, attachmentSha256: ["e".repeat(64)] },
      { ...base, expectedCaseVersion: 8 },
    ]
  ) {
    await assertRejects(
      () =>
        authorizeOutbound(candidate, {
          payloads: source("final_response"),
          approvals,
          now: () => new Date("2026-08-24T12:00:00.000Z"),
        }),
      Error,
    );
  }
  assertEquals(await approvals.events(caseId), []);
});

Deno.test("Sales authorization replays its receipt before resolving stale payload state", async () => {
  const approvals = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "sales_authorization",
      version: 7,
      currentSnapshotSha256: "c".repeat(64),
    }],
    payloads: [{
      organizationId,
      caseId,
      payloadId,
      payloadSha256,
      kind: "final_response",
      attachmentSha256,
    }],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  let resolutions = 0;
  const input = {
    organizationId,
    caseId,
    payloadId,
    payloadSha256,
    attachmentSha256,
    expectedCaseVersion: 7,
    idempotencyKey: "sales-replay",
    actor: sales,
  };
  const first = await authorizeOutbound(input, {
    payloads: {
      resolveCurrent: () => {
        resolutions += 1;
        return source("final_response").resolveCurrent();
      },
    },
    approvals,
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  const replay = await authorizeOutbound(input, {
    payloads: {
      resolveCurrent: () => {
        resolutions += 1;
        throw new Error("unexpected stale-state read before receipt");
      },
    },
    approvals,
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  assertEquals(first.replayed, false);
  assertEquals(replay.replayed, true);
  assertEquals(resolutions, 1);
});

Deno.test("Postgres Sales authorization resolves only the latest append-only draft", async () => {
  const queries: string[] = [];
  const query = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    queries.push(text);
    if (text.startsWith("set local role") || text.startsWith("select set_config")) return [];
    if (text.includes("from osp_private.outbound_payloads payload")) return [];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const payloads = createPostgresCurrentOutboundAuthorizationSource({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assertRejects(
    () => payloads.resolveCurrent({ organizationId, caseId, payloadId }),
    Error,
    "OUTBOUND_AUTHORIZATION_STALE",
  );
  assertEquals(queries.some((text) =>
    text.includes("join osp_private.outbound_drafts draft") &&
    text.includes("draft.version = (select max(latest.version)") &&
    text.includes("latest.payload_kind = draft.payload_kind") &&
    text.includes(
      "to_jsonb(payload.attachment_sha256s) as attachment_sha256s",
    )
  ), true);
});
