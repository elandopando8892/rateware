import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260901190959_osp_request_manifest_decision_reviews.sql",
    import.meta.url,
  ),
);
const executableSql = sql.replace(/^--.*$/gm, "");

Deno.test("request manifest decision reviews are tenant-scoped, append-only and internal", () => {
  assertMatch(
    sql,
    /create table osp_private\.request_manifest_decision_reviews/i,
  );
  assertMatch(
    sql,
    /unique \(organization_id, case_id, manifest_draft_id, review_version\)/i,
  );
  assertMatch(
    sql,
    /before update or delete on osp_private\.request_manifest_decision_reviews/i,
  );
  assertMatch(sql, /force row level security/i);
  assertMatch(sql, /current_setting\('osp\.organization_id', true\)/i);
  assertMatch(sql, /for select to osp_workflow_api/i);
  assertMatch(sql, /for insert to osp_workflow_api/i);
  assertMatch(
    sql,
    /grant select, insert on osp_private\.request_manifest_decision_reviews to osp_workflow_api/i,
  );
  assertMatch(
    sql,
    /grant select on osp_private\.request_manifest_decision_reviews to osp_worker/i,
  );
  assertNotMatch(
    executableSql,
    /\b(?:http_post|net\.http|pg_net|cron\.|send_email|gmail_send|webhook)\b/i,
  );
});
