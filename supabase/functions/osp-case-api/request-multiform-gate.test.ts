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
        decisions_json: [],
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
    if (statement.includes("from osp_private.supplier_package_sets package")) {
      return [];
    }
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

for (
  const scenario of [
    "exact",
    "unverified",
    "ambiguous",
    "other_bytes",
    "uncited",
    "coverage",
  ] as const
) {
  Deno.test(`multiple forms use verified source identity: ${scenario}`, async () => {
    const sources = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const packages = sources.map((source, i) => ({
      id: i === 0
        ? "55555555-5555-4555-8555-555555555555"
        : "66666666-6666-4666-8666-666666666666",
      package_kind: "supplier_completed",
      content_type: "application/pdf",
      output_sha256: (i === 0 ? "a" : "b").repeat(64),
      source_binding_verified: scenario !== "unverified",
      signature_verified: false,
      artifact_receipt_json: {
        sourceVersionId: source,
        outputSha256: (scenario === "other_bytes" ? "c" : i === 0 ? "a" : "b")
          .repeat(64),
        contentType: "application/pdf",
        formCoverage: { completionPercent: 100 },
      },
    })).reverse(); // Order and MIME cannot determine identity.
    const sql = ((strings: TemplateStringsArray) => {
      const statement = strings.join("?");
      if (statement.includes("from osp_private.request_manifest_drafts")) {
        return Promise.resolve([{
          manifest_sha256: "d".repeat(64),
          current_review_resolved: true,
          decisions_json: [],
          manifest_json: {
            requestType: "customer_setup",
            targetXbfEntity: "XBFUS",
            forms: sources.map((id, i) => ({
              name: `Form ${i}`,
              format: "pdf",
              action: "complete",
              required: true,
              evidenceIds: scenario === "uncited"
                ? ["email:only"]
                : scenario === "ambiguous"
                ? sources.map((id) => `file:${id}`)
                : [i === 0 ? `file:${id}` : `xlsx:${id}:Sheet:1`],
            })),
            requestedDocuments: [],
            requirements: scenario === "coverage"
              ? [{ text: "Complete all forms at 100%." }]
              : [],
          },
        }]);
      }
      if (statement.includes("from osp_private.generated_packages value")) {
        return Promise.resolve(packages);
      }
      if (statement.includes("from osp_private.outbound_drafts")) {
        return Promise.resolve([{
          attachments_json: packages.map((p) => ({
            bucketId: "osp-derived-documents",
            objectId: p.id,
            contentType: p.content_type,
            sha256: p.output_sha256,
          })),
        }]);
      }
      if (
        statement.includes("from osp_private.document_versions version") ||
        statement.includes("from osp_private.supplier_package_sets package") ||
        statement.trim().startsWith("set local") ||
        statement.includes("set_config")
      ) return Promise.resolve([]);
      throw new Error(`Unexpected SQL: ${statement}`);
    }) as SqlPort;
    sql.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(sql);
    const gate = createPostgresRequestSemanticGate({
      databaseUrl: "postgresql://synthetic.invalid/test",
      postgresFactory: () => sql,
    });
    const matrix = await gate.load({
      organizationId: "11111111-1111-4111-8111-111111111111",
      caseId: "22222222-2222-4222-8222-222222222222",
    });
    assertEquals(matrix.satisfiedRequired, scenario === "exact" ? 2 : 0);
    assertEquals(matrix.gates.send, scenario === "exact");
    if (scenario === "exact") {
      assertEquals(matrix.items.map((i) => i.evidenceIds), [[
        "package:55555555-5555-4555-8555-555555555555",
      ], ["package:66666666-6666-4666-8666-666666666666"]]);
    }
    if (scenario === "coverage") {
      assertEquals(matrix.items.map((i) => i.status), [
        "incomplete",
        "incomplete",
      ]);
    }
  });
}
