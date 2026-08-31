import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  captureInboundGmailEvent,
  captureOutboundGmailReceipt,
  createInMemoryOutboundLedger,
  createPostgresOutboundSendStore,
} from "./outbound-receipt.ts";

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
      threadId: "gmail-thread-1",
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
  });
}

Deno.test("duplicate Gmail webhook attaches one immutable outbound receipt", async () => {
  const store = ledger();
  const input = {
    organizationId,
    authorizationId,
    gmailMessageId: "gmail-message-1",
    gmailThreadId: "gmail-thread-1",
    canonicalMimeSha256: mimeSha256,
    deterministicMessageId: `<osp-${payloadId}@${
      ["xbfreight", "com"].join(".")
    }>`,
    providerTimestamp: "2026-08-24T18:00:01.000Z",
  };
  const first = await captureOutboundGmailReceipt(input, { store });
  const replay = await captureOutboundGmailReceipt(input, { store });
  assertEquals(replay, { ...first, replayed: true });
  assertEquals((await store.receipts(authorizationId)).length, 1);
});

Deno.test("receipt capture rejects wrong thread, hash, or Gmail identity", async () => {
  for (
    const override of [
      { gmailThreadId: "other-thread" },
      { canonicalMimeSha256: "b".repeat(64) },
      { gmailMessageId: "bad id" },
    ]
  ) {
    await assertRejects(
      () =>
        captureOutboundGmailReceipt({
          organizationId,
          authorizationId,
          gmailMessageId: "gmail-message-1",
          gmailThreadId: "gmail-thread-1",
          canonicalMimeSha256: mimeSha256,
          deterministicMessageId: `<osp-${payloadId}@${
            ["xbfreight", "com"].join(".")
          }>`,
          providerTimestamp: "2026-08-24T18:00:01.000Z",
          ...override,
        }, { store: ledger() }),
      Error,
      "OUTBOUND_RECEIPT_INVALID",
    );
  }
});

Deno.test("duplicate Gmail sent-copy webhook reconciles one immutable receipt after an ambiguous outcome", async () => {
  const store = ledger();
  const reservation = await store.reserve({
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 8,
    idempotencyKey: "send-webhook-1",
    actorSubject: "carriers-subject",
    actorEmail: "carriers@xbfreight.com",
    actorPermissions: ["osp:send-authorized"],
    actorRole: "carriers_sender",
    authorizationSessionId: "session-carriers",
    authorizationSessionIssuedAt: "2026-08-24T17:58:00.000Z",
    commandSha256: "c".repeat(64),
  });
  const claimed = await store.claim({
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
  });
  if (claimed.kind !== "send") throw new Error("TEST_SEND_NOT_CLAIMED");
  await store.recordAmbiguous({
    organizationId,
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
    sendClaimToken: claimed.sendClaimToken,
  });
  const rawMime = new TextEncoder().encode(
    `From: carriers@xbfreight.com\r\nTo: supplier@example.test\r\nMessage-ID: <osp-${payloadId}@${
      ["xbfreight", "com"].join(".")
    }>\r\nSubject: Synthetic\r\n\r\nSynthetic body.\r\n`,
  );
  const input = {
    organizationId,
    jobId: "66666666-6666-4666-8666-666666666666",
    leaseToken: "77777777-7777-4777-8777-777777777777",
    gmailMessageId: "gmail-message-1",
    gmailThreadId: "gmail-thread-1",
    receivedAt: "2026-08-24T18:00:01.000Z",
    rawMime,
  };
  const first = await captureInboundGmailEvent(input, { store });
  const replay = await captureInboundGmailEvent(input, { store });
  assertEquals(first.outcome, "outbound_receipt");
  if (first.outcome === "not_outbound") {
    throw new Error("TEST_RECEIPT_NOT_CLASSIFIED");
  }
  assertEquals(replay, { ...first, replayed: true });
  assertEquals((await store.receipts(authorizationId)).length, 1);
});

Deno.test("supplier reply on the immutable Gmail ancestry returns the sent case to analysis once", async () => {
  const store = ledger();
  const reservation = await store.reserve({
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 8,
    idempotencyKey: "send-reply-1",
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
    gmailThreadId: "gmail-thread-1",
    canonicalMimeSha256: mimeSha256,
    deterministicMessageId: `<osp-${payloadId}@${
      ["xbfreight", "com"].join(".")
    }>`,
    providerTimestamp: "2026-08-24T18:00:01.000Z",
  });
  const rawMime = new TextEncoder().encode(
    `From: Supplier <supplier@example.test>\r\nTo: carriers@xbfreight.com\r\nIn-Reply-To: <osp-${payloadId}@${
      ["xbfreight", "com"].join(".")
    }>\r\nMessage-ID: <supplier-reply@example.test>\r\nSubject: Re: Synthetic\r\n\r\nSynthetic reply.\r\n`,
  );
  const result = await captureInboundGmailEvent({
    organizationId,
    jobId: "66666666-6666-4666-8666-666666666666",
    leaseToken: "77777777-7777-4777-8777-777777777777",
    gmailMessageId: "gmail-message-2",
    gmailThreadId: "gmail-thread-1",
    receivedAt: "2026-08-24T18:05:00.000Z",
    rawMime,
  }, { store });
  assertEquals(result.outcome, "supplier_response");
  assertEquals(await store.caseState(caseId), "analyzing_requirements");
});

Deno.test("Postgres send reservation binds superuser permissions as an explicit text array", async () => {
  const attemptId = "55555555-5555-4555-8555-555555555555";
  const jobId = "66666666-6666-4666-8666-666666666666";
  const queries: string[] = [];
  const boundValues: unknown[][] = [];
  const query = Object.assign(async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    queries.push(text);
    boundValues.push(values);
    if (
      text.startsWith("set local role") || text.startsWith("select set_config")
    ) return [];
    if (text.includes("request_authorized_send_command")) {
      return [{
        attempt_id: attemptId,
        job_id: jobId,
        outcome: "reserved",
        replayed: false,
      }];
    }
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresOutboundSendStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });

  const reservation = await store.reserve({
    organizationId,
    caseId,
    salesAuthorizationId: authorizationId,
    payloadSha256: mimeSha256,
    expectedCaseVersion: 8,
    idempotencyKey: "send-superuser-array",
    actorSubject: "sales-subject",
    actorEmail: "sales@heymarksman.com",
    actorPermissions: ["osp:read", "osp:superuser"],
    actorRole: "carriers_sender",
    authorizationSessionId: "session-sales",
    authorizationSessionIssuedAt: "2026-08-31T19:50:00.000Z",
    commandSha256: "e".repeat(64),
  });

  assertEquals(reservation, {
    attemptId,
    jobId,
    outcome: "reserved",
    replayed: false,
  });
  const requestIndex = queries.findIndex((text) =>
    text.includes("request_authorized_send_command")
  );
  assertEquals(requestIndex >= 0, true);
  assertEquals(queries[requestIndex].includes("?::text[]"), true);
  assertEquals(
    boundValues[requestIndex].includes('{"osp:read","osp:superuser"}'),
    true,
  );
});

Deno.test("Postgres send claim binds the exact captured Gmail thread to the frozen draft", async () => {
  const attemptId = "55555555-5555-4555-8555-555555555555";
  const jobId = "66666666-6666-4666-8666-666666666666";
  const leaseToken = "77777777-7777-4777-8777-777777777777";
  const queries: string[] = [];
  const query = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    queries.push(text);
    if (
      text.startsWith("set local role") || text.startsWith("select set_config")
    ) return [];
    if (text.includes("claim_authorized_send")) {
      return [{
        preparation: "ready",
        authorization_id: authorizationId,
        mime_object_id: `outbound_${organizationId}_${payloadId}`,
        mime_sha256: mimeSha256,
        gmail_thread_id: null,
        deterministic_message_id: `<osp-${payloadId}@xbfreight.com>`,
        send_claim_token: "88888888-8888-4888-8888-888888888888",
      }];
    }
    if (text.includes("resolve_authorized_send_thread")) {
      return [{
        payload_kind: "final_response",
        gmail_thread_id: "gmail-thread-1",
      }];
    }
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresOutboundSendStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const claimed = await store.claim({
    organizationId,
    attemptId,
    jobId,
    leaseToken,
  });
  if (claimed.kind !== "send") throw new Error("TEST_SEND_NOT_CLAIMED");
  assertEquals(claimed.threadId, "gmail-thread-1");
  assertEquals(
    queries.some((text) => text.includes("resolve_authorized_send_thread")),
    true,
  );
});
