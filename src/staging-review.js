import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { archiveStagingRows, fetchStagingOptions, fetchStagingRows, removeStagingRows, updateStagingRow } from "./staging-service.js";

const body = document.querySelector("#staging-body");
const refreshButton = document.querySelector("#refresh-staging-button");
const statusFilter = document.querySelector("#staging-status-filter");
const drawer = document.querySelector("#staging-drawer");
const closeDrawerButton = document.querySelector("#close-staging-drawer");
const editForm = document.querySelector("#staging-edit-form");
const editStatus = document.querySelector("#staging-edit-status");
const approveDrawerButton = document.querySelector("#approve-staging-button");
const rejectDrawerButton = document.querySelector("#reject-staging-button");
const rowDetail = document.querySelector("#staging-row-detail");
const selectAllCheckbox = document.querySelector("#select-all-staging");
const bulkSelectionCount = document.querySelector("#bulk-selection-count");
const bulkSaveButton = document.querySelector("#bulk-save-button");
const bulkApproveButton = document.querySelector("#bulk-approve-button");
const bulkRejectButton = document.querySelector("#bulk-reject-button");
const bulkArchiveButton = document.querySelector("#bulk-archive-button");
const bulkRemoveButton = document.querySelector("#bulk-remove-button");
const bulkActionStatus = document.querySelector("#bulk-action-status");
let currentRows = [];
let activeRowId = null;
const selectedRowIds = new Set();
let stagingOptions = {
  categories: {},
  locations: [],
  mx_crossings: [],
  us_crossings: [],
  currencies: ["USD", "MXN", "CAD"]
};
const STAGING_COLSPAN = 26;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lane(row) {
  return `${row.origin || ""} -> ${row.destination || ""}`.trim();
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function inputCell(row, field, options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  const value = options.type === "date"
      ? dateValue(row[field])
      : row[field] || "";
  return `<input class="staging-input ${widthClass}" data-field="${field}" type="${options.type || "text"}" value="${escapeHtml(value)}" ${options.min ? `min="${escapeHtml(options.min)}"` : ""} ${options.max ? `max="${escapeHtml(options.max)}"` : ""} ${options.step ? `step="${escapeHtml(options.step)}"` : ""} />`;
}

function optionList(values = [], currentValue = "") {
  const normalized = String(currentValue || "").trim();
  const options = normalized && !values.includes(normalized) ? [normalized, ...values] : values;
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === normalized ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function selectCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  return `
    <select class="staging-input ${widthClass}" data-field="${field}">
      <option value=""></option>
      ${optionList(values, row[field] || "")}
    </select>
  `;
}

function datalistCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  const listId = `staging-${field}-options`;
  return `<input class="staging-input ${widthClass}" data-field="${field}" list="${listId}" value="${escapeHtml(row[field] || "")}" />`;
}

function locationOptionValue(option) {
  return typeof option === "string" ? option : option.value || option.label || "";
}

function locationOptionLabel(option) {
  return typeof option === "string" ? "" : option.label || "";
}

function statusSelect(row) {
  const status = row.status || "pending_review";
  return `
    <select class="staging-input short-input" data-field="status">
      <option value="pending_review" ${status === "pending_review" ? "selected" : ""}>pending</option>
      <option value="approved" ${status === "approved" ? "selected" : ""}>approved</option>
      <option value="rejected" ${status === "rejected" ? "selected" : ""}>rejected</option>
      <option value="archived" ${status === "archived" ? "selected" : ""}>archived</option>
    </select>
  `;
}

function compactLocationCell(row, prefix) {
  const zip = row[`${prefix}_zip_prefix`] || "";
  const state = row[`${prefix}_state`] || "";
  const country = row[`${prefix}_country`] || "";
  const city = row[`${prefix}_city`] || "";
  const region = row[`${prefix}_region`] || "";
  const reason = row[`${prefix}_match_reason`] || "";
  const text = [zip, state || country].filter(Boolean).join(" / ") || "-";
  const title = [
    city && `City: ${city}`,
    state && `State: ${state}`,
    country && `Country: ${country}`,
    region && `Region: ${region}`,
    reason && `Match: ${reason}`
  ].filter(Boolean).join(" | ");
  const tone = zip || state || city ? "strong" : "weak";
  return `<span class="location-chip ${tone}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
}

function compactMarketCell(row, prefix) {
  const market = row[`${prefix}_market`] || "";
  const region = row[`${prefix}_region`] || "";
  const title = [market && `Market: ${market}`, region && `Region: ${region}`].filter(Boolean).join(" | ");
  return `<span class="location-text" title="${escapeHtml(title)}">${escapeHtml(market || "-")}</span>`;
}

function renderDatalists() {
  const existing = document.querySelector("#staging-datalists");
  existing?.remove();
  const container = document.createElement("div");
  container.id = "staging-datalists";
  container.hidden = true;
  container.innerHTML = `
    <datalist id="staging-origin-options">${stagingOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="staging-destination-options">${stagingOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
  `;
  document.body.appendChild(container);
}

function selectedRows() {
  return [...body.querySelectorAll("[data-row-id]")].filter((row) => {
    const checkbox = row.querySelector("[data-select-row]");
    return checkbox?.checked;
  });
}

function setBulkStatus(message, tone = "neutral") {
  bulkActionStatus.textContent = message;
  bulkActionStatus.dataset.tone = tone;
}

function updateBulkControls() {
  const selectedCount = selectedRows().length;
  const totalRows = body.querySelectorAll("[data-row-id]").length;
  bulkSelectionCount.textContent = `${selectedCount} selected`;
  bulkSaveButton.disabled = selectedCount === 0;
  bulkApproveButton.disabled = selectedCount === 0;
  bulkRejectButton.disabled = selectedCount === 0;
  bulkArchiveButton.disabled = selectedCount === 0;
  bulkRemoveButton.disabled = selectedCount === 0;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
}

function detailLine(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`;
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function renderRowDetail(row) {
  const legs = Array.isArray(row.rateware_lane_legs)
    ? row.rateware_lane_legs.slice().sort((a, b) => Number(a.leg_sequence || 0) - Number(b.leg_sequence || 0))
    : [];

  rowDetail.innerHTML = `
    <section>
      <h3>Location normalization</h3>
      <dl>
        ${detailLine("Origin market", row.origin_market)}
        ${detailLine("Origin ZIP", row.origin_zip_prefix)}
        ${detailLine("Origin city", row.origin_city)}
        ${detailLine("Origin state", row.origin_state)}
        ${detailLine("Origin country", row.origin_country)}
        ${detailLine("Origin region", row.origin_region)}
        ${detailLine("Origin match", row.origin_match_reason)}
        ${detailLine("Destination market", row.destination_market)}
        ${detailLine("Destination ZIP", row.destination_zip_prefix)}
        ${detailLine("Destination city", row.destination_city)}
        ${detailLine("Destination state", row.destination_state)}
        ${detailLine("Destination country", row.destination_country)}
        ${detailLine("Destination region", row.destination_region)}
        ${detailLine("Destination match", row.destination_match_reason)}
      </dl>
    </section>
    <section>
      <h3>Lane and mileage</h3>
      <dl>
        ${detailLine("Lane type", row.lane_type)}
        ${detailLine("Leg status", row.leg_status)}
        ${detailLine("Leg summary", row.leg_summary)}
        ${detailLine("MX km", moneyValue(row.calculated_km))}
        ${detailLine("US miles", moneyValue(row.us_miles || row.calculated_miles))}
        ${detailLine("Mileage source", row.mileage_source)}
      </dl>
    </section>
    <section>
      <h3>Fuel and FX normalization</h3>
      <dl>
        ${detailLine("MX diesel MXN/L", moneyValue(row.mx_diesel_mxn_per_liter))}
        ${detailLine("MX diesel USD/L", moneyValue(row.mx_diesel_usd_per_liter))}
        ${detailLine("FX MXN/USD", moneyValue(row.fx_rate_mxn_usd))}
        ${detailLine("MX diesel factor", moneyValue(row.mx_fuel_factor))}
        ${detailLine("MX fuel USD", moneyValue(row.mx_fuel_cost_usd))}
        ${detailLine("US fuel region", row.fuel_region)}
        ${detailLine("US fuel date", dateValue(row.fuel_index_date))}
        ${detailLine("Rateware FSC", moneyValue(row.normalized_fsc_per_mile))}
        ${detailLine("FSC total", moneyValue(row.normalized_fsc_total))}
        ${detailLine("FSC delta", moneyValue(row.fuel_delta))}
      </dl>
    </section>
    <section>
      <h3>Legs</h3>
      <div class="leg-list">
        ${legs.length ? legs.map((leg) => `
          <div class="leg-card">
            <strong>${escapeHtml(leg.leg_sequence)}. ${escapeHtml(leg.leg_type)}</strong>
            <span>${escapeHtml(leg.origin || "-")} -> ${escapeHtml(leg.destination || "-")}</span>
            <small>${escapeHtml([leg.km ? `${moneyValue(leg.km)} km` : "", leg.miles ? `${moneyValue(leg.miles)} mi` : "", leg.fuel_cost_usd ? `Fuel $${moneyValue(leg.fuel_cost_usd)}` : ""].filter(Boolean).join(" | ") || leg.status || "-")}</small>
          </div>
        `).join("") : '<p class="muted-text">No legs built yet.</p>'}
      </div>
    </section>
  `;
}

function renderRows(rows) {
  currentRows = rows;
  renderDatalists();

  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="${STAGING_COLSPAN}"><div class="empty-state"><strong>No staging rows found</strong><span>Interpret uploaded quotes to create rows for review.</span><a href="./upload-history.html">Open upload history</a></div></td></tr>`;
    updateBulkControls();
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr data-row-id="${escapeHtml(row.id)}">
          <td class="select-column">
            <input data-select-row="${escapeHtml(row.id)}" type="checkbox" aria-label="Select staging row" ${selectedRowIds.has(row.id) ? "checked" : ""} />
          </td>
          <td class="vendor-review-cell">
            ${row.vendors?.vendor_name ? `<strong>${escapeHtml(row.vendors.vendor_name)}</strong>` : ""}
            ${inputCell(row, "vendor_domain", { wide: true })}
            ${row.vendors?.vendor_name ? '<span class="match-pill">Matched</span>' : ""}
          </td>
          <td>${inputCell(row, "quote_date", { type: "date", short: true })}</td>
          <td>${inputCell(row, "rfx_id", { short: true })}</td>
          <td>${datalistCell(row, "origin", stagingOptions.locations, { wide: true })}</td>
          <td>${compactLocationCell(row, "origin")}</td>
          <td>${compactMarketCell(row, "origin")}</td>
          <td>${datalistCell(row, "destination", stagingOptions.locations, { wide: true })}</td>
          <td>${compactLocationCell(row, "destination")}</td>
          <td>${compactMarketCell(row, "destination")}</td>
          <td>${selectCell(row, "equipment", stagingOptions.categories.equipment || [], { short: true })}</td>
          <td>${selectCell(row, "trailer", stagingOptions.categories.trailer || [], { short: true })}</td>
          <td>${selectCell(row, "config", stagingOptions.categories.config || [], { short: true })}</td>
          <td>${selectCell(row, "operation", stagingOptions.categories.operation || [], { short: true })}</td>
          <td>${selectCell(row, "service", stagingOptions.categories.service || [], { short: true })}</td>
          <td>${selectCell(row, "mx_border_crossing_point", stagingOptions.mx_crossings || [], { short: true })}</td>
          <td>${selectCell(row, "us_border_crossing_point", stagingOptions.us_crossings || [], { short: true })}</td>
          <td>${inputCell(row, "mx_linehaul", { money: true })}</td>
          <td>${inputCell(row, "us_linehaul", { money: true })}</td>
          <td>${inputCell(row, "fsc", { money: true })}</td>
          <td>${inputCell(row, "border_crossing_fee", { money: true })}</td>
          <td>${inputCell(row, "all_in_rate", { money: true })}</td>
          <td>${selectCell(row, "currency", stagingOptions.currencies || ["USD", "MXN", "CAD"], { short: true })}</td>
          <td>${inputCell(row, "weekly_capacity", { short: true })}</td>
          <td>${statusSelect(row)}</td>
          <td class="review-actions">
            <button type="button" class="small-button secondary" data-detail-id="${escapeHtml(row.id)}">Details</button>
            <button type="button" class="small-button secondary" data-save-id="${escapeHtml(row.id)}">Save</button>
            <button type="button" class="small-button" data-approve-id="${escapeHtml(row.id)}">Approve</button>
            <button type="button" class="small-button danger" data-reject-id="${escapeHtml(row.id)}">Reject</button>
            <span class="row-save-status" data-row-status="${escapeHtml(row.id)}"></span>
          </td>
        </tr>
      `
    )
    .join("");
  updateBulkControls();
}

function setStatus(message, tone = "neutral") {
  editStatus.textContent = message;
  editStatus.dataset.tone = tone;
}

function rowById(id) {
  return currentRows.find((row) => row.id === id);
}

function openEditDrawer(id) {
  const row = rowById(id);
  if (!row) return;

  activeRowId = id;
  document.querySelector("#staging-drawer-title").textContent = lane(row) || row.rfx_id || "Rate row";
  document.querySelector("#edit-vendor-domain").value = row.vendor_domain || row.vendors?.domain || "";
  document.querySelector("#edit-rfx-id").value = row.rfx_id || "";
  document.querySelector("#edit-quote-date").value = dateValue(row.quote_date);
  document.querySelector("#edit-origin").value = row.origin || "";
  document.querySelector("#edit-destination").value = row.destination || "";
  document.querySelector("#edit-equipment").value = row.equipment || "";
  document.querySelector("#edit-trailer-config").value = [row.trailer, row.config].filter(Boolean).join(" / ");
  document.querySelector("#edit-operation").value = row.operation || "";
  document.querySelector("#edit-service").value = row.service || "";
  document.querySelector("#edit-all-in-rate").value = row.all_in_rate || "";
  document.querySelector("#edit-currency").value = row.currency || "";
  document.querySelector("#edit-weekly-capacity").value = row.weekly_capacity || "";
  document.querySelector("#edit-notes").value = row.notes || "";
  renderRowDetail(row);
  setStatus("");
  drawer.classList.remove("hidden");
}

function readInlinePatch(tableRow, status = null) {
  const patch = {};
  tableRow.querySelectorAll("[data-field]").forEach((input) => {
    patch[input.dataset.field] = input.value;
  });
  if (patch.confidence !== undefined) patch.confidence = Number(patch.confidence || 0) / 100;
  if (status) patch.status = status;
  return patch;
}

function setRowStatus(id, message, tone = "neutral") {
  const status = body.querySelector(`[data-row-status="${CSS.escape(id)}"]`);
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

async function runBulkAction(status = null) {
  const rows = selectedRows();
  if (!rows.length) return;

  const label = status ? status.replace("_", " ") : "save";
  setBulkStatus(`Processing ${rows.length} rows...`);
  bulkSaveButton.disabled = true;
  bulkApproveButton.disabled = true;
  bulkRejectButton.disabled = true;
  bulkArchiveButton.disabled = true;
  bulkRemoveButton.disabled = true;

  try {
    await ensureSignedIn();
    await Promise.all(rows.map(async (tableRow) => {
      const id = tableRow.dataset.rowId;
      setRowStatus(id, status ? `Marking ${label}...` : "Saving...");
      await updateStagingRow(id, readInlinePatch(tableRow, status));
      setRowStatus(id, status ? `Marked ${label}` : "Saved", "success");
      selectedRowIds.delete(id);
    }));
    setBulkStatus(`${rows.length} rows updated.`, "success");
    await loadRows();
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function runBulkArchive() {
  const rows = selectedRows();
  if (!rows.length) return;
  const ids = rows.map((row) => row.dataset.rowId);

  setBulkStatus(`Archiving ${ids.length} rows...`);
  bulkArchiveButton.disabled = true;
  bulkRemoveButton.disabled = true;

  try {
    await ensureSignedIn();
    const result = await archiveStagingRows(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setBulkStatus(`${result.updated || ids.length} rows archived.`, "success");
    await loadRows();
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function runBulkRemove() {
  const rows = selectedRows();
  if (!rows.length) return;
  const ids = rows.map((row) => row.dataset.rowId);
  const confirmed = window.confirm(`Remove ${ids.length} staging rows? This cannot be undone.`);
  if (!confirmed) return;

  setBulkStatus(`Removing ${ids.length} rows...`);
  bulkArchiveButton.disabled = true;
  bulkRemoveButton.disabled = true;

  try {
    await ensureSignedIn();
    const result = await removeStagingRows(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setBulkStatus(`${result.removed || ids.length} rows removed.`, "success");
    await loadRows();
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

function readPatch(status = null) {
  const trailerConfig = document.querySelector("#edit-trailer-config").value.split("/");
  const patch = {
    vendor_domain: document.querySelector("#edit-vendor-domain").value,
    rfx_id: document.querySelector("#edit-rfx-id").value,
    quote_date: document.querySelector("#edit-quote-date").value,
    origin: document.querySelector("#edit-origin").value,
    destination: document.querySelector("#edit-destination").value,
    equipment: document.querySelector("#edit-equipment").value,
    trailer: trailerConfig[0]?.trim() || "",
    config: trailerConfig.slice(1).join("/").trim(),
    operation: document.querySelector("#edit-operation").value,
    service: document.querySelector("#edit-service").value,
    all_in_rate: document.querySelector("#edit-all-in-rate").value,
    currency: document.querySelector("#edit-currency").value,
    weekly_capacity: document.querySelector("#edit-weekly-capacity").value,
    notes: document.querySelector("#edit-notes").value
  };

  if (status) patch.status = status;
  return patch;
}

async function saveActiveRow(status = null) {
  if (!activeRowId) return;
  setStatus(status ? `Saving and marking ${status}...` : "Saving changes...");

  try {
    await ensureSignedIn();
    await updateStagingRow(activeRowId, readPatch(status));
    setStatus(status ? `Row marked ${status}.` : "Changes saved.", "success");
    await loadRows();
    if (status) drawer.classList.add("hidden");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadRows() {
  body.innerHTML = `<tr><td colspan="${STAGING_COLSPAN}">Loading staging rows...</td></tr>`;
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const [options, rows] = await Promise.all([
      fetchStagingOptions().catch(() => stagingOptions),
      fetchStagingRows({ status: statusFilter.value })
    ]);
    stagingOptions = {
      categories: options.categories || {},
      locations: options.locations || [],
      mx_crossings: options.mx_crossings || [],
      us_crossings: options.us_crossings || [],
      currencies: options.currencies || ["USD", "MXN", "CAD"]
    };
    renderRows(rows);
    await applyPermissionState("[data-save-id], [data-approve-id], [data-reject-id], #save-staging-button, #approve-staging-button, #reject-staging-button, #bulk-save-button, #bulk-approve-button, #bulk-reject-button, #bulk-archive-button, #bulk-remove-button", "staging:approve");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${STAGING_COLSPAN}">Could not load staging rows. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

body.addEventListener("click", async (event) => {
  const detail = event.target.closest("[data-detail-id]");
  const save = event.target.closest("[data-save-id]");
  const approve = event.target.closest("[data-approve-id]");
  const reject = event.target.closest("[data-reject-id]");

  if (detail) {
    openEditDrawer(detail.dataset.detailId);
    return;
  }

  if (save) {
    const id = save.dataset.saveId;
    const tableRow = save.closest("[data-row-id]");
    if (!tableRow) return;
    save.disabled = true;
    setRowStatus(id, "Saving...");

    try {
      await ensureSignedIn();
      await updateStagingRow(id, readInlinePatch(tableRow));
      setRowStatus(id, "Saved", "success");
    } catch (error) {
      setRowStatus(id, error.message, "error");
    } finally {
      save.disabled = false;
    }
    return;
  }

  const id = approve?.dataset.approveId || reject?.dataset.rejectId;
  if (!id) return;

  const button = approve || reject;
  const tableRow = button.closest("[data-row-id]");
  button.disabled = true;
  setRowStatus(id, approve ? "Approving..." : "Rejecting...");

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-approve-id], [data-reject-id]", "staging:approve"))) {
      throw new Error("Your role does not allow staging approval.");
    }
    await updateStagingRow(id, tableRow ? readInlinePatch(tableRow, approve ? "approved" : "rejected") : { status: approve ? "approved" : "rejected" });
    await loadRows();
  } catch (error) {
    button.disabled = false;
    setRowStatus(id, error.message, "error");
  }
});

body.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-row]");
  if (!checkbox) return;
  if (checkbox.checked) {
    selectedRowIds.add(checkbox.dataset.selectRow);
  } else {
    selectedRowIds.delete(checkbox.dataset.selectRow);
  }
  setBulkStatus("");
  updateBulkControls();
});

refreshButton.addEventListener("click", loadRows);
statusFilter.addEventListener("change", () => {
  selectedRowIds.clear();
  setBulkStatus("");
  loadRows();
});
selectAllCheckbox?.addEventListener("change", () => {
  body.querySelectorAll("[data-select-row]").forEach((checkbox) => {
    checkbox.checked = selectAllCheckbox.checked;
    if (checkbox.checked) {
      selectedRowIds.add(checkbox.dataset.selectRow);
    } else {
      selectedRowIds.delete(checkbox.dataset.selectRow);
    }
  });
  setBulkStatus("");
  updateBulkControls();
});
bulkSaveButton?.addEventListener("click", () => runBulkAction());
bulkApproveButton?.addEventListener("click", () => runBulkAction("approved"));
bulkRejectButton?.addEventListener("click", () => runBulkAction("rejected"));
bulkArchiveButton?.addEventListener("click", runBulkArchive);
bulkRemoveButton?.addEventListener("click", runBulkRemove);
closeDrawerButton.addEventListener("click", () => drawer.classList.add("hidden"));
editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveActiveRow();
});
approveDrawerButton.addEventListener("click", () => saveActiveRow("approved"));
rejectDrawerButton.addEventListener("click", () => saveActiveRow("rejected"));

initAuthControls();
requirePrivatePage().catch(() => {});
loadRows();
