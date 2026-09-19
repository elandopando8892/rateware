import { parseCopiedRequest } from "../_shared/osp/gmail-envelope.ts";
import type { OriginalObjectStore } from "../_shared/osp/original-object-store.ts";
import type { GmailInboundPort } from "./gmail-inbound-port.ts";
import type { ExactThreadSourcePort } from "./exact-thread-association.ts";
import type { IntakeSource } from "./intake-service.ts";

/** Preserves raw sources only; never creates cases or promotes document safety. */
export function createExactThreadSource(deps: {
  organizationId: string;
  gmail: GmailInboundPort;
  objects: OriginalObjectStore;
}): ExactThreadSourcePort {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(deps.organizationId)
  ) {
    throw new Error("INVALID_THREAD_ASSOCIATION_ORGANIZATION_ID");
  }
  return Object.freeze({
    async resolve(expected, signal) {
      const message = await deps.gmail.getMessage(
        expected.gmailMessageId,
        signal,
      );
      if (
        message.gmailMessageId !== expected.gmailMessageId ||
        !message.gmailThreadId ||
        !Number.isFinite(Date.parse(message.receivedAt))
      ) throw new Error("INVALID_GMAIL_MESSAGE");
      const parsed = await parseCopiedRequest(message.rawMime, {
        allowInternalRelay: true,
      });
      const outerRawMimeSha256 = parsed.provenance.parentEnvelope.sourceSha256;
      const originalEmlSha256 = parsed.provenance.originalEnvelope
        ?.sourceSha256;
      if (
        parsed.provenance.relationship !== "internal_relay" ||
        outerRawMimeSha256 !== expected.outerRawMimeSha256 ||
        originalEmlSha256 !== expected.originalEmlSha256
      ) {
        throw new Error("EXACT_THREAD_SOURCE_PROVENANCE_MISMATCH");
      }
      const raw = await deps.objects.put({
        organizationId: deps.organizationId,
        bytes: message.rawMime,
        contentType: "message/rfc822",
        preverifiedSha256: outerRawMimeSha256,
      }, signal);
      if (raw.sha256 !== outerRawMimeSha256) {
        throw new Error("SOURCE_HASH_MISMATCH");
      }
      const attachments: IntakeSource["attachments"][number][] = [];
      for (const attachment of parsed.attachments) {
        const stored = await deps.objects.put({
          organizationId: deps.organizationId,
          bytes: attachment.bytes,
          contentType: attachment.contentType,
          preverifiedSha256: attachment.sha256,
        }, signal);
        if (stored.sha256 !== attachment.sha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
        attachments.push({
          objectKey: stored.key,
          sha256: stored.sha256,
          contentType: attachment.contentType,
          filename: attachment.filename,
          sourceRole: attachment.sourceRole,
          parentSourceSha256: attachment.parentSourceSha256,
          processingDisposition: attachment.processingDisposition,
        });
      }
      return {
        parsed,
        outerRawMimeSha256,
        originalEmlSha256,
        source: {
          gmailMessageId: message.gmailMessageId,
          gmailThreadId: message.gmailThreadId,
          receivedAt: message.receivedAt,
          rawMimeKey: raw.key,
          rawMimeHash: raw.sha256,
          attachments,
          attachmentHashes: attachments.map((item) => item.sha256).sort(),
        },
      };
    },
  });
}
