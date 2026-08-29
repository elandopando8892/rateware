import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  generateSupplierPackageJob,
  type SupplierPackageJobPreparation,
} from "./supplier-package-job.ts";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  snapshotId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
  leaseToken: "55555555-5555-4555-8555-555555555555",
  sourceVersionId: "66666666-6666-4666-8666-666666666666",
  mappingDecisionId: "77777777-7777-4777-8777-777777777777",
  packageId: "88888888-8888-4888-8888-888888888888",
};

async function preparation(): Promise<
  Extract<SupplierPackageJobPreparation, { kind: "ready" }>
> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customer setup");
  sheet.getCell("A7").value = "Customer information";
  const sourceBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return {
    kind: "ready",
    packageId: ids.packageId,
    objectId:
      `${ids.organizationId}:${ids.caseId}:${ids.snapshotId}:supplier_completed:1`,
    input: {
      sourceVersionId: ids.sourceVersionId,
      sourceBytes,
      sourceSha256: await sha256Hex(sourceBytes),
      packageSnapshotId: ids.snapshotId,
      packageSnapshotSha256: "a".repeat(64),
      approvedMappingDecisionIds: [ids.mappingDecisionId],
      version: 1,
      mappings: [
        {
          mappingDecisionId: ids.mappingDecisionId,
          canonicalFieldId: "supplier.legalName",
          sheet: "Customer setup",
          cell: "A8",
          value: "XBF SISTEMAS LOGISTICOS S DE RL DE CV",
        },
        {
          mappingDecisionId: ids.mappingDecisionId,
          canonicalFieldId: "fiscal.taxIdentifier",
          sheet: "Customer setup",
          cell: "A9",
          value: "XSL260511N11",
        },
      ],
    },
  };
}

Deno.test("supplier package job writes one immutable reviewed XLSX and records its receipt", async () => {
  const ready = await preparation();
  let recorded = false;
  let written: Uint8Array | null = null;
  const receipt = await generateSupplierPackageJob(ids, {
    records: {
      prepare: async () => ready,
      recordGenerated: async () => {
        recorded = true;
      },
      recordFailed: async () => {
        throw new Error("unexpected failure");
      },
      holdForManualReconciliation: async () => {
        throw new Error("unexpected reconciliation");
      },
    },
    objects: {
      writeExclusive: async (input) => {
        written = input.bytes;
      },
    },
  });
  assertEquals(recorded, true);
  assertEquals(receipt.artifact.mappings.length, 2);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(written as never);
  assertEquals(
    output.getWorksheet("Customer setup")?.getCell("A8").value,
    "XBF SISTEMAS LOGISTICOS S DE RL DE CV",
  );
  assertEquals(
    output.getWorksheet("Customer setup")?.getCell("A9").value,
    "XSL260511N11",
  );
});

Deno.test("supplier package job holds an uncertain object write for manual reconciliation", async () => {
  const ready = await preparation();
  let held = 0;
  await assertRejects(
    () =>
      generateSupplierPackageJob(ids, {
        records: {
          prepare: async () => ready,
          recordGenerated: async () => {},
          recordFailed: async () => {},
          holdForManualReconciliation: async () => {
            held += 1;
          },
        },
        objects: {
          writeExclusive: () => {
            throw new Error("SUPPLIER_PACKAGE_WRITE_OUTCOME_UNKNOWN");
          },
        },
      }),
    Error,
    "SUPPLIER_PACKAGE_MANUAL_RECONCILIATION_REQUIRED",
  );
  assertEquals(held, 1);
});
