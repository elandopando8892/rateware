import {
  assessDuplicates,
  type DuplicateCandidate,
  type DuplicateSignal,
} from "../_shared/osp/duplicate-engine.ts";
import {
  parseCopiedRequest,
  type ParsedCopiedRequest,
} from "../_shared/osp/gmail-envelope.ts";
import type { OriginalObjectStore } from "../_shared/osp/original-object-store.ts";
import type { BackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import type { GmailInboundPort } from "./gmail-inbound-port.ts";

export { parseCopiedRequest } from "../_shared/osp/gmail-envelope.ts";

export type IntakePersistence = {
  findDuplicates(
    organizationId: string,
    source: DuplicateCandidate,
    signal?: AbortSignal,
  ): Promise<readonly DuplicateCandidate[]>;
  createCase(
    input: {
      organizationId: string;
      deliveryIdempotencyKey: string;
      source: IntakeSource;
      parsed: ParsedCopiedRequest;
      blockedByDuplicateReview: false;
    },
    signal?: AbortSignal,
  ): Promise<{ caseId: string; eventId: string }>;
  attachExact(
    input: {
      organizationId: string;
      existingCaseId: string;
      deliveryIdempotencyKey: string;
      source: IntakeSource;
      parsed: ParsedCopiedRequest;
      evidence: readonly DuplicateSignal[];
    },
    signal?: AbortSignal,
  ): Promise<{ caseId: string; eventId: string }>;
  holdForReview(
    input: {
      organizationId: string;
      deliveryIdempotencyKey: string;
      candidateIds: readonly string[];
      source: IntakeSource;
      parsed: ParsedCopiedRequest;
      evidence: readonly DuplicateSignal[];
    },
    signal?: AbortSignal,
  ): Promise<{ caseId: string }>;
  refreshDuplicateReview(
    input: { organizationId: string; caseId: string; correlationId: string },
    signal?: AbortSignal,
  ): Promise<void>;
};
export type IntakeSource = {
  gmailMessageId: string;
  gmailThreadId: string;
  rawMimeKey: string;
  rawMimeHash: string;
  attachments: readonly {
    objectKey: string;
    sha256: string;
    contentType: string;
  }[];
  attachmentHashes: readonly string[];
  receivedAt: string;
};
export type OutboundReceiptIngestService = {
  capture(
    input: {
      organizationId: string;
      jobId: string;
      leaseToken: string;
      gmailMessageId: string;
      gmailThreadId: string;
      receivedAt: string;
      rawMime: Uint8Array;
    },
  ): Promise<
    { outcome: "not_outbound" } | {
      outcome: "outbound_receipt" | "supplier_response";
      caseId: string;
      replayed: boolean;
    }
  >;
};
export interface IntakeService {
  ingest(
    input: {
      organizationId: string;
      gmailMessageId: string;
      deliveryIdempotencyKey: string;
      jobId?: string;
      leaseToken?: string;
    },
    signal?: AbortSignal,
  ): Promise<
    { outcome: "created"; caseId: string; eventId: string } | {
      outcome: "attached";
      caseId: string;
      eventId: string;
    } | {
      outcome: "held_for_duplicate_review";
      caseId: string;
      candidateIds: readonly string[];
    } | {
      outcome: "outbound_receipt" | "supplier_response";
      caseId: string;
      replayed: boolean;
    }
  >;
  refreshDuplicateReview(
    input: { organizationId: string; caseId: string; correlationId: string },
    signal?: AbortSignal,
  ): Promise<void>;
}

export type IntakeStage =
  | "gmail_fetch"
  | "receipt_capture"
  | "mime_parse"
  | "raw_store"
  | "attachment_store"
  | "duplicate_lookup"
  | "case_persist"
  | "duplicate_refresh";

export class IntakeStageError extends Error {
  readonly stage: IntakeStage;

  constructor(stage: IntakeStage, cause: unknown) {
    super("OSP_INTAKE_STAGE_FAILURE", { cause });
    this.name = "IntakeStageError";
    this.stage = stage;
  }
}

async function atStage<T>(
  stage: IntakeStage,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new IntakeStageError(stage, error);
  }
}

function requireOpaque(value: string, code: string): string {
  if (!/^[A-Za-z0-9:_-]{1,256}$/.test(value)) throw new Error(code);
  return value;
}
export function createIntakeService(
  deps: {
    gmail: GmailInboundPort;
    objects: OriginalObjectStore;
    persistence: IntakePersistence;
    jobs: Pick<BackgroundJobStore, "enqueue">;
    receipts?: OutboundReceiptIngestService;
  },
): IntakeService {
  return Object.freeze({
    async ingest(
      input: {
        organizationId: string;
        gmailMessageId: string;
        deliveryIdempotencyKey: string;
        jobId?: string;
        leaseToken?: string;
      },
      signal?: AbortSignal,
    ) {
      const organizationId = input.organizationId;
      requireOpaque(input.gmailMessageId, "INVALID_GMAIL_MESSAGE_ID");
      requireOpaque(input.deliveryIdempotencyKey, "INVALID_DELIVERY_KEY");
      const message = await atStage(
        "gmail_fetch",
        () => deps.gmail.getMessage(input.gmailMessageId, signal),
      );
      if (
        message.gmailMessageId !== input.gmailMessageId ||
        !Number.isFinite(Date.parse(message.receivedAt))
      ) throw new Error("INVALID_GMAIL_MESSAGE");
      if (deps.receipts) {
        if (!input.jobId || !input.leaseToken) throw new Error("INVALID_INPUT");
        const receipt = await atStage(
          "receipt_capture",
          () =>
            deps.receipts!.capture({
              organizationId,
              jobId: input.jobId!,
              leaseToken: input.leaseToken!,
              gmailMessageId: message.gmailMessageId,
              gmailThreadId: message.gmailThreadId,
              receivedAt: message.receivedAt,
              rawMime: message.rawMime,
            }),
        );
        if (receipt.outcome !== "not_outbound") return receipt;
      }
      const parsed = await atStage(
        "mime_parse",
        () => parseCopiedRequest(message.rawMime),
      );
      const raw = await atStage(
        "raw_store",
        () =>
          deps.objects.put({
            organizationId,
            bytes: message.rawMime,
            contentType: "message/rfc822",
          }, signal),
      );
      const attachmentObjects: {
        objectKey: string;
        sha256: string;
        contentType: string;
      }[] = [];
      for (const attachment of parsed.attachments) {
        const stored = await atStage(
          "attachment_store",
          () =>
            deps.objects.put({
              organizationId,
              bytes: attachment.bytes,
              contentType: attachment.contentType,
            }, signal),
        );
        attachmentObjects.push(
          Object.freeze({
            objectKey: stored.key,
            sha256: stored.sha256,
            contentType: attachment.contentType,
          }),
        );
      }
      const attachments = Object.freeze(attachmentObjects);
      const attachmentHashes = Object.freeze(
        attachmentObjects.map((attachment) => attachment.sha256).sort(),
      );
      const source: IntakeSource = Object.freeze({
        gmailMessageId: message.gmailMessageId,
        gmailThreadId: message.gmailThreadId,
        rawMimeKey: raw.key,
        rawMimeHash: raw.sha256,
        attachments,
        attachmentHashes,
        receivedAt: message.receivedAt,
      });
      const candidate: DuplicateCandidate = {
        caseId: `incoming:${message.gmailMessageId}`,
        gmailMessageId: source.gmailMessageId,
        rawMimeHash: source.rawMimeHash,
        attachmentHashes: source.attachmentHashes,
        gmailThreadId: source.gmailThreadId,
        supplierDomain: parsed.supplierDomain,
        applicationReference: parsed.applicationReference,
        receivedAt: source.receivedAt,
        requirementTokens: parsed.requirementTokens,
      };
      const duplicateCandidates = await atStage(
        "duplicate_lookup",
        () =>
          deps.persistence.findDuplicates(organizationId, candidate, signal),
      );
      const assessment = assessDuplicates(candidate, duplicateCandidates);
      if (assessment.outcome === "exact") {
        const attached = await atStage(
          "case_persist",
          () =>
            deps.persistence.attachExact({
              organizationId,
              existingCaseId: assessment.existingCaseId,
              deliveryIdempotencyKey: input.deliveryIdempotencyKey,
              source,
              parsed,
              evidence: assessment.evidence,
            }, signal),
        );
        return { outcome: "attached" as const, ...attached };
      }
      if (assessment.outcome === "probable") {
        const held = await atStage(
          "case_persist",
          () =>
            deps.persistence.holdForReview({
              organizationId,
              deliveryIdempotencyKey: input.deliveryIdempotencyKey,
              candidateIds: assessment.candidateCaseIds,
              source,
              parsed,
              evidence: assessment.evidence,
            }, signal),
        );
        return {
          outcome: "held_for_duplicate_review" as const,
          caseId: held.caseId,
          candidateIds: assessment.candidateCaseIds,
        };
      }
      const created = await atStage(
        "case_persist",
        () =>
          deps.persistence.createCase({
            organizationId,
            deliveryIdempotencyKey: input.deliveryIdempotencyKey,
            source,
            parsed,
            blockedByDuplicateReview: false,
          }, signal),
      );
      await deps.jobs.enqueue({
        organizationId,
        kind: "duplicate_review_refresh",
        opaquePayload: { caseId: created.caseId },
        idempotencyKey: `duplicate:${created.caseId}`,
      });
      return { outcome: "created" as const, ...created };
    },
    async refreshDuplicateReview(
      input: { organizationId: string; caseId: string; correlationId: string },
      signal?: AbortSignal,
    ) {
      requireOpaque(input.caseId, "INVALID_CASE_ID");
      requireOpaque(input.correlationId, "INVALID_CORRELATION_ID");
      await atStage(
        "duplicate_refresh",
        () => deps.persistence.refreshDuplicateReview(input, signal),
      );
    },
  });
}
