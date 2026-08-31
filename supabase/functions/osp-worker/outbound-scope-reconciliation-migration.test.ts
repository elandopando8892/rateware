import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260831230000_osp_outbound_scope_reconciliation.sql",
  import.meta.url,
);

Deno.test("outbound scope reconciliation requires a remediated least-privilege Gmail connection", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /create table osp_private\.outbound_scope_failure_evidence/);
  assertMatch(sql, /drop constraint if exists provider_gmail_connections_readonly_scopes_check/);
  assertMatch(sql, /provider_gmail_connections_least_privilege_scopes_check/);
  assertMatch(sql, /scopes <@ array\[/);
  assertMatch(sql, /outbound_scope_failure_evidence_append_only/);
  assertMatch(sql, /failure constant text := 'gmail_send_scope_missing'/);
  assertMatch(sql, /connection\.scopes @> array\[readonly_scope, send_scope\]::text\[\]/);
  assertMatch(sql, /old_attempt\.outcome <> 'manual_reconciliation_required'/);
  assertMatch(sql, /old_attempt\.send_claim_token <> p_expected_send_claim_token/);
  assertMatch(sql, /p_gmail_absence_checked_at < clock_timestamp\(\) - interval '15 minutes'/);
  assertMatch(sql, /outbound_gmail_receipts receipt/);
  assertMatch(sql, /receipt\.deterministic_message_id = old_attempt\.deterministic_message_id/);
  assertMatch(sql, /set outcome = 'failed', failure_code = failure/);
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
