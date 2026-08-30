import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260830034601_osp_approval_snapshot_read_only_lock_fix.sql",
  import.meta.url,
);

Deno.test("approval snapshot assertion keeps the workflow role read-only and preserves concurrency guards", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(
    sql,
    /create or replace function osp_private\.assert_package_snapshot_hash_current\(/,
  );
  assertMatch(sql, /language plpgsql security invoker set search_path = ''/);
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/);
  assertMatch(
    sql,
    /from osp_private\.customer_registration_cases case_record[\s\S]*?for update/,
  );
  assertMatch(
    sql,
    /from osp_private\.case_package_input_snapshots snapshot[\s\S]*?not exists \([\s\S]*?from osp_private\.case_package_input_snapshots later/,
  );
  assertMatch(
    sql,
    /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\([\s\S]*?'document_effect'/,
  );
  assertMatch(sql, /osp_private\.package_snapshot_hash_is_current\(/);

  const snapshotRead = sql.slice(
    sql.indexOf("select * into current_snapshot"),
    sql.indexOf("if not found", sql.indexOf("select * into current_snapshot")),
  );
  assertNotMatch(snapshotRead, /for (?:update|share|no key update|key share)/);
  assertNotMatch(
    sql,
    /from osp_private\.document_versions[\s\S]*?for (?:update|share|no key update|key share)/,
  );
  assertNotMatch(sql, /grant update[\s\S]*?case_package_input_snapshots/);
  assertNotMatch(sql, /grant update[\s\S]*?document_versions/);
  assertNotMatch(sql, /security definer/);

  assertMatch(
    sql,
    /revoke all on function osp_private\.assert_package_snapshot_hash_current\(uuid, uuid, text\) from public, anon, authenticated, service_role, osp_worker/,
  );
  assertMatch(
    sql,
    /grant execute on function osp_private\.assert_package_snapshot_hash_current\(uuid, uuid, text\) to osp_workflow_api/,
  );
});
