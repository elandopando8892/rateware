import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
} from "jsr:@std/assert@1.0.14";

import { createOpenAiRequestManifest } from "./openai-request-manifest.ts";
import type { RequestManifest } from "./openai-request-manifest.ts";

const baseUrl = `${["https", ""].join(":")}//api.openai.com`;
const evidence = [
  {
    id: "email:body",
    kind: "email_text" as const,
    sourceName: "request.eml",
    content:
      "Please complete the attached supplier form for XBFREIGHT SYSTEMS LLC by September 8.",
  },
  {
    id: "xlsx:Sheet1:A8",
    kind: "xlsx_cell" as const,
    sourceName: "supplier-form.xlsx",
    content: "W-9 required",
  },
  {
    id: "docx:p3",
    kind: "docx_block" as const,
    sourceName: "instructions.docx",
    content: "Authorized signature required",
  },
];

const validManifest = {
  schemaVersion: 1,
  requestType: "customer_setup",
  language: "en",
  targetXbfEntity: "XBFUS",
  requesterLegalName: { value: null, confidence: 0, evidenceIds: [] },
  dueDate: {
    value: "2026-09-08",
    confidence: 0.93,
    evidenceIds: ["email:body"],
  },
  forms: [{
    name: "supplier-form.xlsx",
    format: "xlsx",
    action: "complete",
    required: true,
    evidenceIds: ["email:body"],
  }],
  requestedFields: [{
    id: "tax_form",
    sourceLabel: "W-9",
    canonicalFieldId: null,
    valueType: "text",
    required: true,
    evidenceIds: ["xlsx:Sheet1:A8"],
  }],
  requestedDocuments: [{
    documentType: "W-9",
    required: true,
    acceptableAlternatives: [],
    evidenceIds: ["xlsx:Sheet1:A8"],
  }],
  signature: { required: true, signerTitle: null, evidenceIds: ["docx:p3"] },
  submission: {
    method: "reply_email",
    recipients: [],
    instructions: null,
    evidenceIds: ["email:body"],
  },
  requirements: [{
    id: "complete_form",
    text: "Complete the attached supplier form",
    evidenceIds: ["email:body"],
  }],
  contradictions: [],
  missingInformation: [{
    fieldId: "requester.legalName",
    description: "The requesting carrier legal name is not explicit.",
    evidenceIds: [],
  }],
  clarificationQuestions: [{
    fieldId: "requester.legalName",
    question: "Confirm the requesting carrier legal name.",
    evidenceIds: [],
  }],
  readiness: {
    status: "needs_clarification",
    reasonCodes: ["requester_name_missing"],
  },
} as const satisfies RequestManifest;

function completed(output: unknown = validManifest) {
  return {
    id: "resp_synthetic",
    model: "gpt-synthetic-2026-08-01",
    status: "completed",
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(output) }],
    }],
  };
}

Deno.test("request manifest uses strict stored-off Responses output for email, XLSX and DOCX evidence", async () => {
  let captured:
    | { url: URL; init: RequestInit; body: Record<string, unknown> }
    | undefined;
  const adapter = createOpenAiRequestManifest({
    baseUrl,
    apiKey: "synthetic-key",
    model: "gpt-synthetic",
    request: async (input, init) => {
      captured = {
        url: new URL(String(input)),
        init: init ?? {},
        body: JSON.parse(String(init?.body)),
      };
      return Response.json(completed());
    },
  });

  const interpreted = await adapter.interpretWithTelemetry({ evidence });
  assertEquals(interpreted.manifest, validManifest);
  assertEquals(
    {
      responseId: interpreted.telemetry.responseId,
      model: interpreted.telemetry.model,
      inputTokens: interpreted.telemetry.inputTokens,
      outputTokens: interpreted.telemetry.outputTokens,
      totalTokens: interpreted.telemetry.totalTokens,
    },
    {
      responseId: "resp_synthetic",
      model: "gpt-synthetic-2026-08-01",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
  );
  assert(captured);
  assertEquals(captured.url.pathname, "/v1/responses");
  assertEquals(captured.init.method, "POST");
  assertEquals(captured.body.store, false);
  assertEquals(captured.body.tools, []);
  assertEquals(captured.body.max_output_tokens, 6_000);
  assertEquals(
    (captured.body.text as { format: { strict: boolean; name: string } }).format
      .strict,
    true,
  );
  assertEquals(
    (captured.body.text as { format: { name: string } }).format.name,
    "osp_request_manifest",
  );
  assertMatch(JSON.stringify(captured.body.input), /untrusted data/i);
});

Deno.test("request manifest closes citations and enforces bounded evidence", async () => {
  const adapter = (output: unknown) =>
    createOpenAiRequestManifest({
      baseUrl,
      apiKey: "synthetic-key",
      model: "gpt-synthetic",
      request: async () => Response.json(completed(output)),
    });

  await assertRejects(
    () =>
      adapter({
        ...validManifest,
        dueDate: { ...validManifest.dueDate, evidenceIds: ["unknown"] },
      }).interpret({ evidence }),
    Error,
    "OPENAI_EVIDENCE_CLOSURE",
  );
  await assertRejects(
    () =>
      adapter({
        ...validManifest,
        forms: [{ ...validManifest.forms[0], evidenceIds: [] }],
      }).interpret({ evidence }),
    Error,
    "OPENAI_EVIDENCE_REQUIRED",
  );
  await assertRejects(
    () =>
      adapter(validManifest).interpret({
        evidence: [{ ...evidence[0], content: "x".repeat(40_001) }],
      }),
    Error,
    "OPENAI_MANIFEST_INVALID",
  );
});
