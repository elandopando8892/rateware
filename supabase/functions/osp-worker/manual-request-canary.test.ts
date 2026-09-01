import { assertEquals } from "jsr:@std/assert@1.0.14";
import JSZip from "npm:jszip@3.10.1";
import { PDFDocument } from "pdf-lib";

import { parseCopiedRequest } from "./intake-service.ts";
import {
  buildManualRequestCanaryMime,
  createManualRequestCanaryService,
} from "./manual-request-canary.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";

async function digest(bytes: Uint8Array) {
  const value = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(
    new Uint8Array(value),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function pdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return await document.save({ useObjectStreams: false });
}

async function docx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Crane setup</w:t></w:r></w:p></w:body></w:document>',
  );
  zip.file("docProps/core.xml", '<?xml version="1.0"?><coreProperties/>');
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("manual request canary builds a qualified copied request with PDF and DOCX", async () => {
  const pdfBytes = await pdf();
  const docxBytes = await docx();
  const parsed = await parseCopiedRequest(
    buildManualRequestCanaryMime(pdfBytes, docxBytes),
  );
  assertEquals(parsed.senderEmail, "sales@heymarksman.com");
  assertEquals(parsed.supplierDomain, "crane-canary.test");
  assertEquals(parsed.attachments.map(({ contentType }) => contentType), [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  assertEquals(parsed.attachments[0].bytes, pdfBytes);
  assertEquals(parsed.attachments[1].bytes, docxBytes);
});

Deno.test("manual request canary preserves hashes and produces no external effect", async () => {
  const pdfBytes = await pdf();
  const docxBytes = await docx();
  const pdfSha256 = await digest(pdfBytes);
  const docxSha256 = await digest(docxBytes);
  let persistedAttachments = 0;
  const service = createManualRequestCanaryService({
    configuration: {
      organizationId,
      pdfSha256,
      docxSha256,
      token: "t".repeat(64),
    },
    objects: {
      async put(input) {
        return {
          key: `${organizationId}/${crypto.randomUUID()}`,
          sha256: await digest(input.bytes),
        };
      },
    },
    persistence: {
      findDuplicates: async () => [],
      async createCase(input) {
        persistedAttachments = input.parsed.attachments.length;
        return { caseId, eventId: crypto.randomUUID() };
      },
      attachExact: () => Promise.reject(new Error("UNEXPECTED_ATTACH")),
      holdForReview: () => Promise.reject(new Error("UNEXPECTED_HOLD")),
      refreshDuplicateReview: () => Promise.resolve(),
    },
    promotions: {
      promoteCase: async () => [
        {
          documentVersionId: "33333333-3333-4333-8333-333333333333",
          templateVersionId: null,
        },
        {
          documentVersionId: "44444444-4444-4444-8444-444444444444",
          templateVersionId: null,
        },
      ],
    },
    manifests: {
      analyze: async () => ({
        status: "review_required",
        externalEffects: false,
      }),
    },
  });
  const result = await service.run({
    organizationId,
    pdfSha256,
    docxSha256,
    pdfBytes,
    docxBytes,
  });
  assertEquals(persistedAttachments, 2);
  assertEquals(result.caseId, caseId);
  assertEquals(result.externalEffects, false);
  assertEquals(result.sourceSha256s, [docxSha256, pdfSha256].sort());
});
