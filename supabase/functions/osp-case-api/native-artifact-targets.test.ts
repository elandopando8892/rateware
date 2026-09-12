import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.14";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import type { VerifiedApprovalIdentity } from "../_shared/osp/workflow-authority.ts";
import {
  createNativeArtifactTargetsStore,
  parseNativeTargetReviewRows,
  validateNativeTargetSet,
} from "./native-artifact-targets.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (character: string) => character.repeat(64);
const identity: VerifiedApprovalIdentity = {
  identity: {
    organization: id(1),
    issuer: "https://auth.example.test",
    subject: "ops-user",
    email: "ops@xbfreight.com",
    emailVerified: true,
    authorizedParty: "client",
  },
  permissions: ["osp:operate"],
  authorizationSessionId: "verified-session",
  authorizationSessionIssuedAt: "2026-09-12T12:00:00.000Z",
};
const input = {
  caseId: id(2),
  mappingId: id(3),
  expectedMappingVersion: 2,
  expectedMappingSha256: sha("a"),
  expectedSourceVersionId: id(4),
  expectedSourceSha256: sha("b"),
  idempotencyKey: "native-targets-1",
  targets: [{
    kind: "acroform" as const,
    canonicalFieldId: "company.name",
    fieldName: "legal_name",
  }],
};

Deno.test("native target validation permits only exact complete native destinations", () => {
  assertEquals(
    validateNativeTargetSet("application/pdf", input.targets),
    input.targets,
  );
  assertEquals(
    validateNativeTargetSet(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      [{
        kind: "content_control",
        canonicalFieldId: "company.name",
        targetTag: "company.name",
      }],
      ["company.name"],
    ).length,
    1,
  );
  assertThrows(
    () =>
      validateNativeTargetSet("application/pdf", [{
        ...input.targets[0],
        kind: "appendix",
      }]),
    Error,
    "ARTIFACT_TARGET_INVALID",
  );
  assertThrows(
    () =>
      validateNativeTargetSet("application/pdf", input.targets, [
        "company.name",
        "company.tax_id",
      ]),
    Error,
    "ARTIFACT_TARGET_COVERAGE_INVALID",
  );
});

Deno.test("read model reports ready, stale, ambiguous and persisted without values", () => {
  const row = {
    case_state: "operations_review",
    ref_mapping_id: id(3),
    ref_mapping_version: 2,
    ref_mapping_sha256: sha("a"),
    mapping_id: id(3),
    mapping_version: 2,
    mapping_sha256: sha("a"),
    mapping_before_sha256: sha("c"),
    mapping_status: "accepted",
    mapping_decision_id: id(5),
    decision_valid: true,
    candidate_count: 1,
    source_version_id: id(4),
    source_sha256: sha("b"),
    source_status: "approved",
    extraction_status: "reviewed",
    content_type: "application/pdf",
    source_bucket_id: "originals",
    source_object_key: "opaque",
    fields: [{
      canonicalFieldId: "company.name",
      label: "Legal name",
      target: input.targets[0],
    }],
  };
  assertEquals(parseNativeTargetReviewRows([row]).map((item) => item.state), [
    "ready",
  ]);
  assertEquals(
    parseNativeTargetReviewRows([{ ...row, decision_valid: false }])[0].state,
    "stale",
  );
  assertEquals(
    parseNativeTargetReviewRows([{ ...row, candidate_count: 2 }])[0].state,
    "ambiguous",
  );
  assertEquals(
    parseNativeTargetReviewRows([{
      ...row,
      case_state: "preparing",
      mapping_id: id(6),
      mapping_version: 3,
      mapping_before_sha256: sha("a"),
      mapping_sha256: sha("d"),
      candidate_count: 2,
    }])[0].state,
    "persisted",
  );
});

function sqlPort(replay = false) {
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const query = strings.join("?");
    calls.push(query);
    if (query.includes("select version.content_type")) {
      return Promise.resolve([{ content_type: "application/pdf" }]);
    }
    if (
      query.includes(
        "from osp_private.supplier_form_mappings mapping join osp_private.review_decisions",
      )
    ) {
      return Promise.resolve(replay
        ? [{
          mapping_id: id(6),
          mapping_version: 3,
          mapping_sha256: sha("d"),
          mapping_review_decision_id: id(7),
          case_state: "preparing",
          case_version: 9,
        }]
        : []);
    }
    if (query.includes("record_reviewed_native_artifact_targets_command")) {
      return Promise.resolve([{
        mapping_id: id(6),
        mapping_version: 3,
        mapping_sha256: sha("d"),
        mapping_review_decision_id: id(7),
        case_state: "preparing",
        case_version: 9,
      }]);
    }
    return Promise.resolve([]);
  }) as SqlPort;
  sql.begin = async (operation) => await operation(sql);
  return { sql, calls };
}

Deno.test("store preflights exact identity and invokes one authoritative SQL command", async () => {
  const fake = sqlPort();
  const receipt = await createNativeArtifactTargetsStore({ sql: fake.sql })
    .record(input, identity);
  assertEquals(receipt.replayed, false);
  assertEquals(
    fake.calls.filter((query) =>
      query.includes("record_reviewed_native_artifact_targets_command")
    ).length,
    1,
  );
  assertEquals(
    fake.calls.some((query) => query.includes("pg_advisory_xact_lock")),
    true,
  );
});

Deno.test("store reconciles an exact successor without invoking SQL again", async () => {
  const fake = sqlPort(true);
  const receipt = await createNativeArtifactTargetsStore({ sql: fake.sql })
    .record(input, identity);
  assertEquals(receipt.replayed, true);
  assertEquals(
    fake.calls.some((query) =>
      query.includes("record_reviewed_native_artifact_targets_command")
    ),
    false,
  );
  await assertRejects(
    () =>
      createNativeArtifactTargetsStore({ sql: fake.sql }).record({
        ...input,
        expectedSourceSha256: "bad",
      }, identity),
    Error,
    "INVALID_INPUT",
  );
});
