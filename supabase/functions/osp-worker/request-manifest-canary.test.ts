import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import type { RequestManifest } from "./openai-request-manifest.ts";
import { createRequestManifestCanaryService } from "./request-manifest-canary.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const bytes = new TextEncoder().encode("synthetic pdf");

async function hash(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

const manifest = {
  schemaVersion: 1,
  requestType: "customer_setup",
  language: "en",
  targetXbfEntity: "XBFUS",
  requesterLegalName: {
    value: "Synthetic carrier",
    confidence: 0.9,
    evidenceIds: [`file:${documentId}`],
  },
  dueDate: { value: null, confidence: 0, evidenceIds: [] },
  forms: [],
  requestedFields: [],
  requestedDocuments: [],
  signature: { required: false, signerTitle: null, evidenceIds: [] },
  submission: {
    method: "reply_email",
    recipients: [],
    instructions: null,
    evidenceIds: [`email:${messageId}`],
  },
  requirements: [],
  contradictions: [],
  missingInformation: [],
  clarificationQuestions: [],
  readiness: { status: "ready_for_prefill", reasonCodes: [] },
} as const satisfies RequestManifest;

Deno.test("exact multimodal canary downloads evidence and persists only one review draft", async () => {
  let recorded = 0;
  const service = createRequestManifestCanaryService({
    configuration: {
      organizationId,
      caseId,
      openAiApiKey: "secret",
      openAiModel: "gpt-5-mini",
    },
    source: {
      load: async () => ({
        organizationId,
        caseId,
        message: {
          id: messageId,
          sourceSha256: "a".repeat(64),
          subject: "Supplier setup",
          safeBody: "",
        },
        documents: [{
          versionId: documentId,
          sourceName: "request.pdf",
          sourceSha256: await hash(bytes),
          sourceSafety: "safe",
          bucketId: "osp-corporate-documents",
          objectKey: `${organizationId}/${documentId}`,
          contentType: "application/pdf",
        }],
      }),
    },
    storage: { download: async () => bytes },
    interpreter: {
      interpretWithTelemetry: async () => ({
        manifest,
        telemetry: {
          model: "gpt-5-mini",
          responseId: "resp_synthetic",
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          durationMs: 10,
        },
      }),
    },
    store: {
      findByEvidence: async () => null,
      record: async (input) => {
        recorded += 1;
        assertEquals(input.manifest.externalEffects, false);
        return {
          id: "55555555-5555-4555-8555-555555555555",
          version: 1,
          manifestSha256: input.manifestSha256,
          replayed: false,
        };
      },
    },
    clock: () => new Date("2026-09-01T04:00:00.000Z"),
  });
  const result = await service.run({ organizationId, caseId });
  assertEquals(result.status, "review_required");
  assertEquals(result.externalEffects, false);
  assertEquals(result.sourceCoverage, {
    email: 1,
    xlsx: 0,
    xlsm: 0,
    pdf: 1,
    docx: 0,
    image: 0,
  });
  assertEquals(recorded, 1);
  await assertRejects(
    () => service.run({ organizationId, caseId }),
    Error,
    "CANARY_NOT_ALLOWED",
  );
});

Deno.test("multimodal canary rejects a case outside the exact allowlist before loading", async () => {
  let loaded = false;
  const service = createRequestManifestCanaryService({
    configuration: {
      organizationId,
      caseId,
      openAiApiKey: "secret",
      openAiModel: "gpt-5-mini",
    },
    source: {
      load: async () => {
        loaded = true;
        throw new Error("MUST_NOT_LOAD");
      },
    },
    storage: { download: async () => null },
    interpreter: {
      interpretWithTelemetry: async () => {
        throw new Error("MUST_NOT_CALL");
      },
    },
    store: {
      findByEvidence: async () => {
        throw new Error("MUST_NOT_LOOKUP");
      },
      record: async () => {
        throw new Error("MUST_NOT_STORE");
      },
    },
  });
  await assertRejects(
    () =>
      service.run({
        organizationId,
        caseId: "99999999-9999-4999-8999-999999999999",
      }),
    Error,
    "CANARY_NOT_ALLOWED",
  );
  assertEquals(loaded, false);
});
