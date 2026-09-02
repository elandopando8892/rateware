import { requireApprovalAuthority } from "../_shared/osp/approval-policy.ts";
import type {
  ApprovalActor,
  ApprovalCommand,
  ApprovalResult,
  ApprovalStore,
} from "../_shared/osp/approval-types.ts";
import {
  assertRequestSemanticGate,
  type RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;

export interface SignatureVaultPolicySource {
  resolveActive(input: { organizationId: string; caseId: string }): Promise<{
    vaultRef: string;
    positionVersion: number;
  }>;
}

export type SignatureApprovalInput = {
  organizationId: string;
  caseId: string;
  inputSnapshotSha256: string;
  signaturePositionVersion: number;
  expectedCaseVersion: number;
  idempotencyKey: string;
  actor: ApprovalActor;
};

export async function approveAndApplySignature(
  input: SignatureApprovalInput,
  deps: {
    policy: SignatureVaultPolicySource;
    approvals: ApprovalStore;
    semanticGate?: RequestSemanticGate;
    now?: () => Date;
  },
): Promise<ApprovalResult> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !SHA.test(input.inputSnapshotSha256) ||
    !OPAQUE.test(input.idempotencyKey) ||
    !Number.isSafeInteger(input.signaturePositionVersion) ||
    input.signaturePositionVersion < 1 ||
    input.signaturePositionVersion > 2_147_483_647 ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    input.actor.organizationId !== input.organizationId
  ) throw new Error("SIGNATURE_APPROVAL_INVALID");
  requireApprovalAuthority(
    input.actor,
    "approve_signature",
    (deps.now ?? (() => new Date()))(),
  );
  const command: Extract<ApprovalCommand, { type: "approve_signature" }> = {
    type: "approve_signature",
    organizationId: input.organizationId,
    caseId: input.caseId,
    inputSnapshotSha256: input.inputSnapshotSha256,
    signatureVaultRef: "server-policy-pending",
    signaturePositionVersion: input.signaturePositionVersion,
    expectedCaseVersion: input.expectedCaseVersion,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
  };
  return await deps.approvals.transact(command, async () => {
    if (deps.semanticGate) {
      await assertRequestSemanticGate(deps.semanticGate, {
        organizationId: input.organizationId,
        caseId: input.caseId,
        stage: "signature_approval",
      });
    }
    const policy = await deps.policy.resolveActive({
      organizationId: input.organizationId,
      caseId: input.caseId,
    });
    if (
      !policy || !OPAQUE.test(policy.vaultRef) ||
      !Number.isSafeInteger(policy.positionVersion) ||
      policy.positionVersion < 1
    ) throw new Error("SIGNATURE_POLICY_INVALID");
    if (policy.positionVersion !== input.signaturePositionVersion) {
      throw new Error("SIGNATURE_POLICY_STALE");
    }
    command.signatureVaultRef = policy.vaultRef;
  });
}
