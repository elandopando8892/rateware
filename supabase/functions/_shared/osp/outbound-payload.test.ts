import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert@1.0.14";

import {
  freezeOutboundPayload,
  type OutboundDraft,
} from "./outbound-payload.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";
const attachmentA = new TextEncoder().encode("synthetic attachment A");
const attachmentB = new TextEncoder().encode("synthetic attachment B");

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function draft(
  overrides: Partial<OutboundDraft> = {},
): Promise<OutboundDraft> {
  return {
    payloadId,
    organizationId,
    caseId,
    kind: "clarification",
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    from: "carriers@xbfreight.com",
    to: [{ email: "supplier@example.test", source: "captured_supplier" }],
    cc: [{ email: "reviewed@example.test", source: "reviewed_manual" }],
    subject: "Clarification required",
    inReplyTo: "<source-message@example.test>",
    references: ["<source-message@example.test>"],
    bodyText: "Please confirm the registered address.\nThank you.",
    attachments: [{
      bucketId: "osp-corporate-documents",
      objectId: "44444444-4444-4444-8444-444444444444",
      name: "questions.pdf",
      contentType: "application/pdf",
      sha256: await sha256(attachmentA),
    }],
    ...overrides,
  };
}

Deno.test("freezing the same clarification draft produces identical MIME bytes and reads each private attachment once", async () => {
  const source = await draft();
  let reads = 0;
  const resolver = ({ objectId }: { objectId: string }) => {
    reads += 1;
    assertEquals(objectId, "44444444-4444-4444-8444-444444444444");
    return Promise.resolve(attachmentA.slice());
  };
  const first = await freezeOutboundPayload(source, resolver);
  assertEquals(reads, 1);
  reads = 0;
  const second = await freezeOutboundPayload(source, resolver);
  assertEquals(reads, 1);
  assertEquals(first.mimeBytes, second.mimeBytes);
  assertEquals(first.mimeSha256, second.mimeSha256);
  assertEquals(first.mimeSha256, await sha256(first.mimeBytes));
  assertEquals(first.attachmentSha256, [await sha256(attachmentA)]);
  const mime = new TextDecoder().decode(first.mimeBytes);
  assertEquals(mime.includes("From: carriers@xbfreight.com\r\n"), true);
  assertEquals(
    mime.includes(
      `Message-ID: <osp-${payloadId}@${["xbfreight", "com"].join(".")}>\r\n`,
    ),
    true,
  );
  assertEquals(mime.includes("Bcc:"), false);
  assertEquals(mime.includes("X-OSP-Case-Version: 7\r\n"), true);
  assertEquals(mime.endsWith("\r\n"), true);
});

Deno.test("final response MIME binds exactly one signed package and changes after one body byte", async () => {
  const signedPackageSha256 = await sha256(attachmentA);
  const attachments = [
    {
      bucketId: "osp-derived-documents" as const,
      objectId: "44444444-4444-4444-8444-444444444444",
      name: "signed-package.pdf",
      contentType: "application/pdf" as const,
      sha256: await sha256(attachmentA),
    },
  ];
  const source = await draft({
    kind: "final_response",
    signedPackageSha256,
    attachments,
  });
  const resolver = ({ objectId }: { objectId: string }) =>
    Promise.resolve(
      objectId === "44444444-4444-4444-8444-444444444444"
        ? attachmentA.slice()
        : attachmentB.slice(),
  );
  const frozen = await freezeOutboundPayload(source, resolver);
  const edited = await freezeOutboundPayload({
    ...source,
    bodyText: `${source.bodyText}.`,
  }, resolver);
  assertNotEquals(edited.mimeSha256, frozen.mimeSha256);
  await assertRejects(
    () => freezeOutboundPayload({
      ...source,
      attachments: [...attachments, {
        bucketId: "osp-derived-documents" as const,
        objectId: "55555555-5555-4555-8555-555555555555",
        name: "evidence.pdf",
        contentType: "application/pdf" as const,
        sha256: "c".repeat(64),
      }],
    }, resolver),
    Error,
    "OUTBOUND_PAYLOAD_INVALID",
  );
});

Deno.test("outbound body length matches the browser contract and final responses include the signed package attachment", async () => {
  const source = await draft();
  await freezeOutboundPayload(
    { ...source, bodyText: "a".repeat(100_000) },
    () => Promise.resolve(attachmentA.slice()),
  );
  await assertRejects(
    () => freezeOutboundPayload(
      { ...source, bodyText: "a".repeat(100_001) },
      () => Promise.resolve(attachmentA.slice()),
    ),
    Error,
    "OUTBOUND_PAYLOAD_INVALID",
  );
  await assertRejects(
    () => freezeOutboundPayload(
      {
        ...source,
        kind: "final_response",
        signedPackageSha256: "b".repeat(64),
      },
      () => Promise.resolve(attachmentA.slice()),
    ),
    Error,
    "OUTBOUND_PAYLOAD_INVALID",
  );
});

Deno.test("MIME hash binds the private bucket selected for every attachment", async () => {
  const source = await draft();
  const resolver = () => Promise.resolve(attachmentA.slice());
  const corporate = await freezeOutboundPayload(source, resolver);
  const derived = await freezeOutboundPayload({
    ...source,
    attachments: source.attachments.map((attachment) => ({
      ...attachment,
      bucketId: "osp-derived-documents" as const,
    })),
  }, resolver);

  assertNotEquals(derived.mimeSha256, corporate.mimeSha256);
});

Deno.test("MIME freezing rejects unreviewed recipients, BCC, header injection, Unicode ambiguity, unsigned final packages, and attachment substitution", async () => {
  const base = await draft();
  const invalid = [
    {
      ...base,
      to: [{ email: "supplier@example.test", source: "ai_suggestion" }],
    },
    {
      ...base,
      bcc: [{ email: "hidden@example.test", source: "reviewed_manual" }],
    },
    { ...base, subject: "Approved\r\nBcc: hidden@example.test" },
    { ...base, subject: "Cafe\u0301" },
    { ...base, kind: "final_response", signedPackageSha256: null },
    { ...base, from: "sales@heymarksman.com" },
  ] as unknown as OutboundDraft[];
  for (const candidate of invalid) {
    await assertRejects(
      () =>
        freezeOutboundPayload(candidate, () => Promise.resolve(attachmentA)),
      Error,
      "OUTBOUND_PAYLOAD_INVALID",
    );
  }
  await assertRejects(
    () => freezeOutboundPayload(base, () => Promise.resolve(attachmentB)),
    Error,
    "OUTBOUND_ATTACHMENT_MISMATCH",
  );
  await assertRejects(
    () =>
      freezeOutboundPayload(base, () => Promise.reject(new Error("timeout"))),
    Error,
    "OUTBOUND_ATTACHMENT_UNAVAILABLE",
  );
});
