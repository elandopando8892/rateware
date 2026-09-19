import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { preflightExactThreadAssociation } from "./exact-thread-preflight.ts";

const organizationId = "ca0a8f30-1382-4316-9bd5-cb76d9ab4920";

function relay(
  label: string,
  sender = "supplier@provider.test",
  relaySender = "sales@heymarksman.com",
): Uint8Array {
  const original = [
    `From: ${sender}`,
    "To: sales@heymarksman.com",
    `Subject: Registration ${label}`,
    `Message-ID: <${label}@provider.test>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="o"',
    "",
    "--o",
    "Content-Type: text/plain",
    "",
    `Complete application ${label}.`,
    "--o",
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename="${label}.pdf"`,
    "Content-Transfer-Encoding: base64",
    "",
    btoa(`%PDF-1.4\n${label}`),
    "--o--",
    "",
  ].join("\r\n");
  return new TextEncoder().encode([
    `From: ${relaySender}`,
    "To: carriers@xbfreight.com",
    `Subject: Fwd: registration ${label}`,
    `Message-ID: <relay-${label}@heymarksman.com>`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="r"',
    "",
    "--r",
    "Content-Type: text/plain",
    "",
    "Original attached.",
    "--r",
    "Content-Type: message/rfc822",
    'Content-Disposition: attachment; filename="original.eml"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa(original),
    "--r--",
    "",
  ].join("\r\n"));
}

function harness(options: {
  amendmentThread?: string;
  amendmentSender?: string;
  relaySender?: string;
} = {}) {
  let reads = 0;
  const messages = new Map([
    ["original_1", relay("original", undefined, options.relaySender)],
    [
      "amendment_2",
      relay(
        "amendment",
        options.amendmentSender ?? "supplier@provider.test",
        options.relaySender,
      ),
    ],
  ]);
  return {
    reads: () => reads,
    gmail: {
      getMessage: async (gmailMessageId: string) => {
        reads++;
        return {
          gmailMessageId,
          gmailThreadId: gmailMessageId === "amendment_2"
            ? options.amendmentThread ?? "thread-crane"
            : "thread-crane",
          rawMime: messages.get(gmailMessageId)!,
          receivedAt: "2026-09-19T00:00:00Z",
        };
      },
    },
  };
}

const request = {
  organizationId,
  originalGmailMessageId: "original_1",
  amendmentGmailMessageId: "amendment_2",
};

Deno.test("exact thread preflight returns only immutable source hashes without persistence ports", async () => {
  const test = harness();
  const result = await preflightExactThreadAssociation(
    { gmail: test.gmail },
    request,
  );
  assertEquals(test.reads(), 2);
  assertEquals(Object.keys(result), ["original", "amendment"]);
  assertEquals(Object.keys(result.original), [
    "gmailMessageId",
    "outerRawMimeSha256",
    "originalEmlSha256",
  ]);
  assertEquals(result.original.gmailMessageId, "original_1");
  assertEquals(result.amendment.gmailMessageId, "amendment_2");
  assertEquals(result.original.outerRawMimeSha256.length, 64);
  assertEquals(result.original.originalEmlSha256.length, 64);
  assertEquals(
    result.original.outerRawMimeSha256 ===
      result.amendment.outerRawMimeSha256,
    false,
  );
});

Deno.test("exact thread preflight accepts relays forwarded by a trusted XBF operator", async () => {
  const test = harness({ relaySender: "jgonzalez@xbfreight.com" });
  const result = await preflightExactThreadAssociation(
    { gmail: test.gmail },
    request,
  );
  assertEquals(test.reads(), 2);
  assertEquals(result.original.gmailMessageId, "original_1");
  assertEquals(result.amendment.gmailMessageId, "amendment_2");
});

Deno.test("exact thread preflight rejects duplicate IDs before Gmail access", async () => {
  const test = harness();
  await assertRejects(
    () =>
      preflightExactThreadAssociation({ gmail: test.gmail }, {
        ...request,
        amendmentGmailMessageId: request.originalGmailMessageId,
      }),
    Error,
    "MESSAGES_MUST_DIFFER",
  );
  assertEquals(test.reads(), 0);
});

Deno.test("exact thread preflight rejects mismatched thread and external sender", async () => {
  const offThread = harness({ amendmentThread: "other-thread" });
  await assertRejects(
    () => preflightExactThreadAssociation({ gmail: offThread.gmail }, request),
    Error,
    "GMAIL_THREAD_MISMATCH",
  );
  const otherSender = harness({ amendmentSender: "other@provider.test" });
  await assertRejects(
    () =>
      preflightExactThreadAssociation({ gmail: otherSender.gmail }, request),
    Error,
    "EXTERNAL_SENDER_MISMATCH",
  );
});
