import assert from "node:assert/strict";
import test from "node:test";
import { chunk, costBaseRows, defaultSetId, paramMap, usableSet, workspacesByOrg } from "../supabase/functions/sync-fcm-bases/fcm-sync.mjs";

const legacyActive = { id: "set-legacy", org_id: "org-a", set_name: "Default — D2D Base", version: 1, version_status: "DRAFT", is_active: true, has_profile: false, base_id: null };
const legacyInactive = { ...legacyActive, id: "set-legacy-2", set_name: "Intra-Mex", is_active: false };
const publishedBase = {
  id: "set-pub", org_id: "org-a", set_name: "v2", version: 2, version_status: "PUBLISHED", is_active: true, has_profile: true,
  base_id: "base-1", code: "XB-01", base_name: "D2D Crossborder", scope: "CROSS_BORDER", base_status: "ACTIVE", policy: "OPERATIONAL_V3", currency: "USD", base_default: false
};
const draftBase = { ...publishedBase, id: "set-draft", version_status: "DRAFT" };
const archivedBase = { ...publishedBase, id: "set-archived", base_status: "ARCHIVED" };

test("usable sets follow the FCM's own calculation rules", () => {
  assert.equal(usableSet(legacyActive), true, "the org's active legacy set");
  assert.equal(usableSet(legacyInactive), false);
  assert.equal(usableSet({ ...legacyActive, version_status: "ARCHIVED" }), false);
  assert.equal(usableSet(publishedBase), true, "the published, active version of a live base");
  assert.equal(usableSet(draftBase), false, "drafts are not priced with");
  assert.equal(usableSet(archivedBase), false, "archived bases are not priced with");
  assert.equal(usableSet({ ...publishedBase, has_profile: false }), false, "legacy base versions without a profile are replay-only");
});

test("the default is the active legacy set, else a usable base", () => {
  assert.equal(defaultSetId([publishedBase, legacyActive, draftBase]), "set-legacy");
  assert.equal(defaultSetId([draftBase, publishedBase]), "set-pub");
  assert.equal(defaultSetId([draftBase, legacyInactive]), null);
});

test("FCM organizations map to rateware workspaces by their users' emails", () => {
  const users = [
    { org_id: "org-a", email: "Sales@HeyMarksman.com" },
    { org_id: "org-b", email: "someone@else.com" },
    { org_id: "org-c", email: "one@x.com" },
    { org_id: "org-c", email: "two@y.com" }
  ];
  const aliases = [
    { organization_id: "org_dbc2fd12c76", identity_key: "sales@heymarksman.com" },
    { organization_id: "org_1", identity_key: "one@x.com" },
    { organization_id: "org_2", identity_key: "two@y.com" }
  ];
  const registry = [
    { organization_id: "org_dbc2fd12c76", canonical_owner_key: "org:org_dbc2fd12c76" },
    { organization_id: "org_1", canonical_owner_key: "org:org_1" },
    { organization_id: "org_2", canonical_owner_key: "org:org_2" }
  ];
  const { byOrg, conflicts } = workspacesByOrg(users, aliases, registry);
  assert.deepEqual(byOrg.get("org-a"), { owner_email: "org:org_dbc2fd12c76", organization_id: "org_dbc2fd12c76" });
  assert.equal(byOrg.has("org-b"), false, "an org with no known email is not synced");
  assert.equal(byOrg.has("org-c"), false, "an org split across two workspaces is not guessed");
  assert.deepEqual(conflicts, ["org-c"]);
});

test("cost base rows carry the params map and the FCM's default and usable flags", () => {
  const workspaces = new Map([["org-a", { owner_email: "org:org_dbc2fd12c76", organization_id: "org_dbc2fd12c76" }]]);
  const params = [
    { set_id: "set-legacy", section: "TECHNICAL_MARGIN", field: "Target Gross Margin", value: 0.18 },
    { set_id: "set-legacy", section: "FUEL", field: "Diesel MX", value: "28" },
    { set_id: "set-pub", section: "BORDER", field: "Border Transactional Cost", value: 200 }
  ];
  const rows = costBaseRows({
    sets: [legacyActive, publishedBase, { ...legacyActive, id: "other-org-set", org_id: "org-z" }],
    params,
    organizations: [{ id: "org-a", name: "sales's org" }],
    workspaces,
    syncedAt: "2026-09-24T19:00:00.000Z"
  });
  assert.equal(rows.length, 2, "only the mapped organization's sets");
  const legacy = rows.find((row) => row.id === "set-legacy");
  assert.equal(legacy.name, "Default — D2D Base");
  assert.equal(legacy.is_default, true);
  assert.equal(legacy.usable, true);
  assert.deepEqual(legacy.params, { "TECHNICAL_MARGIN__Target Gross Margin": 0.18, "FUEL__Diesel MX": 28 });
  assert.equal(legacy.param_count, 2);
  assert.equal(legacy.owner_email, "org:org_dbc2fd12c76");
  const base = rows.find((row) => row.id === "set-pub");
  assert.equal(base.name, "D2D Crossborder", "a cost base is named after the base, not the version");
  assert.equal(base.is_default, false);
  assert.equal(base.fcm_organization_name, "sales's org");
  assert.deepEqual(paramMap([{ section: "X", field: "Y", value: "not a number" }]), {});
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
