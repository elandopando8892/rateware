import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createPostgresRequestManifestSource } from "./postgres-request-manifest-source.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";

function factory(contentType = "application/pdf", includeKnowledge = true) {
  const sql = Object.assign(async (parts: TemplateStringsArray) => {
    const query = parts.join("?");
    if (
      query.startsWith("set local") || query.startsWith("select set_config")
    ) return [];
    if (query.includes("customer_registration_cases")) return [{ id: caseId }];
    if (query.includes("gmail_messages")) {
      return [{
        id: messageId,
        source_sha256: "a".repeat(64),
        subject: "Supplier setup",
        safe_body: "Please complete the attached forms.",
      }];
    }
    if (query.includes("document_versions")) {
      return [{
        id: documentId,
        source_sha256: "b".repeat(64),
        bucket_id: "osp-corporate-documents",
        opaque_object_key: `${organizationId}/${documentId}`,
        content_type: contentType,
        source_safety: "safe",
      }];
    }
    if (query.includes("request_knowledge_catalog_entries")) {
      return includeKnowledge
        ? [{
          knowledge_kind: "field",
          canonical_key: "business.trade.references",
          display_label: "Trade references",
          aliases_json: ["Trade references", "Commercial references"],
          value_type: "table",
        }]
        : [];
    }
    return [];
  }, {
    begin: async <T>(operation: (tx: typeof sql) => Promise<T>) =>
      await operation(sql),
  });
  return () => sql;
}

Deno.test("request manifest source loads the latest safe supported evidence", async () => {
  const source = createPostgresRequestManifestSource({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: factory(),
  });
  const loaded = await source.load({ organizationId, caseId });
  assertEquals(loaded.message.id, messageId);
  assertEquals(loaded.documents[0].contentType, "application/pdf");
  assertEquals(
    loaded.documents[0].sourceName,
    `supplier-requirement-${documentId}.pdf`,
  );
  assertEquals(loaded.knowledgeCatalog, [{
    kind: "field",
    canonicalKey: "business.trade.references",
    displayLabel: "Trade references",
    aliases: ["Trade references", "Commercial references"],
    valueType: "table",
  }]);
});

Deno.test("request manifest source fails closed for unsupported evidence", async () => {
  const source = createPostgresRequestManifestSource({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: factory("image/tiff"),
  });
  await assertRejects(
    () => source.load({ organizationId, caseId }),
    Error,
    "REQUEST_MANIFEST_CONTENT_TYPE_UNSUPPORTED",
  );
});
