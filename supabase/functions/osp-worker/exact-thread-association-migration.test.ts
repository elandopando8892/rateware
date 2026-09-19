import { assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260919100000_osp_exact_thread_association_claim.sql",
  import.meta.url,
));

Deno.test("exact thread association claim is additive and bound to its terminal INVALID_INPUT predecessor", () => {
  assertMatch(sql, /'exact_thread_association'/);
  assertMatch(sql, /job\.id = p_job_id/i);
  assertMatch(sql, /prior\.last_error_code = 'INVALID_INPUT'/i);
  assertMatch(sql, /prior\.completed_at is not null/i);
  assertMatch(sql, /originalOuterRawMimeSha256[\s\S]*amendmentOriginalEmlSha256/i);
  assertMatch(sql, /control\.outbound_enabled = false/i);
  assertMatch(sql, /for update of job skip locked/i);
  assertMatch(sql, /grant execute[\s\S]*to osp_worker/i);
});
