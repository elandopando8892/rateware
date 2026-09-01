import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresRequestManifestDraftStore } from "./postgres-request-manifest-draft-store.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const manifestSha256 = "a".repeat(64);
const evidenceSha256 = "b".repeat(64);

function draft() {
  return {
    organizationId,
    caseId,
    manifestSha256,
    evidenceSha256,
    manifest: {
      schemaVersion: 1 as const,
      status: "review_required" as const,
      modelVersion: "gpt-synthetic",
      sourceCount: 1,
      sourceCoverage: { email: 1, xlsx: 0, pdf: 0, docx: 0, image: 0 },
      generatedAt: "2026-09-01T03:00:00.000Z",
      requestType: "customer_setup" as const,
      language: "en" as const,
      targetXbfEntity: "unknown" as const,
      requesterLegalName: null,
      dueDate: null,
      forms: [],
      requestedFields: [],
      requestedDocuments: [],
      signature: { required: false, signerTitle: null, evidenceIds: [] },
      submission: {
        method: "unknown" as const,
        recipients: [],
        instructions: null,
        evidenceIds: [],
      },
      requirements: [],
      contradictions: [],
      missingInformation: [],
      clarificationQuestions: [],
      readiness: {
        status: "needs_clarification" as const,
        reasonCodes: ["request_incomplete"],
      },
      aiGenerated: true as const,
      externalEffects: false as const,
    },
    telemetry: {
      responseId: "resp_synthetic",
      model: "gpt-synthetic",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      durationMs: 40,
    },
  };
}

Deno.test("Postgres request manifest store appends a tenant-scoped review draft without case mutation", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const id = "33333333-3333-4333-8333-333333333333";
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      if (/set local role|set_config|pg_advisory_xact_lock/i.test(text)) {
        return [];
      }
      if (/select id, version, manifest_sha256/i.test(text)) return [];
      if (/select coalesce\(max\(version\)/i.test(text)) {
        return [{ next_version: 1 }];
      }
      if (/insert into osp_private\.request_manifest_drafts/i.test(text)) {
        return [{ id, version: 1, manifest_sha256: manifestSha256 }];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    },
    {
      begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
        await operation(sql as SqlPort),
    },
  ) as SqlPort;
  const store = createPostgresRequestManifestDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  assertEquals(await store.record(draft()), {
    id,
    version: 1,
    manifestSha256,
    replayed: false,
  });
  assertMatch(calls[0].text, /set local role osp_worker/i);
  assertMatch(
    calls.find(({ text }) => /pg_advisory_xact_lock/i.test(text))?.text ?? "",
    /json_build_array\(\?::text, 'request_manifest_draft', \?::text\)/i,
  );
  assertEquals(
    calls.some(({ text }) => /\b(?:update|delete)\b/i.test(text)),
    false,
  );
  assertEquals(
    calls.some(({ text }) =>
      /customer_registration_cases|case_events|background_jobs|outbound/i.test(
        text,
      )
    ),
    false,
  );
});

Deno.test("Postgres request manifest store replays the exact evidence fingerprint without a second insert", async () => {
  let inserts = 0;
  const id = "33333333-3333-4333-8333-333333333333";
  const sql = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (/set local role|set_config|pg_advisory_xact_lock/i.test(text)) {
      return [];
    }
    if (/select id, version, manifest_sha256/i.test(text)) {
      return [{ id, version: 4, manifest_sha256: manifestSha256 }];
    }
    if (/insert/i.test(text)) inserts += 1;
    return [];
  }, {
    begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
      await operation(sql as SqlPort),
  }) as SqlPort;
  const store = createPostgresRequestManifestDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  assertEquals(await store.record(draft()), {
    id,
    version: 4,
    manifestSha256,
    replayed: true,
  });
  assertEquals(inserts, 0);
});

Deno.test("Postgres request manifest store returns an existing draft during the pre-provider lookup", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const sql = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (/set local role|set_config/i.test(text)) return [];
    if (/select id, version, manifest_json/i.test(text)) {
      const input = draft();
      return [{
        id,
        version: 4,
        manifest_json: input.manifest,
        manifest_sha256: manifestSha256,
        model_version: input.telemetry.model,
        provider_response_id: input.telemetry.responseId,
        input_tokens: input.telemetry.inputTokens,
        output_tokens: input.telemetry.outputTokens,
        total_tokens: input.telemetry.totalTokens,
        duration_ms: input.telemetry.durationMs,
      }];
    }
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
      await operation(sql as SqlPort),
  }) as SqlPort;
  const store = createPostgresRequestManifestDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  const existing = await store.findByEvidence({
    organizationId,
    caseId,
    evidenceSha256,
  });
  assertEquals(existing?.receipt, {
    id,
    version: 4,
    manifestSha256,
    replayed: true,
  });
  assertEquals(existing?.telemetry.totalTokens, 30);
  assertEquals(existing?.manifest.externalEffects, false);
});
