import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260901201000_osp_automatic_preparation_candidate_permission.sql",
    import.meta.url,
  ),
);

Deno.test("automatic preparation may read only the tenant-scoped XBF candidate loader", () => {
  assertMatch(
    sql,
    /grant execute on function\s+osp_private\.load_xbf_customer_setup_candidates_for_case\(uuid, uuid\)\s+to osp_workflow_api/i,
  );
  assertNotMatch(sql, /\b(?:insert|update|delete|send|webhook)\b/i);
  assertNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)\b/i);
});
