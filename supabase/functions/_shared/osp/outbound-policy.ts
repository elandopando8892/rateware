import type { OutboundDraft } from "./outbound-payload.ts";

export type OutboundCaseContext = {
  organizationId: string;
  caseId: string;
  state: string;
  caseVersion: number;
  sourceSnapshotSha256: string;
  signedPackageSha256: string | null;
};

function stale(): never {
  throw new Error("OUTBOUND_CONTEXT_STALE");
}

export function requireCurrentOutboundPolicy(
  draft: OutboundDraft,
  current: OutboundCaseContext,
  allowAuthorizedEdit = false,
): OutboundCaseContext {
  const expectedState = draft.kind === "clarification"
    ? "awaiting_clarification"
    : "sales_authorization";
  if (
    !current || current.organizationId !== draft.organizationId ||
    current.caseId !== draft.caseId ||
    (current.state !== expectedState &&
      !(allowAuthorizedEdit && current.state === "ready_to_send")) ||
    current.caseVersion !== draft.caseVersion ||
    current.sourceSnapshotSha256 !== draft.sourceSnapshotSha256 ||
    current.signedPackageSha256 !== draft.signedPackageSha256 ||
    (draft.kind === "final_response" && draft.signedPackageSha256 === null) ||
    (draft.kind === "clarification" && draft.signedPackageSha256 !== null)
  ) stale();
  return current;
}
