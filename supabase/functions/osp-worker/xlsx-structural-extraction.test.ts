import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { parseXlsxStructure } from "./xlsx-structure.ts";
import { createXlsxStructuralSnapshot } from "./xlsx-structural-extraction.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const documentVersionId = "33333333-3333-4333-8333-333333333333";

async function workbookBytes(configure: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date("2026-08-27T00:00:00.000Z");
  workbook.modified = new Date("2026-08-27T00:00:00.000Z");
  configure(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function snapshot(bytes: Uint8Array) {
  const structure = await parseXlsxStructure({
    sourceVersionId: documentVersionId,
    bytes,
  });
  return await createXlsxStructuralSnapshot({
    source: {
      organizationId,
      caseId,
      documentVersionId,
      sourceSha256: await sha256Hex(bytes),
    },
    structure,
  });
}

Deno.test("XLSX structural extraction maps exact adjacent XBF labels with closed cell evidence", async () => {
  const bytes = await workbookBytes((workbook) => {
    const sheet = workbook.addWorksheet("Registro");
    sheet.getCell("A1").value = "Razón social";
    sheet.getCell("B1").value = "Transportes Sintéticos, S.A. de C.V.";
    sheet.getCell("A2").value = "RFC";
    sheet.getCell("B2").value = "TSS010101AA1";
    sheet.getCell("A3").value = "Domicilio fiscal";
    sheet.getCell("B3").value = "Av. Prueba 123, Monterrey";
    sheet.getCell("A4").value = "CLABE";
    sheet.getCell("B4").value = "012345678901234567";
  });
  const created = await snapshot(bytes);
  assertEquals(created.status, "review_required");
  assertEquals(
    created.fields.map((field) => ({
      fieldKey: field.fieldKey,
      value: field.value,
      provider: field.provider,
      validation: field.validation,
      ranges: field.evidence.map((item) =>
        item.kind === "xlsx_cell" ? item.cellRange : ""
      ),
    })),
    [
      {
        fieldKey: "supplier.legalName",
        value: "Transportes Sintéticos, S.A. de C.V.",
        provider: "xlsx_structural",
        validation: "valid",
        ranges: ["A1", "B1"],
      },
      {
        fieldKey: "fiscal.taxIdentifier",
        value: "TSS010101AA1",
        provider: "xlsx_structural",
        validation: "valid",
        ranges: ["A2", "B2"],
      },
      {
        fieldKey: "supplier.address",
        value: "Av. Prueba 123, Monterrey",
        provider: "xlsx_structural",
        validation: "valid",
        ranges: ["A3", "B3"],
      },
      {
        fieldKey: "banking.accountNumber",
        value: "012345678901234567",
        provider: "xlsx_structural",
        validation: "valid",
        ranges: ["A4", "B4"],
      },
    ],
  );
});

Deno.test("XLSX structural extraction marks conflicting repeated labels for human review", async () => {
  const bytes = await workbookBytes((workbook) => {
    const sheet = workbook.addWorksheet("Registration");
    sheet.getCell("A1").value = "Legal name";
    sheet.getCell("B1").value = "Supplier One";
    sheet.getCell("A2").value = "Razón social";
    sheet.getCell("B2").value = "Supplier Two";
  });
  const created = await snapshot(bytes);
  assertEquals(
    created.fields.map((field) => ({
      fieldKey: field.fieldKey,
      presence: field.presence,
      value: field.value,
      confidence: field.confidence,
      validation: field.validation,
    })),
    [{
      fieldKey: "supplier.legalName",
      presence: "uncertain",
      value: null,
      confidence: 0,
      validation: "contradictory",
    }],
  );
});

Deno.test("XLSX structural extraction refuses unsupported spreadsheets instead of guessing", async () => {
  const bytes = await workbookBytes((workbook) => {
    const sheet = workbook.addWorksheet("Rates");
    sheet.getCell("A1").value = "Origin";
    sheet.getCell("B1").value = "Destination";
  });
  const structure = await parseXlsxStructure({
    sourceVersionId: documentVersionId,
    bytes,
  });
  await assertRejects(
    () =>
      createXlsxStructuralSnapshot({
        source: {
          organizationId,
          caseId,
          documentVersionId,
          sourceSha256: "a".repeat(64),
        },
        structure,
      }),
    Error,
    "XLSX_CANONICAL_FIELDS_NOT_FOUND",
  );
});
