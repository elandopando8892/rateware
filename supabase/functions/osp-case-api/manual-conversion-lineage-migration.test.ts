import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260923050000_osp_reviewed_legacy_conversion_lineage.sql",
    import.meta.url,
  ),
);

Deno.test("legacy conversion lineage is tenant-bound, reviewed and not directly writable", () => {
  assertMatch(migration, /create table osp_private\.manual_attachment_conversions/);
  assertMatch(migration, /unique \(organization_id, source_attachment_id\)/);
  assertMatch(migration, /foreign key \(organization_id, case_id\)/);
  assertMatch(migration, /source_page_count = converted_page_count/);
  assertMatch(migration, /source\.content_type = 'application\/msword'/);
  assertMatch(migration, /source\.processing_disposition = 'manual_conversion_required'/);
  assertMatch(migration, /converted\.content_type =[\s\S]*?wordprocessingml\.document/);
  assertMatch(migration, /converted\.status = 'approved'/);
  assertMatch(migration, /order by safety\.version desc[\s\S]*?limit 1[\s\S]*?= 'safe'/);
  assertMatch(migration, /decision\.reason_code = 'DOCUMENT_APPROVED'/);
  assertMatch(migration, /p_fidelity_confirmed is distinct from true/);
  assertMatch(migration, /revoke all on osp_private\.manual_attachment_conversions[\s\S]*?osp_workflow_api/);
  assertMatch(migration, /grant select on osp_private\.manual_attachment_conversions to osp_workflow_api/);
  assertNotMatch(migration, /grant (?:insert|update|delete) on osp_private\.manual_attachment_conversions to osp_workflow_api/);
});
