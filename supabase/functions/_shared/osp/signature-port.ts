export type SignatureApplyRequest = {
  organizationId: string;
  caseId: string;
  approvalId: string;
  jobId: string;
  leaseToken: string;
  inputObjectId: string;
  expectedInputSha256: string;
  signaturePositionVersion: number;
};

export type SignatureApplyReceipt = {
  inputSha256: string;
  outputSha256: string;
  outputObjectId: string;
};

export interface SignaturePort {
  apply(
    request: SignatureApplyRequest,
    signal: AbortSignal,
  ): Promise<SignatureApplyReceipt>;
}
