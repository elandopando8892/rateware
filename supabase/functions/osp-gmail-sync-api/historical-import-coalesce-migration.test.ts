import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901085000_osp_historical_gmail_coalesce_fix.sql",
  import.meta.url,
);

Deno.test("historical Gmail claim replaces the invalid catalog-qualified coalesce without outbound effects", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(sql, /pg_get_functiondef\(function_signature\)/);
  assertMatch(sql, /strpos\(current_definition, 'pg_catalog\.coalesce'\) = 0/);
  assertMatch(sql, /replace\( current_definition, 'pg_catalog\.coalesce', 'coalesce' \)/);
  assertNotMatch(sql, /gmail\.googleapis\.com|net\.http|http_post|send_email|webhook/);
});
