import { initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchApprovedRateware, returnApprovedRatesToStaging } from "./rateware-service.js";

const body = document.querySelector("#rateware-body");
const searchInput = document.querySelector("#rateware-search");
const operationFilter = document.querySelector("#rateware-operation-filter");
const serviceFilter = document.querySelector("#rateware-service-filter");
const refreshButton = document.querySelector("#refresh-rateware-button");
const selectAllCheckbox = document.querySelector("#select-all-rateware");
const selectionCount = document.querySelector("#rateware-selection-count");
const returnSelectedButton = document.querySelector("#return-selected-button");
const exportSelectedButton = document.querySelector("#export-selected-button");
const exportVisibleButton = document.querySelector("#export-visible-button");
const actionStatus = document.querySelector("#rateware-action-status");
const ratewareMetricTotal = document.querySelector("#rateware-metric-total");
const ratewareMetricVendors = document.querySelector("#rateware-metric-vendors");
const ratewareMetricMarkets = document.querySelector("#rateware-metric-markets");
const ratewareMetricAverage = document.querySelector("#rateware-metric-average");
const quickFilterButtons = document.querySelectorAll("[data-rateware-filter]");

let currentRows = [];
let loadedRows = [];
let activeQuickFilter = "all";
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

function renderRows(rows) {
  currentRows = rows;
  updateQuickFilters();
  updateRatewareMetrics(rows);
  populateFilter(operationFilter, rows, "operation");
  populateFilter(serviceFilter, rows, "service");

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="14"><div class="empty-state"><strong>No approved rates yet</strong><span>Approve staging rows to build the Rateware.</span><a href="./staging-review.html">Open staging review</a></div></td></tr>';
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
        <span>${escapeHtml(row.vendor_domain || row.vendors?.domain || "")}</span>
      </td>
      <td>${escapeHtml(dateValue(row.quote_date))}</td>
      <td>${escapeHtml(row.rfx_id || "-")}</td>
      <td class="rateware-location-cell">${compactLocation(row, "origin")}</td>
      <td class="rateware-location-cell">${compactLocation(row, "destination")}</td>
      <td>${escapeHtml(row.operation || "-")}</td>
      <td>${escapeHtml(row.service || "-")}</td>
      <td>${escapeHtml([row.equipment, row.trailer, row.config].filter(Boolean).join(" / ") || "-")}</td>
      <td>
        <strong>${escapeHtml(moneyValue(row.all_in_rate))}</strong>
        <span>${escapeHtml(rateModeLabel(row))}</span>
      </td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td>${escapeHtml(row.weekly_capacity || "-")}</td>
      <td>${escapeHtml(borderValue(row))}</td>
      <td>
        <a class="link-button" href="./staging-review.html">Staging row</a>
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

function updateBulkControls() {
  const selectedCount = selectedVisibleIds().length;
  const totalRows = body.querySelectorAll("[data-rateware-id]").length;
  selectionCount.textContent = `${selectedCount} selected`;
  returnSelectedButton.disabled = selectedCount === 0;
  if (exportSelectedButton) exportSelectedButton.disabled = selectedCount === 0;
  if (exportVisibleButton) exportVisibleButton.disabled = currentRows.length === 0;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
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

async function loadRateware() {
  body.innerHTML = '<tr><td colspan="14">Loading approved rates...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchApprovedRateware({
      search: searchInput.value,
      operation: operationFilter.value,
      service: serviceFilter.value
    });
    loadedRows = rows;
    renderRows(applyQuickFilter(rows));
  } catch (error) {
    body.innerHTML = `<tr><td colspan="14">Could not load Rateware. ${escapeHtml(error.message)}</td></tr>`;
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

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

initAuthControls();
requirePrivatePage().catch(() => {});
loadRateware();

refreshButton.addEventListener("click", loadRateware);
searchInput.addEventListener("input", debounce(loadRateware));
operationFilter.addEventListener("change", loadRateware);
serviceFilter.addEventListener("change", loadRateware);
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeQuickFilter = button.dataset.ratewareFilter || "all";
    selectedRowIds.clear();
    setActionStatus("");
    renderRows(applyQuickFilter());
  });
});
returnSelectedButton.addEventListener("click", returnSelectedToStaging);
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
body.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-rateware]");
  if (!checkbox) return;
  if (checkbox.checked) selectedRowIds.add(checkbox.dataset.selectRateware);
  else selectedRowIds.delete(checkbox.dataset.selectRateware);
  setActionStatus("");
  updateBulkControls();
});
