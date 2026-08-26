import type {
  SignatureApplyReceipt,
  SignatureApplyRequest,
  SignaturePort,
} from "../_shared/osp/signature-port.ts";

export type SignatureJobPreparation =
  | { kind: "ready"; request: SignatureApplyRequest }
  | { kind: "applied"; receipt: SignatureApplyReceipt }
  | { kind: "failed" }
  | { kind: "unknown_write" };

export type SignatureJobInput = {
  organizationId: string;
  approvalId: string;
  jobId: string;
  leaseToken: string;
};

export interface SignatureJobRecordStore {
  prepare(
    input: SignatureJobInput,
  ): Promise<SignatureJobPreparation>;
  recordApplied(
    input: {
      organizationId: string;
      approvalId: string;
      jobId: string;
      leaseToken: string;
      receipt: SignatureApplyReceipt;
    },
  ): Promise<void>;
  recordFailed(
    input: SignatureJobInput & { errorCode: string },
  ): Promise<void>;
  holdForManualReconciliation(
    input: SignatureJobInput,
  ): Promise<void>;
}

export async function applySignatureJob(
  input: SignatureJobInput,
  deps: {
    records: SignatureJobRecordStore;
    signatures: SignaturePort;
    signal?: AbortSignal;
  },
): Promise<SignatureApplyReceipt> {
  const prepared = await deps.records.prepare(input);
  if (prepared.kind === "applied") return prepared.receipt;
  if (prepared.kind === "failed") {
    throw new Error("SIGNATURE_APPLICATION_FAILED");
  }
  if (prepared.kind === "unknown_write") {
    await deps.records.holdForManualReconciliation(input);
    throw new Error("SIGNATURE_MANUAL_RECONCILIATION_REQUIRED");
  }
  let receipt: SignatureApplyReceipt;
  try {
    receipt = await deps.signatures.apply(
      prepared.request,
      deps.signal ?? new AbortController().signal,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SIGNATURE_WRITE_OUTCOME_UNKNOWN"
    ) {
      await deps.records.holdForManualReconciliation(input);
      throw new Error("SIGNATURE_MANUAL_RECONCILIATION_REQUIRED");
    }
    const errorCode = error instanceof Error &&
        /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message)
      ? error.message
      : "SIGNATURE_APPLICATION_FAILED";
    await deps.records.recordFailed({ ...input, errorCode });
    throw error;
  }
  try {
    await deps.records.recordApplied({ ...input, receipt });
    return receipt;
  } catch {
    try {
      const authoritative = await deps.records.prepare(input);
      if (authoritative.kind === "applied") return authoritative.receipt;
    } catch {
      // The write is already known to have completed; continue to the safe hold.
    }
    try {
      await deps.records.holdForManualReconciliation(input);
    } catch {
      // A committed receipt or expired lease is reconciled by Operations.
    }
    throw new Error("SIGNATURE_MANUAL_RECONCILIATION_REQUIRED");
  }
}
