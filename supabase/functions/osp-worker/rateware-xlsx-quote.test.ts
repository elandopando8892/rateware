import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { parseXlsxStructure } from "./xlsx-structure.ts";
import {
  classifyRatewareXlsxQuote,
  parseRatewareXlsxQuote,
} from "./rateware-xlsx-quote.ts";

const sourceVersionId = "44444444-4444-4444-8444-444444444444";

async function workbook(values: readonly unknown[]): Promise<Uint8Array> {
  const created = new ExcelJS.Workbook();
  const sheet = created.addWorksheet("Carrier Quote");
  sheet.addRow([
    "Vendor",
    "RFx",
    "Origin",
    "Destination",
    "Equipment",
    "Operation",
    "Service",
    "Linehaul",
    "Border Fee",
    "FSC",
    "All-in Rate",
    "Weekly Capacity",
  ]);
  sheet.addRow(values as never[]);
  return new Uint8Array(await created.xlsx.writeBuffer());
}

Deno.test("deterministic Rateware XLSX parser extracts the exact quote with evidence", async () => {
  const structure = await parseXlsxStructure({
    sourceVersionId,
    bytes: await workbook([
      "OSP CANARY CARRIER",
      "OSP-CANARY-5131E83",
      "Monterrey, MX",
      "Dallas, TX",
      "53FT Dry Van",
      "Export",
      "FTL",
      1850,
      125,
      0.18,
      2308,
      8,
    ]),
  });
  const quote = parseRatewareXlsxQuote(structure);
  assertEquals(quote.vendor, "OSP CANARY CARRIER");
  assertEquals(quote.rfx, "OSP-CANARY-5131E83");
  assertEquals(quote.linehaul, 1850);
  assertEquals(quote.fsc, 0.18);
  assertEquals(quote.fscMode, "fraction_of_linehaul");
  assertEquals(quote.allInRate, 2308);
  assertEquals(quote.weeklyCapacity, 8);
  assertEquals(quote.evidence.vendor, ["xlsx:1:A1", "xlsx:1:A2"]);
  assertEquals(quote.evidence.weeklyCapacity, ["xlsx:1:L1", "xlsx:1:L2"]);
});

Deno.test("deterministic Rateware XLSX parser rejects prohibited and inconsistent rates", async () => {
  const base = [
    "Carrier",
    "RFx-1",
    "Monterrey, MX",
    "Dallas, TX",
    "53FT Dry Van",
    "Export",
    "FTL",
    1850,
    125,
    0.18,
    2308,
    8,
  ];
  const tier = [...base];
  tier[7] = "Tier 1";
  async function parse(values: unknown[]) {
    return parseRatewareXlsxQuote(
      await parseXlsxStructure({
        sourceVersionId,
        bytes: await workbook(values),
      }),
    );
  }
  const awaitedStructure = await parseXlsxStructure({
    sourceVersionId,
    bytes: await workbook(tier),
  });
  assertThrows(
    () => parseRatewareXlsxQuote(awaitedStructure),
    Error,
    "RATEWARE_XLSX_RATE_NOT_USABLE",
  );
  const inconsistent = [...base];
  inconsistent[10] = 9999;
  try {
    await parse(inconsistent);
    throw new Error("EXPECTED_REJECTION");
  } catch (error) {
    assertEquals((error as Error).message, "RATEWARE_XLSX_TOTAL_INCONSISTENT");
  }
});

Deno.test("Rateware XLSX classifier distinguishes onboarding forms from partial quotes", async () => {
  const onboarding = new ExcelJS.Workbook();
  const onboardingSheet = onboarding.addWorksheet("Registration");
  onboardingSheet.addRow(["Legal name", "Synthetic Carrier"]);
  const onboardingStructure = await parseXlsxStructure({
    sourceVersionId,
    bytes: new Uint8Array(await onboarding.xlsx.writeBuffer()),
  });
  assertEquals(classifyRatewareXlsxQuote(onboardingStructure), null);

  const partial = new ExcelJS.Workbook();
  const partialSheet = partial.addWorksheet("Quote");
  partialSheet.addRow(["Vendor", "Linehaul"]);
  partialSheet.addRow(["Carrier", 1850]);
  const partialStructure = await parseXlsxStructure({
    sourceVersionId,
    bytes: new Uint8Array(await partial.xlsx.writeBuffer()),
  });
  assertThrows(
    () => classifyRatewareXlsxQuote(partialStructure),
    Error,
    "RATEWARE_XLSX_PARTIAL_QUOTE",
  );
});
