import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901083500_osp_historical_gmail_source_gate_fix.sql",
  import.meta.url,
);

Deno.test("historical Gmail source gate accepts approved internal senders and TO or CC while requiring an external recipient", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /sender_email\) ~ '\^\[\^@\[:space:\]\]\+@\(xbfreight\\\.com\|heymarksman\\\.com\)\$'/);
  assertMatch(sql, /coalesce\(message\.to_emails, array\[\]::text\[\]\) \|\| pg_catalog\.coalesce\(message\.cc_emails, array\[\]::text\[\]\)/);
  assertMatch(sql, /not in \('', 'xbfreight\.com', 'heymarksman\.com'\)/);
  assertMatch(sql, /message\.external_message_id = p_external_message_id/);
  assertMatch(sql, /message\.direction = 'inbound'/);
  assertNotMatch(sql, /gmail\.googleapis\.com|net\.http|http_post|send_email|webhook/);
});
