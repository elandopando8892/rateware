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
