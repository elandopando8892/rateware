import { assertEquals, assertFalse } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresClarificationStore } from "./postgres-store.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const manifestId = "44444444-4444-4444-8444-444444444444";
const promotionId = "55555555-5555-4555-8555-555555555555";
const sourceCaseId = "66666666-6666-4666-8666-666666666666";
const digest = "a".repeat(64);

function fakeSql() {
  const statements: string[] = [];
  const sql = (async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const statement = strings.join("?");
    statements.push(statement);
    if (
      statement.startsWith("set local role") ||
      statement.includes("set_config('osp.organization_id'")
    ) return [];
    if (
      statement.includes(
        "from osp_private.request_manifest_decision_reviews review",
      )
    ) {
      return [{
        review_id: reviewId,
        review_version: 2,
        manifest_id: manifestId,
      }];
    }
    if (statement.includes("from osp_private.request_knowledge_candidates(")) {
      return [{
        knowledge_kind: "field",
        canonical_key: "business.trade.references",
        display_label: "Trade references",
        aliases_json: ["Trade references", "References"],
        value_type: "table",
        required: true,
        evidence_count: 2,
        catalog_state: "new",
        catalog_match: "none",
        reuse_eligibility: "eligible",
        eligibility_reason: "stable_canonical_field",
        target_canonical_key: "business.trade.references",
        target_display_label: "Trade references",
        matched_canonical_key: null,
        matched_display_label: null,
        catalog_version: null,
        source_case_id: null,
      }, {
        knowledge_kind: "document",
        canonical_key: "w.9",
        display_label: "W-9",
        aliases_json: ["W-9"],
        value_type: null,
        required: true,
        evidence_count: 1,
        catalog_state: "known",
        catalog_match: "alias",
        reuse_eligibility: "eligible",
        eligibility_reason: "approved_catalog_match",
        target_canonical_key: "w9.form",
        target_display_label: "IRS Form W-9",
        matched_canonical_key: "w9.form",
        matched_display_label: "IRS Form W-9",
        catalog_version: 2,
        source_case_id: sourceCaseId,
      }, {
        knowledge_kind: "document",
        canonical_key: "bank.reference",
        display_label: "Bank reference",
        aliases_json: ["Bank reference"],
        value_type: null,
        required: false,
        evidence_count: 1,
        catalog_state: "new",
        catalog_match: "ambiguous",
        reuse_eligibility: "review_required",
        eligibility_reason: "ambiguous_catalog_match",
        target_canonical_key: null,
        target_display_label: null,
        matched_canonical_key: null,
        matched_display_label: null,
        catalog_version: null,
        source_case_id: null,
      }];
    }
    if (statement.includes("request_knowledge_candidate_sha256(")) {
      return [{
        candidate_sha256: digest,
        catalog_entry_count: 4,
        prior_promotion_count: 1,
      }];
    }
    if (statement.includes("promote_request_knowledge_command(")) {
      return [{
        promotion_id: promotionId,
        promotion_status: "applied",
        promoted_count: 1,
        unchanged_count: 0,
        replayed: false,
      }];
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }) as SqlPort;
  sql.begin = async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
    await operation(sql);
  return { sql, statements };
}

Deno.test("request knowledge store reads semantic candidates without external effects", async () => {
  const fake = fakeSql();
  const store = createPostgresClarificationStore({
    databaseUrl: "postgresql://example.invalid/test",
    postgresFactory: () => fake.sql,
  });
  const result = await store.getRequestKnowledgeWorkspace({
    organizationId,
    caseId,
  });
  assertEquals(result, {
    caseId,
    manifestId,
    reviewId,
    reviewVersion: 2,
    candidateSha256: digest,
    candidates: [{
      kind: "field",
      canonicalKey: "business.trade.references",
      displayLabel: "Trade references",
      aliases: ["Trade references", "References"],
      valueType: "table",
      required: true,
      evidenceCount: 2,
      catalogState: "new",
      catalogMatch: "none",
      reuseEligibility: "eligible",
      eligibilityReason: "stable_canonical_field",
      targetCanonicalKey: "business.trade.references",
      targetDisplayLabel: "Trade references",
      matchedCanonicalKey: null,
      matchedDisplayLabel: null,
      catalogVersion: null,
      sourceCaseId: null,
    }, {
      kind: "document",
      canonicalKey: "w.9",
      displayLabel: "W-9",
      aliases: ["W-9"],
      valueType: null,
      required: true,
      evidenceCount: 1,
      catalogState: "known",
      catalogMatch: "alias",
      reuseEligibility: "eligible",
      eligibilityReason: "approved_catalog_match",
      targetCanonicalKey: "w9.form",
      targetDisplayLabel: "IRS Form W-9",
      matchedCanonicalKey: "w9.form",
      matchedDisplayLabel: "IRS Form W-9",
      catalogVersion: 2,
      sourceCaseId,
    }, {
      kind: "document",
      canonicalKey: "bank.reference",
      displayLabel: "Bank reference",
      aliases: ["Bank reference"],
      valueType: null,
      required: false,
      evidenceCount: 1,
      catalogState: "new",
      catalogMatch: "ambiguous",
      reuseEligibility: "review_required",
      eligibilityReason: "ambiguous_catalog_match",
      targetCanonicalKey: null,
      targetDisplayLabel: null,
      matchedCanonicalKey: null,
      matchedDisplayLabel: null,
      catalogVersion: null,
      sourceCaseId: null,
    }],
    catalogEntryCount: 4,
    priorPromotionCount: 1,
    externalEffects: false,
  });
  assertFalse(
    fake.statements.some((statement) =>
      /gmail|webhook|signature|outbound/i.test(statement)
    ),
  );
  assertEquals(
    fake.statements.some((statement) =>
      statement.includes("jsonb_array_elements_text(entry.aliases_json)") &&
      statement.includes("alias_entry.match_count")
    ),
    true,
  );
});

Deno.test("request knowledge store promotes an exact reviewed selection idempotently", async () => {
  const fake = fakeSql();
  const store = createPostgresClarificationStore({
    databaseUrl: "postgresql://example.invalid/test",
    postgresFactory: () => fake.sql,
  });
  const result = await store.promoteRequestKnowledge({
    organizationId,
    subject: "sales@heymarksman.com",
    permission: "osp:superuser",
    caseId,
    reviewId,
    expectedCandidateSha256: digest,
    selectedKeys: ["field:business.trade.references"],
    idempotencyKey: "knowledge:review-2",
  });
  assertEquals(result, {
    promotionId,
    promotionStatus: "applied",
    promotedCount: 1,
    unchangedCount: 0,
    replayed: false,
    externalEffects: false,
  });
  assertEquals(
    fake.statements.filter((statement) =>
      statement.includes("promote_request_knowledge_command(")
    ).length,
    1,
  );
  assertFalse(
    fake.statements.some((statement) =>
      /gmail|webhook|signature|outbound/i.test(statement)
    ),
  );
});
