import type { OutboundDraft } from "./outbound-payload.ts";
import type { ReplyContext } from "./reply-context.ts";

const GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;

export type OutboundCaseContext = {
  organizationId: string;
  caseId: string;
  state: string;
  caseVersion: number;
  sourceSnapshotSha256: string;
  signedPackageSha256: string | null;
  signedPackageId?: string | null;
  signedPackageContentType?:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | null;
  gmailThreadId?: string | null;
  replyContext?: ReplyContext | null;
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
  const replyContext = current?.replyContext;
  const exactReplyContext = draft.kind !== "final_response" ||
    (replyContext !== null && replyContext !== undefined &&
      JSON.stringify(draft.to.map((recipient) => recipient.email)) ===
        JSON.stringify(replyContext.to) &&
      JSON.stringify(draft.cc.map((recipient) => recipient.email)) ===
        JSON.stringify(replyContext.cc) &&
      draft.subject === replyContext.subject &&
      draft.inReplyTo === replyContext.inReplyTo &&
      JSON.stringify(draft.references) ===
        JSON.stringify(replyContext.references));
  const signedAttachments = draft.attachments.filter((attachment) =>
    attachment.bucketId === "osp-derived-documents" &&
    attachment.objectId === current.signedPackageId &&
    attachment.sha256 === current.signedPackageSha256 &&
    attachment.contentType === current.signedPackageContentType
  );
  const exactSignedAttachment = draft.kind !== "final_response" ||
    signedAttachments.length === 1;
  const exactGmailThread = draft.kind !== "final_response" ||
    (typeof current.gmailThreadId === "string" &&
      GMAIL_ID.test(current.gmailThreadId));
  if (
    !current || current.organizationId !== draft.organizationId ||
    current.caseId !== draft.caseId ||
    (current.state !== expectedState &&
      !(allowAuthorizedEdit && current.state === "ready_to_send")) ||
    current.caseVersion !== draft.caseVersion ||
    current.sourceSnapshotSha256 !== draft.sourceSnapshotSha256 ||
    current.signedPackageSha256 !== draft.signedPackageSha256 ||
    !exactReplyContext ||
    !exactSignedAttachment ||
    !exactGmailThread ||
    (draft.kind === "final_response" && draft.signedPackageSha256 === null) ||
    (draft.kind === "clarification" && draft.signedPackageSha256 !== null)
  ) stale();
  return current;
}
