import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import { resolveReviewedSpreadsheetTargets } from "./reviewed-spreadsheet-targets.ts";
import { completeXlsxArtifact } from "../_shared/osp/xlsx-form-completer.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

const decision = "33333333-3333-4333-8333-333333333333";
const references = ["Alpha", "Beta", "Gamma"].map((company, index) => ({
  company,
  contact: `Demo ${index}`,
  phone: "+52 81 0000 0000",
  email: `reference${index}@example.test`,
}));
const columns = ["company", "contact", "phone", "email"];
const definition = {
  label: "References",
  required: true,
  canonicalFieldId: null,
  supplierAliases: [],
  definition: {
    kind: "repeating_table",
    minRows: 3,
    maxRows: 4,
    uniqueBy: "company",
    columns: columns.map((id) => ({
      id,
      label: id,
      required: true,
      valueType: id === "phone" || id === "email" ? id : "text",
    })),
  },
};
function targets() {
  return references.flatMap((_row, rowIndex) =>
    columns.map((columnId, col) => ({
      mappingDecisionId: decision,
      fieldKey: "references",
      definition,
      value: references,
      reviewedTarget: {
        fieldKey: "references",
        rowIndex,
        columnId,
        sheet: rowIndex === 2 ? "2-2" : "1-2",
        cell: `${String.fromCharCode(66 + col)}${rowIndex + 10}`,
      },
    }))
  );
}

Deno.test("reviewed table cells resolve completely and keep negative/zero scalar values", () => {
  const result = resolveReviewedSpreadsheetTargets(targets(), ["references"]);
  assertEquals(result.length, 12);
  assertEquals(result[11], {
    mappingDecisionId: decision,
    canonicalFieldId: "references.row3.email",
    sheet: "2-2",
    cell: "E12",
    value: "reference2@example.test",
  });
  for (const value of [false, 0]) {
    const scalar = {
      mappingDecisionId: decision,
      fieldKey: "answer",
      definition: {
        label: "Answer",
        required: true,
        canonicalFieldId: "security.answer",
        supplierAliases: [],
        definition: typeof value === "boolean"
          ? { kind: "yes_no" }
          : { kind: "number", minimum: null, maximum: null },
      },
      value,
      reviewedTarget: {
        canonicalFieldId: "security.answer",
        sheet: "1-2",
        cell: "B2",
      },
    };
    assertEquals(resolveReviewedSpreadsheetTargets([scalar])[0].value, value);
  }
});

Deno.test("incomplete references or incomplete destination coverage fail rather than dropping cells", () => {
  assertThrows(
    () =>
      resolveReviewedSpreadsheetTargets(targets().slice(0, -1), ["references"]),
    Error,
    "ARTIFACT_TABLE_TARGETS_INCOMPLETE",
  );
  assertThrows(
    () =>
      resolveReviewedSpreadsheetTargets(targets(), ["another_required_table"]),
    Error,
    "ARTIFACT_TABLE_TARGETS_INCOMPLETE",
  );
  assertThrows(
    () =>
      resolveReviewedSpreadsheetTargets(
        targets().map((row) => ({
          ...row,
          value: references.map(({ company }) => ({ company })),
        })),
      ),
    Error,
    "ARTIFACT_TABLE_INCOMPLETE",
  );
});

Deno.test("unknown fields, invalid selectors, missing cells and duplicate destinations fail closed", () => {
  for (
    const changed of [
      { definition: null },
      { reviewedTarget: { ...targets()[0].reviewedTarget, rowIndex: -1 } },
      { reviewedTarget: { ...targets()[0].reviewedTarget, rowIndex: 20 } },
      {
        reviewedTarget: { ...targets()[0].reviewedTarget, columnId: "unknown" },
      },
      { reviewedTarget: { ...targets()[0].reviewedTarget, fieldKey: "wrong" } },
      { reviewedTarget: { ...targets()[0].reviewedTarget, cell: "B2:C2" } },
      {
        reviewedTarget: { ...targets()[0].reviewedTarget, unexpected: "value" },
      },
    ]
  ) {
    assertThrows(
      () =>
        resolveReviewedSpreadsheetTargets([
          { ...targets()[0], ...changed },
          ...targets().slice(1),
        ]),
      Error,
      "ARTIFACT_MAPPING_INVALID",
    );
  }
  assertThrows(
    () => resolveReviewedSpreadsheetTargets([...targets(), targets()[0]]),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
});

Deno.test("all twelve reviewed reference values reach both original worksheets and preserve unrelated content", async () => {
  const book = new ExcelJS.Workbook();
  for (const name of ["1-2", "2-2"]) {
    const sheet = book.addWorksheet(name);
    sheet.getCell("A1").value = "Original carrier instructions";
    sheet.getCell("A3").value = { formula: "1+1", result: 2 };
    sheet.mergeCells("G1:H1");
    sheet.getCell("G1").value = "Carrier internal use";
    sheet.pageSetup.printArea = "A1:H20";
    sheet.getCell("B10").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
  }
  book.addWorksheet("Catalog", { state: "hidden" }).getCell("A1").value =
    "Do not change";
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  const originalHash = await sha256Hex(bytes);
  const mappings = resolveReviewedSpreadsheetTargets(targets(), ["references"]);
  const output = await completeXlsxArtifact({
    sourceVersionId: "11111111-1111-4111-8111-111111111111",
    sourceBytes: bytes,
    sourceSha256: originalHash,
    packageSnapshotId: "22222222-2222-4222-8222-222222222222",
    packageSnapshotSha256: "a".repeat(64),
    approvedMappingDecisionIds: [decision],
    version: 1,
    mappings,
  });
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(output.bytes as never);
  for (const mapping of mappings) {
    assertEquals(
      reopened.getWorksheet(mapping.sheet)!.getCell(mapping.cell).value,
      mapping.value,
    );
  }
  for (const name of ["1-2", "2-2"]) {
    const sheet = reopened.getWorksheet(name)!;
    assertEquals(sheet.getCell("A1").value, "Original carrier instructions");
    assertEquals(sheet.getCell("A3").value, { formula: "1+1", result: 2 });
    assertEquals(sheet.getCell("H1").master.address, "G1");
    assertEquals(sheet.pageSetup.printArea, "A1:H20");
    assertEquals(sheet.getCell("B10").fill, {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    });
  }
  assertEquals(reopened.getWorksheet("Catalog")!.state, "hidden");
  assertEquals(
    reopened.getWorksheet("Catalog")!.getCell("A1").value,
    "Do not change",
  );
  assertEquals(await sha256Hex(bytes), originalHash);
  assertEquals(output.receipt.mappings.length, 12);
  if (Deno.args.includes("--export-synthetic")) {
    await Deno.mkdir("tmp/osp-s13-original-targets", { recursive: true });
    await Deno.writeFile(
      "tmp/osp-s13-original-targets/DEMO-original.xlsx",
      bytes,
    );
    await Deno.writeFile(
      "tmp/osp-s13-original-targets/DEMO-references-completed.xlsx",
      output.bytes,
    );
    await Deno.writeTextFile(
      "tmp/osp-s13-original-targets/DEMO-receipt.json",
      JSON.stringify(output.receipt, null, 2),
    );
  }
});
