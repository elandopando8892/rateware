import { getAccessContext } from "./auth.js";
import { createCarrierListTemplateController } from "./carrier-list-template-controller.js";
import { humanizeError } from "./error-copy.js";
import {
  archiveCarrierListTemplate,
  duplicateCarrierListTemplate,
  fetchCarrierListTemplates,
  getCarrierListTemplate,
  restoreCarrierListTemplate
} from "./vendor-service.js";

const MANAGE_PERMISSION = "vendors:manage";
const LIST_PAGE_SIZE = 200;
const LIST_SAFETY_LIMIT = 5000;

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

  let templates = [];
  let selectedTemplateId = "";
  let canManage = false;
  let capabilityEnabled = false;
  let mutationRunning = false;
  let searchTimer = null;
  const requestController = createCarrierListTemplateController({
    fetchList: fetchEveryTemplatePage,
    fetchDetail: getCarrierListTemplate
  });

  function setStatus(message = "", tone = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setCapability(enabled) {
    const nextCapability = enabled === true;
    const changed = capabilityEnabled !== nextCapability;
    capabilityEnabled = nextCapability;
    if (tab) tab.hidden = !capabilityEnabled;
    if (workspace) workspace.hidden = !capabilityEnabled;
    if (changed) onCapabilityChange(capabilityEnabled);
  }

  function hideCapabilityError() {
    if (capabilityError) capabilityError.hidden = true;
  }

  function showCapabilityError(error) {
    capabilityEnabled = false;
    if (tab) tab.hidden = true;
    if (workspace) workspace.hidden = true;
    if (capabilityErrorMessage) {
      capabilityErrorMessage.textContent = `List Templates could not be verified: ${humanizeError(error)}`;
    }
    if (capabilityError) capabilityError.hidden = false;
  }

  function applyRequestState(state, { renderState = true } = {}) {
    templates = [...state.rows];
    selectedTemplateId = state.selectedId;
    if (state.capability === "enabled") {
      hideCapabilityError();
      setCapability(true);
      if (renderState) render();
      return;
    }
    if (state.capability === "disabled") {
      hideCapabilityError();
      setCapability(false);
      return;
    }
    if (state.capability === "error") showCapabilityError(state.error);
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
    if (!capabilityEnabled || !id) return false;
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

  function showNewTemplateGuidance() {
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
      showNewTemplateGuidance();
      return;
    }
    const id = text(button.dataset.templateId);
    if (action === "open") {
      await selectTemplate(id, { focus: true, updateHistory: true });
      return;
    }
    if (["duplicate", "archive", "restore"].includes(action)) await mutateTemplate(action, button);
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
      return capabilityEnabled;
    },
    get capability() {
      return requestController.snapshot().capability;
    },
    activate: ({ templateId: requestedId = "" } = {}) => {
      if (requestedId) return selectTemplate(requestedId, { focus: false, updateHistory: false });
      selectedTemplateId = "";
      requestController.select("");
      render();
      return Promise.resolve(capabilityEnabled);
    },
    selectTemplate
  };
}
