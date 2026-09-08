import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import JSZip from "npm:jszip@3.10.1";

import type { RequestManifest } from "./openai-request-manifest.ts";
import { createRequestManifestDraftService } from "./request-manifest-draft.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const pdfId = "44444444-4444-4444-8444-444444444444";
const docxId = "55555555-5555-4555-8555-555555555555";
const imageId = "66666666-6666-4666-8666-666666666666";
const encoder = new TextEncoder();

async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function workbookBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registration");
  sheet.getCell("A1").value = "Legal name";
  sheet.getCell("B1").value = "Synthetic Carrier";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function macroWorkbookBytes(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await workbookBytes());
  const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    contentTypes
      .replace(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
      )
      .replace(
        "</Types>",
        '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
      ),
  );
  const relationships = await zip.file("xl/_rels/workbook.xml.rels")!.async(
    "string",
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    relationships.replace(
      "</Relationships>",
      '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>',
    ),
  );
  zip.file("xl/vbaProject.bin", new Uint8Array([1, 2, 3, 4]));
  return await zip.generateAsync({ type: "uint8array" });
}

const manifest = {
  schemaVersion: 1,
  requestType: "customer_setup",
  language: "en",
  targetXbfEntity: "unknown",
  requesterLegalName: {
    value: "Synthetic Carrier",
    confidence: 0.9,
    evidenceIds: [`file:${pdfId}`],
  },
  dueDate: { value: null, confidence: 0, evidenceIds: [] },
  forms: [{
    name: "Supplier form",
    format: "pdf",
    action: "complete",
    required: true,
    evidenceIds: [`file:${pdfId}`],
  }],
  requestedFields: [{
    id: "business.legalName",
    sourceLabel: "Legal name",
    canonicalFieldId: "business.legalName",
    valueType: "text",
    required: true,
    evidenceIds: [`file:${pdfId}`],
  }],
  requestedDocuments: [{
    documentType: "W-9",
    required: true,
    acceptableAlternatives: [],
    evidenceIds: [`file:${docxId}`],
  }],
  signature: {
    required: true,
    signerTitle: null,
    evidenceIds: [`file:${imageId}`],
  },
  submission: {
    method: "unknown",
    recipients: [],
    instructions: null,
    evidenceIds: [],
  },
  requirements: [],
  contradictions: [],
  missingInformation: [],
  clarificationQuestions: [],
  readiness: {
    status: "needs_clarification",
    reasonCodes: ["submission_instructions_missing"],
  },
} as const satisfies RequestManifest;

Deno.test("multimodal request manifest preserves hashes, sends each supported format once, and records only a review draft", async () => {
  const pdf = encoder.encode("synthetic-pdf");
  const docx = encoder.encode("synthetic-docx");
  const image = encoder.encode("synthetic-image");
  let interpreted: unknown;
  let recorded: Record<string, unknown> | undefined;
  const service = createRequestManifestDraftService({
    clock: () => new Date("2026-09-01T03:00:00.000Z"),
    interpreter: {
      interpretWithTelemetry: async (input) => {
        interpreted = input;
        return {
          manifest,
          telemetry: {
            responseId: "resp_synthetic",
            model: "gpt-synthetic",
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            durationMs: 40,
          },
        };
      },
    },
    store: {
      findByEvidence: async () => null,
      record: async (input) => {
        recorded = input as unknown as Record<string, unknown>;
        return {
          id: "77777777-7777-4777-8777-777777777777",
          version: 1,
          manifestSha256: input.manifestSha256,
          replayed: false,
        };
      },
    },
  });
  const result = await service.run({
    organizationId,
    caseId,
    message: {
      id: messageId,
      sourceSha256: "a".repeat(64),
      subject: "Customer setup",
      safeBody: "Please complete the attached forms.",
    },
    documents: [
      {
        versionId: pdfId,
        sourceName: "setup.pdf",
        contentType: "application/pdf",
        sourceSha256: await hash(pdf),
        sourceSafety: "safe",
        bytes: pdf,
      },
      {
        versionId: docxId,
        sourceName: "instructions.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sourceSha256: await hash(docx),
        sourceSafety: "safe",
        bytes: docx,
      },
      {
        versionId: imageId,
        sourceName: "signature.png",
        contentType: "image/png",
        sourceSha256: await hash(image),
        sourceSafety: "safe",
        bytes: image,
      },
    ],
  });

  const input = interpreted as {
    evidence: unknown[];
    attachments: Array<{ id: string; kind: string }>;
  };
  assertEquals(input.evidence.length, 1);
  assertEquals(input.attachments.map(({ id, kind }) => ({ id, kind })), [
    { id: `file:${pdfId}`, kind: "pdf_file" },
    { id: `file:${docxId}`, kind: "docx_file" },
    { id: `file:${imageId}`, kind: "image_file" },
  ]);
  assertEquals(result.manifest.sourceCoverage, {
    email: 1,
    xlsx: 0,
    xlsm: 0,
    pdf: 1,
    docx: 1,
    image: 1,
  });
  assertEquals(result.manifest.spreadsheetProtection, {
    macroEnabledFiles: 0,
    macroExecution: "blocked",
    analysisMode: "not_required",
  });
  assertEquals(result.manifest.externalEffects, false);
  assertEquals(result.manifest.status, "review_required");
  assertEquals(
    (recorded?.manifest as { generatedAt: string }).generatedAt,
    "2026-09-01T03:00:00.000Z",
  );
});

Deno.test("multimodal request manifest rejects a source hash mismatch before AI or persistence", async () => {
  let calls = 0;
  const service = createRequestManifestDraftService({
    interpreter: {
      interpretWithTelemetry: () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
    store: {
      findByEvidence: async () => {
        throw new Error("MUST_NOT_LOOKUP");
      },
      record: () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
  });
  await assertRejects(
    () =>
      service.run({
        organizationId,
        caseId,
        message: {
          id: messageId,
          sourceSha256: "a".repeat(64),
          subject: "Customer setup",
          safeBody: "Please complete the attached forms.",
        },
        documents: [{
          versionId: pdfId,
          sourceName: "setup.pdf",
          contentType: "application/pdf",
          sourceSha256: "b".repeat(64),
          sourceSafety: "safe",
          bytes: encoder.encode("different"),
        }],
      }),
    Error,
    "SOURCE_HASH_MISMATCH",
  );
  assertEquals(calls, 0);
});

Deno.test("multimodal request manifest reuses an exact evidence draft before calling OpenAI", async () => {
  const storedManifest = {
    schemaVersion: 1 as const,
    status: "review_required" as const,
    modelVersion: "gpt-synthetic",
    sourceCount: 1,
    sourceCoverage: { email: 1, xlsx: 0, xlsm: 0, pdf: 0, docx: 0, image: 0 },
    spreadsheetProtection: {
      macroEnabledFiles: 0,
      macroExecution: "blocked" as const,
      analysisMode: "not_required" as const,
    },
    generatedAt: "2026-09-01T03:00:00.000Z",
    requestType: manifest.requestType,
    language: manifest.language,
    targetXbfEntity: manifest.targetXbfEntity,
    requesterLegalName: manifest.requesterLegalName.value,
    dueDate: manifest.dueDate.value,
    forms: manifest.forms,
    requestedFields: manifest.requestedFields,
    requestedDocuments: manifest.requestedDocuments,
    signature: manifest.signature,
    submission: manifest.submission,
    requirements: manifest.requirements,
    contradictions: manifest.contradictions,
    missingInformation: manifest.missingInformation,
    clarificationQuestions: manifest.clarificationQuestions,
    readiness: manifest.readiness,
    aiGenerated: true as const,
    externalEffects: false as const,
  };
  let lookups = 0;
  const service = createRequestManifestDraftService({
    interpreter: {
      interpretWithTelemetry: async () => {
        throw new Error("MUST_NOT_CALL_OPENAI");
      },
    },
    store: {
      findByEvidence: async () => {
        lookups += 1;
        return {
          manifest: storedManifest,
          telemetry: {
            responseId: "resp_existing",
            model: "gpt-synthetic",
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            durationMs: 40,
          },
          receipt: {
            id: "77777777-7777-4777-8777-777777777777",
            version: 1,
            manifestSha256: "c".repeat(64),
            replayed: true,
          },
        };
      },
      record: async () => {
        throw new Error("MUST_NOT_RECORD");
      },
    },
  });
  const result = await service.run({
    organizationId,
    caseId,
    message: {
      id: messageId,
      sourceSha256: "a".repeat(64),
      subject: "Customer setup",
      safeBody: "",
    },
    documents: [],
  });
  assertEquals(lookups, 1);
  assertEquals(result.receipt.replayed, true);
  assertEquals(result.manifest.generatedAt, storedManifest.generatedAt);
});

Deno.test("multimodal request manifest rejects a model format that has no matching source evidence", async () => {
  const pdf = encoder.encode("synthetic-pdf-format-gate");
  const pdfSha256 = await hash(pdf);
  const mismatchedManifest = {
    ...manifest,
    forms: [{ ...manifest.forms[0], format: "docx" as const }],
  };
  let records = 0;
  const service = createRequestManifestDraftService({
    interpreter: {
      interpretWithTelemetry: async () => ({
        manifest: mismatchedManifest,
        telemetry: {
          responseId: "resp_format_gate",
          model: "gpt-synthetic",
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          durationMs: 40,
        },
      }),
    },
    store: {
      findByEvidence: async () => null,
      record: async () => {
        records += 1;
        throw new Error("MUST_NOT_RECORD");
      },
    },
  });
  await assertRejects(
    () =>
      service.run({
        organizationId,
        caseId,
        message: {
          id: messageId,
          sourceSha256: "a".repeat(64),
          subject: "Customer setup",
          safeBody: "Please complete the attached PDF form.",
        },
        documents: [{
          versionId: pdfId,
          sourceName: "setup.pdf",
          contentType: "application/pdf",
          sourceSha256: pdfSha256,
          sourceSafety: "safe",
          bytes: pdf,
        }],
      }),
    Error,
    "REQUEST_MANIFEST_FORM_FORMAT_MISMATCH",
  );
  assertEquals(records, 0);
});

Deno.test("multimodal request manifest preserves a complete PDF DOCX XLSX XLSM and image corpus", async () => {
  const pdf = encoder.encode("synthetic-pdf-corpus");
  const docx = encoder.encode("synthetic-docx-corpus");
  const image = encoder.encode("synthetic-image-corpus");
  const xlsx = await workbookBytes();
  const xlsm = await macroWorkbookBytes();
  const ids = {
    pdf: pdfId,
    docx: docxId,
    image: imageId,
    xlsx: "77777777-7777-4777-8777-777777777777",
    xlsm: "88888888-8888-4888-8888-888888888888",
  };
  const corpusManifest = {
    ...manifest,
    forms: [
      {
        ...manifest.forms[0],
        name: "Registration PDF",
        format: "pdf" as const,
        evidenceIds: [`file:${ids.pdf}`],
      },
      {
        ...manifest.forms[0],
        name: "Reference DOCX",
        format: "docx" as const,
        evidenceIds: [`file:${ids.docx}`],
      },
      {
        ...manifest.forms[0],
        name: "Registration XLSX",
        format: "xlsx" as const,
        evidenceIds: [`xlsx:${ids.xlsx}:1:1`],
      },
      {
        ...manifest.forms[0],
        name: "Registration XLSM",
        format: "xlsm" as const,
        evidenceIds: [`xlsx:${ids.xlsm}:1:1`],
      },
    ],
  };
  let interpretedInput:
    | Readonly<
      { evidence: readonly unknown[]; attachments?: readonly unknown[] }
    >
    | undefined;
  const service = createRequestManifestDraftService({
    clock: () => new Date("2026-09-07T03:00:00.000Z"),
    interpreter: {
      interpretWithTelemetry: async (input) => {
        interpretedInput = input;
        return {
          manifest: corpusManifest,
          telemetry: {
            responseId: "resp_corpus",
            model: "gpt-synthetic",
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            durationMs: 40,
          },
        };
      },
    },
    store: {
      findByEvidence: async () => null,
      record: async (input) => ({
        id: "99999999-9999-4999-8999-999999999999",
        version: 1,
        manifestSha256: input.manifestSha256,
        replayed: false,
      }),
    },
  });
  const result = await service.run({
    organizationId,
    caseId,
    message: {
      id: messageId,
      sourceSha256: "a".repeat(64),
      subject: "Complete supplier package",
      safeBody: "Return the PDF, DOCX, XLSX and XLSM sources.",
    },
    documents: [
      {
        versionId: ids.pdf,
        sourceName: "setup.pdf",
        contentType: "application/pdf",
        sourceSha256: await hash(pdf),
        sourceSafety: "safe",
        bytes: pdf,
      },
      {
        versionId: ids.docx,
        sourceName: "references.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sourceSha256: await hash(docx),
        sourceSafety: "safe",
        bytes: docx,
      },
      {
        versionId: ids.image,
        sourceName: "signature.png",
        contentType: "image/png",
        sourceSha256: await hash(image),
        sourceSafety: "safe",
        bytes: image,
      },
      {
        versionId: ids.xlsx,
        sourceName: "registration.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceSha256: await hash(xlsx),
        sourceSafety: "safe",
        bytes: xlsx,
      },
      {
        versionId: ids.xlsm,
        sourceName: "registration.xlsm",
        contentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
        sourceSha256: await hash(xlsm),
        sourceSafety: "safe",
        bytes: xlsm,
      },
    ],
  });
  assertEquals(result.manifest.sourceCount, 6);
  assertEquals(result.manifest.sourceCoverage, {
    email: 1,
    xlsx: 1,
    xlsm: 1,
    pdf: 1,
    docx: 1,
    image: 1,
  });
  assertEquals(result.manifest.spreadsheetProtection, {
    macroEnabledFiles: 1,
    macroExecution: "blocked",
    analysisMode: "sanitized_copy",
  });
  assertEquals((interpretedInput?.attachments ?? []).length, 3);
  assertEquals(
    (interpretedInput?.evidence ?? []).some((item) =>
      JSON.stringify(item).includes(ids.xlsm)
    ),
    true,
  );
});
Deno.test("email bundle rejects duplicate identities and excessive body before interpretation", async () => {
  let calls = 0;
  const service = createRequestManifestDraftService({
    interpreter: {
      interpretWithTelemetry: async () => {
        calls++;
        throw new Error("UNEXPECTED");
      },
    },
    store: {
      findByEvidence: async () => {
        calls++;
        throw new Error("UNEXPECTED");
      },
      record: async () => {
        calls++;
        throw new Error("UNEXPECTED");
      },
    },
  });
  const message = {
    id: "33333333-3333-4333-8333-333333333333",
    sourceSha256: "a".repeat(64),
    subject: "Amendment",
    safeBody: "Replace QF-168 with QF-167",
  };
  for (
    const previousMessages of [
      [message],
      Array.from(
        { length: 3 },
        (_, i) => ({
          ...message,
          id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
          safeBody: "x".repeat(30000),
        }),
      ),
    ]
  ) {
    await assertRejects(
      () =>
        service.run({
          organizationId: "11111111-1111-4111-8111-111111111111",
          caseId: "22222222-2222-4222-8222-222222222222",
          message,
          previousMessages,
          documents: [],
        }),
      Error,
      "REQUEST_MANIFEST_SOURCE_INVALID",
    );
  }
  assertEquals(calls, 0);
});
Deno.test("historical email identity and hash participate in manifest replay key", async () => {
  const keys: string[] = [];
  const service = createRequestManifestDraftService({
    interpreter: {
      interpretWithTelemetry: async () => {
        throw new Error("UNEXPECTED_AI");
      },
    },
    store: {
      findByEvidence: async ({ evidenceSha256 }) => {
        keys.push(evidenceSha256);
        throw new Error("CAPTURED_KEY");
      },
      record: async () => {
        throw new Error("UNEXPECTED_WRITE");
      },
    },
  });
  const latest = {
    id: "33333333-3333-4333-8333-333333333333",
    sourceSha256: "a".repeat(64),
    subject: "Amendment",
    safeBody: "Replace QF-168 with QF-167",
  };
  const original = {
    ...latest,
    id: "55555555-5555-4555-8555-555555555555",
    sourceSha256: "b".repeat(64),
    safeBody: "Six forms and fiscal documents",
  };
  for (
    const previousMessages of [[], [original], [original], [{
      ...original,
      sourceSha256: "c".repeat(64),
    }], [{ ...original, id: "66666666-6666-4666-8666-666666666666" }]]
  ) {
    await assertRejects(
      () =>
        service.run({
          organizationId,
          caseId,
          message: latest,
          previousMessages,
          documents: [],
        }),
      Error,
      "CAPTURED_KEY",
    );
  }
  assertEquals(keys.length, 5);
  assertEquals(keys[1], keys[2]);
  assertEquals(new Set([keys[0], keys[1], keys[3], keys[4]]).size, 4);
});
