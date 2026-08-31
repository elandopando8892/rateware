import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260831133838_osp_sales_superuser_approval_policy.sql",
  import.meta.url,
);

Deno.test("Sales superuser approval migration mirrors the fail-closed application policy", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(
    sql,
    /create or replace function osp_private\.assert_approval_actor\(/,
  );
  assertMatch(
    sql,
    /is_superuser := p_actor_email = 'sales@heymarksman\.com' and 'osp:superuser' = any\(p_permissions\)/,
  );
  assertMatch(
    sql,
    /when is_superuser then interval '30 minutes' else interval '5 minutes'/,
  );
  assertMatch(
    sql,
    /where permission = any\(array\[ 'osp:operate', 'osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized', 'osp:superuser' \]\)/,
  );
  assertMatch(sql, /p_actor_role <> expected_role or consequential_count <> 1/);
  assertMatch(sql, /'osp_non_sales_superuser_accepted'/);
  assertMatch(sql, /'osp_mixed_authority_accepted'/);
  assertMatch(sql, /'osp_superuser_stale_session_accepted'/);
  assertMatch(
    sql,
    /revoke all on function osp_private\.assert_approval_actor\([^)]+\) from public, anon, authenticated/,
  );
  assertMatch(
    sql,
    /grant execute on function osp_private\.assert_approval_actor\([^)]+\) to osp_workflow_api/,
  );
  assertNotMatch(sql, /insert into|update osp_private|delete from/);
  assertNotMatch(sql, /gmail|webhook|http_post|net\.http|pg_net/);
});
