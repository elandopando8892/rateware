import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { createLocationMatchDrawer } from "./location-match-drawer.js";
import { initSpreadsheetColumnFilters } from "./spreadsheet-column-filters.js";
import { installSpreadsheetGrid } from "./spreadsheet-grid.js";
import { initColumnVisibility, initDrawer, initLocationAutocomplete } from "./sheet-ui.js";
import { archiveStagingRows, archiveStagingRowsByFilter, enrichStagingLocationZips, fetchStagingDetail, fetchStagingFilterValues, fetchStagingOptions, fetchStagingPage, matchStagingVendors, matchStagingVendorsByFilter, removeStagingRows, removeStagingRowsByFilter, renormalizeStagingRows, saveLocationAlias, updateStagingRow, updateStagingRowsByFilter } from "./staging-service.js";
import { loadingState, tableErrorState, tableLoadingState, tableState } from "./ui-state.js";

const body = document.querySelector("#staging-body");
const refreshButton = document.querySelector("#refresh-staging-button");
const clearFiltersButton = document.querySelector("#clear-staging-filters");
const statusFilter = document.querySelector("#staging-status-filter");
const stagingSearchInput = document.querySelector("#staging-search");
const drawer = document.querySelector("#staging-drawer");
const closeDrawerButton = document.querySelector("#close-staging-drawer");
const editForm = document.querySelector("#staging-edit-form");
const editStatus = document.querySelector("#staging-edit-status");
const approveDrawerButton = document.querySelector("#approve-staging-button");
const rejectDrawerButton = document.querySelector("#reject-staging-button");
const rowDetail = document.querySelector("#staging-row-detail");
const selectAllCheckbox = document.querySelector("#select-all-staging");
const bulkSelectionCount = document.querySelector("#bulk-selection-count");
const stagingPageCountLabel = document.querySelector("#staging-page-count");
const stagingFilteredCountLabel = document.querySelector("#staging-filtered-count");
const selectStagingPageButton = document.querySelector("#select-staging-page");
const clearStagingSelectionButton = document.querySelector("#clear-staging-selection");
const openSelectedDetailButton = document.querySelector("#open-selected-staging-detail");
const bulkSaveButton = document.querySelector("#bulk-save-button");
const bulkMatchVendorsButton = document.querySelector("#bulk-match-vendors-button");
const bulkApproveButton = document.querySelector("#bulk-approve-button");
const bulkRejectButton = document.querySelector("#bulk-reject-button");
const bulkApproveFilteredButton = document.querySelector("#bulk-approve-filtered-button");
const bulkRejectFilteredButton = document.querySelector("#bulk-reject-filtered-button");
const bulkEnrichZipsButton = document.querySelector("#bulk-enrich-zips-button");
const bulkRenormalizeButton = document.querySelector("#bulk-renormalize-button");
const bulkArchiveButton = document.querySelector("#bulk-archive-button");
const bulkRemoveButton = document.querySelector("#bulk-remove-button");
const bulkArchiveFilteredButton = document.querySelector("#bulk-archive-filtered-button");
const bulkRemoveFilteredButton = document.querySelector("#bulk-remove-filtered-button");
const bulkActionStatus = document.querySelector("#bulk-action-status");
const stagingBulkScopeNote = document.querySelector("#staging-bulk-scope-note");
const bulkActionBar = document.querySelector(".bulk-action-bar");
const openBulkDrawerButton = document.querySelector("#open-staging-bulk-drawer");
const bulkDrawer = document.querySelector("#staging-bulk-drawer");
const closeBulkDrawerButton = document.querySelector("#close-staging-bulk-drawer");
const bulkFieldSelect = document.querySelector("#staging-bulk-field");
const bulkValueInput = document.querySelector("#staging-bulk-value");
const bulkValueOptions = document.querySelector("#staging-bulk-value-options");
const applyBulkEditButton = document.querySelector("#apply-staging-bulk-edit");
const applyBulkEditFilteredButton = document.querySelector("#apply-staging-bulk-edit-filtered");
const bulkEditStatus = document.querySelector("#staging-bulk-status");
const columnMenu = document.querySelector("#staging-column-menu");
const stagingTable = document.querySelector(".staging-table");
const stagingMetricVisible = document.querySelector("#staging-metric-visible");
const stagingMetricLocation = document.querySelector("#staging-metric-location");
const stagingMetricRate = document.querySelector("#staging-metric-rate");
const stagingMetricValidation = document.querySelector("#staging-metric-validation");
const stagingMetricSelected = document.querySelector("#staging-metric-selected");
const reviewFilterButtons = document.querySelectorAll("[data-staging-filter]");
const uploadScopeBanner = document.querySelector("#staging-upload-scope");
const gridSelectionStatus = document.querySelector("#staging-grid-selection");
const stagingPageSummary = document.querySelector("#staging-page-summary");
const stagingFirstPageButton = document.querySelector("#staging-first-page");
const stagingPrevPageButton = document.querySelector("#staging-prev-page");
const stagingNextPageButton = document.querySelector("#staging-next-page");
const stagingLastPageButton = document.querySelector("#staging-last-page");
const stagingPageNumberInput = document.querySelector("#staging-page-number");
const stagingPageSizeSelect = document.querySelector("#staging-page-size");
const activeFiltersStrip = document.querySelector("#staging-active-filters");
const rawUploadScopeId = new URLSearchParams(window.location.search).get("raw_upload_id") || "";
let currentRows = [];
let loadedRows = [];
let activeRowId = null;
const selectedRowIds = new Set();
let activeReviewFilter = "all";
const autoSaveTimers = new Map();
const FILTERED_BULK_BATCH_SIZE = 1000;
const STAGING_PAGE_SIZE_STORAGE_KEY = "rateware:staging:page-size:v1";
const DEFAULT_STAGING_PAGE_SIZE = 200;
let columnVisibilityController;
let locationMatchDrawerController;
let columnFilterController;
let stagingTotalCount = 0;
let stagingHasMoreRows = false;
let stagingIsLoadingMore = false;
let stagingLoadOffset = 0;
let stagingPageIndex = 0;
let stagingPageSize = readStoredPageSize(STAGING_PAGE_SIZE_STORAGE_KEY, DEFAULT_STAGING_PAGE_SIZE);
let stagingLoadToken = 0;
let stagingSearchTimer = null;
let stagingOptions = {
  categories: {},
  vendors: [],
  locations: [],
  mx_crossings: [],
  us_crossings: [],
  currencies: ["USD", "MXN", "CAD"]
};
const STAGING_COLSPAN = 32;
const SHEET_COLUMNS = [
  { key: "select", label: "Select", locked: true },
  { key: "vendor", label: "Vendor" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "all_in_rate", label: "All-in" },
  { key: "quote_date", label: "Quote date" },
  { key: "rfx_id", label: "RFx" },
  { key: "row_id", label: "Shipment ID" },
  { key: "origin_zip_prefix", label: "O ZIP" },
  { key: "origin_state", label: "O ST" },
  { key: "origin_market", label: "O market" },
  { key: "origin_region", label: "O region" },
  { key: "destination_zip_prefix", label: "D ZIP" },
  { key: "destination_state", label: "D ST" },
  { key: "destination_market", label: "D market" },
  { key: "destination_region", label: "D region" },
  { key: "equipment", label: "Equipment" },
  { key: "trailer", label: "Trailer" },
  { key: "hazmat", label: "Hazmat" },
  { key: "temperature_controlled", label: "Temp ctrl" },
  { key: "config", label: "Config" },
  { key: "operation", label: "Operation" },
  { key: "service", label: "Service" },
  { key: "mx_border_crossing_point", label: "MX crossing" },
  { key: "us_border_crossing_point", label: "US crossing" },
  { key: "mx_linehaul", label: "MX linehaul" },
  { key: "us_linehaul", label: "US linehaul" },
  { key: "fsc", label: "FSC" },
  { key: "border_crossing_fee", label: "Border fee" },
  { key: "currency", label: "Currency" },
  { key: "weekly_capacity", label: "Capacity" },
  { key: "status", label: "Status" }
];
function sheetViewPreset(name, visibleKeys, { pageSize = DEFAULT_STAGING_PAGE_SIZE } = {}) {
  const visible = new Set(["select", ...visibleKeys]);
  const visibility = Object.fromEntries(SHEET_COLUMNS.map((column) => [column.key, column.locked || visible.has(column.key)]));
  const order = [...new Set(["select", ...visibleKeys, ...SHEET_COLUMNS.map((column) => column.key)])];
  return { name, layout: { visibility, order, widths: {}, extra: { pageSize } } };
}

const STAGING_VIEW_PRESETS = [
  sheetViewPreset("Default", SHEET_COLUMNS.filter((column) => column.key !== "select").map((column) => column.key)),
  sheetViewPreset("Operations", ["vendor", "quote_date", "rfx_id", "row_id", "origin", "origin_state", "origin_market", "destination", "destination_state", "destination_market", "equipment", "trailer", "operation", "service", "weekly_capacity", "status"], { pageSize: 200 }),
  sheetViewPreset("Pricing", ["vendor", "quote_date", "rfx_id", "row_id", "origin", "destination", "equipment", "trailer", "operation", "service", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee", "all_in_rate", "currency", "weekly_capacity", "status"], { pageSize: 200 }),
  sheetViewPreset("Lane Normalization", ["vendor", "origin", "origin_zip_prefix", "origin_state", "origin_market", "origin_region", "destination", "destination_zip_prefix", "destination_state", "destination_market", "destination_region", "mx_border_crossing_point", "us_border_crossing_point", "operation", "service", "status"], { pageSize: 100 }),
  sheetViewPreset("Finance", ["vendor", "quote_date", "rfx_id", "origin", "destination", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee", "all_in_rate", "currency", "status"], { pageSize: 200 })
];
const STAGING_BULK_EDIT_FIELDS = [
  { field: "operation", label: "Operation", source: "operation" },
  { field: "service", label: "Service", source: "service" },
  { field: "equipment", label: "Equipment", source: "equipment" },
  { field: "trailer", label: "Trailer", source: "trailer" },
  { field: "hazmat", label: "Hazmat", type: "boolean" },
  { field: "temperature_controlled", label: "Temp controlled", type: "boolean" },
  { field: "config", label: "Config", source: "config" },
  { field: "currency", label: "Currency", values: ["USD", "MXN", "CAD"] },
  { field: "weekly_capacity", label: "Weekly capacity" },
  { field: "mx_border_crossing_point", label: "MX crossing", source: "mx_crossings" },
  { field: "us_border_crossing_point", label: "US crossing", source: "us_crossings" },
  { field: "status", label: "Status", values: ["pending_review", "approved", "rejected", "archived"] },
  { field: "row_id", label: "Shipment ID" },
  { field: "quote_date", label: "Quote date", type: "date" }
];
const REVIEW_FILTER_LABELS = {
  all: "All",
  "needs-location": "Location gaps",
  "needs-rate": "Rate gaps",
  "needs-vendor": "Vendor gaps",
  conflicts: "Conflicts",
  "source-audit": "Source audit",
  ready: "Ready",
  "all-in": "All-in",
  "split-rate": "Split"
};

function applyStagingUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("status")) {
    const status = params.get("status") || "";
    if ([...statusFilter.options].some((option) => option.value === status)) {
      statusFilter.value = status;
    }
  } else if (rawUploadScopeId) {
    statusFilter.value = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countLabel(value) {
  return Number(value || 0).toLocaleString();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadVendorMatchErrors(prefix, rows = [], truncated = false) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const headers = [
    "rate_row_id",
    "shipment_id",
    "raw_upload_id",
    "source_file",
    "rfx_id",
    "quote_date",
    "origin",
    "destination",
    "current_vendor_domain",
    "detected_vendor_reference",
    "error_reason",
    "corrected_vendor_domain",
    "corrected_vendor_name",
    "corrected_legal_name"
  ];
  const payload = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
    ...(truncated ? [headers.map((header) => csvEscape(header === "error_reason" ? "Report truncated. Re-run with narrower filters to export the remaining errors." : "")).join(",")] : [])
  ].join("\n");
  const blob = new Blob([payload], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function filteredScopeTitle(actionLabel, count) {
  return `${actionLabel} every staging row in the database that matches the active filters (${countLabel(count)} row(s)). This is not limited to the current page.`;
}

function setFilteredButtonLabel(button, baseLabel, count) {
  if (!button) return;
  button.textContent = count ? `${baseLabel} (${countLabel(count)})` : baseLabel;
  button.title = filteredScopeTitle(baseLabel, count);
}

function confirmFilteredDatabaseAction({ actionLabel, matched, scope, keyword = "APPLY", destructive = false }) {
  const noun = matched === 1 ? "row" : "rows";
  const warning = destructive ? "This action cannot be undone." : "Review the active filters before continuing.";
  const typed = window.prompt(
    `Filtered database action\n\n${actionLabel} ${countLabel(matched)} staging ${noun} across all pages matching: ${scope}.\n\nThis is not limited to the visible page. ${warning}\n\nType ${keyword} to continue.`
  );
  return typed === keyword;
}

function readStoredPageSize(key, fallback) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return [50, 100, 200, 500].includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredPageSize(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Local storage can be blocked; pagination still works for the session.
  }
}

function clampPageIndex(index, total = stagingTotalCount) {
  const maxIndex = Math.max(0, Math.ceil(Number(total || 0) / stagingPageSize) - 1);
  return Math.max(0, Math.min(Number(index) || 0, maxIndex));
}

function stagingPageOffset() {
  return stagingPageIndex * stagingPageSize;
}

function sheetColumnLabel(field) {
  return SHEET_COLUMNS.find((column) => column.key === field)?.label || field;
}

function filterChipValue(field, values = []) {
  if (values.includes("__none__")) return "None";
  if (values.length === 1) {
    const value = String(values[0] || "");
    return /state|zip|currency/i.test(field) ? value.toUpperCase() : value;
  }
  return `${values.length} selected`;
}

function stagingStatusLabel(value) {
  const option = [...statusFilter.options].find((item) => item.value === value);
  return option?.textContent?.trim() || value || "All";
}

function activeFilterChipHtml({ key, label, value, field = "" }) {
  return `
    <button class="active-filter-chip" type="button" data-remove-staging-filter="${escapeHtml(key)}" data-filter-field="${escapeHtml(field)}" title="Remove ${escapeHtml(label)} filter">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <b aria-hidden="true">x</b>
    </button>
  `;
}

function renderStagingActiveFilters() {
  if (!activeFiltersStrip) return;
  const chips = [];
  const search = String(stagingSearchInput?.value || "").trim();
  const status = statusFilter.value || "";
  if (rawUploadScopeId) chips.push(activeFilterChipHtml({ key: "source", label: "Source", value: "Scoped upload" }));
  if (search) chips.push(activeFilterChipHtml({ key: "search", label: "Search", value: search }));
  if (status && status !== "pending_review") chips.push(activeFilterChipHtml({ key: "status", label: "Status", value: stagingStatusLabel(status) }));
  if (activeReviewFilter !== "all") chips.push(activeFilterChipHtml({ key: "review", label: "Review", value: REVIEW_FILTER_LABELS[activeReviewFilter] || activeReviewFilter }));
  Object.entries(activeColumnFilters()).forEach(([field, values]) => {
    chips.push(activeFilterChipHtml({
      key: "column",
      field,
      label: sheetColumnLabel(field),
      value: filterChipValue(field, Array.isArray(values) ? values : [values])
    }));
  });

  activeFiltersStrip.classList.toggle("hidden", !chips.length);
  activeFiltersStrip.innerHTML = chips.length
    ? `<span class="active-filter-label">Active filters</span>${chips.join("")}<button class="active-filter-clear" type="button" data-remove-staging-filter="all">Clear all</button>`
    : "";
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
  const inputType = options.type || (options.money ? "number" : "text");
  const step = options.step || (options.money ? "0.01" : "");
  return `<input class="staging-input ${widthClass}" data-field="${field}" type="${inputType}" value="${escapeHtml(value)}" ${options.list ? `list="${escapeHtml(options.list)}"` : ""} ${options.min ? `min="${escapeHtml(options.min)}"` : ""} ${options.max ? `max="${escapeHtml(options.max)}"` : ""} ${step ? `step="${escapeHtml(step)}"` : ""} ${options.money ? 'inputmode="decimal"' : ""} autocomplete="off" spellcheck="false" />`;
}

function optionList(values = [], currentValue = "") {
  const normalized = String(currentValue || "").trim();
  const options = normalized && !values.includes(normalized) ? [normalized, ...values] : values;
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === normalized ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function selectCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  return `
    <select class="staging-input ${widthClass}" data-field="${field}" autocomplete="off">
      <option value=""></option>
      ${optionList(values, row[field] || "")}
    </select>
  `;
}

function datalistCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  const listId = `staging-${field}-options`;
  const locationAttr = ["origin", "destination"].includes(field) ? `data-location-field="${field}"` : "";
  return `<input class="staging-input ${widthClass}" data-field="${field}" ${locationAttr} list="${listId}" value="${escapeHtml(row[field] || "")}" autocomplete="off" spellcheck="false" />`;
}

function checkboxCell(row, field, label) {
  return `
    <label class="table-checkbox" title="${escapeHtml(label)}">
      <input class="staging-input" data-field="${field}" type="checkbox" value="true" ${row[field] ? "checked" : ""} />
    </label>
  `;
}

function locationOptionValue(option) {
  return typeof option === "string" ? option : option.value || option.label || "";
}

function locationOptionLabel(option) {
  return typeof option === "string" ? "" : option.label || "";
}

function genericOptionValue(option) {
  return typeof option === "string" ? option : option.value || "";
}

function genericOptionLabel(option) {
  return typeof option === "string" ? "" : option.label || "";
}

function uniqueLocationValues(field) {
  return Array.from(new Set(stagingOptions.locations.map((option) => option?.[field]).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function datalistOptions(values = []) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function hiddenLocationFields(row, prefix) {
  return `
    <input data-field="normalized_${prefix}" type="hidden" value="${escapeHtml(row[`normalized_${prefix}`] || "")}" />
    <input data-field="${prefix}_city" type="hidden" value="${escapeHtml(row[`${prefix}_city`] || "")}" />
    <input data-field="${prefix}_country" type="hidden" value="${escapeHtml(row[`${prefix}_country`] || "")}" />
    <input data-field="${prefix}_match_reason" type="hidden" value="${escapeHtml(row[`${prefix}_match_reason`] || "")}" />
    <input data-field="${prefix}_match_source" type="hidden" value="${escapeHtml(row[`${prefix}_match_source`] || "")}" />
    <input data-field="${prefix}_match_confidence" type="hidden" value="${escapeHtml(row[`${prefix}_match_confidence`] || "")}" />
    <input data-field="${prefix}_match_manual" type="hidden" value="${row[`${prefix}_match_manual`] ? "true" : "false"}" />
  `;
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

function renderDatalists() {
  const existing = document.querySelector("#staging-datalists");
  existing?.remove();
  const container = document.createElement("div");
  container.id = "staging-datalists";
  container.hidden = true;
  container.innerHTML = `
    <datalist id="staging-vendor-options">${stagingOptions.vendors.map((option) => `<option value="${escapeHtml(genericOptionValue(option))}" label="${escapeHtml(genericOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="staging-origin-options">${stagingOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="staging-destination-options">${stagingOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="staging-zip-options">${datalistOptions(uniqueLocationValues("zip_prefix"))}</datalist>
    <datalist id="staging-state-options">${datalistOptions(uniqueLocationValues("state_code"))}</datalist>
    <datalist id="staging-market-options">${datalistOptions(uniqueLocationValues("market"))}</datalist>
    <datalist id="staging-region-options">${datalistOptions(uniqueLocationValues("region"))}</datalist>
  `;
  document.body.appendChild(container);
}

function lookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationOptionMatch(value) {
  const lookup = lookupKey(value);
  if (!lookup) return null;
  const scored = stagingOptions.locations
    .map((option) => {
      const values = [
        locationOptionValue(option),
        locationOptionLabel(option),
        option.city,
        option.metro_city,
        option.raw_value,
        option.market,
        option.region,
        [option.city, option.state_code].filter(Boolean).join(", "),
        [option.metro_city, option.state_code].filter(Boolean).join(", "),
        option.zip_prefix
      ].filter(Boolean);
      const exact = values.some((candidate) => lookupKey(candidate) === lookup);
      const partial = values.some((candidate) => lookupKey(candidate).includes(lookup) || lookup.includes(lookupKey(candidate)));
      return { option, score: exact ? 100 : partial ? 70 : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.option || null;
}

function locationManualReason(option) {
  if (!option || typeof option === "string") return "manual catalog selection";
  return [
    "manual catalog selection",
    option.country ? `country=${option.country}` : "",
    option.zip_prefix ? `zip=${option.zip_prefix}` : "",
    option.market ? `market=${option.market}` : "",
    option.region ? `region=${option.region}` : ""
  ].filter(Boolean).join("; ");
}

function setTableField(tableRow, field, value) {
  const input = tableRow?.querySelector(`[data-field="${CSS.escape(field)}"]`);
  if (!input) return;
  input.value = value || "";
}

function applyLocationSuggestion(tableRow, prefix, value) {
  const option = locationOptionMatch(value);
  if (!option) return false;
  setTableField(tableRow, `normalized_${prefix}`, option.metro_city || option.city || locationOptionValue(option));
  setTableField(tableRow, `${prefix}_zip_prefix`, option.zip_prefix);
  setTableField(tableRow, `${prefix}_state`, option.state_code || option.state_name);
  setTableField(tableRow, `${prefix}_market`, option.market);
  setTableField(tableRow, `${prefix}_region`, option.region);
  setTableField(tableRow, `${prefix}_city`, option.city || option.metro_city);
  setTableField(tableRow, `${prefix}_country`, option.country);
  setTableField(tableRow, `${prefix}_match_reason`, locationManualReason(option));
  setTableField(tableRow, `${prefix}_match_source`, "manual_dropdown");
  setTableField(tableRow, `${prefix}_match_confidence`, 100);
  setTableField(tableRow, `${prefix}_match_manual`, "true");
  return true;
}

function applySuggestionFromField(tableRow, field, value) {
  if (field === "origin" || field === "destination") return applyLocationSuggestion(tableRow, field, value);
  if (field === "origin_zip_prefix") return applyLocationSuggestion(tableRow, "origin", value);
  if (field === "destination_zip_prefix") return applyLocationSuggestion(tableRow, "destination", value);
  return false;
}

function selectedRows() {
  return [...body.querySelectorAll("[data-row-id]")].filter((row) => {
    const checkbox = row.querySelector("[data-select-row]");
    return checkbox?.checked;
  });
}

function visibleStagingCheckboxes() {
  return [...body.querySelectorAll("[data-select-row]")];
}

function setVisibleStagingSelection(checked) {
  if (!checked) selectedRowIds.clear();
  visibleStagingCheckboxes().forEach((checkbox) => {
    checkbox.checked = checked;
    if (checked) {
      selectedRowIds.add(checkbox.dataset.selectRow);
    }
  });
  setBulkStatus(checked ? "Current page selected." : "Selection cleared.");
  updateBulkControls();
}

function selectOnlyStagingRow(tableRow) {
  if (!tableRow?.dataset.rowId) return;
  selectedRowIds.clear();
  selectedRowIds.add(tableRow.dataset.rowId);
  body.querySelectorAll("[data-select-row]").forEach((checkbox) => {
    checkbox.checked = checkbox.dataset.selectRow === tableRow.dataset.rowId;
  });
  updateBulkControls();
}

function setBulkStatus(message, tone = "neutral") {
  bulkActionStatus.textContent = message;
  bulkActionStatus.dataset.tone = tone;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2
  }).format(value);
}

function setGridSelectionStatus(info) {
  if (!gridSelectionStatus) return;
  if (!info?.cells) {
    gridSelectionStatus.textContent = "Ready";
    return;
  }
  const label = info.isRange
    ? `${info.rows} x ${info.columns} range selected`
    : "1 cell selected";
  const numeric = info.numeric?.count
    ? ` | count ${info.numeric.count} | sum ${compactNumber(info.numeric.sum)} | avg ${compactNumber(info.numeric.average)}`
    : "";
  gridSelectionStatus.textContent = `${label}${numeric}`;
}

function setBulkEditStatus(message, tone = "neutral") {
  if (!bulkEditStatus) return;
  bulkEditStatus.textContent = message;
  bulkEditStatus.dataset.tone = tone;
}

function fieldOptionValues(config) {
  if (config.type === "boolean") return ["yes", "no"];
  if (Array.isArray(config.values)) return config.values;
  if (config.source === "mx_crossings") return stagingOptions.mx_crossings || [];
  if (config.source === "us_crossings") return stagingOptions.us_crossings || [];
  if (config.source) return stagingOptions.categories?.[config.source] || [];
  const values = currentRows.map((row) => row[config.field]).filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
}

function updateBulkValueOptions() {
  const config = STAGING_BULK_EDIT_FIELDS.find((item) => item.field === bulkFieldSelect?.value) || STAGING_BULK_EDIT_FIELDS[0];
  if (!bulkValueInput || !bulkValueOptions || !config) return;
  const values = fieldOptionValues(config);
  bulkValueOptions.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  bulkValueInput.type = config.type === "date" ? "date" : "text";
  bulkValueInput.placeholder = config.type === "boolean" ? "yes / no" : "Set selected rows...";
}

function populateBulkEditControls() {
  if (!bulkFieldSelect) return;
  const selected = bulkFieldSelect.value || STAGING_BULK_EDIT_FIELDS[0]?.field;
  bulkFieldSelect.innerHTML = STAGING_BULK_EDIT_FIELDS.map((item) => `<option value="${escapeHtml(item.field)}">${escapeHtml(item.label)}</option>`).join("");
  bulkFieldSelect.value = STAGING_BULK_EDIT_FIELDS.some((item) => item.field === selected) ? selected : STAGING_BULK_EDIT_FIELDS[0]?.field;
  updateBulkValueOptions();
}

function bulkPatchValue(field, rawValue) {
  const config = STAGING_BULK_EDIT_FIELDS.find((item) => item.field === field);
  const value = String(rawValue ?? "").trim();
  if (config?.type === "boolean") return ["1", "true", "yes", "y", "x", "si", "sí"].includes(value.toLowerCase());
  return value;
}

function updateBulkControls() {
  const selectedCount = selectedRows().length;
  const totalRows = body.querySelectorAll("[data-row-id]").length;
  const filteredTotal = Number(stagingTotalCount || 0);
  const hasFilteredRows = filteredTotal > 0;
  if (bulkSelectionCount) bulkSelectionCount.textContent = `Selected: ${selectedCount.toLocaleString()}`;
  if (stagingPageCountLabel) stagingPageCountLabel.textContent = `Page: ${totalRows.toLocaleString()}`;
  if (stagingFilteredCountLabel) stagingFilteredCountLabel.textContent = `Filtered DB: ${filteredTotal.toLocaleString()}`;
  if (stagingBulkScopeNote) {
    stagingBulkScopeNote.textContent = hasFilteredRows
      ? `Filtered DB actions affect ${filteredTotal.toLocaleString()} row(s) matching current filters.`
      : "Filtered DB actions run across all matching database rows.";
  }
  bulkActionBar?.classList.toggle("is-empty", totalRows === 0);
  bulkActionBar?.classList.toggle("has-visible-page", totalRows > 0);
  if (selectStagingPageButton) selectStagingPageButton.disabled = totalRows === 0 || selectedCount === totalRows;
  if (clearStagingSelectionButton) clearStagingSelectionButton.disabled = selectedCount === 0;
  if (openSelectedDetailButton) openSelectedDetailButton.disabled = selectedCount !== 1;
  if (openBulkDrawerButton) openBulkDrawerButton.disabled = false;
  if (applyBulkEditButton) applyBulkEditButton.disabled = selectedCount === 0;
  if (applyBulkEditFilteredButton) applyBulkEditFilteredButton.disabled = !bulkFieldSelect?.value || !hasFilteredRows;
  if (stagingMetricSelected) stagingMetricSelected.textContent = String(selectedCount);
  bulkSaveButton.disabled = selectedCount === 0;
  if (bulkMatchVendorsButton) {
    bulkMatchVendorsButton.disabled = selectedCount === 0 && !hasFilteredRows;
    setFilteredButtonLabel(
      bulkMatchVendorsButton,
      selectedCount ? "Match selected vendors" : "Match filtered DB vendors",
      selectedCount ? selectedCount : filteredTotal
    );
  }
  bulkApproveButton.disabled = selectedCount === 0;
  bulkRejectButton.disabled = selectedCount === 0;
  if (bulkApproveFilteredButton) bulkApproveFilteredButton.disabled = !hasFilteredRows;
  if (bulkRejectFilteredButton) bulkRejectFilteredButton.disabled = !hasFilteredRows;
  setFilteredButtonLabel(bulkApproveFilteredButton, "Approve filtered DB", filteredTotal);
  setFilteredButtonLabel(bulkRejectFilteredButton, "Reject filtered DB", filteredTotal);
  if (bulkEnrichZipsButton) bulkEnrichZipsButton.disabled = selectedCount === 0;
  if (bulkRenormalizeButton) bulkRenormalizeButton.disabled = selectedCount === 0;
  bulkArchiveButton.disabled = selectedCount === 0;
  bulkRemoveButton.disabled = selectedCount === 0;
  if (bulkArchiveFilteredButton) bulkArchiveFilteredButton.disabled = !hasFilteredRows;
  if (bulkRemoveFilteredButton) bulkRemoveFilteredButton.disabled = !hasFilteredRows;
  setFilteredButtonLabel(bulkArchiveFilteredButton, "Archive filtered DB", filteredTotal);
  setFilteredButtonLabel(bulkRemoveFilteredButton, "Remove filtered DB", filteredTotal);
  setFilteredButtonLabel(applyBulkEditFilteredButton, "Apply to filtered DB", filteredTotal);
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
  updateReviewMetrics();
  updateStagingPaginationControls();
}

function updateStagingPaginationControls() {
  renderStagingActiveFilters();
  const total = Number(stagingTotalCount || 0);
  const pageCount = Math.max(1, Math.ceil(total / stagingPageSize));
  const safeIndex = clampPageIndex(stagingPageIndex, total);
  if (safeIndex !== stagingPageIndex) stagingPageIndex = safeIndex;
  const loadedCount = currentRows.length;
  const start = total && loadedCount ? stagingPageOffset() + 1 : 0;
  const end = total && loadedCount ? Math.min(stagingPageOffset() + loadedCount, total) : 0;
  if (stagingPageSummary) {
    stagingPageSummary.textContent = total
      ? `Rows ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()} | Page ${(stagingPageIndex + 1).toLocaleString()} of ${pageCount.toLocaleString()}`
      : "No rows in current filters";
  }
  if (stagingPageNumberInput) {
    stagingPageNumberInput.value = String(stagingPageIndex + 1);
    stagingPageNumberInput.max = String(pageCount);
    stagingPageNumberInput.disabled = !total || stagingIsLoadingMore;
  }
  if (stagingPageSizeSelect) {
    stagingPageSizeSelect.value = String(stagingPageSize);
    stagingPageSizeSelect.disabled = stagingIsLoadingMore;
  }
  const atFirst = stagingPageIndex <= 0;
  const atLast = stagingPageIndex >= pageCount - 1;
  [stagingFirstPageButton, stagingPrevPageButton].forEach((button) => {
    if (button) button.disabled = !total || atFirst || stagingIsLoadingMore;
  });
  [stagingNextPageButton, stagingLastPageButton].forEach((button) => {
    if (button) button.disabled = !total || atLast || stagingIsLoadingMore;
  });
}

async function goToStagingPage(index) {
  const nextIndex = clampPageIndex(index);
  if (nextIndex === stagingPageIndex && currentRows.length) {
    updateStagingPaginationControls();
    return;
  }
  stagingPageIndex = nextIndex;
  selectedRowIds.clear();
  setBulkStatus("");
  await loadRows({ preservePage: true });
}

async function setStagingPageSize(value) {
  const nextSize = Number(value);
  if (![50, 100, 200, 500].includes(nextSize)) return;
  stagingPageSize = nextSize;
  writeStoredPageSize(STAGING_PAGE_SIZE_STORAGE_KEY, stagingPageSize);
  stagingPageIndex = 0;
  selectedRowIds.clear();
  setBulkStatus("");
  await loadRows({ preservePage: true });
}

function detailLine(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`;
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

function needsLocationMatch(row) {
  const originMatched = Boolean(row.origin_market || row.origin_zip_prefix || row.origin_state || row.origin_country);
  const destinationMatched = Boolean(row.destination_market || row.destination_zip_prefix || row.destination_state || row.destination_country);
  return !originMatched || !destinationMatched;
}

function locationValidationClass(row, prefix) {
  const matched = Boolean(row[`${prefix}_market`] || row[`${prefix}_zip_prefix`] || row[`${prefix}_state`] || row[`${prefix}_country`]);
  return matched ? "cell-valid" : "cell-invalid";
}

function locationMatchSummary(row, prefix) {
  const zipState = [row[`${prefix}_zip_prefix`], row[`${prefix}_state`]].filter(Boolean).join(" / ");
  const hasMarket = Boolean(row[`${prefix}_market`]);
  const hasGeo = Boolean(zipState || row[`${prefix}_country`] || row[`${prefix}_region`]);
  const manual = row[`${prefix}_match_manual`] === true || row[`${prefix}_match_manual`] === "true";
  const label = manual ? "manual" : hasMarket && hasGeo ? "matched" : hasGeo ? "partial" : "missing";
  const tone = label === "missing" ? "weak" : label === "partial" ? "medium" : "strong";
  const title = [
    row[`${prefix}_match_reason`],
    zipState ? `ZIP/ST ${zipState}` : "",
    row[`${prefix}_market`] ? `Market ${row[`${prefix}_market`]}` : "",
    row[`${prefix}_region`] ? `Region ${row[`${prefix}_region`]}` : "",
    row[`${prefix}_country`] ? `Country ${row[`${prefix}_country`]}` : ""
  ].filter(Boolean).join(" | ") || "Needs catalog match";
  return { label, tone, title };
}

function renderLocationCell(row, prefix) {
  return `
    ${datalistCell(row, prefix, stagingOptions.locations, { wide: true })}
    ${hiddenLocationFields(row, prefix)}
  `;
}

function rateValidationClass(row) {
  if (needsNumericRate(row) || hasAllInText(row)) return "cell-invalid";
  if (hasSplitAllInConflict(row) || hasSourceServiceConflict(row) || hasCurrencyGap(row)) return "cell-warning";
  return "cell-valid";
}

function inlineValidationIssues(row) {
  const issues = [];
  if (needsNumericRate(row)) issues.push({ tone: "danger", label: "rate", detail: "Needs numeric all-in, MX linehaul, or US linehaul" });
  if (hasAllInText(row)) issues.push({ tone: "danger", label: "text", detail: "All-in should be numeric only; use Currency for USD/MXN/CAD" });
  if (hasSplitAllInConflict(row)) issues.push({ tone: "warning", label: "split", detail: "All-in does not match the visible split components" });
  if (hasSourceServiceConflict(row)) issues.push({ tone: "warning", label: "mode", detail: "Source service and staged One Way/Roundtrip mode differ" });
  if (hasCurrencyGap(row)) issues.push({ tone: "warning", label: "currency", detail: "Currency missing" });
  if (!row.operation || !row.service) issues.push({ tone: "warning", label: "service", detail: "Operation or service missing" });
  return issues;
}

function renderInlineValidation(row) {
  const issues = inlineValidationIssues(row);
  if (!issues.length) return "";
  return `<span class="cell-validation-stack">${issues.slice(0, 3).map((issue) => `<span class="cell-validation-pill ${escapeHtml(issue.tone)}" title="${escapeHtml(issue.detail)}">${escapeHtml(issue.label)}</span>`).join("")}</span>`;
}

function rateValidationTitle(row) {
  const issues = inlineValidationIssues(row).map((issue) => issue.detail);
  return issues.length ? issues.join(" | ") : "Numeric rate present";
}

function needsNumericRate(row) {
  return !hasNumericValue(row.all_in_rate) && !hasNumericValue(row.mx_linehaul) && !hasNumericValue(row.us_linehaul);
}

function hasSplitRate(row) {
  return ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].some((field) => hasNumericValue(row[field]));
}

function hasVendorMatch(row) {
  return Boolean(row.vendors?.vendor_name || row.vendors?.domain || row.vendor_id);
}

function hasAllInText(row) {
  return /[a-z]/i.test(String(row.all_in_rate || ""));
}

function splitRateTotal(row) {
  const values = ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"]
    .map((field) => numericValue(row[field]))
    .filter((value) => value !== null && value > 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function hasSplitAllInConflict(row) {
  const allIn = numericValue(row.all_in_rate);
  const splitTotal = splitRateTotal(row);
  if (allIn === null || splitTotal === null || allIn <= 0 || splitTotal <= 0) return false;
  return Math.abs(allIn - splitTotal) > Math.max(25, allIn * 0.05);
}

function serviceModeKey(value) {
  const text = lookupKey(value);
  if (/\b(rt|round trip|roundtrip|round)\b/.test(text)) return "roundtrip";
  if (/\b(ow|one way|oneway)\b/.test(text)) return "oneway";
  return "";
}

function hasSourceServiceConflict(row) {
  const evidence = sourceEvidence(row);
  const sourceMode = serviceModeKey([evidence.service, evidence.lane, evidence.source_service].filter(Boolean).join(" "));
  const stagedMode = serviceModeKey(row.service);
  return Boolean(sourceMode && stagedMode && sourceMode !== stagedMode);
}

function hasCurrencyGap(row) {
  return (hasNumericValue(row.all_in_rate) || hasSplitRate(row)) && !row.currency;
}

function isCrossBorder(row) {
  const text = [row.operation, row.service, row.origin_country, row.destination_country, row.mx_border_crossing_point, row.us_border_crossing_point]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("cross") || text.includes("export") || text.includes("import") || Boolean(row.mx_border_crossing_point || row.us_border_crossing_point);
}

function hasCrossingGap(row) {
  return isCrossBorder(row) && (!row.mx_border_crossing_point || !row.us_border_crossing_point);
}

function hasReviewConflict(row) {
  return hasAllInText(row) || hasSplitAllInConflict(row) || hasSourceServiceConflict(row) || hasCurrencyGap(row) || hasCrossingGap(row) || !row.operation || !row.service;
}

function hasSourceAuditIssue(row) {
  const confidence = objectValue(row.field_confidence);
  return rowAuditFlags(row).length > 0
    || rowExtractionWarnings(row).length > 0
    || Object.values(confidence).some((value) => Number(value) < 0.75);
}

function isReadyForApproval(row) {
  return !approvalBlockers(row).length && hasVendorMatch(row) && row.quote_date && row.operation && row.service && !hasReviewConflict(row);
}

function rowReviewIssues(row) {
  const issues = [];
  if (!hasVendorMatch(row)) issues.push({ tone: "warning", label: "No vendor match" });
  if (needsLocationMatch(row)) issues.push({ tone: "danger", label: "Needs location" });
  if (needsNumericRate(row)) issues.push({ tone: "danger", label: "Needs rate" });
  if (hasAllInText(row)) issues.push({ tone: "danger", label: "Rate text" });
  if (hasSplitAllInConflict(row)) issues.push({ tone: "warning", label: "Split mismatch" });
  if (hasSourceServiceConflict(row)) issues.push({ tone: "warning", label: "Service conflict" });
  if (!row.quote_date) issues.push({ tone: "warning", label: "Needs date" });
  if (!row.weekly_capacity) issues.push({ tone: "muted", label: "No capacity" });
  return issues;
}

function rowAuditFlags(row) {
  return Array.isArray(row.audit_flags) ? row.audit_flags.map(String).filter(Boolean) : [];
}

function rowExtractionWarnings(row) {
  return Array.isArray(row.extraction_warnings) ? row.extraction_warnings.map(String).filter(Boolean) : [];
}

function rowRateMode(row) {
  if (hasNumericValue(row.all_in_rate) && !hasSplitRate(row)) return { tone: "success", label: "All-in" };
  if (hasSplitRate(row)) return { tone: "neutral", label: "Split" };
  return { tone: "danger", label: "No rate" };
}

function renderReviewChips(row) {
  const auditFlags = rowAuditFlags(row);
  const chips = [rowRateMode(row), ...rowReviewIssues(row)];
  if (auditFlags.some((flag) => ["missing_rate", "missing_origin", "missing_destination", "missing_equipment", "missing_trailer", "missing_operation", "missing_service"].includes(flag))) {
    chips.push({ tone: "danger", label: "Audit flag" });
  } else if (auditFlags.length) {
    chips.push({ tone: "warning", label: "Audit note" });
  }
  if (rowExtractionWarnings(row).length) chips.push({ tone: "warning", label: "Source warning" });
  return `<div class="row-review-chips">${chips
    .map((chip) => `<span class="review-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`)
    .join("")}</div>`;
}

function rowQualityClass(row) {
  if (rowAuditFlags(row).some((flag) => ["missing_rate", "missing_origin", "missing_destination"].includes(flag))) return "needs-review";
  if (needsNumericRate(row) || needsLocationMatch(row) || hasAllInText(row)) return "needs-review";
  if (hasReviewConflict(row)) return "has-warning";
  if (rowAuditFlags(row).length || rowExtractionWarnings(row).length) return "has-warning";
  if (!hasVendorMatch(row) || !row.quote_date || !row.weekly_capacity) return "has-warning";
  return "";
}

function sourceEvidence(row) {
  return objectValue(row.source_evidence);
}

function qualitySummary(row) {
  const flags = rowAuditFlags(row);
  const warnings = rowExtractionWarnings(row);
  const blockers = approvalBlockers(row);
  if (blockers.length || flags.some((flag) => ["missing_rate", "missing_origin", "missing_destination"].includes(flag))) {
    return { tone: "danger", label: "Needs fix", detail: `${blockers.length || flags.length} issue(s)` };
  }
  if (hasReviewConflict(row)) {
    return { tone: "warning", label: "Conflict", detail: "Check rate/service" };
  }
  if (flags.length || warnings.length || !hasVendorMatch(row) || !row.quote_date) {
    return { tone: "warning", label: "Review", detail: `${flags.length + warnings.length} audit note(s)` };
  }
  return { tone: "success", label: "Ready", detail: "Clean row" };
}

function renderQualityStrip(row) {
  const quality = qualitySummary(row);
  const evidence = sourceEvidence(row);
  const sourceLabel = evidence.source_filename || evidence.email_from || row.raw_upload_id || "No source";
  return `
    <div class="quality-strip ${escapeHtml(quality.tone)}">
      <span>${escapeHtml(quality.label)}</span>
      <small>${escapeHtml(quality.detail)}</small>
      <em title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</em>
    </div>
  `;
}

function validationRow(baseRow = {}, patch = {}) {
  return { ...baseRow, ...patch };
}

function approvalBlockers(row) {
  const blockers = [];
  if (needsNumericRate(row)) blockers.push("numeric rate");
  if (hasAllInText(row)) blockers.push("numeric-only all-in");
  if (needsLocationMatch(row)) blockers.push("location match");
  if (hasCurrencyGap(row)) blockers.push("currency");
  if (!row.operation || !row.service) blockers.push("operation and service");
  if (hasCrossingGap(row)) blockers.push("MX and US border cities");
  return blockers;
}

function approvalBlockerMessage(blockers) {
  if (!blockers.length) return "";
  return `Fix ${blockers.join(" and ")} before approving.`;
}

function rowFromTablePatch(tableRow, patch = {}) {
  const id = tableRow?.dataset.rowId;
  const baseRow = rowById(id) || {};
  return validationRow(baseRow, patch);
}

function addCellIssue(issueMap, field, tone, message) {
  if (!field || !message) return;
  const issues = issueMap.get(field) || [];
  issues.push({ tone, message });
  issueMap.set(field, issues);
}

function locationMatched(row, prefix) {
  return Boolean(row[`${prefix}_market`] || row[`${prefix}_zip_prefix`] || row[`${prefix}_state`] || row[`${prefix}_country`]);
}

function rowCellValidationIssues(row) {
  const issues = new Map();
  if (!locationMatched(row, "origin")) {
    ["origin", "origin_zip_prefix", "origin_state", "origin_market", "origin_region"].forEach((field) => {
      addCellIssue(issues, field, "danger", "Origin needs catalog match: ZIP/ST, market, region, or country.");
    });
  }
  if (!locationMatched(row, "destination")) {
    ["destination", "destination_zip_prefix", "destination_state", "destination_market", "destination_region"].forEach((field) => {
      addCellIssue(issues, field, "danger", "Destination needs catalog match: ZIP/ST, market, region, or country.");
    });
  }
  if (needsNumericRate(row)) addCellIssue(issues, "all_in_rate", "danger", "Needs numeric all-in, MX linehaul, or US linehaul.");
  if (hasAllInText(row)) addCellIssue(issues, "all_in_rate", "danger", "All-in accepts numbers only. Put USD/MXN/CAD in Currency.");
  if (hasSplitAllInConflict(row)) addCellIssue(issues, "all_in_rate", "warning", "All-in does not match split components within tolerance.");
  if (hasCurrencyGap(row)) addCellIssue(issues, "currency", "danger", "Currency is required when a rate is present.");
  if (!row.operation) addCellIssue(issues, "operation", "danger", "Operation is required.");
  if (!row.service) addCellIssue(issues, "service", "danger", "Service is required.");
  if (hasSourceServiceConflict(row)) addCellIssue(issues, "service", "warning", "Source service mode differs from staged service.");
  if (hasCrossingGap(row)) {
    if (!row.mx_border_crossing_point) addCellIssue(issues, "mx_border_crossing_point", "danger", "Crossborder lanes need an MX border city.");
    if (!row.us_border_crossing_point) addCellIssue(issues, "us_border_crossing_point", "danger", "Crossborder lanes need a US border city.");
  }
  if (!row.quote_date) addCellIssue(issues, "quote_date", "warning", "Quote date missing.");
  if (!row.weekly_capacity) addCellIssue(issues, "weekly_capacity", "warning", "Weekly capacity missing.");
  if (!hasVendorMatch(row)) addCellIssue(issues, "vendor_domain", "warning", "Vendor has not been matched to sourcing/procurement base.");
  return issues;
}

function validationCountsForRows(rows = []) {
  return rows.reduce((summary, row) => {
    rowCellValidationIssues(row).forEach((fieldIssues) => {
      fieldIssues.forEach((issue) => {
        if (issue.tone === "danger") summary.critical += 1;
        else summary.warning += 1;
      });
    });
    return summary;
  }, { critical: 0, warning: 0 });
}

function setStagingValidationMetric(validation) {
  if (!stagingMetricValidation) return;
  stagingMetricValidation.textContent = validation.warning ? `${validation.critical} / ${validation.warning}` : String(validation.critical);
  stagingMetricValidation.title = validation.warning ? `${validation.critical} critical cells, ${validation.warning} warning cells` : `${validation.critical} critical cells`;
}

function dataColForField(field) {
  if (field === "vendor_domain") return "vendor";
  return field;
}

function setCellValidationState(cell, issues = []) {
  if (!cell) return;
  if (cell.dataset.baseTitle === undefined) cell.dataset.baseTitle = cell.title || "";
  cell.classList.remove("cell-validation-danger", "cell-validation-warning");
  delete cell.dataset.validationStatus;
  cell.title = cell.dataset.baseTitle || "";
  if (!issues.length) return;
  const hasDanger = issues.some((issue) => issue.tone === "danger");
  cell.classList.add(hasDanger ? "cell-validation-danger" : "cell-validation-warning");
  cell.dataset.validationStatus = issues.map((issue) => issue.message).join(" | ");
  cell.title = [cell.title, cell.dataset.validationStatus].filter(Boolean).join(" | ");
}

function applyInlineValidation(tableRow, row = null) {
  if (!tableRow) return { critical: 0, warning: 0 };
  const validationRowData = row || rowFromTablePatch(tableRow, readInlinePatch(tableRow));
  tableRow.querySelectorAll("td[data-col]").forEach((cell) => {
    cell.classList.remove("cell-validation-danger", "cell-validation-warning");
    delete cell.dataset.validationStatus;
  });
  const issues = rowCellValidationIssues(validationRowData);
  let critical = 0;
  let warning = 0;
  issues.forEach((fieldIssues, field) => {
    fieldIssues.forEach((issue) => {
      if (issue.tone === "danger") critical += 1;
      else warning += 1;
    });
    const cell = tableRow.querySelector(`td[data-col="${CSS.escape(dataColForField(field))}"]`);
    setCellValidationState(cell, fieldIssues);
  });
  tableRow.classList.toggle("has-critical-validation", critical > 0);
  tableRow.classList.toggle("has-warning-validation", !critical && warning > 0);
  return { critical, warning };
}

function applyVisibleInlineValidation() {
  body.querySelectorAll("[data-row-id]").forEach((tableRow) => {
    applyInlineValidation(tableRow, rowById(tableRow.dataset.rowId));
  });
}

function updateVisibleValidationMetric() {
  const validation = [...body.querySelectorAll("[data-row-id]")].reduce((summary, tableRow) => {
    const rowValidation = applyInlineValidation(tableRow);
    summary.critical += rowValidation.critical;
    summary.warning += rowValidation.warning;
    return summary;
  }, { critical: 0, warning: 0 });
  setStagingValidationMetric(validation);
}

function applyReviewFilter(rows = loadedRows) {
  if (activeReviewFilter === "needs-location") return rows.filter(needsLocationMatch);
  if (activeReviewFilter === "needs-rate") return rows.filter(needsNumericRate);
  if (activeReviewFilter === "needs-vendor") return rows.filter((row) => !hasVendorMatch(row));
  if (activeReviewFilter === "conflicts") return rows.filter(hasReviewConflict);
  if (activeReviewFilter === "source-audit") return rows.filter(hasSourceAuditIssue);
  if (activeReviewFilter === "ready") return rows.filter(isReadyForApproval);
  if (activeReviewFilter === "all-in") return rows.filter((row) => hasNumericValue(row.all_in_rate));
  if (activeReviewFilter === "split-rate") return rows.filter(hasSplitRate);
  return rows;
}

function stagingSearchHaystack(row) {
  return [
    row.vendors?.vendor_name,
    row.vendor_domain,
    row.rfx_id,
    row.quote_date,
    row.origin,
    row.normalized_origin,
    row.origin_city,
    row.origin_state,
    row.origin_zip_prefix,
    row.origin_market,
    row.origin_region,
    row.destination,
    row.normalized_destination,
    row.destination_city,
    row.destination_state,
    row.destination_zip_prefix,
    row.destination_market,
    row.destination_region,
    row.equipment,
    row.trailer,
    row.config,
    row.operation,
    row.service,
    row.mx_border_crossing_point,
    row.us_border_crossing_point,
    row.all_in_rate,
    row.currency,
    row.weekly_capacity,
    row.status
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applyStagingTextSearch(rows = loadedRows) {
  const query = String(stagingSearchInput?.value || "").trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => stagingSearchHaystack(row).includes(query));
}

function scopedStagingRows(rows = loadedRows) {
  if (!rawUploadScopeId) return rows;
  return rows.filter((row) => row.raw_upload_id === rawUploadScopeId);
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

function columnFilterValues(row, field) {
  if (field === "vendor") return [row.vendors?.vendor_name, row.vendor_domain, row.vendors?.domain].filter(Boolean);
  if (field === "hazmat" || field === "temperature_controlled") return [row[field] ? "Yes" : "No"];
  if (field === "origin") return [row.origin, row.normalized_origin, row.origin_city, row.origin_state, row.origin_zip_prefix, row.origin_market, row.origin_region, row.origin_country].filter(Boolean);
  if (field === "destination") return [row.destination, row.normalized_destination, row.destination_city, row.destination_state, row.destination_zip_prefix, row.destination_market, row.destination_region, row.destination_country].filter(Boolean);
  return [row[field]].filter(Boolean);
}

function applyColumnFilters(rows = loadedRows) {
  return columnFilterController?.apply(rows) || rows;
}

function visibleStagingRows(rows = loadedRows) {
  return applyColumnFilters(applyStagingTextSearch(applyReviewFilter(scopedStagingRows(rows))));
}

function activeColumnFilters() {
  return columnFilterController?.serialized() || {};
}

function activeStagingBulkFilters() {
  return {
    status: statusFilter.value || "",
    raw_upload_id: rawUploadScopeId || "",
    search: String(stagingSearchInput?.value || "").trim(),
    review_filter: activeReviewFilter,
    column_filters: activeColumnFilters()
  };
}

async function stagingFilterMenuValues(field, search = "") {
  const columnFilters = { ...activeColumnFilters() };
  delete columnFilters[field];
  return await fetchStagingFilterValues({
    field,
    status: statusFilter.value,
    rawUploadId: rawUploadScopeId,
    search: String(stagingSearchInput?.value || "").trim(),
    valueSearch: search,
    reviewFilter: activeReviewFilter,
    columnFilters
  });
}

function stagingFilterSummaryLabel(filters) {
  const parts = [];
  if (filters.status) parts.push(`status ${filters.status}`);
  if (filters.raw_upload_id) parts.push("current source upload");
  if (filters.search) parts.push(`search "${filters.search}"`);
  if (filters.review_filter && filters.review_filter !== "all") parts.push(filters.review_filter);
  const columnCount = Object.keys(filters.column_filters || {}).length;
  if (columnCount) parts.push(`${columnCount} column filter(s)`);
  return parts.join(", ") || "all staging rows";
}

function updateReviewFilters() {
  reviewFilterButtons.forEach((button) => {
    const filter = button.dataset.stagingFilter || "all";
    const label = REVIEW_FILTER_LABELS[filter] || filter;
    button.textContent = label;
    button.classList.toggle("is-active", filter === activeReviewFilter);
  });
}

function applyReviewFilterForCount(rows, filter) {
  const previous = activeReviewFilter;
  activeReviewFilter = filter;
  const filtered = applyReviewFilter(rows);
  activeReviewFilter = previous;
  return filtered;
}

function updateReviewMetrics() {
  const scopedRows = scopedStagingRows(loadedRows);
  const validation = validationCountsForRows(scopedRows);
  if (stagingMetricVisible) {
    stagingMetricVisible.textContent = stagingTotalCount && currentRows.length !== stagingTotalCount
      ? `${currentRows.length.toLocaleString()} / ${stagingTotalCount.toLocaleString()}`
      : String(currentRows.length.toLocaleString());
  }
  if (stagingMetricLocation) stagingMetricLocation.textContent = String(scopedRows.filter(needsLocationMatch).length);
  if (stagingMetricRate) stagingMetricRate.textContent = String(scopedRows.filter(needsNumericRate).length);
  setStagingValidationMetric(validation);
  if (stagingMetricSelected) stagingMetricSelected.textContent = String(selectedRows().length);
}

function updateUploadScopeBanner() {
  if (!uploadScopeBanner) return;
  uploadScopeBanner.classList.toggle("hidden", !rawUploadScopeId);
  if (!rawUploadScopeId) return;
  uploadScopeBanner.innerHTML = `
    <div>
      <strong>Viewing extracted rows from one upload</strong>
      <span>${escapeHtml(currentRows.length)} row(s) visible for source ${escapeHtml(rawUploadScopeId)}</span>
    </div>
    <a href="./staging-review.html">Clear source filter</a>
  `;
}

function briefMetric(label, value, tone = "") {
  return `
    <article class="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
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

function renderDrawerAlerts(row) {
  const issues = rowReviewIssues(row);
  if (!issues.length && rowRateMode(row).tone !== "danger") {
    return '<div class="drawer-alert-row"><span class="review-chip success">Ready for review</span></div>';
  }
  return `<div class="drawer-alert-row">${[rowRateMode(row), ...issues]
    .map((chip) => `<span class="review-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`)
    .join("")}</div>`;
}

function renderDrawerBrief(row) {
  const vendor = row.vendors?.vendor_name || row.vendor_domain || "Unmatched vendor";
  const equipment = [row.equipment, row.trailer, row.hazmat ? "Hazmat" : "", row.temperature_controlled ? "Temp controlled" : "", row.config]
    .filter(Boolean)
    .join(" / ");
  return `
    <section class="drawer-brief">
      <div>
        <p class="eyebrow">Review brief</p>
        <h3>${escapeHtml(lane(row) || "Unresolved lane")}</h3>
        <span>${escapeHtml([vendor, row.rfx_id, dateValue(row.quote_date)].filter(Boolean).join(" | "))}</span>
      </div>
      ${renderDrawerAlerts(row)}
      <div class="drawer-brief-metrics">
        ${briefMetric("All-in", moneyValue(row.all_in_rate), hasNumericValue(row.all_in_rate) ? "strong" : "weak")}
        ${briefMetric("Operation", row.operation)}
        ${briefMetric("Service", row.service)}
        ${briefMetric("Equipment", equipment)}
      </div>
      <div class="rate-component-grid">
        ${rateComponent("MX linehaul", row.mx_linehaul)}
        ${rateComponent("US linehaul", row.us_linehaul)}
        ${rateComponent("FSC", row.fsc)}
        ${rateComponent("Border fee", row.border_crossing_fee)}
      </div>
    </section>
  `;
}

function fixChecklist(row) {
  const items = [];
  if (needsNumericRate(row)) {
    items.push({
      tone: "danger",
      title: "Enter a numeric rate",
      detail: "Use All-in, or fill MX/US linehaul if the carrier split the quote."
    });
  }
  if (hasAllInText(row)) {
    items.push({
      tone: "danger",
      title: "Clean the all-in rate",
      detail: "All-in only accepts numbers. Move USD/MXN/CAD into Currency."
    });
  }
  if (hasSplitAllInConflict(row)) {
    items.push({
      tone: "warning",
      title: "Review all-in vs split components",
      detail: "The all-in amount differs from MX linehaul + US linehaul + FSC + border fee."
    });
  }
  if (hasSourceServiceConflict(row)) {
    items.push({
      tone: "warning",
      title: "Review One Way / Roundtrip",
      detail: "The staged service mode differs from the source evidence."
    });
  }
  if (needsLocationMatch(row)) {
    items.push({
      tone: "danger",
      title: "Resolve origin and destination",
      detail: "Choose catalog-backed cities so ZIP/state/market can be matched."
    });
  }
  if (!hasVendorMatch(row)) {
    items.push({
      tone: "warning",
      title: "Confirm vendor",
      detail: "Match this quote to a configured vendor before using it commercially."
    });
  }
  if (!row.quote_date) {
    items.push({
      tone: "warning",
      title: "Add quote date",
      detail: "Quote date supports fuel, FX and rate book version context."
    });
  }
  if (!row.weekly_capacity) {
    items.push({
      tone: "muted",
      title: "Add capacity",
      detail: "Weekly capacity is not required to approve, but it improves sourcing decisions."
    });
  }
  return items;
}

function renderFixChecklist(row) {
  const items = fixChecklist(row);
  if (!items.length) {
    return `
      <section class="fix-checklist">
        <div class="section-heading compact">
          <p class="eyebrow">Approval readiness</p>
          <h3>Ready to approve</h3>
        </div>
        <article class="fix-item success">
          <strong>No blocking issues</strong>
          <span>The row has a usable rate and matched locations.</span>
        </article>
      </section>
    `;
  }
  return `
    <section class="fix-checklist">
      <div class="section-heading compact">
        <p class="eyebrow">Approval readiness</p>
        <h3>Fix checklist</h3>
      </div>
      ${items
        .map(
          (item) => `
            <article class="fix-item ${escapeHtml(item.tone)}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function confidencePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`;
}

function renderExtractionAudit(row) {
  const confidence = objectValue(row.field_confidence);
  const evidence = objectValue(row.source_evidence);
  const weakFields = Object.entries(confidence)
    .filter(([, value]) => Number(value) < 0.75)
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .slice(0, 10);
  const flags = rowAuditFlags(row);
  const warnings = rowExtractionWarnings(row);

  return `
    <section>
      <h3>Extraction audit</h3>
      <div class="drawer-badges">
        ${flags.length ? `<span class="review-chip warning">${escapeHtml(flags.length)} audit flag${flags.length === 1 ? "" : "s"}</span>` : '<span class="review-chip success">No audit flags</span>'}
        ${warnings.length ? `<span class="review-chip warning">${escapeHtml(warnings.length)} source warning${warnings.length === 1 ? "" : "s"}</span>` : ""}
      </div>
      <dl>
        ${detailLine("Source file", evidence.source_filename)}
        ${detailLine("Source row", evidence.row_id)}
        ${detailLine("Source lane", evidence.lane)}
        ${detailLine("Source service", evidence.service)}
        ${detailLine("Source all-in", evidence.all_in_rate)}
        ${detailLine("Split rate present", evidence.split_rate_present ? "yes" : "no")}
      </dl>
      ${
        weakFields.length
          ? `<div class="audit-field-grid">${weakFields
              .map(([field, value]) => `<span>${escapeHtml(field.replace(/_/g, " "))}<strong>${escapeHtml(confidencePercent(value))}</strong></span>`)
              .join("")}</div>`
          : '<p class="muted-text">No weak field confidence recorded.</p>'
      }
      ${
        flags.length || warnings.length
          ? `<ul class="compact-warning-list">${[...flags, ...warnings].slice(0, 16).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : ""
      }
    </section>
  `;
}

function sourceCompareLine(label, sourceValue, stagedValue) {
  const sourceText = String(sourceValue || "").trim();
  const stagedText = String(stagedValue || "").trim();
  const same = lookupKey(sourceText) && lookupKey(sourceText) === lookupKey(stagedText);
  const tone = !sourceText || !stagedText ? "muted" : same ? "success" : "warning";
  return `
    <article class="source-compare-row ${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <div>
        <small>Source</small>
        <strong>${escapeHtml(sourceText || "-")}</strong>
      </div>
      <div>
        <small>Staged</small>
        <strong>${escapeHtml(stagedText || "-")}</strong>
      </div>
    </article>
  `;
}

function renderSourceComparison(row) {
  const evidence = objectValue(row.source_evidence);
  return `
    <section class="source-compare-panel">
      <div class="section-heading compact">
        <p class="eyebrow">Source vs staged</p>
        <h3>Field comparison</h3>
      </div>
      ${sourceCompareLine("Origin", evidence.origin || evidence.source_origin, row.origin)}
      ${sourceCompareLine("Destination", evidence.destination || evidence.source_destination, row.destination)}
      ${sourceCompareLine("Service", evidence.service, row.service)}
      ${sourceCompareLine("Equipment", evidence.equipment || evidence.trailer, [row.equipment, row.trailer, row.config].filter(Boolean).join(" / "))}
      ${sourceCompareLine("All-in", evidence.all_in_rate || evidence.total_rate, row.all_in_rate)}
      ${sourceCompareLine("Capacity", evidence.weekly_capacity || evidence.capacity, row.weekly_capacity)}
    </section>
  `;
}

function renderSourcePreview(row) {
  const evidence = objectValue(row.source_evidence);
  const excerpt = evidence.extracted_text || evidence.source_excerpt || evidence.raw_text || evidence.table_text || "";
  const fileName = evidence.source_filename || row.original_filename || row.raw_upload_id || "Source file";
  return `
    <aside class="source-preview-panel">
      <div class="section-heading compact">
        <p class="eyebrow">Original evidence</p>
        <h3>${escapeHtml(fileName)}</h3>
      </div>
      <div class="source-preview-actions">
        ${row.raw_upload_id ? `<a class="secondary small-button" href="./upload-history.html">Upload history</a>` : ""}
        ${row.raw_upload_id ? `<a class="small-button" href="./staging-review.html?raw_upload_id=${encodeURIComponent(row.raw_upload_id)}&status=">All rows from source</a>` : ""}
      </div>
      <dl>
        ${detailLine("Source row", evidence.row_id)}
        ${detailLine("Source lane", evidence.lane)}
        ${detailLine("Source service", evidence.service)}
        ${detailLine("Source all-in", evidence.all_in_rate)}
      </dl>
      ${excerpt ? `<pre class="source-excerpt">${escapeHtml(excerpt).slice(0, 5000)}</pre>` : '<p class="muted-text">No raw source excerpt was stored for this row.</p>'}
      ${renderExtractionAudit(row)}
    </aside>
  `;
}

function renderRowDetail(row) {
  const legs = Array.isArray(row.rateware_lane_legs)
    ? row.rateware_lane_legs.slice().sort((a, b) => Number(a.leg_sequence || 0) - Number(b.leg_sequence || 0))
    : [];

  rowDetail.innerHTML = `
    <div class="source-evidence-workbench">
      <div class="staged-review-panel">
        ${renderDrawerBrief(row)}
        ${renderFixChecklist(row)}
        ${renderSourceComparison(row)}
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
            ${detailLine("Origin source", row.origin_match_source)}
            ${detailLine("Origin confidence", row.origin_match_confidence ? `${moneyValue(row.origin_match_confidence)}%` : "")}
            ${detailLine("Origin manual", row.origin_match_manual ? "yes" : "no")}
            ${detailLine("Destination market", row.destination_market)}
            ${detailLine("Destination ZIP", row.destination_zip_prefix)}
            ${detailLine("Destination city", row.destination_city)}
            ${detailLine("Destination state", row.destination_state)}
            ${detailLine("Destination country", row.destination_country)}
            ${detailLine("Destination region", row.destination_region)}
            ${detailLine("Destination match", row.destination_match_reason)}
            ${detailLine("Destination source", row.destination_match_source)}
            ${detailLine("Destination confidence", row.destination_match_confidence ? `${moneyValue(row.destination_match_confidence)}%` : "")}
            ${detailLine("Destination manual", row.destination_match_manual ? "yes" : "no")}
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
      </div>
      ${renderSourcePreview(row)}
    </div>
  `;
}

function renderStagingTableRow(row) {
  return `
        <tr class="${escapeHtml(rowQualityClass(row))}" data-row-id="${escapeHtml(row.id)}">
          <td class="select-column" data-col="select">
            <input data-select-row="${escapeHtml(row.id)}" type="checkbox" aria-label="Select staging row" ${selectedRowIds.has(row.id) ? "checked" : ""} />
          </td>
          <td class="vendor-review-cell" data-col="vendor">
            ${row.vendors?.vendor_name ? `<strong>${escapeHtml(row.vendors.vendor_name)}</strong>` : ""}
            ${inputCell(row, "vendor_domain", { wide: true, list: "staging-vendor-options" })}
            ${row.vendors?.vendor_name ? `<span class="match-pill">${escapeHtml(row.vendors.base_stage || "matched")}</span>` : ""}
            ${renderQualityStrip(row)}
            ${renderReviewChips(row)}
          </td>
          <td class="${escapeHtml(locationValidationClass(row, "origin"))}" data-col="origin" title="${escapeHtml(locationMatchSummary(row, "origin").title)}">${renderLocationCell(row, "origin")}</td>
          <td class="${escapeHtml(locationValidationClass(row, "destination"))}" data-col="destination" title="${escapeHtml(locationMatchSummary(row, "destination").title)}">${renderLocationCell(row, "destination")}</td>
          <td class="rate-cell ${escapeHtml(rateValidationClass(row))}" data-col="all_in_rate" title="${escapeHtml(rateValidationTitle(row))}">
            ${inputCell(row, "all_in_rate", { money: true })}
            <span class="row-save-status sheet-row-save-dot" data-row-status="${escapeHtml(row.id)}"></span>
          </td>
          <td data-col="quote_date">${inputCell(row, "quote_date", { type: "date", short: true })}</td>
          <td data-col="rfx_id">${inputCell(row, "rfx_id", { short: true })}</td>
          <td data-col="row_id">${inputCell(row, "row_id", { short: true })}</td>
          <td data-col="origin_zip_prefix">${inputCell(row, "origin_zip_prefix", { short: true, list: "staging-zip-options" })}</td>
          <td data-col="origin_state">${inputCell(row, "origin_state", { short: true, list: "staging-state-options" })}</td>
          <td data-col="origin_market">${inputCell(row, "origin_market", { wide: true, list: "staging-market-options" })}</td>
          <td data-col="origin_region">${inputCell(row, "origin_region", { wide: true, list: "staging-region-options" })}</td>
          <td data-col="destination_zip_prefix">${inputCell(row, "destination_zip_prefix", { short: true, list: "staging-zip-options" })}</td>
          <td data-col="destination_state">${inputCell(row, "destination_state", { short: true, list: "staging-state-options" })}</td>
          <td data-col="destination_market">${inputCell(row, "destination_market", { wide: true, list: "staging-market-options" })}</td>
          <td data-col="destination_region">${inputCell(row, "destination_region", { wide: true, list: "staging-region-options" })}</td>
          <td data-col="equipment">${selectCell(row, "equipment", stagingOptions.categories.equipment || [], { short: true })}</td>
          <td data-col="trailer">${selectCell(row, "trailer", stagingOptions.categories.trailer || [], { short: true })}</td>
          <td data-col="hazmat">${checkboxCell(row, "hazmat", "Hazmat")}</td>
          <td data-col="temperature_controlled">${checkboxCell(row, "temperature_controlled", "Temperature controlled")}</td>
          <td data-col="config">${selectCell(row, "config", stagingOptions.categories.config || [], { short: true })}</td>
          <td data-col="operation">${selectCell(row, "operation", stagingOptions.categories.operation || [], { short: true })}</td>
          <td data-col="service">${selectCell(row, "service", stagingOptions.categories.service || [], { short: true })}</td>
          <td data-col="mx_border_crossing_point">${selectCell(row, "mx_border_crossing_point", stagingOptions.mx_crossings || [], { short: true })}</td>
          <td data-col="us_border_crossing_point">${selectCell(row, "us_border_crossing_point", stagingOptions.us_crossings || [], { short: true })}</td>
          <td data-col="mx_linehaul">${inputCell(row, "mx_linehaul", { money: true })}</td>
          <td data-col="us_linehaul">${inputCell(row, "us_linehaul", { money: true })}</td>
          <td data-col="fsc">${inputCell(row, "fsc", { money: true })}</td>
          <td data-col="border_crossing_fee">${inputCell(row, "border_crossing_fee", { money: true })}</td>
          <td data-col="currency">${selectCell(row, "currency", stagingOptions.currencies || ["USD", "MXN", "CAD"], { short: true })}</td>
          <td data-col="weekly_capacity">${inputCell(row, "weekly_capacity", { short: true })}</td>
          <td data-col="status">${statusSelect(row)}</td>
        </tr>
      `;
}

function stagingLoadStateRow() {
  return "";
}

function updateStagingLoadRow() {
  updateStagingPaginationControls();
}

function renderRows(rows, { append = false } = {}) {
  currentRows = rows;
  renderDatalists();
  updateReviewFilters();
  updateUploadScopeBanner();

  if (!rows.length) {
    body.innerHTML =
      `${tableState(STAGING_COLSPAN, {
        tone: "neutral",
        eyebrow: rawUploadScopeId ? "Source upload" : "Review queue",
        title: "No staging rows found",
        detail: rawUploadScopeId ? "This upload does not have staging rows in the current filters." : "Interpret uploaded quotes to create rows for review.",
        actionHref: "./upload-history.html",
        actionLabel: "Open upload history"
      })}${stagingLoadStateRow()}`;
    columnVisibilityController?.applyVisibility();
    updateBulkControls();
    return;
  }

  body.innerHTML = rows.map(renderStagingTableRow).join("") + stagingLoadStateRow();
  columnVisibilityController?.applyVisibility();
  applyVisibleInlineValidation();
  updateBulkControls();
}

function setStatus(message, tone = "neutral") {
  editStatus.textContent = message;
  editStatus.dataset.tone = tone;
}

function rowById(id) {
  return currentRows.find((row) => row.id === id);
}

function stagingPageParams(offset = stagingPageOffset()) {
  return {
    status: statusFilter.value,
    rawUploadId: rawUploadScopeId,
    limit: stagingPageSize,
    offset,
    search: String(stagingSearchInput?.value || "").trim(),
    reviewFilter: activeReviewFilter,
    columnFilters: activeColumnFilters()
  };
}

function applyStagingPage(page) {
  const rows = page.rows || [];
  stagingTotalCount = Number(page.total || stagingTotalCount || rows.length || 0);
  stagingHasMoreRows = Boolean(page.has_more);
  stagingLoadOffset = stagingPageOffset() + rows.length;
  stagingPageIndex = clampPageIndex(stagingPageIndex, stagingTotalCount);
  loadedRows = rows;
  renderRows(rows);
}

function populateEditDrawer(row) {
  if (!row) return;
  document.querySelector("#staging-drawer-title").textContent = lane(row) || row.rfx_id || "Rate row";
  document.querySelector("#edit-vendor-domain").value = row.vendor_domain || row.vendors?.domain || "";
  document.querySelector("#edit-rfx-id").value = row.rfx_id || "";
  document.querySelector("#edit-quote-date").value = dateValue(row.quote_date);
  document.querySelector("#edit-origin").value = row.origin || "";
  document.querySelector("#edit-destination").value = row.destination || "";
  document.querySelector("#edit-equipment").value = row.equipment || "";
  document.querySelector("#edit-trailer-config").value = [row.trailer, row.config].filter(Boolean).join(" / ");
  document.querySelector("#edit-hazmat").checked = Boolean(row.hazmat);
  document.querySelector("#edit-temperature-controlled").checked = Boolean(row.temperature_controlled);
  document.querySelector("#edit-operation").value = row.operation || "";
  document.querySelector("#edit-service").value = row.service || "";
  document.querySelector("#edit-all-in-rate").value = row.all_in_rate || "";
  document.querySelector("#edit-currency").value = row.currency || "";
  document.querySelector("#edit-weekly-capacity").value = row.weekly_capacity || "";
  document.querySelector("#edit-notes").value = row.notes || "";
}

async function openEditDrawer(id) {
  const row = rowById(id);
  if (!row) return;

  activeRowId = id;
  populateEditDrawer(row);
  rowDetail.innerHTML = loadingState({
    title: "Loading row evidence",
    detail: "Opening source evidence, extraction audit, location candidates, and lane legs."
  });
  setStatus("");
  drawer.classList.remove("hidden");

  try {
    const detail = await fetchStagingDetail(id);
    if (activeRowId !== id) return;
    replaceStoredRow(detail);
    populateEditDrawer(detail);
    renderRowDetail(detail);
  } catch (error) {
    if (activeRowId !== id) return;
    renderRowDetail(row);
    setStatus(`Detail could not load: ${error.message}`, "error");
  }
}

function readInlinePatch(tableRow, status = null) {
  const patch = {};
  tableRow.querySelectorAll("[data-field]").forEach((input) => {
    patch[input.dataset.field] = input.matches('input[type="checkbox"]') ? input.checked : input.value;
  });
  if (patch.confidence !== undefined) patch.confidence = Number(patch.confidence || 0) / 100;
  if (status) patch.status = status;
  return patch;
}

function setRowStatus(id, message, tone = "neutral") {
  const status = body.querySelector(`[data-row-status="${CSS.escape(id)}"]`);
  if (!status) return;
  status.textContent = "";
  status.title = message || "";
  if (!message) {
    delete status.dataset.tone;
    return;
  }
  status.dataset.tone = tone;
}

function setCellSaveState(cell, state = "") {
  if (!cell) return;
  cell.classList.remove("sheet-cell-dirty", "sheet-cell-saving", "sheet-cell-saved", "sheet-cell-error");
  delete cell.dataset.cellStatus;
  if (!state) return;
  cell.classList.add(`sheet-cell-${state}`);
  cell.dataset.cellStatus = {
    dirty: "Unsaved cell",
    saving: "Saving cell",
    saved: "Saved cell",
    error: "Cell save failed"
  }[state] || state;
  if (state === "saved") {
    window.setTimeout(() => {
      if (cell.classList.contains("sheet-cell-saved")) setCellSaveState(cell);
    }, 2200);
  }
}

function setDirtyRowCellsState(tableRow, state) {
  tableRow?.querySelectorAll("td.sheet-cell-dirty, td.sheet-cell-saving, td.sheet-cell-error").forEach((cell) => setCellSaveState(cell, state));
}

function markEditedCellDirty(input) {
  if (!input || input.type === "hidden") return;
  setCellSaveState(input.closest("td"), "dirty");
}

function clearAutoSaveTimer(id) {
  window.clearTimeout(autoSaveTimers.get(id));
  autoSaveTimers.delete(id);
}

function replaceStoredRow(updatedRow) {
  loadedRows = loadedRows.map((row) => row.id === updatedRow.id ? { ...row, ...updatedRow } : row);
  currentRows = currentRows.map((row) => row.id === updatedRow.id ? { ...row, ...updatedRow } : row);
}

function markStagingRowDirty(tableRow) {
  const id = tableRow?.dataset.rowId;
  if (!id) return;
  tableRow.classList.add("dirty-row");
  setRowStatus(id, "Autosaves in 1s", "warning");
  setBulkStatus("");
}

async function saveStagingTableRow(tableRow, status = null) {
  const id = tableRow?.dataset.rowId;
  if (!id) return null;
  clearAutoSaveTimer(id);
  const button = tableRow.querySelector(`[data-save-id="${CSS.escape(id)}"]`);
  if (button) button.disabled = true;
  setDirtyRowCellsState(tableRow, "saving");
  setRowStatus(id, "Saving...");

  try {
    await ensureSignedIn();
    const updated = await updateStagingRow(id, readInlinePatch(tableRow, status));
    replaceStoredRow(updated);
    tableRow.classList.remove("dirty-row");
    setDirtyRowCellsState(tableRow, "saved");
    applyInlineValidation(tableRow, updated);
    updateReviewMetrics();
    setRowStatus(id, status ? `Marked ${status.replace("_", " ")}` : "Saved", "success");
    return updated;
  } catch (error) {
    setDirtyRowCellsState(tableRow, "error");
    setRowStatus(id, error.message, "error");
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function scheduleStagingAutoSave(tableRow, wait = 1000) {
  const id = tableRow?.dataset.rowId;
  if (!id) return;
  clearAutoSaveTimer(id);
  autoSaveTimers.set(id, window.setTimeout(async () => {
    try {
      await saveStagingTableRow(tableRow);
    } catch {
      updateBulkControls();
    }
  }, wait));
}

async function runBulkAction(status = null) {
  const rows = selectedRows();
  if (!rows.length) return;

  if (status === "approved") {
    const blockedRows = rows
      .map((tableRow) => {
        const patch = readInlinePatch(tableRow, status);
        return { tableRow, blockers: approvalBlockers(rowFromTablePatch(tableRow, patch)) };
      })
      .filter((item) => item.blockers.length);

    if (blockedRows.length) {
      blockedRows.forEach(({ tableRow, blockers }) => {
        applyInlineValidation(tableRow);
        setRowStatus(tableRow.dataset.rowId, approvalBlockerMessage(blockers), "error");
      });
      setBulkStatus(`${blockedRows.length} selected row(s) need correction before approval.`, "error");
      updateBulkControls();
      return;
    }
  }

  const label = status ? status.replace("_", " ") : "save";
  setBulkStatus(`Processing ${rows.length} rows...`);
  bulkSaveButton.disabled = true;
  if (bulkMatchVendorsButton) bulkMatchVendorsButton.disabled = true;
  bulkApproveButton.disabled = true;
  bulkRejectButton.disabled = true;
  if (bulkEnrichZipsButton) bulkEnrichZipsButton.disabled = true;
  if (bulkRenormalizeButton) bulkRenormalizeButton.disabled = true;
  bulkArchiveButton.disabled = true;
  bulkRemoveButton.disabled = true;

  try {
    await Promise.all(rows.map(async (tableRow) => {
      const id = tableRow.dataset.rowId;
      setRowStatus(id, status ? `Marking ${label}...` : "Saving...");
      await saveStagingTableRow(tableRow, status);
      selectedRowIds.delete(id);
    }));
    setBulkStatus(`${rows.length} rows updated.`, "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
  } finally {
    updateBulkControls();
  }
}

async function applySelectedBulkEdit() {
  const rows = selectedRows();
  const field = bulkFieldSelect?.value;
  if (!rows.length || !field) return;
  const patch = { [field]: bulkPatchValue(field, bulkValueInput?.value) };
  if (applyBulkEditButton) applyBulkEditButton.disabled = true;
  setBulkEditStatus(`Updating ${rows.length} selected row(s)...`);

  try {
    await ensureSignedIn();
    await Promise.all(rows.map((tableRow) => updateStagingRow(tableRow.dataset.rowId, patch)));
    rows.forEach((row) => selectedRowIds.delete(row.dataset.rowId));
    setBulkEditStatus(`${rows.length} selected row(s) updated.`, "success");
    setBulkStatus(`${rows.length} selected row(s) updated.`, "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkEditStatus(error.message, "error");
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
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
  } finally {
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
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function runFilteredStagingAction(targetAction) {
  const isRemove = targetAction === "remove";
  const filters = activeStagingBulkFilters();
  const service = isRemove ? removeStagingRowsByFilter : archiveStagingRowsByFilter;
  const label = isRemove ? "remove" : "archive";

  try {
    await ensureSignedIn();
    if (bulkArchiveFilteredButton) bulkArchiveFilteredButton.disabled = true;
    if (bulkRemoveFilteredButton) bulkRemoveFilteredButton.disabled = true;
    setBulkStatus(`Counting rows for ${label} filtered...`);

    const preview = await service(filters, { dryRun: true });
    const matched = Number(preview.matched || 0);
    if (!matched) {
      setBulkStatus(`No staging rows match: ${stagingFilterSummaryLabel(filters)}.`, "warning");
      return;
    }

    const scope = stagingFilterSummaryLabel(filters);
    if (isRemove) {
      if (!confirmFilteredDatabaseAction({ actionLabel: "Remove", matched, scope, keyword: "DELETE", destructive: true })) {
        setBulkStatus("Filtered remove cancelled.", "warning");
        return;
      }
    } else {
      if (!confirmFilteredDatabaseAction({ actionLabel: "Archive", matched, scope, keyword: "ARCHIVE" })) {
        setBulkStatus("Filtered archive cancelled.", "warning");
        return;
      }
    }

    let affected = 0;
    let batch = 0;
    while (affected < matched) {
      batch += 1;
      setBulkStatus(`${isRemove ? "Removing" : "Archiving"} filtered staging rows... ${affected.toLocaleString()} / ${matched.toLocaleString()}`);
      const result = await service(filters, { dryRun: false, maxRows: FILTERED_BULK_BATCH_SIZE, confirmed: true, previewCount: matched });
      const count = Number(result.updated || result.removed || 0);
      if (!count) break;
      affected += count;
      setBulkStatus(`${isRemove ? "Removed" : "Archived"} ${Math.min(affected, matched).toLocaleString()} / ${matched.toLocaleString()} filtered staging rows (${batch} batch${batch === 1 ? "" : "es"}).`);
      if (count < FILTERED_BULK_BATCH_SIZE) break;
    }
    selectedRowIds.clear();
    setBulkStatus(`${affected.toLocaleString()} filtered staging row(s) ${isRemove ? "removed" : "archived"}.`, "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
  } finally {
    if (bulkArchiveFilteredButton) bulkArchiveFilteredButton.disabled = false;
    if (bulkRemoveFilteredButton) bulkRemoveFilteredButton.disabled = false;
    updateBulkControls();
  }
}

async function runFilteredStagingUpdate(patch, label) {
  const filters = activeStagingBulkFilters();
  const scope = stagingFilterSummaryLabel(filters);
  const normalizedLabel = label || "update";

  try {
    await ensureSignedIn();
    if (bulkApproveFilteredButton) bulkApproveFilteredButton.disabled = true;
    if (bulkRejectFilteredButton) bulkRejectFilteredButton.disabled = true;
    if (applyBulkEditFilteredButton) applyBulkEditFilteredButton.disabled = true;
    setBulkStatus(`Counting rows for ${normalizedLabel} filtered...`);

    const preview = await updateStagingRowsByFilter(filters, patch, { dryRun: true });
    const matched = Number(preview.matched || 0);
    if (!matched) {
      setBulkStatus(`No staging rows match: ${scope}.`, "warning");
      return;
    }

    if (!confirmFilteredDatabaseAction({ actionLabel: normalizedLabel, matched, scope, keyword: "APPLY" })) {
      setBulkStatus(`Filtered ${normalizedLabel} cancelled.`, "warning");
      return;
    }

    setBulkStatus(`Applying filtered ${normalizedLabel} to ${matched.toLocaleString()} staging row(s)...`);
    const result = await updateStagingRowsByFilter(filters, patch, { dryRun: false, maxRows: matched, confirmed: true, previewCount: matched });
    const affected = Number(result.updated || 0);

    selectedRowIds.clear();
    const capped = result.hard_limit_reached ? " API safety limit reached; narrow the filters and run again for the remainder." : "";
    setBulkStatus(`${affected.toLocaleString()} filtered staging row(s) updated.${capped}`, result.hard_limit_reached ? "warning" : "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
    setBulkEditStatus(error.message, "error");
  } finally {
    if (bulkApproveFilteredButton) bulkApproveFilteredButton.disabled = false;
    if (bulkRejectFilteredButton) bulkRejectFilteredButton.disabled = false;
    if (applyBulkEditFilteredButton) applyBulkEditFilteredButton.disabled = false;
    updateBulkControls();
  }
}

async function runBulkRenormalize() {
  const rows = selectedRows();
  if (!rows.length) return;
  const ids = rows.map((row) => row.dataset.rowId);

  setBulkStatus(`Re-normalizing ${ids.length} rows...`);
  if (bulkRenormalizeButton) bulkRenormalizeButton.disabled = true;

  try {
    await ensureSignedIn();
    const result = await renormalizeStagingRows(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setBulkStatus(`${result.updated || ids.length} rows re-normalized with the current catalog.`, "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function runBulkMatchVendors() {
  const rows = selectedRows();
  const ids = rows.map((row) => row.dataset.rowId);

  if (bulkMatchVendorsButton) bulkMatchVendorsButton.disabled = true;

  try {
    await ensureSignedIn();
    if (ids.length) {
      setBulkStatus(`Matching vendors for ${ids.length} selected row(s)...`);
      const result = await matchStagingVendors(ids);
      ids.forEach((id) => selectedRowIds.delete(id));
      const downloaded = downloadVendorMatchErrors("staging-vendor-match-errors", result.unmatched_errors, result.unmatched_errors_truncated);
      setBulkStatus(`${result.updated || 0} selected row(s) linked to vendors. ${Number(result.upload_updated || 0).toLocaleString()} source upload(s) repaired.${downloaded ? " Vendor match errors CSV downloaded." : ""}`, "success");
      await loadRows({ preservePage: true });
      return;
    }

    const filters = activeStagingBulkFilters();
    const scope = stagingFilterSummaryLabel(filters);
    setBulkStatus(`Counting staging rows for vendor match: ${scope}...`);
    const preview = await matchStagingVendorsByFilter(filters, { dryRun: true });
    const matched = Number(preview.matched || 0);
    const matchable = Number(preview.matchable || 0);
    const uploadMatchable = Number(preview.upload_matchable || 0);
    if (!matched) {
      setBulkStatus(`No staging rows match: ${scope}.`, "warning");
      return;
    }
    if (!matchable && !uploadMatchable) {
      setBulkStatus(`No vendor matches found across ${matched.toLocaleString()} filtered staging row(s).`, "warning");
      return;
    }
    if (!confirmFilteredDatabaseAction({ actionLabel: "Match vendors for", matched, scope, keyword: "MATCH" })) {
      setBulkStatus("Filtered vendor match cancelled.", "warning");
      return;
    }

    setBulkStatus(`Matching vendors for ${matched.toLocaleString()} filtered staging row(s)...`);
    const result = await matchStagingVendorsByFilter(filters, { dryRun: false, maxRows: matched, confirmed: true, previewCount: matched });
    selectedRowIds.clear();
    const downloaded = downloadVendorMatchErrors("staging-vendor-match-errors", result.unmatched_errors, result.unmatched_errors_truncated);
    setBulkStatus(`${Number(result.updated || 0).toLocaleString()} staging row(s) linked to vendors. ${Number(result.upload_updated || 0).toLocaleString()} source upload(s) repaired. ${Number(result.candidates || 0).toLocaleString()} row(s) and ${Number(result.upload_candidates || 0).toLocaleString()} upload(s) had vendor references.${downloaded ? " Vendor match errors CSV downloaded." : ""}`, "success");
    await loadRows({ preservePage: true });
  } catch (error) {
    setBulkStatus(error.message, "error");
  } finally {
    updateBulkControls();
  }
}

async function runBulkEnrichZips() {
  const rows = selectedRows();
  if (!rows.length) return;
  const ids = rows.map((row) => row.dataset.rowId);

  setBulkStatus(`Finding missing ZIPs for ${ids.length} rows...`);
  if (bulkEnrichZipsButton) bulkEnrichZipsButton.disabled = true;

  try {
    await ensureSignedIn();
    const result = await enrichStagingLocationZips(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setBulkStatus(`${result.enriched || 0} location(s) enriched. ${result.updated || ids.length} rows checked.`, "success");
    await loadRows({ preservePage: true });
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
    hazmat: document.querySelector("#edit-hazmat").checked,
    temperature_controlled: document.querySelector("#edit-temperature-controlled").checked,
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
  const patch = readPatch(status);

  if (status === "approved") {
    const blockers = approvalBlockers(validationRow(rowById(activeRowId), patch));
    if (blockers.length) {
      setStatus(approvalBlockerMessage(blockers), "error");
      return;
    }
  }

  setStatus(status ? `Saving and marking ${status}...` : "Saving changes...");

  try {
    await ensureSignedIn();
    await updateStagingRow(activeRowId, patch);
    setStatus(status ? `Row marked ${status}.` : "Changes saved.", "success");
    await loadRows({ preservePage: true });
    if (status) drawer.classList.add("hidden");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadRows({ preservePage = false } = {}) {
  if (!preservePage) stagingPageIndex = 0;
  body.innerHTML = tableLoadingState(STAGING_COLSPAN, {
    title: "Loading staging rows",
    detail: "Reading interpreted quotes, catalog matches, validation flags, and editable spreadsheet columns."
  });
  refreshButton.disabled = true;
  stagingLoadToken += 1;
  stagingLoadOffset = stagingPageOffset();
  stagingTotalCount = 0;
  stagingHasMoreRows = false;
  stagingIsLoadingMore = true;
  updateStagingPaginationControls();
  loadedRows = [];
  currentRows = [];

  try {
    await requirePrivatePage();
    const token = stagingLoadToken;
    let [options, page] = await Promise.all([
      fetchStagingOptions().catch(() => stagingOptions),
      fetchStagingPage(stagingPageParams(stagingPageOffset()))
    ]);
    if (token !== stagingLoadToken) return;
    if (!(page.rows || []).length && Number(page.total || 0) > 0 && stagingPageOffset() >= Number(page.total || 0)) {
      stagingTotalCount = Number(page.total || 0);
      stagingPageIndex = clampPageIndex(stagingPageIndex, stagingTotalCount);
      page = await fetchStagingPage(stagingPageParams(stagingPageOffset()));
      if (token !== stagingLoadToken) return;
    }
    stagingOptions = {
      categories: options.categories || {},
      vendors: options.vendors || [],
      locations: options.locations || [],
      mx_crossings: options.mx_crossings || [],
      us_crossings: options.us_crossings || [],
      currencies: options.currencies || ["USD", "MXN", "CAD"]
    };
    populateBulkEditControls();
    stagingIsLoadingMore = false;
    applyStagingPage(page);
    await applyPermissionState("[data-save-id], [data-approve-id], [data-reject-id], #save-staging-button, #approve-staging-button, #reject-staging-button, #bulk-save-button, #bulk-match-vendors-button, #bulk-approve-button, #bulk-reject-button, #bulk-approve-filtered-button, #bulk-reject-filtered-button, #bulk-enrich-zips-button, #bulk-renormalize-button, #bulk-archive-button, #bulk-remove-button, #bulk-archive-filtered-button, #bulk-remove-filtered-button, #apply-staging-bulk-edit-filtered", "staging:approve");
  } catch (error) {
    stagingIsLoadingMore = false;
    body.innerHTML = tableErrorState(STAGING_COLSPAN, error, {
      title: "Staging Review could not load",
      retryAction: "load-staging-rows",
      meta: "No staged rates were changed."
    });
  } finally {
    stagingIsLoadingMore = false;
    refreshButton.disabled = false;
    updateStagingPaginationControls();
  }
}

async function clearStagingFilters() {
  statusFilter.value = "pending_review";
  if (stagingSearchInput) stagingSearchInput.value = "";
  activeReviewFilter = "all";
  columnFilterController?.clear({ silent: true });
  selectedRowIds.clear();
  setBulkStatus("");
  drawer.classList.add("hidden");
  await loadRows();
}

async function removeStagingFilter(type, field = "") {
  if (type === "all") {
    await clearStagingFilters();
    return;
  }
  if (type === "source") {
    window.location.href = "./staging-review.html";
    return;
  }
  if (type === "search" && stagingSearchInput) stagingSearchInput.value = "";
  if (type === "status") statusFilter.value = "";
  if (type === "review") activeReviewFilter = "all";
  if (type === "column" && field) columnFilterController?.clearField(field, { silent: true });
  selectedRowIds.clear();
  setBulkStatus("");
  await loadRows();
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

    try {
      await saveStagingTableRow(tableRow);
    } catch (error) {
      setRowStatus(id, error.message, "error");
    }
    return;
  }

  const id = approve?.dataset.approveId || reject?.dataset.rejectId;
  if (!id) return;

  const button = approve || reject;
  const tableRow = button.closest("[data-row-id]");
  const patch = tableRow ? readInlinePatch(tableRow, approve ? "approved" : "rejected") : { status: approve ? "approved" : "rejected" };
  if (approve && tableRow) {
    const blockers = approvalBlockers(rowFromTablePatch(tableRow, patch));
    if (blockers.length) {
      applyInlineValidation(tableRow);
      setRowStatus(id, approvalBlockerMessage(blockers), "error");
      return;
    }
  }
  button.disabled = true;
  clearAutoSaveTimer(id);
  setRowStatus(id, approve ? "Approving..." : "Rejecting...");

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-approve-id], [data-reject-id]", "staging:approve"))) {
      throw new Error("Your role does not allow staging approval.");
    }
    await updateStagingRow(id, patch);
    await loadRows({ preservePage: true });
  } catch (error) {
    button.disabled = false;
    setRowStatus(id, error.message, "error");
  }
});

body.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  const tableRow = field.closest("[data-row-id]");
  markEditedCellDirty(field);
  applySuggestionFromField(tableRow, field.dataset.field, field.value);
  applyInlineValidation(tableRow);
  updateVisibleValidationMetric();
  markStagingRowDirty(tableRow);
  scheduleStagingAutoSave(tableRow);
});

body.addEventListener("change", (event) => {
  const field = event.target.closest("[data-field]");
  if (field) {
    const tableRow = field.closest("[data-row-id]");
    markEditedCellDirty(field);
    applySuggestionFromField(tableRow, field.dataset.field, field.value);
    applyInlineValidation(tableRow);
    updateVisibleValidationMetric();
    markStagingRowDirty(tableRow);
    scheduleStagingAutoSave(tableRow);
    return;
  }

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

body.addEventListener("focusout", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  scheduleStagingAutoSave(field.closest("[data-row-id]"), 200);
});

installSpreadsheetGrid({
  container: stagingTable || body,
  rowSelector: "[data-row-id]",
  cellSelector: "[data-field]",
  saveRow: saveStagingTableRow,
  onRowsChanged: (rows) => rows.forEach((row) => scheduleStagingAutoSave(row, 1000)),
  onGridMessage: (message) => setBulkStatus(message, "success"),
  onSelectionChange: setGridSelectionStatus
});
initLocationAutocomplete({
  container: body,
  inputSelector: "[data-location-field]",
  getOptions: () => stagingOptions.locations || [],
  onSelect: ({ input, option }) => {
    const tableRow = input.closest("[data-row-id]");
    const prefix = input.dataset.locationField;
    if (!tableRow || !prefix) return;
    applyLocationSuggestion(tableRow, prefix, locationOptionValue(option));
  }
});
locationMatchDrawerController = createLocationMatchDrawer({
  modeLabel: "Staging Review",
  getRows: () => currentRows,
  getLocations: () => stagingOptions.locations || [],
  getRowId: (tableRow) => tableRow?.dataset.rowId,
  readPatch: readInlinePatch,
  applyCandidate: (tableRow, prefix, option) => applyLocationSuggestion(tableRow, prefix, locationOptionValue(option)),
  markRowDirty: markStagingRowDirty,
  scheduleSave: scheduleStagingAutoSave,
  setMessage: setBulkStatus,
  saveAlias: saveLocationAlias,
  onAliasSaved: (location) => {
    if (!location?.id || stagingOptions.locations.some((option) => option.id === location.id)) return;
    stagingOptions.locations.push(location);
    renderDatalists();
  },
  onFindZip: async (tableRow) => {
    selectOnlyStagingRow(tableRow);
    await runBulkEnrichZips();
  },
  onRenormalize: async (tableRow) => {
    selectOnlyStagingRow(tableRow);
    await runBulkRenormalize();
  }
});

refreshButton.addEventListener("click", loadRows);
document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-action='load-staging-rows']");
  if (retryButton) loadRows();
});
if (stagingPageSizeSelect) stagingPageSizeSelect.value = String(stagingPageSize);
stagingFirstPageButton?.addEventListener("click", () => goToStagingPage(0));
stagingPrevPageButton?.addEventListener("click", () => goToStagingPage(stagingPageIndex - 1));
stagingNextPageButton?.addEventListener("click", () => goToStagingPage(stagingPageIndex + 1));
stagingLastPageButton?.addEventListener("click", () => goToStagingPage(Math.ceil(stagingTotalCount / stagingPageSize) - 1));
stagingPageSizeSelect?.addEventListener("change", () => setStagingPageSize(stagingPageSizeSelect.value));
stagingPageNumberInput?.addEventListener("change", () => goToStagingPage(Number(stagingPageNumberInput.value) - 1));
stagingPageNumberInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    goToStagingPage(Number(stagingPageNumberInput.value) - 1);
  }
});
clearFiltersButton?.addEventListener("click", clearStagingFilters);
activeFiltersStrip?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-staging-filter]");
  if (!button) return;
  removeStagingFilter(button.dataset.removeStagingFilter, button.dataset.filterField || "");
});
statusFilter.addEventListener("change", () => {
  selectedRowIds.clear();
  activeReviewFilter = "all";
  setBulkStatus("");
  loadRows();
});
reviewFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeReviewFilter = button.dataset.stagingFilter || "all";
    selectedRowIds.clear();
    setBulkStatus("");
    loadRows();
  });
});
stagingSearchInput?.addEventListener("input", () => {
  selectedRowIds.clear();
  setBulkStatus("");
  window.clearTimeout(stagingSearchTimer);
  stagingSearchTimer = window.setTimeout(loadRows, 250);
});
openSelectedDetailButton?.addEventListener("click", () => {
  const row = selectedRows()[0];
  if (row?.dataset.rowId) openEditDrawer(row.dataset.rowId);
});
selectAllCheckbox?.addEventListener("change", () => {
  visibleStagingCheckboxes().forEach((checkbox) => {
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
selectStagingPageButton?.addEventListener("click", () => setVisibleStagingSelection(true));
clearStagingSelectionButton?.addEventListener("click", () => setVisibleStagingSelection(false));
bulkSaveButton?.addEventListener("click", () => runBulkAction());
bulkMatchVendorsButton?.addEventListener("click", runBulkMatchVendors);
bulkApproveButton?.addEventListener("click", () => runBulkAction("approved"));
bulkRejectButton?.addEventListener("click", () => runBulkAction("rejected"));
bulkEnrichZipsButton?.addEventListener("click", runBulkEnrichZips);
bulkRenormalizeButton?.addEventListener("click", runBulkRenormalize);
bulkArchiveButton?.addEventListener("click", runBulkArchive);
bulkRemoveButton?.addEventListener("click", runBulkRemove);
bulkArchiveFilteredButton?.addEventListener("click", () => runFilteredStagingAction("archive"));
bulkRemoveFilteredButton?.addEventListener("click", () => runFilteredStagingAction("remove"));
bulkApproveFilteredButton?.addEventListener("click", () => runFilteredStagingUpdate({ status: "approved" }, "approve"));
bulkRejectFilteredButton?.addEventListener("click", () => runFilteredStagingUpdate({ status: "rejected" }, "reject"));
bulkFieldSelect?.addEventListener("change", updateBulkValueOptions);
applyBulkEditButton?.addEventListener("click", applySelectedBulkEdit);
applyBulkEditFilteredButton?.addEventListener("click", () => {
  const field = bulkFieldSelect?.value;
  if (!field) return;
  runFilteredStagingUpdate({ [field]: bulkPatchValue(field, bulkValueInput?.value) }, `set ${field}`);
});
body.addEventListener("click", (event) => {
  const matchButton = event.target.closest("[data-location-match-detail]");
  if (matchButton) {
    const tableRow = matchButton.closest("[data-row-id]");
    locationMatchDrawerController?.open(tableRow, matchButton.dataset.locationMatchDetail);
    return;
  }

  const actionButton = event.target.closest("[data-location-row-action]");
  if (!actionButton) return;
  const tableRow = actionButton.closest("[data-row-id]");
  if (!tableRow) return;
  selectOnlyStagingRow(tableRow);
  if (actionButton.dataset.locationRowAction === "enrich") runBulkEnrichZips();
  else runBulkRenormalize();
});
body.addEventListener("dblclick", (event) => {
  const locationCell = event.target.closest('td[data-col="origin"], td[data-col="destination"]');
  const locationRow = locationCell?.closest("[data-row-id]");
  if (locationCell && locationRow) {
    locationMatchDrawerController?.open(locationRow, locationCell.dataset.col);
    return;
  }

  if (event.target.closest("[data-field], button, a, select, input, textarea")) return;
  const tableRow = event.target.closest("[data-row-id]");
  if (tableRow?.dataset.rowId) openEditDrawer(tableRow.dataset.rowId);
});
columnVisibilityController = initColumnVisibility({
  table: stagingTable,
  menu: columnMenu,
  columns: SHEET_COLUMNS,
  storageKey: "rateware:staging:columns:v2",
  viewPresets: STAGING_VIEW_PRESETS,
  getExtraState: () => ({ pageSize: stagingPageSize }),
  applyExtraState: (extra = {}) => {
    const nextSize = Number(extra.pageSize);
    if (![50, 100, 200, 500].includes(nextSize) || nextSize === stagingPageSize) return;
    stagingPageSize = nextSize;
    writeStoredPageSize(STAGING_PAGE_SIZE_STORAGE_KEY, stagingPageSize);
    stagingPageIndex = 0;
    selectedRowIds.clear();
    setBulkStatus("");
    loadRows({ preservePage: true });
  }
});
columnFilterController = initSpreadsheetColumnFilters({
  table: stagingTable,
  columns: SHEET_COLUMNS,
  getRows: () => applyStagingTextSearch(applyReviewFilter(scopedStagingRows(loadedRows))),
  getValues: columnFilterValues,
  getMenuValues: stagingFilterMenuValues,
  scope: "staging",
  onChange: () => {
    selectedRowIds.clear();
    setBulkStatus("");
    loadRows();
  }
});
columnVisibilityController?.applyVisibility();
initDrawer({
  drawer: bulkDrawer,
  openButton: openBulkDrawerButton,
  closeButton: closeBulkDrawerButton
});
closeDrawerButton.addEventListener("click", () => drawer.classList.add("hidden"));
editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveActiveRow();
});
approveDrawerButton.addEventListener("click", () => saveActiveRow("approved"));
rejectDrawerButton.addEventListener("click", () => saveActiveRow("rejected"));

initAuthControls();
applyStagingUrlFilters();
requirePrivatePage().catch(() => {});
loadRows();
