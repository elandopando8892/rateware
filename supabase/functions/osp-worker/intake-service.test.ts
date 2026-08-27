import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createIntakeService, parseCopiedRequest } from "./intake-service.ts";

const raw = (headers: string) =>
  new TextEncoder().encode(
    `${headers}${
      /\r?\nTo:/i.test(headers) ? "" : "\r\nTo: Supplier <ops@example.test>"
    }\r\nSubject: Example registration\r\n\r\nPlease complete supplier application.`,
  );
const xbfRequester = ["requester", "xbfreight.com"].join("@");

Deno.test("parser accepts encoded sender and multiple quoted Cc mailboxes but no display-name lookalike", async () => {
  const parsed = await parseCopiedRequest(
    raw(
      `From: =?utf-8?Q?XBF?= <${xbfRequester}>\r\nTo: Supplier <ops@example.test>\r\nCc: "Carriers Team" <carriers@xbfreight.com>, Other <other@example.test>`,
    ),
  );
  assertEquals(parsed.senderDomain, "xbfreight.com");
  assertEquals(parsed.supplierDomain, "example.test");
  assertEquals(parsed.to, ["ops@example.test"]);
  assertEquals(parsed.cc, ["carriers@xbfreight.com", "other@example.test"]);
  await assertRejects(
    () =>
      parseCopiedRequest(
        raw(
          `From: "${xbfRequester}" <attacker@example.test>\r\nCc: carriers@xbfreight.com`,
        ),
      ),
    Error,
    "UNQUALIFIED_GMAIL_MESSAGE",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        raw(
          `From: ${xbfRequester}\r\nCc: "${
            ["carriers", "xbfreight.com"].join("@")
          }" <attacker@example.test>`,
        ),
      ),
    Error,
    "UNQUALIFIED_GMAIL_MESSAGE",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        raw(`From: ${xbfRequester}\r\nTo: carriers@xbfreight.com`),
      ),
    Error,
    "UNQUALIFIED_GMAIL_MESSAGE",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        raw("From: requester@example.test\r\nCc: carriers@xbfreight.com"),
      ),
    Error,
    "UNQUALIFIED_GMAIL_MESSAGE",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(new TextEncoder().encode("not an rfc 822 message")),
    Error,
    "MALFORMED_MIME",
  );
});

Deno.test("intake forwards duplicate evidence to exact and probable persistence paths", async () => {
  const rawMime = raw(
    `From: ${xbfRequester}\r\nTo: Supplier <ops@example.test>\r\nCc: carriers@xbfreight.com`,
  );
  const evidence: Array<{ kind: string; score: number }> = [];
  const calls: string[] = [];
  let objectWrites = 0;
  const service = createIntakeService({
    gmail: {
      getMessage: async (id: string) => ({
        gmailMessageId: id,
        gmailThreadId: "thread-1",
        rawMime,
        receivedAt: "2026-08-22T00:00:00.000Z",
      }),
    },
    objects: {
      put: async (input) => ({
        key: `${input.organizationId}/11111111-1111-4111-8111-111111111111`,
        sha256: objectWrites++ === 0 ? "a".repeat(64) : "b".repeat(64),
      }),
    },
    persistence: {
      findDuplicates: async (_organizationId, candidate) =>
        candidate.gmailMessageId === "exact-message"
          ? [{
            ...candidate,
            caseId: "case-exact",
            gmailMessageId: "exact-message",
          }]
          : [{
            ...candidate,
            caseId: "case-probable",
            gmailMessageId: "other-message",
            rawMimeHash: "c".repeat(64),
            gmailThreadId: candidate.gmailThreadId,
          }],
      createCase: async () => ({
        caseId: "case-created",
        eventId: "event-created",
      }),
      attachExact: async (input) => {
        calls.push(`exact:${input.existingCaseId}`);
        evidence.push(...input.evidence);
        return { caseId: input.existingCaseId, eventId: "event-exact" };
      },
      holdForReview: async (input) => {
        calls.push(`probable:${input.candidateIds.join(",")}`);
        evidence.push(...input.evidence);
        return { caseId: "case-held" };
      },
      refreshDuplicateReview: async () => undefined,
    },
    jobs: { enqueue: async () => "job-1" },
  });
  await service.ingest({
    organizationId: "22222222-2222-4222-8222-222222222222",
    gmailMessageId: "exact-message",
    deliveryIdempotencyKey: "delivery-exact",
  });
  await service.ingest({
    organizationId: "22222222-2222-4222-8222-222222222222",
    gmailMessageId: "probable-message",
    deliveryIdempotencyKey: "delivery-probable",
  });
  assertEquals(calls, ["exact:case-exact", "probable:case-probable"]);
  assertEquals(
    evidence.some((signal) => signal.kind === "gmail_message_id"),
    true,
  );
  assertEquals(
    evidence.some((signal) => signal.kind === "thread_ancestry"),
    true,
  );
  assertEquals(
    evidence.some((signal) => signal.kind === "supplier_domain"),
    true,
  );
});

Deno.test("intake persists opaque attachment object references with their hashes", async () => {
  const multipart = [
    `From: ${xbfRequester}`,
    "To: Supplier <ops@example.test>",
    "Cc: carriers@xbfreight.com",
    "Subject: Supplier registration",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="boundary"',
    "",
    "--boundary",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please complete the supplier registration.",
    "--boundary",
    "Content-Type: application/pdf",
    'Content-Disposition: attachment; filename="unsafe.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    "UERGIGZpeHR1cmU=",
    "--boundary--",
    "",
  ].join("\r\n");
  let savedSource: unknown;
  let savedAttachmentByteLength = 0;
  const service = createIntakeService({
    gmail: {
      getMessage: async (id: string) => ({
        gmailMessageId: id,
        gmailThreadId: "thread-1",
        rawMime: new TextEncoder().encode(multipart),
        receivedAt: "2026-08-22T00:00:00.000Z",
      }),
    },
    objects: {
      put: async (input) => {
        if (input.contentType === "message/rfc822") {
          return {
            key: "22222222-2222-4222-8222-222222222222/raw",
            sha256: "a".repeat(64),
          };
        }
        savedAttachmentByteLength = input.bytes.byteLength;
        return {
          key: "22222222-2222-4222-8222-222222222222/attachment",
          sha256: "b".repeat(64),
        };
      },
    },
    persistence: {
      findDuplicates: async () => [],
      createCase: async (input) => {
        savedSource = input.source;
        return { caseId: "case-1", eventId: "event-1" };
      },
      attachExact: async () => ({ caseId: "case-1", eventId: "event-2" }),
      holdForReview: async () => ({ caseId: "case-2" }),
      refreshDuplicateReview: async () => undefined,
    },
    jobs: { enqueue: async () => "job-1" },
  });
  await service.ingest({
    organizationId: "22222222-2222-4222-8222-222222222222",
    gmailMessageId: "message_1",
    deliveryIdempotencyKey: "delivery-1",
  });
  assertEquals(
    (savedSource as { attachments: readonly unknown[] }).attachments,
    [{
      objectKey: "22222222-2222-4222-8222-222222222222/attachment",
      sha256: "b".repeat(64),
      contentType: "application/pdf",
    }],
  );
  assertEquals(savedAttachmentByteLength, 11);
});

Deno.test("intake creates, attaches exact replay, and holds probable duplicates without auto merge", async () => {
  const calls: string[] = [];
  const service = createIntakeService({
    gmail: {
      getMessage: async (id: string) => ({
        gmailMessageId: id,
        gmailThreadId: id === "probable" ? "thread-shared" : "thread-1",
        rawMime: raw(
          `From: ${xbfRequester}\r\nTo: Supplier <ops@example.test>\r\nCc: carriers@xbfreight.com`,
        ),
        receivedAt: "2026-08-22T00:00:00.000Z",
      }),
    },
    objects: {
      put: async () => ({
        key:
          "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111",
        sha256: "a".repeat(64),
      }),
    },
    persistence: {
      findDuplicates: async () => [],
      createCase: async () => ({ caseId: "case-1", eventId: "event-1" }),
      attachExact: async () => ({ caseId: "case-1", eventId: "event-2" }),
      holdForReview: async () => ({ caseId: "case-2" }),
      refreshDuplicateReview: async () => undefined,
    },
    jobs: {
      enqueue: async (input) => {
        calls.push(input.kind);
        return "job-1";
      },
    },
  });
  assertEquals(
    (await service.ingest({
      organizationId: "22222222-2222-4222-8222-222222222222",
      gmailMessageId: "message_1",
      deliveryIdempotencyKey: "delivery-1",
    })).outcome,
    "created",
  );
  assertEquals(calls, ["duplicate_review_refresh"]);
});

Deno.test("intake routes a leased outbound receipt before supplier-request parsing", async () => {
  let persistenceCalls = 0;
  let objectWrites = 0;
  const rawMime = new TextEncoder().encode(
    `From: carriers@xbfreight.com\r\nTo: supplier@example.test\r\nMessage-ID: <osp-33333333-3333-4333-8333-333333333333@${
      ["xbfreight", "com"].join(".")
    }>\r\n\r\nSynthetic`,
  );
  const service = createIntakeService({
    gmail: {
      getMessage: async (id: string) => ({
        gmailMessageId: id,
        gmailThreadId: "thread-1",
        rawMime,
        receivedAt: "2026-08-24T18:00:01.000Z",
      }),
    },
    objects: {
      put: async () => {
        objectWrites += 1;
        return { key: "unused", sha256: "a".repeat(64) };
      },
    },
    persistence: {
      findDuplicates: async () => {
        persistenceCalls += 1;
        return [];
      },
      createCase: async () => {
        persistenceCalls += 1;
        return { caseId: "unused", eventId: "unused" };
      },
      attachExact: async () => {
        persistenceCalls += 1;
        return { caseId: "unused", eventId: "unused" };
      },
      holdForReview: async () => {
        persistenceCalls += 1;
        return { caseId: "unused" };
      },
      refreshDuplicateReview: async () => undefined,
    },
    jobs: { enqueue: async () => "unused" },
    receipts: {
      capture: async (input) => {
        assertEquals(input.jobId, "job-1");
        assertEquals(input.leaseToken, "11111111-1111-4111-8111-111111111111");
        return {
          outcome: "outbound_receipt",
          caseId: "case-1",
          replayed: false,
        };
      },
    },
  });
  assertEquals(
    await service.ingest({
      organizationId: "22222222-2222-4222-8222-222222222222",
      gmailMessageId: "message-1",
      deliveryIdempotencyKey: "delivery-1",
      jobId: "job-1",
      leaseToken: "11111111-1111-4111-8111-111111111111",
    }),
    { outcome: "outbound_receipt", caseId: "case-1", replayed: false },
  );
  assertEquals(persistenceCalls, 0);
  assertEquals(objectWrites, 0);
});
