// The team role gate is wired where every call passes, before any action runs.
// The behaviour itself is covered by tests/team-roles.contract.test.ts (npm run test:team-roles).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const auth = read("supabase/functions/_shared/auth.ts");
assert.match(auth, /roles: Array\.isArray\(appMetadata\.roles\)/, "the role comes from server-managed app_metadata");
assert.doesNotMatch(auth, /user_metadata[^\n]*roles/, "never from user_metadata, which the account can edit");

const roles = read("supabase/functions/_shared/team-roles.ts");
for (const action of [
  "award_rfx_lane_vendor",
  "clear_rfx_award",
  "closeout_awarded_rfx_to_rateware",
  "generate_rfx_award_notices",
  "publish_ratebook",
  "archive_rfx_event",
  "archive_carrier_list_template",
  "restore_carrier_list_template",
  "save_catalog_value",
  "save_location_alias",
  "save_accessorial",
]) {
  assert.match(roles, new RegExp(`"${action}"`), `${action} is an Administrador's`);
}
assert.match(roles, /"rateware-api\.update_rfx_event": new Set\(\["archived", "draft", "closed", "awarded"\]\)/);
assert.match(roles, /"quotedesk-api\.set_quote_status": new Set\(\["archived", "new"\]\)/);
for (const action of ["return_rateware_to_staging", "merge_shipper_accounts"]) {
  assert.match(roles, new RegExp(`"${action}"`), `${action} is an Administrador's`);
}
assert.match(roles, /"rateware-api\.update_shipper": new Set\(\["archived"\]\)/, "archiving a shipper by editing it is an Administrador's");
for (const action of ["bulk_update_vendors", "update_vendor"]) {
  assert.match(roles, new RegExp(`"rateware-api\\.${action}": new Set\\(\\["archived"\\]\\)`), `archiving a carrier through ${action} is an Administrador's`);
}
assert.match(roles, /ADMIN_UNLESS_PREVIEW[^]*"consolidate_exact_vendor_duplicates"/, "merging duplicate carriers is an Administrador's");

// What only the rows can tell is checked in the handler, before it writes.
const checkedBeforeWrite = (source, start, write, label) => {
  const from = source.indexOf(start);
  assert.ok(from > 0, `${label}: handler found`);
  const check = source.indexOf("adminOnlyDenial(", from);
  const written = source.indexOf(write, from);
  assert.ok(check > 0 && written > 0 && check < written, `${label}: the Administrador check comes before ${write}`);
};
const apiSource = read("supabase/functions/rateware-api/index.ts");
for (const [action, write] of [
  ["update_staging", ".update(patch)"],
  ["bulk_update_staging", ".update(patch)"],
  ["bulk_update_rate_rows_by_filter", ".update(patch)"],
  ["archive_staging", '.update({ status: "archived" })'],
  ["remove_staging", ".delete()"],
  ["remove_upload", "forwardSourceRemoval("],
  ["update_shipper", ".update(patch)"],
  ["import_shippers", ".insert(insertChunk)"],
  ["import_shipper_crm_workbook", ".insert(insertChunk)"],
  ["apply_vendor_template_updates", ".update(item.patch)"],
  ["import_vendors", ".upsert(payload)"],
  ["import_vendors_google_sheet", ".upsert(payload)"],
  ["bulk_update_vendors", ".update(patch)"],
  ["update_vendor", ".update(patch)"],
]) {
  checkedBeforeWrite(apiSource, `body.action === "${action}"`, write, action);
}
checkedBeforeWrite(read("supabase/functions/rateware-storage-api/index.ts"), 'body.action === "remove_upload"', "deleteStorageObject(", "storage remove_upload");
checkedBeforeWrite(read("supabase/functions/interpret-upload/index.ts"), "const rawUpload = uploadResult.data;", 'from("interpretation_jobs").insert', "interpret-upload");

for (const action of ["update_staging", "bulk_update_staging", "bulk_update_rate_rows_by_filter"]) {
  assert.match(roles, new RegExp(`"rateware-api\\.${action}": new Set\\(\\["approved"\\]\\)`), `approving through ${action} is an Administrador's`);
}

const api = read("supabase/functions/rateware-api/index.ts");
const gate = api.indexOf('teamRoleDenial("rateware-api"');
assert.ok(gate > 0, "rateware-api calls the gate");
assert.ok(gate < api.indexOf("if (isGrowthAction(growthAction))"), "before the first action is dispatched");
assert.ok(gate > api.indexOf("body = await request.json();"), "after the body is read");

const quotedesk = read("supabase/functions/quotedesk-api/index.ts");
const quoteGate = quotedesk.indexOf('teamRoleDenial("quotedesk-api"');
assert.ok(quoteGate > 0, "quotedesk-api calls the gate");
assert.ok(quoteGate < quotedesk.indexOf("switch (body.action)"), "before the first action is dispatched");

console.log("team role gate wiring checks passed");
