import { assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260909060554_osp_exact_gmail_ingest_claim.sql",
    import.meta.url,
  ),
);

Deno.test("exact Gmail claim is fail-closed and cannot drain unrelated jobs", () => {
  assertMatch(sql, /job\.id = p_job_id/i);
  assertMatch(sql, /job\.kind = 'gmail_ingest'/i);
  assertMatch(sql, /control\.outbound_enabled = false/i);
  assertMatch(sql, /gmailMessageId[\s\S]*deliveryIdempotencyKey/i);
  assertMatch(sql, /for update of job skip locked/i);
  assertMatch(sql, /grant execute[\s\S]*to osp_worker/i);
  assertMatch(sql, /revoke all[\s\S]*service_role[\s\S]*osp_workflow_api/i);
});
