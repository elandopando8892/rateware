import type {
  ApprovalActor,
  ApprovalResult,
  ApprovalStore,
} from "../_shared/osp/approval-types.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;

export type OperationsReviewInput = {
  organizationId: string;
  caseId: string;
  expectedCaseVersion: number;
  expectedSnapshotSha256: string;
  idempotencyKey: string;
  actor: ApprovalActor;
};

export interface CurrentPackageSnapshotSource {
  rebuildCurrent(input: {
    organizationId: string;
    caseId: string;
    expectedCaseVersion: number;
  }): Promise<{ canonicalSha256: string }>;
}

function invalid(): never {
  throw new Error("OPERATIONS_REVIEW_INVALID");
}

export async function completeOperationsReview(
  input: OperationsReviewInput,
  deps: { snapshots: CurrentPackageSnapshotSource; approvals: ApprovalStore },
): Promise<ApprovalResult> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    !SHA.test(input.expectedSnapshotSha256) ||
    !OPAQUE.test(input.idempotencyKey) ||
    input.actor.organizationId !== input.organizationId
  ) invalid();
  return await deps.approvals.transact({
    type: "complete_operations_review",
    organizationId: input.organizationId,
    caseId: input.caseId,
    inputSnapshotSha256: input.expectedSnapshotSha256,
    expectedCaseVersion: input.expectedCaseVersion,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
  }, async () => {
    const rebuilt = await deps.snapshots.rebuildCurrent({
      organizationId: input.organizationId,
      caseId: input.caseId,
      expectedCaseVersion: input.expectedCaseVersion,
    });
    if (!rebuilt || rebuilt.canonicalSha256 !== input.expectedSnapshotSha256) {
      throw new Error("SNAPSHOT_HASH_MISMATCH");
    }
  });
}
