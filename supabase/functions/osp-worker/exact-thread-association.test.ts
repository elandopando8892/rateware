import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  createExactThreadAssociationService,
  type ExactThreadAssociationRequest,
  type ResolvedExactThreadMessage,
} from "./exact-thread-association.ts";

const sha = (letter: string) => letter.repeat(64);
const organizationId = "ca0a8f30-1382-4316-9bd5-cb76d9ab4920";
const request: ExactThreadAssociationRequest = {
  organizationId,
  priorJobId: "11111111-1111-4111-8111-111111111111",
  targetCaseId: "22222222-2222-4222-8222-222222222222",
  deliveryIdempotencyKey: "exact-thread:crane:1",
  original: {
    gmailMessageId: "original_1",
    outerRawMimeSha256: sha("a"),
    originalEmlSha256: sha("b"),
  },
  amendment: {
    gmailMessageId: "amendment_2",
    outerRawMimeSha256: sha("c"),
    originalEmlSha256: sha("d"),
  },
};

function resolved(
  expectation: ExactThreadAssociationRequest["original"],
  overrides: Partial<ResolvedExactThreadMessage> = {},
): ResolvedExactThreadMessage {
  const parsed = {
    senderEmail: "supplier@example.test",
    senderDomain: "example.test",
    internetMessageId: "<source@example.test>",
    supplierDomain: "example.test",
    to: [],
    cc: [],
    subject: "Crane",
    safeBody: "Request",
    attachments: [],
    requirementTokens: [],
    applicationReference: null,
    provenance: {
      relationship: "internal_relay" as const,
      parentEnvelope: {
        senderEmail: "relay@xbfreight.com",
        senderDomain: "xbfreight.com",
        internetMessageId: null,
        to: [],
        cc: [],
        subject: "relay",
        sourceSha256: expectation.outerRawMimeSha256,
      },
      originalEnvelope: {
        senderEmail: "supplier@example.test",
        senderDomain: "example.test",
        internetMessageId: "<source@example.test>",
        to: [],
        cc: [],
        subject: "Crane",
        sourceSha256: expectation.originalEmlSha256,
      },
      externalReplyTo: [],
      externalReplyCc: [],
    },
  };
  return {
    source: {
      gmailMessageId: expectation.gmailMessageId,
      gmailThreadId: "thread-crane",
      rawMimeKey: "opaque/raw",
      rawMimeHash: expectation.outerRawMimeSha256,
      attachments: [],
      attachmentHashes: [],
      receivedAt: "2026-09-01T00:00:00.000Z",
    },
    parsed,
    outerRawMimeSha256: expectation.outerRawMimeSha256,
    originalEmlSha256: expectation.originalEmlSha256,
    ...overrides,
  };
}

function harness(
  options: { amendment?: ResolvedExactThreadMessage; replayed?: boolean } = {},
) {
  let writes = 0;
  const service = createExactThreadAssociationService({
    sources: {
      resolve: async (expected) =>
        expected.gmailMessageId === request.original.gmailMessageId
          ? resolved(request.original)
          : options.amendment ?? resolved(request.amendment),
    },
    persistence: {
      createReviewedThread: async (input) => {
        writes += 1;
        assertEquals(input.organizationId, organizationId);
        assertEquals(
          input.original.source.gmailMessageId,
          request.original.gmailMessageId,
        );
        assertEquals(
          input.amendment.source.gmailMessageId,
          request.amendment.gmailMessageId,
        );
        return {
          caseId: request.targetCaseId,
          eventId: "event-1",
          replayed: options.replayed ?? false,
        };
      },
    },
  });
  return { service, writes: () => writes };
}

Deno.test("exact thread association persists precisely two validated relay sources", async () => {
  const test = harness();
  const result = await test.service.associate(request);
  assertEquals(result, {
    caseId: request.targetCaseId,
    eventId: "event-1",
    replayed: false,
  });
  assertEquals(test.writes(), 1);
});

Deno.test("exact thread association rejects mismatched outer and original hashes before persistence", async () => {
  const outer = harness({
    amendment: resolved(request.amendment, { outerRawMimeSha256: sha("f") }),
  });
  await assertRejects(
    () => outer.service.associate(request),
    Error,
    "OUTER_MIME_HASH_MISMATCH",
  );
  assertEquals(outer.writes(), 0);
  const eml = harness({
    amendment: resolved(request.amendment, { originalEmlSha256: sha("f") }),
  });
  await assertRejects(
    () => eml.service.associate(request),
    Error,
    "EML_HASH_MISMATCH",
  );
  assertEquals(eml.writes(), 0);
});

Deno.test("exact thread association rejects parsed provenance that contradicts resolver hashes", async () => {
  for (const envelope of ["parentEnvelope", "originalEnvelope"] as const) {
    const source = resolved(request.amendment);
    const corrupted = {
      ...source,
      parsed: {
        ...source.parsed,
        provenance: {
          ...source.parsed.provenance,
          [envelope]: {
            ...source.parsed.provenance[envelope]!,
            sourceSha256: sha("f"),
          },
        },
      },
    };
    const test = harness({ amendment: corrupted });
    await assertRejects(
      () => test.service.associate(request),
      Error,
      "PROVENANCE_HASH_MISMATCH",
    );
    assertEquals(test.writes(), 0);
  }
});

Deno.test("exact thread association rejects a different thread or external sender before persistence", async () => {
  const offThread = resolved(request.amendment, {
    source: {
      ...resolved(request.amendment).source,
      gmailThreadId: "other-thread",
    },
  });
  const test = harness({ amendment: offThread });
  await assertRejects(
    () => test.service.associate(request),
    Error,
    "GMAIL_THREAD_MISMATCH",
  );
  assertEquals(test.writes(), 0);
  const source = resolved(request.amendment);
  const otherSender = {
    ...source,
    parsed: {
      ...source.parsed,
      senderEmail: "other@example.test",
      senderDomain: "example.test",
    },
  };
  const sender = harness({ amendment: otherSender });
  await assertRejects(
    () => sender.service.associate(request),
    Error,
    "EXTERNAL_SENDER_MISMATCH",
  );
  assertEquals(sender.writes(), 0);
});

Deno.test("exact thread association returns a persistence receipt replay unchanged", async () => {
  const test = harness({ replayed: true });
  const result = await test.service.associate(request);
  assertEquals(result.replayed, true);
  assertEquals(test.writes(), 1);
});
