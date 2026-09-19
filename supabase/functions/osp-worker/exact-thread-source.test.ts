import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { parseCopiedRequest } from "../_shared/osp/gmail-envelope.ts";
import { createExactThreadSource } from "./exact-thread-source.ts";

const org = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const original = [
    "From: supplier@provider.test",
    "To: sales@heymarksman.com",
    "Subject: Registration",
    "Message-ID: <original@provider.test>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="o"',
    "",
    "--o",
    "Content-Type: text/plain",
    "",
    "Please complete application.",
    "--o",
    "Content-Type: application/msword",
    'Content-Disposition: attachment; filename="form.doc"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa("\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1legacy"),
    "--o--",
    "",
  ].join("\r\n");
  return new TextEncoder().encode(
    [
      "From: sales@heymarksman.com",
      "To: carriers@xbfreight.com",
      "Subject: Fwd: registration",
      "Message-ID: <relay@heymarksman.com>",
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
    ].join("\r\n"),
  );
}
async function harness(badStore = false) {
  const rawMime = fixture();
  const parsed = await parseCopiedRequest(rawMime, {
    allowInternalRelay: true,
  });
  let writes = 0;
  const source = createExactThreadSource({
    organizationId: org,
    gmail: {
      getMessage: async () => ({
        gmailMessageId: "m1",
        gmailThreadId: "t1",
        rawMime,
        receivedAt: "2026-09-01T00:00:00Z",
      }),
    },
    objects: {
      put: async ({ bytes }) => ({
        key: `${org}/${++writes}`,
        sha256: badStore ? "f".repeat(64) : await sha256Hex(bytes),
      }),
    },
  });
  return {
    source,
    writes: () => writes,
    expected: {
      gmailMessageId: "m1",
      outerRawMimeSha256: parsed.provenance.parentEnvelope.sourceSha256,
      originalEmlSha256: parsed.provenance.originalEnvelope!.sourceSha256,
    },
  };
}
Deno.test("exact source preserves legacy DOC as manual and retains original EML", async () => {
  const test = await harness();
  const result = await test.source.resolve(test.expected);
  assertEquals(
    result.source.attachments.map(
      (a) => [a.sourceRole, a.processingDisposition],
    ),
    [
      ["original_eml", "automatic_eligible"],
      ["original_attachment", "manual_conversion_required"],
    ],
  );
  assertEquals(test.writes(), 3);
});
Deno.test("exact source rejects unexpected source before object writes", async () => {
  const test = await harness();
  await assertRejects(
    () =>
      test.source.resolve({
        ...test.expected,
        originalEmlSha256: "f".repeat(64),
      }),
    Error,
    "PROVENANCE_MISMATCH",
  );
  assertEquals(test.writes(), 0);
});
Deno.test("exact source rejects storage hash mismatch before attachment writes", async () => {
  const test = await harness(true);
  await assertRejects(
    () => test.source.resolve(test.expected),
    Error,
    "SOURCE_HASH_MISMATCH",
  );
  assertEquals(test.writes(), 1);
});
