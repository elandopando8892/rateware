import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1.0.14";

import { deriveReplyContext } from "./reply-context.ts";
import { parseCopiedRequest } from "./gmail-envelope.ts";
import { sha256Hex } from "./source-hash.ts";

const contentTypes = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  doc: "application/msword",
} as const;

const fixtures = {
  pdf: "%PDF-1.4\nsynthetic",
  docx: "PK\x03\x04synthetic-docx",
  xlsx: "PK\x03\x04synthetic-xlsx",
  xlsm: "PK\x03\x04synthetic-xlsm",
  doc: "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1synthetic-legacy-doc",
} as const;

function originalAttachment(
  filename: string,
  contentType: string,
  content: string,
): string {
  return [
    "--original",
    `Content-Type: ${contentType}`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    btoa(content),
  ].join("\r\n");
}

function original(options: {
  attachments?: readonly string[];
  replyTo?: readonly string[];
  recipients?: string;
} = {}): string {
  const attachments = options.attachments ?? [
    originalAttachment("form.pdf", contentTypes.pdf, fixtures.pdf),
    originalAttachment("form.docx", contentTypes.docx, fixtures.docx),
    originalAttachment("form.xlsx", contentTypes.xlsx, fixtures.xlsx),
    originalAttachment("form.xlsm", contentTypes.xlsm, fixtures.xlsm),
  ];
  return [
    "From: Supplier <supplier@provider.test>",
    ...(options.replyTo?.map((address) => `Reply-To: ${address}`) ?? []),
    `To: ${options.recipients ?? "sales@heymarksman.com"}`,
    "Subject: Registration documents APP-77",
    "Message-ID: <supplier-request@provider.test>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="original"',
    "",
    "--original",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please complete both pages and attach insurance.",
    ...attachments,
    "--original--",
    "",
  ].join("\r\n");
}

function relay(originals: readonly string[], extraOuterPart = ""): Uint8Array {
  return new TextEncoder().encode([
    "From: Sales <sales@heymarksman.com>",
    "To: carriers@xbfreight.com",
    "Subject: Fwd: Registration documents",
    "Message-ID: <relay-parent@heymarksman.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="relay"',
    "",
    "--relay",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Forwarded for controlled exact ingestion.",
    ...originals.flatMap((item) => [
      "--relay",
      "Content-Type: message/rfc822",
      'Content-Disposition: attachment; filename="original.eml"',
      "Content-Transfer-Encoding: base64",
      "",
      btoa(item),
    ]),
    ...(extraOuterPart ? [extraOuterPart] : []),
    "--relay--",
    "",
  ].join("\r\n"));
}

Deno.test("exact relay preserves parent and original provenance and extracts supported evidence", async () => {
  const raw = relay([original()]);
  await assertRejects(
    () => parseCopiedRequest(raw),
    Error,
    "UNQUALIFIED_GMAIL_MESSAGE",
  );
  const result = await parseCopiedRequest(raw, { allowInternalRelay: true });
  assertEquals(result.supplierDomain, "provider.test");
  assertEquals(result.senderEmail, "sales@heymarksman.com");
  assertEquals(result.internetMessageId, "<supplier-request@provider.test>");
  assertEquals(result.to, ["supplier@provider.test", "carriers@xbfreight.com"]);
  assertStringIncludes(result.safeBody, "complete both pages");
  assertEquals(result.provenance.relationship, "internal_relay");
  assertEquals(
    result.provenance.parentEnvelope.internetMessageId,
    "<relay-parent@heymarksman.com>",
  );
  assertEquals(
    result.provenance.parentEnvelope.sourceSha256,
    await sha256Hex(raw),
  );
  assertEquals(
    result.provenance.originalEnvelope?.senderEmail,
    "supplier@provider.test",
  );
  assertEquals(result.provenance.externalReplyTo, ["supplier@provider.test"]);
  assertEquals(result.attachments.map((item) => item.sourceRole), [
    "original_eml",
    "original_attachment",
    "original_attachment",
    "original_attachment",
    "original_attachment",
  ]);
  assertEquals(result.attachments.map((item) => item.contentType), [
    "message/rfc822",
    contentTypes.pdf,
    contentTypes.docx,
    contentTypes.xlsx,
    contentTypes.xlsm,
  ]);
  assertEquals(
    result.attachments.slice(1).every((item) =>
      item.parentSourceSha256 === result.attachments[0].sha256
    ),
    true,
  );
  assertEquals(
    deriveReplyContext({
      senderEmail: result.senderEmail,
      internetMessageId: result.internetMessageId,
      subject: result.subject,
      to: result.to,
      cc: result.cc,
    }),
    {
      to: ["supplier@provider.test"],
      cc: ["sales@heymarksman.com"],
      subject: "Re: Registration documents APP-77",
      inReplyTo: "<supplier-request@provider.test>",
      references: ["<supplier-request@provider.test>"],
    },
  );
});

Deno.test("exact relay honors an unambiguous same-domain Reply-To", async () => {
  const result = await parseCopiedRequest(
    relay([original({ replyTo: ["forms@provider.test"] })]),
    { allowInternalRelay: true },
  );
  assertEquals(result.provenance.externalReplyTo, ["forms@provider.test"]);
  assertEquals(result.to, ["forms@provider.test", "carriers@xbfreight.com"]);
});

Deno.test("exact relay deduplicates identical original attachment hashes", async () => {
  const duplicate = originalAttachment(
    "copy.pdf",
    contentTypes.pdf,
    fixtures.pdf,
  );
  const result = await parseCopiedRequest(
    relay([original({
      attachments: [
        originalAttachment("form.pdf", contentTypes.pdf, fixtures.pdf),
        duplicate,
      ],
    })]),
    { allowInternalRelay: true },
  );
  assertEquals(result.attachments.length, 2);
  assertEquals(result.attachments[1].filename, "form.pdf");
});

Deno.test("exact relay preserves legacy DOC as manual-conversion evidence without declaring it safe", async () => {
  const result = await parseCopiedRequest(
    relay([original({
      attachments: [
        originalAttachment("CWW-QF-167.doc", contentTypes.doc, fixtures.doc),
      ],
    })]),
    { allowInternalRelay: true },
  );
  assertEquals(result.attachments[1].filename, "CWW-QF-167.doc");
  assertEquals(result.attachments[1].contentType, "application/msword");
  assertEquals(
    result.attachments[1].processingDisposition,
    "manual_conversion_required",
  );
  assertEquals(
    result.attachments[1].parentSourceSha256,
    result.attachments[0].sha256,
  );
});

Deno.test("OLE bytes cannot enter the relay as an automatically eligible non-DOC attachment", async () => {
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          attachments: [
            originalAttachment("renamed.docx", contentTypes.doc, fixtures.doc),
          ],
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_UNSAFE_ATTACHMENT",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          attachments: [
            originalAttachment(
              "legacy.doc",
              "application/octet-stream",
              fixtures.doc,
            ),
          ],
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_UNSAFE_ATTACHMENT",
  );
});

Deno.test("exact relay rejects ambiguous parent/original cardinality", async () => {
  await assertRejects(
    () =>
      parseCopiedRequest(relay([original(), original()]), {
        allowInternalRelay: true,
      }),
    Error,
    "GMAIL_RELAY_PARENT_CARDINALITY",
  );
  const outerPdf = [
    "--relay",
    "Content-Type: application/pdf",
    'Content-Disposition: attachment; filename="outer.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    btoa(fixtures.pdf),
  ].join("\r\n");
  await assertRejects(
    () =>
      parseCopiedRequest(relay([original()], outerPdf), {
        allowInternalRelay: true,
      }),
    Error,
    "GMAIL_RELAY_PARENT_CARDINALITY",
  );
});

Deno.test("exact relay rejects unsupported, spoofed, excessive, and ambiguous original input", async () => {
  await assertRejects(
    () =>
      parseCopiedRequest(relay([original({ attachments: [] })]), {
        allowInternalRelay: true,
      }),
    Error,
    "GMAIL_RELAY_ATTACHMENT_CARDINALITY",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          attachments: [
            originalAttachment("payload.exe", "application/octet-stream", "MZ"),
          ],
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_UNSAFE_ATTACHMENT",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          attachments: [
            originalAttachment("fake.pdf", contentTypes.pdf, "not-a-pdf"),
          ],
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_UNSAFE_ATTACHMENT",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          attachments: Array.from({ length: 21 }, (_, index) =>
            originalAttachment(
              `form-${index}.pdf`,
              contentTypes.pdf,
              fixtures.pdf,
            )),
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_ATTACHMENT_CARDINALITY",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          replyTo: ["one@provider.test", "two@provider.test"],
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_AMBIGUOUS_RECIPIENTS",
  );
  await assertRejects(
    () =>
      parseCopiedRequest(
        relay([original({
          recipients: "sales@heymarksman.com, observer@unrelated.test",
        })]),
        { allowInternalRelay: true },
      ),
    Error,
    "GMAIL_RELAY_AMBIGUOUS_RECIPIENTS",
  );
});
