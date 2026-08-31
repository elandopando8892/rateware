import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260831215000_osp_outbound_runtime_retry_evidence.sql",
  import.meta.url,
);
const hotfixUrl = new URL(
  "../../migrations/20260831222500_osp_outbound_runtime_retry_jsonb_hotfix.sql",
  import.meta.url,
);

Deno.test("outbound runtime retry preserves the terminal worker failure before reopening only the same job", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(
    sql,
    /create table osp_private\.outbound_runtime_failure_evidence/,
  );
  assertMatch(sql, /outbound_runtime_failure_evidence_append_only/);
  assertMatch(sql, /current_attempt\.outcome <> 'reserved'/);
  assertMatch(sql, /current_attempt\.send_claim_token is not null/);
  assertMatch(sql, /failed_job\.completed_at is null/);
  assertMatch(sql, /failed_job\.last_error_code <> p_expected_job_error/);
  assertMatch(sql, /outbound_gmail_receipts receipt/);
  assertMatch(
    sql,
    /update osp_private\.background_jobs set completed_at = null, last_error_code = null, retry_at = null, lease_token = null, leased_until = null where id = failed_job\.id/,
  );
  assertMatch(sql, /grant execute on function[\s\S]*to postgres/);
  assertMatch(sql, /jsonb_object_keys\(failed_job\.opaque_payload\)/);
  assertNotMatch(sql, /jsonb_object_length/);
  assertNotMatch(
    sql,
    /gmail\.googleapis\.com|net\.http|http_post|webhook|send_email/,
  );
});

Deno.test("outbound runtime retry hotfix replaces only the unavailable JSONB call", async () => {
  const sql = (await Deno.readTextFile(hotfixUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /pg_get_functiondef/);
  assertMatch(sql, /jsonb_object_length/);
  assertMatch(sql, /jsonb_object_keys/);
  assertMatch(sql, /osp_outbound_retry_hotfix_source_mismatch/);
  assertNotMatch(
    sql,
    /gmail\.googleapis\.com|net\.http|http_post|webhook|send_email/,
  );
});
