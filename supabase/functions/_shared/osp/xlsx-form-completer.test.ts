import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { sha256Hex } from "./source-hash.ts";
import { completeXlsxArtifact } from "./xlsx-form-completer.ts";

const sourceVersionId = "11111111-1111-4111-8111-111111111111";
const packageSnapshotId = "22222222-2222-4222-8222-222222222222";
const packageSnapshotSha256 = "b".repeat(64);
const mappingDecisionId = "33333333-3333-4333-8333-333333333333";

async function xlsxSource(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date("2026-08-24T00:00:00.000Z");
  workbook.modified = new Date("2026-08-24T00:00:00.000Z");
  const sheet = workbook.addWorksheet("Registration");
  sheet.getCell("A1").value = "Legal name";
  sheet.getCell("B1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };
  sheet.getCell("C1").value = { formula: "1+1", result: 2 };
  sheet.getCell("D1").value = {
    text: "Supplier portal",
    hyperlink: "https://supplier.example.test",
  };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

Deno.test("XLSX completer writes reviewed cells on a copy and preserves formatting without evaluating formulas", async () => {
  const sourceBytes = await xlsxSource();
  const original = sourceBytes.slice();
  const input = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    mappings: [{
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      sheet: "Registration",
      cell: "B1",
      value: "XBF Logistics",
    }],
  };
  const completed = await completeXlsxArtifact(input);
  const repeated = await completeXlsxArtifact(input);
  assertEquals(sourceBytes, original);
  assertEquals(repeated.receipt, completed.receipt);
  assertEquals(repeated.bytes, completed.bytes);
  assertEquals(
    completed.receipt.outputSha256,
    await sha256Hex(completed.bytes),
  );
  assertEquals(completed.receipt.mappings, [{
    kind: "xlsx_cell",
    mappingDecisionId,
    canonicalFieldId: "supplier.legalName",
    target: "Registration!B1",
  }]);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(completed.bytes as never);
  assertEquals(
    output.getWorksheet("Registration")?.getCell("B1").value,
    "XBF Logistics",
  );
  assertEquals(output.getWorksheet("Registration")?.getCell("B1").fill, {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  });
  assertEquals(output.getWorksheet("Registration")?.getCell("C1").value, {
    formula: "1+1",
    result: 2,
  });
  assertEquals(output.getWorksheet("Registration")?.getCell("D1").value, {
    text: "Supplier portal",
    hyperlink: "https://supplier.example.test",
  });
});

Deno.test("XLSX completer rejects source drift, formulas, hyperlinks, and duplicate reviewed targets", async () => {
  const sourceBytes = await xlsxSource();
  const base = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
  };
  await assertRejects(
    () =>
      completeXlsxArtifact({
        ...base,
        sourceSha256: "a".repeat(64),
        mappings: [],
      }),
    Error,
    "ARTIFACT_SOURCE_MISMATCH",
  );
  await assertRejects(
    () =>
      completeXlsxArtifact({
        ...base,
        mappings: [{
          mappingDecisionId,
          canonicalFieldId: "supplier.total",
          sheet: "Registration",
          cell: "C1",
          value: 2,
        }],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
  await assertRejects(
    () =>
      completeXlsxArtifact({
        ...base,
        mappings: [{
          mappingDecisionId,
          canonicalFieldId: "supplier.portal",
          sheet: "Registration",
          cell: "D1",
          value: "none",
        }],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
  await assertRejects(
    () =>
      completeXlsxArtifact({
        ...base,
        mappings: [
          {
            mappingDecisionId,
            canonicalFieldId: "supplier.legalName",
            sheet: "Registration",
            cell: "B1",
            value: "XBF",
          },
          {
            mappingDecisionId: "44444444-4444-4444-8444-444444444444",
            canonicalFieldId: "supplier.tradeName",
            sheet: "Registration",
            cell: "B1",
            value: "XBF",
          },
        ],
      }),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
});
