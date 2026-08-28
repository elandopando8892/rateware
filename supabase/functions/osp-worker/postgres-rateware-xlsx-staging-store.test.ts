import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createPostgresRatewareXlsxStagingStore } from "./postgres-rateware-xlsx-staging-store.ts";

Deno.test("generic Rateware XLSX store binds the active lease through the worker function", async () => {
  const calls: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(strings.join("?") + JSON.stringify(values));
      if (/stage_rateware_xlsx_quote_from_lease/.test(strings.join("?"))) {
        return [{
          raw_upload_id: "55555555-5555-4555-8555-555555555555",
          interpretation_job_id: "66666666-6666-4666-8666-666666666666",
          rate_staging_id: "77777777-7777-4777-8777-777777777777",
          inserted: true,
        }];
      }
      return [];
    },
    {
      begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) =>
        await operation(sql),
    },
  );
  const store = createPostgresRatewareXlsxStagingStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  const receipt = await store.stage({
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    jobId: "33333333-3333-4333-8333-333333333333",
    leaseToken: "88888888-8888-4888-8888-888888888888",
    documentVersionId: "44444444-4444-4444-8444-444444444444",
    sourceSha256: "a".repeat(64),
    quote: {
      parserVersion: "osp-rateware-xlsx-adjacent-label-v1",
      vendor: "Carrier",
      rfx: "RFx-1",
      origin: "Monterrey, MX",
      destination: "Dallas, TX",
      equipment: "53FT Dry Van",
      operation: "Export",
      service: "FTL",
      linehaul: 1850,
      borderFee: 125,
      fsc: 0.18,
      fscMode: "fraction_of_linehaul",
      allInRate: 2308,
      weeklyCapacity: 8,
      evidence: {
        vendor: ["xlsx:1:A1", "xlsx:1:A2"],
        rfx: ["xlsx:1:B1", "xlsx:1:B2"],
        origin: ["xlsx:1:C1", "xlsx:1:C2"],
        destination: ["xlsx:1:D1", "xlsx:1:D2"],
        equipment: ["xlsx:1:E1", "xlsx:1:E2"],
        operation: ["xlsx:1:F1", "xlsx:1:F2"],
        service: ["xlsx:1:G1", "xlsx:1:G2"],
        linehaul: ["xlsx:1:H1", "xlsx:1:H2"],
        borderFee: ["xlsx:1:I1", "xlsx:1:I2"],
        fsc: ["xlsx:1:J1", "xlsx:1:J2"],
        allInRate: ["xlsx:1:K1", "xlsx:1:K2"],
        weeklyCapacity: ["xlsx:1:L1", "xlsx:1:L2"],
      },
    },
  });
  assertEquals(receipt.inserted, true);
  assertEquals(
    calls.some((call) => /set local role osp_worker/.test(call)),
    true,
  );
  assertEquals(
    calls.some((call) => /stage_rateware_xlsx_quote_from_lease/.test(call)),
    true,
  );
});
