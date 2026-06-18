import { initAuthControls, requirePrivatePage } from "./auth.js";
import { enrichApprovedRatewareLocationZips, renormalizeApprovedRatewareRows, fetchApprovedRateware, fetchRatewareOptions, returnApprovedRatesToStaging, updateApprovedRatewareRow } from "./rateware-service.js";
import { installSpreadsheetGrid } from "./spreadsheet-grid.js";

const body = document.querySelector("#rateware-body");
const searchInput = document.querySelector("#rateware-search");
const operationFilter = document.querySelector("#rateware-operation-filter");
const serviceFilter = document.querySelector("#rateware-service-filter");
const refreshButton = document.querySelector("#refresh-rateware-button");
const clearFiltersButton = document.querySelector("#clear-rateware-filters");
const selectAllCheckbox = document.querySelector("#select-all-rateware");
const selectionCount = document.querySelector("#rateware-selection-count");
const saveSelectedButton = document.querySelector("#save-selected-rateware");
const enrichSelectedZipsButton = document.querySelector("#enrich-selected-zips-rateware");
const renormalizeSelectedButton = document.querySelector("#renormalize-selected-rateware");
const returnSelectedButton = document.querySelector("#return-selected-button");
const exportSelectedButton = document.querySelector("#export-selected-button");
const exportVisibleButton = document.querySelector("#export-visible-button");
const actionStatus = document.querySelector("#rateware-action-status");
const columnFilterInputs = document.querySelectorAll("[data-rateware-column-filter]");
const clearColumnFiltersButton = document.querySelector("#clear-rateware-column-filters");
const ratewareMetricTotal = document.querySelector("#rateware-metric-total");
const ratewareMetricVendors = document.querySelector("#rateware-metric-vendors");
const ratewareMetricMarkets = document.querySelector("#rateware-metric-markets");
const ratewareMetricAverage = document.querySelector("#rateware-metric-average");
const quickFilterButtons = document.querySelectorAll("[data-rateware-filter]");
const drawer = document.querySelector("#rateware-drawer");
const closeDrawerButton = document.querySelector("#close-rateware-drawer");
const drawerTitle = document.querySelector("#rateware-drawer-title");
const ratewareDetail = document.querySelector("#rateware-detail");

const RATEWARE_COLSPAN = 31;
let currentRows = [];
let loadedRows = [];
let activeQuickFilter = "all";
const autoSaveTimers = new Map();
let ratewareOptions = {
  categories: {},
  locations: [],
  mx_crossings: [],
  us_crossings: [],
  currencies: ["USD", "MXN", "CAD"]
};
let ratewareOptionsLoaded = false;
const selectedRowIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function inputCell(row, field, options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  const value = options.type === "date"
    ? dateValue(row[field])
    : options.money
      ? numericValue(row[field]) ?? ""
      : row[field] || "";
  const inputType = options.type || (options.money ? "number" : "text");
  const step = options.step || (options.money ? "0.01" : "");
  return `<input class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}" type="${inputType}" value="${escapeHtml(value)}" ${step ? `step="${escapeHtml(step)}"` : ""} ${options.money ? 'inputmode="decimal"' : ""} />`;
}

function optionList(values = [], currentValue = "") {
  const normalized = String(currentValue || "").trim();
  const options = normalized && !values.includes(normalized) ? [normalized, ...values] : values;
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === normalized ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function selectCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  return `
    <select class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}">
      <option value=""></option>
      ${optionList(values, row[field] || "")}
    </select>
  `;
}

function locationOptionValue(option) {
  return typeof option === "string" ? option : option.value || option.label || "";
}

function locationOptionLabel(option) {
  return typeof option === "string" ? "" : option.label || "";
}

function datalistCell(row, field, listName, options = {}) {
  const widthClass = options.wide ? "wide-input" : options.short ? "short-input" : "";
  return `<input class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}" list="${listName}" value="${escapeHtml(row[field] || "")}" />`;
}

function checkboxCell(row, field, label) {
  return `
    <label class="table-checkbox" title="${escapeHtml(label)}">
      <input class="staging-input rateware-input" data-rateware-field="${field}" type="checkbox" value="true" ${row[field] ? "checked" : ""} />
    </label>
  `;
}

function renderRatewareDatalists() {
  const existing = document.querySelector("#rateware-datalists");
  existing?.remove();
  const container = document.createElement("div");
  container.id = "rateware-datalists";
  container.hidden = true;
  container.innerHTML = `
    <datalist id="rateware-origin-options">${ratewareOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="rateware-destination-options">${ratewareOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
  `;
  document.body.appendChild(container);
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function numericValue(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function hasNumericValue(value) {
  const number = numericValue(value);
  return number !== null && number > 0;
}

function compactLocation(row, prefix) {
  const market = row[`${prefix}_market`];
  const zip = row[`${prefix}_zip_prefix`];
  const state = row[`${prefix}_state`];
  const normalized = row[`normalized_${prefix}`];
  const raw = row[prefix];
  return `
    <strong>${escapeHtml(normalized || raw || "-")}</strong>
    <span>${escapeHtml([market, zip, state].filter(Boolean).join(" | "))}</span>
  `;
}

function borderValue(row) {
  return [row.mx_border_crossing_point, row.us_border_crossing_point].filter(Boolean).join(" / ") || "-";
}

function laneLabel(row) {
  const origin = row.normalized_origin || row.origin || "-";
  const destination = row.normalized_destination || row.destination || "-";
  return `${origin} -> ${destination}`;
}

function hasSplitRate(row) {
  return ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].some((field) => hasNumericValue(row[field]));
}

function rateModeLabel(row) {
  if (hasSplitRate(row)) return "Split components";
  if (hasNumericValue(row.all_in_rate)) return "All-in";
  return "No all-in";
}

function isCrossBorder(row) {
  const text = [row.operation, row.service, row.origin_country, row.destination_country, row.mx_border_crossing_point, row.us_border_crossing_point]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("cross") || text.includes("export") || text.includes("import") || Boolean(row.mx_border_crossing_point || row.us_border_crossing_point);
}

function applyQuickFilter(rows = loadedRows) {
  if (activeQuickFilter === "cross-border") return rows.filter(isCrossBorder);
  if (activeQuickFilter === "all-in") return rows.filter((row) => hasNumericValue(row.all_in_rate) && !hasSplitRate(row));
  if (activeQuickFilter === "split-rate") return rows.filter(hasSplitRate);
  if (activeQuickFilter === "with-capacity") return rows.filter((row) => row.weekly_capacity);
  return rows;
}

function columnFilterText(row, field) {
  if (field === "vendor") return [row.vendors?.vendor_name, row.vendor_domain, row.vendors?.domain].filter(Boolean).join(" ");
  if (field === "origin") {
    return [
      row.origin,
      row.normalized_origin,
      row.origin_city,
      row.origin_state,
      row.origin_zip_prefix,
      row.origin_market,
      row.origin_region,
      row.origin_country
    ].filter(Boolean).join(" ");
  }
  if (field === "destination") {
    return [
      row.destination,
      row.normalized_destination,
      row.destination_city,
      row.destination_state,
      row.destination_zip_prefix,
      row.destination_market,
      row.destination_region,
      row.destination_country
    ].filter(Boolean).join(" ");
  }
  return String(row[field] ?? "");
}

function applyColumnFilters(rows = loadedRows) {
  const filters = [...columnFilterInputs]
    .map((input) => [input.dataset.ratewareColumnFilter, String(input.value || "").trim().toLowerCase()])
    .filter(([, value]) => value);

  if (!filters.length) return rows;
  return rows.filter((row) => filters.every(([field, value]) => columnFilterText(row, field).toLowerCase().includes(value)));
}

function visibleRatewareRows() {
  return applyColumnFilters(applyQuickFilter(loadedRows));
}

function updateQuickFilters() {
  quickFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ratewareFilter === activeQuickFilter);
  });
}

function updateRatewareMetrics(rows) {
  const vendorKeys = new Set(rows.map((row) => row.vendors?.vendor_name || row.vendor_domain || row.vendors?.domain).filter(Boolean));
  const markets = new Set(rows.flatMap((row) => [row.origin_market, row.destination_market]).filter(Boolean));
  const allInValues = rows.map((row) => numericValue(row.all_in_rate)).filter((value) => value !== null && value > 0);
  const average = allInValues.length ? allInValues.reduce((total, value) => total + value, 0) / allInValues.length : null;

  ratewareMetricTotal.textContent = String(rows.length);
  ratewareMetricVendors.textContent = String(vendorKeys.size);
  ratewareMetricMarkets.textContent = String(markets.size);
  ratewareMetricAverage.textContent = average === null ? "-" : moneyValue(average);
}

function populateFilter(select, rows, field) {
  const selected = select.value;
  const values = Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">All</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(selected)) select.value = selected;
}

function detailMetric(label, value, tone = "") {
  return `
    <article class="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
}

function detailLine(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`;
}

function rateComponent(label, value) {
  const hasValue = hasNumericValue(value);
  return `
    <div class="${hasValue ? "has-value" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(hasValue ? moneyValue(value) : "-")}</strong>
    </div>
  `;
}

function openRatewareDrawer(id) {
  const row = currentRows.find((item) => item.id === id) || loadedRows.find((item) => item.id === id);
  if (!row) return;

  const equipment = [row.equipment, row.trailer, row.hazmat ? "Hazmat" : "", row.temperature_controlled ? "Temp controlled" : "", row.config]
    .filter(Boolean)
    .join(" / ");
  drawerTitle.textContent = laneLabel(row);
  ratewareDetail.innerHTML = `
    <section class="drawer-brief">
      <div>
        <p class="eyebrow">Commercial summary</p>
        <h3>${escapeHtml(laneLabel(row))}</h3>
        <span>${escapeHtml([row.vendors?.vendor_name || row.vendor_domain, row.rfx_id, dateValue(row.quote_date)].filter(Boolean).join(" | "))}</span>
      </div>
      <div class="drawer-brief-metrics">
        ${detailMetric("All-in", moneyValue(row.all_in_rate), hasNumericValue(row.all_in_rate) ? "strong" : "weak")}
        ${detailMetric("Currency", row.currency)}
        ${detailMetric("Capacity", row.weekly_capacity)}
        ${detailMetric("Rate mode", rateModeLabel(row))}
      </div>
      <div class="rate-component-grid">
        ${rateComponent("MX linehaul", row.mx_linehaul)}
        ${rateComponent("US linehaul", row.us_linehaul)}
        ${rateComponent("FSC", row.fsc)}
        ${rateComponent("Border fee", row.border_crossing_fee)}
      </div>
    </section>
    <section class="rateware-detail-section">
      <h3>Lane normalization</h3>
      <dl>
        ${detailLine("Origin market", row.origin_market)}
        ${detailLine("Origin ZIP/state", [row.origin_zip_prefix, row.origin_state].filter(Boolean).join(" / "))}
        ${detailLine("Destination market", row.destination_market)}
        ${detailLine("Destination ZIP/state", [row.destination_zip_prefix, row.destination_state].filter(Boolean).join(" / "))}
        ${detailLine("Operation", row.operation)}
        ${detailLine("Service", row.service)}
        ${detailLine("Equipment", equipment)}
        ${detailLine("Border", borderValue(row))}
      </dl>
    </section>
    <section class="rateware-detail-section">
      <h3>Source context</h3>
      <dl>
        ${detailLine("Vendor domain", row.vendor_domain || row.vendors?.domain)}
        ${detailLine("RFx", row.rfx_id)}
        ${detailLine("Quote date", dateValue(row.quote_date))}
        ${detailLine("Status", row.status)}
      </dl>
      <div class="action-row">
        <a class="link-button" href="./staging-review.html">Open staging review</a>
      </div>
    </section>
  `;
  drawer.classList.remove("hidden");
}

function renderRows(rows) {
  currentRows = rows;
  updateQuickFilters();
  updateRatewareMetrics(rows);
  populateFilter(operationFilter, rows, "operation");
  populateFilter(serviceFilter, rows, "service");

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${RATEWARE_COLSPAN}"><div class="empty-state"><strong>No approved rates yet</strong><span>Approve staging rows to build the Rateware.</span><a href="./staging-review.html">Open staging review</a></div></td></tr>`;
    updateBulkControls();
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr data-rateware-id="${escapeHtml(row.id)}">
      <td class="select-column">
        <input data-select-rateware="${escapeHtml(row.id)}" type="checkbox" aria-label="Select approved rate" ${selectedRowIds.has(row.id) ? "checked" : ""} />
      </td>
      <td>
        <strong>${escapeHtml(row.vendors?.vendor_name || row.vendor_domain || "-")}</strong>
        ${inputCell(row, "vendor_domain", { wide: true })}
      </td>
      <td>${inputCell(row, "quote_date", { type: "date", short: true })}</td>
      <td>${inputCell(row, "rfx_id", { short: true })}</td>
      <td>${datalistCell(row, "origin", "rateware-origin-options", { wide: true })}</td>
      <td>${inputCell(row, "origin_zip_prefix", { short: true })}</td>
      <td>${inputCell(row, "origin_state", { short: true })}</td>
      <td>${inputCell(row, "origin_market", { wide: true })}</td>
      <td>${inputCell(row, "origin_region", { wide: true })}</td>
      <td>${datalistCell(row, "destination", "rateware-destination-options", { wide: true })}</td>
      <td>${inputCell(row, "destination_zip_prefix", { short: true })}</td>
      <td>${inputCell(row, "destination_state", { short: true })}</td>
      <td>${inputCell(row, "destination_market", { wide: true })}</td>
      <td>${inputCell(row, "destination_region", { wide: true })}</td>
      <td>${selectCell(row, "equipment", ratewareOptions.categories.equipment || [], { short: true })}</td>
      <td>${selectCell(row, "trailer", ratewareOptions.categories.trailer || [], { short: true })}</td>
      <td>${checkboxCell(row, "hazmat", "Hazmat")}</td>
      <td>${checkboxCell(row, "temperature_controlled", "Temperature controlled")}</td>
      <td>${selectCell(row, "config", ratewareOptions.categories.config || [], { short: true })}</td>
      <td>${selectCell(row, "operation", ratewareOptions.categories.operation || [], { short: true })}</td>
      <td>${selectCell(row, "service", ratewareOptions.categories.service || [], { short: true })}</td>
      <td>${selectCell(row, "mx_border_crossing_point", ratewareOptions.mx_crossings || [], { short: true })}</td>
      <td>${selectCell(row, "us_border_crossing_point", ratewareOptions.us_crossings || [], { short: true })}</td>
      <td>${inputCell(row, "mx_linehaul", { money: true })}</td>
      <td>${inputCell(row, "us_linehaul", { money: true })}</td>
      <td>${inputCell(row, "fsc", { money: true })}</td>
      <td>${inputCell(row, "border_crossing_fee", { money: true })}</td>
      <td>${inputCell(row, "all_in_rate", { money: true })}<span>${escapeHtml(rateModeLabel(row))}</span></td>
      <td>${selectCell(row, "currency", ratewareOptions.currencies || ["USD", "MXN", "CAD"], { short: true })}</td>
      <td>${inputCell(row, "weekly_capacity", { short: true })}</td>
      <td class="history-actions rateware-row-actions">
        <button class="small-button secondary" type="button" data-rateware-detail="${escapeHtml(row.id)}">Details</button>
        <button class="small-button" type="button" data-save-rateware-id="${escapeHtml(row.id)}">Save</button>
        <a class="link-button" href="./staging-review.html">Staging row</a>
        <span class="row-save-status" data-rateware-row-status="${escapeHtml(row.id)}"></span>
      </td>
    </tr>
  `).join("");
  updateBulkControls();
}

function selectedVisibleIds() {
  return [...body.querySelectorAll("[data-select-rateware]:checked")].map((input) => input.dataset.selectRateware);
}

function setActionStatus(message, tone = "neutral") {
  actionStatus.textContent = message;
  actionStatus.dataset.tone = tone;
}

function setRowStatus(id, message, tone = "neutral") {
  const status = body.querySelector(`[data-rateware-row-status="${CSS.escape(id)}"]`);
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function readRatewarePatch(tableRow) {
  const patch = {};
  tableRow.querySelectorAll("[data-rateware-field]").forEach((input) => {
    patch[input.dataset.ratewareField] = input.matches('input[type="checkbox"]') ? input.checked : input.value;
  });
  return patch;
}

function replaceStoredRatewareRow(updatedRow) {
  loadedRows = loadedRows.map((row) => row.id === updatedRow.id ? updatedRow : row);
  currentRows = currentRows.map((row) => row.id === updatedRow.id ? updatedRow : row);
}

function clearAutoSaveTimer(id) {
  window.clearTimeout(autoSaveTimers.get(id));
  autoSaveTimers.delete(id);
}

function markRatewareRowDirty(tableRow) {
  const rowId = tableRow?.dataset.ratewareId;
  if (!rowId) return;
  tableRow.classList.add("dirty-row");
  setRowStatus(rowId, "Autosaves in 1s", "warning");
  setActionStatus("");
  updateBulkControls();
}

function updateBulkControls() {
  const selectedCount = selectedVisibleIds().length;
  const totalRows = body.querySelectorAll("[data-rateware-id]").length;
  selectionCount.textContent = `${selectedCount} selected`;
  saveSelectedButton.disabled = selectedCount === 0;
  if (enrichSelectedZipsButton) enrichSelectedZipsButton.disabled = selectedCount === 0;
  if (renormalizeSelectedButton) renormalizeSelectedButton.disabled = selectedCount === 0;
  returnSelectedButton.disabled = selectedCount === 0;
  if (exportSelectedButton) exportSelectedButton.disabled = selectedCount === 0;
  if (exportVisibleButton) exportVisibleButton.disabled = currentRows.length === 0;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
}

async function saveRatewareTableRow(tableRow) {
  const rowId = tableRow?.dataset.ratewareId;
  if (!rowId) return null;
  clearAutoSaveTimer(rowId);
  const button = tableRow.querySelector(`[data-save-rateware-id="${CSS.escape(rowId)}"]`);
  if (button) button.disabled = true;
  setRowStatus(rowId, "Saving...");

  try {
    const updatedRow = await updateApprovedRatewareRow(rowId, readRatewarePatch(tableRow));
    replaceStoredRatewareRow(updatedRow);
    tableRow.classList.remove("dirty-row");
    setRowStatus(rowId, "Saved", "success");
    return updatedRow;
  } catch (error) {
    setRowStatus(rowId, error.message, "error");
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function scheduleRatewareAutoSave(tableRow, wait = 1000) {
  const rowId = tableRow?.dataset.ratewareId;
  if (!rowId) return;
  clearAutoSaveTimer(rowId);
  autoSaveTimers.set(rowId, window.setTimeout(async () => {
    try {
      await saveRatewareTableRow(tableRow);
    } catch {
      updateBulkControls();
    }
  }, wait));
}

async function saveSelectedRatewareRows() {
  const rows = selectedVisibleIds()
    .map((id) => body.querySelector(`[data-rateware-id="${CSS.escape(id)}"]`))
    .filter(Boolean);
  if (!rows.length) return;

  saveSelectedButton.disabled = true;
  setActionStatus(`Saving ${rows.length} approved rate(s)...`);

  try {
    await requirePrivatePage();
    await Promise.all(rows.map((row) => saveRatewareTableRow(row)));
    selectedRowIds.clear();
    setActionStatus(`${rows.length} approved rate(s) saved.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
    updateBulkControls();
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRowsCsv(rowsToExport, label) {
  if (!rowsToExport.length) {
    setActionStatus(`No ${label} rates to export.`, "error");
    return;
  }

  const headers = [
    "vendor",
    "vendor_domain",
    "quote_date",
    "rfx",
    "origin",
    "origin_market",
    "origin_zip",
    "origin_state",
    "destination",
    "destination_market",
    "destination_zip",
    "destination_state",
    "operation",
    "service",
    "equipment",
    "trailer",
    "hazmat",
    "temperature_controlled",
    "config",
    "mx_linehaul",
    "us_linehaul",
    "fsc",
    "border_fee",
    "all_in",
    "currency",
    "weekly_capacity",
    "mx_crossing",
    "us_crossing"
  ];
  const rows = rowsToExport.map((row) => [
    row.vendors?.vendor_name || row.vendor_domain || "",
    row.vendor_domain || row.vendors?.domain || "",
    dateValue(row.quote_date),
    row.rfx_id || "",
    row.normalized_origin || row.origin || "",
    row.origin_market || "",
    row.origin_zip_prefix || "",
    row.origin_state || "",
    row.normalized_destination || row.destination || "",
    row.destination_market || "",
    row.destination_zip_prefix || "",
    row.destination_state || "",
    row.operation || "",
    row.service || "",
    row.equipment || "",
    row.trailer || "",
    row.hazmat ? "yes" : "",
    row.temperature_controlled ? "yes" : "",
    row.config || "",
    row.mx_linehaul || "",
    row.us_linehaul || "",
    row.fsc || "",
    row.border_crossing_fee || "",
    row.all_in_rate || "",
    row.currency || "",
    row.weekly_capacity || "",
    row.mx_border_crossing_point || "",
    row.us_border_crossing_point || ""
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rateware-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setActionStatus(`${rowsToExport.length} ${label} rate(s) exported.`, "success");
}

function exportVisibleCsv() {
  exportRowsCsv(currentRows, "visible");
}

function exportSelectedCsv() {
  const ids = new Set(selectedVisibleIds());
  exportRowsCsv(currentRows.filter((row) => ids.has(row.id)), "selected");
}

async function clearRatewareFilters() {
  searchInput.value = "";
  operationFilter.value = "";
  serviceFilter.value = "";
  activeQuickFilter = "all";
  columnFilterInputs.forEach((input) => {
    input.value = "";
  });
  selectedRowIds.clear();
  setActionStatus("");
  await loadRateware();
}

async function loadRateware() {
  body.innerHTML = `<tr><td colspan="${RATEWARE_COLSPAN}">Loading approved rates...</td></tr>`;
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const [, rows] = await Promise.all([
      loadRatewareOptions(),
      fetchApprovedRateware({
        search: searchInput.value,
        operation: operationFilter.value,
        service: serviceFilter.value
      })
    ]);
    loadedRows = rows;
    renderRows(visibleRatewareRows());
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${RATEWARE_COLSPAN}">Could not load Rateware. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function returnSelectedToStaging() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;

  returnSelectedButton.disabled = true;
  setActionStatus(`Returning ${ids.length} rates...`);

  try {
    await requirePrivatePage();
    const result = await returnApprovedRatesToStaging(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.updated || ids.length} rates returned to staging.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
    updateBulkControls();
  }
}

async function renormalizeSelectedRateware() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;

  if (renormalizeSelectedButton) renormalizeSelectedButton.disabled = true;
  setActionStatus(`Re-normalizing ${ids.length} approved rate(s)...`);

  try {
    await requirePrivatePage();
    const result = await renormalizeApprovedRatewareRows(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.updated || ids.length} approved rate(s) re-normalized with the current catalog.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
    updateBulkControls();
  }
}

async function enrichSelectedRatewareZips() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;

  if (enrichSelectedZipsButton) enrichSelectedZipsButton.disabled = true;
  setActionStatus(`Finding missing ZIPs for ${ids.length} approved rate(s)...`);

  try {
    await requirePrivatePage();
    const result = await enrichApprovedRatewareLocationZips(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.enriched || 0} location(s) enriched. ${result.updated || ids.length} approved rate(s) checked.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
    updateBulkControls();
  }
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

async function loadRatewareOptions() {
  if (ratewareOptionsLoaded) return ratewareOptions;
  try {
    const options = await fetchRatewareOptions();
    ratewareOptions = {
      categories: options.categories || {},
      locations: options.locations || [],
      mx_crossings: options.mx_crossings || [],
      us_crossings: options.us_crossings || [],
      currencies: options.currencies || ["USD", "MXN", "CAD"]
    };
  } catch {
    ratewareOptions = {
      categories: ratewareOptions.categories || {},
      locations: ratewareOptions.locations || [],
      mx_crossings: ratewareOptions.mx_crossings || [],
      us_crossings: ratewareOptions.us_crossings || [],
      currencies: ratewareOptions.currencies || ["USD", "MXN", "CAD"]
    };
  }
  ratewareOptionsLoaded = true;
  renderRatewareDatalists();
  return ratewareOptions;
}

initAuthControls();
requirePrivatePage().catch(() => {});
loadRateware();

refreshButton.addEventListener("click", loadRateware);
clearFiltersButton?.addEventListener("click", clearRatewareFilters);
searchInput.addEventListener("input", debounce(loadRateware));
operationFilter.addEventListener("change", loadRateware);
serviceFilter.addEventListener("change", loadRateware);
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeQuickFilter = button.dataset.ratewareFilter || "all";
    selectedRowIds.clear();
    setActionStatus("");
    renderRows(visibleRatewareRows());
  });
});
columnFilterInputs.forEach((input) => {
  input.addEventListener("input", () => {
    selectedRowIds.clear();
    setActionStatus("");
    renderRows(visibleRatewareRows());
  });
});
clearColumnFiltersButton?.addEventListener("click", () => {
  columnFilterInputs.forEach((input) => {
    input.value = "";
  });
  selectedRowIds.clear();
  setActionStatus("");
  renderRows(visibleRatewareRows());
});
returnSelectedButton.addEventListener("click", returnSelectedToStaging);
saveSelectedButton?.addEventListener("click", saveSelectedRatewareRows);
enrichSelectedZipsButton?.addEventListener("click", enrichSelectedRatewareZips);
renormalizeSelectedButton?.addEventListener("click", renormalizeSelectedRateware);
exportSelectedButton?.addEventListener("click", exportSelectedCsv);
exportVisibleButton?.addEventListener("click", exportVisibleCsv);
selectAllCheckbox?.addEventListener("change", () => {
  body.querySelectorAll("[data-select-rateware]").forEach((checkbox) => {
    checkbox.checked = selectAllCheckbox.checked;
    if (checkbox.checked) selectedRowIds.add(checkbox.dataset.selectRateware);
    else selectedRowIds.delete(checkbox.dataset.selectRateware);
  });
  setActionStatus("");
  updateBulkControls();
});
body.addEventListener("input", (event) => {
  const field = event.target.closest("[data-rateware-field]");
  if (!field) return;
  const tableRow = field.closest("[data-rateware-id]");
  markRatewareRowDirty(tableRow);
  scheduleRatewareAutoSave(tableRow);
});
body.addEventListener("change", (event) => {
  const field = event.target.closest("[data-rateware-field]");
  if (field) {
    const tableRow = field.closest("[data-rateware-id]");
    markRatewareRowDirty(tableRow);
    scheduleRatewareAutoSave(tableRow);
    return;
  }

  const checkbox = event.target.closest("[data-select-rateware]");
  if (!checkbox) return;
  if (checkbox.checked) selectedRowIds.add(checkbox.dataset.selectRateware);
  else selectedRowIds.delete(checkbox.dataset.selectRateware);
  setActionStatus("");
  updateBulkControls();
});
body.addEventListener("focusout", (event) => {
  const field = event.target.closest("[data-rateware-field]");
  if (!field) return;
  scheduleRatewareAutoSave(field.closest("[data-rateware-id]"), 200);
});
installSpreadsheetGrid({
  container: body,
  rowSelector: "[data-rateware-id]",
  cellSelector: "[data-rateware-field]",
  saveRow: saveRatewareTableRow,
  onRowsChanged: (rows) => rows.forEach((row) => scheduleRatewareAutoSave(row, 1000))
});
body.addEventListener("click", async (event) => {
  const detailButton = event.target.closest("[data-rateware-detail]");
  const saveButton = event.target.closest("[data-save-rateware-id]");
  if (detailButton) {
    openRatewareDrawer(detailButton.dataset.ratewareDetail);
    return;
  }
  if (saveButton) {
    try {
      await requirePrivatePage();
      await saveRatewareTableRow(saveButton.closest("[data-rateware-id]"));
      setActionStatus("Approved rate saved.", "success");
    } catch (error) {
      setActionStatus(error.message, "error");
    }
  }
});
closeDrawerButton?.addEventListener("click", () => drawer.classList.add("hidden"));
