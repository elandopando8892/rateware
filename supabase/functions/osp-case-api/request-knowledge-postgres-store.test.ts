import { assertEquals, assertFalse } from "jsr:@std/assert@1.0.14";

import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresClarificationStore } from "./postgres-store.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const manifestId = "44444444-4444-4444-8444-444444444444";
const promotionId = "55555555-5555-4555-8555-555555555555";
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
