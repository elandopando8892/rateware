import { parseCopiedRequest } from "../_shared/osp/gmail-envelope.ts";
import type { GmailInboundPort } from "./gmail-inbound-port.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type ExactThreadPreflightRequest = Readonly<{
  organizationId: string;
  originalGmailMessageId: string;
  amendmentGmailMessageId: string;
}>;

export type ExactThreadPreflightMessage = Readonly<{
  gmailMessageId: string;
  outerRawMimeSha256: string;
  originalEmlSha256: string;
}>;

export type ExactThreadPreflightResult = Readonly<{
  original: ExactThreadPreflightMessage;
  amendment: ExactThreadPreflightMessage;
}>;

type ResolvedPreflightMessage = Readonly<{
  publicResult: ExactThreadPreflightMessage;
  gmailThreadId: string;
  externalSenderEmail: string;
  externalSenderDomain: string;
}>;

async function resolveMessage(
  gmail: GmailInboundPort,
  gmailMessageId: string,
  signal?: AbortSignal,
): Promise<ResolvedPreflightMessage> {
  const message = await gmail.getMessage(gmailMessageId, signal);
  if (
    message.gmailMessageId !== gmailMessageId || !message.gmailThreadId ||
    !Number.isFinite(Date.parse(message.receivedAt))
  ) throw new Error("INVALID_GMAIL_MESSAGE");

  const parsed = await parseCopiedRequest(message.rawMime, {
    allowInternalRelay: true,
  });
  const originalEnvelope = parsed.provenance.originalEnvelope;
  if (
    parsed.provenance.relationship !== "internal_relay" ||
    !originalEnvelope?.senderEmail || !originalEnvelope.senderDomain ||
    originalEnvelope.senderDomain !== parsed.supplierDomain
  ) throw new Error("EXACT_THREAD_RELAY_PROVENANCE_REQUIRED");

  return Object.freeze({
    publicResult: Object.freeze({
      gmailMessageId,
      outerRawMimeSha256: parsed.provenance.parentEnvelope.sourceSha256,
      originalEmlSha256: originalEnvelope.sourceSha256,
    }),
    gmailThreadId: message.gmailThreadId,
    externalSenderEmail: originalEnvelope.senderEmail.toLowerCase(),
    externalSenderDomain: originalEnvelope.senderDomain.toLowerCase(),
  });
}

/**
 * Reads and validates two exact Gmail relay messages without writing objects,
 * jobs, cases, receipts, or any other persistent state.
 */
export async function preflightExactThreadAssociation(
  deps: Readonly<{ gmail: GmailInboundPort }>,
  request: ExactThreadPreflightRequest,
  signal?: AbortSignal,
): Promise<ExactThreadPreflightResult> {
  if (!UUID.test(request.organizationId)) {
    throw new Error("INVALID_THREAD_PREFLIGHT_ORGANIZATION_ID");
  }
  if (!GMAIL_ID.test(request.originalGmailMessageId)) {
    throw new Error("INVALID_ORIGINAL_GMAIL_MESSAGE_ID");
  }
  if (!GMAIL_ID.test(request.amendmentGmailMessageId)) {
    throw new Error("INVALID_AMENDMENT_GMAIL_MESSAGE_ID");
  }
  if (request.originalGmailMessageId === request.amendmentGmailMessageId) {
    throw new Error("EXACT_THREAD_MESSAGES_MUST_DIFFER");
  }

  const original = await resolveMessage(
    deps.gmail,
    request.originalGmailMessageId,
    signal,
  );
  const amendment = await resolveMessage(
    deps.gmail,
    request.amendmentGmailMessageId,
    signal,
  );
  if (original.gmailThreadId !== amendment.gmailThreadId) {
    throw new Error("EXACT_THREAD_GMAIL_THREAD_MISMATCH");
  }
  if (
    original.externalSenderEmail !== amendment.externalSenderEmail ||
    original.externalSenderDomain !== amendment.externalSenderDomain
  ) throw new Error("EXACT_THREAD_EXTERNAL_SENDER_MISMATCH");
  if (
    original.publicResult.outerRawMimeSha256 ===
      amendment.publicResult.outerRawMimeSha256 ||
    original.publicResult.originalEmlSha256 ===
      amendment.publicResult.originalEmlSha256
  ) throw new Error("EXACT_THREAD_SOURCES_MUST_DIFFER");

  return Object.freeze({
    original: original.publicResult,
    amendment: amendment.publicResult,
  });
}
