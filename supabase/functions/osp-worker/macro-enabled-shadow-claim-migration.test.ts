import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901194000_osp_macro_enabled_shadow_extract_claim.sql",
  import.meta.url,
);

Deno.test("macro-enabled shadow extraction remains exact, hash-pinned and no-send", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();

  assert(sql.includes("job.id = p_job_id"));
  assert(sql.includes("document.case_id = p_case_id"));
  assert(sql.includes("document_version.id = p_document_version_id"));
  assert(sql.includes("document_version.source_sha256 = p_source_sha256"));
  assert(sql.includes("safety.content_sha256 = p_source_sha256"));
  assert(sql.includes("application/vnd.ms-excel.sheet.macroenabled.12"));
  assert(sql.includes("macro_quarantined_openxml_policy"));
  assert(sql.includes("control.release_mode = 'shadow'"));
  assert(sql.includes("control.outbound_enabled = false"));
  assert(sql.includes("for update of job skip locked"));
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
  assertEquals(/insert\s+into\s+osp_private\.outbound/.test(sql), false);
});
