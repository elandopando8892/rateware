import type {
  SupplierArtifactContext,
  SupplierArtifactReceipt,
} from "../_shared/osp/supplier-artifact-port.ts";
import {
  completeXlsxArtifact,
  type XlsxArtifactMapping,
} from "../_shared/osp/xlsx-form-completer.ts";

type XlsxArtifactInput = SupplierArtifactContext & {
  mappings: readonly XlsxArtifactMapping[];
};

export type SupplierPackageJobInput = Readonly<{
  organizationId: string;
  caseId: string;
  snapshotId: string;
  jobId: string;
  leaseToken: string;
}>;

export type GeneratedSupplierPackageReceipt = Readonly<{
  packageId: string;
  objectId: string;
  artifact: SupplierArtifactReceipt;
}>;

export type SupplierPackageJobPreparation =
  | Readonly<{
    kind: "ready";
    packageId: string;
    objectId: string;
    input: XlsxArtifactInput;
  }>
  | Readonly<{ kind: "generated"; receipt: GeneratedSupplierPackageReceipt }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "unknown_write" }>;

export interface SupplierPackageRecordStore {
  prepare(
    input: SupplierPackageJobInput,
  ): Promise<SupplierPackageJobPreparation>;
  recordGenerated(
    input: SupplierPackageJobInput & {
      receipt: GeneratedSupplierPackageReceipt;
    },
  ): Promise<void>;
  recordFailed(
    input: SupplierPackageJobInput & { errorCode: string },
  ): Promise<void>;
  holdForManualReconciliation(input: SupplierPackageJobInput): Promise<void>;
}

export interface SupplierPackageObjectStore {
  writeExclusive(input: {
    organizationId: string;
    objectId: string;
    bytes: Uint8Array;
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }): Promise<void>;
}

function stableErrorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message)
    ? error.message
    : "SUPPLIER_PACKAGE_GENERATION_FAILED";
}

export async function generateSupplierPackageJob(
  input: SupplierPackageJobInput,
  deps: {
    records: SupplierPackageRecordStore;
    objects: SupplierPackageObjectStore;
  },
): Promise<GeneratedSupplierPackageReceipt> {
  const prepared = await deps.records.prepare(input);
  if (prepared.kind === "generated") return prepared.receipt;
  if (prepared.kind === "failed") {
    throw new Error("SUPPLIER_PACKAGE_GENERATION_FAILED");
  }
  if (prepared.kind === "unknown_write") {
    await deps.records.holdForManualReconciliation(input);
    throw new Error("SUPPLIER_PACKAGE_MANUAL_RECONCILIATION_REQUIRED");
  }

  try {
    const completed = await completeXlsxArtifact(prepared.input);
    await deps.objects.writeExclusive({
      organizationId: input.organizationId,
      objectId: prepared.objectId,
      bytes: completed.bytes,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const receipt: GeneratedSupplierPackageReceipt = Object.freeze({
      packageId: prepared.packageId,
      objectId: prepared.objectId,
      artifact: completed.receipt,
    });
    try {
      await deps.records.recordGenerated({ ...input, receipt });
      return receipt;
    } catch {
      try {
        const authoritative = await deps.records.prepare(input);
        if (authoritative.kind === "generated") return authoritative.receipt;
      } catch {
        // The immutable object exists; Operations must reconcile DB uncertainty.
      }
      try {
        await deps.records.holdForManualReconciliation(input);
      } catch {
        // A committed receipt or expired lease remains authoritative.
      }
      throw new Error("SUPPLIER_PACKAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SUPPLIER_PACKAGE_MANUAL_RECONCILIATION_REQUIRED"
    ) throw error;
    if (
      error instanceof Error &&
      error.message === "SUPPLIER_PACKAGE_WRITE_OUTCOME_UNKNOWN"
    ) {
      await deps.records.holdForManualReconciliation(input);
      throw new Error("SUPPLIER_PACKAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    await deps.records.recordFailed({
      ...input,
      errorCode: stableErrorCode(error),
    });
    throw error;
  }
}
