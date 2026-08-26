import assert from "node:assert/strict";

import {
  carrierTemplateConflictSummary,
  carrierTemplateDraftContentKey,
  carrierTemplateDraftDiff,
  carrierTemplateDraftPayload,
  carrierTemplateImportValidation,
  createCarrierTemplateCapabilityRecoveryController,
  createCarrierTemplateCandidatePoolController,
  createCarrierTemplateDraftMutationController,
  createCarrierTemplateModalFocusController,
  createCarrierTemplateNavigationCoordinator,
  createCarrierTemplateReconciliationController,
  createCarrierTemplateSaveOwnershipController,
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

// A candidate search is materialized exactly once. Paging is then a local,
// immutable operation so later server mutations cannot shift page boundaries.
{
  const serverRows = Array.from({ length: 120 }, (_, index) => ({
    id: `candidate-${String(index).padStart(3, "0")}`,
    vendor_name: `Candidate ${index}`
  }));
  let calls = 0;
  const candidates = createCarrierTemplateCandidatePoolController({ maxCandidates: 1000 });
  const filters = { search: "  Border   Haul ", status: "ACTIVE", channel: "email" };
  const fetcher = async (request) => {
    calls += 1;
    assert.deepEqual(request, {
      search: "Border Haul",
      status: "active",
      channel: "email",
      lightweight: true,
      offset: 0,
      limit: 1000
    });
    return { rows: serverRows, total: 120 };
  };

  await candidates.materialize(filters, fetcher);
  assert.deepEqual(candidates.page(0, 50).rows.map((row) => row.id), serverRows.slice(0, 50).map((row) => row.id));
  serverRows.splice(50, 1, { id: "server-mutated", vendor_name: "Server mutation" });
  assert.deepEqual(
    candidates.page(50, 50).rows.map((row) => row.id),
    Array.from({ length: 50 }, (_, index) => `candidate-${String(index + 50).padStart(3, "0")}`),
    "page two must come from the captured pool"
  );
  assert.equal(candidates.page(50, 50).has_next, true);
  await candidates.materialize({ status: "active", channel: "email", search: "Border Haul" }, fetcher);
  assert.equal(calls, 1, "one normalized signature must make one server call");

  await candidates.materialize({ ...filters, search: "Narrow exact" }, async () => {
    calls += 1;
    return { rows: [{ id: "exact" }], total: 1001 };
  });
  assert.equal(calls, 2);
  assert.deepEqual(candidates.page(0, 50), {
    rows: [],
    total: 1001,
    offset: 0,
    has_previous: false,
    has_next: false,
    requires_refinement: true
  });
  await candidates.materialize({ ...filters, search: "Explicitly truncated" }, async () => ({
    rows: [{ id: "partial" }],
    total: 1,
    truncated: true
  }));
  assert.equal(candidates.page(0, 50).requires_refinement, true);
  assert.equal(candidates.page(0, 50).has_next, false);
}

// A matching dispatched save owns its spinner even after capability loss.
// Completion may be retained for comparison, but must not mutate the draft or
// issue any follow-up write/read while the recovery editor is read-only.
{
  const running = [];
  const saveOwner = createCarrierTemplateSaveOwnershipController({
    onRunningChange: (value) => running.push(value)
  });
  const owner = saveOwner.begin({ session: 5, template_id: "template-a", expected_version: 3 });
  assert.equal(saveOwner.running, true);
  assert.equal(saveOwner.invalidateValidity(owner), true);
  assert.equal(saveOwner.running, true, "capability loss must not orphan spinner ownership");
  assert.equal(saveOwner.canApply(owner, { session: 5, template_id: "template-a", expected_version: 3 }), false);
  assert.equal(saveOwner.finish(owner), true);
  assert.equal(saveOwner.running, false);
  assert.deepEqual(running, [true, false]);

  const newerOwner = saveOwner.begin({ session: 6, template_id: "template-b", expected_version: 1 });
  assert.equal(saveOwner.finish(owner), false, "an old finally cannot clear a newer session's spinner");
  assert.equal(saveOwner.running, true);
  assert.equal(saveOwner.finish(newerOwner), true);

  let recoveryDraft = reduceCarrierTemplateDraft(
    createCarrierTemplateDraftState({ id: "template-a", template_version: 3, segment_name: "Saved locally" }),
    { type: "set_details", description: "Unsaved evidence" }
  );
  const completion = deferred();
  let comparison = null;
  let followUpWritesOrReads = 0;
  const recoveryOwner = saveOwner.begin({ session: 9, template_id: "template-a", expected_version: 3 });
  const saving = completion.promise.then((row) => {
    if (saveOwner.canApply(recoveryOwner, { session: 9, template_id: "template-a", expected_version: 3 })) {
      followUpWritesOrReads += 1;
    } else {
      comparison = row;
      recoveryDraft = reduceCarrierTemplateDraft(recoveryDraft, { type: "go_to_step", step: 3 });
    }
  }).finally(() => saveOwner.finish(recoveryOwner));
  saveOwner.invalidateValidity(recoveryOwner);
  completion.resolve({ id: "template-a", template_version: 4, segment_name: "Saved server snapshot" });
  await saving;
  assert.equal(saveOwner.running, false);
  assert.equal(recoveryDraft.step, 3, "the retained draft must remain inspectable");
  assert.equal(recoveryDraft.dirty, true);
  assert.equal(comparison.template_version, 4);
  assert.equal(followUpWritesOrReads, 0);
}

// A dispatched save owns an immutable content identity. Every UI action must
// go through the same mutation controller, and a late success cannot replace a
// newer local draft even if an integration accidentally bypasses that guard.
{
  let draft = createCarrierTemplateDraftState({
    id: "template-a",
    template_version: 4,
    segment_name: "MX Core",
    vendor_ids: [ids.eligible]
  });
  const controller = createCarrierTemplateDraftMutationController({
    readDraft: () => draft,
    writeDraft: (action) => {
      draft = reduceCarrierTemplateDraft(draft, action);
    }
  });
  const pending = deferred();
  const dispatch = controller.beginSave({ session: 7, template_id: draft.id, expected_version: draft.expected_version });
  const saving = pending.promise.then((row) => controller.completeSave(dispatch, {
    session: 7,
    template_id: "template-a",
    expected_version: 4,
    serverRow: row,
    acceptSaved: (saved) => {
      draft = reduceCarrierTemplateDraft(draft, { type: "accept_saved", template: saved });
    }
  }));

  assert.equal(controller.mutate({ type: "set_details", name: "Late name" }), false);
  assert.equal(controller.mutate({ type: "add_members", vendor_ids: [ids.filtered] }), false);
  assert.equal(draft.name, "MX Core");
  assert.deepEqual(draft.vendor_ids, [ids.eligible]);
  pending.resolve({ id: "template-a", template_version: 5, segment_name: "MX Core", vendor_ids: [ids.eligible] });
  assert.equal(await saving, true);
  assert.equal(draft.expected_version, 5);

  const secondDispatch = controller.beginSave({ session: 8, template_id: draft.id, expected_version: draft.expected_version });
  const savedSnapshot = { id: "template-a", template_version: 6, segment_name: "MX Core", vendor_ids: [ids.eligible] };
  draft = reduceCarrierTemplateDraft(draft, { type: "set_details", name: "Newer local name" });
  let comparison = null;
  assert.equal(controller.completeSave(secondDispatch, {
    session: 8,
    template_id: "template-a",
    expected_version: 5,
    serverRow: savedSnapshot,
    acceptSaved: () => assert.fail("newer local content must not be overwritten"),
    retainComparison: (row) => comparison = row
  }), false);
  assert.equal(draft.name, "Newer local name");
  assert.equal(draft.dirty, true);
  assert.deepEqual(comparison, savedSnapshot);
  assert.equal(carrierTemplateDraftContentKey(draft).includes("Newer local name"), true);
}

// Reconciliation choices and async search results are scoped to both the
// upload generation and an immutable row identity. Starting file B makes every
// file-A preview/search completion ineligible to commit.
{
  const reconciliation = createCarrierTemplateReconciliationController();
  const generationA = reconciliation.startUpload();
  const [rowA] = reconciliation.identifyRows(generationA, [{
    source_row_number: 2,
    status: "ambiguous",
    source_row: { vendor_name: "Carrier A" }
  }]);
  assert.equal(reconciliation.storeChoices({
    generation: generationA,
    row_identity: rowA.resolution_row_identity
  }, [activeVendor(ids.eligible)]), true);
  assert.equal(reconciliation.choicesFor(rowA).length, 1);

  const pendingSearch = deferred();
  const staleSearch = pendingSearch.promise.then((rows) => reconciliation.storeChoices({
    generation: generationA,
    row_identity: rowA.resolution_row_identity
  }, rows));
  const generationB = reconciliation.startUpload();
  assert.equal(reconciliation.choicesFor(rowA).length, 0, "file B must clear stored file-A choices immediately");
  const [rowB] = reconciliation.identifyRows(generationB, [{
    source_row_number: 2,
    status: "ambiguous",
    source_row: { vendor_name: "Carrier B" }
  }]);
  assert.notEqual(rowB.resolution_row_identity, rowA.resolution_row_identity);
  assert.equal(reconciliation.commitPreview(generationA, () => assert.fail("file A preview must be stale")), false);
  let committed = false;
  assert.equal(reconciliation.commitPreview(generationB, () => committed = true), true);
  assert.equal(committed, true);
  pendingSearch.resolve([activeVendor(ids.filtered)]);
  assert.equal(await staleSearch, false);
  assert.equal(reconciliation.choicesFor(rowB).length, 0);

  const currentDraft = reduceCarrierTemplateDraft(
    createCarrierTemplateDraftState({ segment_name: "Generation B" }),
    { type: "apply_resolution_preview", rows: [rowB] }
  );
  const staleChoice = reduceCarrierTemplateDraft(currentDraft, {
    type: "confirm_manual_match",
    source_row_number: 2,
    reconciliation_generation: generationA,
    resolution_row_identity: rowA.resolution_row_identity,
    vendor_id: ids.eligible
  });
  assert.deepEqual(staleChoice.vendor_ids, [], "a file-A choice must not resolve file B's row 2");
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
// modal with Tab/Shift+Tab, background focus, leaked inert state, and detached
// opener restoration after a table re-render.
{
  let opener = { id: "opener", isConnected: true };
  const fallback = { id: "list-templates-tab", isConnected: true };
  const first = { id: "first" };
  const last = { id: "last" };
  const background = { id: "background", inert: false, ariaHidden: "false" };
  let active = opener;
  const focus = createCarrierTemplateModalFocusController({
    getActiveElement: () => active,
    getFocusable: () => [first, last],
    getBackgroundElements: () => [background],
    getBackgroundState: (element) => ({ inert: element.inert, ariaHidden: element.ariaHidden }),
    setBackgroundState: (element, state) => Object.assign(element, state),
    isConnected: (element) => element?.isConnected !== false,
    fallbackFocus: () => fallback,
    focusElement: (element) => {
      active = element;
    }
  });
  focus.open(first, { resolveOpener: () => opener });
  assert.equal(active, first, "opening focus must move inside synchronously");
  assert.deepEqual({ inert: background.inert, ariaHidden: background.ariaHidden }, { inert: true, ariaHidden: "true" });
  active = background;
  assert.equal(focus.containFocus(), true);
  assert.equal(active, first);
  active = last;
  let prevented = false;
  assert.equal(focus.trapTab({ key: "Tab", shiftKey: false, preventDefault: () => prevented = true }), true);
  assert.equal(prevented, true);
  assert.equal(active, first);
  active = first;
  focus.trapTab({ key: "Tab", shiftKey: true, preventDefault() {} });
  assert.equal(active, last);
  const detachedOpener = opener;
  detachedOpener.isConnected = false;
  opener = { id: "opener-rerendered", isConnected: true };
  focus.close();
  assert.equal(active, opener, "close must re-query the attached opener");
  assert.deepEqual({ inert: background.inert, ariaHidden: background.ariaHidden }, { inert: false, ariaHidden: "false" });

  focus.open(first, { resolveOpener: () => detachedOpener });
  focus.close();
  assert.equal(active, fallback, "a detached opener must fall back to List Templates");
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

// File B begins by atomically removing every file-A reconciliation artifact.
// Explicit CRM selections survive, but neither a pending nor failed file B is
// saveable until the operator commits or explicitly dismisses that generation.
{
  let state = createCarrierTemplateDraftState({
    segment_name: "Reconciliation reset",
    vendor_ids: [ids.eligible]
  });
  state = reduceCarrierTemplateDraft(state, { type: "add_members", vendor_ids: [ids.filtered] });
  state = reduceCarrierTemplateDraft(state, { type: "begin_reconciliation", generation: 1 });
  state = reduceCarrierTemplateDraft(state, {
    type: "apply_resolution_preview",
    generation: 1,
    rows: [
      { source_row_number: 2, reconciliation_generation: 1, resolution_row_identity: "1:2:a", status: "matched", vendor_id: ids.participant },
      { source_row_number: 3, reconciliation_generation: 1, resolution_row_identity: "1:3:b", status: "ambiguous", candidate_vendor_ids: [ids.missingContact] }
    ]
  });
  state = reduceCarrierTemplateDraft(state, {
    type: "confirm_manual_match",
    source_row_number: 3,
    reconciliation_generation: 1,
    resolution_row_identity: "1:3:b",
    vendor_id: ids.missingContact
  });
  assert.deepEqual(state.vendor_ids, [ids.eligible, ids.filtered, ids.participant, ids.missingContact]);

  state = reduceCarrierTemplateDraft(state, { type: "begin_reconciliation", generation: 2 });
  assert.deepEqual(state.vendor_ids, [ids.eligible, ids.filtered]);
  assert.deepEqual(state.resolution_rows, []);
  assert.deepEqual(state.manual_resolutions, {});
  assert.equal(state.reconciliation_pending, true);
  assert.equal(validateCarrierTemplateDraft(state, "draft").valid, false);
  let saveApiCalls = 0;
  if (validateCarrierTemplateDraft(state, "draft").valid) saveApiCalls += 1;
  assert.equal(saveApiCalls, 0, "Save during reconciliation must not call the API");

  const staleACommit = reduceCarrierTemplateDraft(state, {
    type: "apply_resolution_preview",
    generation: 1,
    rows: [{ source_row_number: 2, status: "matched", vendor_id: ids.participant }]
  });
  assert.deepEqual(staleACommit, state);

  state = reduceCarrierTemplateDraft(state, { type: "fail_reconciliation", generation: 2, error: "File B failed." });
  assert.equal(state.reconciliation_pending, false);
  assert.equal(state.reconciliation_error, "File B failed.");
  assert.equal(validateCarrierTemplateDraft(state, "draft").valid, false);
  state = reduceCarrierTemplateDraft(state, { type: "dismiss_reconciliation", generation: 2 });
  assert.equal(validateCarrierTemplateDraft(state, "draft").valid, true);
  assert.deepEqual(state.vendor_ids, [ids.eligible, ids.filtered]);
}

// Recovery mode keeps non-mutating step inspection available while every
// content mutation remains rejected and the draft remains dirty.
{
  let state = reduceCarrierTemplateDraft(
    createCarrierTemplateDraftState({ segment_name: "Recovery draft", vendor_ids: [ids.eligible] }),
    { type: "set_details", description: "Unsaved local evidence" }
  );
  let writes = 0;
  const recovery = createCarrierTemplateCapabilityRecoveryController({
    isEditorOpen: () => true,
    isDirty: () => state.dirty,
    requestClose: () => false,
    retainRecovery: () => {},
    setWritable: () => {}
  });
  recovery.transition("enabled");
  recovery.transition("disabled");
  assert.equal(recovery.canMutate, false);
  const contentBefore = carrierTemplateDraftContentKey(state);
  state = reduceCarrierTemplateDraft(state, { type: "go_to_step", step: 3 });
  assert.equal(state.step, 3);
  assert.equal(carrierTemplateDraftContentKey(state), contentBefore);
  assert.equal(state.dirty, true);
  if (recovery.canMutate) writes += 1;
  assert.equal(writes, 0);
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
