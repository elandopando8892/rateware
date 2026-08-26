import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { AmbiguousSendError } from "../_shared/osp/gmail-send-adapter.ts";
import { KnownPreAcceptanceSendError } from "../_shared/osp/gmail-send-adapter.ts";
import type { GmailSendPort } from "../_shared/osp/gmail-send-port.ts";
import { createInMemoryOutboundLedger } from "./outbound-receipt.ts";
import { runOutboundSendJob } from "./outbound-send-job.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";
const authorizationId = "44444444-4444-4444-8444-444444444444";
const mimeSha256 = "a".repeat(64);

function ledger() {
  return createInMemoryOutboundLedger({
    outboundEnabled: true,
    cases: [{ organizationId, caseId, version: 8, state: "ready_to_send" }],
    payloads: [{
      organizationId,
      caseId,
      payloadId,
      mimeObjectId: `outbound_${organizationId}_${payloadId}`,
      mimeSha256,
      threadId: null,
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

async function reserved(store: ReturnType<typeof ledger>) {
  return await store.reserve({
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 8,
    idempotencyKey: "send-1",
    actorSubject: "carriers-subject",
    actorEmail: "carriers@xbfreight.com",
    actorPermissions: ["osp:send-authorized"],
    actorRole: "carriers_sender",
    authorizationSessionId: "session-carriers",
    authorizationSessionIssuedAt: "2026-08-24T17:58:00.000Z",
    commandSha256: "c".repeat(64),
  });
}

function gmail(send: GmailSendPort["sendFrozen"]): GmailSendPort {
  return Object.freeze({ sendFrozen: send });
}

Deno.test("send job records one receipt and duplicate leases never call Gmail twice", async () => {
  const store = ledger();
  const reservation = await reserved(store);
  let calls = 0;
  const port = gmail(async () => {
    calls += 1;
    return {
      gmailMessageId: "gmail-message-1",
      gmailThreadId: "gmail-thread-1",
      acceptedAt: "2026-08-24T18:00:01.000Z",
    };
  });
  const input = {
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  };
  const first = await runOutboundSendJob(input, {
    store,
    gmail: port,
    signal: AbortSignal.timeout(5_000),
  });
  const replay = await runOutboundSendJob(input, {
    store,
    gmail: port,
    signal: AbortSignal.timeout(5_000),
  });
  assertEquals(first.outcome, "sent");
  assertEquals(replay, first);
  assertEquals(calls, 1);
});

Deno.test("ambiguous Gmail outcome stops for manual reconciliation and schedules no retry", async () => {
  const store = ledger();
  const reservation = await reserved(store);
  const result = await runOutboundSendJob({
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  }, {
    store,
    gmail: gmail(async () => {
      throw new AmbiguousSendError();
    }),
    signal: AbortSignal.timeout(5_000),
  });
  assertEquals(result.outcome, "manual_reconciliation_required");
  assertEquals(await store.pendingJobs(), []);
});

Deno.test("worker crash after Gmail response cannot cause a second send", async () => {
  const store = ledger();
  const reservation = await reserved(store);
  let calls = 0;
  const port = gmail(async () => {
    calls += 1;
    return {
      gmailMessageId: "gmail-message-1",
      gmailThreadId: "gmail-thread-1",
      acceptedAt: "2026-08-24T18:00:01.000Z",
    };
  });
  store.failNextReceiptCommit();
  const input = {
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  };
  await assertRejects(
    () =>
      runOutboundSendJob(input, {
        store,
        gmail: port,
        signal: AbortSignal.timeout(5_000),
      }),
    Error,
    "DATABASE_TEMPORARY",
  );
  const reconciled = await runOutboundSendJob(input, {
    store,
    gmail: port,
    signal: AbortSignal.timeout(5_000),
  });
  assertEquals(reconciled.outcome, "manual_reconciliation_required");
  assertEquals(calls, 1);
});

Deno.test("a known pre-acceptance refusal permits one later operator reservation with the same deterministic Message-ID", async () => {
  const store = ledger();
  const first = await reserved(store);
  const failed = await runOutboundSendJob({
    organizationId,
    attemptId: first.attemptId,
    jobId: first.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  }, {
    store,
    gmail: gmail(async () => {
      throw new KnownPreAcceptanceSendError();
    }),
    signal: AbortSignal.timeout(5_000),
  });
  assertEquals(failed.outcome, "failed");
  const second = await store.reserve({
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 9,
    idempotencyKey: "send-2",
    actorSubject: "carriers-subject",
    actorEmail: "carriers@xbfreight.com",
    actorPermissions: ["osp:send-authorized"],
    actorRole: "carriers_sender",
    authorizationSessionId: "session-carriers",
    authorizationSessionIssuedAt: "2026-08-24T17:58:00.000Z",
    commandSha256: "d".repeat(64),
  });
  const claimed = await store.claim({
    organizationId,
    attemptId: second.attemptId,
    jobId: second.jobId,
    leaseToken: "66666666-6666-4666-8666-666666666666",
  });
  if (claimed.kind !== "send") throw new Error("TEST_SEND_NOT_CLAIMED");
  assertEquals(
    claimed.deterministicMessageId,
    `<osp-${payloadId}@${["xbfreight", "com"].join(".")}>`,
  );
});
