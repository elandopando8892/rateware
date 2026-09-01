import ExcelJS from "exceljs";
import {
  assertEquals,
  assertMatch,
  assertRejects,
} from "jsr:@std/assert@1.0.14";

import type { RequestManifest } from "./openai-request-manifest.ts";
import { createRequestManifestShadowService } from "./request-manifest-shadow.ts";
import type { RequestManifestShadowConfiguration } from "./request-manifest-shadow-config.ts";

const configuration: RequestManifestShadowConfiguration = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  gmailMessageId: "33333333-3333-4333-8333-333333333333",
  gmailSourceSha256: "a".repeat(64),
  documentVersionId: "44444444-4444-4444-8444-444444444444",
  documentSourceSha256: "b".repeat(64),
  openAiApiKey: "secret",
  openAiModel: "gpt-model",
};

const manifest = {
  schemaVersion: 1,
  requestType: "customer_setup",
  language: "en",
  targetXbfEntity: "XBFUS",
  requesterLegalName: { value: null, confidence: 0, evidenceIds: [] },
  dueDate: { value: null, confidence: 0, evidenceIds: [] },
  forms: [],
  requestedFields: [],
  requestedDocuments: [],
  signature: { required: false, signerTitle: null, evidenceIds: [] },
  submission: {
    method: "unknown",
    recipients: [],
    instructions: null,
    evidenceIds: [],
  },
  requirements: [],
  contradictions: [],
  missingInformation: [],
  clarificationQuestions: [],
  readiness: { status: "ready_for_prefill", reasonCodes: [] },
} as const satisfies RequestManifest;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function syntheticRequestWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registration");
  sheet.getCell("A1").value = "Legal business name";
  sheet.getCell("A2").value = "Federal Tax ID";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

Deno.test("manifest shadow reads exact evidence once and never persists", async () => {
  const bytes = await syntheticRequestWorkbook();
  const exactConfiguration = Object.freeze({
    ...configuration,
    documentSourceSha256: await sha256(bytes),
  });
  let captured: readonly { id: string; content: string }[] = [];
  const service = createRequestManifestShadowService({
    configuration: exactConfiguration,
    source: {
      load: async () => ({
        organizationId: exactConfiguration.organizationId,
        caseId: exactConfiguration.caseId,
        message: {
          id: exactConfiguration.gmailMessageId,
          sourceSha256: exactConfiguration.gmailSourceSha256,
          subject: "Supplier registration",
          safeBody: "Please complete the attached form.",
        },
        document: {
          versionId: exactConfiguration.documentVersionId,
          sourceSha256: exactConfiguration.documentSourceSha256,
          bucketId: "osp-corporate-documents",
          objectKey: "request.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      }),
    },
    storage: { download: async () => bytes },
    interpreter: {
      interpretWithTelemetry: async ({ evidence }) => {
        captured = evidence;
        return {
          manifest,
          telemetry: {
            responseId: "resp_test",
            model: "gpt-model",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            durationMs: 25,
          },
        };
      },
    },
  });
  const request = {
    organizationId: exactConfiguration.organizationId,
    caseId: exactConfiguration.caseId,
    gmailMessageId: exactConfiguration.gmailMessageId,
    gmailSourceSha256: exactConfiguration.gmailSourceSha256,
    documentVersionId: exactConfiguration.documentVersionId,
    documentSourceSha256: exactConfiguration.documentSourceSha256,
  };
  const result = await service.run(request);
  assertEquals(result.manifest.requestType, "customer_setup");
  assertEquals(result.evidence.kinds, { emailText: 1, xlsxRows: 2 });
  assertMatch(captured[0].content, /Please complete/);
  assertMatch(captured[1].content, /Legal business name/);
  await assertRejects(() => service.run(request), Error, "SHADOW_NOT_ALLOWED");
});
