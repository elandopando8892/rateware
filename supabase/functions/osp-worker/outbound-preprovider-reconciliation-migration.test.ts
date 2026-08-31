import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260831224500_osp_outbound_preprovider_reconciliation.sql",
  import.meta.url,
);

Deno.test("pre-provider reconciliation preserves the ambiguous claim and prepares exactly one fresh job", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /create table osp_private\.outbound_preprovider_reconciliations/);
  assertMatch(sql, /outbound_preprovider_reconciliations_append_only/);
  assertMatch(sql, /resolution constant text := 'gmail_mime_tenant_context_missing'/);
  assertMatch(sql, /old_attempt\.outcome <> 'manual_reconciliation_required'/);
  assertMatch(sql, /old_attempt\.send_claim_token <> p_expected_send_claim_token/);
  assertMatch(sql, /p_gmail_absence_checked_at < clock_timestamp\(\) - interval '15 minutes'/);
  assertMatch(sql, /outbound_runtime_failure_evidence evidence/);
  assertMatch(sql, /evidence\.job_error_code = 'invalid_input'/);
  assertMatch(sql, /outbound_gmail_receipts receipt/);
  assertMatch(sql, /receipt\.deterministic_message_id = old_attempt\.deterministic_message_id/);
  assertMatch(sql, /set outcome = 'failed', failure_code = resolution/);
  assertMatch(sql, /set state = 'ready_to_send', aggregate_version = aggregate_version \+ 1/);
  assertMatch(sql, /insert into osp_private\.background_jobs/);
  assertMatch(sql, /insert into osp_private\.outbound_send_attempts/);
  assertMatch(sql, /insert into osp_private\.approval_events/);
  assertMatch(sql, /grant execute on function[\s\S]*to postgres/);
  assertNotMatch(
    sql,
    /gmail\.googleapis\.com|net\.http|http_post|webhook|send_email/,
  );
});
