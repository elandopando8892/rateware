import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901092000_osp_historical_gmail_approved_sender_fix.sql",
  import.meta.url,
);

Deno.test("historical Gmail claim limits MARKSMAN intake to the approved Sales identity", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /sender_email\) ~ '\^\[\^@\[:space:\]\]\+@xbfreight\\\.com\$'/);
  assertMatch(sql, /sender_email\) = 'sales@heymarksman\.com'/);
  assertMatch(sql, /replace\(current_definition, old_fragment, new_fragment\)/);
  assertNotMatch(sql, /gmail\.googleapis\.com|net\.http|http_post|send_email|webhook/);
});
