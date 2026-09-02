import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260902040000_osp_template_scoped_signature_positions.sql",
  import.meta.url,
);

Deno.test("template-scoped signature positions reuse only an exact reviewed XLSX layout", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ");
  assertMatch(
    sql,
    /create table osp_private\.signature_xlsx_template_positions/i,
  );
  assertMatch(sql, /source_template_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assertMatch(sql, /signature_xlsx_template_positions_append_only/i);
  assertMatch(sql, /artifact_receipt_json->>'sourceSha256'/i);
  assertMatch(
    sql,
    /template_position\.source_template_sha256 = approval\.source_template_sha256/i,
  );
  assertMatch(sql, /order by resolved\.priority, resolved\.revision desc/i);
  assertMatch(sql, /grant execute on function[\s\S]+to osp_worker/i);
  assertNotMatch(
    sql,
    /grant\s+(?:all|insert|update|delete)\s+on\s+osp_private\.signature_xlsx_template_positions/i,
  );
  assertNotMatch(sql, /send_authorized_payload|gmail_message_id/i);
});
