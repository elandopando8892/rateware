import { assertEquals } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { createRatewareXlsxCanaryService } from "./rateware-xlsx-canary.ts";

const input = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  documentVersionId: "44444444-4444-4444-8444-444444444444",
  sourceSha256: "",
};

async function bytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Carrier Quote");
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
  sheet.addRow([
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
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as BufferSource);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.test("Rateware XLSX canary verifies source bytes and stages one deterministic quote", async () => {
  const sourceBytes = await bytes();
  const sourceSha256 = await sha256(sourceBytes);
  let staged: Record<string, unknown> | undefined;
  const service = createRatewareXlsxCanaryService({
    sources: {
      load: async () => ({
        organizationId: input.organizationId,
        caseId: input.caseId,
        documentVersionId: input.documentVersionId,
        bucketId: "osp-corporate-documents",
        objectKey: "opaque/source",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceSha256,
        sourceSafety: "safe",
        templateVersionId: null,
        existingExtractionId: null,
      }),
      persist: () => Promise.reject(new Error("PERSIST_NOT_EXPECTED")),
    },
    storage: { download: async () => sourceBytes },
    staging: {
      stage: async (request) => {
        staged = request;
        return {
          rawUploadId: "55555555-5555-4555-8555-555555555555",
          interpretationJobId: "66666666-6666-4666-8666-666666666666",
          rateStagingId: "77777777-7777-4777-8777-777777777777",
          inserted: true,
        };
      },
    },
  });
  const receipt = await service.stage({ ...input, sourceSha256 });
  assertEquals(receipt.inserted, true);
  assertEquals((staged?.quote as { allInRate: number }).allInRate, 2308);
  assertEquals(
    (staged?.quote as { evidence: { origin: string[] } }).evidence.origin,
    ["xlsx:1:C1", "xlsx:1:C2"],
  );
});
