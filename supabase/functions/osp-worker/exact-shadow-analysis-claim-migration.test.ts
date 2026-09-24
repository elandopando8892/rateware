import { assertMatch } from "jsr:@std/assert@1.0.14";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260924033204_osp_exact_shadow_analysis_canary.sql",
    import.meta.url,
  ),
);

Deno.test("exact shadow analysis claim cannot open outbound or other cases", () => {
  assertMatch(sql, /control\.release_mode = 'shadow'/);
  assertMatch(sql, /control\.outbound_enabled = false/);
  assertMatch(sql, /job\.id = p_job_id/);
  assertMatch(sql, /job\.opaque_payload = pg_catalog\.jsonb_build_object\(/);
  assertMatch(sql, /job\.attempt = 0/);
  assertMatch(
    sql,
    /source_message\.subject like\s+'PRUEBA CONTROLADA OSP-CANARY-%'/,
  );
  assertMatch(
    sql,
    /p_kind not in \('attachment_promote', 'request_manifest'\)/,
  );
  assertMatch(
    sql,
    /grant execute on function osp_private\.claim_exact_shadow_analysis\([\s\S]*?to osp_worker;/,
  );
});
