import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260924044341_osp_canary_manifest_retry_after_missing_form_fix.sql",
    import.meta.url,
  ),
);

Deno.test("final synthetic manifest retry requires both preserved failures and zero drafts", () => {
  assertMatch(sql, /release_mode = 'shadow'/);
  assertMatch(sql, /outbound_enabled = false/);
  assertMatch(sql, /last_error_code = 'OPENAI_INVALID_RESPONSE'/);
  assertMatch(sql, /last_error_code = 'PERMANENT_FAILURE'/);
  assertMatch(sql, /from osp_private\.request_manifest_drafts draft/);
  assertMatch(sql, /\) <> 2 then/);
  assertMatch(sql, /insert into osp_private\.background_jobs/);
  assertEquals(/set\s+outbound_enabled\s*=\s*true/i.test(sql), false);
  assertEquals(/update\s+osp_private\.background_jobs/i.test(sql), false);
});
