import { deepStrictEqual as assertEquals, rejects } from "node:assert/strict";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresRequestSemanticGate } from "./request-semantic-gate.ts";

// Contract-to-adapter boundary: existing receipts do not contain a verified
// form requirement binding. Never manufacture it from order or MIME type.
Deno.test("legacy packages cannot satisfy multiple forms by position or format", async () => {
  const formats = [
    ["Registration", "pdf", "application/pdf"],
    [
      "Questionnaire",
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "References",
      "xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ["Annex", "xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
  ];
  const packages = formats.map(([, , content_type], index) => ({
    id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    package_kind: "supplier_completed",
    content_type,
    output_sha256: "b".repeat(64),
    signature_verified: false,
    artifact_receipt_json: { formCoverage: { completionPercent: 100 } },
  }));
  const query = (strings: TemplateStringsArray) => {
    const statement = strings.join("?").trim();
    if (
      statement.startsWith("set local") ||
      statement.startsWith("select set_config")
    ) return [];
    if (statement.includes("from osp_private.request_manifest_drafts")) {
      return [{
        manifest_sha256: "a".repeat(64),
        current_review_resolved: true,
        manifest_json: {
          requestType: "customer_setup",
          targetXbfEntity: "XBFUS",
          forms: formats.map(([name, format]) => ({
            name,
            format,
            action: "complete",
            required: true,
            evidenceIds: ["email:mixed"],
          })),
          requestedDocuments: [],
          requirements: [],
        },
      }];
    }
    if (statement.includes("from osp_private.outbound_drafts")) {
      return [{
        attachments_json: packages.map((item) => ({
          bucketId: "osp-derived-documents",
          objectId: item.id,
          name: `Form-${item.id}`,
          contentType: item.content_type,
          sha256: item.output_sha256,
        })),
      }];
    }
    if (statement.includes("from osp_private.document_versions")) return [];
    if (statement.includes("from osp_private.generated_packages")) {
      return packages;
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  };
  const sql =
    ((strings: TemplateStringsArray) =>
      Promise.resolve(query(strings))) as SqlPort;
  sql.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(sql);
  const gate = createPostgresRequestSemanticGate({
    databaseUrl: "postgresql://synthetic.invalid/test",
    postgresFactory: () => sql,
    now: () => new Date("2026-09-07T12:00:00Z"),
  });
  const input = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
  };
  const matrix = await gate.load(input);
  assertEquals(matrix.totalRequired, 4);
  assertEquals(matrix.satisfiedRequired, 0);
  assertEquals(matrix.items.map((item) => item.status), [
    "missing",
    "missing",
    "missing",
    "missing",
  ]);
  assertEquals(Object.values(matrix.gates), [
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  await rejects(
    () => gate.requiredOutboundAttachments!(input),
    { message: "REQUEST_FULFILLMENT_BLOCKED" },
  );
});
