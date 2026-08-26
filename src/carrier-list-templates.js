import { getAccessContext } from "./auth.js";
import { createCarrierTemplateCapabilityView } from "./carrier-list-template-capability.js";
import { createCarrierListTemplateController } from "./carrier-list-template-controller.js";
import {
  carrierTemplateConflictSummary,
  carrierTemplateDraftDiff,
  carrierTemplateDraftPayload,
  carrierTemplateImportValidation,
  createCarrierTemplateCapabilityRecoveryController,
  createCarrierTemplateDraftMutationController,
  createCarrierTemplateModalFocusController,
  createCarrierTemplateDraftState,
  createCarrierTemplateReconciliationController,
  createCarrierTemplateWizardAsyncController,
  mergeCarrierTemplateResolutionRows,
  reduceCarrierTemplateDraft,
  validateCarrierTemplateDraft
} from "./carrier-list-template-domain.js";
import {
  carrierTemplateExceptionCsv,
  normalizeCarrierTemplateRows,
  rowsFromCarrierTemplateMatrix
} from "./carrier-list-template-file.js";
import { humanizeError } from "./error-copy.js";
import {
  archiveCarrierListTemplate,
  createCarrierListTemplate,
  duplicateCarrierListTemplate,
  fetchCarrierListTemplates,
  fetchVendors,
  getCarrierListTemplate,
  resolveCarrierListTemplateRows,
  updateCarrierListTemplate,
  restoreCarrierListTemplate
} from "./vendor-service.js";

const MANAGE_PERMISSION = "vendors:manage";
const LIST_PAGE_SIZE = 200;
const LIST_SAFETY_LIMIT = 5000;
const CRM_PAGE_SIZE = 50;
const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
let xlsxModulePromise = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value) {
  return String(value ?? "").trim();
}

function templateId(row = {}) {
  return text(row.id || row.template_id);
}

function templateName(row = {}) {
  return text(row.segment_name || row.name) || "Untitled template";
}

function templateDescription(row = {}) {
  return text(row.segment_description || row.description) || "No description";
}

function templateLifecycle(row = {}) {
  const lifecycle = text(row.lifecycle_status || row.status).toLowerCase();
  return ["active", "draft", "archived"].includes(lifecycle) ? lifecycle : "draft";
}

function displayedTemplateVersion(row = {}) {
  const version = Number(row.template_version);
  return Number.isSafeInteger(version) && version >= 1 ? version : 1;
}

function memberCount(row = {}) {
  return Array.isArray(row.vendor_ids) ? row.vendor_ids.length : Number(row.member_count) || 0;
}

function modifiedBy(row = {}) {
  return text(row.updated_by_email || row.created_by_email || row.owner_email) || "Unknown actor";
}

function formatModifiedAt(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function vendorId(row = {}) {
  return text(row.id || row.vendor_id);
}

function vendorName(row = {}) {
  return text(row.vendor_name || row.name || row.legal_name) || vendorId(row) || "Unavailable carrier";
}

function resolutionReason(row = {}) {
  return text(row.reason).replaceAll("_", " ") || "No reason provided";
}

async function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import(XLSX_MODULE_URL);
  return await xlsxModulePromise;
}

async function parseCarrierTemplateFile(file) {
  const initialValidation = carrierTemplateImportValidation(file);
  if (!initialValidation.valid) throw Object.assign(new Error(initialValidation.message), { code: initialValidation.code });
  const XLSX = await loadXlsxModule();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw Object.assign(new Error("The file has no readable first sheet."), { code: "missing_first_sheet" });
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  const normalizedRows = normalizeCarrierTemplateRows(rowsFromCarrierTemplateMatrix(matrix));
  const rowValidation = carrierTemplateImportValidation(file, { row_count: normalizedRows.length });
  if (!rowValidation.valid) throw Object.assign(new Error(rowValidation.message), { code: rowValidation.code });
  return normalizedRows;
}

function downloadTextFile(filename, contents, type = "text/plain;charset=utf-8") {
  let url = "";
  let link = null;
  try {
    const blob = new Blob([contents], { type });
    url = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function permissionNames(access = {}) {
  const names = new Set();
  for (const item of Array.isArray(access.permissions) ? access.permissions : []) {
    const name = typeof item === "string" ? item : text(item?.key || item?.name);
    if (name) names.add(name);
  }
  return names;
}

function lifecycleTone(lifecycle) {
  if (lifecycle === "active") return "success";
  if (lifecycle === "archived") return "danger";
  return "warning";
}

function writeControlAttributes(canManage) {
  return canManage
    ? ""
    : ' disabled aria-disabled="true" title="Requires vendors:manage"';
}

function actionButtons(row, canManage) {
  const id = escapeHtml(templateId(row));
  const name = escapeHtml(templateName(row));
  const version = displayedTemplateVersion(row);
  const lifecycle = templateLifecycle(row);
  const writeAttributes = writeControlAttributes(canManage);
  const lifecycleAction = lifecycle === "archived"
    ? `<button class="secondary small-button" type="button" data-template-action="restore" data-template-id="${id}" data-template-version="${version}" aria-label="Restore ${name}"${writeAttributes}>Restore</button>`
    : `<button class="secondary small-button" type="button" data-template-action="archive" data-template-id="${id}" data-template-version="${version}" aria-label="Archive ${name}"${writeAttributes}>Archive</button>`;
  return `
    <div class="carrier-template-actions">
      <button class="secondary small-button" type="button" data-template-action="open" data-template-id="${id}" aria-label="Open ${name}">Open</button>
      <button class="secondary small-button" type="button" data-template-action="duplicate" data-template-id="${id}" data-template-version="${version}" aria-label="Duplicate ${name}"${writeAttributes}>Duplicate</button>
      ${lifecycleAction}
    </div>
  `;
}

function templateRow(row, selectedTemplateId, canManage) {
  const id = templateId(row);
  const lifecycle = templateLifecycle(row);
  const version = displayedTemplateVersion(row);
  const selected = id === selectedTemplateId;
  return `
    <tr data-template-row="${escapeHtml(id)}"${selected ? ' class="is-selected" aria-current="true"' : ""}>
      <td>
        <strong>${escapeHtml(templateName(row))}</strong>
        <small>${escapeHtml(templateDescription(row))}</small>
      </td>
      <td>${memberCount(row).toLocaleString()}</td>
      <td><time datetime="${escapeHtml(row.updated_at || "")}">${escapeHtml(formatModifiedAt(row.updated_at))}</time></td>
      <td>${escapeHtml(modifiedBy(row))}</td>
      <td><span class="status-pill" data-tone="${lifecycleTone(lifecycle)}">${escapeHtml(lifecycle)}</span></td>
      <td><span class="carrier-template-version" aria-label="Template version ${version}">v${version}</span></td>
      <td>${actionButtons(row, canManage)}</td>
    </tr>
  `;
}

async function fetchEveryTemplatePage(lifecycleStatus) {
  const rows = [];
  let offset = 0;
  while (offset < LIST_SAFETY_LIMIT) {
    const result = await fetchCarrierListTemplates({
      lifecycle_status: lifecycleStatus === "all" ? "" : lifecycleStatus,
      limit: LIST_PAGE_SIZE,
      offset
    });
    if (result?.enabled === false) return { enabled: false, rows: [] };
    const page = Array.isArray(result?.rows) ? result.rows : [];
    rows.push(...page);
    if (!result?.has_more) return { enabled: true, rows };
    if (!page.length) throw new Error("Carrier template pagination did not advance.");
    offset += page.length;
  }
  throw new Error(`Carrier template library exceeds the ${LIST_SAFETY_LIMIT.toLocaleString()} row safety limit.`);
}

export async function initCarrierListTemplateLibrary({
  initialTemplateId = "",
  onCapabilityChange = () => {},
  onSelectionChange = () => {}
} = {}) {
  const tab = document.querySelector('[data-vendor-tab="list-templates"]');
  const workspace = document.querySelector('[data-vendor-workspace="list-templates"]');
  const searchInput = workspace?.querySelector("[data-template-search]");
  const statusFilter = workspace?.querySelector("[data-template-status]");
  const tableHost = workspace?.querySelector("[data-template-library-table]");
  const detail = workspace?.querySelector("[data-template-detail]");
  const status = workspace?.querySelector("[data-template-library-status]");
  const newButton = workspace?.querySelector('[data-template-action="new"]');
  const capabilityError = document.querySelector("[data-template-capability-error]");
  const capabilityErrorMessage = capabilityError?.querySelector("[data-template-capability-message]");
  const capabilityRetry = capabilityError?.querySelector("[data-template-capability-retry]");
  const wizard = workspace?.querySelector("[data-template-wizard]");
  const wizardForm = wizard?.querySelector("[data-template-wizard-form]");
  const wizardCloseButton = wizard?.querySelector("[data-template-wizard-close]");
  const wizardStepButtons = [...(wizard?.querySelectorAll("[data-template-wizard-step]") || [])];
  const wizardPanels = [...(wizard?.querySelectorAll("[data-template-wizard-panel]") || [])];
  const wizardBackButton = wizard?.querySelector("[data-template-wizard-back]");
  const wizardNextButton = wizard?.querySelector("[data-template-wizard-next]");
  const wizardStatus = wizard?.querySelector("[data-template-wizard-status]");
  const dirtySignal = wizard?.querySelector("[data-template-dirty-signal]");
  const draftNameInput = wizard?.querySelector("[data-template-draft-name]");
  const draftDescriptionInput = wizard?.querySelector("[data-template-draft-description]");
  const crmSearchInput = wizard?.querySelector("[data-template-crm-search]");
  const crmStatusFilter = wizard?.querySelector("[data-template-crm-status]");
  const crmChannelFilter = wizard?.querySelector("[data-template-crm-channel]");
  const crmTagFilter = wizard?.querySelector("[data-template-crm-tag]");
  const crmCoverageFilter = wizard?.querySelector("[data-template-crm-coverage]");
  const crmStatusMessage = wizard?.querySelector("[data-template-crm-status-message]");
  const crmResults = wizard?.querySelector("[data-template-crm-results]");
  const crmPageStatus = wizard?.querySelector("[data-template-crm-page-status]");
  const crmPreviousButton = wizard?.querySelector('[data-template-crm-page="previous"]');
  const crmNextButton = wizard?.querySelector('[data-template-crm-page="next"]');
  const selectedMembersHost = wizard?.querySelector("[data-template-selected-members]");
  const importInput = wizard?.querySelector("[data-template-import-file]");
  const importStatus = wizard?.querySelector("[data-template-import-status]");
  const resolutionSummary = wizard?.querySelector("[data-template-resolution-summary]");
  const resolutionRowsHost = wizard?.querySelector("[data-template-resolution-rows]");
  const downloadExceptionsButton = wizard?.querySelector("[data-template-download-exceptions]");
  const reviewHost = wizard?.querySelector("[data-template-review]");
  const saveSummary = wizard?.querySelector("[data-template-save-summary]");
  const conflictHost = wizard?.querySelector("[data-template-conflict]");
  const saveDraftButton = wizard?.querySelector('[data-template-save="draft"]');
  const activateTemplateButton = wizard?.querySelector('[data-template-save="active"]');

  let templates = [];
  let selectedTemplateId = "";
  let canManage = false;
  let mutationRunning = false;
  let searchTimer = null;
  let draftState = createCarrierTemplateDraftState();
  let wizardOpen = false;
  let wizardCapabilityWritable = false;
  let wizardRecoveryMode = false;
  let editorLaunchToken = 0;
  let wizardSaveRunning = false;
  let wizardConflictCurrent = null;
  let wizardConflictReason = "";
  let crmRows = [];
  let crmTotal = 0;
  let crmPageOffset = 0;
  let crmSearchTimer = null;
  const vendorCache = new Map();
  const wizardAsync = createCarrierTemplateWizardAsyncController();
  const reconciliation = createCarrierTemplateReconciliationController();
  const wizardHome = Object.freeze({
    parent: wizard?.parentNode || null,
    nextSibling: wizard?.nextSibling || null
  });
  const modalFocus = createCarrierTemplateModalFocusController({
    getActiveElement: () => document.activeElement,
    getFocusable: () => [...(wizard?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) || [])].filter((element) => !element.closest("[hidden]")),
    getBackgroundElements: () => [...document.body.children].filter((element) => element !== wizard),
    getBackgroundState: (element) => ({
      inert: Boolean(element.inert),
      ariaHidden: element.getAttribute("aria-hidden")
    }),
    setBackgroundState: (element, state) => {
      element.inert = Boolean(state.inert);
      if (state.ariaHidden === null || state.ariaHidden === undefined) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", String(state.ariaHidden));
    },
    fallbackFocus: () => document.querySelector('[data-vendor-tab="list-templates"]'),
    isConnected: (element) => Boolean(element?.isConnected),
    isInside: (element) => Boolean(element && wizard?.contains(element)),
    focusElement: (element) => element?.focus?.()
  });
  const draftMutations = createCarrierTemplateDraftMutationController({
    readDraft: () => draftState,
    writeDraft: (action) => setDraftState(reduceCarrierTemplateDraft(draftState, action))
  });
  const requestController = createCarrierListTemplateController({
    fetchList: fetchEveryTemplatePage,
    fetchDetail: getCarrierListTemplate
  });
  const capabilityRecovery = createCarrierTemplateCapabilityRecoveryController({
    isEditorOpen: () => wizardOpen,
    isDirty: () => draftState.dirty,
    requestClose: (options) => closeTemplateWizard(options),
    retainRecovery: (visible) => {
      wizardRecoveryMode = visible;
      wizard?.classList.toggle("is-capability-recovery", visible);
      if (visible) {
        mountWizardModalLayer();
        setWizardStatus("Template access is unavailable. Your unsaved local draft is retained read-only over Funnel.", "warning");
      }
      renderWizard();
    },
    setWritable: (value) => {
      wizardCapabilityWritable = value;
      if (!value) wizardAsync.invalidateOperations();
    }
  });
  const capabilityView = createCarrierTemplateCapabilityView({
    tab,
    workspace,
    errorRegion: capabilityError,
    errorMessage: capabilityErrorMessage,
    formatError: (error) => `List Templates could not be verified: ${humanizeError(error)}`,
    onTransition: (capability, metadata) => {
      capabilityRecovery.transition(capability);
      onCapabilityChange(capability, metadata);
    }
  });
  capabilityView.transition("pending");

  function setStatus(message = "", tone = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setWizardStatus(message = "", tone = "neutral") {
    if (!wizardStatus) return;
    wizardStatus.textContent = message;
    wizardStatus.dataset.tone = tone;
  }

  function cacheVendorRows(rows = []) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = vendorId(row);
      if (id) vendorCache.set(id, row);
    }
  }

  function syncWizardDirtyGuard() {
    if (!wizardForm) return;
    if (!draftState.dirty) {
      window.ratewareMarkFormClean?.(wizardForm);
      return;
    }
    if (wizardForm.dataset.unsaved === "true") return;
    if (dirtySignal) {
      dirtySignal.value = String(Number(dirtySignal.value || 0) + 1);
      dirtySignal.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function setDraftState(nextState, { renderState = true } = {}) {
    draftState = nextState;
    syncWizardDirtyGuard();
    if (renderState) renderWizard();
  }

  function mountWizardModalLayer() {
    if (!wizard) return;
    if (wizard.parentNode !== document.body) document.body.append(wizard);
    document.body.classList.add("carrier-template-modal-open");
  }

  function restoreWizardHome() {
    document.body.classList.remove("carrier-template-modal-open");
    if (!wizard || !wizardHome.parent || wizard.parentNode === wizardHome.parent) return;
    const sibling = wizardHome.nextSibling;
    if (sibling?.parentNode === wizardHome.parent) wizardHome.parent.insertBefore(wizard, sibling);
    else wizardHome.parent.append(wizard);
  }

  function stableTemplateOpener(templateId = "") {
    const id = text(templateId);
    return () => {
      if (!id) return workspace?.querySelector('[data-template-action="new"]') || tab;
      return [...(workspace?.querySelectorAll('[data-template-action="open"]') || [])]
        .find((button) => text(button.dataset.templateId) === id) || tab;
    };
  }

  function canMutateDraft({ announce = true } = {}) {
    const allowed = Boolean(
      wizardOpen &&
      canManage &&
      wizardCapabilityWritable &&
      capabilityRecovery.canMutate &&
      !wizardSaveRunning &&
      !draftMutations.saving
    );
    if (!allowed && announce) {
      const message = wizardSaveRunning || draftMutations.saving
        ? "Wait for the current save to finish before changing this draft."
        : "Template changes are unavailable while List Templates access is not enabled.";
      setWizardStatus(message, "warning");
    }
    return allowed;
  }

  function applyDraftAction(action, options = {}) {
    if (!canMutateDraft(options)) {
      syncDraftDetailInputs();
      renderWizard();
      return false;
    }
    return draftMutations.mutate(action);
  }

  function syncDraftMutationControls() {
    const disabled = !canMutateDraft({ announce: false });
    for (const control of [draftNameInput, draftDescriptionInput, importInput]) {
      if (control) control.disabled = disabled;
    }
    wizardStepButtons.forEach((control) => control.disabled = disabled);
    if (wizardBackButton) wizardBackButton.disabled = disabled || draftState.step === 0;
    if (wizardNextButton) wizardNextButton.disabled = disabled;
    for (const control of [crmSearchInput, crmStatusFilter, crmChannelFilter, crmTagFilter, crmCoverageFilter]) {
      if (control) control.disabled = !wizardCapabilityWritable;
    }
    if (!wizardCapabilityWritable) {
      if (crmPreviousButton) crmPreviousButton.disabled = true;
      if (crmNextButton) crmNextButton.disabled = true;
    }
    if (!disabled) return;
    wizard?.querySelectorAll(
      "[data-template-add-member], [data-template-member-action], [data-template-ambiguous-search], [data-template-ambiguous-search-button], [data-template-ambiguous-choice-row], [data-template-conflict-reload]"
    ).forEach((control) => control.disabled = true);
  }

  function renderSelectedMembers() {
    if (!selectedMembersHost) return;
    selectedMembersHost.innerHTML = draftState.vendor_ids.length
      ? draftState.vendor_ids.map((id, index) => {
          const vendor = vendorCache.get(id);
          const label = vendorName(vendor || { id });
          return `
            <article class="carrier-template-member" data-template-member-id="${escapeHtml(id)}">
              <span class="carrier-template-member-order" aria-label="Position ${index + 1}">${index + 1}</span>
              <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small></div>
              <div class="carrier-template-member-actions">
                <button class="secondary small-button" type="button" data-template-member-action="up" data-template-member-id="${escapeHtml(id)}" aria-label="Move ${escapeHtml(label)} up"${index === 0 ? " disabled" : ""}>↑</button>
                <button class="secondary small-button" type="button" data-template-member-action="down" data-template-member-id="${escapeHtml(id)}" aria-label="Move ${escapeHtml(label)} down"${index === draftState.vendor_ids.length - 1 ? " disabled" : ""}>↓</button>
                <button class="secondary small-button" type="button" data-template-member-action="remove" data-template-member-id="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(label)} from this template">Exclude</button>
              </div>
            </article>
          `;
        }).join("")
      : '<p class="muted-text">No carriers selected. A draft may remain empty.</p>';
  }

  function renderCrmResults() {
    if (!crmResults) return;
    crmResults.innerHTML = crmRows.length
      ? crmRows.map((vendor) => {
          const id = vendorId(vendor);
          const selected = draftState.vendor_ids.includes(id);
          const label = vendorName(vendor);
          return `
            <article class="carrier-template-crm-row">
              <div>
                <strong>${escapeHtml(label)}</strong>
                <small>${escapeHtml(vendor.domain || vendor.primary_email || id)}</small>
              </div>
              <span class="status-pill">${escapeHtml(vendor.status || "unknown")}</span>
              <button class="secondary small-button" type="button" data-template-add-member="${escapeHtml(id)}" aria-label="Add ${escapeHtml(label)}"${selected ? " disabled" : ""}>${selected ? "Added" : "Add"}</button>
            </article>
          `;
        }).join("")
      : '<p class="muted-text">No Carrier CRM records match the current filters.</p>';
    const start = crmTotal && crmRows.length ? crmPageOffset + 1 : 0;
    const end = crmTotal ? Math.min(crmPageOffset + crmRows.length, crmTotal) : 0;
    if (crmPageStatus) crmPageStatus.textContent = `Showing ${start}-${end} of ${crmTotal}`;
    if (crmPreviousButton) crmPreviousButton.disabled = crmPageOffset <= 0;
    if (crmNextButton) crmNextButton.disabled = crmPageOffset + CRM_PAGE_SIZE >= crmTotal;
  }

  function resolutionCounts() {
    const counts = { matched: 0, ambiguous: 0, not_found: 0, duplicate: 0 };
    for (const row of draftState.resolution_rows) {
      if (Object.hasOwn(counts, row.status)) counts[row.status] += 1;
    }
    return counts;
  }

  function sourceIdentifierSummary(row = {}) {
    const source = row.source_row || {};
    return [
      source.vendor_id && `vendor_id ${source.vendor_id}`,
      source.crm_id && `crm_id ${source.crm_id}`,
      source.usdot_number && `USDOT ${source.usdot_number}`,
      source.mc_number && `MC ${source.mc_number}`,
      source.primary_email,
      source.vendor_name
    ].filter(Boolean).join(" · ") || "No usable identifier supplied";
  }

  function renderResolutionRows() {
    const counts = resolutionCounts();
    if (resolutionSummary) {
      resolutionSummary.innerHTML = ["matched", "ambiguous", "not_found", "duplicate"].map((statusName) => `
        <article><span>${escapeHtml(statusName.replaceAll("_", " "))}</span><strong>${counts[statusName]}</strong></article>
      `).join("");
    }
    if (resolutionRowsHost) {
      resolutionRowsHost.innerHTML = draftState.resolution_rows.length
        ? draftState.resolution_rows.map((row) => {
            const rowNumber = Number(row.source_row_number) || 0;
            const chosenId = text(row.chosen_vendor_id || draftState.manual_resolutions[String(rowNumber)]);
            const rowIdentity = text(row.resolution_row_identity);
            const generation = Number(row.reconciliation_generation) || 0;
            const choices = reconciliation.choicesFor(row);
            const manualControls = row.status === "ambiguous"
              ? `
                <div class="carrier-template-manual-resolution">
                  <label>
                    Search existing Carrier CRM
                    <input type="search" data-template-ambiguous-search="${rowNumber}" data-template-ambiguous-row-identity="${escapeHtml(rowIdentity)}" data-template-reconciliation-generation="${generation}" data-unsaved-ignore placeholder="Carrier name, domain, or email" />
                  </label>
                  <button class="secondary small-button" type="button" data-template-ambiguous-search-button="${rowNumber}" data-template-ambiguous-row-identity="${escapeHtml(rowIdentity)}" data-template-reconciliation-generation="${generation}">Search</button>
                  <div class="carrier-template-ambiguous-choices">
                    ${choices.map((vendor) => {
                      const id = vendorId(vendor);
                      const label = vendorName(vendor);
                      return `<button class="secondary small-button" type="button" data-template-ambiguous-choice-row="${rowNumber}" data-template-ambiguous-choice-id="${escapeHtml(id)}" data-template-ambiguous-row-identity="${escapeHtml(rowIdentity)}" data-template-reconciliation-generation="${generation}" aria-label="Choose ${escapeHtml(label)} for source row ${rowNumber}">${escapeHtml(label)}</button>`;
                    }).join("")}
                  </div>
                  ${chosenId ? `<p class="status-message" data-tone="success">Human choice: ${escapeHtml(vendorName(vendorCache.get(chosenId) || { id: chosenId }))} · ${escapeHtml(chosenId)}</p>` : '<p class="muted-text">No human choice recorded; this row remains excluded.</p>'}
                </div>
              `
              : "";
            return `
              <article class="carrier-template-resolution-row" data-resolution-status="${escapeHtml(row.status)}">
                <header><strong>Row ${rowNumber}</strong><span class="status-pill">${escapeHtml(row.status)}</span></header>
                <p>${escapeHtml(resolutionReason(row))}</p>
                <small>${escapeHtml(sourceIdentifierSummary(row))}</small>
                ${manualControls}
              </article>
            `;
          }).join("")
        : '<p class="muted-text">Upload a CSV/XLSX to preview reconciliation outcomes.</p>';
    }
    const exceptionRows = draftState.resolution_rows.filter((row) => row.status !== "matched");
    if (downloadExceptionsButton) downloadExceptionsButton.hidden = !exceptionRows.length;
  }

  function memberList(ids = []) {
    return ids.length
      ? `<ol>${ids.map((id) => `<li><strong>${escapeHtml(vendorName(vendorCache.get(id) || { id }))}</strong><small>${escapeHtml(id)}</small></li>`).join("")}</ol>`
      : '<p class="muted-text">None</p>';
  }

  function renderReview() {
    if (!reviewHost) return;
    const diff = carrierTemplateDraftDiff(draftState);
    const exceptions = draftState.resolution_rows.filter((row) => row.status !== "matched");
    reviewHost.innerHTML = `
      <div class="carrier-template-review-grid">
        <article><p class="eyebrow">Exact members</p><h3>${draftState.vendor_ids.length.toLocaleString()} carrier(s)</h3>${memberList(draftState.vendor_ids)}</article>
        <article><p class="eyebrow">Added</p><h3>${diff.added_vendor_ids.length.toLocaleString()}</h3>${memberList(diff.added_vendor_ids)}</article>
        <article><p class="eyebrow">Removed</p><h3>${diff.removed_vendor_ids.length.toLocaleString()}</h3>${memberList(diff.removed_vendor_ids)}</article>
        <article><p class="eyebrow">Exceptions</p><h3>${exceptions.length.toLocaleString()}</h3><p>${exceptions.length ? "Review unresolved, ambiguous, and duplicate source rows before saving." : "No import exceptions."}</p></article>
      </div>
    `;
  }

  function renderConflict() {
    if (!conflictHost) return;
    if (!wizardConflictCurrent) {
      conflictHost.hidden = true;
      conflictHost.innerHTML = "";
      return;
    }
    const summary = carrierTemplateConflictSummary(draftState, wizardConflictCurrent);
    const savedSnapshot = wizardConflictReason === "saved_snapshot";
    conflictHost.hidden = false;
    conflictHost.innerHTML = `
      <strong>${savedSnapshot ? "The dispatched snapshot was saved, but newer local edits were retained." : "Another editor saved a newer version."}</strong>
      <p>Your local v${escapeHtml(summary.local_version || "new")} draft is retained: ${summary.local_member_count} members. Current server v${escapeHtml(summary.current_version || "unknown")} has ${summary.current_member_count} members.</p>
      <p>Only local: ${summary.only_local_vendor_ids.length}. Only current: ${summary.only_current_vendor_ids.length}. No merge, overwrite, or retry was attempted.</p>
      <button class="secondary" type="button" data-template-conflict-reload>Reload current</button>
    `;
  }

  function renderSaveSummary() {
    if (!saveSummary) return;
    const draftValidation = validateCarrierTemplateDraft(draftState, "draft");
    const activeValidation = validateCarrierTemplateDraft(draftState, "active");
    saveSummary.innerHTML = `
      <p class="eyebrow">Save decision</p>
      <h3>${escapeHtml(draftState.name || "Untitled template")}</h3>
      <p>${draftState.vendor_ids.length.toLocaleString()} exact member(s). Draft may be empty; activation requires at least one member.</p>
      ${draftValidation.valid ? "" : `<p class="status-message" data-tone="error">${escapeHtml(draftValidation.errors.map((item) => item.message).join(" "))}</p>`}
    `;
    if (saveDraftButton) saveDraftButton.disabled = wizardSaveRunning || !canManage || !wizardCapabilityWritable || !draftValidation.valid;
    if (activateTemplateButton) activateTemplateButton.disabled = wizardSaveRunning || !canManage || !wizardCapabilityWritable || !activeValidation.valid;
  }

  function renderWizard() {
    if (!wizard) return;
    wizard.hidden = !wizardOpen;
    if (!wizardOpen) return;
    wizardStepButtons.forEach((button) => {
      const active = Number(button.dataset.templateWizardStep) === draftState.step;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    wizardPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.templateWizardPanel) !== draftState.step;
    });
    if (wizardBackButton) wizardBackButton.disabled = draftState.step === 0;
    if (wizardNextButton) wizardNextButton.hidden = draftState.step === 3;
    renderCrmResults();
    renderSelectedMembers();
    renderResolutionRows();
    renderReview();
    renderSaveSummary();
    renderConflict();
    syncDraftMutationControls();
  }

  function focusActiveWizardPanel() {
    const panel = wizardPanels.find((item) => Number(item.dataset.templateWizardPanel) === draftState.step);
    panel?.focus();
  }

  async function hydrateMemberVendors(ids = draftState.vendor_ids) {
    if (!wizardCapabilityWritable) return false;
    const operation = wizardAsync.begin("hydration");
    const missingIds = [...ids].filter((id) => !vendorCache.has(id));
    const fetchedRows = [];
    for (let offset = 0; offset < missingIds.length; offset += 500) {
      const batch = missingIds.slice(offset, offset + 500);
      if (!batch.length) continue;
      const result = await fetchVendors({ ids: batch, view: "all", lightweight: true, limit: 500, offset: 0 });
      if (!wizardAsync.isCurrent(operation)) return false;
      fetchedRows.push(...(Array.isArray(result?.rows) ? result.rows : []));
    }
    if (!wizardAsync.isCurrent(operation)) return false;
    cacheVendorRows(fetchedRows);
    return true;
  }

  async function loadCrmPage({ announce = true } = {}) {
    if (!wizardOpen || !wizardCapabilityWritable) return false;
    const operation = wizardAsync.begin("crm-page");
    const requestedOffset = crmPageOffset;
    const request = Object.freeze({
      search: text(crmSearchInput?.value),
      status: text(crmStatusFilter?.value),
      view: "all",
      channel: text(crmChannelFilter?.value),
      tag: text(crmTagFilter?.value),
      coverage: text(crmCoverageFilter?.value),
      lightweight: true,
      limit: CRM_PAGE_SIZE,
      offset: requestedOffset
    });
    if (announce && crmStatusMessage) crmStatusMessage.textContent = "Loading Carrier CRM records...";
    if (crmResults) crmResults.setAttribute("aria-busy", "true");
    try {
      const result = await fetchVendors(request);
      if (!wizardAsync.isCurrent(operation)) return false;
      crmRows = Array.isArray(result?.rows) ? result.rows : [];
      crmTotal = Number(result?.total) || crmRows.length;
      if (!crmRows.length && crmTotal > 0 && requestedOffset >= crmTotal) {
        crmPageOffset = Math.max(0, Math.floor((crmTotal - 1) / CRM_PAGE_SIZE) * CRM_PAGE_SIZE);
        return await loadCrmPage({ announce: false });
      }
      cacheVendorRows(crmRows);
      renderWizard();
      if (crmStatusMessage) crmStatusMessage.textContent = `${crmRows.length.toLocaleString()} existing carrier(s) loaded.`;
      return true;
    } catch (error) {
      if (!wizardAsync.isCurrent(operation)) return false;
      crmRows = [];
      crmTotal = 0;
      renderCrmResults();
      if (crmStatusMessage) {
        crmStatusMessage.textContent = humanizeError(error);
        crmStatusMessage.dataset.tone = "error";
      }
      return false;
    } finally {
      if (wizardAsync.isCurrent(operation)) crmResults?.setAttribute("aria-busy", "false");
    }
  }

  function syncDraftDetailInputs() {
    if (draftNameInput) draftNameInput.value = draftState.name;
    if (draftDescriptionInput) draftDescriptionInput.value = draftState.description;
  }

  async function openTemplateWizard(template = {}, { openerResolver = null } = {}) {
    if (!canManage || !wizard || !wizardForm) {
      setStatus("Creating or editing templates requires vendors:manage.", "warning");
      return false;
    }
    editorLaunchToken += 1;
    draftMutations.invalidate();
    reconciliation.reset();
    draftState = createCarrierTemplateDraftState(template);
    const session = wizardAsync.open({
      template_id: draftState.id,
      expected_version: draftState.expected_version
    });
    wizardConflictCurrent = null;
    wizardConflictReason = "";
    wizardSaveRunning = false;
    wizardRecoveryMode = false;
    wizard.classList.remove("is-capability-recovery");
    crmPageOffset = 0;
    wizardOpen = true;
    if (importInput) importInput.value = "";
    syncDraftDetailInputs();
    window.ratewareMarkFormClean?.(wizardForm);
    setWizardStatus(draftState.id ? `Editing loaded v${draftState.expected_version}.` : "New template draft. Nothing has been saved yet.");
    mountWizardModalLayer();
    renderWizard();
    modalFocus.open(draftNameInput || wizardCloseButton, {
      resolveOpener: typeof openerResolver === "function" ? openerResolver : stableTemplateOpener(draftState.id)
    });
    try {
      if (!await hydrateMemberVendors()) return false;
      if (wizardAsync.snapshot().session !== session.session) return false;
      renderWizard();
      await loadCrmPage();
    } catch (error) {
      if (wizardAsync.snapshot().session === session.session) setWizardStatus(humanizeError(error), "error");
    }
    return wizardAsync.snapshot().session === session.session;
  }

  function closeTemplateWizard({ confirmUnsaved = true, restoreFocus = true } = {}) {
    if (!wizardOpen) return true;
    if (confirmUnsaved && draftState.dirty) {
      const confirmed = typeof window.ratewareConfirmUnsavedChanges === "function"
        ? window.ratewareConfirmUnsavedChanges()
        : window.confirm("You have unsaved template changes. Close without saving?");
      if (!confirmed) return false;
    }
    wizardOpen = false;
    editorLaunchToken += 1;
    wizardSaveRunning = false;
    wizardAsync.close();
    draftMutations.invalidate();
    reconciliation.reset();
    wizardConflictCurrent = null;
    wizardConflictReason = "";
    wizardRecoveryMode = false;
    wizard?.classList.remove("is-capability-recovery");
    window.ratewareMarkFormClean?.(wizardForm);
    renderWizard();
    modalFocus.close({ restoreFocus });
    restoreWizardHome();
    return true;
  }

  async function handleCarrierTemplateImport(file) {
    if (!file || !wizardOpen || !canMutateDraft()) return;
    wizardAsync.invalidateOperations((name) => name === "file-import" || name.startsWith("ambiguity-search:"));
    const uploadGeneration = reconciliation.startUpload();
    const operation = wizardAsync.begin("file-import");
    renderWizard();
    if (importStatus) {
      importStatus.textContent = "Reading the first sheet...";
      importStatus.dataset.tone = "neutral";
    }
    try {
      const normalizedRows = await parseCarrierTemplateFile(file);
      if (!wizardAsync.isCurrent(operation)) return;
      if (importStatus) importStatus.textContent = `Resolving ${normalizedRows.length.toLocaleString()} row(s) against Carrier CRM...`;
      const resolution = await resolveCarrierListTemplateRows(normalizedRows);
      if (!wizardAsync.isCurrent(operation) || reconciliation.generation !== uploadGeneration) return;
      const mergedRows = reconciliation.identifyRows(
        uploadGeneration,
        mergeCarrierTemplateResolutionRows(normalizedRows, resolution?.rows)
      );
      const autoMatchedCount = mergedRows.filter((row) => row.status === "matched").length;
      if (!reconciliation.commitPreview(uploadGeneration, () => applyDraftAction({
        type: "apply_resolution_preview",
        rows: mergedRows
      }))) return;
      await hydrateMemberVendors(draftState.vendor_ids);
      if (!wizardAsync.isCurrent(operation) || reconciliation.generation !== uploadGeneration) return;
      renderWizard();
      if (importStatus) {
        importStatus.textContent = `${autoMatchedCount.toLocaleString()} deterministic match(es) added. Ambiguous, not-found, and duplicate rows remain excluded.`;
        importStatus.dataset.tone = "success";
      }
    } catch (error) {
      if (wizardAsync.isCurrent(operation) && importStatus) {
        importStatus.textContent = humanizeError(error);
        importStatus.dataset.tone = "error";
      }
    }
  }

  function downloadCarrierTemplateExceptions() {
    const exceptionRows = draftState.resolution_rows.filter((row) => row.status !== "matched");
    if (!exceptionRows.length) return;
    const csv = carrierTemplateExceptionCsv(exceptionRows);
    downloadTextFile(
      `carrier-template-exceptions-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
    setWizardStatus(`${exceptionRows.length.toLocaleString()} exception row(s) downloaded.`, "success");
  }

  async function searchAmbiguousRow({ rowNumber, rowIdentity, generation }) {
    if (!canMutateDraft()) return;
    const resolutionRow = draftState.resolution_rows.find((row) => (
      Number(row.source_row_number) === Number(rowNumber) &&
      text(row.resolution_row_identity) === text(rowIdentity) &&
      Number(row.reconciliation_generation) === Number(generation)
    ));
    if (!resolutionRow || !reconciliation.isCurrent({ generation, row_identity: rowIdentity })) return;
    const input = [...(wizard?.querySelectorAll("[data-template-ambiguous-search]") || [])].find((element) => (
      text(element.dataset.templateAmbiguousRowIdentity) === text(rowIdentity) &&
      Number(element.dataset.templateReconciliationGeneration) === Number(generation)
    ));
    const query = text(input?.value);
    if (!query) {
      setWizardStatus("Enter a Carrier CRM search for the ambiguous row.", "warning");
      input?.focus();
      return;
    }
    const operation = wizardAsync.begin(`ambiguity-search:${generation}:${rowIdentity}`);
    setWizardStatus(`Searching Carrier CRM for source row ${rowNumber}...`);
    try {
      const result = await fetchVendors({ search: query, view: "all", lightweight: true, limit: 20, offset: 0 });
      if (!wizardAsync.isCurrent(operation) || !reconciliation.isCurrent({ generation, row_identity: rowIdentity })) return;
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      cacheVendorRows(rows);
      if (!reconciliation.storeChoices({ generation, row_identity: rowIdentity }, rows)) return;
      renderWizard();
      setWizardStatus(`${rows.length.toLocaleString()} existing carrier choice(s) found for source row ${rowNumber}.`);
    } catch (error) {
      if (wizardAsync.isCurrent(operation) && reconciliation.isCurrent({ generation, row_identity: rowIdentity })) {
        setWizardStatus(humanizeError(error), "error");
      }
    }
  }

  async function saveTemplateDraft(lifecycleStatus) {
    if (wizardSaveRunning || !canMutateDraft()) return;
    const validation = validateCarrierTemplateDraft(draftState, lifecycleStatus);
    if (!validation.valid) {
      setWizardStatus(validation.errors.map((item) => item.message).join(" "), "error");
      return;
    }
    const draftPayload = carrierTemplateDraftPayload(draftState, lifecycleStatus);
    const payload = Object.freeze({
      ...draftPayload,
      vendor_ids: Object.freeze([...draftPayload.vendor_ids])
    });
    const savedTemplateId = draftState.id;
    const savedExpectedVersion = draftState.expected_version;
    wizardAsync.invalidateOperations();
    const saveContext = wizardAsync.snapshot();
    const saveDispatch = draftMutations.beginSave({
      session: saveContext.session,
      template_id: savedTemplateId,
      expected_version: savedExpectedVersion
    });
    if (!saveDispatch) return;
    const operation = wizardAsync.begin("save");
    wizardSaveRunning = true;
    wizardConflictCurrent = null;
    wizardConflictReason = "";
    renderWizard();
    setWizardStatus(lifecycleStatus === "active" ? "Activating template..." : "Saving draft...");
    try {
      const result = savedTemplateId
        ? await updateCarrierListTemplate(savedTemplateId, payload, savedExpectedVersion)
        : await createCarrierListTemplate(payload);
      if (!wizardAsync.isCurrent(operation)) return;
      if (!result?.row) throw new Error("The carrier template save returned no current row.");
      const currentContext = wizardAsync.snapshot();
      const accepted = draftMutations.completeSave(saveDispatch, {
        session: currentContext.session,
        template_id: savedTemplateId,
        expected_version: savedExpectedVersion,
        serverRow: result.row,
        acceptSaved: (saved) => {
          setDraftState(reduceCarrierTemplateDraft(draftState, { type: "accept_saved", template: saved }), { renderState: false });
        },
        retainComparison: (saved) => {
          wizardConflictCurrent = saved;
          wizardConflictReason = "saved_snapshot";
          setDraftState(reduceCarrierTemplateDraft(draftState, { type: "go_to_step", step: 3 }), { renderState: false });
        }
      });
      wizardSaveRunning = false;
      if (!accepted) {
        replaceTemplateRow(result.row);
        render();
        renderWizard();
        focusActiveWizardPanel();
        setWizardStatus("The server saved the dispatched snapshot, but newer local edits were detected and retained. Compare local with current; no overwrite, merge, or retry occurred.", "warning");
        return;
      }
      const savedSession = wizardAsync.open({
        template_id: draftState.id,
        expected_version: draftState.expected_version
      });
      replaceTemplateRow(result.row);
      selectedTemplateId = templateId(result.row);
      await requestController.select(selectedTemplateId);
      if (wizardAsync.snapshot().session !== savedSession.session) return;
      templates = requestController.snapshot().rows;
      render();
      renderWizard();
      onSelectionChange(selectedTemplateId, { replace: false });
      setWizardStatus(`${templateName(result.row)} saved as ${templateLifecycle(result.row)} v${displayedTemplateVersion(result.row)}.`, "success");
    } catch (error) {
      if (!wizardAsync.isCurrent(operation)) return;
      if (String(error?.code) === "template_version_conflict" && savedTemplateId) {
        const currentFetch = wizardAsync.begin("current-fetch");
        try {
          const current = await getCarrierListTemplate(savedTemplateId);
          if (!wizardAsync.isCurrent(operation) || !wizardAsync.isCurrent(currentFetch)) return;
          wizardConflictCurrent = current?.row || null;
          wizardConflictReason = "version_conflict";
          setDraftState(reduceCarrierTemplateDraft(draftState, { type: "go_to_step", step: 3 }), { renderState: false });
          renderWizard();
          focusActiveWizardPanel();
          setWizardStatus("The local draft is retained. Compare it with the current server version, then choose Reload current only if you intend to discard local edits. No retry occurred.", "warning");
        } catch (reloadError) {
          if (wizardAsync.isCurrent(operation) && wizardAsync.isCurrent(currentFetch)) {
            setWizardStatus(`The local draft is retained, but the current server template could not be fetched: ${humanizeError(reloadError)}`, "error");
          }
        }
      } else {
        setWizardStatus(humanizeError(error), "error");
      }
    } finally {
      draftMutations.cancelSave(saveDispatch);
      if (wizardAsync.isCurrent(operation)) {
        wizardSaveRunning = false;
        renderWizard();
      }
    }
  }

  async function reloadCurrentTemplate() {
    if (!wizardConflictCurrent || !canMutateDraft()) return;
    const current = wizardConflictCurrent;
    draftState = createCarrierTemplateDraftState(current);
    const session = wizardAsync.open({
      template_id: draftState.id,
      expected_version: draftState.expected_version
    });
    wizardConflictCurrent = null;
    wizardConflictReason = "";
    reconciliation.reset();
    syncDraftDetailInputs();
    window.ratewareMarkFormClean?.(wizardForm);
    if (!await hydrateMemberVendors(draftState.vendor_ids)) return;
    if (wizardAsync.snapshot().session !== session.session) return;
    renderWizard();
    focusActiveWizardPanel();
    setWizardStatus(`Reloaded current server v${draftState.expected_version}. The previous local draft was discarded by your explicit choice.`, "success");
  }

  function applyRequestState(state, { renderState = true } = {}) {
    templates = [...state.rows];
    selectedTemplateId = state.selectedId;
    if (state.capability === "enabled") {
      capabilityView.transition("enabled");
      if (renderState) render();
      return;
    }
    if (state.capability === "disabled") {
      capabilityView.transition("disabled");
      return;
    }
    if (state.capability === "error") capabilityView.transition("error", { error: state.error });
  }

  function setManageAffordances() {
    if (!newButton) return;
    newButton.disabled = !canManage;
    newButton.setAttribute("aria-disabled", String(!canManage));
    newButton.title = canManage ? "" : "Requires vendors:manage";
  }

  function selectedTemplate() {
    return templates.find((row) => templateId(row) === selectedTemplateId) || null;
  }

  function visibleTemplates() {
    const query = text(searchInput?.value).toLocaleLowerCase();
    const lifecycleFilter = text(statusFilter?.value) || "active";
    return templates.filter((row) => {
      if (lifecycleFilter !== "all" && templateLifecycle(row) !== lifecycleFilter) return false;
      if (!query) return true;
      return `${templateName(row)} ${templateDescription(row)}`.toLocaleLowerCase().includes(query);
    });
  }

  function renderTable() {
    if (!tableHost) return;
    const rows = visibleTemplates();
    tableHost.innerHTML = `
      <table class="carrier-template-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Members</th>
            <th>Modified</th>
            <th>Actor</th>
            <th>Status</th>
            <th>Version</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => templateRow(row, selectedTemplateId, canManage)).join("")
            : '<tr><td colspan="7">No templates match the current library filters.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderDetail() {
    if (!detail) return;
    const row = selectedTemplate();
    if (!row) {
      detail.innerHTML = `
        <p class="eyebrow">Template detail</p>
        <h3>Select a template</h3>
        <p>Open a row to review its static membership and current version.</p>
      `;
      return;
    }
    const lifecycle = templateLifecycle(row);
    const version = displayedTemplateVersion(row);
    detail.innerHTML = `
      <p class="eyebrow">Template detail</p>
      <h3>${escapeHtml(templateName(row))}</h3>
      <p>${escapeHtml(templateDescription(row))}</p>
      <dl class="carrier-template-facts">
        <div><dt>Members</dt><dd>${memberCount(row).toLocaleString()}</dd></div>
        <div><dt>Status</dt><dd><span class="status-pill" data-tone="${lifecycleTone(lifecycle)}">${escapeHtml(lifecycle)}</span></dd></div>
        <div><dt>Version</dt><dd>v${version}</dd></div>
        <div><dt>Modified</dt><dd>${escapeHtml(formatModifiedAt(row.updated_at))}</dd></div>
        <div><dt>Actor</dt><dd>${escapeHtml(modifiedBy(row))}</dd></div>
      </dl>
      <p class="carrier-template-static-note">Membership is static. Editing a carrier profile does not change this list.</p>
      ${actionButtons(row, canManage)}
    `;
  }

  function render() {
    setManageAffordances();
    renderTable();
    renderDetail();
  }

  function focusSelectedAction(action = "open") {
    window.requestAnimationFrame(() => {
      const id = typeof window.CSS?.escape === "function"
        ? window.CSS.escape(selectedTemplateId)
        : selectedTemplateId.replaceAll('"', '\\"');
      workspace?.querySelector(`[data-template-action="${action}"][data-template-id="${id}"]`)?.focus();
    });
  }

  function replaceTemplateRow(row) {
    requestController.replaceRow(row);
    templates = requestController.snapshot().rows;
  }

  async function handleConflict(error, id, displayedVersion, action) {
    const current = await requestController.handleConflict(error, { id, displayedVersion, action });
    if (!current.current) return;
    applyRequestState(current.state, { renderState: false });
    render();
    if (current.kind === "name") {
      setStatus(current.message, "warning");
      focusSelectedAction("duplicate");
      return;
    }
    if (current.kind !== "version") {
      setStatus(humanizeError(error), "error");
      focusSelectedAction(action);
      return;
    }
    setStatus(current.message, "warning");
    const retryAction = action === "duplicate"
      ? "duplicate"
      : current.row
        ? (templateLifecycle(current.row) === "archived" ? "restore" : "archive")
        : action;
    focusSelectedAction(retryAction);
  }

  async function loadLibrary({ announce = true } = {}) {
    if (!workspace || !tab || !tableHost || !detail) return false;
    capabilityView.transition("pending");
    workspace.setAttribute("aria-busy", "true");
    if (announce) setStatus("Loading carrier list templates...");
    let currentRequest = false;
    try {
      const outcome = await requestController.load(text(statusFilter?.value) || "active");
      currentRequest = outcome.current;
      if (!outcome.current) return false;
      applyRequestState(outcome.state);
      if (outcome.state.capability === "enabled") {
        if (announce) setStatus(`${templates.length.toLocaleString()} template(s) loaded.`, "success");
        return true;
      }
      return false;
    } finally {
      if (currentRequest) workspace.setAttribute("aria-busy", "false");
    }
  }

  async function selectTemplate(id, { focus = false, updateHistory = false } = {}) {
    if (!capabilityView.enabled || !id) return false;
    const selection = requestController.select(id);
    applyRequestState(requestController.snapshot(), { renderState: false });
    const outcome = await selection;
    if (!outcome.current) return false;
    applyRequestState(outcome.state, { renderState: false });
    render();
    if (outcome.error) {
      setStatus(humanizeError(outcome.error), "error");
      return false;
    }
    if (updateHistory) onSelectionChange(id, { replace: false });
    if (focus) detail?.focus();
    return true;
  }

  async function showNewTemplateGuidance() {
    editorLaunchToken += 1;
    if (wizardOpen && !closeTemplateWizard()) return false;
    selectedTemplateId = "";
    requestController.select("");
    renderTable();
    if (detail) {
      detail.innerHTML = `
        <p class="eyebrow">New template</p>
        <h3>Build from Carrier CRM</h3>
        <p>Select only carriers already in this workspace. Import reconciliation and carrier creation are not performed by this library.</p>
        <p class="carrier-template-static-note">The guided template constructor will continue from this panel without changing carrier profiles.</p>
      `;
      detail.focus();
    }
    onSelectionChange("", { replace: false });
    workspace?.dispatchEvent(new CustomEvent("carrier-template:new", { bubbles: true }));
    setStatus("Ready to start a template from existing CRM carriers.");
    await openTemplateWizard({}, { openerResolver: stableTemplateOpener("") });
    return true;
  }

  async function mutateTemplate(action, button) {
    if (mutationRunning) return;
    const id = text(button.dataset.templateId);
    const row = templates.find((item) => templateId(item) === id);
    if (!row) return;
    const displayedVersion = Number(button.dataset.templateVersion);
    if (!Number.isSafeInteger(displayedVersion) || displayedVersion !== displayedTemplateVersion(row)) {
      setStatus("The displayed template version is no longer available. Open the row and try again.", "warning");
      return;
    }

    let duplicateName = "";
    if (action === "duplicate") {
      duplicateName = text(window.prompt("Name for the duplicated draft", `${templateName(row)} Copy`));
      if (!duplicateName) return;
    }
    if (action === "archive" || action === "restore") {
      const confirmation = action === "archive"
        ? `Archive “${templateName(row)}”? You can restore it later from the Archived filter.`
        : `Restore “${templateName(row)}” as an active template?`;
      if (!window.confirm(confirmation)) return;
    }

    mutationRunning = true;
    workspace.setAttribute("aria-busy", "true");
    button.disabled = true;
    selectedTemplateId = id;
    setStatus(`${action === "duplicate" ? "Duplicating" : action === "archive" ? "Archiving" : "Restoring"} ${templateName(row)}...`);
    try {
      const result = action === "duplicate"
        ? await duplicateCarrierListTemplate(id, duplicateName, displayedVersion)
        : action === "archive"
          ? await archiveCarrierListTemplate(id, displayedVersion)
          : await restoreCarrierListTemplate(id, displayedVersion);
      if (!result?.row) throw new Error("The carrier template action returned no current row.");
      replaceTemplateRow(result.row);
      selectedTemplateId = templateId(result.row);
      await requestController.select(selectedTemplateId);
      render();
      if (action === "duplicate") onSelectionChange(selectedTemplateId, { replace: false });
      setStatus(
        action === "duplicate"
          ? `${templateName(result.row)} was created as draft v${displayedTemplateVersion(result.row)}.`
          : `${templateName(result.row)} was ${action === "archive" ? "archived" : "restored"} at v${displayedTemplateVersion(result.row)}.`,
        "success"
      );
      focusSelectedAction(action === "archive" ? "restore" : action === "restore" ? "archive" : "open");
    } catch (error) {
      if (error?.status === 409 && ["template_version_conflict", "template_name_conflict"].includes(error?.code)) {
        await handleConflict(error, id, displayedVersion, action);
      } else {
        render();
        setStatus(humanizeError(error), "error");
        focusSelectedAction(action);
      }
    } finally {
      mutationRunning = false;
      workspace.setAttribute("aria-busy", "false");
    }
  }

  workspace?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-template-action]");
    if (!button || !workspace.contains(button) || button.disabled) return;
    const action = text(button.dataset.templateAction);
    if (action === "new") {
      await showNewTemplateGuidance();
      return;
    }
    const id = text(button.dataset.templateId);
    if (action === "open") {
      if (wizardOpen && !closeTemplateWizard()) return;
      const launchToken = ++editorLaunchToken;
      const selected = await selectTemplate(id, { focus: true, updateHistory: true });
      if (launchToken !== editorLaunchToken) return;
      if (selected) {
        try {
          const current = await getCarrierListTemplate(id);
          if (launchToken !== editorLaunchToken) return;
          await openTemplateWizard(current?.row || selectedTemplate(), { openerResolver: stableTemplateOpener(id) });
        } catch (error) {
          if (launchToken === editorLaunchToken) setStatus(humanizeError(error), "error");
        }
      }
      return;
    }
    if (["duplicate", "archive", "restore"].includes(action)) await mutateTemplate(action, button);
  });

  wizardForm?.addEventListener("submit", (event) => event.preventDefault());

  draftNameInput?.addEventListener("input", () => {
    applyDraftAction({
      type: "set_details",
      name: draftNameInput.value,
      description: draftDescriptionInput?.value || ""
    });
  });

  draftDescriptionInput?.addEventListener("input", () => {
    applyDraftAction({
      type: "set_details",
      name: draftNameInput?.value || "",
      description: draftDescriptionInput.value
    });
  });

  wizardCloseButton?.addEventListener("click", () => closeTemplateWizard());
  wizardBackButton?.addEventListener("click", () => {
    if (!applyDraftAction({ type: "go_to_step", step: draftState.step - 1 })) return;
    focusActiveWizardPanel();
  });
  wizardNextButton?.addEventListener("click", () => {
    if (!applyDraftAction({ type: "go_to_step", step: draftState.step + 1 })) return;
    focusActiveWizardPanel();
  });
  wizardStepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!applyDraftAction({
        type: "go_to_step",
        step: Number(button.dataset.templateWizardStep)
      })) return;
      focusActiveWizardPanel();
    });
  });

  wizard?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTemplateWizard();
      return;
    }
    modalFocus.trapTab(event);
  });

  document.addEventListener("focusin", () => {
    if (wizardOpen) modalFocus.containFocus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!wizardOpen || wizard?.contains(event.target)) return;
    event.preventDefault();
    modalFocus.containFocus();
  }, true);

  wizard?.addEventListener("click", async (event) => {
    const addButton = event.target.closest("[data-template-add-member]");
    if (addButton) {
      if (!canMutateDraft()) return;
      const id = text(addButton.dataset.templateAddMember);
      if (!crmRows.some((row) => vendorId(row) === id)) return;
      if (!applyDraftAction({ type: "add_members", vendor_ids: [id] })) return;
      setWizardStatus(`${vendorName(vendorCache.get(id) || { id })} added to the local draft.`);
      return;
    }

    const memberButton = event.target.closest("[data-template-member-action]");
    if (memberButton) {
      if (!canMutateDraft()) return;
      const id = text(memberButton.dataset.templateMemberId);
      const action = text(memberButton.dataset.templateMemberAction);
      const index = draftState.vendor_ids.indexOf(id);
      if (action === "remove") {
        applyDraftAction({ type: "remove_member", vendor_id: id });
      } else if (index >= 0 && ["up", "down"].includes(action)) {
        applyDraftAction({
          type: "reorder_member",
          vendor_id: id,
          to_index: index + (action === "up" ? -1 : 1)
        });
      }
      return;
    }

    const ambiguousSearchButton = event.target.closest("[data-template-ambiguous-search-button]");
    if (ambiguousSearchButton) {
      await searchAmbiguousRow({
        rowNumber: Number(ambiguousSearchButton.dataset.templateAmbiguousSearchButton),
        rowIdentity: text(ambiguousSearchButton.dataset.templateAmbiguousRowIdentity),
        generation: Number(ambiguousSearchButton.dataset.templateReconciliationGeneration)
      });
      return;
    }

    const ambiguousChoiceButton = event.target.closest("[data-template-ambiguous-choice-row]");
    if (ambiguousChoiceButton) {
      if (!canMutateDraft()) return;
      const rowNumber = Number(ambiguousChoiceButton.dataset.templateAmbiguousChoiceRow);
      const id = text(ambiguousChoiceButton.dataset.templateAmbiguousChoiceId);
      const rowIdentity = text(ambiguousChoiceButton.dataset.templateAmbiguousRowIdentity);
      const generation = Number(ambiguousChoiceButton.dataset.templateReconciliationGeneration);
      const resolutionRow = draftState.resolution_rows.find((row) => (
        Number(row.source_row_number) === rowNumber &&
        text(row.resolution_row_identity) === rowIdentity &&
        Number(row.reconciliation_generation) === generation
      ));
      if (!resolutionRow || !reconciliation.isCurrent({ generation, row_identity: rowIdentity })) return;
      if (!reconciliation.choicesFor(resolutionRow).some((row) => vendorId(row) === id)) return;
      if (!applyDraftAction({
        type: "confirm_manual_match",
        source_row_number: rowNumber,
        resolution_row_identity: rowIdentity,
        reconciliation_generation: generation,
        vendor_id: id
      })) return;
      setWizardStatus(`Source row ${rowNumber} was manually resolved to one existing Carrier CRM record.`, "success");
      return;
    }

    if (event.target.closest("[data-template-conflict-reload]")) await reloadCurrentTemplate();
  });

  importInput?.addEventListener("change", async () => {
    if (!canMutateDraft()) {
      importInput.value = "";
      return;
    }
    const [file] = [...(importInput.files || [])];
    await handleCarrierTemplateImport(file);
  });
  downloadExceptionsButton?.addEventListener("click", downloadCarrierTemplateExceptions);
  saveDraftButton?.addEventListener("click", () => saveTemplateDraft("draft"));
  activateTemplateButton?.addEventListener("click", () => saveTemplateDraft("active"));

  function resetCrmPageAndLoad() {
    crmPageOffset = 0;
    return loadCrmPage();
  }

  crmSearchInput?.addEventListener("input", () => {
    if (crmSearchTimer) window.clearTimeout(crmSearchTimer);
    crmSearchTimer = window.setTimeout(resetCrmPageAndLoad, 300);
  });
  for (const filter of [crmStatusFilter, crmChannelFilter, crmTagFilter, crmCoverageFilter]) {
    filter?.addEventListener(filter === crmTagFilter || filter === crmCoverageFilter ? "input" : "change", () => {
      if (crmSearchTimer) window.clearTimeout(crmSearchTimer);
      crmSearchTimer = window.setTimeout(resetCrmPageAndLoad, 250);
    });
  }
  crmPreviousButton?.addEventListener("click", () => {
    crmPageOffset = Math.max(0, crmPageOffset - CRM_PAGE_SIZE);
    loadCrmPage();
  });
  crmNextButton?.addEventListener("click", () => {
    if (crmPageOffset + CRM_PAGE_SIZE >= crmTotal) return;
    crmPageOffset += CRM_PAGE_SIZE;
    loadCrmPage();
  });

  searchInput?.addEventListener("input", () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      renderTable();
      setStatus(`${visibleTemplates().length.toLocaleString()} template(s) match the search.`);
    }, 150);
  });

  statusFilter?.addEventListener("change", async () => {
    selectedTemplateId = "";
    await requestController.select("");
    onSelectionChange("", { replace: true });
    await loadLibrary();
  });

  capabilityRetry?.addEventListener("click", async () => {
    capabilityRetry.disabled = true;
    try {
      await loadLibrary();
    } finally {
      capabilityRetry.disabled = false;
    }
  });

  try {
    const access = await getAccessContext();
    canManage = permissionNames(access).has(MANAGE_PERMISSION);
  } catch {
    canManage = false;
  }
  setManageAffordances();

  const enabled = await loadLibrary();
  if (enabled && initialTemplateId) await selectTemplate(initialTemplateId, { focus: false, updateHistory: false });

  return {
    get enabled() {
      return capabilityView.enabled;
    },
    get capability() {
      return capabilityView.capability;
    },
    get recoveryOpen() {
      return wizardOpen && wizardRecoveryMode;
    },
    activate: ({ templateId: requestedId = "" } = {}) => {
      if (requestedId) return selectTemplate(requestedId, { focus: false, updateHistory: false });
      selectedTemplateId = "";
      requestController.select("");
      render();
      return Promise.resolve(capabilityView.enabled);
    },
    beforeLeave: ({ restoreFocus = false } = {}) => closeTemplateWizard({ restoreFocus }),
    selectTemplate
  };
}
