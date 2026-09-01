import { assertEquals } from "jsr:@std/assert@1.0.14";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { createRequestManifestJobService } from "./request-manifest-job.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";

Deno.test("normal manifest job downloads safe DOCX evidence and persists a review-only draft", async () => {
  const bytes = new TextEncoder().encode("synthetic-docx");
  const recorded: unknown[] = [];
  const service = createRequestManifestJobService({
    source: {
      load: async () => ({
        organizationId,
        caseId,
        message: {
          id: messageId,
          sourceSha256: "a".repeat(64),
          subject: "Supplier setup",
          safeBody: "Please complete the attached form.",
        },
        documents: [{
          versionId,
          sourceName: "supplier-requirement.docx",
          sourceSha256: await sha256Hex(bytes),
          sourceSafety: "safe",
          bucketId: "osp-corporate-documents",
          objectKey: `${organizationId}/${versionId}`,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }],
      }),
    },
    storage: { download: async () => bytes },
    interpreter: {
      interpretWithTelemetry: async ({ attachments }) => {
        assertEquals(attachments?.map(({ kind }) => kind), ["docx_file"]);
        return {
          manifest: {
            schemaVersion: 1,
            requestType: "customer_setup",
            language: "en",
            targetXbfEntity: "unknown",
            requesterLegalName: { value: null, confidence: 0, evidenceIds: [] },
            dueDate: { value: null, confidence: 0, evidenceIds: [] },
            forms: [],
            requestedFields: [],
            requestedDocuments: [],
            signature: { required: false, signerTitle: null, evidenceIds: [] },
            submission: {
              method: "reply_email",
              recipients: [],
              instructions: null,
              evidenceIds: [],
            },
            requirements: [],
            contradictions: [],
            missingInformation: [],
            clarificationQuestions: [],
            readiness: { status: "ready_for_prefill", reasonCodes: [] },
          },
          telemetry: {
            model: "gpt-test",
            responseId: "resp_test",
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
          },
        };
      },
    },
    store: {
      findByEvidence: async () => null,
      record: async (input) => {
        recorded.push(input);
        return {
          id: crypto.randomUUID(),
          version: 1,
          manifestSha256: input.manifestSha256,
          replayed: false,
        };
      },
    },
    clock: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  const result = await service.analyze({
    organizationId,
    caseId,
    correlationId: "job-1",
  });
  assertEquals(result.sourceCoverage.docx, 1);
  assertEquals(result.externalEffects, false);
  assertEquals(recorded.length, 1);
});
