import { assertEquals } from "jsr:@std/assert@1.0.14";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { createRequestManifestJobService } from "./request-manifest-job.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";

for (const includeOriginal of [false, true]) {
  Deno.test(`manifest job preserves original email: ${includeOriginal}`, async () => {
    const bytes = new TextEncoder().encode("synthetic-docx");
    const recorded: unknown[] = [];
    const service = createRequestManifestJobService({
      source: {
        load: async () => ({
          organizationId,
          caseId,
          previousMessages: includeOriginal
            ? [{
              id: "55555555-5555-4555-8555-555555555555",
              sourceSha256: "b".repeat(64),
              subject: "Original request",
              safeBody:
                "Complete QF-147, QF-050, QF-248, QF-168, QF-169, QF-154 and attach RFC and fiscal certificate.",
            }]
            : [],
          message: {
            id: messageId,
            sourceSha256: "a".repeat(64),
            subject: "Supplier setup",
            safeBody: "Replace QF-168 with QF-167; other requirements remain.",
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
        interpretWithTelemetry: async ({ attachments, evidence }) => {
          assertEquals(evidence.length, includeOriginal ? 2 : 1);
          assertEquals(evidence.at(-1)?.id, `email:${messageId}`);
          if (includeOriginal) {
            assertEquals(
              evidence[0].id,
              "email:55555555-5555-4555-8555-555555555555",
            );
            assertEquals(evidence[0].content.includes("QF-050"), true);
            assertEquals(
              evidence[0].content.includes("fiscal certificate"),
              true,
            );
          }
          assertEquals(attachments?.map(({ kind }) => kind), ["docx_file"]);
          return {
            manifest: {
              schemaVersion: 1,
              requestType: "customer_setup",
              language: "en",
              targetXbfEntity: "unknown",
              requesterLegalName: {
                value: null,
                confidence: 0,
                evidenceIds: [],
              },
              dueDate: { value: null, confidence: 0, evidenceIds: [] },
              forms: [],
              requestedFields: [],
              requestedDocuments: [],
              signature: {
                required: false,
                signerTitle: null,
                evidenceIds: [],
              },
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
    assertEquals(result.sourceCoverage.email, includeOriginal ? 2 : 1);
    assertEquals(result.externalEffects, false);
    assertEquals(recorded.length, 1);
  });
}
