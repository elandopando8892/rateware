import {
  AmbiguousSendError,
  KnownPreAcceptanceSendError,
} from "../_shared/osp/gmail-send-adapter.ts";
import type { GmailSendPort } from "../_shared/osp/gmail-send-port.ts";
import type {
  OutboundSendReceipt,
  OutboundSendStore,
} from "./outbound-receipt.ts";

export async function runOutboundSendJob(
  input: {
    organizationId: string;
    attemptId: string;
    jobId: string;
    leaseToken: string;
  },
  deps: {
    store: OutboundSendStore;
    gmail: GmailSendPort;
    signal: AbortSignal;
  },
): Promise<
  OutboundSendReceipt | { outcome: "failed" | "manual_reconciliation_required" }
> {
  const claimed = await deps.store.claim(input);
  if (claimed.kind === "terminal") return claimed.result;
  try {
    const result = await deps.gmail.sendFrozen({
      authorizationId: claimed.authorizationId,
      mimeObjectId: claimed.mimeObjectId,
      expectedMimeSha256: claimed.mimeSha256,
      expectedMailbox: "carriers@xbfreight.com",
      threadId: claimed.threadId,
    }, deps.signal);
    return await deps.store.recordSent({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      authorizationId: claimed.authorizationId,
      gmailMessageId: result.gmailMessageId,
      gmailThreadId: result.gmailThreadId,
      canonicalMimeSha256: claimed.mimeSha256,
      deterministicMessageId: claimed.deterministicMessageId,
      sendClaimToken: claimed.sendClaimToken,
      jobId: input.jobId,
      leaseToken: input.leaseToken,
      providerTimestamp: result.acceptedAt,
    });
  } catch (error) {
    if (error instanceof KnownPreAcceptanceSendError) {
      return await deps.store.recordKnownFailure({
        organizationId: input.organizationId,
        attemptId: input.attemptId,
        failureCode: error.message,
        jobId: input.jobId,
        leaseToken: input.leaseToken,
        sendClaimToken: claimed.sendClaimToken,
      });
    }
    if (error instanceof AmbiguousSendError) {
      return await deps.store.recordAmbiguous({
        organizationId: input.organizationId,
        attemptId: input.attemptId,
        jobId: input.jobId,
        leaseToken: input.leaseToken,
        sendClaimToken: claimed.sendClaimToken,
      });
    }
    if (error instanceof Error && error.message === "DATABASE_TEMPORARY") {
      throw error;
    }
    return await deps.store.recordAmbiguous({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      jobId: input.jobId,
      leaseToken: input.leaseToken,
      sendClaimToken: claimed.sendClaimToken,
    });
  }
}
