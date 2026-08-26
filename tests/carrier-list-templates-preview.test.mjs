import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewHtmlUrl = new URL("../output/carrier-list-templates-preview.html", import.meta.url);
const previewJsUrl = new URL("../src/carrier-list-templates-preview.js", import.meta.url);

test("preview source is public, noindex, local-only, and uses the approved domain and icon systems", async () => {
  const [html, source] = await Promise.all([
    readFile(previewHtmlUrl, "utf8"),
    readFile(previewJsUrl, "utf8")
  ]);

  assert.match(html, /<meta\s+name="robots"\s+content="noindex,\s*noarchive"/i);
  assert.match(html, /Preview con datos simulados · sin acciones externas/);
  assert.match(html, /carrier-list-templates-preview\.js/);
  assert.doesNotMatch(html, /target="_blank"|https?:\/\//i);

  assert.match(source, /import\s*\{[\s\S]*partitionCarrierTemplateMembers[\s\S]*reduceCarrierTemplateDraft[\s\S]*\}\s*from\s*["']\.\/carrier-list-template-domain\.js["']/);
  assert.match(source, /import\s*\{\s*registerPlatform55Icons\s*\}\s*from\s*["']\.\/platform55-icons\.js["']/);
  assert.doesNotMatch(source, /from\s*["'][^"']*(?:auth|api|vendor-service|supabase|kinde)[^"']*["']/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(source, /\b(?:serviceWorker|localStorage|sessionStorage|indexedDB|caches)\b/);
});

test("preview reducer completes Library to Builder to Carrier Fit to Message locally", async () => {
  const {
    PREVIEW_NOTICE,
    PREVIEW_SCREENS,
    createCarrierTemplatePreviewState,
    filteredPreviewTemplates,
    previewCarrierFitSnapshot,
    reduceCarrierTemplatePreview
  } = await import(previewJsUrl);

  assert.equal(PREVIEW_NOTICE, "Preview con datos simulados · sin acciones externas");
  assert.deepEqual(PREVIEW_SCREENS, ["library", "builder", "carrier-fit", "message"]);

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

  const blockedId = fit.rows.missing_contact[0].vendor_id;
  state = reduceCarrierTemplatePreview(state, { type: "fit_toggle", vendorId: blockedId });
  assert.deepEqual(state.fit.selectedVendorIds, [], "blocked carriers are never selectable");

  state = reduceCarrierTemplatePreview(state, { type: "fit_filter", key: "search", value: "Atlas" });
  fit = previewCarrierFitSnapshot(state);
  assert(fit.counts.filtered_out > 0, "filters expose a non-destructive filtered-out overlay");
  state = reduceCarrierTemplatePreview(state, { type: "fit_select_all_visible" });
  assert.deepEqual(state.fit.selectedVendorIds, fit.visible.eligible.map((row) => row.vendor_id));
  assert.equal(state.fit.cta, `Add ${state.fit.selectedVendorIds.length} carriers to this RFx and open Message`);

  state = reduceCarrierTemplatePreview(state, { type: "fit_submit" });
  assert.equal(state.screen, "message");
  assert.equal(state.message.selectedCount, 1);
  assert.match(state.message.detail, /no draft, send, invitation, persistence, or Delivery action occurred/i);
});
