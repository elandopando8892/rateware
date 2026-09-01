import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901090000_osp_historical_gmail_idempotency_regex_fix.sql",
  import.meta.url,
);

Deno.test("historical Gmail claim validates 256-character idempotency keys without an invalid regex repetition", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /p_idempotency_key is null/);
  assertMatch(sql, /length\(p_idempotency_key\) > 256/);
  assertMatch(sql, /p_idempotency_key !~ '\^\[a-za-z0-9:_-\]\+\$'/);
  assertMatch(sql, /replace\(current_definition, old_fragment, new_fragment\)/);
  assertNotMatch(sql, /gmail\.googleapis\.com|net\.http|http_post|send_email|webhook/);
});
