import { assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260901073000_osp_historical_gmail_import_claim.sql",
  import.meta.url,
));

Deno.test("historical Gmail claim preserves exact source, idempotency and no-send intake boundaries", () => {
  assertMatch(sql, /unique \(organization_id, mailbox_email, external_message_id\)/i);
  assertMatch(sql, /pg_advisory_xact_lock[\s\S]*operation_name[\s\S]*p_idempotency_key/i);
  assertMatch(sql, /message\.direction = 'inbound'/i);
  assertMatch(sql, /message\.sender_email[\s\S]*@xbfreight\\\.com/i);
  assertMatch(sql, /p_mailbox_email = any[\s\S]*message\.cc_emails/i);
  assertMatch(sql, /pg_catalog\.unnest\(message\.to_emails\)[\s\S]*not in \('', 'xbfreight\.com'\)/i);
  assertMatch(sql, /extensions\.digest[\s\S]*p_subject_sha256/i);
  assertMatch(sql, /'gmail_ingest'[\s\S]*'rateware-gmail:' \|\| p_external_message_id/i);
  assertMatch(sql, /on conflict \(organization_id, kind, idempotency_key\) do nothing/i);
  assertMatch(sql, /'checkpoint_unchanged', true[\s\S]*'outbound_enabled', false/i);
  assertMatch(sql, /grant execute on function osp_private\.record_historical_gmail_import[\s\S]*to osp_workflow_api/i);
});
