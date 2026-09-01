import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260901050000_osp_macro_enabled_spreadsheet_intake.sql",
  import.meta.url,
);

Deno.test("XLSM intake remains private, macro-quarantined and outbound-disabled", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();

  assert(sql.includes("application/vnd.ms-excel.sheet.macroenabled.12"));
  assert(sql.includes("safety.reason_code = 'macro_quarantined_openxml_policy'"));
  assert(sql.includes("safety.reason_code = 'strict_xlsx_package_policy'"));
  assert(sql.includes("control.outbound_enabled = false"));
  assert(sql.includes("version.bucket_id = 'osp-corporate-documents'"));
  assert(sql.includes("version.document_type = 'supplier_requirement'"));
  assert(sql.includes("osp-originals"));
  assert(sql.includes("osp-corporate-documents"));
  assert(sql.includes("macros never execute"));
  assertEquals(/outbound_enabled\s*=\s*true/.test(sql), false);
  assertEquals(/grant\s+(?:select|insert|update|delete|all)\s+on\s+storage\./.test(sql), false);
});
