import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260829164531_osp_supplier_package_canary_claim.sql",
  import.meta.url,
);

Deno.test("supplier package canary claim is exact, current, and least privilege", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ");
  assertMatch(sql, /security definer set search_path = ''/i);
  assertMatch(sql, /job\.id = p_job_id/i);
  assertMatch(sql, /job\.kind = 'generate_supplier_package'/i);
  assertMatch(sql, /snapshot\.id = p_snapshot_id/i);
  assertMatch(sql, /snapshot\.canonical_sha256 = p_snapshot_sha256/i);
  assertMatch(sql, /case_record\.state = 'operations_review'/i);
  assertMatch(sql, /case_record\.aggregate_version = snapshot\.case_version/i);
  assertMatch(sql, /control\.outbound_enabled = false/i);
  assertMatch(sql, /for update of job skip locked/i);
  assertMatch(
    sql,
    /revoke all on function[\s\S]+from public, anon, authenticated, service_role, osp_workflow_api/i,
  );
  assertMatch(sql, /grant execute on function[\s\S]+to osp_worker/i);
  assertNotMatch(sql, /send_authorized_payload|gmail_ingest/i);
});
