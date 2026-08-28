import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  assertStrictXlsxPackage,
  createStrictXlsxPackageScanner,
} from "./strict-xlsx-package-scanner.ts";

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
