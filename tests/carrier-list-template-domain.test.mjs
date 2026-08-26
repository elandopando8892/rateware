import assert from "node:assert/strict";

import {
  carrierTemplateConflictSummary,
  carrierTemplateDraftDiff,
  carrierTemplateDraftPayload,
  carrierTemplateImportValidation,
  createCarrierTemplateModalFocusController,
  createCarrierTemplateNavigationCoordinator,
  createCarrierTemplateWizardAsyncController,
  createCarrierTemplateDraftState,
  mergeCarrierTemplateResolutionRows,
  partitionCarrierTemplateMembers,
  reduceCarrierTemplateDraft,
  validateCarrierTemplateDraft,
  templateMemberIds
} from "../src/carrier-list-template-domain.js";
import {
  carrierTemplateExceptionCsv,
  mapCarrierTemplateHeader,
  normalizeCarrierTemplateRows,
  rowsFromCarrierTemplateMatrix
} from "../src/carrier-list-template-file.js";

const ids = {
  eligible: "11111111-1111-4111-8111-111111111111",
  filtered: "22222222-2222-4222-8222-222222222222",
  participant: "33333333-3333-4333-8333-333333333333",
  missingContact: "44444444-4444-4444-8444-444444444444",
  archived: "55555555-5555-4555-8555-555555555555",
  deleted: "66666666-6666-4666-8666-666666666666",
  foreign: "77777777-7777-4777-8777-777777777777"
};

const activeVendor = (id, extra = {}) => ({
  id,
  organization_id: "org-a",
  status: "active",
  primary_email: "pricing@example.com",
  ...extra
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// These executable races catch late async completions mutating or rendering a
// different editor session. Each operation receives immutable template context.
{
  const applied = [];
  const controller = createCarrierTemplateWizardAsyncController();
  controller.open({ template_id: "template-a", expected_version: 4 });
  const firstFile = deferred();
  const secondFile = deferred();
  const firstRun = controller.run("file-import", () => firstFile.promise, (value, token) => {
    applied.push({ value, token });
  });
  const secondRun = controller.run("file-import", () => secondFile.promise, (value, token) => {
    applied.push({ value, token });
  });
  secondFile.resolve("second-file");
  assert.equal((await secondRun).current, true);
  firstFile.resolve("first-file");
  assert.equal((await firstRun).current, false);
  assert.deepEqual(applied.map((entry) => entry.value), ["second-file"]);
  assert.equal(applied[0].token.template_id, "template-a");
  assert.equal(applied[0].token.expected_version, 4);
  assert.equal(Object.isFrozen(applied[0].token), true);
}

// This executable focus harness catches delayed initial focus, escaping the
// modal with Tab/Shift+Tab, and failure to restore the opener on close.
{
  const opener = { id: "opener" };
  const first = { id: "first" };
  const last = { id: "last" };
  let active = opener;
  const focus = createCarrierTemplateModalFocusController({
    getActiveElement: () => active,
    getFocusable: () => [first, last],
    focusElement: (element) => {
      active = element;
    }
  });
  focus.open(first);
  assert.equal(active, first, "opening focus must move inside synchronously");
  active = last;
  let prevented = false;
  assert.equal(focus.trapTab({ key: "Tab", shiftKey: false, preventDefault: () => prevented = true }), true);
  assert.equal(prevented, true);
  assert.equal(active, first);
  active = first;
  focus.trapTab({ key: "Tab", shiftKey: true, preventDefault() {} });
  assert.equal(active, last);
  focus.close();
  assert.equal(active, opener);
}

// These click/popstate/back-forward attempts prove a declined dirty guard
// leaves route, panel, and editor untouched; acceptance commits exactly once.
{
  const state = { url: "?tab=list-templates&template=a", tab: "list-templates", editorOpen: true };
  let accept = false;
  let invalidations = 0;
  const navigation = createCarrierTemplateNavigationCoordinator({
    beforeLeave: () => {
      if (!accept) return false;
      invalidations += 1;
      state.editorOpen = false;
      return true;
    },
    commit: (route) => {
      state.url = route.url;
      state.tab = route.tab;
    },
    restore: (route) => {
      state.url = route.url;
      state.tab = route.tab;
    }
  });
  assert.equal(navigation.click({ url: "?tab=funnel", tab: "funnel" }), false);
  assert.deepEqual(state, { url: "?tab=list-templates&template=a", tab: "list-templates", editorOpen: true });
  assert.equal(invalidations, 0);

  const acceptedRoute = { ...state };
  state.url = "?tab=funnel";
  assert.equal(navigation.popstate(
    { url: "?tab=funnel", tab: "funnel" },
    { url: acceptedRoute.url, tab: acceptedRoute.tab }
  ), false);
  assert.deepEqual(state, acceptedRoute);
  accept = true;
  assert.equal(navigation.popstate({ url: "?tab=funnel", tab: "funnel" }, acceptedRoute), true);
  assert.deepEqual(state, { url: "?tab=funnel", tab: "funnel", editorOpen: false });
  assert.equal(invalidations, 1);
}

{
  const applied = [];
  const controller = createCarrierTemplateWizardAsyncController();
  controller.open({ template_id: "template-a", expected_version: 7 });
  const oldSave = deferred();
  const saving = controller.run("save", () => oldSave.promise, (row) => applied.push(row));
  controller.open({ template_id: "template-b", expected_version: 2 });
  oldSave.resolve({ id: "template-a", template_version: 8 });
  assert.equal((await saving).current, false);
  assert.deepEqual(applied, [], "an old save must not mutate or render the new draft");

  const staleCurrentFetch = deferred();
  const fetching = controller.run("current-fetch", () => staleCurrentFetch.promise, (row) => applied.push(row));
  controller.close();
  controller.open({ template_id: "template-a", expected_version: 9 });
  staleCurrentFetch.resolve({ id: "template-b", template_version: 3 });
  assert.equal((await fetching).current, false);
  assert.deepEqual(applied, [], "a stale 409 fetch must not render after close/reopen");
}

// These reducer tests catch order loss, accidental duplicate membership, stale
// removals, and edits that fail to participate in the unsaved-changes contract.
{
  const loaded = createCarrierTemplateDraftState({
    id: "template-a",
    segment_name: "MX Core",
    segment_description: "Original",
    lifecycle_status: "active",
    template_version: 7,
    vendor_ids: [ids.eligible, ids.filtered]
  });
  const afterAdd = reduceCarrierTemplateDraft(loaded, {
    type: "add_members",
    vendor_ids: [ids.participant, ids.eligible, ids.participant]
  });
  const afterRemove = reduceCarrierTemplateDraft(afterAdd, {
    type: "remove_member",
    vendor_id: ids.filtered
  });
  const reordered = reduceCarrierTemplateDraft(afterRemove, {
    type: "reorder_member",
    vendor_id: ids.participant,
    to_index: 0
  });
  const edited = reduceCarrierTemplateDraft(reordered, {
    type: "set_details",
    name: "MX Core 2027",
    description: "Revised"
  });

  assert.deepEqual(loaded.vendor_ids, [ids.eligible, ids.filtered], "the reducer must not mutate loaded state");
  assert.deepEqual(afterAdd.vendor_ids, [ids.eligible, ids.filtered, ids.participant]);
  assert.deepEqual(edited.vendor_ids, [ids.participant, ids.eligible]);
  assert.equal(edited.expected_version, 7);
  assert.equal(edited.dirty, true);
  assert.deepEqual(carrierTemplateDraftDiff(edited), {
    added_vendor_ids: [ids.participant],
    removed_vendor_ids: [ids.filtered]
  });
}

// This catches any path that auto-adds ambiguous, not-found, or duplicate rows.
{
  let state = createCarrierTemplateDraftState({ segment_name: "Import review" });
  state = reduceCarrierTemplateDraft(state, {
    type: "apply_resolution_preview",
    rows: [
      { source_row_number: 2, status: "matched", vendor_id: ids.eligible },
      { source_row_number: 3, status: "ambiguous", candidate_vendor_ids: [ids.participant], requires_manual_confirmation: true },
      { source_row_number: 4, status: "not_found", vendor_id: ids.archived },
      { source_row_number: 5, status: "duplicate", vendor_id: ids.eligible }
    ]
  });
  assert.deepEqual(state.vendor_ids, [ids.eligible]);
  assert.deepEqual(state.manual_resolutions, {});

  const unresolvedAttempt = reduceCarrierTemplateDraft(state, {
    type: "confirm_manual_match",
    source_row_number: 4,
    vendor_id: ids.archived
  });
  assert.deepEqual(unresolvedAttempt.vendor_ids, [ids.eligible]);

  state = reduceCarrierTemplateDraft(state, {
    type: "confirm_manual_match",
    source_row_number: 3,
    vendor_id: ids.participant
  });
  assert.deepEqual(state.vendor_ids, [ids.eligible, ids.participant]);
  assert.deepEqual(state.manual_resolutions, { "3": ids.participant });
  assert.equal(state.resolution_rows[1].status, "ambiguous", "the source outcome must remain auditable");
  assert.equal(state.resolution_rows[1].chosen_vendor_id, ids.participant);
}

// This catches a manual choice being treated as clean merely because the chosen
// carrier was already a member and the UUID list itself did not change.
{
  let state = createCarrierTemplateDraftState({
    segment_name: "Manual review",
    vendor_ids: [ids.participant]
  });
  state = reduceCarrierTemplateDraft(state, {
    type: "apply_resolution_preview",
    rows: [{ source_row_number: 9, status: "ambiguous", candidate_vendor_ids: [ids.participant] }]
  });
  state = reduceCarrierTemplateDraft(state, { type: "accept_saved" });
  assert.equal(state.dirty, false);
  state = reduceCarrierTemplateDraft(state, {
    type: "confirm_manual_match",
    source_row_number: 9,
    vendor_id: ids.participant
  });
  assert.deepEqual(state.vendor_ids, [ids.participant]);
  assert.equal(state.dirty, true);
}

// This catches active-empty saves and draft-empty saves being conflated.
{
  const empty = createCarrierTemplateDraftState({ segment_name: "Empty draft" });
  assert.deepEqual(validateCarrierTemplateDraft(empty, "draft"), { valid: true, errors: [] });
  assert.deepEqual(validateCarrierTemplateDraft(empty, "active"), {
    valid: false,
    errors: [{ code: "active_requires_member", message: "Activate template requires at least one carrier." }]
  });
  assert.deepEqual(carrierTemplateDraftPayload(empty, "draft"), {
    segment_name: "Empty draft",
    segment_description: "",
    lifecycle_status: "draft",
    vendor_ids: []
  });
  assert.equal(validateCarrierTemplateDraft(createCarrierTemplateDraftState(), "draft").valid, false);
}

// This catches a 409 comparison that reverses local/current membership or loses
// the versions the operator needs for an explicit reload decision.
{
  const local = reduceCarrierTemplateDraft(createCarrierTemplateDraftState({
    id: "template-a",
    segment_name: "Local",
    template_version: 4,
    vendor_ids: [ids.eligible, ids.filtered]
  }), { type: "add_members", vendor_ids: [ids.participant] });
  assert.deepEqual(carrierTemplateConflictSummary(local, {
    id: "template-a",
    segment_name: "Current",
    template_version: 5,
    vendor_ids: [ids.filtered, ids.archived]
  }), {
    local_version: 4,
    current_version: 5,
    local_member_count: 3,
    current_member_count: 2,
    only_local_vendor_ids: [ids.eligible, ids.participant],
    only_current_vendor_ids: [ids.archived]
  });
}

// This catches unsupported/oversized/over-row files reaching the resolution API.
{
  assert.deepEqual(carrierTemplateImportValidation({
    name: "carriers.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1024
  }, { row_count: 1000 }), { valid: true, code: "", message: "" });
  assert.equal(carrierTemplateImportValidation({ name: "carriers.xls", size: 1024 }).code, "unsupported_file_type");
  assert.equal(carrierTemplateImportValidation({ name: "carriers.csv", size: 5 * 1024 * 1024 + 1 }).code, "file_too_large");
  const overLimit = carrierTemplateImportValidation({ name: "carriers.csv", size: 1024 }, { row_count: 1001 });
  assert.equal(overLimit.code, "too_many_rows");
  assert.match(overLimit.message, /1,000 row limit/);
}

// This catches server resolution output replacing source evidence or injecting
// CRM-only profile/contact fields into the local exception record.
{
  const merged = mergeCarrierTemplateResolutionRows([{
    source_row_number: 12,
    vendor_id: "uploaded-id",
    crm_id: "legacy-12",
    usdot_number: "8080",
    usdot: "8080",
    mc_number: "MC-99",
    primary_email: "uploaded@example.com",
    vendor_name: "Uploaded carrier",
    crm_contact_name: "must not survive"
  }], [{
    source_row_number: 12,
    status: "ambiguous",
    reason: "name_requires_confirmation",
    candidate_vendor_ids: [ids.eligible],
    crm_phone: "+1 secret"
  }]);
  assert.deepEqual(merged, [{
    source_row_number: 12,
    status: "ambiguous",
    reason: "name_requires_confirmation",
    candidate_vendor_ids: [ids.eligible],
    source_row: {
      source_row_number: 12,
      vendor_id: "uploaded-id",
      crm_id: "legacy-12",
      usdot_number: "8080",
      mc_number: "MC-99",
      primary_email: "uploaded@example.com",
      vendor_name: "Uploaded carrier"
    }
  }]);
}

// This catches an accidental fifth primary state or any precedence/order change.
{
  const filteredVendor = activeVendor(ids.filtered, { vendor_name: "Filtered carrier" });
  const groups = partitionCarrierTemplateMembers({
    template: { vendor_ids: Object.values(ids) },
    vendors: [
      activeVendor(ids.eligible, { vendor_name: "Eligible carrier" }),
      filteredVendor,
      activeVendor(ids.participant, { vendor_name: "Already invited" }),
      activeVendor(ids.missingContact, { primary_email: "", vendor_name: "No email" }),
      activeVendor(ids.archived, { status: "archived", vendor_name: "Archived" }),
      activeVendor(ids.foreign, { organization_id: "org-b", vendor_name: "Foreign" })
    ],
    participantVendorIds: [ids.participant],
    isContactUsable: (vendor) => Boolean(vendor.primary_email),
    isVendorAvailable: (vendor) => vendor.organization_id === "org-a" && vendor.status === "active",
    passesFilters: (vendor) => vendor.id !== filteredVendor.id
  });

  assert.deepEqual(groups.counts, {
    total: 7,
    eligible: 2,
    already_in_rfx: 1,
    missing_contact: 1,
    unavailable: 3,
    filtered_out: 1
  });
  assert.equal(
    groups.counts.eligible + groups.counts.already_in_rfx + groups.counts.missing_contact + groups.counts.unavailable,
    groups.counts.total
  );
  assert.equal(new Set(Object.values(groups.rows).flat().map((row) => row.vendor_id)).size, 7);
  assert.deepEqual(groups.filtered_out_ids, [filteredVendor.id]);
  assert.deepEqual(groups.rows.eligible.map((row) => row.vendor_id), [ids.eligible, ids.filtered]);
  assert.deepEqual(groups.rows.unavailable.map((row) => row.vendor_id), [ids.archived, ids.deleted, ids.foreign]);
  assert.deepEqual(groups.rows.unavailable[1], {
    vendor_id: ids.deleted,
    id: ids.deleted,
    unavailable: true,
    primary_state: "unavailable"
  });
}

// This catches dropping the template's source order or duplicate/blank IDs.
{
  assert.deepEqual(templateMemberIds({ vendor_ids: ["  a ", "b", "a", "", null] }), ["a", "b"]);
}

// This catches header aliases that silently lose match evidence or source row provenance.
{
  const matrix = [
    ["Rateware carrier template"],
    [],
    ["ID de proveedor CRM", "CRM ID", "Numero USDOT", "Numero MC", "Correo electronico principal", "Nombre del transportista"],
    [ids.eligible, "legacy-7", "123456", "MC-765", " PRICING@Example.COM ", " Acme, Inc. "],
    ["", "", "", "", "", ""]
  ];
  const rows = rowsFromCarrierTemplateMatrix(matrix);
  assert.deepEqual(rows, [{
    vendor_id: ids.eligible,
    crm_id: "legacy-7",
    usdot_number: "123456",
    mc_number: "MC-765",
    primary_email: " PRICING@Example.COM ",
    vendor_name: " Acme, Inc. ",
    source_row_number: 4
  }]);
  assert.equal(mapCarrierTemplateHeader("Numero USDOT"), "usdot_number");
  assert.equal(mapCarrierTemplateHeader("Correo electronico principal"), "primary_email");
  assert.deepEqual(normalizeCarrierTemplateRows(rows), [{
    vendor_id: ids.eligible,
    crm_id: "legacy-7",
    usdot_number: "123456",
    usdot: "123456",
    mc_number: "MC-765",
    primary_email: "pricing@example.com",
    vendor_name: "Acme, Inc.",
    source_row_number: 4
  }]);
}

// This catches dropped uploaded identifiers, ambiguous chosen-ID provenance,
// malformed escaping, column reordering, and accidental CRM-only enrichment.
{
  const csv = carrierTemplateExceptionCsv([{
    source_row_number: 4,
    status: "ambiguous",
    reason: "Name, \"Acme\" needs review",
    candidate_vendor_ids: [ids.eligible, ids.filtered],
    chosen_vendor_id: ids.filtered,
    requires_manual_confirmation: true,
    source_row: {
      vendor_id: "uploaded-crm-key",
      crm_id: "legacy-7",
      usdot_number: "123456",
      mc_number: "MC-765",
      primary_email: "quote,desk@example.com",
      vendor_name: "Acme, \"North\""
    },
    crm_contact_name: "CRM-only secret contact",
    crm_phone: "+1 555 0100"
  }]);
  assert.equal(
    csv,
    `source_row_number,status,reason,vendor_id,crm_id,usdot_number,mc_number,primary_email,vendor_name,candidate_vendor_ids,chosen_vendor_id,requires_manual_confirmation\r\n4,ambiguous,"Name, ""Acme"" needs review",uploaded-crm-key,legacy-7,123456,MC-765,"quote,desk@example.com","Acme, ""North""",${ids.eligible};${ids.filtered},${ids.filtered},true\r\n`
  );
  assert.doesNotMatch(csv, /CRM-only secret contact|\+1 555 0100/);
}

// This catches spreadsheet formula execution without corrupting genuine numeric
// values that happen to be negative.
{
  const csv = carrierTemplateExceptionCsv([{
    source_row_number: -5,
    status: "normal",
    reason: "@SUM(A1:A2)",
    candidate_vendor_ids: ["+candidate"],
    chosen_vendor_id: "=chosen",
    requires_manual_confirmation: false,
    source_row: {
      vendor_id: "=HYPERLINK(\"https://attacker.test\")",
      crm_id: "\t=cmd",
      usdot_number: -700,
      mc_number: "-2+3",
      primary_email: "\r@cmd",
      vendor_name: "  +hidden"
    }
  }]);
  assert.match(csv, /\r\n-5,normal,'@SUM\(A1:A2\)/, "numeric source rows must remain numeric");
  assert.match(csv, /,"'=HYPERLINK\(""https:\/\/attacker\.test""\)",/);
  assert.match(csv, /,'\t=cmd,-700,'-2\+3,/);
  assert.match(csv, /"'\r@cmd",'  \+hidden,'\+candidate,'=chosen,false\r\n$/);
}

console.log("carrier-list-template browser domain tests passed");
