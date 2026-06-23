import { initAuthControls, requirePrivatePage } from "./auth.js";
import { bulkUpdateApprovedRatewareRows, createRatewareBookVersion, enrichApprovedRatewareLocationZips, fetchRatewareAudit, fetchRatewareBookVersion, fetchRatewareBookVersions, matchApprovedRatewareVendors, renormalizeApprovedRatewareRows, fetchApprovedRateware, fetchRatewareOptions, returnApprovedRatesToStaging, updateApprovedRatewareRow } from "./rateware-service.js";
import { installSpreadsheetGrid } from "./spreadsheet-grid.js";
import { initColumnVisibility, initDrawer, initLocationAutocomplete } from "./sheet-ui.js";

const body = document.querySelector("#rateware-body");
const searchInput = document.querySelector("#rateware-search");
const operationFilter = document.querySelector("#rateware-operation-filter");
const serviceFilter = document.querySelector("#rateware-service-filter");
const refreshButton = document.querySelector("#refresh-rateware-button");
const clearFiltersButton = document.querySelector("#clear-rateware-filters");
const selectAllCheckbox = document.querySelector("#select-all-rateware");
const selectionCount = document.querySelector("#rateware-selection-count");
const saveSelectedButton = document.querySelector("#save-selected-rateware");
const matchSelectedVendorsButton = document.querySelector("#match-selected-vendors-rateware");
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
const bulkFieldSelect = document.querySelector("#rateware-bulk-field");
const bulkValueInput = document.querySelector("#rateware-bulk-value");
const bulkValueOptions = document.querySelector("#rateware-bulk-value-options");
const applyBulkEditButton = document.querySelector("#apply-rateware-bulk-edit");
const bulkStatus = document.querySelector("#rateware-bulk-status");
const openBulkDrawerButton = document.querySelector("#open-rateware-bulk-drawer");
const bulkDrawer = document.querySelector("#rateware-bulk-drawer");
const closeBulkDrawerButton = document.querySelector("#close-rateware-bulk-drawer");
const columnMenu = document.querySelector("#rateware-column-menu");
const columnPresetBar = document.querySelector("[data-rateware-column-presets]");
const ratewareTable = document.querySelector(".rateware-table");
const compareSelectedButton = document.querySelector("#compare-selected-rateware");
const compareVisibleButton = document.querySelector("#compare-visible-rateware");
const comparisonOutput = document.querySelector("#rateware-comparison-output");
const versionNameInput = document.querySelector("#rateware-version-name");
const versionNoteInput = document.querySelector("#rateware-version-note");
const snapshotSelectedButton = document.querySelector("#snapshot-selected-rateware");
const snapshotVisibleButton = document.querySelector("#snapshot-visible-rateware");
const versionList = document.querySelector("#rateware-version-list");
const versionStatus = document.querySelector("#rateware-version-status");
const gridSelectionStatus = document.querySelector("#rateware-grid-selection");

const RATEWARE_COLSPAN = 31;
let currentRows = [];
let loadedRows = [];
let activeQuickFilter = "all";
const autoSaveTimers = new Map();
let columnVisibilityController;
let ratewareOptions = {
  categories: {},
  vendors: [],
  locations: [],
  mx_crossings: [],
  us_crossings: [],
  currencies: ["USD", "MXN", "CAD"]
};
let ratewareOptionsLoaded = false;
const selectedRowIds = new Set();
const SHEET_COLUMNS = [
  { key: "select", label: "Select", locked: true },
  { key: "vendor", label: "Vendor", locked: true },
  { key: "origin", label: "Origin", locked: true },
  { key: "destination", label: "Destination", locked: true },
  { key: "all_in_rate", label: "All-in", locked: true },
  { key: "quote_date", label: "Quote date" },
  { key: "rfx_id", label: "RFx" },
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
  { key: "actions", label: "Actions", locked: true }
];
const COLUMN_PRESETS = [
  {
    name: "ratebook",
    label: "Rate book",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "quote_date", "rfx_id", "equipment", "trailer", "operation", "service", "currency", "weekly_capacity", "actions"]
  },
  {
    name: "normalization",
    label: "Normalization",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "origin_zip_prefix", "origin_state", "origin_market", "origin_region", "destination_zip_prefix", "destination_state", "destination_market", "destination_region", "mx_border_crossing_point", "us_border_crossing_point", "actions"]
  },
  {
    name: "finance",
    label: "Finance",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee", "currency", "weekly_capacity", "actions"]
  },
  {
    name: "source-audit",
    label: "Source audit",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "quote_date", "rfx_id", "equipment", "trailer", "hazmat", "temperature_controlled", "operation", "service", "actions"]
  }
];
const BULK_EDIT_FIELDS = [
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
  { field: "quote_date", label: "Quote date", type: "date" }
];

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

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
  return `<input class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}" type="${inputType}" value="${escapeHtml(value)}" ${options.list ? `list="${escapeHtml(options.list)}"` : ""} ${step ? `step="${escapeHtml(step)}"` : ""} ${options.money ? 'inputmode="decimal"' : ""} autocomplete="off" spellcheck="false" />`;
}

function optionList(values = [], currentValue = "") {
  const normalized = String(currentValue || "").trim();
  const options = normalized && !values.includes(normalized) ? [normalized, ...values] : values;
  return options.map((value) => `<option value="${escapeHtml(value)}" ${value === normalized ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function selectCell(row, field, values = [], options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  return `
    <select class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}" autocomplete="off">
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

function genericOptionValue(option) {
  return typeof option === "string" ? option : option.value || "";
}

function genericOptionLabel(option) {
  return typeof option === "string" ? "" : option.label || "";
}

function uniqueLocationValues(field) {
  return Array.from(new Set(ratewareOptions.locations.map((option) => option?.[field]).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function datalistOptions(values = []) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function hiddenLocationFields(row, prefix) {
  return `
    <input data-rateware-field="normalized_${prefix}" type="hidden" value="${escapeHtml(row[`normalized_${prefix}`] || "")}" />
    <input data-rateware-field="${prefix}_city" type="hidden" value="${escapeHtml(row[`${prefix}_city`] || "")}" />
    <input data-rateware-field="${prefix}_country" type="hidden" value="${escapeHtml(row[`${prefix}_country`] || "")}" />
    <input data-rateware-field="${prefix}_match_reason" type="hidden" value="${escapeHtml(row[`${prefix}_match_reason`] || "")}" />
  `;
}

function datalistCell(row, field, listName, options = {}) {
  const widthClass = options.wide ? "wide-input" : options.short ? "short-input" : "";
  const locationAttr = ["origin", "destination"].includes(field) ? `data-location-field="${field}"` : "";
  return `<input class="staging-input rateware-input ${widthClass}" data-rateware-field="${field}" ${locationAttr} list="${listName}" value="${escapeHtml(row[field] || "")}" autocomplete="off" spellcheck="false" />`;
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
    <datalist id="rateware-vendor-options">${ratewareOptions.vendors.map((option) => `<option value="${escapeHtml(genericOptionValue(option))}" label="${escapeHtml(genericOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="rateware-origin-options">${ratewareOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="rateware-destination-options">${ratewareOptions.locations.map((option) => `<option value="${escapeHtml(locationOptionValue(option))}" label="${escapeHtml(locationOptionLabel(option))}"></option>`).join("")}</datalist>
    <datalist id="rateware-zip-options">${datalistOptions(uniqueLocationValues("zip_prefix"))}</datalist>
    <datalist id="rateware-state-options">${datalistOptions(uniqueLocationValues("state_code"))}</datalist>
    <datalist id="rateware-market-options">${datalistOptions(uniqueLocationValues("market"))}</datalist>
    <datalist id="rateware-region-options">${datalistOptions(uniqueLocationValues("region"))}</datalist>
  `;
  document.body.appendChild(container);
}

function setInlineStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function fieldOptionValues(config) {
  if (config.type === "boolean") return ["yes", "no"];
  if (Array.isArray(config.values)) return config.values;
  if (config.source === "mx_crossings") return ratewareOptions.mx_crossings || [];
  if (config.source === "us_crossings") return ratewareOptions.us_crossings || [];
  if (config.source) return ratewareOptions.categories?.[config.source] || [];
  const values = currentRows.map((row) => row[config.field]).filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
}

function updateBulkValueOptions() {
  const config = BULK_EDIT_FIELDS.find((item) => item.field === bulkFieldSelect?.value) || BULK_EDIT_FIELDS[0];
  if (!bulkValueInput || !bulkValueOptions || !config) return;
  const values = fieldOptionValues(config);
  bulkValueOptions.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  bulkValueInput.type = config.type === "date" ? "date" : "text";
  bulkValueInput.placeholder = config.type === "boolean" ? "yes / no" : "Set selected rows...";
}

function populateBulkEditControls() {
  if (!bulkFieldSelect) return;
  const selected = bulkFieldSelect.value || BULK_EDIT_FIELDS[0]?.field;
  bulkFieldSelect.innerHTML = BULK_EDIT_FIELDS.map((item) => `<option value="${escapeHtml(item.field)}">${escapeHtml(item.label)}</option>`).join("");
  bulkFieldSelect.value = BULK_EDIT_FIELDS.some((item) => item.field === selected) ? selected : BULK_EDIT_FIELDS[0]?.field;
  updateBulkValueOptions();
}

function bulkPatchValue(field, rawValue) {
  const config = BULK_EDIT_FIELDS.find((item) => item.field === field);
  const value = String(rawValue ?? "").trim();
  if (config?.type === "boolean") return ["1", "true", "yes", "y", "x", "si", "sí"].includes(value.toLowerCase());
  return value;
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
  const scored = ratewareOptions.locations
    .map((option) => {
      const values = [
        locationOptionValue(option),
        locationOptionLabel(option),
        option.city,
        option.metro_city,
        option.raw_value,
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
  const input = tableRow?.querySelector(`[data-rateware-field="${CSS.escape(field)}"]`);
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
  return true;
}

function applySuggestionFromField(tableRow, field, value) {
  if (field === "origin" || field === "destination") return applyLocationSuggestion(tableRow, field, value);
  if (field === "origin_zip_prefix") return applyLocationSuggestion(tableRow, "origin", value);
  if (field === "destination_zip_prefix") return applyLocationSuggestion(tableRow, "destination", value);
  return false;
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

function locationValidationClass(row, prefix) {
  const matched = Boolean(row[`${prefix}_market`] || row[`${prefix}_zip_prefix`] || row[`${prefix}_state`] || row[`${prefix}_country`]);
  return matched ? "cell-valid" : "cell-warning";
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

function renderLocationCell(row, prefix, listName) {
  const summary = locationMatchSummary(row, prefix);
  const action = ["missing", "partial"].includes(summary.label) ? "enrich" : "renormalize";
  return `
    ${datalistCell(row, prefix, listName, { wide: true })}
    ${hiddenLocationFields(row, prefix)}
    <button class="location-chip ${escapeHtml(summary.tone)}" type="button" data-location-row-action="${escapeHtml(action)}" title="${escapeHtml(`${summary.title} | Click to ${action === "enrich" ? "find missing ZIPs" : "re-normalize this rate"}`)}">${escapeHtml(summary.label)}</button>
  `;
}

function rateValidationClass(row) {
  return !hasNumericValue(row.all_in_rate) && !hasSplitRate(row) ? "cell-invalid" : "cell-valid";
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

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rowAuditFlags(row) {
  return Array.isArray(row.audit_flags) ? row.audit_flags.map(String).filter(Boolean) : [];
}

function rowExtractionWarnings(row) {
  return Array.isArray(row.extraction_warnings) ? row.extraction_warnings.map(String).filter(Boolean) : [];
}

function sourceEvidence(row) {
  return objectValue(row.source_evidence);
}

function confidencePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`;
}

function approvedQualitySummary(row) {
  const flags = rowAuditFlags(row);
  const warnings = rowExtractionWarnings(row);
  if (!hasNumericValue(row.all_in_rate) && !hasSplitRate(row)) return { tone: "danger", label: "Rate gap", detail: "No usable rate" };
  if (!row.origin_market || !row.destination_market) return { tone: "warning", label: "Location gap", detail: "Market missing" };
  if (flags.length || warnings.length) return { tone: "warning", label: "Audit notes", detail: `${flags.length + warnings.length} note(s)` };
  return { tone: "success", label: "Approved", detail: "Ready to use" };
}

function approvedQualityClass(row) {
  const summary = approvedQualitySummary(row);
  if (summary.tone === "danger") return "needs-review";
  if (summary.tone === "warning") return "has-warning";
  return "";
}

function renderQualityStrip(row) {
  const quality = approvedQualitySummary(row);
  const evidence = sourceEvidence(row);
  const sourceLabel = evidence.source_filename || evidence.email_from || row.raw_upload_id || "Approved source";
  return `
    <div class="quality-strip ${escapeHtml(quality.tone)}">
      <span>${escapeHtml(quality.label)}</span>
      <small>${escapeHtml(quality.detail)}</small>
      <em title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</em>
    </div>
  `;
}

function renderSourceAudit(row) {
  const evidence = sourceEvidence(row);
  const confidence = objectValue(row.field_confidence);
  const flags = rowAuditFlags(row);
  const warnings = rowExtractionWarnings(row);
  const weakFields = Object.entries(confidence)
    .filter(([, value]) => Number(value) < 0.75)
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .slice(0, 10);

  return `
    <section class="rateware-detail-section">
      <h3>Source evidence</h3>
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

function governanceActionLabel(action) {
  if (action === "rateware.approve") return "Approved";
  if (action === "rateware.update") return "Edited";
  if (action === "rateware.bulk_update") return "Bulk edited";
  if (action === "rateware.return_to_staging") return "Returned";
  if (action === "rateware.snapshot") return "Snapshot";
  if (action === "staging.status_update") return "Status";
  return String(action || "Changed");
}

function governanceTone(action) {
  if (action === "rateware.approve" || action === "rateware.snapshot") return "success";
  if (action === "rateware.return_to_staging") return "warning";
  if (action === "rateware.update" || action === "rateware.bulk_update") return "neutral";
  return "muted";
}

function governanceMetadataLabel(metadata = {}) {
  const fields = Array.isArray(metadata.changed_fields) ? metadata.changed_fields.filter(Boolean) : [];
  if (metadata.prior_status || metadata.next_status) return `${metadata.prior_status || "-"} -> ${metadata.next_status || "-"}`;
  if (metadata.row_count) return `${metadata.row_count} row snapshot`;
  if (fields.length) return `Fields: ${fields.slice(0, 6).join(", ")}${fields.length > 6 ? "..." : ""}`;
  return "";
}

function renderGovernanceTimeline(rows = []) {
  if (!rows.length) return '<p class="muted-text">No governance events recorded for this rate yet.</p>';
  return rows.map((event) => {
    const metadata = objectValue(event.metadata);
    const metadataLabel = governanceMetadataLabel(metadata);
    return `
      <article>
        <span class="review-chip ${escapeHtml(governanceTone(event.action))}">${escapeHtml(governanceActionLabel(event.action))}</span>
        <div>
          <strong>${escapeHtml(event.summary || "Rateware changed")}</strong>
          <small>${escapeHtml([formatDate(event.created_at), event.actor_email || event.owner_email, metadataLabel].filter(Boolean).join(" | "))}</small>
        </div>
      </article>
    `;
  }).join("");
}

async function loadRatewareGovernance(rowId) {
  const target = ratewareDetail?.querySelector(`[data-rateware-governance="${CSS.escape(rowId)}"]`);
  if (!target) return;
  target.innerHTML = '<p class="muted-text">Loading governance timeline...</p>';
  try {
    const rows = await fetchRatewareAudit(rowId);
    target.innerHTML = renderGovernanceTimeline(rows);
  } catch (error) {
    target.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
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
    <section class="rateware-detail-section">
      <h3>Governance timeline</h3>
      <div class="rateware-governance-timeline" data-rateware-governance="${escapeHtml(row.id)}">
        <p class="muted-text">Loading governance timeline...</p>
      </div>
    </section>
    ${renderSourceAudit(row)}
  `;
  drawer.classList.remove("hidden");
  loadRatewareGovernance(row.id);
}

function renderRows(rows) {
  currentRows = rows;
  updateQuickFilters();
  updateRatewareMetrics(rows);
  populateFilter(operationFilter, rows, "operation");
  populateFilter(serviceFilter, rows, "service");
  updateBulkValueOptions();

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${RATEWARE_COLSPAN}"><div class="empty-state"><strong>No approved rates yet</strong><span>Approve staging rows to build the Rateware.</span><a href="./staging-review.html">Open staging review</a></div></td></tr>`;
    columnVisibilityController?.applyVisibility();
    updateBulkControls();
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr class="${escapeHtml(approvedQualityClass(row))}" data-rateware-id="${escapeHtml(row.id)}">
      <td class="select-column" data-col="select">
        <input data-select-rateware="${escapeHtml(row.id)}" type="checkbox" aria-label="Select approved rate" ${selectedRowIds.has(row.id) ? "checked" : ""} />
      </td>
      <td data-col="vendor">
        <strong>${escapeHtml(row.vendors?.vendor_name || row.vendor_domain || "-")}</strong>
        ${inputCell(row, "vendor_domain", { wide: true, list: "rateware-vendor-options" })}
        ${row.vendors?.vendor_name ? `<span class="match-pill">${escapeHtml(row.vendors.base_stage || "matched")}</span>` : ""}
        ${renderQualityStrip(row)}
      </td>
      <td class="${escapeHtml(locationValidationClass(row, "origin"))}" data-col="origin" title="${escapeHtml(locationMatchSummary(row, "origin").title)}">${renderLocationCell(row, "origin", "rateware-origin-options")}</td>
      <td class="${escapeHtml(locationValidationClass(row, "destination"))}" data-col="destination" title="${escapeHtml(locationMatchSummary(row, "destination").title)}">${renderLocationCell(row, "destination", "rateware-destination-options")}</td>
      <td class="rate-freeze-cell ${escapeHtml(rateValidationClass(row))}" data-col="all_in_rate" title="${escapeHtml(rateValidationClass(row) === "cell-invalid" ? "Needs numeric all-in or split rate" : "Numeric rate present")}">
        ${inputCell(row, "all_in_rate", { money: true })}
        <span>${escapeHtml(rateModeLabel(row))}</span>
        <span class="row-save-status" data-rateware-row-status="${escapeHtml(row.id)}"></span>
      </td>
      <td data-col="quote_date">${inputCell(row, "quote_date", { type: "date", short: true })}</td>
      <td data-col="rfx_id">${inputCell(row, "rfx_id", { short: true })}</td>
      <td data-col="origin_zip_prefix">${inputCell(row, "origin_zip_prefix", { short: true, list: "rateware-zip-options" })}</td>
      <td data-col="origin_state">${inputCell(row, "origin_state", { short: true, list: "rateware-state-options" })}</td>
      <td data-col="origin_market">${inputCell(row, "origin_market", { wide: true, list: "rateware-market-options" })}</td>
      <td data-col="origin_region">${inputCell(row, "origin_region", { wide: true, list: "rateware-region-options" })}</td>
      <td data-col="destination_zip_prefix">${inputCell(row, "destination_zip_prefix", { short: true, list: "rateware-zip-options" })}</td>
      <td data-col="destination_state">${inputCell(row, "destination_state", { short: true, list: "rateware-state-options" })}</td>
      <td data-col="destination_market">${inputCell(row, "destination_market", { wide: true, list: "rateware-market-options" })}</td>
      <td data-col="destination_region">${inputCell(row, "destination_region", { wide: true, list: "rateware-region-options" })}</td>
      <td data-col="equipment">${selectCell(row, "equipment", ratewareOptions.categories.equipment || [], { short: true })}</td>
      <td data-col="trailer">${selectCell(row, "trailer", ratewareOptions.categories.trailer || [], { short: true })}</td>
      <td data-col="hazmat">${checkboxCell(row, "hazmat", "Hazmat")}</td>
      <td data-col="temperature_controlled">${checkboxCell(row, "temperature_controlled", "Temperature controlled")}</td>
      <td data-col="config">${selectCell(row, "config", ratewareOptions.categories.config || [], { short: true })}</td>
      <td data-col="operation">${selectCell(row, "operation", ratewareOptions.categories.operation || [], { short: true })}</td>
      <td data-col="service">${selectCell(row, "service", ratewareOptions.categories.service || [], { short: true })}</td>
      <td data-col="mx_border_crossing_point">${selectCell(row, "mx_border_crossing_point", ratewareOptions.mx_crossings || [], { short: true })}</td>
      <td data-col="us_border_crossing_point">${selectCell(row, "us_border_crossing_point", ratewareOptions.us_crossings || [], { short: true })}</td>
      <td data-col="mx_linehaul">${inputCell(row, "mx_linehaul", { money: true })}</td>
      <td data-col="us_linehaul">${inputCell(row, "us_linehaul", { money: true })}</td>
      <td data-col="fsc">${inputCell(row, "fsc", { money: true })}</td>
      <td data-col="border_crossing_fee">${inputCell(row, "border_crossing_fee", { money: true })}</td>
      <td data-col="currency">${selectCell(row, "currency", ratewareOptions.currencies || ["USD", "MXN", "CAD"], { short: true })}</td>
      <td data-col="weekly_capacity">${inputCell(row, "weekly_capacity", { short: true })}</td>
      <td class="history-actions rateware-row-actions" data-col="actions">
        <button class="small-button secondary" type="button" data-rateware-detail="${escapeHtml(row.id)}">Evidence</button>
        <button class="small-button" type="button" data-save-rateware-id="${escapeHtml(row.id)}">Save</button>
        <a class="link-button" href="./staging-review.html">Staging row</a>
      </td>
    </tr>
  `).join("");
  columnVisibilityController?.applyVisibility();
  updateBulkControls();
}

function selectedVisibleIds() {
  return [...body.querySelectorAll("[data-select-rateware]:checked")].map((input) => input.dataset.selectRateware);
}

function setActionStatus(message, tone = "neutral") {
  actionStatus.textContent = message;
  actionStatus.dataset.tone = tone;
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
  if (openBulkDrawerButton) openBulkDrawerButton.disabled = selectedCount === 0;
  saveSelectedButton.disabled = selectedCount === 0;
  if (matchSelectedVendorsButton) matchSelectedVendorsButton.disabled = selectedCount === 0;
  if (enrichSelectedZipsButton) enrichSelectedZipsButton.disabled = selectedCount === 0;
  if (renormalizeSelectedButton) renormalizeSelectedButton.disabled = selectedCount === 0;
  returnSelectedButton.disabled = selectedCount === 0;
  if (exportSelectedButton) exportSelectedButton.disabled = selectedCount === 0;
  if (exportVisibleButton) exportVisibleButton.disabled = currentRows.length === 0;
  if (applyBulkEditButton) applyBulkEditButton.disabled = selectedCount === 0;
  if (compareSelectedButton) compareSelectedButton.disabled = selectedCount === 0;
  if (compareVisibleButton) compareVisibleButton.disabled = currentRows.length === 0;
  if (snapshotSelectedButton) snapshotSelectedButton.disabled = selectedCount === 0;
  if (snapshotVisibleButton) snapshotVisibleButton.disabled = currentRows.length === 0;
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

function selectedRatewareRows() {
  const ids = new Set(selectedVisibleIds());
  return currentRows.filter((row) => ids.has(row.id));
}

function carrierLabel(row) {
  return row.vendors?.vendor_name || row.vendor_domain || row.vendors?.domain || "-";
}

function comparisonKey(row) {
  return [
    row.normalized_origin || row.origin || "-",
    row.normalized_destination || row.destination || "-",
    row.operation || "-",
    row.service || "-",
    row.equipment || "-",
    row.trailer || "-"
  ].join(" | ");
}

function summarizeComparisonRows(rowsToCompare) {
  const groups = new Map();
  rowsToCompare.forEach((row) => {
    const key = comparisonKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([key, rows]) => {
    const priced = rows
      .map((row) => ({ row, amount: numericValue(row.all_in_rate) }))
      .filter((item) => item.amount !== null && item.amount > 0)
      .sort((a, b) => a.amount - b.amount);
    const carriers = new Set(rows.map(carrierLabel).filter(Boolean));
    const best = priced[0];
    const high = priced[priced.length - 1];
    const average = priced.length ? priced.reduce((sum, item) => sum + item.amount, 0) / priced.length : null;
    const [origin, destination, operation, service, equipment, trailer] = key.split(" | ");
    return {
      key,
      origin,
      destination,
      operation,
      service,
      equipment,
      trailer,
      quotes: rows.length,
      carriers: carriers.size,
      bestCarrier: best ? carrierLabel(best.row) : "-",
      bestRate: best?.amount ?? null,
      average,
      spread: best && high ? high.amount - best.amount : null
    };
  }).sort((a, b) => {
    if (b.carriers !== a.carriers) return b.carriers - a.carriers;
    return (a.bestRate ?? Number.MAX_VALUE) - (b.bestRate ?? Number.MAX_VALUE);
  });
}

function renderLaneComparison(rowsToCompare, label) {
  if (!comparisonOutput) return;
  if (!rowsToCompare.length) {
    comparisonOutput.innerHTML = "<span>No rows available for comparison.</span>";
    return;
  }

  const summaries = summarizeComparisonRows(rowsToCompare);
  const topSummaries = summaries.slice(0, 12);
  comparisonOutput.innerHTML = `
    <div class="comparison-summary">
      <strong>${escapeHtml(rowsToCompare.length)} ${escapeHtml(label)} rate(s)</strong>
      <span>${escapeHtml(summaries.length)} comparable lane group(s)</span>
    </div>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Lane</th>
          <th>Scope</th>
          <th>Carriers</th>
          <th>Best carrier</th>
          <th>Best all-in</th>
          <th>Avg</th>
          <th>Spread</th>
        </tr>
      </thead>
      <tbody>
        ${topSummaries.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.origin)} -> ${escapeHtml(item.destination)}</strong></td>
            <td>${escapeHtml([item.operation, item.service, item.equipment, item.trailer].filter(Boolean).join(" / "))}</td>
            <td>${escapeHtml(item.carriers)} / ${escapeHtml(item.quotes)} quotes</td>
            <td>${escapeHtml(item.bestCarrier)}</td>
            <td>${escapeHtml(item.bestRate === null ? "-" : moneyValue(item.bestRate))}</td>
            <td>${escapeHtml(item.average === null ? "-" : moneyValue(item.average))}</td>
            <td>${escapeHtml(item.spread === null ? "-" : moneyValue(item.spread))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function activeFilterSummary(scope, ids) {
  const columnFilters = {};
  columnFilterInputs.forEach((input) => {
    const value = String(input.value || "").trim();
    if (value) columnFilters[input.dataset.ratewareColumnFilter] = value;
  });
  return {
    scope,
    ids_count: ids.length,
    quick_filter: activeQuickFilter,
    search: searchInput.value || "",
    operation: operationFilter.value || "",
    service: serviceFilter.value || "",
    column_filters: columnFilters
  };
}

function slug(value) {
  return String(value || "rateware")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "rateware";
}

function renderRatewareVersions(rows = []) {
  if (!versionList) return;
  if (!rows.length) {
    versionList.innerHTML = "<span>No snapshots yet.</span>";
    return;
  }
  versionList.innerHTML = rows.map((version) => `
    <article>
      <div>
        <strong>${escapeHtml(version.name)}</strong>
        <span>${escapeHtml([dateValue(version.created_at), `${version.row_count || 0} rows`].filter(Boolean).join(" | "))}</span>
      </div>
      <button class="secondary small-button" type="button" data-download-rateware-version="${escapeHtml(version.id)}">Export CSV</button>
    </article>
  `).join("");
}

async function loadRatewareVersions() {
  try {
    await requirePrivatePage();
    const versions = await fetchRatewareBookVersions();
    renderRatewareVersions(versions);
  } catch (error) {
    setInlineStatus(versionStatus, error.message, "error");
  }
}

async function createRatewareVersion(scope) {
  const rows = scope === "selected" ? selectedRatewareRows() : currentRows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) {
    setInlineStatus(versionStatus, `No ${scope} rows to snapshot.`, "error");
    return;
  }

  const button = scope === "selected" ? snapshotSelectedButton : snapshotVisibleButton;
  if (button) button.disabled = true;
  setInlineStatus(versionStatus, `Creating ${scope} snapshot...`);

  try {
    await requirePrivatePage();
    const version = await createRatewareBookVersion({
      ids,
      name: versionNameInput?.value || `Rateware ${scope} ${new Date().toISOString().slice(0, 10)}`,
      description: versionNoteInput?.value || "",
      filterSummary: activeFilterSummary(scope, ids)
    });
    setInlineStatus(versionStatus, `${version.row_count || ids.length} rate(s) saved in ${version.name}.`, "success");
    await loadRatewareVersions();
  } catch (error) {
    setInlineStatus(versionStatus, error.message, "error");
  } finally {
    updateBulkControls();
  }
}

async function downloadRatewareVersion(id) {
  if (!id) return;
  setInlineStatus(versionStatus, "Preparing version export...");
  try {
    await requirePrivatePage();
    const version = await fetchRatewareBookVersion(id);
    exportRowsCsv(version.rows_snapshot || [], `version-${slug(version.name)}`);
    setInlineStatus(versionStatus, `${version.name} exported.`, "success");
  } catch (error) {
    setInlineStatus(versionStatus, error.message, "error");
  }
}

async function applySelectedBulkEdit() {
  const ids = selectedVisibleIds();
  const field = bulkFieldSelect?.value;
  if (!ids.length || !field) return;

  const patch = { [field]: bulkPatchValue(field, bulkValueInput?.value) };
  if (applyBulkEditButton) applyBulkEditButton.disabled = true;
  setInlineStatus(bulkStatus, `Updating ${ids.length} selected rate(s)...`);

  try {
    await requirePrivatePage();
    const result = await bulkUpdateApprovedRatewareRows(ids, patch);
    ids.forEach((id) => selectedRowIds.delete(id));
    setInlineStatus(bulkStatus, `${result.updated || 0} selected rate(s) updated.`, "success");
    setActionStatus(`${result.updated || 0} selected rate(s) updated.`, "success");
    await loadRateware();
  } catch (error) {
    setInlineStatus(bulkStatus, error.message, "error");
    updateBulkControls();
  }
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

async function matchSelectedRatewareVendors() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;

  if (matchSelectedVendorsButton) matchSelectedVendorsButton.disabled = true;
  setActionStatus(`Matching vendors for ${ids.length} approved rate(s)...`);

  try {
    await requirePrivatePage();
    const result = await matchApprovedRatewareVendors(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.updated || 0} approved rate(s) linked to vendors.`, "success");
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
      vendors: options.vendors || [],
      locations: options.locations || [],
      mx_crossings: options.mx_crossings || [],
      us_crossings: options.us_crossings || [],
      currencies: options.currencies || ["USD", "MXN", "CAD"]
    };
  } catch {
    ratewareOptions = {
      categories: ratewareOptions.categories || {},
      vendors: ratewareOptions.vendors || [],
      locations: ratewareOptions.locations || [],
      mx_crossings: ratewareOptions.mx_crossings || [],
      us_crossings: ratewareOptions.us_crossings || [],
      currencies: ratewareOptions.currencies || ["USD", "MXN", "CAD"]
    };
  }
  ratewareOptionsLoaded = true;
  renderRatewareDatalists();
  populateBulkEditControls();
  return ratewareOptions;
}

columnVisibilityController = initColumnVisibility({
  table: ratewareTable,
  menu: columnMenu,
  columns: SHEET_COLUMNS,
  storageKey: "rateware:approved:columns",
  presets: COLUMN_PRESETS,
  presetContainer: columnPresetBar,
  defaultPreset: "ratebook"
});
initDrawer({
  drawer: bulkDrawer,
  openButton: openBulkDrawerButton,
  closeButton: closeBulkDrawerButton
});

initAuthControls();
requirePrivatePage().catch(() => {});
loadRateware();
loadRatewareVersions();

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
matchSelectedVendorsButton?.addEventListener("click", matchSelectedRatewareVendors);
enrichSelectedZipsButton?.addEventListener("click", enrichSelectedRatewareZips);
renormalizeSelectedButton?.addEventListener("click", renormalizeSelectedRateware);
exportSelectedButton?.addEventListener("click", exportSelectedCsv);
exportVisibleButton?.addEventListener("click", exportVisibleCsv);
body.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-location-row-action]");
  if (!actionButton) return;
  const tableRow = actionButton.closest("[data-rateware-id]");
  if (!tableRow) return;
  selectedRowIds.clear();
  selectedRowIds.add(tableRow.dataset.ratewareId);
  body.querySelectorAll("[data-select-rateware]").forEach((checkbox) => {
    checkbox.checked = checkbox.dataset.selectRateware === tableRow.dataset.ratewareId;
  });
  updateBulkControls();
  if (actionButton.dataset.locationRowAction === "enrich") enrichSelectedRatewareZips();
  else renormalizeSelectedRateware();
});
bulkFieldSelect?.addEventListener("change", updateBulkValueOptions);
applyBulkEditButton?.addEventListener("click", applySelectedBulkEdit);
compareSelectedButton?.addEventListener("click", () => renderLaneComparison(selectedRatewareRows(), "selected"));
compareVisibleButton?.addEventListener("click", () => renderLaneComparison(currentRows, "visible"));
snapshotSelectedButton?.addEventListener("click", () => createRatewareVersion("selected"));
snapshotVisibleButton?.addEventListener("click", () => createRatewareVersion("visible"));
versionList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-download-rateware-version]");
  if (!button) return;
  downloadRatewareVersion(button.dataset.downloadRatewareVersion);
});
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
  applySuggestionFromField(tableRow, field.dataset.ratewareField, field.value);
  markRatewareRowDirty(tableRow);
  scheduleRatewareAutoSave(tableRow);
});
body.addEventListener("change", (event) => {
  const field = event.target.closest("[data-rateware-field]");
  if (field) {
    const tableRow = field.closest("[data-rateware-id]");
    applySuggestionFromField(tableRow, field.dataset.ratewareField, field.value);
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
  onRowsChanged: (rows) => rows.forEach((row) => scheduleRatewareAutoSave(row, 1000)),
  onGridMessage: (message) => setActionStatus(message, "success"),
  onSelectionChange: setGridSelectionStatus
});
initLocationAutocomplete({
  container: body,
  inputSelector: "[data-location-field]",
  getOptions: () => ratewareOptions.locations || [],
  onSelect: ({ input, option }) => {
    const tableRow = input.closest("[data-rateware-id]");
    const prefix = input.dataset.locationField;
    if (!tableRow || !prefix) return;
    applyLocationSuggestion(tableRow, prefix, locationOptionValue(option));
  }
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
