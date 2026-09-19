import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { preparePackageSetReview } from "./package-set-review.ts";
import {
  createPostgresRequestSemanticGate,
  lockConsequentialGatesForScopeExceptions,
  manifestScopeExceptions,
} from "./request-semantic-gate.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const manifestSha256 = "a".repeat(64);

Deno.test("MVP deferrals keep only the internal Operations gate available", () => {
  const scopeExceptions = manifestScopeExceptions([{
    decisionId: "missing:1",
    fieldId: "insurance_indicator",
    outcome: "deferred_mvp",
    resolution:
      "Certificate of Insurance remains pending; internal MVP review only and release stays locked.",
    evidenceIds: ["file:85955a14-5622-4257-943b-6b23826e0552"],
  }]);
  const matrix = lockConsequentialGatesForScopeExceptions({
    schemaVersion: 1,
    manifestSha256,
    assessedAt: "2026-09-19T18:00:00.000Z",
    totalRequired: 1,
    satisfiedRequired: 1,
    blockingCount: 0,
    items: [{
      requirementId: "form:vendor-application",
      kind: "form",
      canonicalKey: "form.vendor_application",
      label: "Vendor application",
      status: "satisfied",
      blocking: false,
      reason: "Reviewed evidence satisfies the request contract.",
      evidenceIds: ["review:11111111-1111-4111-8111-111111111111"],
    }],
    gates: {
      operationsReview: false,
      signatureApproval: true,
      outboundDraft: true,
      outboundFreeze: true,
      salesAuthorization: true,
      send: true,
    },
  }, scopeExceptions);
  assertEquals(matrix.scopeExceptions, scopeExceptions);
  assertEquals(matrix.gates, {
    operationsReview: true,
    signatureApproval: false,
    outboundDraft: false,
    outboundFreeze: false,
    salesAuthorization: false,
    send: false,
  });
});

for (const method of ["electrónica", "autógrafa"] as const) {
  for (const fullCompletion of [false, true]) {
    for (
      const proof of [
        "current",
        "legacy",
        "other_bytes",
        "fractional",
        "wrong_type",
      ] as const
    ) {
      Deno.test(`PDF gate: ${method}; full completion ${fullCompletion}; structure ${proof}`, async () => {
        const statements: string[] = [];
        const query = (strings: TemplateStringsArray) => {
          const statement = strings.join("?");
          statements.push(statement);
          if (
            statement.startsWith("set local role") ||
            statement.includes("set_config('osp.organization_id'") ||
            statement.includes("set local statement_timeout")
          ) return [];
          if (statement.includes("request_manifest_decision_reviews")) {
            return [{
              current_review_resolved: true,
              decisions_json: [],
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
                    `Formato Información 3.3 con firma ${method}, compartir en formato PDF y llenar las dos páginas${
                      fullCompletion ? " al 100%" : ""
                    }`,
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
          if (
            statement.includes("from osp_private.document_versions version")
          ) {
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
          if (
            statement.includes("from osp_private.supplier_package_sets package")
          ) {
            return [];
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
                outputSha256: proof === "other_bytes"
                  ? "d".repeat(64)
                  : "c".repeat(64),
                contentType: proof === "wrong_type"
                  ? "image/png"
                  : "application/pdf",
                ...(proof === "legacy" ? {} : {
                  pdfStructure: {
                    schemaVersion: 1,
                    outputSha256: "c".repeat(64),
                    pageCount: proof === "fractional" ? 2.5 : 2,
                  },
                }),
                formCoverage: { visiblePageCount: 2, completionPercent: 100 },
              },
              signature_verified: true,
            }];
          }
          throw new Error(`Unexpected SQL: ${statement}`);
        };
        const sql = ((strings: TemplateStringsArray) =>
          Promise.resolve(query(strings))) as SqlPort;
        sql.begin = async <T>(
          operation: (transaction: SqlPort) => Promise<T>,
        ) =>
          await operation(sql);
        const gate = createPostgresRequestSemanticGate({
          databaseUrl: "postgresql://example.invalid/test",
          postgresFactory: () => sql,
          now: () => new Date("2026-09-02T12:00:00.000Z"),
        });
        const matrix = await gate.load({ organizationId, caseId });
        const digitalAccepted = method === "electrónica" && !fullCompletion &&
          proof === "current";
        assertEquals(matrix.satisfiedRequired, digitalAccepted ? 2 : 1);
        assertEquals(matrix.blockingCount, digitalAccepted ? 0 : 1);
        assertEquals(matrix.gates.send, digitalAccepted);
        assertEquals(matrix.gates.salesAuthorization, digitalAccepted);
        assertEquals(matrix.gates.outboundFreeze, digitalAccepted);
        if (digitalAccepted) {
          assertEquals(
            await gate.requiredOutboundAttachments?.({
              organizationId,
              caseId,
            }),
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
        } else {
          assertEquals(
            matrix.items[0].status,
            fullCompletion || proof !== "current"
              ? "incomplete"
              : "signature_missing",
          );
        }
        const packageStatement = statements.find((statement) =>
          statement.includes("from osp_private.generated_packages value")
        ) ?? "";
        assertStringIncludes(packageStatement, "value.artifact_receipt_json");
        assertEquals(
          packageStatement.includes("source.artifact_receipt_json"),
          false,
        );
        assertStringIncludes(
          packageStatement,
          "signature_application_receipts",
        );
        assertStringIncludes(packageStatement, "receipt.outcome = 'applied'");
      });
    }
  }
}

for (
  const mutation of [
    "exact",
    "completion",
    "request",
    "operation",
    "source",
    "appendix",
    "policy",
  ] as const
) {
  Deno.test(`persisted package-set identity gates downstream: ${mutation}`, async () => {
    const sourceVersionId = "33333333-3333-4333-8333-333333333333";
    const setId = "44444444-4444-4444-8444-444444444444";
    const snapshotId = "55555555-5555-4555-8555-555555555555";
    const reviewId = "66666666-6666-4666-8666-666666666666";
    const snapshotSha256 = "b".repeat(64);
    const sourceSha256 = "c".repeat(64);
    const outputSha256 = "d".repeat(64);
    const requestSha256 = "e".repeat(64);
    const manifest = {
      schemaVersion: 1,
      organizationId,
      caseId,
      setId,
      snapshotId,
      snapshotSha256,
      version: 1,
      planSha256: "9".repeat(64),
      members: [{
        requirementId: `file:${sourceVersionId}`,
        objectId: `${organizationId}:${caseId}:${setId}:${sourceVersionId}`,
        artifact: {
          sourceVersionId,
          sourceSha256,
          packageSnapshotId: snapshotId,
          packageSnapshotSha256: snapshotSha256,
          outputSha256,
          version: 1,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          mappings: [{
            kind: "xlsx_cell",
            mappingDecisionId: "77777777-7777-4777-8777-777777777777",
            canonicalFieldId: "legal_name",
            target: "Company!B2",
          }],
        },
      }],
    };
    if (mutation === "appendix") {
      manifest.members[0].artifact.mappings[0].kind = "pdf_appendix";
    }
    const setManifestSha256 = await sha256Hex(
      new TextEncoder().encode(canonicalPackageSetJson(manifest)),
    );
    const receipt = { ...manifest, manifestSha256: setManifestSha256 };
    const persistedReview = {
      id: reviewId,
      source_version_id: sourceVersionId,
      set_manifest_sha256: setManifestSha256,
      request_manifest_sha256: mutation === "request"
        ? "f".repeat(64)
        : requestSha256,
      output_sha256: outputSha256,
      status: "approved",
      full_output_inspected: true,
      completion_percent: mutation === "completion" ? 99 : 100,
      page_count: null,
      signature_requirement: mutation === "policy" ? "image" : "none",
      signature_policy_version: mutation === "policy" ? 2 : null,
      source_status: "approved",
      source_sha256: mutation === "source" ? "f".repeat(64) : sourceSha256,
    };
    const cleanBasis = await preparePackageSetReview({
      receipt: mutation === "appendix"
        ? {
          ...receipt,
          members: [{
            ...receipt.members[0],
            artifact: {
              ...receipt.members[0].artifact,
              mappings: [{
                ...receipt.members[0].artifact.mappings[0],
                kind: "xlsx_cell",
              }],
            },
          }],
          manifestSha256: await sha256Hex(new TextEncoder().encode(
            canonicalPackageSetJson({
              ...manifest,
              members: [{
                ...manifest.members[0],
                artifact: {
                  ...manifest.members[0].artifact,
                  mappings: [{
                    ...manifest.members[0].artifact.mappings[0],
                    kind: "xlsx_cell",
                  }],
                },
              }],
            }),
          )),
        }
        : receipt,
      organizationId,
      caseId,
      caseVersion: 7,
      snapshotSha256,
      requestManifestSha256: requestSha256,
      expectedSetManifestSha256: mutation === "appendix"
        ? await sha256Hex(new TextEncoder().encode(canonicalPackageSetJson({
          ...manifest,
          members: [{
            ...manifest.members[0],
            artifact: {
              ...manifest.members[0].artifact,
              mappings: [{
                ...manifest.members[0].artifact.mappings[0],
                kind: "xlsx_cell",
              }],
            },
          }],
        })))
        : setManifestSha256,
      reviews: [{
        sourceVersionId,
        sourceSha256,
        outputSha256,
        requirementId: `file:${sourceVersionId}`,
        reviewDecisionId: reviewId,
        status: "approved",
        completenessVerified: true,
        completionPercent: 100,
        pageCount: null,
        signatureRequirement: "none",
        signaturePolicyVersion: null,
      }],
    });
    const sql = ((strings: TemplateStringsArray) => {
      const statement = strings.join("?");
      if (
        statement.trim().startsWith("set local") ||
        statement.includes("set_config('osp.organization_id'")
      ) return Promise.resolve([]);
      if (statement.includes("request_manifest_decision_reviews")) {
        return Promise.resolve([{
          current_review_resolved: true,
          decisions_json: [],
          manifest_sha256: requestSha256,
          manifest_json: {
            requestType: "customer_setup",
            targetXbfEntity: "XBFMX",
            forms: [{
              name: "Supplier original",
              format: "xlsx",
              action: "fill",
              required: true,
              evidenceIds: [`file:${sourceVersionId}`],
            }],
            requirements: [{ text: "Complete the supplier original 100%" }],
          },
        }]);
      }
      if (statement.includes("from osp_private.outbound_drafts draft")) {
        return Promise.resolve([{
          attachments_json: [{
            bucketId: "osp-derived-documents",
            objectId: sourceVersionId,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sha256: outputSha256,
          }],
        }]);
      }
      if (statement.includes("from osp_private.document_versions version")) {
        return Promise.resolve([]);
      }
      if (
        statement.includes("from osp_private.supplier_package_sets package")
      ) {
        return Promise.resolve([{
          id: setId,
          receipt_json: receipt,
          manifest_sha256: setManifestSha256,
          input_snapshot_sha256: snapshotSha256,
          snapshot_case_version: 7,
        }]);
      }
      if (
        statement.includes("from osp_private.package_set_member_reviews review")
      ) {
        return Promise.resolve([persistedReview]);
      }
      if (
        statement.includes(
          "from osp_private.package_set_operations_reviews review",
        )
      ) {
        return Promise.resolve([{
          package_set_id: setId,
          review_sha256: mutation === "operation"
            ? "f".repeat(64)
            : cleanBasis.reviewSha256,
          basis_json: cleanBasis,
        }]);
      }
      throw new Error(`Unexpected SQL: ${statement}`);
    }) as SqlPort;
    sql.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(sql);
    const gate = createPostgresRequestSemanticGate({
      databaseUrl: "postgresql://example.invalid/test",
      postgresFactory: () => sql,
      now: () => new Date("2026-09-12T12:00:00.000Z"),
    });
    const matrix = await gate.load({ organizationId, caseId });
    assertEquals(matrix.gates.salesAuthorization, mutation === "exact");
    assertEquals(matrix.gates.send, mutation === "exact");
    assertEquals(
      matrix.gates.operationsReview,
      mutation === "exact" || mutation === "operation",
    );
    if (mutation === "exact") {
      assertEquals(matrix.satisfiedRequired, 1);
      assertEquals(matrix.packageReviewIdentity?.setId, setId);
      assertEquals(
        matrix.packageReviewIdentity?.members[0].completionMethod,
        "xlsx_cells",
      );
      assertEquals(
        matrix.packageReviewIdentity?.members[0].sourceSha256,
        sourceSha256,
      );
      assertEquals(
        matrix.packageReviewIdentity?.members[0].outputSha256,
        outputSha256,
      );
    }
  });
}
