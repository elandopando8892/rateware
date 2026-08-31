import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260831020049_osp_signature_retry_evidence.sql",
  import.meta.url,
);

Deno.test("signature retry archives the failed receipt and remains an exact shadow-only operation", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ");
  assertMatch(
    sql,
    /create table osp_private\.signature_application_failure_evidence/i,
  );
  assertMatch(sql, /failure_evidence_append_only/i);
  assertMatch(sql, /security definer set search_path = ''/i);
  assertMatch(sql, /current_case\.state <> 'signature_approval'/i);
  assertMatch(
    sql,
    /current_case\.aggregate_version <> p_expected_case_version/i,
  );
  assertMatch(sql, /approval\.status <> 'pending'/i);
  assertMatch(sql, /failed_receipt\.outcome <> 'failed'/i);
  assertMatch(sql, /failed_job\.completed_at is null/i);
  assertMatch(sql, /control\.release_mode = 'shadow'/i);
  assertMatch(sql, /control\.outbound_enabled = false/i);
  assertMatch(sql, /sales_authorizations sales_auth/i);
  assertNotMatch(sql, /sales_authorizations authorization/i);
  assertMatch(
    sql,
    /insert into osp_private\.signature_application_failure_evidence/i,
  );
  assertMatch(
    sql,
    /delete from osp_private\.signature_application_receipts candidate/i,
  );
  assertMatch(sql, /p_retry_job_id, p_organization_id, 'apply_signature'/i);
  assertMatch(sql, /grant execute on function[\s\S]+to postgres/i);
  assertNotMatch(sql, /send_authorized_payload|gmail_message_id/i);
});
