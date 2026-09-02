import { assert, assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902023000_osp_reviewed_spreadsheet_artifact_targets.sql",
    import.meta.url,
  ),
);
const reasonSql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260902024500_osp_reviewed_targets_reason_code.sql",
    import.meta.url,
  ),
);

Deno.test("reviewed spreadsheet targets create a new immutable mapping and reopen preparation", () => {
  assertMatch(sql, /record_reviewed_spreadsheet_targets_command/);
  assertMatch(sql, /insert into osp_private[.]supplier_form_mappings/);
  assertMatch(sql, /ARTIFACT_TARGETS_CONFIRMED/);
  assertMatch(reasonSql, /ARTIFACT_TARGETS_CONFIRMED/);
  assertMatch(sql, /spreadsheet_artifact_targets_confirmed/);
  assertMatch(sql, /application\/vnd[.]ms-excel[.]sheet[.]macroEnabled[.]12/);
  assert(!sql.includes("outbound_enabled = true"));
});

Deno.test("reviewed spreadsheet targets validate complete unique cell coverage", () => {
  assertMatch(sql, /ARTIFACT_TARGET_COVERAGE_INVALID/);
  assertMatch(sql, /count\(distinct target->>'canonicalFieldId'\)/);
  assertMatch(
    sql,
    /count\(distinct \(target->>'sheet'\) \|\| '!' \|\| \(target->>'cell'\)\)/,
  );
});
