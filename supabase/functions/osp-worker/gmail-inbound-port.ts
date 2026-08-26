export type InboundGmailMessage = { gmailMessageId: string; gmailThreadId: string; rawMime: Uint8Array; receivedAt: string };
export interface GmailInboundPort { getMessage(messageId: string, signal?: AbortSignal): Promise<InboundGmailMessage>; }
