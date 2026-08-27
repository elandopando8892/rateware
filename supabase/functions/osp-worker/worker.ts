import type {
  BackgroundJobStore,
  JobErrorCode,
  LeasedJob,
} from "../_shared/osp/background-jobs.ts";
import {
  type IntakeService,
  type IntakeStage,
  IntakeStageError,
} from "./intake-service.ts";
import type { SignatureApplyReceipt } from "../_shared/osp/signature-port.ts";
import type { AutomaticPreparationService } from "./automatic-preparation.ts";
import type { AttachmentPromotionService } from "./attachment-promotion.ts";

const TEMPORARY = new Set<JobErrorCode>([
  "GMAIL_TEMPORARY",
  "STORAGE_TEMPORARY",
  "STORAGE_UPLOAD_TEMPORARY",
  "STORAGE_DOWNLOAD_TEMPORARY",
  "DATABASE_TEMPORARY",
  "AZURE_TEMPORARY",
  "OPENAI_TEMPORARY",
]);
const POSTGRES_TEMPORARY = new Set(["40001", "40P01"]);

export interface ManagedExtractionService {
  extract(
    input: {
      organizationId: string;
      documentVersionId: string;
      correlationId: string;
    },
  ): Promise<void>;
}
export interface QuarterlyDocumentService {
  check(
    input: {
      organizationId: string;
      referenceDate: Date;
      correlationId: string;
    },
  ): Promise<unknown>;
}
export interface SignatureJobService {
  apply(
    input: {
      organizationId: string;
      approvalId: string;
      jobId: string;
      leaseToken: string;
    },
  ): Promise<SignatureApplyReceipt>;
}
export interface OutboundSendJobService {
  execute(
    input: {
      organizationId: string;
      authorizationId: string;
      attemptId: string;
      jobId: string;
      leaseToken: string;
    },
  ): Promise<unknown>;
}

export function deterministicRetryAt(now: Date, attempt: number): Date {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 4) {
    throw new Error("INVALID_ATTEMPT");
  }
  return new Date(now.getTime() + Math.min(5 * 2 ** (attempt - 1), 40) * 1000);
}
function rootError(error: unknown): unknown {
  let current = error;
  while (current instanceof IntakeStageError) current = current.cause;
  return current;
}

function errorCode(error: unknown): JobErrorCode {
  const stage = failureStage(error);
  error = rootError(error);
  const postgresCode = typeof error === "object" && error !== null &&
      "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (
    typeof postgresCode === "string" && POSTGRES_TEMPORARY.has(postgresCode)
  ) {
    return "DATABASE_TEMPORARY";
  }
  const code = error instanceof Error ? error.message : "";
  const classified = TEMPORARY.has(code as JobErrorCode)
    ? code as JobErrorCode
    : code === "SOURCE_HASH_MISMATCH"
    ? "SOURCE_HASH_MISMATCH"
    : code === "INVALID_INPUT" || code === "INVALID_GMAIL_MESSAGE" ||
        code === "UNQUALIFIED_GMAIL_MESSAGE" || code === "MALFORMED_MIME"
    ? "INVALID_INPUT"
    : "PERMANENT_FAILURE";
  if (classified !== "PERMANENT_FAILURE" || stage === "worker_execute") {
    return classified;
  }
  return `${stage.toUpperCase()}_FAILURE` as JobErrorCode;
}

function failureStage(error: unknown): IntakeStage | "worker_execute" {
  return error instanceof IntakeStageError ? error.stage : "worker_execute";
}
async function execute(
  job: LeasedJob,
  now: Date,
  intake: IntakeService,
  extraction?: ManagedExtractionService,
  formMappings?: AutomaticPreparationService,
  quarterlyDocuments?: QuarterlyDocumentService,
  signatures?: SignatureJobService,
  outboundSends?: OutboundSendJobService,
  attachmentPromotions?: AttachmentPromotionService,
): Promise<void> {
  if (job.kind === "send_authorized_payload") {
    const attemptId = job.opaquePayload.attemptId;
    const authorizationId = job.opaquePayload.authorizationId;
    if (!attemptId || !authorizationId || !outboundSends) {
      throw new Error("INVALID_INPUT");
    }
    await outboundSends.execute({
      organizationId: job.organizationId,
      authorizationId,
      attemptId,
      jobId: job.id,
      leaseToken: job.leaseToken,
    });
    return;
  }
  if (job.kind === "apply_signature") {
    const approvalId = job.opaquePayload.approvalId;
    if (!approvalId || !signatures) throw new Error("INVALID_INPUT");
    await signatures.apply({
      organizationId: job.organizationId,
      approvalId,
      jobId: job.id,
      leaseToken: job.leaseToken,
    });
    return;
  }
  if (job.kind === "document_extract") {
    const documentVersionId = job.opaquePayload.documentVersionId;
    if (!documentVersionId || !extraction) throw new Error("INVALID_INPUT");
    await extraction.extract({
      organizationId: job.organizationId,
      documentVersionId,
      correlationId: job.id,
    });
    return;
  }
  if (job.kind === "form_ai_mapping") {
    const caseId = job.opaquePayload.caseId;
    const extractionId = job.opaquePayload.extractionId;
    const templateVersionId = job.opaquePayload.templateVersionId;
    if (!caseId || !extractionId || !templateVersionId || !formMappings) {
      throw new Error("INVALID_INPUT");
    }
    await formMappings.prepare({
      organizationId: job.organizationId,
      caseId,
      extractionId,
      templateVersionId,
      correlationId: job.id,
    });
    return;
  }
  if (job.kind === "duplicate_review_refresh") {
    const caseId = job.opaquePayload.caseId;
    if (!caseId || typeof intake.refreshDuplicateReview !== "function") {
      throw new Error("INVALID_INPUT");
    }
    await intake.refreshDuplicateReview({
      organizationId: job.organizationId,
      caseId,
      correlationId: job.id,
    });
    return;
  }
  if (job.kind === "quarterly_document_check") {
    if (!job.opaquePayload.scheduleRunId || !quarterlyDocuments) {
      throw new Error("INVALID_INPUT");
    }
    await quarterlyDocuments.check({
      organizationId: job.organizationId,
      referenceDate: now,
      correlationId: job.id,
    });
    return;
  }
  const gmailMessageId = job.opaquePayload.gmailMessageId;
  const deliveryIdempotencyKey = job.opaquePayload.deliveryIdempotencyKey;
  if (!gmailMessageId || !deliveryIdempotencyKey) {
    throw new Error("INVALID_INPUT");
  }
  const result = await intake.ingest({
    organizationId: job.organizationId,
    gmailMessageId,
    deliveryIdempotencyKey,
    jobId: job.id,
    leaseToken: job.leaseToken,
  });
  if (
    attachmentPromotions &&
    (result.outcome === "created" || result.outcome === "attached")
  ) {
    await attachmentPromotions.promoteCase({
      organizationId: job.organizationId,
      caseId: result.caseId,
      correlationId: job.id,
    });
  }
}

export async function runWorker(
  deps: {
    workerId: string;
    now: () => Date;
    jobs: Pick<BackgroundJobStore, "claim" | "complete" | "fail">;
    intake: IntakeService;
    extraction?: ManagedExtractionService;
    formMappings?: AutomaticPreparationService;
    quarterlyDocuments?: QuarterlyDocumentService;
    signatures?: SignatureJobService;
    outboundSends?: OutboundSendJobService;
    attachmentPromotions?: AttachmentPromotionService;
    reportFailure?: (input: {
      jobId: string;
      kind: string;
      attempt: number;
      code: JobErrorCode;
      stage: IntakeStage | "worker_execute";
      errorName: string;
    }) => void;
    limit?: number;
  },
): Promise<number> {
  const now = deps.now();
  const jobs = await deps.jobs.claim({
    workerId: deps.workerId,
    now,
    leaseMs: 5 * 60 * 1000,
    limit: deps.limit ?? 10,
  });
  for (const job of jobs) {
    try {
      await execute(
        job,
        now,
        deps.intake,
        deps.extraction,
        deps.formMappings,
        deps.quarterlyDocuments,
        deps.signatures,
        deps.outboundSends,
        deps.attachmentPromotions,
      );
      await deps.jobs.complete({
        jobId: job.id,
        leaseToken: job.leaseToken,
        completedAt: now,
      });
    } catch (error) {
      const code = errorCode(error);
      const original = rootError(error);
      const diagnostic = {
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempt,
        code,
        stage: failureStage(error),
        errorName: original instanceof Error ? original.name : typeof original,
      };
      if (deps.reportFailure) deps.reportFailure(diagnostic);
      else {console.error(
          JSON.stringify({ event: "osp_worker_job_failed", ...diagnostic }),
        );}
      await deps.jobs.fail({
        jobId: job.id,
        leaseToken: job.leaseToken,
        errorCode: code,
        retryAt: TEMPORARY.has(code) && job.attempt < 4
          ? deterministicRetryAt(now, job.attempt)
          : null,
      });
    }
  }
  return jobs.length;
}
