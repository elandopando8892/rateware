import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260829110414_osp_xlsx_signature_application.sql",
  import.meta.url,
);

Deno.test("XLSX signature migration keeps one tenant-scoped target and least privilege", async () => {
  const sql = (await Deno.readTextFile(migrationUrl)).replace(/\s+/g, " ")
    .trim().toLowerCase();
  assert(sql.includes("create table osp_private.signature_xlsx_positions"));
  assert(sql.includes("signature_vault_policies_exact_target_check"));
  assert(
    sql.includes(
      "(signature_position_id is not null)::integer + (signature_xlsx_position_id is not null)::integer = 1",
    ),
  );
  assert(sql.includes("signature_vault_policies_xlsx_position_idx"));
  assert(sql.includes("add column content_type text"));
  assert(sql.includes("inherit_signed_package_content_type"));
  assert(sql.includes("new.supersedes_package_id"));
  assert(sql.includes("alter table osp_private.signature_xlsx_positions enable row level security"));
  assert(sql.includes("alter table osp_private.signature_xlsx_positions force row level security"));
  assert(sql.includes("target_kind text"));
  assert(sql.includes("xlsx_position.cell_range"));
  assert(
    sql.includes(
      "grant execute on function osp_private.resolve_signature_application_policy",
    ),
  );
  assertEquals(
    /grant\s+(?:all|insert|update|delete)\s+on\s+osp_private\.signature_xlsx_positions/.test(
      sql,
    ),
    false,
  );
});
