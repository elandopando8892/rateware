import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import JSZip from "npm:jszip@3.10.1";

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

Deno.test("XLSX completer permits one reviewed decision to govern multiple unique cells", async () => {
  const sourceBytes = await xlsxSource();
  const completed = await completeXlsxArtifact({
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    mappings: [
      {
        mappingDecisionId,
        canonicalFieldId: "supplier.legalName",
        sheet: "Registration",
        cell: "A2",
        value: "XBF SISTEMAS LOGISTICOS S DE RL DE CV",
      },
      {
        mappingDecisionId,
        canonicalFieldId: "fiscal.taxIdentifier",
        sheet: "Registration",
        cell: "A3",
        value: "XSL260511N11",
      },
    ],
  });
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(completed.bytes as never);
  assertEquals(
    output.getWorksheet("Registration")?.getCell("A2").value,
    "XBF SISTEMAS LOGISTICOS S DE RL DE CV",
  );
  assertEquals(
    output.getWorksheet("Registration")?.getCell("A3").value,
    "XSL260511N11",
  );
  assertEquals(completed.receipt.mappings.length, 2);
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

Deno.test("XLSM completer patches OOXML without stripping VBA or printer settings and records form coverage", async () => {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="1-2" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    "xl/styles.xml",
    '<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="0" applyProtection="1"><protection locked="0"/></xf></cellXfs></styleSheet>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" s="1"/><c r="C1" s="1"/></row></sheetData></worksheet>',
  );
  const vba = new Uint8Array([1, 3, 3, 7, 9]);
  const printer = new Uint8Array([9, 7, 3, 1]);
  zip.file("xl/vbaProject.bin", vba);
  zip.file("xl/printerSettings/printerSettings1.bin", printer);
  const sourceBytes = await zip.generateAsync({ type: "uint8array" });
  const completed = await completeXlsxArtifact({
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256,
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    sourceContentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    mappings: [{
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      sheet: "1-2",
      cell: "B1",
      value: "XBF SISTEMAS LOGISTICOS",
    }],
  });
  const output = await JSZip.loadAsync(completed.bytes);
  assertEquals(
    await output.file("xl/vbaProject.bin")?.async("uint8array"),
    vba,
  );
  assertEquals(
    await output.file("xl/printerSettings/printerSettings1.bin")?.async(
      "uint8array",
    ),
    printer,
  );
  assertEquals(
    completed.receipt.contentType,
    "application/vnd.ms-excel.sheet.macroEnabled.12",
  );
  assertEquals(completed.receipt.formCoverage, {
    visiblePageCount: 1,
    writableFieldCount: 2,
    completedWritableFieldCount: 1,
    completionPercent: 50,
    blankWritableTargets: ["1-2!C1"],
    macroPreserved: true,
    printerSettingsPreserved: true,
  });
  const sheet = await output.file("xl/worksheets/sheet1.xml")?.async("text");
  assertEquals(sheet?.includes("XBF SISTEMAS LOGISTICOS"), true);
});
