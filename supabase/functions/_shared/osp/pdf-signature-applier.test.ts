import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";

import { createPdfSignatureApplier } from "./pdf-signature-applier.ts";
import { sha256Hex } from "./source-hash.ts";

async function pdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return await document.save({ useObjectStreams: false });
}

Deno.test("private PDF applier hashes source/output and exposes only an opaque receipt", async () => {
  const source = await pdf();
  const signature = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (value) => value.charCodeAt(0),
  );
  const writes: Array<{ id: string; bytes: Uint8Array }> = [];
  const applier = createPdfSignatureApplier({
    objects: {
      read: async () => source,
      writeExclusive: async (input) => {
        writes.push({ id: input.objectId, bytes: input.bytes });
      },
    },
    policies: {
      resolve: async () => ({
        signatureBytes: signature,
        contentType: "image/png" as const,
        targetKind: "pdf" as const,
        page: 1,
        x: 72,
        y: 72,
        width: 120,
        height: 40,
      }),
    },
    uuid: () => "44444444-4444-4444-8444-444444444444",
  });
  const receipt = await applier.apply({
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    approvalId: "33333333-3333-4333-8333-333333333333",
    jobId: "55555555-5555-4555-8555-555555555555",
    leaseToken: "66666666-6666-4666-8666-666666666666",
    inputObjectId: "private-input-object",
    expectedInputSha256: await sha256Hex(source),
    signaturePositionVersion: 1,
  }, new AbortController().signal);
  assertEquals(receipt.inputSha256, await sha256Hex(source));
  assertEquals(
    receipt.outputObjectId,
    "signed:11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444",
  );
  assertEquals(receipt.outputSha256, await sha256Hex(writes[0].bytes));
  assertEquals(Object.keys(receipt).sort(), [
    "inputSha256",
    "outputObjectId",
    "outputSha256",
  ]);
});

Deno.test("private PDF applier rejects hash drift and page/position escapes", async () => {
  const source = await pdf();
  const sourceSha256 = await sha256Hex(source);
  const make = (page: number, x = 72) =>
    createPdfSignatureApplier({
      objects: {
        read: async () => source,
        writeExclusive: async () => undefined,
      },
      policies: {
        resolve: async () => ({
          signatureBytes: new Uint8Array([1]),
          contentType: "image/png" as const,
          targetKind: "pdf" as const,
          page,
          x,
          y: 72,
          width: 120,
          height: 40,
        }),
      },
    });
  await assertRejects(
    () =>
      make(1).apply({
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        approvalId: "33333333-3333-4333-8333-333333333333",
        jobId: "55555555-5555-4555-8555-555555555555",
        leaseToken: "66666666-6666-4666-8666-666666666666",
        inputObjectId: "input",
        expectedInputSha256: "a".repeat(64),
        signaturePositionVersion: 1,
      }, new AbortController().signal),
    Error,
    "SIGNATURE_INPUT_MISMATCH",
  );
  await assertRejects(
    () =>
      make(2).apply({
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        approvalId: "33333333-3333-4333-8333-333333333333",
        jobId: "55555555-5555-4555-8555-555555555555",
        leaseToken: "66666666-6666-4666-8666-666666666666",
        inputObjectId: "input",
        expectedInputSha256: sourceSha256,
        signaturePositionVersion: 1,
      }, new AbortController().signal),
    Error,
    "SIGNATURE_POSITION_INVALID",
  );
  await assertRejects(
    () =>
      make(1, 600).apply({
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        approvalId: "33333333-3333-4333-8333-333333333333",
        jobId: "55555555-5555-4555-8555-555555555555",
        leaseToken: "66666666-6666-4666-8666-666666666666",
        inputObjectId: "input",
        expectedInputSha256: sourceSha256,
        signaturePositionVersion: 1,
      }, new AbortController().signal),
    Error,
    "SIGNATURE_POSITION_INVALID",
  );
});

Deno.test("private XLSX applier embeds the approved signature in the configured worksheet range", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Registration").getCell("A1").value = "Supplier setup";
  const source = new Uint8Array(await workbook.xlsx.writeBuffer());
  const signature = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (value) => value.charCodeAt(0),
  );
  const writes: Array<{ bytes: Uint8Array; contentType: string }> = [];
  const applier = createPdfSignatureApplier({
    objects: {
      read: async () => source,
      writeExclusive: async (input) => {
        writes.push({ bytes: input.bytes, contentType: input.contentType });
      },
    },
    policies: {
      resolve: async () => ({
        signatureBytes: signature,
        contentType: "image/png" as const,
        targetKind: "xlsx" as const,
        worksheetName: "Registration",
        cellRange: "B4:D7",
      }),
    },
    uuid: () => "44444444-4444-4444-8444-444444444444",
  });
  const receipt = await applier.apply({
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    approvalId: "33333333-3333-4333-8333-333333333333",
    jobId: "55555555-5555-4555-8555-555555555555",
    leaseToken: "66666666-6666-4666-8666-666666666666",
    inputObjectId: "private-input-object",
    expectedInputSha256: await sha256Hex(source),
    signaturePositionVersion: 1,
  }, new AbortController().signal);
  assertEquals(
    writes[0].contentType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assertEquals(receipt.outputSha256, await sha256Hex(writes[0].bytes));
  const signed = new ExcelJS.Workbook();
  await signed.xlsx.load(writes[0].bytes.slice() as never);
  assertEquals(signed.getWorksheet("Registration")?.getImages().length, 1);
});

Deno.test("private XLSX applier rejects coordinates outside Excel bounds", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Registration");
  const source = new Uint8Array(await workbook.xlsx.writeBuffer());
  const sourceSha256 = await sha256Hex(source);
  const applier = createPdfSignatureApplier({
    objects: {
      read: async () => source,
      writeExclusive: async () => undefined,
    },
    policies: {
      resolve: async () => ({
        signatureBytes: new Uint8Array([1]),
        contentType: "image/png" as const,
        targetKind: "xlsx" as const,
        worksheetName: "Registration",
        cellRange: "XFE1:XFE2",
      }),
    },
  });
  await assertRejects(
    () =>
      applier.apply({
        organizationId: "11111111-1111-4111-8111-111111111111",
        caseId: "22222222-2222-4222-8222-222222222222",
        approvalId: "33333333-3333-4333-8333-333333333333",
        jobId: "55555555-5555-4555-8555-555555555555",
        leaseToken: "66666666-6666-4666-8666-666666666666",
        inputObjectId: "private-input-object",
        expectedInputSha256: sourceSha256,
        signaturePositionVersion: 1,
      }, new AbortController().signal),
    Error,
    "SIGNATURE_POSITION_INVALID",
  );
});
