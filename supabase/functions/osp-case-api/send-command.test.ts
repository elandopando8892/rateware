import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import type { ApprovalActor } from "../_shared/osp/approval-types.ts";
import { createInMemoryOutboundLedger } from "../osp-worker/outbound-receipt.ts";
import { requestAuthorizedSend } from "./send-command.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";
const authorizationId = "44444444-4444-4444-8444-444444444444";
const mimeSha256 = "a".repeat(64);

function actor(overrides: Partial<ApprovalActor> = {}): ApprovalActor {
  return {
    organizationId,
    subject: "carriers-subject",
    verifiedEmail: "carriers@xbfreight.com",
    permissions: ["osp:send-authorized"],
    role: "carriers_sender",
    authorizationSessionId: "session-carriers-1",
    authorizationSessionIssuedAt: "2026-08-24T17:58:00.000Z",
    active: true,
    ...overrides,
  };
}

function ledger(outboundEnabled = true) {
  return createInMemoryOutboundLedger({
    outboundEnabled,
    cases: [{ organizationId, caseId, version: 8, state: "ready_to_send" }],
    payloads: [{
      organizationId,
      caseId,
      payloadId,
      mimeObjectId: `outbound_${organizationId}_${payloadId}`,
      mimeSha256,
      threadId: "gmail-thread-0",
      status: "frozen",
    }],
    authorizations: [{
      organizationId,
      caseId,
      authorizationId,
      payloadId,
      payloadSha256: mimeSha256,
      status: "authorized",
    }],
    now: () => new Date("2026-08-24T18:00:00.000Z"),
  });
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 8,
    idempotencyKey: "send-click-1",
    actor: actor(),
    ...overrides,
  };
}

Deno.test("authorized send reservation is one Carriers action and exact duplicate clicks replay one job", async () => {
  const store = ledger();
  const first = await requestAuthorizedSend(command(), {
    store,
    now: () => new Date("2026-08-24T18:00:00.000Z"),
  });
  const replay = await requestAuthorizedSend(command(), {
    store,
    now: () => new Date("2026-08-24T18:00:00.000Z"),
  });
  assertEquals(first.outcome, "reserved");
  assertEquals(replay, { ...first, replayed: true });
  assertEquals((await store.pendingJobs()).length, 1);
});

Deno.test("an exact command replay after provider acceptance returns the stored opaque outcome", async () => {
  const store = ledger();
  const reservation = await requestAuthorizedSend(command(), {
    store,
    now: () => new Date("2026-08-24T18:00:00.000Z"),
  });
  const claimed = await store.claim({
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  });
  if (claimed.kind !== "send") throw new Error("TEST_SEND_NOT_CLAIMED");
  await store.recordSent({
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
    sendClaimToken: claimed.sendClaimToken,
    authorizationId,
    gmailMessageId: "gmail-message-1",
    gmailThreadId: "gmail-thread-0",
    canonicalMimeSha256: mimeSha256,
    deterministicMessageId: `<osp-${payloadId}@${
      ["xbfreight", "com"].join(".")
    }>`,
    providerTimestamp: "2026-08-24T18:00:01.000Z",
  });
  assertEquals(
    await requestAuthorizedSend(command(), {
      store,
      now: () => new Date("2026-08-24T18:00:02.000Z"),
    }),
    {
      attemptId: reservation.attemptId,
      jobId: reservation.jobId,
      outcome: "sent",
      replayed: true,
    },
  );
});

Deno.test("send reservation fails closed for disabled control, wrong identity, stale case, invalidated authorization, and changed payload", async () => {
  await assertRejects(
    () =>
      requestAuthorizedSend(command(), {
        store: ledger(false),
        now: () => new Date("2026-08-24T18:00:00.000Z"),
      }),
    Error,
    "OUTBOUND_DISABLED",
  );
  for (
    const candidate of [
      command({ actor: actor({ verifiedEmail: "operations@example.test" }) }),
      command({ expectedCaseVersion: 7 }),
      command({ payloadSha256: "b".repeat(64) }),
    ]
  ) {
    await assertRejects(
      () =>
        requestAuthorizedSend(candidate as ReturnType<typeof command>, {
          store: ledger(),
          now: () => new Date("2026-08-24T18:00:00.000Z"),
        }),
      Error,
    );
  }
});
