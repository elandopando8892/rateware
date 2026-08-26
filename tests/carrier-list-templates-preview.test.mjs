import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewHtmlUrl = new URL("../output/carrier-list-templates-preview.html", import.meta.url);
const previewJsUrl = new URL("../src/carrier-list-templates-preview.js", import.meta.url);
const previewStylesUrl = new URL("../src/styles.css", import.meta.url);

test("preview source is public, noindex, local-only, and uses the approved domain and icon systems", async () => {
  const [html, source, styles] = await Promise.all([
    readFile(previewHtmlUrl, "utf8"),
    readFile(previewJsUrl, "utf8"),
    readFile(previewStylesUrl, "utf8")
  ]);

  assert.match(html, /<meta\s+name="robots"\s+content="noindex,\s*noarchive"/i);
  assert.match(html, /Preview con datos simulados · sin acciones externas/);
  assert.match(html, /carrier-list-templates-preview\.js/);
  assert.doesNotMatch(html, /target="_blank"|https?:\/\//i);

  const productNavigationLabels = [...html.matchAll(/<button class="rw-nav-link"[^>]*aria-label="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(productNavigationLabels, [
    "Command Center",
    "Import",
    "Source Files",
    "Review Queue",
    "Rateware",
    "Analyze",
    "Carrier CRM",
    "RFx Process",
    "Bid Room",
    "Vendor Support",
    "Vendor CI",
    "Settings",
    "Learning Rules"
  ]);
  assert.match(html, /data-preview-nav-collapse[^>]*aria-label="Collapse navigation"/);

  assert.match(source, /import\s*\{[\s\S]*partitionCarrierTemplateMembers[\s\S]*reduceCarrierTemplateDraft[\s\S]*validateCarrierTemplateDraft[\s\S]*\}\s*from\s*["']\.\/carrier-list-template-domain\.js["']/);
  assert.match(source, /import\s*\{\s*registerPlatform55Icons\s*\}\s*from\s*["']\.\/platform55-icons\.js["']/);
  assert.doesNotMatch(source, /from\s*["'][^"']*(?:auth|api|vendor-service|supabase|kinde)[^"']*["']/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(source, /\b(?:serviceWorker|localStorage|sessionStorage|indexedDB|caches)\b/);
  assert.doesNotMatch(source, /Untitled carrier list/i);
  assert.doesNotMatch(source, /data-clt-close-detail/);
  assert.match(source, /function\s+restorePreviewFocus\s*\(/);
  assert.match(source, /data-clt-focus-key=["']screen-heading["']/);
  assert.match(source, /data-clt-focus-key=["']builder-step-/);
  assert.match(source, /\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(source, /data-clt-select-template=["'][^"']+["'][^>]*data-clt-focus-key=["']library-row-/);
  assert.match(source, /data-clt-builder-name[^>]*data-clt-focus-key=["']builder-name["']/);
  assert.match(source, /data-clt-builder-description[^>]*data-clt-focus-key=["']builder-description["']/);
  assert.match(source, /\["\[data-clt-builder-query\]",\s*"builder-query"\]/);
  assert.match(source, /data-clt-candidate=["'][^"']+["'][^>]*data-clt-focus-key=["']builder-candidate-/);
  assert.match(source, /\["\[data-clt-add-selected\]",\s*"builder-add-selected"\]/);
  assert.match(source, /data-clt-remove=["'][^"']+["'][^>]*data-clt-focus-key=["']builder-remove-/);
  assert.match(source, /data-clt-reorder=["'][^"']+["'][^>]*data-clt-focus-key=["']builder-reorder-(?:up|down)-/);
  assert.match(source, /\["\[data-clt-import-preview\]",\s*"builder-import-preview"\]/);
  assert.match(source, /querySelectorAll\(["']\[data-clt-fit-toggle\]["']\)[\s\S]*setAttribute\(["']data-clt-focus-key["'],\s*`fit-carrier-/);
  assert.match(source, /data-clt-save=["']draft["'][^>]*disabled/);
  assert.match(source, /data-clt-save=["']active["'][^>]*disabled/);
  assert.match(source, /role=["']alert["']/);
  assert.doesNotMatch(source, /data-clt-save=["'][^"']+["'][^>]*role=["']tab["']/);
  assert.match(source, /class=["']clt-builder-mode-tabs["'][^>]*role=["']group["'][^>]*aria-label=["']Carrier source["']/);
  assert.match(source, /data-clt-builder-mode=["']crm["'][^>]*aria-pressed=/);
  assert.match(source, /data-clt-builder-mode=["']upload["'][^>]*aria-pressed=/);
  assert.doesNotMatch(source, /role=["']tablist["']|role=["']tab["']/);
  assert.doesNotMatch(source, /data-clt-builder-mode=["'][^"']+["'][^>]*aria-selected=/);
  assert.match(source, /root\.addEventListener\(["']input["']/);

  const inactiveNavRule = styles.match(/\.carrier-template-preview-page \.rw-nav-link\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(inactiveNavRule, /color:\s*var\(--rw-slate-600\)/);
  assert.match(inactiveNavRule, /background:\s*transparent/);
  const hoverNavRule = styles.match(/\.carrier-template-preview-page \.rw-nav-link:hover\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(hoverNavRule, /color:\s*var\(--rw-slate-900\)/);
  assert.match(hoverNavRule, /background:\s*var\(--rw-slate-50\)/);
  const activeNavRule = styles.match(/\.carrier-template-preview-page \.rw-nav-link\.is-active\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(activeNavRule, /color:\s*var\(--rw-brand-700\)/);
  assert.match(activeNavRule, /background:\s*var\(--rw-brand-50\)/);
});

test("preview reducer completes Library to Builder to Carrier Fit to Message locally", async () => {
  const {
    PREVIEW_NOTICE,
    PREVIEW_SCREENS,
    createCarrierTemplatePreviewState,
    filteredPreviewTemplates,
    previewNavigationCollapseState,
    previewCarrierFitSnapshot,
    reduceCarrierTemplatePreview
  } = await import(previewJsUrl);

  assert.equal(PREVIEW_NOTICE, "Preview con datos simulados · sin acciones externas");
  assert.deepEqual(PREVIEW_SCREENS, ["library", "builder", "carrier-fit", "message"]);
  assert.deepEqual(previewNavigationCollapseState(false), { collapsed: true, expanded: false, label: "Expand navigation" });
  assert.deepEqual(previewNavigationCollapseState(true), { collapsed: false, expanded: true, label: "Collapse navigation" });

  let state = createCarrierTemplatePreviewState();
  assert.equal(state.screen, "library");
  assert.deepEqual(state.builder.steps, ["Details", "Add carriers", "Review", "Save"]);

  state = reduceCarrierTemplatePreview(state, { type: "library_filter_status", value: "archived" });
  assert.deepEqual(filteredPreviewTemplates(state).map((row) => row.lifecycle_status), ["archived"]);
  const archivedId = filteredPreviewTemplates(state)[0].id;
  state = reduceCarrierTemplatePreview(state, { type: "library_restore", templateId: archivedId });
  assert.equal(state.templates.find((row) => row.id === archivedId).lifecycle_status, "active");
  state = reduceCarrierTemplatePreview(state, { type: "library_duplicate", templateId: archivedId });
  assert.equal(state.templates.at(-1).lifecycle_status, "draft");
  assert.match(state.templates.at(-1).segment_name, /copy$/i);
  state = reduceCarrierTemplatePreview(state, { type: "library_archive", templateId: archivedId });
  assert.equal(state.templates.find((row) => row.id === archivedId).lifecycle_status, "archived");

  state = reduceCarrierTemplatePreview(state, { type: "builder_new" });
  assert.equal(state.screen, "builder");
  assert.equal(state.builder.draft.step, 0);
  state = reduceCarrierTemplatePreview(state, {
    type: "builder_set_details",
    name: "US–Mexico Priority",
    description: "Deterministic preview template"
  });
  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 1 });
  assert.equal(state.builder.draft.step, 1);

  const carrierIdsBefore = state.carriers.map((row) => row.id);
  const candidateIds = carrierIdsBefore.slice(2, 5);
  for (const vendorId of candidateIds) {
    state = reduceCarrierTemplatePreview(state, { type: "builder_toggle_candidate", vendorId });
  }
  state = reduceCarrierTemplatePreview(state, { type: "builder_add_selected" });
  assert.deepEqual(state.builder.draft.vendor_ids, candidateIds);
  state = reduceCarrierTemplatePreview(state, { type: "builder_reorder", vendorId: candidateIds[2], toIndex: 0 });
  assert.deepEqual(state.builder.draft.vendor_ids, [candidateIds[2], candidateIds[0], candidateIds[1]]);
  state = reduceCarrierTemplatePreview(state, { type: "builder_import_preview" });
  assert.deepEqual(
    [...new Set(state.builder.draft.resolution_rows.map((row) => row.status))].sort(),
    ["ambiguous", "duplicate", "matched", "not_found"]
  );
  assert.deepEqual(state.carriers.map((row) => row.id), carrierIdsBefore, "import preview never creates carriers");
  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 2 });
  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 3 });
  state = reduceCarrierTemplatePreview(state, { type: "builder_save", lifecycleStatus: "active" });
  assert.equal(state.screen, "library");
  assert.equal(state.templates.at(-1).lifecycle_status, "active");

  state = reduceCarrierTemplatePreview(state, { type: "navigate", screen: "carrier-fit" });
  let fit = previewCarrierFitSnapshot(state);
  assert.equal(
    fit.counts.total,
    fit.counts.eligible + fit.counts.already_in_rfx + fit.counts.missing_contact + fit.counts.unavailable,
    "primary Carrier Fit buckets remain mutually exclusive"
  );
  assert.equal(fit.counts.filtered_out, 0);
  assert.equal(state.fit.selectedVendorIds.length, 0, "choosing a template does not select carriers automatically");
  assert.equal(state.fit.cta, "Add 0 carriers to this RFx and open Message");

  const eligibleIds = fit.visible.eligible.map((row) => row.vendor_id);
  state = reduceCarrierTemplatePreview(state, { type: "fit_toggle", vendorId: eligibleIds[0] });
  assert.equal(state.fit.cta, "Add 1 carrier to this RFx and open Message");
  state = reduceCarrierTemplatePreview(state, { type: "fit_toggle", vendorId: eligibleIds[1] });
  assert.equal(state.fit.cta, "Add 2 carriers to this RFx and open Message");
  state = reduceCarrierTemplatePreview(state, { type: "fit_clear" });

  const blockedId = fit.rows.missing_contact[0].vendor_id;
  state = reduceCarrierTemplatePreview(state, { type: "fit_toggle", vendorId: blockedId });
  assert.deepEqual(state.fit.selectedVendorIds, [], "blocked carriers are never selectable");

  state = reduceCarrierTemplatePreview(state, { type: "fit_filter", key: "search", value: "Atlas" });
  fit = previewCarrierFitSnapshot(state);
  assert(fit.counts.filtered_out > 0, "filters expose a non-destructive filtered-out overlay");
  state = reduceCarrierTemplatePreview(state, { type: "fit_select_all_visible" });
  assert.deepEqual(state.fit.selectedVendorIds, fit.visible.eligible.map((row) => row.vendor_id));
  assert.equal(state.fit.cta, "Add 1 carrier to this RFx and open Message");

  state = reduceCarrierTemplatePreview(state, { type: "fit_submit" });
  assert.equal(state.screen, "message");
  assert.equal(state.message.selectedCount, 1);
  const submittedVendorIds = [...state.message.selectedVendorIds];
  assert(submittedVendorIds.every((id) => state.fit.participantVendorIds.includes(id)), "submitted audience materializes into local RFx participants");
  assert.match(state.message.detail, /no draft, send, invitation, persistence, or Delivery action occurred/i);

  state = reduceCarrierTemplatePreview(state, { type: "navigate", screen: "carrier-fit" });
  fit = previewCarrierFitSnapshot(state);
  assert.deepEqual(fit.rows.already_in_rfx.map((row) => row.vendor_id), submittedVendorIds);
  state = reduceCarrierTemplatePreview(state, { type: "fit_toggle", vendorId: submittedVendorIds[0] });
  assert.deepEqual(state.fit.selectedVendorIds, [], "submitted carrier cannot be selected again");
});

test("preview fails closed for invalid saves and archived Carrier Fit templates", async () => {
  const {
    createCarrierTemplatePreviewState,
    previewCarrierFitSnapshot,
    reduceCarrierTemplatePreview
  } = await import(previewJsUrl);

  let state = createCarrierTemplatePreviewState();
  const initialCount = state.templates.length;
  state = reduceCarrierTemplatePreview(state, { type: "builder_new" });
  state = reduceCarrierTemplatePreview(state, { type: "builder_save", lifecycleStatus: "draft" });
  assert.equal(state.screen, "builder");
  assert.equal(state.templates.length, initialCount);
  assert.deepEqual(state.builder.validationErrors.map((error) => error.code), ["name_required"]);

  state = reduceCarrierTemplatePreview(state, { type: "builder_set_details", name: "Valid local draft", description: "" });
  state = reduceCarrierTemplatePreview(state, { type: "builder_save", lifecycleStatus: "active" });
  assert.equal(state.screen, "builder");
  assert.deepEqual(state.builder.validationErrors.map((error) => error.code), ["active_requires_member"]);

  state = createCarrierTemplatePreviewState();
  const selectedFitId = state.fit.templateId;
  const nextActiveId = state.templates.find((template) => template.lifecycle_status === "active" && template.id !== selectedFitId).id;
  state = reduceCarrierTemplatePreview(state, { type: "library_archive", templateId: selectedFitId });
  assert.equal(state.fit.templateId, nextActiveId, "archiving the selected Fit template deterministically selects the next active template");
  assert.equal(previewCarrierFitSnapshot(state).template.id, nextActiveId);
  assert.equal(previewCarrierFitSnapshot(state).template.lifecycle_status, "active");

  state = reduceCarrierTemplatePreview(state, { type: "library_archive", templateId: nextActiveId });
  assert.equal(state.fit.templateId, "");
  assert.equal(previewCarrierFitSnapshot(state).template.id, "");
  assert.equal(previewCarrierFitSnapshot(state).counts.total, 0, "no archived or draft fallback is admitted to Carrier Fit");
});

test("library detail selection always belongs to the filtered result set", async () => {
  const {
    createCarrierTemplatePreviewState,
    filteredPreviewTemplates,
    reduceCarrierTemplatePreview
  } = await import(previewJsUrl);

  let state = createCarrierTemplatePreviewState();
  state = reduceCarrierTemplatePreview(state, { type: "library_filter_query", value: "Manzanillo" });
  assert.equal(filteredPreviewTemplates(state).length, 1);
  assert.equal(state.library.selectedTemplateId, filteredPreviewTemplates(state)[0].id);

  state = reduceCarrierTemplatePreview(state, { type: "library_filter_status", value: "archived" });
  assert(filteredPreviewTemplates(state).every((template) => template.lifecycle_status === "archived"));
  assert.equal(state.library.selectedTemplateId, filteredPreviewTemplates(state)[0]?.id || "");

  state = reduceCarrierTemplatePreview(state, { type: "library_filter_query", value: "no such local template" });
  assert.deepEqual(filteredPreviewTemplates(state), []);
  assert.equal(state.library.selectedTemplateId, "");
});

test("focus restoration keeps stable controls and chooses an adjacent member after removal", async () => {
  const {
    createCarrierTemplatePreviewState,
    previewFocusKeyAfterMemberRemoval,
    reduceCarrierTemplatePreview,
    restorePreviewFocus
  } = await import(previewJsUrl);

  let state = reduceCarrierTemplatePreview(createCarrierTemplatePreviewState(), { type: "builder_new" });
  const memberIds = state.carriers.slice(2, 5).map((carrier) => carrier.id);
  for (const vendorId of memberIds) {
    state = reduceCarrierTemplatePreview(state, { type: "builder_toggle_candidate", vendorId });
  }
  state = reduceCarrierTemplatePreview(state, { type: "builder_add_selected" });

  const middleId = memberIds[1];
  const adjacentKey = previewFocusKeyAfterMemberRemoval(state, middleId);
  assert.equal(adjacentKey, `builder-remove-${memberIds[2]}`);

  const focusLog = [];
  const focusElement = (key, { disabled = false } = {}) => ({
    dataset: { cltFocusKey: key },
    disabled,
    focus(options) { focusLog.push({ key, options }); }
  });
  const heading = focusElement("screen-heading");
  const adjacent = focusElement(adjacentKey);
  const candidate = focusElement(`builder-candidate-${memberIds[0]}`);
  const step = focusElement("builder-step-2");
  const root = { querySelectorAll: () => [heading, adjacent, candidate, step] };

  restorePreviewFocus(root, state, { type: "builder_remove", focusKey: adjacentKey }, `builder-remove-${middleId}`);
  assert.deepEqual(focusLog.pop(), { key: adjacentKey, options: { preventScroll: true } });

  restorePreviewFocus(root, state, { type: "builder_toggle_candidate" }, `builder-candidate-${memberIds[0]}`);
  assert.deepEqual(focusLog.pop(), { key: `builder-candidate-${memberIds[0]}`, options: { preventScroll: true } });

  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 2 });
  restorePreviewFocus(root, state, { type: "builder_go_to_step" }, "builder-continue");
  assert.deepEqual(focusLog.pop(), { key: "builder-step-2", options: { preventScroll: true } });

  const disabledTrigger = focusElement("fit-submit", { disabled: true });
  const fallbackRoot = { querySelectorAll: () => [heading, disabledTrigger] };
  restorePreviewFocus(fallbackRoot, state, { type: "fit_clear" }, "fit-submit");
  assert.deepEqual(focusLog.pop(), { key: "screen-heading", options: { preventScroll: true } });
});

test("input transitions retain builder details through a three-member save flow", async () => {
  const {
    createCarrierTemplatePreviewState,
    previewInputTransition,
    reduceCarrierTemplatePreview
  } = await import(previewJsUrl);

  const inputTarget = (selector, value, dataset = {}) => ({
    value,
    dataset,
    selectionStart: String(value).length,
    selectionEnd: String(value).length,
    matches(candidate) { return candidate === selector; }
  });

  let state = reduceCarrierTemplatePreview(createCarrierTemplatePreviewState(), { type: "builder_new" });
  let transition = previewInputTransition(state, inputTarget("[data-clt-builder-name]", "US–Mexico Priority"));
  assert.equal(transition.render, false, "details update state without replacing the focused input");
  state = transition.state;

  transition = previewInputTransition(state, inputTarget("[data-clt-builder-description]", "Priority cross-border carriers"));
  assert.equal(transition.render, false, "description input keeps its DOM node and caret");
  state = transition.state;
  assert.equal(state.builder.draft.name, "US–Mexico Priority");
  assert.equal(state.builder.draft.description, "Priority cross-border carriers");

  transition = previewInputTransition(state, inputTarget("[data-clt-builder-query]", "Atlas"));
  assert.equal(transition.render, true, "search input rerenders its result set");
  assert.deepEqual(transition.selection, { start: 5, end: 5 }, "search input preserves its caret around rerender");
  state = transition.state;
  assert.equal(state.builder.query, "Atlas");

  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 1 });
  const candidateIds = state.carriers.slice(2, 5).map((carrier) => carrier.id);
  for (const vendorId of candidateIds) {
    state = reduceCarrierTemplatePreview(state, { type: "builder_toggle_candidate", vendorId });
  }
  state = reduceCarrierTemplatePreview(state, { type: "builder_add_selected" });
  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 2 });
  state = reduceCarrierTemplatePreview(state, { type: "builder_go_to_step", step: 3 });

  assert.equal(state.builder.draft.name, "US–Mexico Priority");
  assert.equal(state.builder.draft.description, "Priority cross-border carriers");
  assert.deepEqual(state.builder.draft.vendor_ids, candidateIds);

  state = reduceCarrierTemplatePreview(state, { type: "builder_save", lifecycleStatus: "active" });
  assert.equal(state.screen, "library");
  assert.equal(state.templates.at(-1).segment_name, "US–Mexico Priority");
  assert.equal(state.templates.at(-1).description, "Priority cross-border carriers");
  assert.deepEqual(state.templates.at(-1).vendor_ids, candidateIds);
});
