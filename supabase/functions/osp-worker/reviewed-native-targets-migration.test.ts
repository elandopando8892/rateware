import { assert, assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260912190000_osp_reviewed_native_artifact_targets.sql",
    import.meta.url,
  ),
);

Deno.test("native targets create a new reviewed mapping bound to the exact original", () => {
  assertMatch(sql, /record_reviewed_native_artifact_targets_command/);
  assertMatch(sql, /p_expected_source_version_id uuid/);
  assertMatch(sql, /p_expected_source_sha256 text/);
  assertMatch(sql, /version[.]id = p_expected_source_version_id/);
  assertMatch(sql, /version[.]source_sha256 = p_expected_source_sha256/);
  assertMatch(sql, /'artifactTargetSource'/);
  assertMatch(sql, /assert_approval_actor\(/);
  assertMatch(sql, /'complete_operations_review'/);
  assertMatch(sql, /insert into osp_private[.]supplier_form_mappings/);
  assertMatch(sql, /insert into osp_private[.]review_decisions/);
  assert(!sql.includes("outbound_enabled = true"));
});

Deno.test("native target contract permits only PDF placement or DOCX content controls", () => {
  assertMatch(sql, /target->>'kind' = 'acroform'/);
  assertMatch(sql, /target->>'kind' = 'overlay'/);
  assertMatch(sql, /target->>'kind' = 'content_control'/);
  assert(!sql.includes("target->>'kind' = 'appendix'"));
  assertMatch(sql, /ARTIFACT_TARGET_COVERAGE_INVALID/);
  assertMatch(sql, /count\(distinct target->>'canonicalFieldId'\)/);
});
