import { assertEquals } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { createInMemoryBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  createManagedExtractionService,
  type ManagedExtractionSource,
} from "./managed-extraction.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const documentVersionId = "33333333-3333-4333-8333-333333333333";
const templateVersionId = "44444444-4444-4444-8444-444444444444";
const bytes = new TextEncoder().encode("synthetic PDF bytes");

async function extractionSource(
  existingExtractionId: string | null = null,
): Promise<ManagedExtractionSource> {
  return {
    organizationId,
    caseId,
    documentVersionId,
    bucketId: "osp-corporate-documents",
    objectKey: `${organizationId}/${documentVersionId}`,
    contentType: "application/pdf",
    sourceSha256: await sha256Hex(bytes),
    sourceSafety: "safe",
    templateVersionId,
    existingExtractionId,
  };
}

Deno.test("managed extraction closes provider evidence, persists snapshot and queues form preparation", async () => {
  const jobs = createInMemoryBackgroundJobStore();
  const persisted: unknown[] = [];
  const source = await extractionSource();
  const service = createManagedExtractionService({
    store: {
      load: async () => source,
      persist: async (input) => {
        persisted.push(input);
        return input.snapshot.id;
      },
    },
    storage: { download: async () => bytes },
    layout: {
      analyze: async () => ({
        modelVersion: "prebuilt-layout@2024-11-30",
        classifications: [],
        evidence: [{
          id: "pdf:p1:l1",
          locator: {
            kind: "pdf_region",
            sourceVersionId: documentVersionId,
            page: 1,
            polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            rawEvidenceHash: await sha256Hex(
              new TextEncoder().encode("Carrier ACME"),
            ),
          },
          content: "Carrier ACME",
          contentSha256: await sha256Hex(
            new TextEncoder().encode("Carrier ACME"),
          ),
        }],
      }),
    },
    structured: {
      modelVersion: "gpt-synthetic",
      extract: async () => ({
        schemaVersion: 1,
        supplier: {
          legalName: {
            presence: "present",
            value: "Carrier ACME",
            confidence: 0.99,
            evidenceIds: ["pdf:p1:l1"],
          },
        },
        requestedDocuments: [],
        requirements: [{
          id: "r1",
          text: "Provide insurance certificate",
          evidenceIds: ["pdf:p1:l1"],
        }],
        contradictions: [],
        missingInformation: [],
        clarificationQuestions: [],
      }),
    },
    jobs,
  });
  await service.extract({
    organizationId,
    documentVersionId,
    correlationId: "job-extract",
    leaseToken: "lease-extract",
  });
  const snapshot = (persisted[0] as {
    snapshot: { fields: Array<{ fieldKey: string; validation: string }> };
  }).snapshot;
  assertEquals(snapshot.fields.map((field) => field.fieldKey), [
    "supplier.legalName",
    "requirements.1.text",
  ]);
  assertEquals(snapshot.fields.map((field) => field.validation), [
    "valid",
    "valid",
  ]);
  const [mapping] = await jobs.claim({
    workerId: "test",
    now: new Date(),
    leaseMs: 60_000,
    limit: 1,
  });
  assertEquals(mapping.kind, "form_ai_mapping");
  assertEquals(mapping.opaquePayload.caseId, caseId);
  assertEquals(mapping.opaquePayload.templateVersionId, templateVersionId);
});

Deno.test("managed extraction reuses a persisted extraction without provider or storage calls", async () => {
  const existingExtractionId = "55555555-5555-4555-8555-555555555555";
  const source = await extractionSource(existingExtractionId);
  let externalCalls = 0;
  const jobs = createInMemoryBackgroundJobStore();
  const service = createManagedExtractionService({
    store: {
      load: async () => source,
      persist: async () => {
        throw new Error("must not persist");
      },
    },
    storage: {
      download: async () => {
        externalCalls += 1;
        return bytes;
      },
    },
    layout: {
      analyze: async () => {
        externalCalls += 1;
        throw new Error("must not analyze");
      },
    },
    structured: {
      modelVersion: "gpt-synthetic",
      extract: async () => {
        externalCalls += 1;
        throw new Error("must not structure");
      },
    },
    jobs,
  });
  await service.extract({
    organizationId,
    documentVersionId,
    correlationId: "job-retry",
    leaseToken: "lease-retry",
  });
  assertEquals(externalCalls, 0);
  const [mapping] = await jobs.claim({
    workerId: "test",
    now: new Date(),
    leaseMs: 60_000,
    limit: 1,
  });
  assertEquals(mapping.opaquePayload.extractionId, existingExtractionId);
});

Deno.test("managed extraction processes XLSX without layout or AI providers", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registration");
  sheet.getCell("A1").value = "Legal name";
  sheet.getCell("B1").value = "Synthetic Carrier";
  const xlsxBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const persisted: Array<
    { snapshot: { fields: Array<{ provider: string; value: unknown }> } }
  > = [];
  const jobs = createInMemoryBackgroundJobStore();
  const service = createManagedExtractionService({
    store: {
      load: async () => ({
        organizationId,
        caseId,
        documentVersionId,
        bucketId: "osp-corporate-documents",
        objectKey: `${organizationId}/${documentVersionId}`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceSha256: await sha256Hex(xlsxBytes),
        sourceSafety: "safe",
        templateVersionId,
        existingExtractionId: null,
      }),
      persist: async (input) => {
        persisted.push(input as never);
        return input.snapshot.id;
      },
    },
    storage: { download: async () => xlsxBytes },
    jobs,
  });
  await service.extract({
    organizationId,
    documentVersionId,
    correlationId: "xlsx-no-provider",
    leaseToken: "lease-xlsx",
  });
  assertEquals(
    persisted[0].snapshot.fields.map((field) => ({
      provider: field.provider,
      value: field.value,
    })),
    [{ provider: "xlsx_structural", value: "Synthetic Carrier" }],
  );
  const [mapping] = await jobs.claim({
    workerId: "test",
    now: new Date(),
    leaseMs: 60_000,
    limit: 1,
  });
  assertEquals(mapping.kind, "form_ai_mapping");
});

Deno.test("managed extraction routes a complete carrier quote only to Rateware staging", async () => {
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
    "Synthetic Carrier",
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
  ]);
  const xlsxBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const staged: unknown[] = [];
  const jobs = createInMemoryBackgroundJobStore();
  const service = createManagedExtractionService({
    store: {
      load: async () => ({
        organizationId,
        caseId,
        documentVersionId,
        bucketId: "osp-corporate-documents",
        objectKey: `${organizationId}/${documentVersionId}`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceSha256: await sha256Hex(xlsxBytes),
        sourceSafety: "safe",
        templateVersionId,
        existingExtractionId: null,
      }),
      persist: async () => {
        throw new Error("must not persist OSP extraction for a quote");
      },
    },
    storage: { download: async () => xlsxBytes },
    ratewareXlsxStaging: {
      stage: async (input) => {
        staged.push(input);
        return {
          rawUploadId: crypto.randomUUID(),
          interpretationJobId: crypto.randomUUID(),
          rateStagingId: crypto.randomUUID(),
          inserted: true,
        };
      },
    },
    jobs,
  });
  await service.extract({
    organizationId,
    documentVersionId,
    correlationId: "job-rateware",
    leaseToken: "lease-rateware",
  });
  assertEquals(staged.length, 1);
  assertEquals(
    (staged[0] as { jobId: string; leaseToken: string; quote: { rfx: string } })
      .jobId,
    "job-rateware",
  );
  assertEquals(
    (staged[0] as { jobId: string; leaseToken: string; quote: { rfx: string } })
      .leaseToken,
    "lease-rateware",
  );
  assertEquals(
    (staged[0] as { jobId: string; leaseToken: string; quote: { rfx: string } })
      .quote.rfx,
    "RFx-1",
  );
  assertEquals(
    await jobs.claim({
      workerId: "test",
      now: new Date(),
      leaseMs: 60_000,
      limit: 1,
    }),
    [],
  );
});
