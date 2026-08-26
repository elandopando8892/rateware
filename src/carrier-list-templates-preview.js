import {
  createCarrierTemplateDraftState,
  partitionCarrierTemplateMembers,
  reduceCarrierTemplateDraft,
  validateCarrierTemplateDraft
} from "./carrier-list-template-domain.js";
import { registerPlatform55Icons } from "./platform55-icons.js";

export const PREVIEW_NOTICE = "Preview con datos simulados · sin acciones externas";
export const PREVIEW_SCREENS = ["library", "builder", "carrier-fit", "message"];

export function previewCarrierFitCta(selectedCount) {
  const count = Math.max(0, Number(selectedCount) || 0);
  return `Add ${count} carrier${count === 1 ? "" : "s"} to this RFx and open Message`;
}

export function previewNavigationCollapseState(currentCollapsed) {
  const collapsed = !Boolean(currentCollapsed);
  return {
    collapsed,
    expanded: !collapsed,
    label: collapsed ? "Expand navigation" : "Collapse navigation"
  };
}

const PREVIEW_CARRIERS = [
  { id: "b1000000-0000-4000-8000-000000000001", crm_id: "CRM-100245", name: "Premier Logistics Inc.", coverage: "National", equipment: "Dry Van, Reefer", primary_email: "dispatch@premier.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000002", crm_id: "CRM-100312", name: "Summit Trucking LLC", coverage: "Regional", equipment: "Flatbed, Step Deck", primary_email: "ops@summit.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000003", crm_id: "CRM-100689", name: "Atlas Freight Systems", coverage: "National", equipment: "Flatbed, Reefer", primary_email: "dispatch@atlas.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000004", crm_id: "CRM-100602", name: "Gulf Coast Freight", coverage: "Regional", equipment: "Dry Van, Reefer", primary_email: "team@gulf.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000005", crm_id: "CRM-100913", name: "Pinnacle Freight", coverage: "Regional", equipment: "Dry Van, Reefer", primary_email: "", status: "active", lane_fit: "Partial fit" },
  { id: "b1000000-0000-4000-8000-000000000006", crm_id: "CRM-101047", name: "Coastal Carriers", coverage: "Regional", equipment: "Flatbed", primary_email: "dispatch@coastal.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000007", crm_id: "CRM-100745", name: "NorthStar Logistics", coverage: "Regional", equipment: "Dry Van", primary_email: "ops@northstar.example", status: "active", lane_fit: "Partial fit" },
  { id: "b1000000-0000-4000-8000-000000000008", crm_id: "CRM-100521", name: "Redwood Transport", coverage: "Regional", equipment: "Dry Van", primary_email: "dispatch@redwood.example", status: "archived", lane_fit: "Unavailable" },
  { id: "b1000000-0000-4000-8000-000000000009", crm_id: "CRM-101206", name: "Lone Star Logistics", coverage: "Regional", equipment: "Dry Van, Reefer", primary_email: "ops@lonestar.example", status: "archived", lane_fit: "Unavailable" },
  { id: "b1000000-0000-4000-8000-000000000010", crm_id: "CRM-100408", name: "BlueLine Carriers", coverage: "National", equipment: "Dry Van, Reefer", primary_email: "hello@blueline.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000011", crm_id: "CRM-100812", name: "Velocity Carriers", coverage: "National", equipment: "Dry Van, Power Only", primary_email: "dispatch@velocity.example", status: "active", lane_fit: "Recommended" },
  { id: "b1000000-0000-4000-8000-000000000012", crm_id: "CRM-101102", name: "Titan Transport", coverage: "National", equipment: "Dry Van", primary_email: "team@titan.example", status: "active", lane_fit: "Recommended" }
];

const CORE_MEMBER_IDS = PREVIEW_CARRIERS.slice(0, 9).map((carrier) => carrier.id);
const PREVIEW_TEMPLATES = [
  { id: "a1000000-0000-4000-8000-000000000001", segment_name: "Cross-Border MX–US Core", description: "Core cross-border partners across key MX–US lanes.", vendor_ids: CORE_MEMBER_IDS, lifecycle_status: "active", updated_at: "Aug 25, 2026 · 10:32 AM", owner: "Jose Andres" },
  { id: "a1000000-0000-4000-8000-000000000002", segment_name: "Manzanillo Port Drayage", description: "Approved drayage carriers serving Manzanillo.", vendor_ids: PREVIEW_CARRIERS.slice(1, 7).map((carrier) => carrier.id), lifecycle_status: "active", updated_at: "Aug 12, 2026 · 3:18 PM", owner: "Jose Andres" },
  { id: "a1000000-0000-4000-8000-000000000003", segment_name: "Reefer Northbound", description: "Reefer capacity providers for northbound loads.", vendor_ids: PREVIEW_CARRIERS.slice(0, 6).map((carrier) => carrier.id), lifecycle_status: "draft", updated_at: "Aug 5, 2026 · 9:05 AM", owner: "Maria Martinez" },
  { id: "a1000000-0000-4000-8000-000000000004", segment_name: "Q4 Backup Capacity", description: "Backup capacity providers for Q4 peak season.", vendor_ids: PREVIEW_CARRIERS.slice(3, 9).map((carrier) => carrier.id), lifecycle_status: "archived", updated_at: "Aug 1, 2026 · 2:47 PM", owner: "Trevor Bennett" }
];

const IMPORT_RESOLUTION_ROWS = [
  { source_row_number: 2, source_value: "CRM-100689", status: "matched", vendor_id: PREVIEW_CARRIERS[2].id, reason: "Exact CRM ID" },
  { source_row_number: 3, source_value: "Border Express", status: "ambiguous", reason: "2 exact normalized-name candidates" },
  { source_row_number: 4, source_value: "CRM-199999", status: "not_found", reason: "CRM ID not found in this workspace" },
  { source_row_number: 5, source_value: "CRM-100689", status: "duplicate", vendor_id: PREVIEW_CARRIERS[2].id, reason: "Duplicate row excluded" }
];

function copyRows(rows) {
  return rows.map((row) => ({ ...row, vendor_ids: Array.isArray(row.vendor_ids) ? [...row.vendor_ids] : row.vendor_ids }));
}

function nextTemplateId(templates) {
  return `a2000000-0000-4000-8000-${String(templates.length + 1).padStart(12, "0")}`;
}

function createEmptyBuilder() {
  return {
    steps: ["Details", "Add carriers", "Review", "Save"],
    mode: "crm",
    query: "",
    selectedCandidateIds: [],
    validationErrors: [],
    draft: createCarrierTemplateDraftState()
  };
}

export function createCarrierTemplatePreviewState() {
  return {
    screen: "library",
    templates: copyRows(PREVIEW_TEMPLATES),
    carriers: copyRows(PREVIEW_CARRIERS),
    library: { query: "", status: "all", selectedTemplateId: PREVIEW_TEMPLATES[0].id },
    builder: createEmptyBuilder(),
    fit: {
      templateId: PREVIEW_TEMPLATES[0].id,
      participantVendorIds: PREVIEW_CARRIERS.slice(0, 2).map((carrier) => carrier.id),
      filters: { search: "", lane_fit: "all", equipment: "all", contact: "all", rfx_status: "all" },
      selectedVendorIds: [],
      cta: previewCarrierFitCta(0)
    },
    message: { selectedCount: 0, selectedVendorIds: [], detail: "" },
    notice: ""
  };
}

export function filteredPreviewTemplates(state) {
  const query = String(state.library.query || "").trim().toLowerCase();
  return state.templates.filter((template) => {
    const matchesStatus = state.library.status === "all" || template.lifecycle_status === state.library.status;
    const haystack = `${template.segment_name} ${template.description}`.toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function fitFilterPasses(filters, row) {
  const query = String(filters.search || "").trim().toLowerCase();
  if (query && !`${row.name || ""} ${row.crm_id || ""}`.toLowerCase().includes(query)) return false;
  if (filters.lane_fit !== "all" && String(row.lane_fit).toLowerCase() !== filters.lane_fit) return false;
  if (filters.equipment !== "all" && !String(row.equipment).toLowerCase().includes(filters.equipment)) return false;
  if (filters.contact === "ready" && !row.primary_email) return false;
  if (filters.contact === "missing" && row.primary_email) return false;
  if (filters.rfx_status === "already" && row.primary_state !== "already_in_rfx") return false;
  if (filters.rfx_status === "not-in-rfx" && row.primary_state === "already_in_rfx") return false;
  return true;
}

export function previewCarrierFitSnapshot(state) {
  const template = state.templates.find((row) => row.id === state.fit.templateId && row.lifecycle_status === "active") || {
    id: "",
    segment_name: "",
    description: "",
    lifecycle_status: "",
    vendor_ids: []
  };
  const partition = partitionCarrierTemplateMembers({
    template,
    vendors: state.carriers,
    participantVendorIds: state.fit.participantVendorIds,
    passesFilters: (row) => fitFilterPasses(state.fit.filters, row)
  });
  const filtered = new Set(partition.filtered_out_ids);
  return {
    ...partition,
    template,
    visible: Object.fromEntries(Object.entries(partition.rows).map(([key, rows]) => [key, rows.filter((row) => !filtered.has(row.vendor_id))]))
  };
}

function cloneState(state) {
  return {
    ...state,
    templates: copyRows(state.templates),
    carriers: copyRows(state.carriers),
    library: { ...state.library },
    builder: {
      ...state.builder,
      steps: [...state.builder.steps],
      selectedCandidateIds: [...state.builder.selectedCandidateIds],
      validationErrors: state.builder.validationErrors.map((error) => ({ ...error })),
      draft: {
        ...state.builder.draft,
        vendor_ids: [...state.builder.draft.vendor_ids],
        resolution_rows: state.builder.draft.resolution_rows.map((row) => ({ ...row })),
        manual_resolutions: { ...state.builder.draft.manual_resolutions },
        member_sources: Object.fromEntries(Object.entries(state.builder.draft.member_sources || {}).map(([id, sources]) => [id, [...sources]]))
      }
    },
    fit: { ...state.fit, participantVendorIds: [...state.fit.participantVendorIds], selectedVendorIds: [...state.fit.selectedVendorIds], filters: { ...state.fit.filters } },
    message: { ...state.message, selectedVendorIds: [...state.message.selectedVendorIds] }
  };
}

function updateFitCta(state) {
  state.fit.cta = previewCarrierFitCta(state.fit.selectedVendorIds.length);
}

export function previewFocusKeyAfterMemberRemoval(state, vendorId) {
  const memberIds = Array.isArray(state?.builder?.draft?.vendor_ids) ? state.builder.draft.vendor_ids : [];
  const index = memberIds.indexOf(vendorId);
  if (index < 0) return "builder-add-selected";
  const adjacentId = memberIds[index + 1] || memberIds[index - 1];
  return adjacentId ? `builder-remove-${adjacentId}` : "builder-add-selected";
}

function reconcileLibrarySelection(state) {
  const visible = filteredPreviewTemplates(state);
  if (!visible.some((template) => template.id === state.library.selectedTemplateId)) {
    state.library.selectedTemplateId = visible[0]?.id || "";
  }
}

function reconcileFitTemplate(state) {
  const current = state.templates.find((template) => template.id === state.fit.templateId && template.lifecycle_status === "active");
  if (current) return;
  state.fit.templateId = state.templates.find((template) => template.lifecycle_status === "active")?.id || "";
  state.fit.selectedVendorIds = [];
}

export function reduceCarrierTemplatePreview(state, action = {}) {
  const next = cloneState(state);
  if (action.type === "navigate" && PREVIEW_SCREENS.includes(action.screen)) {
    next.screen = action.screen;
    if (action.screen === "carrier-fit") next.fit.selectedVendorIds = [];
  } else if (action.type === "library_filter_query") {
    next.library.query = String(action.value || "");
  } else if (action.type === "library_filter_status") {
    next.library.status = ["all", "active", "draft", "archived"].includes(action.value) ? action.value : "all";
  } else if (action.type === "library_select") {
    if (next.templates.some((row) => row.id === action.templateId)) next.library.selectedTemplateId = action.templateId;
  } else if (action.type === "library_restore" || action.type === "library_archive") {
    const template = next.templates.find((row) => row.id === action.templateId);
    if (template) template.lifecycle_status = action.type === "library_restore" ? "active" : "archived";
  } else if (action.type === "library_duplicate") {
    const template = next.templates.find((row) => row.id === action.templateId);
    if (template) {
      const duplicate = { ...template, id: nextTemplateId(next.templates), segment_name: `${template.segment_name} copy`, lifecycle_status: "draft", updated_at: "Just now", owner: "Jose Andres", vendor_ids: [...template.vendor_ids] };
      next.templates.push(duplicate);
      next.library.selectedTemplateId = duplicate.id;
      next.notice = `${duplicate.segment_name} created as a local draft.`;
    }
  } else if (action.type === "builder_new") {
    next.screen = "builder";
    next.builder = createEmptyBuilder();
  } else if (action.type === "builder_open") {
    const template = next.templates.find((row) => row.id === action.templateId);
    if (template) {
      next.screen = "builder";
      next.builder = { ...createEmptyBuilder(), draft: createCarrierTemplateDraftState(template) };
    }
  } else if (action.type === "builder_set_details") {
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "set_details", name: action.name, description: action.description });
    next.builder.validationErrors = [];
  } else if (action.type === "builder_go_to_step") {
    next.builder.draft.step = Math.max(0, Math.min(3, Number(action.step) || 0));
  } else if (action.type === "builder_set_mode") {
    next.builder.mode = action.value === "upload" ? "upload" : "crm";
  } else if (action.type === "builder_filter_query") {
    next.builder.query = String(action.value || "");
  } else if (action.type === "builder_toggle_candidate") {
    const id = String(action.vendorId || "");
    if (next.carriers.some((row) => row.id === id)) {
      next.builder.selectedCandidateIds = next.builder.selectedCandidateIds.includes(id)
        ? next.builder.selectedCandidateIds.filter((value) => value !== id)
        : [...next.builder.selectedCandidateIds, id];
    }
  } else if (action.type === "builder_add_selected") {
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "add_members", vendor_ids: next.builder.selectedCandidateIds });
    next.builder.selectedCandidateIds = [];
    next.builder.validationErrors = [];
  } else if (action.type === "builder_remove") {
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "remove_member", vendor_id: action.vendorId });
    next.builder.validationErrors = [];
  } else if (action.type === "builder_reorder") {
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "reorder_member", vendor_id: action.vendorId, to_index: action.toIndex });
  } else if (action.type === "builder_import_preview") {
    const generation = next.builder.draft.reconciliation_generation + 1;
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "begin_reconciliation", generation });
    next.builder.draft = reduceCarrierTemplateDraft(next.builder.draft, { type: "apply_resolution_preview", generation, rows: IMPORT_RESOLUTION_ROWS });
    next.builder.mode = "upload";
    next.builder.validationErrors = [];
  } else if (action.type === "builder_save") {
    const lifecycleStatus = action.lifecycleStatus === "active" ? "active" : "draft";
    const validation = validateCarrierTemplateDraft(next.builder.draft, lifecycleStatus);
    next.builder.validationErrors = validation.errors.map((error) => ({ ...error }));
    if (!validation.valid) {
      next.screen = "builder";
      next.builder.draft.step = 3;
      next.notice = validation.errors.map((error) => error.message).join(" ");
    } else {
      const savedId = next.builder.draft.id || nextTemplateId(next.templates);
      const saved = {
        id: savedId,
        segment_name: next.builder.draft.name.trim(),
        description: next.builder.draft.description.trim(),
        vendor_ids: [...next.builder.draft.vendor_ids],
        lifecycle_status: lifecycleStatus,
        updated_at: "Just now",
        owner: "Jose Andres"
      };
      const index = next.templates.findIndex((row) => row.id === savedId);
      if (index >= 0) next.templates[index] = saved;
      else next.templates.push(saved);
      next.library.selectedTemplateId = savedId;
      if (lifecycleStatus === "active") next.fit.templateId = savedId;
      next.screen = "library";
      next.notice = `${saved.segment_name} saved as ${lifecycleStatus}. No external action occurred.`;
    }
  } else if (action.type === "fit_choose_template") {
    const template = next.templates.find((row) => row.id === action.templateId && row.lifecycle_status === "active");
    if (template) {
      next.fit.templateId = template.id;
      next.fit.selectedVendorIds = [];
    }
  } else if (action.type === "fit_filter") {
    if (Object.hasOwn(next.fit.filters, action.key)) next.fit.filters[action.key] = String(action.value || "");
    const visibleEligible = new Set(previewCarrierFitSnapshot(next).visible.eligible.map((row) => row.vendor_id));
    next.fit.selectedVendorIds = next.fit.selectedVendorIds.filter((id) => visibleEligible.has(id));
  } else if (action.type === "fit_toggle") {
    const visibleEligible = new Set(previewCarrierFitSnapshot(next).visible.eligible.map((row) => row.vendor_id));
    if (visibleEligible.has(action.vendorId)) {
      next.fit.selectedVendorIds = next.fit.selectedVendorIds.includes(action.vendorId)
        ? next.fit.selectedVendorIds.filter((id) => id !== action.vendorId)
        : [...next.fit.selectedVendorIds, action.vendorId];
    }
  } else if (action.type === "fit_select_all_visible") {
    next.fit.selectedVendorIds = previewCarrierFitSnapshot(next).visible.eligible.map((row) => row.vendor_id);
  } else if (action.type === "fit_clear") {
    next.fit.selectedVendorIds = [];
  } else if (action.type === "fit_submit" && next.fit.selectedVendorIds.length) {
    const eligibleIds = new Set(previewCarrierFitSnapshot(next).visible.eligible.map((row) => row.vendor_id));
    const audience = next.fit.selectedVendorIds.filter((id) => eligibleIds.has(id));
    if (audience.length) {
      next.fit.participantVendorIds = [...new Set([...next.fit.participantVendorIds, ...audience])];
      next.screen = "message";
      next.message = {
        selectedCount: audience.length,
        selectedVendorIds: [...audience],
        detail: "Simulation complete: no draft, send, invitation, persistence, or Delivery action occurred."
      };
    }
  }
  reconcileLibrarySelection(next);
  reconcileFitTemplate(next);
  updateFitCta(next);
  return next;
}

export function previewInputTransition(state, target) {
  const value = String(target?.value ?? "");
  let action = null;
  let render = true;
  if (target?.matches?.("[data-clt-builder-name]")) {
    action = { type: "builder_set_details", name: value, description: state.builder.draft.description };
    render = false;
  } else if (target?.matches?.("[data-clt-builder-description]")) {
    action = { type: "builder_set_details", name: state.builder.draft.name, description: value };
    render = false;
  } else if (target?.matches?.("[data-clt-library-query]")) {
    action = { type: "library_filter_query", value };
  } else if (target?.matches?.("[data-clt-builder-query]")) {
    action = { type: "builder_filter_query", value };
  } else if (target?.matches?.('[data-clt-fit-filter="search"]')) {
    action = { type: "fit_filter", key: "search", value };
  }
  if (!action) return null;
  const start = Number.isInteger(target.selectionStart) ? target.selectionStart : value.length;
  const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : start;
  return {
    action,
    render,
    selection: { start, end },
    state: reduceCarrierTemplatePreview(state, action)
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function previewIcon(name) {
  return `<rw-icon name="${escapeHtml(name)}"></rw-icon>`;
}

function lifecycleBadge(status) {
  return `<span class="clt-badge is-${escapeHtml(status)}">${escapeHtml(status[0].toUpperCase() + status.slice(1))}</span>`;
}

function renderLibrary(state) {
  const templates = filteredPreviewTemplates(state);
  const selected = templates.find((row) => row.id === state.library.selectedTemplateId) || null;
  const rows = templates.map((template) => {
    const isSelected = selected?.id === template.id;
    const archiveAction = template.lifecycle_status === "archived"
      ? `<button class="clt-link" type="button" data-clt-action="restore" data-template-id="${template.id}" data-clt-focus-key="library-lifecycle-${template.id}">Restore</button>`
      : `<button class="clt-link" type="button" data-clt-action="archive" data-template-id="${template.id}" data-clt-focus-key="library-lifecycle-${template.id}">Archive</button>`;
    return `<tr class="${isSelected ? "is-selected" : ""}" data-clt-select-template="${template.id}" data-clt-focus-key="library-row-${template.id}" tabindex="0" aria-selected="${isSelected}">
      <td><strong>${escapeHtml(template.segment_name)}</strong><small>${escapeHtml(template.description)}</small></td>
      <td><b>${template.vendor_ids.length}</b></td>
      <td><span>${escapeHtml(template.updated_at.split(" · ")[0])}</span><small>${escapeHtml(template.updated_at.split(" · ")[1] || "")}</small></td>
      <td><span class="clt-owner"><b>${escapeHtml(template.owner.split(" ").map((part) => part[0]).join(""))}</b>${escapeHtml(template.owner)}</span></td>
      <td>${lifecycleBadge(template.lifecycle_status)}</td>
      <td><div class="clt-row-actions"><button class="clt-link" type="button" data-clt-action="open" data-template-id="${template.id}" data-clt-focus-key="library-open-${template.id}">Open</button><button class="clt-link" type="button" data-clt-action="duplicate" data-template-id="${template.id}" data-clt-focus-key="library-duplicate-${template.id}">Duplicate</button>${archiveAction}</div></td>
    </tr>`;
  }).join("");
  return `<section class="clt-screen clt-library-screen" aria-labelledby="clt-library-title">
    <header class="clt-page-heading"><p>SOURCE · CARRIER CRM</p><h1 tabindex="-1" data-clt-focus-key="screen-heading">Carrier CRM</h1><span>Source, qualify, and prepare carriers for governed procurement.</span></header>
    <nav class="clt-workspace-tabs" aria-label="Carrier CRM workspaces">
      <button type="button">Pipeline <small>Procurement board</small></button><button type="button">Directory <small>Editable carrier grid</small></button><button type="button">Import <small>Sheets and quick create</small></button><button type="button">Duplicates <small>Merge review</small></button><button type="button">Intelligence <small>Signals and fit</small></button><button class="is-active" type="button">List Templates <small>Reusable lists</small></button><button type="button">More tools</button>
    </nav>
    <div class="clt-library-layout">
      <article class="clt-panel clt-library-panel">
        <header class="clt-panel-heading"><div><h2 id="clt-library-title">Carrier list templates</h2><p>Build reusable invitation lists from carriers already in your CRM.</p></div></header>
        <div class="clt-toolbar">
          <label class="clt-search">${previewIcon("search")}<span class="sr-only">Search templates</span><input type="search" value="${escapeHtml(state.library.query)}" placeholder="Search templates…" data-clt-library-query data-clt-focus-key="library-query" /></label>
          <label><span class="sr-only">Template status</span><select data-clt-library-status data-clt-focus-key="library-status"><option value="all" ${state.library.status === "all" ? "selected" : ""}>Status: All</option><option value="active" ${state.library.status === "active" ? "selected" : ""}>Status: Active</option><option value="draft" ${state.library.status === "draft" ? "selected" : ""}>Status: Draft</option><option value="archived" ${state.library.status === "archived" ? "selected" : ""}>Status: Archived</option></select></label>
          <button class="clt-primary" type="button" data-clt-action="new" data-clt-focus-key="library-new">New template</button>
        </div>
        <div class="clt-table-scroll"><table class="clt-table"><thead><tr><th>Template</th><th>Members</th><th>Updated</th><th>Owner</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="clt-empty">No templates match these filters.</div></td></tr>`}</tbody></table></div>
        <footer class="clt-table-footer"><span>${previewIcon("warning")} Templates use only existing Carrier CRM carrier IDs.</span><span>${templates.length} of ${state.templates.length} templates</span></footer>
      </article>
      <aside class="clt-panel clt-detail-panel" aria-label="Selected template details">
        ${selected ? `<header><h2>${escapeHtml(selected.segment_name)}</h2></header><section><h3>Template details</h3><dl><dt>Description</dt><dd>${escapeHtml(selected.description)}</dd><dt>Members</dt><dd>${selected.vendor_ids.length} carriers</dd><dt>Status</dt><dd>${lifecycleBadge(selected.lifecycle_status)}<small>${selected.lifecycle_status === "active" ? "Used for new RFx" : "Not shown in Carrier Fit"}</small></dd><dt>Last updated</dt><dd>${escapeHtml(selected.updated_at.replace(" · ", " at "))}</dd><dt>Owner</dt><dd>${escapeHtml(selected.owner)}</dd></dl></section><p class="clt-callout">${previewIcon("warning")}<span>Membership is static. Editing a carrier profile does not change this list.</span></p>` : `<div class="clt-empty">No template in the current filters is selected.</div>`}
      </aside>
    </div>
  </section>`;
}

function renderBuilderStep(state) {
  const { builder } = state;
  const { draft } = builder;
  const members = draft.vendor_ids.map((id) => state.carriers.find((carrier) => carrier.id === id)).filter(Boolean);
  if (draft.step === 0) {
    return `<div class="clt-form-card"><header><span>1</span><div><h2>Name this reusable carrier list</h2><p>Details describe the template. Membership stays tied to exact Carrier CRM IDs.</p></div></header><label>Template name<input type="text" value="${escapeHtml(draft.name)}" placeholder="e.g. US–Mexico Priority" data-clt-builder-name data-clt-focus-key="builder-name" /></label><label>Description<textarea rows="4" placeholder="Describe when the team should use this list" data-clt-builder-description data-clt-focus-key="builder-description">${escapeHtml(draft.description)}</textarea></label><p class="clt-callout">${previewIcon("warning")} A draft requires a name. Activation also requires at least one valid carrier.</p></div>`;
  }
  if (draft.step === 1) {
    const query = builder.query.trim().toLowerCase();
    const candidates = state.carriers.filter((carrier) => !query || `${carrier.name} ${carrier.crm_id}`.toLowerCase().includes(query));
    const candidateRows = candidates.map((carrier) => `<label class="clt-carrier-row"><input type="checkbox" data-clt-candidate="${carrier.id}" data-clt-focus-key="builder-candidate-${carrier.id}" ${builder.selectedCandidateIds.includes(carrier.id) ? "checked" : ""} /><span><strong>${escapeHtml(carrier.name)}</strong><small>${escapeHtml(carrier.crm_id)}</small></span><span>${escapeHtml(carrier.coverage)}</span><span>${escapeHtml(carrier.equipment)}</span><span class="${carrier.primary_email ? "is-ready" : "is-warning"}">${carrier.primary_email ? "Yes" : "No"}</span></label>`).join("");
    const memberRows = members.map((carrier, index) => `<div class="clt-member-row"><span class="clt-drag-handle" aria-hidden="true">${previewIcon("menu")}</span><span><strong>${escapeHtml(carrier.name)}</strong><small>${escapeHtml(carrier.crm_id)}</small></span><span>${escapeHtml(carrier.coverage)}</span><span>${escapeHtml(carrier.equipment)}</span><div><button type="button" data-clt-reorder="${carrier.id}" data-to-index="${Math.max(0, index - 1)}" data-clt-focus-key="builder-reorder-up-${carrier.id}" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(carrier.name)} up">${previewIcon("chevron")}</button><button type="button" data-clt-reorder="${carrier.id}" data-to-index="${Math.min(members.length - 1, index + 1)}" data-clt-focus-key="builder-reorder-down-${carrier.id}" ${index === members.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(carrier.name)} down">${previewIcon("chevron")}</button><button type="button" data-clt-remove="${carrier.id}" data-clt-focus-key="builder-remove-${carrier.id}" aria-label="Remove ${escapeHtml(carrier.name)}">${previewIcon("close")}</button></div></div>`).join("");
    const resolution = draft.resolution_rows.map((row) => `<tr><td>${row.source_row_number}</td><td>${escapeHtml(row.source_value)}</td><td>${lifecycleBadge(row.status)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join("");
    return `<div class="clt-builder-mode-tabs" role="group" aria-label="Carrier source"><button class="${builder.mode === "crm" ? "is-active" : ""}" type="button" data-clt-builder-mode="crm" data-clt-focus-key="builder-mode-crm" aria-pressed="${builder.mode === "crm"}">Select from Carrier CRM</button><button class="${builder.mode === "upload" ? "is-active" : ""}" type="button" data-clt-builder-mode="upload" data-clt-focus-key="builder-mode-upload" aria-pressed="${builder.mode === "upload"}">Upload CSV / XLSX</button></div>
      <p class="clt-callout is-wide">${previewIcon("warning")} Only existing Carrier CRM profiles can be added.</p>
      ${builder.mode === "crm" ? `<div class="clt-member-builder"><section class="clt-panel"><header><h2>1. Select CRM carriers</h2><p>${state.carriers.length} existing carriers found</p></header><label class="clt-search">${previewIcon("search")}<span class="sr-only">Search carriers</span><input type="search" value="${escapeHtml(builder.query)}" placeholder="Search by carrier name, CRM ID" data-clt-builder-query /></label><div class="clt-carrier-list"><div class="clt-carrier-columns"><span>Carrier (CRM ID)</span><span>Coverage</span><span>Equipment</span><span>Contact ready</span></div>${candidateRows}</div></section><div class="clt-transfer-actions"><button class="clt-secondary" type="button" data-clt-add-selected>Add ${previewIcon("chevron")}</button><small>${builder.selectedCandidateIds.length} selected</small></div><section class="clt-panel"><header><h2>2. Template members</h2><p>${members.length} selected</p></header><div class="clt-member-list">${memberRows || `<div class="clt-empty">Add existing CRM carriers to build this exact membership.</div>`}</div></section></div>` : `<section class="clt-panel clt-upload-preview"><header><div><h2>Import reconciliation preview</h2><p>Upload simulation only. No carrier is created or changed.</p></div><button class="clt-primary" type="button" data-clt-import-preview>Preview carrier_import_aug25.xlsx</button></header>${resolution ? `<div class="clt-import-summary"><span><b>${draft.resolution_rows.filter((row) => row.status === "matched").length}</b> matched</span><span><b>${draft.resolution_rows.filter((row) => row.status === "ambiguous").length}</b> ambiguous</span><span><b>${draft.resolution_rows.filter((row) => row.status === "not_found").length}</b> not found</span><span><b>${draft.resolution_rows.filter((row) => row.status === "duplicate").length}</b> duplicate</span></div><div class="clt-table-scroll"><table class="clt-table"><thead><tr><th>Row</th><th>Source value</th><th>Result</th><th>Reason</th></tr></thead><tbody>${resolution}</tbody></table></div>` : `<div class="clt-upload-drop">${previewIcon("upload")}<strong>carrier_import_aug25.xlsx</strong><span>Run the deterministic preview to classify matched, ambiguous, not found, and duplicate rows.</span></div>`}<footer>Unmatched and ambiguous rows remain excluded. Upload previews never create new carriers.</footer></section>`}`;
  }
  if (draft.step === 2) {
    const exceptions = draft.resolution_rows.filter((row) => row.status !== "matched");
    return `<div class="clt-review-grid"><section class="clt-panel"><header><h2>Review exact membership</h2><p>${members.length} Carrier CRM IDs will be stored in order.</p></header><div class="clt-review-list">${members.map((carrier, index) => `<span><b>${index + 1}</b><strong>${escapeHtml(carrier.name)}</strong><small>${escapeHtml(carrier.crm_id)} · ${escapeHtml(carrier.equipment)}</small></span>`).join("") || `<div class="clt-empty">No members selected yet.</div>`}</div></section><aside class="clt-panel"><header><h2>Import exceptions</h2><p>Excluded from membership</p></header>${exceptions.length ? `<ul class="clt-exception-list">${exceptions.map((row) => `<li>${lifecycleBadge(row.status)}<span><strong>Row ${row.source_row_number}: ${escapeHtml(row.source_value)}</strong><small>${escapeHtml(row.reason)}</small></span></li>`).join("")}</ul>` : `<div class="clt-empty">No import exceptions in this draft.</div>`}<p class="clt-callout">${previewIcon("warning")} Editing this template never edits any carrier profile.</p></aside></div>`;
  }
  const draftValidation = validateCarrierTemplateDraft(draft, "draft");
  const activeValidation = validateCarrierTemplateDraft(draft, "active");
  const validationErrors = [...new Map([...draftValidation.errors, ...activeValidation.errors].map((error) => [error.code, error])).values()];
  return `<div class="clt-save-grid"><section class="clt-panel"><header><h2>Ready to save</h2><p>Choose local draft or active status for this simulated template.</p></header><dl class="clt-save-summary"><dt>Name</dt><dd>${escapeHtml(draft.name || "Name required")}</dd><dt>Description</dt><dd>${escapeHtml(draft.description || "No description")}</dd><dt>Exact members</dt><dd>${members.length} carriers</dd><dt>External actions</dt><dd>None</dd></dl></section><aside class="clt-panel"><h2>Choose lifecycle</h2><button class="clt-secondary clt-save-choice" type="button" data-clt-save="draft" data-clt-focus-key="save-draft" ${draftValidation.valid ? "" : "disabled"}><strong>Save draft</strong><span>Keep working. Drafts are hidden in Carrier Fit.</span></button><button class="clt-primary clt-save-choice" type="button" data-clt-save="active" data-clt-focus-key="save-active" ${activeValidation.valid ? "" : "disabled"}><strong>Activate template</strong><span>Make it available as a Carrier Fit starting set.</span></button>${validationErrors.length ? `<div class="clt-validation-errors" role="alert" tabindex="-1" data-clt-focus-key="builder-validation"><strong>Complete the save requirements</strong><ul>${validationErrors.map((error) => `<li>${escapeHtml(error.message)}</li>`).join("")}</ul></div>` : ""}<p class="clt-callout">${previewIcon("warning")} This preview stores changes only in memory until the page reloads.</p></aside></div>`;
}

function renderBuilder(state) {
  const step = state.builder.draft.step;
  return `<section class="clt-screen clt-builder-screen" aria-labelledby="clt-builder-title"><header class="clt-page-heading"><p>SOURCE · CARRIER CRM &nbsp;/&nbsp; LIST TEMPLATES &nbsp;/&nbsp; ${state.builder.draft.id ? "EDIT" : "NEW TEMPLATE"}</p><h1 id="clt-builder-title" tabindex="-1" data-clt-focus-key="screen-heading">${state.builder.draft.id ? "Edit carrier list template" : "Create carrier list template"}</h1></header><ol class="clt-stepper">${state.builder.steps.map((label, index) => `<li class="${index === step ? "is-current" : index < step ? "is-complete" : ""}"><button type="button" data-clt-step="${index}" data-clt-focus-key="builder-step-${index}" aria-current="${index === step ? "step" : "false"}"><span>${index < step ? previewIcon("check") : index + 1}</span>${label}</button></li>`).join("")}</ol><div class="clt-builder-stage">${renderBuilderStep(state)}</div><footer class="clt-builder-footer"><p>${previewIcon("warning")} This template edits only membership by existing Carrier CRM IDs.</p><div><button class="clt-secondary" type="button" data-preview-route="library">Cancel</button>${step > 0 ? `<button class="clt-secondary" type="button" data-clt-step="${step - 1}" data-clt-focus-key="builder-back">Back</button>` : ""}${step < 3 ? `<button class="clt-primary" type="button" data-clt-step="${step + 1}" data-clt-focus-key="builder-continue">${step === 2 ? "Review save options" : "Continue"}</button>` : ""}</div></footer></section>`;
}

function fitStatusLabel(stateName) {
  return ({ eligible: "Eligible", already_in_rfx: "Already in this RFx", missing_contact: "Missing contact", unavailable: "Unavailable" })[stateName] || stateName;
}

function renderCarrierFit(state) {
  const fit = previewCarrierFitSnapshot(state);
  const templateOrder = new Map(fit.template.vendor_ids.map((id, index) => [id, index]));
  const visibleRows = Object.values(fit.visible).flat().sort((a, b) => templateOrder.get(a.vendor_id) - templateOrder.get(b.vendor_id));
  const activeTemplates = state.templates.filter((template) => template.lifecycle_status === "active");
  const rows = visibleRows.map((carrier) => {
    const eligible = carrier.primary_state === "eligible";
    const selected = state.fit.selectedVendorIds.includes(carrier.vendor_id);
    return `<tr class="is-${carrier.primary_state}"><td><strong>${escapeHtml(carrier.name || "Unavailable CRM carrier")}</strong></td><td>${escapeHtml(carrier.crm_id || carrier.vendor_id)}</td><td><span class="clt-fit-label ${carrier.lane_fit === "Recommended" ? "is-ready" : "is-warning"}">${eligible ? previewIcon(carrier.lane_fit === "Recommended" ? "check" : "warning") : ""}${escapeHtml(carrier.lane_fit || "—")}</span></td><td>${escapeHtml(carrier.equipment || "—")}</td><td><span class="${carrier.primary_email ? "is-ready" : "is-warning"}">${carrier.primary_state === "unavailable" ? "CRM archived" : carrier.primary_email ? "Contact ready" : "Missing contact"}</span></td><td>${fitStatusLabel(carrier.primary_state)}</td><td class="clt-selection-cell">${eligible ? `<input type="checkbox" data-clt-fit-toggle="${carrier.vendor_id}" ${selected ? "checked" : ""} aria-label="Select ${escapeHtml(carrier.name)}" />` : previewIcon(carrier.primary_state === "missing_contact" ? "warning" : "work")}</td></tr>`;
  }).join("");
  return `<section class="clt-screen clt-fit-screen" aria-labelledby="clt-fit-title"><header class="clt-bid-heading"><div><p>PRIVATE PROCUREMENT ROOM</p><h1>Bid Room</h1><span>Command Center &nbsp;/&nbsp; Procurement Base &nbsp;/&nbsp; Bid Room &nbsp;/&nbsp; RFx-04302602</span></div><div><button class="clt-primary" type="button" data-clt-shell-feedback="New bid event is outside this preview">New bid event</button><button class="clt-link" type="button" data-clt-shell-feedback="Public board is outside this preview">Public board</button></div></header><ol class="clt-bid-stepper"><li><b>1</b><span><strong>Build</strong><small>Event | Book | CRM</small></span></li><li class="is-current"><b>2</b><span><strong>Launch</strong><small>Invites | Queue</small></span></li><li><b>3</b><span><strong>Operate</strong><small>Auction | Live</small></span></li><li><b>4</b><span><strong>Close</strong><small>Award | Rateware</small></span></li></ol><nav class="clt-bid-tabs" aria-label="Bid Room launch workspaces"><button class="is-active" type="button">Carrier fit</button><button type="button" data-clt-message-tab>Message</button><button type="button" data-clt-shell-feedback="Delivery queue is intentionally not active in this simulation">Delivery queue</button></nav><div class="clt-fit-content"><header class="clt-fit-title"><div><h2 id="clt-fit-title" tabindex="-1" data-clt-focus-key="screen-heading">Find carriers for this opportunity</h2><p>Use the exact-membership template to select eligible carriers for this RFx.</p></div><p class="clt-callout">${previewIcon("warning")} This template is unchanged. Your selections apply only to this RFx.</p><p class="clt-callout">${previewIcon("warning")} Nothing is sent until Delivery queue.</p></header><section class="clt-panel clt-starting-set"><div class="clt-starting-controls"><label>Starting set<select disabled><option>Saved carrier list</option></select></label><label><span class="sr-only">Active carrier template</span><select data-clt-fit-template data-clt-focus-key="fit-template" ${activeTemplates.length ? "" : "disabled"}>${activeTemplates.length ? activeTemplates.map((template) => `<option value="${template.id}" ${fit.template.id === template.id ? "selected" : ""}>${escapeHtml(template.segment_name)} (${template.vendor_ids.length} carriers)</option>`).join("") : `<option value="">No active templates available</option>`}</select></label><button class="clt-link" type="button" data-preview-route="library">Manage templates in Carrier CRM</button></div><div class="clt-fit-counts"><span><b>${fit.counts.total}</b> template members</span><span class="is-ready"><b>${fit.counts.eligible}</b> eligible</span><span><b>${fit.counts.already_in_rfx}</b> already in this RFx</span><span class="is-warning"><b>${fit.counts.missing_contact}</b> missing contact</span><span class="is-danger"><b>${fit.counts.unavailable}</b> unavailable</span>${fit.counts.filtered_out ? `<span class="is-overlay"><b>${fit.counts.filtered_out}</b> filtered out (membership unchanged)</span>` : ""}</div></section><section class="clt-panel clt-fit-table-panel"><div class="clt-fit-toolbar"><label class="clt-search">${previewIcon("search")}<span class="sr-only">Search template carriers</span><input type="search" value="${escapeHtml(state.fit.filters.search)}" placeholder="Search by carrier name or CRM ID" data-clt-fit-filter="search" data-clt-focus-key="fit-filter-search" /></label><label><span class="sr-only">Lane fit</span><select data-clt-fit-filter="lane_fit" data-clt-focus-key="fit-filter-lane"><option value="all">Lane fit: All</option><option value="recommended" ${state.fit.filters.lane_fit === "recommended" ? "selected" : ""}>Recommended</option><option value="partial fit" ${state.fit.filters.lane_fit === "partial fit" ? "selected" : ""}>Partial fit</option></select></label><label><span class="sr-only">Equipment</span><select data-clt-fit-filter="equipment" data-clt-focus-key="fit-filter-equipment"><option value="all">Equipment: All</option><option value="dry van" ${state.fit.filters.equipment === "dry van" ? "selected" : ""}>Dry Van</option><option value="reefer" ${state.fit.filters.equipment === "reefer" ? "selected" : ""}>Reefer</option><option value="flatbed" ${state.fit.filters.equipment === "flatbed" ? "selected" : ""}>Flatbed</option></select></label><label><span class="sr-only">Contact readiness</span><select data-clt-fit-filter="contact" data-clt-focus-key="fit-filter-contact"><option value="all">Contact readiness: All</option><option value="ready" ${state.fit.filters.contact === "ready" ? "selected" : ""}>Contact ready</option><option value="missing" ${state.fit.filters.contact === "missing" ? "selected" : ""}>Missing contact</option></select></label><label><span class="sr-only">RFx status</span><select data-clt-fit-filter="rfx_status" data-clt-focus-key="fit-filter-rfx"><option value="all">RFx status: All</option><option value="already" ${state.fit.filters.rfx_status === "already" ? "selected" : ""}>Already in RFx</option><option value="not-in-rfx" ${state.fit.filters.rfx_status === "not-in-rfx" ? "selected" : ""}>Not in RFx</option></select></label><button class="clt-link" type="button" data-clt-fit-select-all data-clt-focus-key="fit-select-all">Select all ${fit.visible.eligible.length} eligible</button><button class="clt-link" type="button" data-clt-fit-clear data-clt-focus-key="fit-clear">Clear selection</button></div><div class="clt-table-scroll"><table class="clt-table clt-fit-table"><thead><tr><th>Carrier</th><th>CRM ID</th><th>Lane fit</th><th>Equipment</th><th>Contact readiness</th><th>RFx status</th><th>Selection</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="clt-empty">Every template member is hidden by the current filters.</div></td></tr>`}</tbody></table></div></section></div><footer class="clt-fit-footer"><div><strong>${state.fit.selectedVendorIds.length} carriers selected</strong><span>${previewIcon("warning")} Adding creates simulated RFx participation only. Message prepares no drafts here.</span></div><button class="clt-primary" type="button" data-clt-fit-submit data-clt-focus-key="fit-submit" ${state.fit.selectedVendorIds.length ? "" : "disabled"}>${escapeHtml(state.fit.cta)}</button></footer></section>`;
}

function renderMessage(state) {
  const selected = state.message.selectedVendorIds.map((id) => state.carriers.find((carrier) => carrier.id === id)).filter(Boolean);
  return `<section class="clt-screen clt-message-screen" aria-labelledby="clt-message-title"><header class="clt-bid-heading"><div><p>PRIVATE PROCUREMENT ROOM</p><h1>Bid Room</h1><span>RFx-04302602 &nbsp;/&nbsp; Launch &nbsp;/&nbsp; Message</span></div></header><nav class="clt-bid-tabs" aria-label="Bid Room launch workspaces"><button type="button" data-preview-route="carrier-fit">Carrier fit</button><button class="is-active" type="button">Message</button><button type="button" data-clt-shell-feedback="Delivery queue is intentionally not active in this simulation">Delivery queue</button></nav><div class="clt-message-content"><article class="clt-panel clt-success-card"><span class="clt-success-icon">${previewIcon("check")}</span><p>LOCAL HANDOFF COMPLETE</p><h1 id="clt-message-title" tabindex="-1" data-clt-focus-key="screen-heading">${state.message.selectedCount} carrier${state.message.selectedCount === 1 ? "" : "s"} opened in Message</h1><p>${escapeHtml(state.message.detail)}</p><div class="clt-message-audience">${selected.map((carrier) => `<span><b>${escapeHtml(carrier.name)}</b><small>${escapeHtml(carrier.crm_id)}</small></span>`).join("")}</div><p class="clt-callout">${previewIcon("warning")} No draft was prepared, nothing was sent, and Delivery queue was not touched.</p><div><button class="clt-secondary" type="button" data-preview-route="carrier-fit">Back to Carrier Fit</button><button class="clt-primary" type="button" data-preview-route="library">Return to template library</button></div></article><aside class="clt-panel"><h2>Human gates preserved</h2><ol><li><b>1</b><span>Template membership remained unchanged.</span></li><li><b>2</b><span>Only visible eligible carriers could be selected.</span></li><li><b>3</b><span>Message and Delivery actions remain explicit next decisions.</span></li></ol></aside></div></section>`;
}

function applyPreviewFocusKeys(root) {
  const fixedKeys = [
    ["[data-clt-builder-query]", "builder-query"],
    ["[data-clt-add-selected]", "builder-add-selected"],
    ["[data-clt-import-preview]", "builder-import-preview"]
  ];
  for (const [selector, focusKey] of fixedKeys) {
    root.querySelector(selector)?.setAttribute("data-clt-focus-key", focusKey);
  }
  root.querySelectorAll("[data-clt-fit-toggle]").forEach((control) => {
    control.setAttribute("data-clt-focus-key", `fit-carrier-${control.dataset.cltFitToggle}`);
  });
}

function renderPreview(state, root) {
  root.innerHTML = state.screen === "library" ? renderLibrary(state)
    : state.screen === "builder" ? renderBuilder(state)
      : state.screen === "carrier-fit" ? renderCarrierFit(state)
        : renderMessage(state);
  if (state.screen === "carrier-fit") {
    const fit = previewCarrierFitSnapshot(state);
    const selectedCount = state.fit.selectedVendorIds.length;
    const exceptionCount = fit.counts.already_in_rfx + fit.counts.missing_contact + fit.counts.unavailable;
    root.querySelector(".clt-starting-set")?.insertAdjacentHTML("afterend", `
      <section class="clt-panel clt-launch-readiness" aria-label="Launch readiness">
        <header>
          <div><p>LAUNCH READINESS</p><h2>Review this template wave before adding carriers</h2></div>
          <span class="clt-fit-label ${selectedCount ? "is-ready" : "is-warning"}">${selectedCount ? "Ready for review" : "Selection required"}</span>
        </header>
        <div class="clt-launch-readiness-metrics">
          <span><b>${selectedCount}</b> selected to add</span>
          <span><b>3</b> RFx lanes</span>
          <span><b>${exceptionCount}</b> exceptions</span>
          <span><b>v${fit.template.template_version || 1}</b> template snapshot</span>
        </div>
        <p>${selectedCount
          ? `${selectedCount} carrier(s) will be revalidated against the active template and current RFx lanes. Carrier Fit will not draft or send messages.`
          : "Select eligible carriers. Already-in-RFx, missing-contact, and unavailable members remain excluded."}</p>
      </section>
    `);
  }
  applyPreviewFocusKeys(root);
  document.querySelectorAll("[data-preview-nav-key]").forEach((link) => link.classList.remove("is-active"));
  document.querySelector(state.screen === "carrier-fit" || state.screen === "message" ? '[data-preview-nav-key="bid-room"]' : '[data-preview-nav-key="carrier-crm"]')?.classList.add("is-active");
}

export function restorePreviewFocus(root, state, action, previousFocusKey = "") {
  let focusKey = action.focusKey || previousFocusKey;
  if (action.type === "builder_go_to_step") focusKey = `builder-step-${state.builder.draft.step}`;
  else if (action.type === "builder_save" && state.screen === "builder" && state.builder.validationErrors.length) focusKey = "builder-validation";
  else if (["navigate", "builder_new", "builder_open", "fit_submit"].includes(action.type)) focusKey = "screen-heading";
  const focusTargets = [...root.querySelectorAll("[data-clt-focus-key]")];
  const target = focusTargets.find((element) => element.dataset.cltFocusKey === focusKey && !element.disabled)
    || focusTargets.find((element) => element.dataset.cltFocusKey === "screen-heading" && !element.disabled);
  target?.focus({ preventScroll: true });
}

function restorePreviewInputSelection(root, focusKey, selection) {
  if (!selection || !focusKey) return;
  const target = [...root.querySelectorAll("[data-clt-focus-key]")]
    .find((element) => element.dataset.cltFocusKey === focusKey && !element.disabled);
  if (typeof target?.setSelectionRange !== "function") return;
  target.setSelectionRange(selection.start, selection.end);
}

function flushPreviewBuilderDetails(state, root) {
  if (state.screen !== "builder" || state.builder.draft.step !== 0) return state;
  const name = root.querySelector("[data-clt-builder-name]")?.value ?? state.builder.draft.name;
  const description = root.querySelector("[data-clt-builder-description]")?.value ?? state.builder.draft.description;
  return reduceCarrierTemplatePreview(state, { type: "builder_set_details", name, description });
}

function startCarrierTemplatePreview() {
  registerPlatform55Icons();
  const root = document.querySelector("#preview-content");
  if (!root) return;
  let state = createCarrierTemplatePreviewState();
  const renderState = (action, previousFocusKey, selection = null) => {
    renderPreview(state, root);
    restorePreviewFocus(root, state, action, previousFocusKey);
    restorePreviewInputSelection(root, previousFocusKey, selection);
    const live = document.querySelector("[data-preview-live]");
    if (live && state.notice) live.textContent = state.notice;
  };
  const dispatch = (action) => {
    const previousFocusKey = document.activeElement?.closest?.("[data-clt-focus-key]")?.dataset.cltFocusKey || "";
    state = reduceCarrierTemplatePreview(state, action);
    renderState(action, previousFocusKey);
  };
  root.addEventListener("click", (event) => {
    const route = event.target.closest("[data-preview-route]")?.dataset.previewRoute;
    if (route) return dispatch({ type: "navigate", screen: route });
    const row = event.target.closest("[data-clt-select-template]");
    if (row && !event.target.closest("button")) return dispatch({ type: "library_select", templateId: row.dataset.cltSelectTemplate });
    const action = event.target.closest("[data-clt-action]");
    if (action) {
      const templateId = action.dataset.templateId;
      if (action.dataset.cltAction === "new") dispatch({ type: "builder_new" });
      if (action.dataset.cltAction === "open") dispatch({ type: "builder_open", templateId });
      if (action.dataset.cltAction === "duplicate") dispatch({ type: "library_duplicate", templateId });
      if (action.dataset.cltAction === "archive") dispatch({ type: "library_archive", templateId });
      if (action.dataset.cltAction === "restore") dispatch({ type: "library_restore", templateId });
    }
    const step = event.target.closest("[data-clt-step]")?.dataset.cltStep;
    if (step !== undefined) {
      state = flushPreviewBuilderDetails(state, root);
      return dispatch({ type: "builder_go_to_step", step: Number(step) });
    }
    const mode = event.target.closest("[data-clt-builder-mode]")?.dataset.cltBuilderMode;
    if (mode) return dispatch({ type: "builder_set_mode", value: mode });
    const candidate = event.target.closest("[data-clt-candidate]")?.dataset.cltCandidate;
    if (candidate) return dispatch({ type: "builder_toggle_candidate", vendorId: candidate });
    if (event.target.closest("[data-clt-add-selected]")) return dispatch({ type: "builder_add_selected" });
    const remove = event.target.closest("[data-clt-remove]")?.dataset.cltRemove;
    if (remove) return dispatch({ type: "builder_remove", vendorId: remove, focusKey: previewFocusKeyAfterMemberRemoval(state, remove) });
    const reorder = event.target.closest("[data-clt-reorder]");
    if (reorder) return dispatch({ type: "builder_reorder", vendorId: reorder.dataset.cltReorder, toIndex: Number(reorder.dataset.toIndex) });
    if (event.target.closest("[data-clt-import-preview]")) return dispatch({ type: "builder_import_preview" });
    const save = event.target.closest("[data-clt-save]")?.dataset.cltSave;
    if (save) return dispatch({ type: "builder_save", lifecycleStatus: save });
    if (event.target.closest("[data-clt-fit-select-all]")) return dispatch({ type: "fit_select_all_visible" });
    if (event.target.closest("[data-clt-fit-clear]")) return dispatch({ type: "fit_clear" });
    const fitToggle = event.target.closest("[data-clt-fit-toggle]")?.dataset.cltFitToggle;
    if (fitToggle) return dispatch({ type: "fit_toggle", vendorId: fitToggle });
    if (event.target.closest("[data-clt-fit-submit]")) return dispatch({ type: "fit_submit" });
    if (event.target.closest("[data-clt-message-tab]")) {
      state.notice = "Select at least one eligible carrier and use the exact Add CTA to open Message.";
      document.querySelector("[data-preview-live]").textContent = state.notice;
    }
    const feedback = event.target.closest("[data-clt-shell-feedback]")?.dataset.cltShellFeedback;
    if (feedback) document.querySelector("[data-preview-live]").textContent = feedback;
  });
  root.addEventListener("input", (event) => {
    const previousFocusKey = event.target.closest?.("[data-clt-focus-key]")?.dataset.cltFocusKey || "";
    const transition = previewInputTransition(state, event.target);
    if (!transition) return;
    state = transition.state;
    if (transition.render) renderState(transition.action, previousFocusKey, transition.selection);
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-clt-library-status]")) dispatch({ type: "library_filter_status", value: event.target.value });
    if (event.target.matches("[data-clt-fit-template]")) dispatch({ type: "fit_choose_template", templateId: event.target.value });
    if (event.target.matches("[data-clt-fit-filter]") && event.target.dataset.cltFitFilter !== "search") dispatch({ type: "fit_filter", key: event.target.dataset.cltFitFilter, value: event.target.value });
  });
  root.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-clt-select-template]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      dispatch({ type: "library_select", templateId: row.dataset.cltSelectTemplate });
    }
  });
  document.querySelectorAll("[data-preview-route]").forEach((button) => button.addEventListener("click", () => dispatch({ type: "navigate", screen: button.dataset.previewRoute })));
  document.querySelector("[data-preview-nav-collapse]")?.addEventListener("click", (event) => {
    const app = document.querySelector("[data-platform55-app]");
    const collapseState = previewNavigationCollapseState(app.dataset.navCollapsed === "true");
    app.dataset.navCollapsed = String(collapseState.collapsed);
    event.currentTarget.setAttribute("aria-expanded", String(collapseState.expanded));
    event.currentTarget.setAttribute("aria-label", collapseState.label);
  });
  document.querySelectorAll("[data-preview-mobile-nav]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("[data-platform55-app]").dataset.mobileNavOpen = String(button.dataset.previewMobileNav === "open");
  }));
  document.querySelector("[data-preview-search-trigger]")?.addEventListener("click", () => {
    root.querySelector('input[type="search"]')?.focus();
  });
  renderPreview(state, root);
}

if (typeof document !== "undefined") startCarrierTemplatePreview();
