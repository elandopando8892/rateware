import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260924042954_osp_canary_manifest_retry_after_response_fix.sql",
    import.meta.url,
  ),
);

Deno.test("exact manifest retry preserves failure and leaves outbound disabled", () => {
  assertMatch(sql, /release_mode = 'shadow'/);
  assertMatch(sql, /outbound_enabled = false/);
  assertMatch(sql, /last_error_code = 'OPENAI_INVALID_RESPONSE'/);
  assertMatch(sql, /job\.id = prior_job/);
  assertMatch(sql, /job\.id <> prior_job/);
  assertMatch(sql, /from osp_private\.request_manifest_drafts draft/);
  assertMatch(sql, /insert into osp_private\.background_jobs/);
  assertEquals(/set\s+outbound_enabled\s*=\s*true/i.test(sql), false);
  assertEquals(/update\s+osp_private\.background_jobs/i.test(sql), false);
});
