import { assertEquals } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresManagedExtractionStore } from "./postgres-managed-extraction-store.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const documentVersionId = "33333333-3333-4333-8333-333333333333";
const extractionId = "44444444-4444-4444-8444-444444444444";
const sourceSha256 = "a".repeat(64);

function queryText(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
}

Deno.test("managed extraction persists under a read-only document grant", async () => {
  const calls: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = queryText(strings);
      calls.push(text);
      if (text.startsWith("set local role") || text.includes("set_config(")) {
        return [];
      }
      if (text.includes("pg_advisory_xact_lock")) return [];
      if (text.startsWith("select version.source_sha256")) {
        return [{
          source_sha256: sourceSha256,
          case_id: caseId,
          source_safety: "safe",
        }];
      }
      if (text.startsWith("select id, input_sha256")) return [];
      if (text.startsWith("insert into osp_private.document_extractions")) {
        return [];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}:${values.length}`);
    },
    {
      begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
        await operation(sql as SqlPort),
    },
  ) as SqlPort;
  const store = createPostgresManagedExtractionStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });

  assertEquals(
    await store.persist({
      source: {
        organizationId,
        caseId,
        documentVersionId,
        bucketId: "osp-corporate-documents",
        objectKey: `${organizationId}/${documentVersionId}`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceSha256,
        sourceSafety: "safe",
        templateVersionId: null,
        existingExtractionId: null,
      },
      snapshot: {
        id: extractionId,
        organizationId,
        caseId,
        sourceVersionId: documentVersionId,
        inputSha256: sourceSha256,
        promptSha256: "b".repeat(64),
        schemaSha256: "c".repeat(64),
        fields: [],
        status: "review_required",
      },
    }),
    extractionId,
  );

  assertEquals(
    calls.some((text) => text.includes("pg_advisory_xact_lock")),
    true,
  );
  assertEquals(calls.some((text) => text.includes("for share")), false);
});
