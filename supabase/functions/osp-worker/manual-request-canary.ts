import type { BackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import type { OriginalObjectStore } from "../_shared/osp/original-object-store.ts";
import type { AttachmentPromotionService } from "./attachment-promotion.ts";
import {
  createIntakeService,
  type IntakePersistence,
} from "./intake-service.ts";
import type { ManualRequestCanaryConfiguration } from "./manual-request-canary-config.ts";
import {
  assertStrictDocxPackage,
  assertStrictPdfPackage,
} from "./strict-document-package-scanner.ts";

const PDF = "application/pdf";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MESSAGE_ID = "osp-canary-crane-cww-qf-147-v1";
const THREAD_ID = "osp-canary-crane-cww-qf-147-thread-v1";
const DELIVERY_KEY = "manual-canary:crane:cww-qf-147:v1";
const RECEIVED_AT = "2026-09-01T12:00:00.000Z";
const BOUNDARY = "osp-crane-cww-qf-147-v1";

export type ManualRequestCanaryInput = Readonly<{
  organizationId: string;
  pdfSha256: string;
  docxSha256: string;
  pdfBytes: Uint8Array;
  docxBytes: Uint8Array;
}>;

type ManifestService = Readonly<{
  analyze(input: {
    organizationId: string;
    caseId: string;
    correlationId: string;
  }): Promise<unknown>;
}>;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function base64Lines(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join("")).match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function buildManualRequestCanaryMime(
  pdfBytes: Uint8Array,
  docxBytes: Uint8Array,
): Uint8Array {
  const parts = [
    "From: sales@heymarksman.com",
    "To: carriers@xbfreight.com",
    "Cc: onboarding@crane-canary.test",
    "Date: Tue, 01 Sep 2026 12:00:00 +0000",
    "Message-ID: <osp-canary-crane-cww-qf-147-v1@heymarksman.com>",
    "Subject: Crane vendor application CWW-QF-147 | controlled OSP canary",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${BOUNDARY}"`,
    "",
    `--${BOUNDARY}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    "Controlled internal OSP canary for an adaptable customer setup request. No reply or external action is authorized.",
    `--${BOUNDARY}`,
    `Content-Type: ${PDF}; name="CWW-QF-147 Vendor Application Form.pdf"`,
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="CWW-QF-147 Vendor Application Form.pdf"',
    "",
    base64Lines(pdfBytes),
    `--${BOUNDARY}`,
    `Content-Type: ${DOCX}; name="CWW-QF-147 Vendor Application Form.docx"`,
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="CWW-QF-147 Vendor Application Form.docx"',
    "",
    base64Lines(docxBytes),
    `--${BOUNDARY}--`,
    "",
  ];
  return new TextEncoder().encode(parts.join("\r\n"));
}

export function createManualRequestCanaryService(deps: {
  configuration: ManualRequestCanaryConfiguration;
  objects: OriginalObjectStore;
  persistence: IntakePersistence;
  promotions: AttachmentPromotionService;
  manifests: ManifestService;
}) {
  return Object.freeze({
    async run(input: ManualRequestCanaryInput) {
      const allowed = deps.configuration;
      if (
        input.organizationId !== allowed.organizationId ||
        input.pdfSha256 !== allowed.pdfSha256 ||
        input.docxSha256 !== allowed.docxSha256 ||
        input.pdfBytes.byteLength < 1 ||
        input.pdfBytes.byteLength > 10 * 1024 * 1024 ||
        input.docxBytes.byteLength < 1 ||
        input.docxBytes.byteLength > 10 * 1024 * 1024 ||
        await sha256(input.pdfBytes) !== input.pdfSha256 ||
        await sha256(input.docxBytes) !== input.docxSha256
      ) throw new Error("INVALID_INPUT");
      await assertStrictPdfPackage(input.pdfBytes);
      await assertStrictDocxPackage(input.docxBytes);
      const rawMime = buildManualRequestCanaryMime(
        input.pdfBytes,
        input.docxBytes,
      );
      const ignoredJobs: Pick<BackgroundJobStore, "enqueue"> = {
        enqueue: () => Promise.resolve(crypto.randomUUID()),
      };
      const intake = createIntakeService({
        gmail: {
          async getMessage(messageId) {
            if (messageId !== MESSAGE_ID) throw new Error("INVALID_INPUT");
            return {
              gmailMessageId: MESSAGE_ID,
              gmailThreadId: THREAD_ID,
              rawMime: rawMime.slice(),
              receivedAt: RECEIVED_AT,
            };
          },
        },
        objects: deps.objects,
        persistence: deps.persistence,
        jobs: ignoredJobs,
      });
      const intakeResult = await intake.ingest({
        organizationId: input.organizationId,
        gmailMessageId: MESSAGE_ID,
        deliveryIdempotencyKey: DELIVERY_KEY,
      });
      if (
        intakeResult.outcome !== "created" &&
        intakeResult.outcome !== "attached"
      ) throw new Error("CANARY_NOT_READY");
      const correlationId = crypto.randomUUID();
      const promoted = await deps.promotions.promoteCase({
        organizationId: input.organizationId,
        caseId: intakeResult.caseId,
        correlationId,
      });
      if (promoted.length !== 2) throw new Error("CANARY_NOT_READY");
      const manifest = await deps.manifests.analyze({
        organizationId: input.organizationId,
        caseId: intakeResult.caseId,
        correlationId,
      });
      return Object.freeze({
        caseId: intakeResult.caseId,
        outcome: intakeResult.outcome,
        promotedDocumentVersionIds: Object.freeze(
          promoted.map(({ documentVersionId }) => documentVersionId).sort(),
        ),
        sourceSha256s: Object.freeze([
          input.pdfSha256,
          input.docxSha256,
        ].sort()),
        manifest,
        externalEffects: false as const,
      });
    },
  });
}
