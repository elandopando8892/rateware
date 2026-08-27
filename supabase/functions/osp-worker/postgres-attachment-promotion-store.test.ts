import { assertEquals } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresAttachmentPromotionStore } from "./postgres-attachment-promotion-store.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const sourceSha256 = "a".repeat(64);

function queryText(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
}

Deno.test("attachment registration serializes without a row lock that requires update privilege", async () => {
  const calls: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = queryText(strings);
      calls.push(text);
      if (text.startsWith("set local role") || text.includes("set_config(")) {
        return [];
      }
      if (text.startsWith("select attachment.id")) {
        return [{
          id: attachmentId,
          organization_id: organizationId,
          case_id: caseId,
          opaque_object_key:
            `${organizationId}/44444444-4444-4444-8444-444444444444`,
          source_sha256: sourceSha256,
          content_type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }];
      }
      if (
        text.startsWith(
          "select version.id from osp_private.form_template_versions",
        )
      ) {
        return [];
      }
      if (text.includes("pg_advisory_xact_lock")) return [];
      if (text.startsWith("select version.id as document_version_id")) {
        return [];
      }
      if (
        text.startsWith("insert into osp_private.documents") ||
        text.startsWith("insert into osp_private.document_versions") ||
        text.startsWith("insert into osp_private.source_safety_assessments")
      ) return [];
      if (
        text.startsWith(
          "select id, status from osp_private.mark_document_review_required_command",
        )
      ) {
        return [{ id: attachmentId, status: "review_required" }];
      }
      if (text.startsWith("update osp_private.documents")) {
        return [{ version: 1 }];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}:${values.length}`);
    },
    {
      begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
        await operation(sql as SqlPort),
    },
  ) as SqlPort;
  const store = createPostgresAttachmentPromotionStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });

  await store.register({
    id: attachmentId,
    organizationId,
    caseId,
    sourceObjectKey: `${organizationId}/44444444-4444-4444-8444-444444444444`,
    sourceSha256,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    corporateObjectKey: `${organizationId}/${attachmentId}`,
    sourceSafetyReason: "strict_xlsx_package_policy",
  });

  assertEquals(
    calls.some((text) => text.includes("pg_advisory_xact_lock")),
    true,
  );
  const existingLookup = calls.find((text) =>
    text.startsWith("select version.id as document_version_id")
  );
  assertEquals(existingLookup?.includes("for share"), false);
});
