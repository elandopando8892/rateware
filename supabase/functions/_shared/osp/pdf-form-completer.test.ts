import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { PDFDocument } from "pdf-lib";

import { sha256Hex } from "./source-hash.ts";
import { completePdfArtifact } from "./pdf-form-completer.ts";
import { classifySupplierArtifact } from "./supplier-artifact-port.ts";

const sourceVersionId = "11111111-1111-4111-8111-111111111111";
const packageSnapshotId = "22222222-2222-4222-8222-222222222222";
const packageSnapshotSha256 = "b".repeat(64);
const mappingDecisionId = "33333333-3333-4333-8333-333333333333";

async function acroFormSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const field = document.getForm().createTextField("supplier_legal_name");
  field.addToPage(page, { x: 72, y: 680, width: 240, height: 24 });
  return await document.save({ useObjectStreams: false });
}

async function flatPdfSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return await document.save({ useObjectStreams: false });
}

Deno.test("supplier artifact routing preserves official portal and original artifact precedence", () => {
  assertEquals(
    classifySupplierArtifact({
      kind: "portal",
      portalUrl: "https://supplier.example.test/register",
    }),
    {
      kind: "official_portal",
      humanTaskUrl: "https://supplier.example.test/register",
    },
  );
  assertEquals(
    classifySupplierArtifact({
      kind: "file",
      contentType: "application/pdf",
      hasAcroForm: true,
    }),
    { kind: "pdf_acroform" },
  );
  assertEquals(
    classifySupplierArtifact({
      kind: "file",
      contentType: "application/pdf",
      hasAcroForm: false,
    }),
    { kind: "pdf_flat" },
  );
  assertEquals(
    classifySupplierArtifact({
      kind: "file",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    { kind: "xlsx" },
  );
  assertEquals(classifySupplierArtifact({ kind: "none" }), {
    kind: "generated_form",
  });
  for (
    const portalUrl of [
      "http://supplier.example.test/register",
      "https://user@supplier.example.test/register",
      "https://supplier.example.test/register?token=secret",
    ]
  ) {
    try {
      classifySupplierArtifact({ kind: "portal", portalUrl });
      throw new Error("expected rejection");
    } catch (error) {
      assertEquals((error as Error).message, "ARTIFACT_ROUTE_INVALID");
    }
  }
});

Deno.test("PDF completer fills a copy, preserves the source, and binds every reviewed mapping", async () => {
  const sourceBytes = await acroFormSource();
  const original = sourceBytes.slice();
  const sourceSha256 = await sha256Hex(sourceBytes);
  const input = {
    sourceVersionId,
    sourceBytes,
    sourceSha256,
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    flatten: true,
    mappings: [{
      kind: "acroform" as const,
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      fieldName: "supplier_legal_name",
      value: "XBF Logistics",
    }],
  };
  const first = await completePdfArtifact(input);
  const second = await completePdfArtifact(input);
  assertEquals(sourceBytes, original);
  assertEquals(first.receipt, second.receipt);
  assertEquals(first.bytes, second.bytes);
  assertEquals(first.receipt.sourceSha256, sourceSha256);
  assertEquals(first.receipt.packageSnapshotSha256, packageSnapshotSha256);
  assertEquals(first.receipt.outputSha256, await sha256Hex(first.bytes));
  assertEquals(first.receipt.mappings, [{
    kind: "acroform",
    mappingDecisionId,
    canonicalFieldId: "supplier.legalName",
    target: "supplier_legal_name",
  }]);
  const completed = await PDFDocument.load(first.bytes);
  assertEquals(completed.getForm().getFields().length, 0);
});

Deno.test("PDF completer fills a reviewed flat-PDF overlay deterministically", async () => {
  const sourceBytes = await flatPdfSource();
  const input = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    flatten: false,
    mappings: [{
      kind: "overlay" as const,
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      page: 1,
      x: 0,
      y: 0,
      width: 240,
      height: 24,
      fontSize: 10,
      value: "XBF Logistics",
    }],
  };
  const first = await completePdfArtifact(input);
  const repeated = await completePdfArtifact(input);
  assertEquals(first.bytes, repeated.bytes);
  assertEquals(first.receipt, repeated.receipt);
  assertEquals(first.receipt.mappings, [{
    kind: "pdf_overlay",
    mappingDecisionId,
    canonicalFieldId: "supplier.legalName",
    target: "page:1:0:0:240:24:10",
  }]);
  assertEquals((await PDFDocument.load(first.bytes)).getPageCount(), 1);
});

Deno.test("PDF completer appends a deterministic reviewed response when the source has no fields", async () => {
  const sourceBytes = await flatPdfSource();
  const input = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    flatten: false,
    mappings: [{
      kind: "appendix" as const,
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      value: "XBF Logistics",
    }],
  };
  const first = await completePdfArtifact(input);
  const repeated = await completePdfArtifact(input);
  assertEquals(first.bytes, repeated.bytes);
  assertEquals((await PDFDocument.load(first.bytes)).getPageCount(), 2);
  assertEquals(first.receipt.mappings[0].kind, "pdf_appendix");
});

Deno.test("PDF completer rejects source drift, unknown AcroForm fields, and unreviewed overlays", async () => {
  const sourceBytes = await acroFormSource();
  const base = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    flatten: false,
  };
  await assertRejects(
    () =>
      completePdfArtifact({
        ...base,
        sourceSha256: "a".repeat(64),
        mappings: [],
      }),
    Error,
    "ARTIFACT_SOURCE_MISMATCH",
  );
  await assertRejects(
    () =>
      completePdfArtifact({
        ...base,
        approvedMappingDecisionIds: ["44444444-4444-4444-8444-444444444444"],
        mappings: [{
          kind: "acroform",
          mappingDecisionId,
          canonicalFieldId: "supplier.legalName",
          fieldName: "supplier_legal_name",
          value: "XBF",
        }],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
  await assertRejects(
    () =>
      completePdfArtifact({
        ...base,
        mappings: [{
          kind: "acroform",
          mappingDecisionId,
          canonicalFieldId: "supplier.legalName",
          fieldName: "unknown_field",
          value: "XBF",
        }],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
  await assertRejects(
    () =>
      completePdfArtifact({
        ...base,
        mappings: [{
          kind: "overlay",
          mappingDecisionId,
          canonicalFieldId: "supplier.legalName",
          page: 0,
          x: 72,
          y: 680,
          width: 200,
          height: 20,
          fontSize: 10,
          value: "XBF",
        }],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
});
