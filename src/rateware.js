import { initAuthControls, requirePrivatePage } from "./auth.js";
import { createLocationMatchDrawer } from "./location-match-drawer.js";
import { archiveApprovedRatewareByFilter, bulkUpdateApprovedRatewareRows, createRatewareBookVersion, enrichApprovedRatewareLocationZips, fetchRatewareAudit, fetchRatewareBookVersion, fetchRatewareBookVersions, matchApprovedRatewareVendors, renormalizeApprovedRatewareRows, fetchApprovedRateware, fetchRatewareOptions, removeApprovedRatewareByFilter, returnApprovedRatesToStaging, saveLocationAlias, updateApprovedRatewareRow } from "./rateware-service.js";
import { initSpreadsheetColumnFilters } from "./spreadsheet-column-filters.js";
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
const openSelectedDetailButton = document.querySelector("#open-selected-rateware-detail");
const saveSelectedButton = document.querySelector("#save-selected-rateware");
const matchSelectedVendorsButton = document.querySelector("#match-selected-vendors-rateware");
const enrichSelectedZipsButton = document.querySelector("#enrich-selected-zips-rateware");
const renormalizeSelectedButton = document.querySelector("#renormalize-selected-rateware");
const returnSelectedButton = document.querySelector("#return-selected-button");
const exportSelectedButton = document.querySelector("#export-selected-button");
const exportVisibleButton = document.querySelector("#export-visible-button");
const exportClientVisibleButton = document.querySelector("#export-client-visible-button");
const exportRfxVisibleButton = document.querySelector("#export-rfx-visible-button");
const archiveFilteredButton = document.querySelector("#archive-filtered-rateware");
const removeFilteredButton = document.querySelector("#remove-filtered-rateware");
const actionStatus = document.querySelector("#rateware-action-status");
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

const RATEWARE_COLSPAN = 30;
let currentRows = [];
let loadedRows = [];
let activeQuickFilter = "all";
let ratewareQualityIndex = new Map();
const autoSaveTimers = new Map();
const FILTERED_BULK_BATCH_SIZE = 1000;
let columnVisibilityController;
let locationMatchDrawerController;
let columnFilterController;
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
  { key: "weekly_capacity", label: "Capacity" }
];
const COLUMN_PRESETS = [
  {
    name: "ratebook",
    label: "Rate book",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "quote_date", "rfx_id", "equipment", "trailer", "operation", "service", "currency", "weekly_capacity"]
  },
  {
    name: "normalization",
    label: "Normalization",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "origin_zip_prefix", "origin_state", "origin_market", "origin_region", "destination_zip_prefix", "destination_state", "destination_market", "destination_region", "mx_border_crossing_point", "us_border_crossing_point"]
  },
  {
    name: "finance",
    label: "Finance",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee", "currency", "weekly_capacity"]
  },
  {
    name: "source-audit",
    label: "Source audit",
    columns: ["select", "vendor", "origin", "destination", "all_in_rate", "quote_date", "rfx_id", "equipment", "trailer", "hazmat", "temperature_controlled", "operation", "service"]
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
    <input data-rateware-field="${prefix}_match_source" type="hidden" value="${escapeHtml(row[`${prefix}_match_source`] || "")}" />
    <input data-rateware-field="${prefix}_match_confidence" type="hidden" value="${escapeHtml(row[`${prefix}_match_confidence`] || "")}" />
    <input data-rateware-field="${prefix}_match_manual" type="hidden" value="${row[`${prefix}_match_manual`] ? "true" : "false"}" />
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
    <span class="location-cell-actions">
      <button class="location-chip ${escapeHtml(summary.tone)}" type="button" data-location-row-action="${escapeHtml(action)}" title="${escapeHtml(`${summary.title} | Click to ${action === "enrich" ? "find missing ZIPs" : "re-normalize this rate"}`)}">${escapeHtml(summary.label)}</button>
      <button class="location-match-button" type="button" data-location-match-detail="${escapeHtml(prefix)}" title="${escapeHtml(`Explain ${prefix} match and view catalog candidates`)}" aria-label="${escapeHtml(`Explain ${prefix} location match`)}">?</button>
    </span>
  `;
}

function rateValidationClass(row) {
  return !hasNumericValue(row.all_in_rate) && !hasSplitRate(row) ? "cell-invalid" : "cell-valid";
}

function inlineValidationIssues(row) {
  const issues = [];
  if (!hasNumericValue(row.all_in_rate) && !hasSplitRate(row)) issues.push({ tone: "danger", label: "rate", detail: "Needs numeric all-in or split rate" });
  if (/[a-z]/i.test(String(row.all_in_rate || ""))) issues.push({ tone: "warning", label: "text", detail: "All-in should be numeric only" });
  if ((hasNumericValue(row.all_in_rate) || hasSplitRate(row)) && !row.currency) issues.push({ tone: "warning", label: "currency", detail: "Currency missing" });
  if (!row.operation || !row.service) issues.push({ tone: "warning", label: "service", detail: "Operation or service missing" });
  return issues;
}

function renderInlineValidation(row) {
  const issues = inlineValidationIssues(row);
  if (!issues.length) return "";
  return `<span class="cell-validation-stack">${issues.slice(0, 3).map((issue) => `<span class="cell-validation-pill ${escapeHtml(issue.tone)}" title="${escapeHtml(issue.detail)}">${escapeHtml(issue.label)}</span>`).join("")}</span>`;
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

function comparableLocationKey(row, prefix) {
  return lookupKey([
    row[`${prefix}_zip_prefix`],
    row[`${prefix}_state`],
    row[`${prefix}_market`],
    row[`${prefix}_region`],
    row[`normalized_${prefix}`] || row[prefix]
  ].filter(Boolean).join(" "));
}

function normalizedCarrierKey(row) {
  return lookupKey(row.vendor_domain || row.vendors?.domain || row.vendors?.vendor_name || "");
}

function laneConflictKey(row) {
  return [
    comparableLocationKey(row, "origin"),
    comparableLocationKey(row, "destination"),
    lookupKey(row.operation || ""),
    lookupKey(row.service || ""),
    lookupKey(row.equipment || ""),
    lookupKey(row.trailer || ""),
    lookupKey(row.config || ""),
    row.hazmat ? "hazmat" : "standard",
    row.temperature_controlled ? "temp" : "ambient"
  ].join("|");
}

function duplicateConflictKey(row) {
  return [normalizedCarrierKey(row), laneConflictKey(row)].join("|");
}

function rateStats(rows = []) {
  const priced = rows
    .map((row) => ({ row, amount: numericValue(row.all_in_rate) }))
    .filter((item) => item.amount !== null && item.amount > 0)
    .sort((a, b) => a.amount - b.amount);
  const low = priced[0] || null;
  const high = priced[priced.length - 1] || null;
  const spread = low && high ? high.amount - low.amount : null;
  const spreadPercent = low && low.amount > 0 && spread !== null ? spread / low.amount : 0;
  const average = priced.length ? priced.reduce((sum, item) => sum + item.amount, 0) / priced.length : null;
  return {
    priced,
    pricedCount: priced.length,
    low,
    high,
    spread,
    spreadPercent,
    average
  };
}

function buildRatewareQualityIndex(rows = []) {
  const laneGroups = new Map();
  const duplicateGroups = new Map();
  rows.forEach((row) => {
    const laneKey = laneConflictKey(row);
    const duplicateKey = duplicateConflictKey(row);
    if (!laneGroups.has(laneKey)) laneGroups.set(laneKey, []);
    if (!duplicateGroups.has(duplicateKey)) duplicateGroups.set(duplicateKey, []);
    laneGroups.get(laneKey).push(row);
    duplicateGroups.get(duplicateKey).push(row);
  });

  const index = new Map();
  rows.forEach((row) => {
    const laneRows = laneGroups.get(laneConflictKey(row)) || [];
    const duplicateRows = duplicateGroups.get(duplicateConflictKey(row)) || [];
    const stats = rateStats(laneRows);
    const issues = [];
    if (duplicateRows.length > 1) {
      issues.push({
        type: "duplicate",
        label: "Duplicate",
        detail: `${duplicateRows.length} same-carrier rows`
      });
    }
    if (stats.pricedCount > 1 && stats.spreadPercent >= 0.15) {
      issues.push({
        type: "conflict",
        label: "Conflict",
        detail: `${Math.round(stats.spreadPercent * 100)}% lane spread`
      });
    }
    index.set(row.id, {
      issues,
      laneRows,
      duplicateRows,
      stats,
      hasIssue: issues.length > 0
    });
  });
  return index;
}

function ratewareQualityDetails(row) {
  return ratewareQualityIndex.get(row.id) || buildRatewareQualityIndex(loadedRows).get(row.id) || {
    issues: [],
    laneRows: [],
    duplicateRows: [],
    stats: rateStats([]),
    hasIssue: false
  };
}

function applyQuickFilter(rows = loadedRows) {
  if (activeQuickFilter === "cross-border") return rows.filter(isCrossBorder);
  if (activeQuickFilter === "all-in") return rows.filter((row) => hasNumericValue(row.all_in_rate) && !hasSplitRate(row));
  if (activeQuickFilter === "split-rate") return rows.filter(hasSplitRate);
  if (activeQuickFilter === "with-capacity") return rows.filter((row) => row.weekly_capacity);
  if (activeQuickFilter === "conflicts") return rows.filter((row) => ratewareQualityDetails(row).hasIssue);
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

function columnFilterValues(row, field) {
  if (field === "vendor") return [row.vendors?.vendor_name, row.vendor_domain, row.vendors?.domain].filter(Boolean);
  if (field === "origin") return [row.origin, row.normalized_origin, row.origin_city, row.origin_state, row.origin_zip_prefix, row.origin_market, row.origin_region, row.origin_country].filter(Boolean);
  if (field === "destination") return [row.destination, row.normalized_destination, row.destination_city, row.destination_state, row.destination_zip_prefix, row.destination_market, row.destination_region, row.destination_country].filter(Boolean);
  return [row[field]].filter(Boolean);
}

function applyColumnFilters(rows = loadedRows) {
  return columnFilterController?.apply(rows) || rows;
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
  const quality = ratewareQualityDetails(row);
  const duplicateIssue = quality.issues.find((issue) => issue.type === "duplicate");
  const conflictIssue = quality.issues.find((issue) => issue.type === "conflict");
  if (!hasNumericValue(row.all_in_rate) && !hasSplitRate(row)) return { tone: "danger", label: "Rate gap", detail: "No usable rate" };
  if (!row.origin_market || !row.destination_market) return { tone: "warning", label: "Location gap", detail: "Market missing" };
  if (duplicateIssue) return { tone: "warning", label: duplicateIssue.label, detail: duplicateIssue.detail };
  if (conflictIssue) return { tone: "warning", label: conflictIssue.label, detail: conflictIssue.detail };
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
  if (loadedRows.length) ratewareQualityIndex = buildRatewareQualityIndex(loadedRows);
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
        ${renderInlineValidation(row)}
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
    </tr>
  `).join("");
  columnVisibilityController?.applyVisibility();
  updateBulkControls();
}

function selectedVisibleIds() {
  return [...body.querySelectorAll("[data-select-rateware]:checked")].map((input) => input.dataset.selectRateware);
}

function selectOnlyRatewareRow(tableRow) {
  if (!tableRow?.dataset.ratewareId) return;
  selectedRowIds.clear();
  selectedRowIds.add(tableRow.dataset.ratewareId);
  body.querySelectorAll("[data-select-rateware]").forEach((checkbox) => {
    checkbox.checked = checkbox.dataset.selectRateware === tableRow.dataset.ratewareId;
  });
  updateBulkControls();
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
  ratewareQualityIndex = buildRatewareQualityIndex(loadedRows);
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
  if (openSelectedDetailButton) openSelectedDetailButton.disabled = selectedCount !== 1;
  if (openBulkDrawerButton) openBulkDrawerButton.disabled = selectedCount === 0;
  saveSelectedButton.disabled = selectedCount === 0;
  if (matchSelectedVendorsButton) matchSelectedVendorsButton.disabled = selectedCount === 0;
  if (enrichSelectedZipsButton) enrichSelectedZipsButton.disabled = selectedCount === 0;
  if (renormalizeSelectedButton) renormalizeSelectedButton.disabled = selectedCount === 0;
  returnSelectedButton.disabled = selectedCount === 0;
  if (exportSelectedButton) exportSelectedButton.disabled = selectedCount === 0;
  if (exportVisibleButton) exportVisibleButton.disabled = currentRows.length === 0;
  if (exportClientVisibleButton) exportClientVisibleButton.disabled = currentRows.length === 0;
  if (exportRfxVisibleButton) exportRfxVisibleButton.disabled = currentRows.length === 0;
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
  setDirtyRowCellsState(tableRow, "saving");
  setRowStatus(rowId, "Saving...");

  try {
    const updatedRow = await updateApprovedRatewareRow(rowId, readRatewarePatch(tableRow));
    replaceStoredRatewareRow(updatedRow);
    tableRow.classList.remove("dirty-row");
    setDirtyRowCellsState(tableRow, "saved");
    setRowStatus(rowId, "Saved", "success");
    return updatedRow;
  } catch (error) {
    setDirtyRowCellsState(tableRow, "error");
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

function trailerExportLabel(row) {
  const extras = [];
  if (row.hazmat) extras.push("Hazmat");
  if (row.temperature_controlled) extras.push("Reefer");
  return [row.trailer || "", extras.join(" ")].filter(Boolean).join(" - ");
}

function exportRateNotes(row) {
  const quality = ratewareQualityDetails(row);
  const notes = [];
  if (hasSplitRate(row)) notes.push("Split components quoted");
  if (!hasNumericValue(row.all_in_rate) && hasSplitRate(row)) notes.push("All-in not explicitly provided");
  quality.issues.forEach((issue) => notes.push(`${issue.label}: ${issue.detail}`));
  return notes.join("; ");
}

function exportRowValues(row, mode = "rateware") {
  const base = {
    vendor: row.vendors?.vendor_name || row.vendor_domain || "",
    vendorDomain: row.vendor_domain || row.vendors?.domain || "",
    quoteDate: dateValue(row.quote_date),
    rfx: row.rfx_id || "",
    origin: row.normalized_origin || row.origin || "",
    originZipState: [row.origin_zip_prefix, row.origin_state].filter(Boolean).join(" / "),
    originMarket: row.origin_market || "",
    originRegion: row.origin_region || "",
    destination: row.normalized_destination || row.destination || "",
    destinationZipState: [row.destination_zip_prefix, row.destination_state].filter(Boolean).join(" / "),
    destinationMarket: row.destination_market || "",
    destinationRegion: row.destination_region || "",
    operation: row.operation || "",
    service: row.service || "",
    equipment: row.equipment || "",
    trailer: trailerExportLabel(row),
    config: row.config || "",
    mxLinehaul: row.mx_linehaul || "",
    usLinehaul: row.us_linehaul || "",
    fsc: row.fsc || "",
    borderFee: row.border_crossing_fee || "",
    allIn: row.all_in_rate || "",
    currency: row.currency || "",
    weeklyCapacity: row.weekly_capacity || "",
    mxCrossing: row.mx_border_crossing_point || "",
    usCrossing: row.us_border_crossing_point || "",
    notes: exportRateNotes(row)
  };

  if (mode === "rfx") {
    return [
      base.rfx,
      base.origin,
      base.originZipState,
      base.originMarket,
      base.destination,
      base.destinationZipState,
      base.destinationMarket,
      base.operation,
      base.service,
      base.equipment,
      base.trailer,
      base.config,
      base.vendor,
      base.vendorDomain,
      base.allIn,
      base.currency,
      base.weeklyCapacity,
      base.mxCrossing,
      base.usCrossing,
      base.notes
    ];
  }

  if (mode === "client") {
    return [
      `${base.origin} -> ${base.destination}`,
      base.vendor,
      base.quoteDate,
      base.rfx,
      base.origin,
      base.originMarket,
      base.originRegion,
      base.destination,
      base.destinationMarket,
      base.destinationRegion,
      base.operation,
      base.service,
      base.equipment,
      base.trailer,
      base.allIn,
      base.currency,
      base.weeklyCapacity,
      base.mxCrossing,
      base.usCrossing
    ];
  }

  return [
    base.vendor,
    base.vendorDomain,
    base.quoteDate,
    base.rfx,
    base.origin,
    base.originZipState,
    base.originMarket,
    base.originRegion,
    base.destination,
    base.destinationZipState,
    base.destinationMarket,
    base.destinationRegion,
    base.operation,
    base.service,
    base.equipment,
    base.trailer,
    base.config,
    base.mxLinehaul,
    base.usLinehaul,
    base.fsc,
    base.borderFee,
    base.allIn,
    base.currency,
    base.weeklyCapacity,
    base.mxCrossing,
    base.usCrossing,
    base.notes
  ];
}

function exportHeaders(mode = "rateware") {
  if (mode === "rfx") {
    return [
      "RFx",
      "Origin",
      "Origin ZIP/ST",
      "Origin market",
      "Destination",
      "Destination ZIP/ST",
      "Destination market",
      "Operation",
      "Service",
      "Equipment",
      "Trailer",
      "Config",
      "Carrier",
      "Carrier domain",
      "All-in rate",
      "Currency",
      "Weekly capacity",
      "MX border city",
      "US border city",
      "Review notes"
    ];
  }

  if (mode === "client") {
    return [
      "Lane",
      "Carrier",
      "Quote date",
      "RFx",
      "Origin",
      "Origin market",
      "Origin region",
      "Destination",
      "Destination market",
      "Destination region",
      "Operation",
      "Service",
      "Equipment",
      "Trailer",
      "All-in rate",
      "Currency",
      "Weekly capacity",
      "MX border city",
      "US border city"
    ];
  }

  return [
    "Carrier",
    "Carrier domain",
    "Quote date",
    "RFx",
    "Origin",
    "Origin ZIP/ST",
    "Origin market",
    "Origin region",
    "Destination",
    "Destination ZIP/ST",
    "Destination market",
    "Destination region",
    "Operation",
    "Service",
    "Equipment",
    "Trailer",
    "Config",
    "MX linehaul",
    "US linehaul",
    "FSC",
    "Border fee",
    "All-in rate",
    "Currency",
    "Weekly capacity",
    "MX border city",
    "US border city",
    "Review notes"
  ];
}

function exportRowsCsv(rowsToExport, label, options = {}) {
  if (!rowsToExport.length) {
    setActionStatus(`No ${label} rates to export.`, "error");
    return;
  }

  const mode = options.mode || "rateware";
  const title = mode === "rfx" ? "Rateware RFx Export" : mode === "client" ? "Rateware Client Export" : "Rateware Export";
  const generatedAt = new Date().toISOString();
  const metadata = [
    [title],
    ["Scope", label],
    ["Generated", generatedAt],
    ["Rows", rowsToExport.length],
    []
  ];
  const headers = exportHeaders(mode);
  const rows = rowsToExport.map((row) => exportRowValues(row, mode));
  const csv = [...metadata, headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rateware-${mode}-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setActionStatus(`${rowsToExport.length} ${label} rate(s) exported.`, "success");
}

function exportVisibleCsv() {
  exportRowsCsv(currentRows, "visible", { mode: "rateware" });
}

function exportSelectedCsv() {
  const ids = new Set(selectedVisibleIds());
  exportRowsCsv(currentRows.filter((row) => ids.has(row.id)), "selected", { mode: "rateware" });
}

function exportVisibleClientCsv() {
  exportRowsCsv(currentRows, "visible", { mode: "client" });
}

function exportVisibleRfxCsv() {
  exportRowsCsv(currentRows, "visible", { mode: "rfx" });
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

function corridorLabel(row) {
  return [
    row.origin_market || row.origin_region || row.origin_state,
    row.destination_market || row.destination_region || row.destination_state
  ].filter(Boolean).join(" -> ") || "-";
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
    const spread = best && high ? high.amount - best.amount : null;
    const spreadPercent = best && spread !== null && best.amount > 0 ? spread / best.amount : 0;
    const [origin, destination, operation, service, equipment, trailer] = key.split(" | ");
    const bestOffers = priced.slice(0, 3).map((item) => ({
      carrier: carrierLabel(item.row),
      amount: item.amount,
      capacity: item.row.weekly_capacity || "-"
    }));
    return {
      key,
      origin,
      destination,
      corridor: corridorLabel(rows[0] || {}),
      operation,
      service,
      equipment,
      trailer,
      quotes: rows.length,
      carriers: carriers.size,
      bestCarrier: best ? carrierLabel(best.row) : "-",
      bestRate: best?.amount ?? null,
      average,
      spread,
      spreadPercent,
      isConflict: priced.length > 1 && spreadPercent >= 0.15,
      bestOffers
    };
  }).sort((a, b) => {
    if (Number(b.isConflict) !== Number(a.isConflict)) return Number(b.isConflict) - Number(a.isConflict);
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
          <th>Corridor</th>
          <th>Mode</th>
          <th>Carriers</th>
          <th>Best offers</th>
          <th>Range</th>
          <th>Signal</th>
        </tr>
      </thead>
      <tbody>
        ${topSummaries.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.origin)} -> ${escapeHtml(item.destination)}</strong></td>
            <td>${escapeHtml(item.corridor)}</td>
            <td>${escapeHtml([item.operation, item.service, item.equipment, item.trailer].filter(Boolean).join(" / "))}</td>
            <td>${escapeHtml(item.carriers)} / ${escapeHtml(item.quotes)} quotes</td>
            <td>
              <div class="comparison-offers">
                ${item.bestOffers.length ? item.bestOffers.map((offer) => `<span><strong>${escapeHtml(offer.carrier)}</strong> ${escapeHtml(moneyValue(offer.amount))} <em>${escapeHtml(offer.capacity)} / wk</em></span>`).join("") : "<span>-</span>"}
              </div>
            </td>
            <td>${escapeHtml(item.spread === null ? "-" : `${moneyValue(item.spread)} (${Math.round(item.spreadPercent * 100)}%)`)}</td>
            <td><span class="comparison-signal ${item.isConflict ? "warning" : "success"}">${escapeHtml(item.isConflict ? "Review spread" : "Usable")}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function activeFilterSummary(scope, ids) {
  return {
    scope,
    ids_count: ids.length,
    quick_filter: activeQuickFilter,
    search: searchInput.value || "",
    operation: operationFilter.value || "",
    service: serviceFilter.value || "",
    column_filters: columnFilterController?.serialized() || {}
  };
}

function activeRatewareBulkFilters() {
  return {
    quick_filter: activeQuickFilter,
    search: searchInput.value || "",
    operation: operationFilter.value || "",
    service: serviceFilter.value || "",
    column_filters: columnFilterController?.serialized() || {}
  };
}

function ratewareFilterSummaryLabel(filters) {
  const parts = [];
  if (filters.quick_filter && filters.quick_filter !== "all") parts.push(filters.quick_filter);
  if (filters.search) parts.push(`search "${filters.search}"`);
  if (filters.operation) parts.push(filters.operation);
  if (filters.service) parts.push(filters.service);
  const columnCount = Object.keys(filters.column_filters || {}).length;
  if (columnCount) parts.push(`${columnCount} column filter(s)`);
  return parts.join(", ") || "all approved Rateware rows";
}

function slug(value) {
  return String(value || "rateware")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "rateware";
}

function versionScopeLabel(version) {
  const summary = objectValue(version.filter_summary);
  const parts = [
    summary.scope,
    summary.quick_filter && summary.quick_filter !== "all" ? summary.quick_filter : "",
    summary.operation,
    summary.service,
    summary.search ? `search: ${summary.search}` : ""
  ].filter(Boolean);
  return parts.join(" | ") || "Approved snapshot";
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
        <span>${escapeHtml([dateValue(version.created_at), `${version.row_count || 0} rows`, versionScopeLabel(version)].filter(Boolean).join(" | "))}</span>
        ${version.description ? `<small>${escapeHtml(version.description)}</small>` : ""}
      </div>
      <div class="version-actions">
        <button class="secondary small-button" type="button" data-download-rateware-version="${escapeHtml(version.id)}" data-version-export-mode="client">Client CSV</button>
        <button class="secondary small-button" type="button" data-download-rateware-version="${escapeHtml(version.id)}" data-version-export-mode="rfx">RFx CSV</button>
      </div>
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

async function downloadRatewareVersion(id, mode = "client") {
  if (!id) return;
  setInlineStatus(versionStatus, "Preparing version export...");
  try {
    await requirePrivatePage();
    const version = await fetchRatewareBookVersion(id);
    exportRowsCsv(version.rows_snapshot || [], `version-${slug(version.name)}`, { mode });
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
  columnFilterController?.clear({ silent: true });
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
    ratewareQualityIndex = buildRatewareQualityIndex(rows);
    renderRows(visibleRatewareRows());
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${RATEWARE_COLSPAN}">Could not load Rateware. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function runFilteredRatewareAction(targetAction) {
  const isRemove = targetAction === "remove";
  const filters = activeRatewareBulkFilters();
  const service = isRemove ? removeApprovedRatewareByFilter : archiveApprovedRatewareByFilter;
  const label = isRemove ? "remove" : "archive";

  try {
    await requirePrivatePage();
    if (archiveFilteredButton) archiveFilteredButton.disabled = true;
    if (removeFilteredButton) removeFilteredButton.disabled = true;
    setActionStatus(`Counting approved rates for filtered ${label}...`);

    const preview = await service(filters, { dryRun: true });
    const matched = Number(preview.matched || 0);
    if (!matched) {
      setActionStatus(`No approved rates match: ${ratewareFilterSummaryLabel(filters)}.`, "warning");
      return;
    }

    const scope = ratewareFilterSummaryLabel(filters);
    if (isRemove) {
      const typed = window.prompt(`This will permanently remove ${matched} approved Rateware row(s) matching: ${scope}.\n\nType DELETE to continue.`);
      if (typed !== "DELETE") {
        setActionStatus("Filtered remove cancelled.", "warning");
        return;
      }
    } else if (!window.confirm(`Archive ${matched} approved Rateware row(s) matching: ${scope}?`)) {
      setActionStatus("Filtered archive cancelled.", "warning");
      return;
    }

    let affected = 0;
    let batch = 0;
    while (affected < matched) {
      batch += 1;
      setActionStatus(`${isRemove ? "Removing" : "Archiving"} filtered approved rates... ${affected.toLocaleString()} / ${matched.toLocaleString()}`);
      const result = await service(filters, { dryRun: false, maxRows: FILTERED_BULK_BATCH_SIZE });
      const count = Number(result.updated || result.removed || 0);
      if (!count) break;
      affected += count;
      setActionStatus(`${isRemove ? "Removed" : "Archived"} ${Math.min(affected, matched).toLocaleString()} / ${matched.toLocaleString()} filtered approved rates (${batch} batch${batch === 1 ? "" : "es"}).`);
      if (count < FILTERED_BULK_BATCH_SIZE) break;
    }
    selectedRowIds.clear();
    setActionStatus(`${affected.toLocaleString()} filtered approved rate(s) ${isRemove ? "removed" : "archived"}.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
  } finally {
    if (archiveFilteredButton) archiveFilteredButton.disabled = false;
    if (removeFilteredButton) removeFilteredButton.disabled = false;
    updateBulkControls();
  }
}

async function returnSelectedToStaging() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;
  const defaultReason = "Needs correction or re-review from Rateware Final";
  const reason = window.prompt("Reason for returning selected approved rates to staging:", defaultReason);
  if (reason === null) return;
  const cleanReason = String(reason || "").trim() || defaultReason;
  if (ids.length > 25 && !window.confirm(`Return ${ids.length} approved rates to staging?`)) return;

  returnSelectedButton.disabled = true;
  setActionStatus(`Returning ${ids.length} rates...`);

  try {
    await requirePrivatePage();
    const result = await returnApprovedRatesToStaging(ids, cleanReason);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.updated || ids.length} rates returned to staging. Reason: ${cleanReason}`, "success");
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
columnFilterController = initSpreadsheetColumnFilters({
  table: ratewareTable,
  columns: SHEET_COLUMNS,
  getRows: () => applyQuickFilter(loadedRows),
  getValues: columnFilterValues,
  scope: "rateware",
  onChange: () => {
    selectedRowIds.clear();
    setActionStatus("");
    renderRows(visibleRatewareRows());
  }
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
openSelectedDetailButton?.addEventListener("click", () => {
  const id = selectedVisibleIds()[0];
  if (id) openRatewareDrawer(id);
});
returnSelectedButton.addEventListener("click", returnSelectedToStaging);
saveSelectedButton?.addEventListener("click", saveSelectedRatewareRows);
matchSelectedVendorsButton?.addEventListener("click", matchSelectedRatewareVendors);
enrichSelectedZipsButton?.addEventListener("click", enrichSelectedRatewareZips);
renormalizeSelectedButton?.addEventListener("click", renormalizeSelectedRateware);
exportSelectedButton?.addEventListener("click", exportSelectedCsv);
exportVisibleButton?.addEventListener("click", exportVisibleCsv);
exportClientVisibleButton?.addEventListener("click", exportVisibleClientCsv);
exportRfxVisibleButton?.addEventListener("click", exportVisibleRfxCsv);
archiveFilteredButton?.addEventListener("click", () => runFilteredRatewareAction("archive"));
removeFilteredButton?.addEventListener("click", () => runFilteredRatewareAction("remove"));
body.addEventListener("click", (event) => {
  const matchButton = event.target.closest("[data-location-match-detail]");
  if (matchButton) {
    const tableRow = matchButton.closest("[data-rateware-id]");
    locationMatchDrawerController?.open(tableRow, matchButton.dataset.locationMatchDetail);
    return;
  }

  const actionButton = event.target.closest("[data-location-row-action]");
  if (!actionButton) return;
  const tableRow = actionButton.closest("[data-rateware-id]");
  if (!tableRow) return;
  selectOnlyRatewareRow(tableRow);
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
  downloadRatewareVersion(button.dataset.downloadRatewareVersion, button.dataset.versionExportMode || "client");
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
  markEditedCellDirty(field);
  applySuggestionFromField(tableRow, field.dataset.ratewareField, field.value);
  markRatewareRowDirty(tableRow);
  scheduleRatewareAutoSave(tableRow);
});
body.addEventListener("change", (event) => {
  const field = event.target.closest("[data-rateware-field]");
  if (field) {
    const tableRow = field.closest("[data-rateware-id]");
    markEditedCellDirty(field);
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
locationMatchDrawerController = createLocationMatchDrawer({
  modeLabel: "Rateware Final",
  getRows: () => currentRows,
  getLocations: () => ratewareOptions.locations || [],
  getRowId: (tableRow) => tableRow?.dataset.ratewareId,
  readPatch: readRatewarePatch,
  applyCandidate: (tableRow, prefix, option) => applyLocationSuggestion(tableRow, prefix, locationOptionValue(option)),
  markRowDirty: markRatewareRowDirty,
  scheduleSave: scheduleRatewareAutoSave,
  setMessage: setActionStatus,
  saveAlias: saveLocationAlias,
  onAliasSaved: (location) => {
    if (!location?.id || ratewareOptions.locations.some((option) => option.id === location.id)) return;
    ratewareOptions.locations.push(location);
    renderRatewareDatalists();
  },
  onFindZip: async (tableRow) => {
    selectOnlyRatewareRow(tableRow);
    await enrichSelectedRatewareZips();
  },
  onRenormalize: async (tableRow) => {
    selectOnlyRatewareRow(tableRow);
    await renormalizeSelectedRateware();
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
