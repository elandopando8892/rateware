import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import JSZip from "npm:jszip@3.10.1";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  assertStrictXlsxPackage,
  createMacroSafeSpreadsheetAnalysis,
  createMacroSafeXlsmPackageScanner,
  createStrictXlsxPackageScanner,
} from "./strict-xlsx-package-scanner.ts";
import { parseXlsxStructure, XLSM_CONTENT_TYPE } from "./xlsx-structure.ts";

async function xlsx(
  kind: "plain" | "hyperlink" | "formula" = "plain",
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registration");
  sheet.getCell("A1").value = "Legal name";
  sheet.getCell("B1").value = kind === "hyperlink"
    ? { text: "External", hyperlink: "https://example.test" }
    : kind === "formula"
    ? { formula: "1+1", result: 2 }
    : "Synthetic Carrier";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function xlsm(extraUnsafePart = false): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Formato 3.3");
  sheet.getCell("A1").value = "Legal name";
  sheet.getCell("B1").value = { formula: "1+1", result: 2 };
  const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
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
  const relationships = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  zip.file(
    "xl/_rels/workbook.xml.rels",
    relationships.replace(
      "</Relationships>",
      '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>',
    ),
  );
  zip.file("xl/vbaProject.bin", new Uint8Array([1, 2, 3, 4]));
  if (extraUnsafePart) zip.file("xl/embeddings/object.bin", new Uint8Array([9]));
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("strict XLSX package policy accepts a bounded inert workbook with the pinned hash", async () => {
  const bytes = await xlsx();
  await assertStrictXlsxPackage(bytes);
  const scanner = createStrictXlsxPackageScanner(await sha256Hex(bytes));
  assertEquals(await scanner(bytes), "clean");
  assertEquals(await createStrictXlsxPackageScanner()(bytes), "clean");
  assertEquals(
    await createStrictXlsxPackageScanner("0".repeat(64))(bytes),
    "unknown",
  );
});

Deno.test("strict XLSX package policy rejects external relationships and corrupt packages", async () => {
  await assertRejects(
    async () => assertStrictXlsxPackage(await xlsx("hyperlink")),
    Error,
    "XLSX_PACKAGE_POLICY_REJECTED",
  );
  await assertRejects(
    () => assertStrictXlsxPackage(new Uint8Array([1, 2, 3])),
    Error,
    "XLSX_PACKAGE_POLICY_REJECTED",
  );
  await assertRejects(
    async () => assertStrictXlsxPackage(await xlsx("formula")),
    Error,
    "XLSX_PACKAGE_POLICY_REJECTED",
  );
});

Deno.test("macro-safe XLSM analysis preserves the source boundary while stripping executable content", async () => {
  const bytes = await xlsm();
  const sanitized = await createMacroSafeSpreadsheetAnalysis(bytes);
  assertEquals(sanitized.macroSha256.length, 64);
  assertEquals(sanitized.analysisSha256.length, 64);
  assert(sanitized.analysisSha256 !== await sha256Hex(bytes));
  const analysisZip = await JSZip.loadAsync(sanitized.analysisBytes);
  assertEquals(analysisZip.file("xl/vbaProject.bin"), null);
  assertEquals((await analysisZip.file("[Content_Types].xml")!.async("string")).includes("macroEnabled"), false);
  assertEquals((await analysisZip.file("xl/worksheets/sheet1.xml")!.async("string")).includes("<f>"), false);
  await assertStrictXlsxPackage(sanitized.analysisBytes);

  const structure = await parseXlsxStructure({
    sourceVersionId: "11111111-1111-4111-8111-111111111111",
    bytes,
    contentType: XLSM_CONTENT_TYPE,
  });
  assertEquals(structure.protection.macroEnabled, true);
  assertEquals(structure.protection.macroExecution, "blocked");
  assertEquals(structure.protection.analysisMode, "sanitized_copy");
  assertEquals(structure.sheets[0].cells.some((cell) => cell.address === "A1"), true);
  assertEquals(await createMacroSafeXlsmPackageScanner()(bytes), "clean");
  assertEquals(await createMacroSafeXlsmPackageScanner("0".repeat(64))(bytes), "unknown");
});

Deno.test("macro-safe XLSM policy rejects embedded executable parts", async () => {
  await assertRejects(
    async () => createMacroSafeSpreadsheetAnalysis(await xlsm(true)),
    Error,
    "XLSX_PACKAGE_POLICY_REJECTED",
  );
});
