import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createPostgresRequestManifestShadowSource } from "./postgres-request-manifest-shadow.ts";
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

function factory(sourceSafety = "safe") {
  const sql = Object.assign(
    async (parts: TemplateStringsArray) => {
      const query = parts.join("?");
      if (
        query.startsWith("set local") || query.startsWith("select set_config")
      ) return [];
      if (query.includes("customer_registration_cases")) {
        return [{ id: configuration.caseId }];
      }
      if (query.includes("gmail_messages")) {
        return [{
          id: configuration.gmailMessageId,
          source_sha256: configuration.gmailSourceSha256,
          subject: "Supplier setup request",
          safe_body: "Please complete the attached workbook.",
        }];
      }
      if (query.includes("document_versions")) {
        return [{
          id: configuration.documentVersionId,
          source_sha256: configuration.documentSourceSha256,
          bucket_id: "osp-corporate-documents",
          opaque_object_key: "cases/request.xlsx",
          content_type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          source_safety: sourceSafety,
        }];
      }
      return [];
    },
    {
      begin: async <T>(operation: (tx: typeof sql) => Promise<T>) =>
        await operation(sql),
    },
  );
  return () => sql;
}

Deno.test("manifest shadow source performs an exact read-only load", async () => {
  const store = createPostgresRequestManifestShadowSource({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: factory(),
  });
  const loaded = await store.load(configuration);
  assertEquals(loaded.message.subject, "Supplier setup request");
  assertEquals(loaded.document.objectKey, "cases/request.xlsx");
});

Deno.test("manifest shadow source rejects unsafe evidence", async () => {
  const store = createPostgresRequestManifestShadowSource({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: factory("pending"),
  });
  await assertRejects(
    () => store.load(configuration),
    Error,
    "SHADOW_SOURCE_MISMATCH",
  );
});
