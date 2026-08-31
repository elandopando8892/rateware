export type GmailSendRequest = Readonly<{
  organizationId: string;
  authorizationId: string;
  mimeObjectId: string;
  expectedMimeSha256: string;
  expectedMailbox: "carriers@xbfreight.com";
  threadId: string | null;
}>;

export type GmailSendResult = Readonly<{
  gmailMessageId: string;
  gmailThreadId: string;
  acceptedAt: string;
}>;

export interface GmailSendPort {
  sendFrozen(
    request: GmailSendRequest,
    signal: AbortSignal,
  ): Promise<GmailSendResult>;
}
