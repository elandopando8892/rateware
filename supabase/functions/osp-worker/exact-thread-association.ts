import type { ParsedCopiedRequest } from "../_shared/osp/gmail-envelope.ts";
import type { IntakeSource } from "./intake-service.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type ExactThreadMessageExpectation = Readonly<{
  gmailMessageId: string;
  outerRawMimeSha256: string;
  originalEmlSha256: string;
}>;

export type ExactThreadAssociationRequest = Readonly<{
  organizationId: string;
  priorJobId: string;
  targetCaseId: string;
  deliveryIdempotencyKey: string;
  original: ExactThreadMessageExpectation;
  amendment: ExactThreadMessageExpectation;
}>;

/**
 * `outerRawMimeSha256` identifies the relay envelope. `originalEmlSha256`
 * identifies the attached customer message, and must never be substituted for
 * the outer hash in a claim or receipt.
 */
export type ResolvedExactThreadMessage = Readonly<{
  source: IntakeSource;
  parsed: ParsedCopiedRequest;
  outerRawMimeSha256: string;
  originalEmlSha256: string;
}>;

export type ExactThreadSourcePort = Readonly<{
  /**
   * Implementations fetch, parse with `allowInternalRelay: true`, and preserve
   * the source only after checking the requested outer and original EML hashes.
   */
  resolve(
    expectation: ExactThreadMessageExpectation,
    signal?: AbortSignal,
  ): Promise<ResolvedExactThreadMessage>;
}>;

export type ExactThreadAssociationPersistence = Readonly<{
  /**
   * One transaction: verifies the terminal prior job has `INVALID_INPUT`, the
   * target does not exist, writes a `received` case and both sources, and uses
   * a command receipt for replay. It must not create a snapshot, package,
   * signature, payment, or send.
   */
  createReviewedThread(
    input: Readonly<{
      organizationId: string;
      targetCaseId: string;
      priorJobId: string;
      deliveryIdempotencyKey: string;
      original: Readonly<{ source: IntakeSource; parsed: ParsedCopiedRequest }>;
      amendment: Readonly<
        { source: IntakeSource; parsed: ParsedCopiedRequest }
      >;
    }>,
    signal?: AbortSignal,
  ): Promise<Readonly<{ caseId: string; eventId: string; replayed: boolean }>>;
}>;

function requireUuid(value: string, code: string): void {
  if (!UUID.test(value)) throw new Error(code);
}
function requireSha(value: string, code: string): void {
  if (!SHA256.test(value)) throw new Error(code);
}
function requireGmailId(value: string, code: string): void {
  if (!GMAIL_ID.test(value)) throw new Error(code);
}
function requireKey(value: string): void {
  if (!/^[A-Za-z0-9:_-]{1,256}$/.test(value)) {
    throw new Error("INVALID_THREAD_ASSOCIATION_DELIVERY_KEY");
  }
}

function validateExpectation(
  expectation: ExactThreadMessageExpectation,
  label: "ORIGINAL" | "AMENDMENT",
): void {
  requireGmailId(
    expectation.gmailMessageId,
    `INVALID_${label}_GMAIL_MESSAGE_ID`,
  );
  requireSha(
    expectation.outerRawMimeSha256,
    `INVALID_${label}_OUTER_MIME_HASH`,
  );
  requireSha(expectation.originalEmlSha256, `INVALID_${label}_EML_HASH`);
}

function validateResolved(
  expected: ExactThreadMessageExpectation,
  actual: ResolvedExactThreadMessage,
  label: "ORIGINAL" | "AMENDMENT",
): void {
  if (actual.source.gmailMessageId !== expected.gmailMessageId) {
    throw new Error(`EXACT_THREAD_${label}_GMAIL_ID_MISMATCH`);
  }
  if (
    actual.outerRawMimeSha256 !== expected.outerRawMimeSha256 ||
    actual.source.rawMimeHash !== expected.outerRawMimeSha256
  ) throw new Error(`EXACT_THREAD_${label}_OUTER_MIME_HASH_MISMATCH`);
  if (actual.originalEmlSha256 !== expected.originalEmlSha256) {
    throw new Error(`EXACT_THREAD_${label}_EML_HASH_MISMATCH`);
  }
  if (
    actual.parsed.provenance.relationship !== "internal_relay" ||
    !actual.parsed.provenance.originalEnvelope
  ) throw new Error(`EXACT_THREAD_${label}_RELAY_PROVENANCE_REQUIRED`);
  if (
    actual.parsed.provenance.parentEnvelope.sourceSha256 !==
      expected.outerRawMimeSha256 ||
    actual.parsed.provenance.originalEnvelope.sourceSha256 !==
      expected.originalEmlSha256
  ) throw new Error(`EXACT_THREAD_${label}_PROVENANCE_HASH_MISMATCH`);
  if (!actual.parsed.senderEmail || !actual.parsed.senderDomain) {
    throw new Error(`EXACT_THREAD_${label}_EXTERNAL_SENDER_REQUIRED`);
  }
}

function validatePair(
  original: ResolvedExactThreadMessage,
  amendment: ResolvedExactThreadMessage,
): void {
  if (original.source.gmailMessageId === amendment.source.gmailMessageId) {
    throw new Error("EXACT_THREAD_MESSAGES_MUST_DIFFER");
  }
  if (original.source.gmailThreadId !== amendment.source.gmailThreadId) {
    throw new Error("EXACT_THREAD_GMAIL_THREAD_MISMATCH");
  }
  if (
    original.outerRawMimeSha256 === amendment.outerRawMimeSha256 ||
    original.originalEmlSha256 === amendment.originalEmlSha256
  ) throw new Error("EXACT_THREAD_SOURCES_MUST_DIFFER");
  if (
    original.parsed.senderEmail.toLowerCase() !==
      amendment.parsed.senderEmail.toLowerCase() ||
    original.parsed.senderDomain.toLowerCase() !==
      amendment.parsed.senderDomain.toLowerCase()
  ) throw new Error("EXACT_THREAD_EXTERNAL_SENDER_MISMATCH");
}

export function createExactThreadAssociationService(
  deps: Readonly<{
    sources: ExactThreadSourcePort;
    persistence: ExactThreadAssociationPersistence;
  }>,
) {
  return Object.freeze({
    async associate(
      request: ExactThreadAssociationRequest,
      signal?: AbortSignal,
    ): Promise<
      Readonly<{ caseId: string; eventId: string; replayed: boolean }>
    > {
      requireUuid(
        request.organizationId,
        "INVALID_THREAD_ASSOCIATION_ORGANIZATION_ID",
      );
      requireUuid(
        request.priorJobId,
        "INVALID_THREAD_ASSOCIATION_PRIOR_JOB_ID",
      );
      requireUuid(
        request.targetCaseId,
        "INVALID_THREAD_ASSOCIATION_TARGET_CASE_ID",
      );
      requireKey(request.deliveryIdempotencyKey);
      validateExpectation(request.original, "ORIGINAL");
      validateExpectation(request.amendment, "AMENDMENT");
      if (
        request.original.gmailMessageId === request.amendment.gmailMessageId
      ) {
        throw new Error("EXACT_THREAD_MESSAGES_MUST_DIFFER");
      }

      const original = await deps.sources.resolve(request.original, signal);
      validateResolved(request.original, original, "ORIGINAL");
      const amendment = await deps.sources.resolve(request.amendment, signal);
      validateResolved(request.amendment, amendment, "AMENDMENT");
      validatePair(original, amendment);

      return await deps.persistence.createReviewedThread({
        organizationId: request.organizationId,
        targetCaseId: request.targetCaseId,
        priorJobId: request.priorJobId,
        deliveryIdempotencyKey: request.deliveryIdempotencyKey,
        original: { source: original.source, parsed: original.parsed },
        amendment: { source: amendment.source, parsed: amendment.parsed },
      }, signal);
    },
  });
}
