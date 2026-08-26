export type ApprovalRole =
  | "operations_reviewer"
  | "signature_approver"
  | "sales_authorizer"
  | "carriers_sender";

export type ApprovalCommandType =
  | "complete_operations_review"
  | "approve_signature"
  | "authorize_outbound"
  | "request_authorized_send";

export type ApprovalActor = {
  organizationId: string;
  subject: string;
  verifiedEmail: string;
  permissions: readonly string[];
  role: ApprovalRole;
  authorizationSessionId: string;
  authorizationSessionIssuedAt: string;
  active: boolean;
};

type ApprovalCommandBase<T extends ApprovalCommandType> = {
  type: T;
  organizationId: string;
  caseId: string;
  expectedCaseVersion: number;
  idempotencyKey: string;
  actor: ApprovalActor;
};

export type ApprovalCommand =
  | ApprovalCommandBase<"complete_operations_review"> & {
    inputSnapshotSha256: string;
  }
  | ApprovalCommandBase<"approve_signature"> & {
    inputSnapshotSha256: string;
    signatureVaultRef: string;
    signaturePositionVersion: number;
  }
  | ApprovalCommandBase<"authorize_outbound"> & {
    payloadId: string;
    payloadSha256: string;
    attachmentSha256: readonly string[];
  }
  | ApprovalCommandBase<"request_authorized_send"> & {
    salesAuthorizationId: string;
    payloadSha256: string;
  };

export type ApprovalResult = {
  caseId: string;
  state: "signature_approval" | "sales_authorization" | "ready_to_send";
  caseVersion: number;
  replayed: boolean;
  approvalId?: string;
  authorizationId?: string;
};

export type ApprovalEvent = {
  id: string;
  organizationId: string;
  caseId: string;
  caseVersion: number;
  type: ApprovalCommandType;
  actorSubject: string;
  actorRole: ApprovalRole;
  commandSha256: string;
  occurredAt: string;
};

export interface ApprovalStore {
  transact(
    command: ApprovalCommand,
    prepare?: () => Promise<void>,
  ): Promise<ApprovalResult>;
  events(caseId: string): Promise<readonly ApprovalEvent[]>;
}
