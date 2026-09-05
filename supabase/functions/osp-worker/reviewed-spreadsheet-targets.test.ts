import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import JSZip from "npm:jszip@3.10.1";
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

function joinedTargets(separator = " — ") {
  return references.flatMap((_entry, rowIndex) => {
    const column = rowIndex === 1 ? "G" : "C";
    const firstRow = rowIndex === 2 ? 47 : 43;
    const common = {
      mappingDecisionId: decision,
      fieldKey: "references",
      definition,
      value: references,
    };
    const target = { fieldKey: "references", rowIndex, sheet: "1-2" };
    return [
      {
        ...common,
        reviewedTarget: {
          ...target,
          columnIds: ["company", "contact"],
          separator,
          cell: `${column}${firstRow}`,
        },
      },
      ...["phone", "email"].map((columnId, index) => ({
        ...common,
        reviewedTarget: {
          ...target,
          columnId,
          cell: `${column}${firstRow + index + 1}`,
        },
      })),
    ];
  });
}

Deno.test("explicit joined targets retain company and contact, with complete source-column coverage", () => {
  for (const separator of [" — ", "\n"]) {
    const result = resolveReviewedSpreadsheetTargets(joinedTargets(separator), [
      "references",
    ]);
    assertEquals(result.length, 9);
    for (let row = 0; row < 3; row++) {
      assertEquals(
        result[row * 3].value,
        `${references[row].company}${separator}${references[row].contact}`,
      );
      assertEquals(
        result[row * 3].canonicalFieldId,
        `references.row${row + 1}.joined.company.contact`,
      );
    }
    assertEquals(result[3].cell, "G43");
    assertEquals(result[8].cell, "C49");
  }
  const reversed = joinedTargets().map((item) => ({
    ...item,
    reviewedTarget: "columnIds" in item.reviewedTarget
      ? { ...item.reviewedTarget, columnIds: ["contact", "company"] }
      : item.reviewedTarget,
  }));
  assertEquals(
    resolveReviewedSpreadsheetTargets(reversed)[0].value,
    "Demo 0 — Alpha",
  );
});

Deno.test("joined targets reject ambiguous selectors, absent components and lost source columns", () => {
  for (
    const changed of [
      { columnIds: [] },
      { columnIds: ["company"] },
      { columnIds: ["company", "company"] },
      { columnIds: ["company", "missing"] },
      { columnIds: ["company", "email"] },
      { columnIds: ["company", "phone"] },
      { columnIds: ["company", 7] },
      { columnId: "company" },
      { separator: "" },
      { separator: "=HYPERLINK()" },
      { separator: " / " },
      { separator: null },
    ]
  ) {
    const rows = joinedTargets();
    assertThrows(
      () =>
        resolveReviewedSpreadsheetTargets([
          {
            ...rows[0],
            reviewedTarget: { ...rows[0].reviewedTarget, ...changed },
          },
          ...rows.slice(1),
        ]),
      Error,
      "ARTIFACT_MAPPING_INVALID",
    );
  }
  for (const contact of [null, "", "  ", { arbitrary: "object" }]) {
    assertThrows(
      () =>
        resolveReviewedSpreadsheetTargets(
          joinedTargets().map((item) => ({
            ...item,
            // Even an optional selected component may not disappear from a reviewed projection.
            definition: {
              ...definition,
              definition: {
                ...definition.definition,
                columns: definition.definition.columns.map((column) => ({
                  ...column,
                  required: column.id !== "contact",
                })),
              },
            },
            value: references.map((entry) => ({ ...entry, contact })),
          })),
        ),
      Error,
      "ARTIFACT_TABLE_INCOMPLETE",
    );
  }
  assertThrows(
    () => resolveReviewedSpreadsheetTargets(joinedTargets().slice(0, -1)),
    Error,
    "ARTIFACT_TABLE_TARGETS_INCOMPLETE",
  );
  assertThrows(
    () =>
      resolveReviewedSpreadsheetTargets([
        ...joinedTargets(),
        joinedTargets()[0],
      ]),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
  const omittedContact = joinedTargets().map((item) => {
    if (!("columnIds" in item.reviewedTarget)) return item;
    const { columnIds: _columns, separator: _separator, ...target } =
      item.reviewedTarget;
    return { ...item, reviewedTarget: { ...target, columnId: "company" } };
  });
  assertThrows(
    () => resolveReviewedSpreadsheetTargets(omittedContact),
    Error,
    "ARTIFACT_TABLE_TARGETS_INCOMPLETE",
  );
});

Deno.test("joined reference values survive spreadsheet generation without changing merged regions or source", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("1-2");
  for (
    const area of [
      "C43:E43",
      "C44:E44",
      "C45:E45",
      "G43:H43",
      "G44:H44",
      "G45:H45",
      "C47:E47",
      "C48:E48",
      "C49:E49",
    ]
  ) {
    sheet.mergeCells(area);
  }
  sheet.getCell("C43").alignment = { wrapText: true };
  sheet.getRow(43).height = 36;
  sheet.pageSetup.printArea = "A1:K56";
  book.addWorksheet("2-2").getCell("B53").value = "Carrier internal use";
  const sourceBytes = new Uint8Array(await book.xlsx.writeBuffer());
  const sourceSha256 = await sha256Hex(sourceBytes);
  const mappings = resolveReviewedSpreadsheetTargets(joinedTargets("\n"), [
    "references",
  ]);
  const output = await completeXlsxArtifact({
    sourceVersionId: "11111111-1111-4111-8111-111111111111",
    sourceBytes,
    sourceSha256,
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
  assertEquals(
    reopened.getWorksheet("1-2")!.getCell("H43").master.address,
    "G43",
  );
  assertEquals(
    reopened.getWorksheet("1-2")!.getCell("C43").alignment.wrapText,
    true,
  );
  assertEquals(reopened.getWorksheet("1-2")!.getRow(43).height, 36);
  assertEquals(reopened.getWorksheet("1-2")!.pageSetup.printArea, "A1:K56");
  assertEquals(
    reopened.getWorksheet("2-2")!.getCell("B53").value,
    "Carrier internal use",
  );
  assertEquals(await sha256Hex(sourceBytes), sourceSha256);
  assertEquals(output.receipt.mappings.length, 9);
});

Deno.test("joined reference projections preserve all unrelated XLSM ZIP parts and merged anchors", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("1-2");
  const rows = joinedTargets().map((item) => ({
    ...item,
    value: references.map((entry) => ({
      ...entry,
      contact: "Demo & <contact>",
    })),
  }));
  const mappings = resolveReviewedSpreadsheetTargets(rows, ["references"]);
  for (const mapping of mappings) {
    const end = mapping.cell.startsWith("C") ? "E" : "H";
    sheet.mergeCells(`${mapping.cell}:${end}${mapping.cell.slice(1)}`);
    sheet.getCell(mapping.cell).protection = { locked: false };
  }
  sheet.getCell("B1").value = "Preserve original instructions";
  sheet.getCell("F40").value = { formula: "1+1", result: 2 };
  sheet.pageSetup.printArea = "A1:K56";
  book.addWorksheet("2-2").getCell("B53").value = "Carrier internal use";
  book.addWorksheet("BD", { state: "hidden" }).getCell("A1").value = "Catalog";
  const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
  // Non-executable sentinels exercise byte preservation, not actual VBA behavior.
  zip.file("xl/vbaProject.bin", new Uint8Array([1, 3, 3, 7]));
  zip.file(
    "xl/printerSettings/printerSettings1.bin",
    new Uint8Array([7, 3, 3, 1]),
  );
  const sourceBytes = await zip.generateAsync({ type: "uint8array" });
  const sourceSha256 = await sha256Hex(sourceBytes);
  const output = await completeXlsxArtifact({
    sourceVersionId: "11111111-1111-4111-8111-111111111111",
    sourceBytes,
    sourceSha256,
    sourceContentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    packageSnapshotId: "22222222-2222-4222-8222-222222222222",
    packageSnapshotSha256: "a".repeat(64),
    approvedMappingDecisionIds: [decision],
    version: 1,
    mappings,
  });
  const reopened = await JSZip.loadAsync(output.bytes);
  assertEquals(
    Object.keys(reopened.files).sort(),
    Object.keys(zip.files).sort(),
  );
  for (const [path, part] of Object.entries(zip.files)) {
    if (part.dir || path === "xl/worksheets/sheet1.xml") continue;
    assertEquals(
      await reopened.file(path)!.async("uint8array"),
      await part.async("uint8array"),
      path,
    );
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output.bytes as never);
  for (const mapping of mappings) {
    assertEquals(
      workbook.getWorksheet("1-2")!.getCell(mapping.cell).value,
      mapping.value,
    );
  }
  assertEquals(
    workbook.getWorksheet("1-2")!.getCell("H43").master.address,
    "G43",
  );
  assertEquals(workbook.getWorksheet("1-2")!.getCell("F40").value, {
    formula: "1+1",
    result: 2,
  });
  assertEquals(output.receipt.mappings.length, 9);
  assertEquals(output.receipt.formCoverage?.macroPreserved, true);
  assertEquals(output.receipt.formCoverage?.printerSettingsPreserved, true);
  assertEquals(await sha256Hex(sourceBytes), sourceSha256);
});

Deno.test("joined projections reject excessive combined text rather than truncate either source", () => {
  assertThrows(
    () =>
      resolveReviewedSpreadsheetTargets(
        joinedTargets().map((item) => ({
          ...item,
          value: references.map((entry) => ({
            ...entry,
            company: entry.company + "a".repeat(6000),
            contact: "b".repeat(6000),
          })),
        })),
      ),
    Error,
    "ARTIFACT_MAPPING_INVALID",
  );
});

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
