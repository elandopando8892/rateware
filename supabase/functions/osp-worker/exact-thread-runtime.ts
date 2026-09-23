import type { CanaryBackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import type { OriginalObjectStore } from "../_shared/osp/original-object-store.ts";
import type { GmailInboundPort } from "./gmail-inbound-port.ts";
import {
  createExactThreadAssociationService,
  type ExactThreadAssociationPersistence,
} from "./exact-thread-association.ts";
import { createExactThreadSource } from "./exact-thread-source.ts";

export type ExactThreadAssociationRun = {
  organizationId: string;
  recoveryId: string;
  priorJobId: string;
  targetCaseId: string;
  originalGmailMessageId: string;
  originalOuterRawMimeSha256: string;
  originalEmlSha256: string;
  amendmentGmailMessageId: string;
  amendmentOuterRawMimeSha256: string;
  amendmentEmlSha256: string;
};

export async function runExactThreadAssociation(deps: {
  jobs: Pick<
    CanaryBackgroundJobStore,
    "enqueue" | "claimExactThreadAssociation" | "complete" | "fail"
  >;
  gmail: GmailInboundPort;
  objects: OriginalObjectStore;
  persistence: ExactThreadAssociationPersistence;
  now?: () => Date;
}, request: ExactThreadAssociationRun): Promise<number> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(request.recoveryId)
  ) {
    throw new Error("INVALID_EXACT_THREAD_RECOVERY_ID");
  }
  const deliveryIdempotencyKey =
    `exact-thread:${request.targetCaseId}:${request.originalOuterRawMimeSha256}:${request.amendmentOuterRawMimeSha256}`;
  const jobId = await deps.jobs.enqueue({
    organizationId: request.organizationId,
    kind: "exact_thread_association",
    opaquePayload: {
      priorJobId: request.priorJobId,
      targetCaseId: request.targetCaseId,
      deliveryIdempotencyKey,
      originalGmailMessageId: request.originalGmailMessageId,
      originalOuterRawMimeSha256: request.originalOuterRawMimeSha256,
      originalEmlSha256: request.originalEmlSha256,
      amendmentGmailMessageId: request.amendmentGmailMessageId,
      amendmentOuterRawMimeSha256: request.amendmentOuterRawMimeSha256,
      amendmentOriginalEmlSha256: request.amendmentEmlSha256,
    },
    idempotencyKey:
      `exact-thread-association:${request.targetCaseId}:${request.recoveryId}`,
  });
  const leased = await deps.jobs.claimExactThreadAssociation({
    ...request,
    jobId,
    leaseMs: 300_000,
  });
  if (leased.length !== 1) return 0;
  const job = leased[0];
  const service = createExactThreadAssociationService({
    sources: createExactThreadSource({
      organizationId: request.organizationId,
      gmail: deps.gmail,
      objects: deps.objects,
    }),
    persistence: deps.persistence,
  });
  try {
    await service.associate({
      organizationId: request.organizationId,
      priorJobId: request.priorJobId,
      targetCaseId: request.targetCaseId,
      deliveryIdempotencyKey,
      original: {
        gmailMessageId: request.originalGmailMessageId,
        outerRawMimeSha256: request.originalOuterRawMimeSha256,
        originalEmlSha256: request.originalEmlSha256,
      },
      amendment: {
        gmailMessageId: request.amendmentGmailMessageId,
        outerRawMimeSha256: request.amendmentOuterRawMimeSha256,
        originalEmlSha256: request.amendmentEmlSha256,
      },
    });
    await deps.jobs.complete({
      jobId: job.id,
      leaseToken: job.leaseToken,
      completedAt: (deps.now ?? (() => new Date()))(),
    });
  } catch (error) {
    const code = error instanceof Error &&
        ["GMAIL_TEMPORARY", "STORAGE_TEMPORARY", "DATABASE_TEMPORARY"].includes(
          error.message,
        )
      ? error.message as
        | "GMAIL_TEMPORARY"
        | "STORAGE_TEMPORARY"
        | "DATABASE_TEMPORARY"
      : "PERMANENT_FAILURE";
    const now = (deps.now ?? (() => new Date()))();
    await deps.jobs.fail({
      jobId: job.id,
      leaseToken: job.leaseToken,
      errorCode: code,
      retryAt: code === "PERMANENT_FAILURE"
        ? null
        : new Date(now.getTime() + 5_000),
    });
    throw error;
  }
  return 1;
}
