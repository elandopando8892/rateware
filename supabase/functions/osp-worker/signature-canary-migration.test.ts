import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260830222500_osp_signature_application_canary_claim.sql",
  import.meta.url,
);

Deno.test("signature canary claim is exact, single-attempt, and fail-closed", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ");
  assertMatch(sql, /security definer set search_path = ''/i);
  assertMatch(sql, /control\.release_mode = 'shadow'/i);
  assertMatch(sql, /control\.outbound_enabled = false/i);
  assertMatch(sql, /job\.id = p_job_id/i);
  assertMatch(sql, /job\.kind = 'apply_signature'/i);
  assertMatch(sql, /job\.attempt = 0/i);
  assertMatch(sql, /approval\.id = p_approval_id/i);
  assertMatch(sql, /'caseId', p_case_id::text/i);
  assertMatch(sql, /approval\.status = 'pending'/i);
  assertMatch(sql, /case_record\.state = 'signature_approval'/i);
  assertMatch(sql, /case_record\.aggregate_version = p_expected_case_version/i);
  assertMatch(sql, /package\.output_sha256 = p_input_package_sha256/i);
  assertMatch(
    sql,
    /not exists \( select 1 from osp_private\.signature_application_receipts/i,
  );
  assertMatch(sql, /for update of job skip locked/i);
  assertMatch(sql, /grant execute on function[\s\S]+to osp_worker/i);
  assertNotMatch(sql, /send_authorized_payload|outbound_send_attempts/i);
});
