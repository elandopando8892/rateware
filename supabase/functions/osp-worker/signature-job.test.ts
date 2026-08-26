import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { applySignatureJob } from "./signature-job.ts";
import type { SignatureApplyReceipt } from "../_shared/osp/signature-port.ts";

const approval = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  approvalId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
  leaseToken: "55555555-5555-4555-8555-555555555555",
  inputObjectId: "private-input",
  expectedInputSha256: "a".repeat(64),
  signaturePositionVersion: 1,
};
const lease = {
  jobId: approval.jobId,
  leaseToken: approval.leaseToken,
};

Deno.test("signature job applies once and replays its immutable receipt", async () => {
  let applies = 0;
  let saved: SignatureApplyReceipt | undefined;
  const deps = {
    records: {
      prepare: async () =>
        saved
          ? { kind: "applied" as const, receipt: saved }
          : { kind: "ready" as const, request: approval },
      recordApplied: async (input: { receipt: SignatureApplyReceipt }) => {
        saved = input.receipt;
      },
      recordFailed: async () => undefined,
      holdForManualReconciliation: async () => undefined,
    },
    signatures: {
      apply: async () => {
        applies += 1;
        return {
          inputSha256: "a".repeat(64),
          outputSha256: "b".repeat(64),
          outputObjectId: "signed-output",
        };
      },
    },
  };
  const first = await applySignatureJob({
    organizationId: approval.organizationId,
    approvalId: approval.approvalId,
    ...lease,
  }, deps);
  const second = await applySignatureJob({
    organizationId: approval.organizationId,
    approvalId: approval.approvalId,
    ...lease,
  }, deps);
  assertEquals(first, second);
  assertEquals(applies, 1);
});

Deno.test("unknown storage outcome is held for manual reconciliation and never retried", async () => {
  let held = 0;
  await assertRejects(
    () =>
      applySignatureJob({
        organizationId: approval.organizationId,
        approvalId: approval.approvalId,
        ...lease,
      }, {
        records: {
          prepare: async () => ({ kind: "unknown_write" as const }),
          recordApplied: async () => {
            throw new Error("unexpected");
          },
          recordFailed: async () => {
            throw new Error("unexpected");
          },
          holdForManualReconciliation: async () => {
            held += 1;
          },
        },
        signatures: {
          apply: async () => {
            throw new Error("unexpected");
          },
        },
      }),
    Error,
    "SIGNATURE_MANUAL_RECONCILIATION_REQUIRED",
  );
  assertEquals(held, 1);
});

Deno.test("known pre-write failure is recorded as terminal without claiming an unknown write", async () => {
  let failed = 0;
  let held = 0;
  await assertRejects(
    () =>
      applySignatureJob({
        organizationId: approval.organizationId,
        approvalId: approval.approvalId,
        ...lease,
      }, {
        records: {
          prepare: async () => ({ kind: "ready" as const, request: approval }),
          recordApplied: async () => {
            throw new Error("unexpected");
          },
          recordFailed: async (input: { errorCode: string }) => {
            assertEquals(input.errorCode, "SIGNATURE_INPUT_HASH_MISMATCH");
            failed += 1;
          },
          holdForManualReconciliation: async () => {
            held += 1;
          },
        },
        signatures: {
          apply: async () => {
            throw new Error("SIGNATURE_INPUT_HASH_MISMATCH");
          },
        },
      }),
    Error,
    "SIGNATURE_INPUT_HASH_MISMATCH",
  );
  assertEquals(failed, 1);
  assertEquals(held, 0);
});

Deno.test("receipt commit uncertainty is reconciled or held and never recorded as a pre-write failure", async () => {
  const receipt = {
    inputSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    outputObjectId: "signed-output",
  };
  let preparations = 0;
  let held = 0;
  let failed = 0;
  const result = await applySignatureJob({
    organizationId: approval.organizationId,
    approvalId: approval.approvalId,
    ...lease,
  }, {
    records: {
      prepare: () => {
        preparations += 1;
        return Promise.resolve(
          preparations === 1
            ? { kind: "ready" as const, request: approval }
            : { kind: "applied" as const, receipt },
        );
      },
      recordApplied: () => Promise.reject(new Error("DATABASE_TEMPORARY")),
      recordFailed: () => {
        failed += 1;
        return Promise.resolve();
      },
      holdForManualReconciliation: () => {
        held += 1;
        return Promise.resolve();
      },
    },
    signatures: { apply: () => Promise.resolve(receipt) },
  });
  assertEquals(result, receipt);
  assertEquals(preparations, 2);
  assertEquals(held, 0);
  assertEquals(failed, 0);
});
