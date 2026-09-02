import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresRequestSemanticGate } from "./request-semantic-gate.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const manifestSha256 = "a".repeat(64);

Deno.test("Postgres semantic source binds reviewed request, current documents, source coverage and applied signature receipt", async () => {
  const statements: string[] = [];
  const sql = (async (strings: TemplateStringsArray) => {
    const statement = strings.join("?");
    statements.push(statement);
    if (
      statement.startsWith("set local role") ||
      statement.includes("set_config('osp.organization_id'") ||
      statement.includes("set local statement_timeout")
    ) return [];
    if (statement.includes("request_manifest_decision_reviews")) {
      return [{
        manifest_sha256: manifestSha256,
        manifest_json: {
          requestType: "customer_setup",
          targetXbfEntity: "XBFMX",
          forms: [{
            name: "Formato Información 3.3",
            format: "xlsm",
            action: "sign",
            required: true,
            evidenceIds: ["email:salzillo"],
          }],
          requestedDocuments: [{
            documentType: "Constancia de situación fiscal",
            required: true,
            acceptableAlternatives: [],
            evidenceIds: ["email:salzillo"],
          }],
          requirements: [{
            text:
              "Formato Información 3.3 con firma autógrafa, compartir en formato PDF y llenar las dos páginas al 100%",
          }, {
            text:
              "Constancia de situación fiscal con antigüedad máxima de un mes",
          }],
        },
      }];
    }
    if (statement.includes("from osp_private.outbound_drafts draft")) {
      return [{
        attachments_json: [{
          bucketId: "osp-derived-documents",
          objectId: "55555555-5555-4555-8555-555555555555",
          name: "XBF-signed-supplier-package.pdf",
          contentType: "application/pdf",
          sha256: "c".repeat(64),
        }, {
          bucketId: "osp-corporate-documents",
          objectId: "33333333-3333-4333-8333-333333333333",
          name: "XBF-tax-status-certificate.pdf",
          contentType: "application/pdf",
          sha256: "b".repeat(64),
        }],
      }];
    }
    if (statement.includes("from osp_private.document_versions version")) {
      return [{
        id: "33333333-3333-4333-8333-333333333333",
        document_type: "tax_status_certificate",
        status: "approved",
        bucket_id: "osp-corporate-documents",
        source_sha256: "b".repeat(64),
        content_type: "application/pdf",
        valid_from: "2026-08-20",
        expires_at: null,
        page_count: null,
      }];
    }
    if (statement.includes("from osp_private.generated_packages value")) {
      return [{
        id: "44444444-4444-4444-8444-444444444444",
        package_kind: "supplier_completed",
        content_type: "application/vnd.ms-excel.sheet.macroEnabled.12",
        output_sha256: "d".repeat(64),
        artifact_receipt_json: {
          formCoverage: { visiblePageCount: 2, completionPercent: 100 },
        },
        signature_verified: false,
      }, {
        id: "55555555-5555-4555-8555-555555555555",
        package_kind: "signed",
        content_type: "application/pdf",
        output_sha256: "c".repeat(64),
        artifact_receipt_json: {
          formCoverage: { visiblePageCount: 2, completionPercent: 100 },
        },
        signature_verified: true,
      }];
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }) as SqlPort;
  sql.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(sql);
  const gate = createPostgresRequestSemanticGate({
    databaseUrl: "postgresql://example.invalid/test",
    postgresFactory: () => sql,
    now: () => new Date("2026-09-02T12:00:00.000Z"),
  });
  const matrix = await gate.load({ organizationId, caseId });
  assertEquals(matrix.satisfiedRequired, 2);
  assertEquals(matrix.blockingCount, 0);
  assertEquals(matrix.gates.send, true);
  assertEquals(
    await gate.requiredOutboundAttachments?.({ organizationId, caseId }),
    [{
      bucketId: "osp-derived-documents",
      objectId: "55555555-5555-4555-8555-555555555555",
      name: "XBF-signed-supplier-package.pdf",
      contentType: "application/pdf",
      sha256: "c".repeat(64),
    }, {
      bucketId: "osp-corporate-documents",
      objectId: "33333333-3333-4333-8333-333333333333",
      name: "XBF-tax-status-certificate.pdf",
      contentType: "application/pdf",
      sha256: "b".repeat(64),
    }],
  );
  const packageStatement =
    statements.find((statement) =>
      statement.includes("from osp_private.generated_packages value")
    ) ?? "";
  assertStringIncludes(packageStatement, "source.artifact_receipt_json");
  assertStringIncludes(packageStatement, "signature_application_receipts");
  assertStringIncludes(packageStatement, "receipt.outcome = 'applied'");
});
