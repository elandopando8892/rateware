import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { parseCopiedRequest } from "../_shared/osp/gmail-envelope.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  type ExactThreadAssociationRun,
  runExactThreadAssociation,
} from "./exact-thread-runtime.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
function relay(label: string): Uint8Array {
  const original = [
    "From: supplier@provider.test",
    "To: sales@heymarksman.com",
    "Subject: Registration",
    `Message-ID: <${label}@provider.test>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="o"',
    "",
    "--o",
    "Content-Type: text/plain",
    "",
    "Complete application.",
    "--o",
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename="${label}.pdf"`,
    "Content-Transfer-Encoding: base64",
    "",
    btoa(`%PDF-1.4\n${label}`),
    "--o--",
    "",
  ].join("\r\n");
  return new TextEncoder().encode(
    [
      "From: sales@heymarksman.com",
      "To: carriers@xbfreight.com",
      "Subject: Fwd: registration",
      `Message-ID: <relay-${label}@heymarksman.com>`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="r"',
      "",
      "--r",
      "Content-Type: text/plain",
      "",
      "Attached.",
      "--r",
      "Content-Type: message/rfc822",
      'Content-Disposition: attachment; filename="original.eml"',
      "Content-Transfer-Encoding: base64",
      "",
      btoa(original),
      "--r--",
      "",
    ].join("\r\n"),
  );
}
async function setup() {
  const originalRaw = relay("original");
  const amendmentRaw = relay("amendment");
  const originalParsed = await parseCopiedRequest(originalRaw, {
    allowInternalRelay: true,
  });
  const amendmentParsed = await parseCopiedRequest(amendmentRaw, {
    allowInternalRelay: true,
  });
  const request: ExactThreadAssociationRun = {
    organizationId,
    priorJobId: "33333333-3333-4333-8333-333333333333",
    targetCaseId: "44444444-4444-4444-8444-444444444444",
    originalGmailMessageId: "original_1",
    originalOuterRawMimeSha256:
      originalParsed.provenance.parentEnvelope.sourceSha256,
    originalEmlSha256: originalParsed.provenance.originalEnvelope!.sourceSha256,
    amendmentGmailMessageId: "amendment_2",
    amendmentOuterRawMimeSha256:
      amendmentParsed.provenance.parentEnvelope.sourceSha256,
    amendmentEmlSha256:
      amendmentParsed.provenance.originalEnvelope!.sourceSha256,
  };
  return {
    request,
    messages: new Map([["original_1", originalRaw], [
      "amendment_2",
      amendmentRaw,
    ]]),
  };
}

Deno.test("exact thread runtime claims, persists and completes precisely one lease", async () => {
  const { request, messages } = await setup();
  let persisted = 0;
  const completed: unknown[] = [];
  const result = await runExactThreadAssociation({
    jobs: {
      enqueue: async (input) => {
        assertEquals(input.kind, "exact_thread_association");
        assertEquals(input.opaquePayload, {
          priorJobId: request.priorJobId,
          targetCaseId: request.targetCaseId,
          deliveryIdempotencyKey:
            `exact-thread:${request.targetCaseId}:${request.originalOuterRawMimeSha256}:${request.amendmentOuterRawMimeSha256}`,
          originalGmailMessageId: request.originalGmailMessageId,
          originalOuterRawMimeSha256: request.originalOuterRawMimeSha256,
          originalEmlSha256: request.originalEmlSha256,
          amendmentGmailMessageId: request.amendmentGmailMessageId,
          amendmentOuterRawMimeSha256: request.amendmentOuterRawMimeSha256,
          amendmentOriginalEmlSha256: request.amendmentEmlSha256,
        });
        return jobId;
      },
      claimExactThreadAssociation: async (claim) => {
        assertEquals(claim.jobId, jobId);
        assertEquals(claim.amendmentEmlSha256, request.amendmentEmlSha256);
        return [{
          id: jobId,
          organizationId,
          kind: "exact_thread_association",
          opaquePayload: {},
          attempt: 1,
          leaseToken: "55555555-5555-4555-8555-555555555555",
          leasedUntil: "2026-09-19T00:05:00Z",
        }];
      },
      complete: async (value) => {
        completed.push(value);
      },
      fail: async () => {
        throw new Error("FAIL_CALLED");
      },
    },
    gmail: {
      getMessage: async (id) => ({
        gmailMessageId: id,
        gmailThreadId: "thread-crane",
        rawMime: messages.get(id)!,
        receivedAt: "2026-09-19T00:00:00Z",
      }),
    },
    objects: {
      put: async ({ bytes }) => ({
        key: `${organizationId}/${await sha256Hex(bytes)}`,
        sha256: await sha256Hex(bytes),
      }),
    },
    persistence: {
      createReviewedThread: async () => {
        persisted++;
        return {
          caseId: request.targetCaseId,
          eventId: "event-1",
          replayed: false,
        };
      },
    },
    now: () => new Date("2026-09-19T00:01:00Z"),
  }, request);
  assertEquals(result, 1);
  assertEquals(persisted, 1);
  assertEquals(completed, [{
    jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
    completedAt: new Date("2026-09-19T00:01:00Z"),
  }]);
});

Deno.test("exact thread runtime records a terminal source mismatch and does not persist", async () => {
  const { request, messages } = await setup();
  let persisted = 0;
  const failures: unknown[] = [];
  await assertRejects(
    () =>
      runExactThreadAssociation({
        jobs: {
          enqueue: async () => jobId,
          claimExactThreadAssociation: async () => [{
            id: jobId,
            organizationId,
            kind: "exact_thread_association",
            opaquePayload: {},
            attempt: 1,
            leaseToken: "55555555-5555-4555-8555-555555555555",
            leasedUntil: "2026-09-19T00:05:00Z",
          }],
          complete: async () => {
            throw new Error("COMPLETE_CALLED");
          },
          fail: async (value) => {
            failures.push(value);
          },
        },
        gmail: {
          getMessage: async (id) => ({
            gmailMessageId: id,
            gmailThreadId: "thread-crane",
            rawMime: messages.get(id)!,
            receivedAt: "2026-09-19T00:00:00Z",
          }),
        },
        objects: {
          put: async ({ bytes }) => ({
            key: "opaque",
            sha256: await sha256Hex(bytes),
          }),
        },
        persistence: {
          createReviewedThread: async () => {
            persisted++;
            throw new Error("SHOULD_NOT_PERSIST");
          },
        },
      }, { ...request, amendmentEmlSha256: "f".repeat(64) }),
    Error,
    "PROVENANCE_MISMATCH",
  );
  assertEquals(persisted, 0);
  assertEquals(failures, [{
    jobId,
    leaseToken: "55555555-5555-4555-8555-555555555555",
    errorCode: "PERMANENT_FAILURE",
    retryAt: null,
  }]);
});
