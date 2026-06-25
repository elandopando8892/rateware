import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  archiveCatalogValue,
  archiveLocationCatalogValue,
  bulkImportCatalogValues,
  fetchCatalogValues,
  fetchLocationCatalogValues,
  saveCatalogValue,
  saveLocationCatalogValue,
  syncRatewareCatalog
} from "./catalog-service.js";
import { fetchApprovedRatewarePage, updateApprovedRatewareRow } from "./rateware-service.js";
import { fetchStagingOptions, fetchStagingPage, saveLocationAlias, updateStagingRow } from "./staging-service.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";

const rowsChecked = document.querySelector("#catalog-rows-checked");
const gapCount = document.querySelector("#catalog-gap-count");
const pendingCount = document.querySelector("#catalog-pending-count");
const approvedCount = document.querySelector("#catalog-approved-count");
const body = document.querySelector("#catalog-workbench-body");
const statusMessage = document.querySelector("#catalog-workbench-status");
const sideFilter = document.querySelector("#catalog-side-filter");
const statusFilter = document.querySelector("#catalog-status-filter");
const viewModeSelect = document.querySelector("#catalog-view-mode");
const searchInput = document.querySelector("#catalog-search");
const refreshButton = document.querySelector("#refresh-catalog-workbench");
const syncButton = document.querySelector("#sync-catalog-button");
const catalogValueForm = document.querySelector("#catalog-value-form");
const catalogImportFileInput = document.querySelector("#catalog-import-file");
const catalogImportTypeSelect = document.querySelector("#catalog-import-type");
const catalogImportDefaultCountry = document.querySelector("#catalog-import-default-country");
const catalogImportDefaultCategory = document.querySelector("#catalog-import-default-category");
const catalogImportSheetSelect = document.querySelector("#catalog-import-sheet");
const catalogImportMapTitle = document.querySelector("#catalog-import-map-title");
const catalogImportMapFields = document.querySelector("#catalog-import-map-fields");
const catalogImportStatus = document.querySelector("#catalog-import-status");
const catalogImportSummary = document.querySelector("#catalog-import-summary");
const catalogImportPreviewHead = document.querySelector("#catalog-import-preview-head");
const catalogImportPreviewBody = document.querySelector("#catalog-import-preview-body");
const previewCatalogImportButton = document.querySelector("#preview-catalog-import");
const confirmCatalogImportButton = document.querySelector("#confirm-catalog-import");
const resetCatalogImportButton = document.querySelector("#reset-catalog-import");
const catalogImportStepItems = document.querySelectorAll("[data-catalog-import-step]");
const catalogCategorySelect = document.querySelector("#catalog-category");
const catalogCategoryFilter = document.querySelector("#catalog-category-filter");
const catalogRawValueInput = document.querySelector("#catalog-raw-value");
const catalogNormalizedValueInput = document.querySelector("#catalog-normalized-value");
const catalogCodeInput = document.querySelector("#catalog-code");
const catalogNoteInput = document.querySelector("#catalog-note");
const catalogStatus = document.querySelector("#catalog-status");
const catalogValuesBody = document.querySelector("#catalog-values-body");
const refreshCatalogButton = document.querySelector("#refresh-catalog-values");
const locationCatalogForm = document.querySelector("#location-catalog-form");
const locationCatalogStatus = document.querySelector("#location-catalog-status");
const locationCatalogBody = document.querySelector("#location-catalog-body");
const refreshLocationCatalogButton = document.querySelector("#refresh-location-catalog");
const adminLocationCountryFilter = document.querySelector("#admin-location-country-filter");
const adminLocationStateFilter = document.querySelector("#admin-location-state-filter");
const adminLocationMarketFilter = document.querySelector("#admin-location-market-filter");
const adminLocationRegionFilter = document.querySelector("#admin-location-region-filter");
const adminLocationSearchInput = document.querySelector("#admin-location-search");
const clearAdminLocationFiltersButton = document.querySelector("#clear-admin-location-filters");
const countryFilter = document.querySelector("#catalog-country-filter");
const stateFilter = document.querySelector("#catalog-state-filter");
const marketFilter = document.querySelector("#catalog-market-filter");
const regionFilter = document.querySelector("#catalog-region-filter");
const locationSearchInput = document.querySelector("#catalog-location-search");
const clearLocationFiltersButton = document.querySelector("#clear-catalog-location-filters");
const inspectorTitle = document.querySelector("#catalog-inspector-title");
const inspectorBody = document.querySelector("#catalog-inspector-body");
initWorkbenchTabs({ defaultView: "import" });

const locationInputs = {
  country: document.querySelector("#location-country"),
  raw_value: document.querySelector("#location-raw-value"),
  zip_prefix: document.querySelector("#location-zip-prefix"),
  city: document.querySelector("#location-city"),
  state_code: document.querySelector("#location-state-code"),
  state_name: document.querySelector("#location-state-name"),
  metro_city: document.querySelector("#location-metro-city"),
  market: document.querySelector("#location-market"),
  region: document.querySelector("#location-region"),
  note: document.querySelector("#location-note")
};

const MX_STATE_CODES = new Set([
  "AG", "BC", "BS", "CH", "CL", "CM", "CO", "CS", "CU", "DF", "DG", "EM", "GT", "GR", "HG", "JA", "MI", "MO", "MX", "NA", "NL", "OA", "PU", "QE", "QR", "SI", "SL", "SO", "TB", "TL", "TM", "VE", "YU", "ZA"
]);
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"
]);
const CA_PROVINCE_CODES = new Set(["AB", "BC", "MB", "NB", "NL", "NF", "NS", "NT", "NU", "ON", "PE", "PQ", "QC", "SK", "YT"]);
const MX_CITY_HINTS = [
  "ACAPULCO", "ACUNA", "AGUASCALIENTES", "APODACA", "ARTEAGA", "CELAYA", "CHIHUAHUA", "CIUDAD JUAREZ", "CD JUAREZ", "COATZACOALCOS", "CUAUTITLAN", "CULIACAN", "ESCOBEDO", "GUADALAJARA", "HERMOSILLO", "IRAPUATO", "JUAREZ", "EL MARQUES", "LEON", "LERMA", "MANZANILLO", "MATAMOROS", "MEXICALI", "MEXICO CITY", "MONTERREY", "MORELIA", "NOGALES", "NUEVO LAREDO", "PUEBLA", "QUERETARO", "RAMOS ARIZPE", "REYNOSA", "SALTILLO", "SAN LUIS POTOSI", "SILAO", "TAMPICO", "TIJUANA", "TOLUCA", "TORREON", "VERACRUZ"
];
const CATALOG_WORKBENCH_PAGE_SIZE = 1000;
const CATALOG_CATEGORIES = [
  { key: "equipment", label: "Equipment" },
  { key: "trailer", label: "Trailer" },
  { key: "config", label: "Config" },
  { key: "operation", label: "Operation" },
  { key: "service", label: "Service" },
  { key: "driver", label: "Driver" },
  { key: "mx_border_crossing", label: "MX border city" },
  { key: "us_border_crossing", label: "US border city" },
  { key: "border_crossing", label: "Border crossing general" }
];
const IMPORT_FIELD_DEFINITIONS = {
  operational: [
    { key: "category", label: "Category", required: false, aliases: ["category", "catalog", "type", "tipo", "categoria"] },
    { key: "raw_value", label: "Value", required: true, aliases: ["value", "raw value", "name", "option", "valor", "descripcion", "description"] },
    { key: "normalized_value", label: "Normalized value", required: false, aliases: ["normalized", "normalized value", "standard", "standard value", "valor normalizado"] },
    { key: "code", label: "Code", required: false, aliases: ["code", "key", "codigo", "clave"] },
    { key: "note", label: "Note", required: false, aliases: ["note", "notes", "comment", "comments", "nota", "notas"] }
  ],
  locations: [
    { key: "country", label: "Country", required: false, aliases: ["country", "pais", "nation"] },
    { key: "raw_value", label: "Location value", required: false, aliases: ["location", "value", "raw value", "lane location", "ubicacion", "locacion", "city st", "city state"] },
    { key: "zip_prefix", label: "ZIP / Prefix", required: false, aliases: ["zip", "zip code", "zip prefix", "postal code", "postal", "codigo postal", "cp", "3 digit zip", "zip3"] },
    { key: "city", label: "City", required: false, aliases: ["city", "ciudad", "location city", "orig city", "dest city"] },
    { key: "state_code", label: "State", required: false, aliases: ["state", "st", "state code", "province", "estado", "edo"] },
    { key: "state_name", label: "State name", required: false, aliases: ["state name", "province name", "estado nombre", "nombre estado"] },
    { key: "metro_city", label: "Metro city", required: false, aliases: ["metro", "metro city", "metro area", "zona metropolitana", "metropolitan area"] },
    { key: "market", label: "Market / KMA", required: false, aliases: ["market", "key market area", "kma", "mkt", "mercado"] },
    { key: "region", label: "Region", required: false, aliases: ["region", "region name", "zona"] },
    { key: "note", label: "Note", required: false, aliases: ["note", "notes", "comment", "comments", "nota", "notas"] }
  ]
};
const IMPORT_PREVIEW_LIMIT = 25;
const CATALOG_IMPORT_BATCH_SIZE = 500;

let loadedRows = [];
let locationOptions = [];
let currentEntries = [];
let activeEntryIndex = 0;
let currentCatalogValues = [];
let currentLocationCatalogRows = [];
let locationCatalogFilterTimer = null;
let catalogImportWorkbook = null;
let catalogImportSheets = [];
let catalogImportFileName = "";
let catalogImportSheetName = "";
let catalogImportRows = [];
let catalogImportHeaders = [];
let catalogImportPreviewRows = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function setElementStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function categoryLabel(category) {
  return CATALOG_CATEGORIES.find((item) => item.key === category)?.label || category || "-";
}

function sourceLabel(source) {
  if (source === "rateware_manual_catalog") return "Manual";
  if (String(source || "").startsWith("rateware_reference_")) return "Reference";
  if (source === "rateware_seed") return "Seed";
  if (source === "rateware_google_catalog" || source === "cusCatalog") return "Imported";
  return source || "-";
}

function normalizeHeaderKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[#%()[\]{}:;.,/\\|_+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellHasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function updateCatalogImportStep(step) {
  catalogImportStepItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.catalogImportStep === step);
  });
}

function importFields() {
  return IMPORT_FIELD_DEFINITIONS[catalogImportTypeSelect?.value || "locations"] || IMPORT_FIELD_DEFINITIONS.locations;
}

function importTypeLabel() {
  return catalogImportTypeSelect?.value === "operational" ? "Operational dropdowns" : "Lane/location catalog";
}

function populateImportCategoryControl() {
  if (!catalogImportDefaultCategory) return;
  const options = CATALOG_CATEGORIES
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`)
    .join("");
  catalogImportDefaultCategory.innerHTML = options;
}

function mappedHeaderForField(field, headers = catalogImportHeaders) {
  const aliases = new Set([field.key, field.label, ...(field.aliases || [])].map(normalizeHeaderKey));
  let exact = headers.find((header) => aliases.has(normalizeHeaderKey(header)));
  if (exact) return exact;
  exact = headers.find((header) => {
    const key = normalizeHeaderKey(header);
    return [...aliases].some((alias) => key.includes(alias) || alias.includes(key));
  });
  return exact || "";
}

function renderImportMapping() {
  if (!catalogImportMapFields || !catalogImportMapTitle) return;
  catalogImportMapTitle.textContent = importTypeLabel();
  if (!catalogImportHeaders.length) {
    catalogImportMapFields.innerHTML = '<p class="muted-text">Upload a file to map columns.</p>';
    return;
  }
  const headerOptions = ['<option value="">Do not import</option>']
    .concat(catalogImportHeaders.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`))
    .join("");
  catalogImportMapFields.innerHTML = importFields().map((field) => {
    const selected = mappedHeaderForField(field);
    return `
      <label>
        ${escapeHtml(field.label)}${field.required ? " *" : ""}
        <select data-import-field="${escapeHtml(field.key)}">
          ${headerOptions}
        </select>
      </label>
    `;
  }).join("");
  catalogImportMapFields.querySelectorAll("[data-import-field]").forEach((select) => {
    const field = importFields().find((item) => item.key === select.dataset.importField);
    const selected = field ? mappedHeaderForField(field) : "";
    if (selected) select.value = selected;
  });
  updateCatalogImportStep("map");
}

function importMapping() {
  const mapping = {};
  catalogImportMapFields?.querySelectorAll("[data-import-field]").forEach((select) => {
    mapping[select.dataset.importField] = select.value || "";
  });
  return mapping;
}

function rowObjectFromMatrixRow(headers, sourceRow) {
  const row = {};
  headers.forEach((header, index) => {
    if (!header) return;
    const value = sourceRow[index];
    row[header] = cellHasValue(value) ? String(value).trim() : "";
  });
  return row;
}

function detectHeaderIndex(matrix) {
  let bestIndex = -1;
  let bestScore = 0;
  matrix.slice(0, 20).forEach((row, index) => {
    const cells = row || [];
    const normalized = cells.map(normalizeHeaderKey).filter(Boolean);
    const nonEmpty = normalized.length;
    if (nonEmpty < 2) return;
    const matchCount = importFields().reduce((count, field) => {
      const aliases = [field.key, field.label, ...(field.aliases || [])].map(normalizeHeaderKey);
      return count + (normalized.some((cell) => aliases.some((alias) => cell === alias || cell.includes(alias) || alias.includes(cell))) ? 1 : 0);
    }, 0);
    const score = matchCount * 5 + Math.min(nonEmpty, 8);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function loadImportSheet(sheetName) {
  if (!catalogImportWorkbook || !sheetName) return;
  const sheet = catalogImportWorkbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false
  });
  const headerIndex = detectHeaderIndex(matrix);
  if (headerIndex < 0) {
    catalogImportRows = [];
    catalogImportHeaders = [];
    renderImportMapping();
    throw new Error("No recognizable header row was found. Use a sheet with column headers.");
  }
  catalogImportHeaders = (matrix[headerIndex] || []).map((cell, index) => String(cell || `Column ${index + 1}`).trim());
  catalogImportRows = matrix
    .slice(headerIndex + 1)
    .filter((row) => (row || []).some(cellHasValue))
    .map((row) => rowObjectFromMatrixRow(catalogImportHeaders, row));
  catalogImportSheetName = sheetName;
  renderImportMapping();
  setElementStatus(catalogImportStatus, `${catalogImportRows.length.toLocaleString()} source row(s) found in ${sheetName}. Review mapping, then preview.`, "success");
}

function countryValue(value) {
  const country = String(value || "").trim().toUpperCase();
  if (["US", "USA", "UNITED STATES"].includes(country)) return "US";
  if (["MX", "MEX", "MEXICO"].includes(country)) return "MX";
  if (["CA", "CAN", "CANADA"].includes(country)) return "CA";
  return country || "";
}

function rowValue(sourceRow, header) {
  return header ? String(sourceRow[header] || "").trim() : "";
}

function normalizeImportRow(sourceRow, mapping) {
  const type = catalogImportTypeSelect?.value || "locations";
  if (type === "operational") {
    const rawValue = rowValue(sourceRow, mapping.raw_value);
    const normalizedValue = rowValue(sourceRow, mapping.normalized_value) || rawValue;
    return {
      category: rowValue(sourceRow, mapping.category) || catalogImportDefaultCategory?.value || "equipment",
      raw_value: rawValue,
      normalized_value: normalizedValue,
      code: rowValue(sourceRow, mapping.code),
      note: rowValue(sourceRow, mapping.note)
    };
  }
  const city = rowValue(sourceRow, mapping.city);
  const metroCity = rowValue(sourceRow, mapping.metro_city);
  const stateCode = rowValue(sourceRow, mapping.state_code);
  return {
    country: countryValue(rowValue(sourceRow, mapping.country)) || catalogImportDefaultCountry?.value || "MX",
    raw_value: rowValue(sourceRow, mapping.raw_value) || [metroCity || city, stateCode].filter(Boolean).join(", "),
    zip_prefix: rowValue(sourceRow, mapping.zip_prefix),
    city,
    state_code: stateCode,
    state_name: rowValue(sourceRow, mapping.state_name),
    metro_city: metroCity || city,
    market: rowValue(sourceRow, mapping.market),
    region: rowValue(sourceRow, mapping.region),
    note: rowValue(sourceRow, mapping.note)
  };
}

function importRowKey(row) {
  if ((catalogImportTypeSelect?.value || "locations") === "operational") {
    return locationSearchKey([row.category, row.raw_value, row.normalized_value].filter(Boolean).join(" | "));
  }
  return locationSearchKey([row.country, row.raw_value, row.zip_prefix, row.state_code, row.market, row.region].filter(Boolean).join(" | "));
}

function validateImportRow(row) {
  const issues = [];
  if ((catalogImportTypeSelect?.value || "locations") === "operational") {
    if (!row.category || !CATALOG_CATEGORIES.some((item) => item.key === row.category)) issues.push("invalid category");
    if (!row.raw_value) issues.push("missing value");
  } else {
    if (!row.country) issues.push("missing country");
    if (!row.raw_value && !row.city && !row.zip_prefix) issues.push("missing location value");
    if ((row.country === "US" || row.country === "CA") && !row.zip_prefix) issues.push("missing ZIP/prefix");
    if (row.country === "MX" && !row.metro_city && !row.city) issues.push("missing MX metro/city");
  }
  return issues;
}

function buildImportPreview() {
  const mapping = importMapping();
  const keys = new Map();
  const preview = catalogImportRows.map((sourceRow, index) => {
    const mapped = normalizeImportRow(sourceRow, mapping);
    const key = importRowKey(mapped);
    const issues = validateImportRow(mapped);
    if (key) keys.set(key, (keys.get(key) || 0) + 1);
    return { index, source: sourceRow, mapped, key, issues };
  });
  preview.forEach((row) => {
    if (row.key && keys.get(row.key) > 1) row.issues.push("duplicate in file");
  });
  catalogImportPreviewRows = preview;
  return preview;
}

function renderImportSummary(preview) {
  if (!catalogImportSummary) return;
  const ready = preview.filter((row) => !row.issues.length).length;
  const needsData = preview.length - ready;
  const duplicates = preview.filter((row) => row.issues.includes("duplicate in file")).length;
  const values = [preview.length, ready, needsData, duplicates];
  catalogImportSummary.querySelectorAll("strong").forEach((element, index) => {
    element.textContent = values[index].toLocaleString();
  });
}

function renderImportPreview() {
  const preview = buildImportPreview();
  renderImportSummary(preview);
  const fields = (catalogImportTypeSelect?.value || "locations") === "operational"
    ? ["category", "raw_value", "normalized_value", "code"]
    : ["country", "raw_value", "zip_prefix", "state_code", "metro_city", "market", "region"];
  catalogImportPreviewHead.innerHTML = `
    <tr>
      <th>Status</th>
      ${fields.map((field) => `<th>${escapeHtml(field.replace(/_/g, " "))}</th>`).join("")}
      <th>Issues</th>
    </tr>
  `;
  const visible = preview.slice(0, IMPORT_PREVIEW_LIMIT);
  catalogImportPreviewBody.innerHTML = visible.length ? visible.map((row) => `
    <tr class="${row.issues.length ? "is-muted-row" : ""}">
      <td><span class="review-chip ${row.issues.length ? "warning" : "success"}">${row.issues.length ? "needs data" : "ready"}</span></td>
      ${fields.map((field) => `<td>${escapeHtml(row.mapped[field] || "-")}</td>`).join("")}
      <td>${escapeHtml(row.issues.join(", ") || "ok")}</td>
    </tr>
  `).join("") : '<tr><td colspan="9">No rows to preview.</td></tr>';
  const ready = preview.filter((row) => !row.issues.length).length;
  confirmCatalogImportButton.disabled = ready === 0;
  setElementStatus(catalogImportStatus, `${ready.toLocaleString()} ready row(s). ${preview.length - ready} row(s) need cleanup before import.`, ready ? "success" : "error");
  updateCatalogImportStep("preview");
}

async function parseCatalogImportFile(file) {
  const buffer = await file.arrayBuffer();
  catalogImportWorkbook = XLSX.read(buffer, { type: "array", cellDates: true });
  catalogImportSheets = catalogImportWorkbook.SheetNames || [];
  catalogImportFileName = file.name;
  if (!catalogImportSheets.length) throw new Error("No sheets were found in this file.");
  catalogImportSheetSelect.disabled = false;
  catalogImportSheetSelect.innerHTML = catalogImportSheets.map((sheet) => `<option value="${escapeHtml(sheet)}">${escapeHtml(sheet)}</option>`).join("");
  loadImportSheet(catalogImportSheets[0]);
}

function populateCatalogCategoryControls() {
  const options = CATALOG_CATEGORIES
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`)
    .join("");
  if (catalogCategorySelect) catalogCategorySelect.innerHTML = options;
  if (catalogCategoryFilter) {
    const selected = catalogCategoryFilter.value || "";
    catalogCategoryFilter.innerHTML = `<option value="">All categories</option>${options}`;
    catalogCategoryFilter.value = CATALOG_CATEGORIES.some((item) => item.key === selected) ? selected : "";
  }
}

function renderCatalogValues(rows = currentCatalogValues) {
  currentCatalogValues = rows || [];
  const category = catalogCategoryFilter?.value || "";
  const visibleRows = currentCatalogValues
    .filter((row) => !category || row.category === category)
    .sort((a, b) => {
      const categorySort = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
      if (categorySort) return categorySort;
      return String(a.normalized_value || a.raw_value || "").localeCompare(String(b.normalized_value || b.raw_value || ""));
    });

  if (!catalogValuesBody) return;
  if (!visibleRows.length) {
    catalogValuesBody.innerHTML = `<tr><td colspan="6">No catalog values found.</td></tr>`;
    setElementStatus(catalogStatus, "No values in this catalog view.", "warning");
    return;
  }

  catalogValuesBody.innerHTML = visibleRows.map((row) => {
    const source = sourceLabel(row.source);
    const active = row.active !== false;
    return `
      <tr class="${active ? "" : "is-muted-row"}">
        <td>${escapeHtml(categoryLabel(row.category))}</td>
        <td>
          <strong>${escapeHtml(row.normalized_value || row.raw_value || "-")}</strong>
          ${row.raw_value && row.raw_value !== row.normalized_value ? `<small>${escapeHtml(row.raw_value)}</small>` : ""}
        </td>
        <td>${escapeHtml(row.code || "-")}</td>
        <td><span class="review-chip ${row.is_manual ? "success" : "neutral"}">${escapeHtml(source)}</span></td>
        <td><span class="review-chip ${active ? "success" : "muted"}">${escapeHtml(active ? "active" : "archived")}</span></td>
        <td>
          ${row.can_archive ? `<button type="button" class="danger small-button" data-catalog-archive="${escapeHtml(row.id)}">Archive</button>` : `<span class="muted-text">Locked</span>`}
        </td>
      </tr>
    `;
  }).join("");
  setElementStatus(catalogStatus, `${visibleRows.length.toLocaleString()} value(s) shown. Active manual values feed Staging and Rateware dropdowns.`, "success");
}

function locationCatalogFilters() {
  return {
    country: adminLocationCountryFilter?.value || "",
    state: adminLocationStateFilter?.value?.trim() || "",
    market: adminLocationMarketFilter?.value?.trim() || "",
    region: adminLocationRegionFilter?.value?.trim() || "",
    search: adminLocationSearchInput?.value?.trim() || "",
    limit: 750
  };
}

function locationCatalogFormValues() {
  return Object.fromEntries(Object.entries(locationInputs).map(([key, input]) => [key, input?.value?.trim() || ""]));
}

function clearLocationCatalogForm() {
  Object.entries(locationInputs).forEach(([key, input]) => {
    if (!input) return;
    input.value = key === "country" ? "MX" : "";
  });
}

function renderLocationCatalogRows(rows = currentLocationCatalogRows) {
  currentLocationCatalogRows = rows || [];
  if (!locationCatalogBody) return;
  if (!currentLocationCatalogRows.length) {
    locationCatalogBody.innerHTML = `<tr><td colspan="7">No location catalog rows found.</td></tr>`;
    setElementStatus(locationCatalogStatus, "No locations in this view.", "warning");
    return;
  }

  locationCatalogBody.innerHTML = currentLocationCatalogRows.map((row) => {
    const active = row.active !== false;
    return `
      <tr class="${active ? "" : "is-muted-row"}">
        <td><span class="review-chip neutral">${escapeHtml(row.country || "-")}</span></td>
        <td>
          <strong>${escapeHtml(row.raw_value || "-")}</strong>
          <small>${escapeHtml(row.location_key || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml([row.zip_prefix, row.state_code].filter(Boolean).join(" / ") || "-")}</strong>
          <small>${escapeHtml(row.state_name || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml(row.metro_city || row.city || "-")}</strong>
          <small>${escapeHtml(row.city || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml(row.market || "-")}</strong>
          <small>${escapeHtml(row.region || "")}</small>
        </td>
        <td><span class="review-chip ${row.is_manual ? "success" : "neutral"}">${escapeHtml(sourceLabel(row.source))}</span></td>
        <td>
          ${row.can_archive ? `<button type="button" class="danger small-button" data-location-archive="${escapeHtml(row.id)}">Archive</button>` : `<span class="muted-text">Locked</span>`}
        </td>
      </tr>
    `;
  }).join("");
  setElementStatus(locationCatalogStatus, `${currentLocationCatalogRows.length.toLocaleString()} location(s) shown. This catalog drives lane matching candidates.`, "success");
}

function textTokens(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function locationSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferState(value) {
  return textTokens(value).find((token) => MX_STATE_CODES.has(token) || US_STATE_CODES.has(token) || CA_PROVINCE_CODES.has(token)) || "";
}

function normalizedStateCode(value) {
  if (value === "EM") return "MX";
  if (value === "CU") return "CO";
  return value;
}

function rawLocationLabel(row, side) {
  return row[side] || row[`normalized_${side}`] || row[`${side}_city`] || "";
}

function inferCountryFromText(value, row = {}, side = "") {
  const explicit = String(row?.[`${side}_country`] || "").toUpperCase();
  const tokens = textTokens(value);
  const tokenSet = new Set(tokens);
  const lookup = textTokens(value).join(" ");
  const hasMxState = tokens.some((token) => MX_STATE_CODES.has(token));
  const hasUsState = tokens.some((token) => US_STATE_CODES.has(token));
  const hasCaProvince = tokens.some((token) => CA_PROVINCE_CODES.has(token));
  const hasMxCityHint = MX_CITY_HINTS.some((city) => lookup.includes(city));
  const hasCanadianPostalCode = /\b[A-Z]\d[A-Z]\b/.test(lookup);
  const strongMxText = tokenSet.has("MX") || tokenSet.has("MEX") || (tokenSet.has("MEXICO") && !tokenSet.has("NEW"));
  const strongUsText = tokenSet.has("US") || tokenSet.has("USA") || tokenSet.has("UNITED") || tokenSet.has("STATES");
  const strongCaText = tokenSet.has("CAN") || tokenSet.has("CANADA");

  if (strongMxText || (hasMxState && (hasMxCityHint || !hasUsState || !hasCaProvince))) return "MX";
  if (strongCaText || hasCanadianPostalCode) return "CA";
  if (strongUsText) return "US";
  if (explicit) return explicit;

  const state = inferState(value);
  if (state && MX_STATE_CODES.has(state) && !US_STATE_CODES.has(state)) return "MX";
  if (state && US_STATE_CODES.has(state) && !MX_STATE_CODES.has(state)) return "US";
  if (state && CA_PROVINCE_CODES.has(state)) return "CA";
  return "";
}

function rowStatus(row) {
  return row.status === "approved" ? "approved" : "pending_review";
}

function vendorLabel(row) {
  return row.vendors?.vendor_name || row.vendor_domain || row.vendors?.domain || "-";
}

function laneLabel(row) {
  return `${row.normalized_origin || row.origin || "-"} -> ${row.normalized_destination || row.destination || "-"}`;
}

function country(row, side) {
  return String(row[`${side}_country`] || inferCountryFromText(rawLocationLabel(row, side), row, side)).toUpperCase();
}

function locationResolved(row, side) {
  const countryCode = country(row, side);
  if (countryCode === "MX") {
    return Boolean(row[`${side}_state`] && (row[`${side}_market`] || row[`${side}_region`]) && (row[`${side}_city`] || row[`normalized_${side}`] || row[side]));
  }
  if (countryCode === "US" || countryCode === "CA") {
    return Boolean(row[`${side}_zip_prefix`] && row[`${side}_state`] && row[`${side}_market`] && row[`${side}_region`]);
  }
  return Boolean(row[`${side}_market`] && row[`${side}_state`]);
}

function gapReason(row, side) {
  const countryCode = country(row, side) || "unknown";
  const missing = [];
  if (!row[`${side}_state`]) missing.push("state");
  if (!row[`${side}_market`]) missing.push("market");
  if (!row[`${side}_region`]) missing.push("region");
  if ((countryCode === "US" || countryCode === "CA") && !row[`${side}_zip_prefix`]) missing.push("ZIP prefix");
  if (countryCode === "MX" && !row[`${side}_city`] && !row[`normalized_${side}`]) missing.push("metro/city");
  return missing.length ? `Missing ${missing.join(", ")}` : row[`${side}_match_reason`] || "Needs stronger match";
}

function currentMatchLabel(row, side) {
  return [
    row[`normalized_${side}`] || row[side],
    row[`${side}_zip_prefix`],
    row[`${side}_state`],
    row[`${side}_market`],
    row[`${side}_region`]
  ].filter(Boolean).join(" | ") || "-";
}

function locationValue(option) {
  if (option.value) return option.value;
  return [
    option.metro_city || option.city || option.raw_value,
    option.state_code || option.state_name,
    option.country
  ].filter(Boolean).join(", ");
}

function locationLabel(option) {
  if (option.label) return option.label;
  return [
    option.zip_prefix ? `ZIP ${option.zip_prefix}` : "",
    option.state_code ? `ST ${option.state_code}` : "",
    option.market,
    option.region,
    option.country,
    option.source
  ].filter(Boolean).join(" | ");
}

function locationCountry(option) {
  return String(option?.country || "").toUpperCase();
}

function locationState(option) {
  return String(option?.state_code || option?.state_name || "").toUpperCase();
}

function populateSelect(select, values, defaultLabel) {
  if (!select) return;
  const selected = select.value;
  const uniqueValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>${uniqueValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (uniqueValues.includes(selected)) select.value = selected;
}

function populateCatalogFilters() {
  populateSelect(countryFilter, locationOptions.map((option) => option.country), "All countries");
  populateSelect(stateFilter, locationOptions.map((option) => option.state_code || option.state_name), "All states");
  populateSelect(marketFilter, locationOptions.map((option) => option.market), "All markets");
  populateSelect(regionFilter, locationOptions.map((option) => option.region), "All regions");
}

function catalogFilterActive() {
  return Boolean(countryFilter?.value || stateFilter?.value || marketFilter?.value || regionFilter?.value || locationSearchInput?.value);
}

function optionMatchesCatalogFilters(option) {
  const country = String(countryFilter?.value || "").toUpperCase();
  const state = String(stateFilter?.value || "").toUpperCase();
  const market = locationSearchKey(marketFilter?.value || "");
  const region = locationSearchKey(regionFilter?.value || "");
  const search = locationSearchKey(locationSearchInput?.value || "");

  if (country && locationCountry(option) !== country) return false;
  if (state && normalizedStateCode(locationState(option)) !== normalizedStateCode(state)) return false;
  if (market && locationSearchKey(option.market) !== market) return false;
  if (region && locationSearchKey(option.region) !== region) return false;
  if (search && !locationSearchKey(optionTextValues(option).join(" ")).includes(search)) return false;
  return true;
}

function filteredLocationOptions({ includeAllIfEmpty = true } = {}) {
  const filtered = locationOptions.filter(optionMatchesCatalogFilters);
  if (!filtered.length && includeAllIfEmpty && !catalogFilterActive()) return locationOptions;
  return filtered;
}

function optionTextValues(option) {
  return [
    locationValue(option),
    locationLabel(option),
    option.raw_value,
    option.value,
    option.label,
    option.metro_city,
    option.city,
    option.zip_prefix,
    option.market,
    option.region,
    [option.city, option.state_code].filter(Boolean).join(", "),
    [option.metro_city, option.state_code].filter(Boolean).join(", "),
    [option.city, option.state_name].filter(Boolean).join(", ")
  ].filter(Boolean);
}

function scoreLocationCandidate(row, side, option) {
  const query = [
    rawLocationLabel(row, side),
    row[`${side}_state`],
    row[`${side}_zip_prefix`],
    row[`${side}_market`]
  ].filter(Boolean).join(" ");
  const lookup = locationSearchKey(query);
  const candidates = optionTextValues(option).map(locationSearchKey).filter(Boolean);
  if (!lookup || !candidates.length) return null;

  let score = 0;
  let reason = "catalog candidate";
  if (candidates.some((candidate) => candidate === lookup)) {
    score += 100;
    reason = "exact text match";
  } else if (candidates.some((candidate) => candidate.startsWith(lookup) || lookup.startsWith(candidate))) {
    score += 82;
    reason = "starts with same city or ZIP";
  } else if (candidates.some((candidate) => candidate.includes(lookup) || lookup.includes(candidate))) {
    score += 64;
    reason = "partial city, market, or ZIP match";
  } else {
    return null;
  }

  const inferredCountry = country(row, side);
  const optionCountry = String(option.country || "").toUpperCase();
  if (inferredCountry && optionCountry === inferredCountry) score += 22;
  if (inferredCountry && optionCountry && optionCountry !== inferredCountry) score -= 70;

  const state = inferState(query);
  const optionState = String(option.state_code || option.state_name || "").toUpperCase();
  if (state && optionState && normalizedStateCode(optionState) === normalizedStateCode(state)) score += 18;
  if (state && optionState && normalizedStateCode(optionState) !== normalizedStateCode(state)) score -= 18;

  const queryTokens = new Set(textTokens(query));
  const optionCityTokens = textTokens([option.city, option.metro_city].filter(Boolean).join(" "));
  if (optionCityTokens.some((token) => queryTokens.has(token))) score += 10;
  if (option.zip_prefix && queryTokens.has(String(option.zip_prefix).toUpperCase())) score += optionCountry === "MX" ? 4 : 12;
  if (optionCountry === "MX" && option.market) score += 8;
  if ((optionCountry === "US" || optionCountry === "CA") && !option.zip_prefix) score -= 8;

  return { option, score, reason };
}

function bestLocationCandidate(row, side) {
  const pool = filteredLocationOptions();
  const scored = pool
    .map((option) => scoreLocationCandidate(row, side, option))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function locationCandidates(row, side, limit = 8) {
  const primaryPool = filteredLocationOptions({ includeAllIfEmpty: false });
  const pool = primaryPool.length ? primaryPool : locationOptions;
  return pool
    .map((option) => scoreLocationCandidate(row, side, option))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function gapItems() {
  return loadedRows.flatMap((row) => ["origin", "destination"]
    .filter((side) => !locationResolved(row, side))
    .map((side) => ({ type: "row", key: `${row.id}:${side}`, row, rows: [row], side, raw: rawLocationLabel(row, side) })));
}

function filteredGapItems() {
  const side = sideFilter?.value || "";
  const status = statusFilter?.value || "";
  const search = locationSearchKey(searchInput?.value || "");
  return gapItems().filter((item) => {
    if (side && item.side !== side) return false;
    if (status && rowStatus(item.row) !== status) return false;
    if (!search) return true;
    return locationSearchKey([vendorLabel(item.row), laneLabel(item.row), currentMatchLabel(item.row, item.side), item.row.rfx_id, item.raw].filter(Boolean).join(" ")).includes(search);
  });
}

function groupGapItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const groupKey = [item.side, locationSearchKey(item.raw || currentMatchLabel(item.row, item.side)) || item.key].join(":");
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        type: "group",
        key: groupKey,
        side: item.side,
        raw: item.raw,
        row: item.row,
        rows: [],
        items: []
      });
    }
    const group = groups.get(groupKey);
    group.rows.push(item.row);
    group.items.push(item);
  });
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || String(a.raw).localeCompare(String(b.raw)));
}

function visibleEntries() {
  const items = filteredGapItems();
  return viewModeSelect?.value === "rows" ? items : groupGapItems(items);
}

function updateMetrics() {
  const gaps = gapItems();
  rowsChecked.textContent = String(loadedRows.length);
  gapCount.textContent = String(gaps.length);
  pendingCount.textContent = String(loadedRows.filter((row) => rowStatus(row) === "pending_review").length);
  approvedCount.textContent = String(loadedRows.filter((row) => rowStatus(row) === "approved").length);
}

function renderDatalist() {
  document.querySelector("#catalog-location-options")?.remove();
  const datalist = document.createElement("datalist");
  datalist.id = "catalog-location-options";
  datalist.innerHTML = filteredLocationOptions().map((option) => `<option value="${escapeHtml(locationValue(option))}" label="${escapeHtml(locationLabel(option))}"></option>`).join("");
  document.body.appendChild(datalist);
}

function statusMixLabel(rows) {
  const pending = rows.filter((row) => rowStatus(row) === "pending_review").length;
  const approved = rows.length - pending;
  return [pending ? `${pending} pending` : "", approved ? `${approved} approved` : ""].filter(Boolean).join(" / ") || "-";
}

function examplesLabel(rows, side) {
  return rows.slice(0, 3).map((row) => `${vendorLabel(row)}: ${laneLabel(row)}`).join(" | ");
}

function renderSuggestion(candidate) {
  if (!candidate) {
    return '<small>No strong automatic suggestion</small>';
  }
  return `
    <small>${escapeHtml(locationLabel(candidate.option))}</small>
    <span class="catalog-candidate-reason">${escapeHtml(candidate.reason)} | score ${Math.max(0, Math.round(candidate.score))}</span>
  `;
}

function countryLogicText(row, side) {
  const inferred = country(row, side);
  if (inferred === "MX") return "MX: matching prioritizes metro city, state, market, and region. Mexican ZIP is secondary.";
  if (inferred === "US" || inferred === "CA") return "US/CA: matching prioritizes ZIP prefix and state to assign key market area and region.";
  return "Unknown country: use country/state filters or choose a catalog candidate before saving.";
}

function candidateDetail(candidate, index) {
  const option = candidate.option;
  const geography = [
    option.country,
    [option.zip_prefix, option.state_code || option.state_name].filter(Boolean).join(" / "),
    option.market,
    option.region
  ].filter(Boolean).join(" | ");
  return `
    <article class="catalog-candidate-card ${index === 0 ? "best" : ""}">
      <div>
        <strong>${escapeHtml(option.raw_value || locationValue(option))}</strong>
        <span>${escapeHtml([option.metro_city || option.city, geography].filter(Boolean).join(" | "))}</span>
      </div>
      <p>${escapeHtml(candidate.reason)} | score ${escapeHtml(Math.max(0, Math.round(candidate.score)))}</p>
      <div class="action-row">
        <button type="button" class="small-button" data-inspector-use-candidate="${index}">Use candidate</button>
        <button type="button" class="small-button secondary" data-inspector-apply-candidate="${index}">Apply</button>
        <button type="button" class="small-button secondary" data-inspector-alias-candidate="${index}" ${option.id ? "" : "disabled"}>Apply + alias</button>
      </div>
    </article>
  `;
}

function renderInspector(index = activeEntryIndex) {
  if (!inspectorBody || !inspectorTitle) return;
  const entry = currentEntries[index];
  activeEntryIndex = Number.isFinite(index) ? index : 0;
  if (!entry) {
    inspectorTitle.textContent = "Select a location gap";
    inspectorBody.innerHTML = '<p class="muted-text">Choose a row to review candidates, country logic, and alias impact.</p>';
    return;
  }

  const candidates = locationCandidates(entry.row, entry.side, 8);
  const activeFilters = [
    countryFilter?.value ? `Country ${countryFilter.value}` : "",
    stateFilter?.value ? `State ${stateFilter.value}` : "",
    marketFilter?.value ? `Market ${marketFilter.value}` : "",
    regionFilter?.value ? `Region ${regionFilter.value}` : "",
    locationSearchInput?.value ? `Search "${locationSearchInput.value}"` : ""
  ].filter(Boolean).join(" | ");

  inspectorTitle.textContent = `${entry.side === "origin" ? "Origin" : "Destination"}: ${entry.raw || currentMatchLabel(entry.row, entry.side) || "blank"}`;
  inspectorBody.innerHTML = `
    <section>
      <h4>Matching logic</h4>
      <p>${escapeHtml(countryLogicText(entry.row, entry.side))}</p>
      ${activeFilters ? `<small>Catalog filter: ${escapeHtml(activeFilters)}</small>` : '<small>No catalog filter applied.</small>'}
    </section>
    <section>
      <h4>Current gap</h4>
      <dl class="catalog-inspector-dl">
        <div><dt>Raw</dt><dd>${escapeHtml(entry.raw || "-")}</dd></div>
        <div><dt>Current</dt><dd>${escapeHtml(currentMatchLabel(entry.row, entry.side))}</dd></div>
        <div><dt>Missing</dt><dd>${escapeHtml(gapReason(entry.row, entry.side))}</dd></div>
        <div><dt>Rows</dt><dd>${escapeHtml(entry.rows.length)}</dd></div>
      </dl>
    </section>
    <section>
      <h4>Candidates</h4>
      <div class="catalog-candidate-list">
        ${candidates.length ? candidates.map(candidateDetail).join("") : '<p class="muted-text">No candidates in the current catalog filter.</p>'}
      </div>
    </section>
  `;
}

function renderRows() {
  updateMetrics();
  renderDatalist();
  currentEntries = visibleEntries();
  if (!currentEntries.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><strong>No catalog gaps in this view</strong><span>Change filters or refresh after new uploads are interpreted.</span></div></td></tr>';
    renderInspector(-1);
    return;
  }
  activeEntryIndex = Math.max(0, Math.min(activeEntryIndex, currentEntries.length - 1));

  body.innerHTML = currentEntries.map((entry, index) => {
    const candidate = bestLocationCandidate(entry.row, entry.side);
    const isGroup = entry.type === "group";
    const countryLabel = country(entry.row, entry.side) || "unknown";
    return `
      <tr data-catalog-entry-index="${index}" class="${index === activeEntryIndex ? "is-active" : ""}">
        <td><span class="review-chip ${escapeHtml(entry.rows.some((row) => rowStatus(row) === "approved") ? "neutral" : "warning")}">${escapeHtml(statusMixLabel(entry.rows))}</span></td>
        <td><span class="review-chip neutral">${escapeHtml(entry.side)}</span></td>
        <td>
          <strong>${escapeHtml(isGroup ? `${entry.rows.length} row${entry.rows.length === 1 ? "" : "s"}` : vendorLabel(entry.row))}</strong>
          <small>${escapeHtml(isGroup ? `Country: ${countryLabel}` : rowStatus(entry.row))}</small>
        </td>
        <td>
          <strong>${escapeHtml(isGroup ? entry.raw || "Repeated blank location" : laneLabel(entry.row))}</strong>
          <small>${escapeHtml(isGroup ? examplesLabel(entry.rows, entry.side) : entry.row.rfx_id || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml(currentMatchLabel(entry.row, entry.side))}</strong>
          <small>${escapeHtml(gapReason(entry.row, entry.side))}</small>
        </td>
        <td>
          <input class="catalog-suggestion-input" data-catalog-suggestion list="catalog-location-options" value="${escapeHtml(candidate ? locationValue(candidate.option) : "")}" placeholder="Search catalog location..." />
          ${renderSuggestion(candidate)}
        </td>
        <td class="history-actions catalog-actions">
          <button type="button" class="small-button" data-apply-catalog-match>Apply${isGroup ? " group" : ""}</button>
          <button type="button" class="small-button secondary" data-apply-catalog-alias>Apply + alias</button>
          <span class="row-save-status" data-catalog-status-message></span>
        </td>
      </tr>
    `;
  }).join("");
  renderInspector(activeEntryIndex);
}

function selectedLocation(value) {
  const key = locationSearchKey(value);
  const filtered = filteredLocationOptions({ includeAllIfEmpty: false });
  const pools = filtered.length ? [filtered, locationOptions] : [locationOptions];
  for (const pool of pools) {
    const match = pool.find((option) => locationSearchKey(locationValue(option)) === key)
      || pool.find((option) => locationSearchKey(option.value) === key)
      || pool.find((option) => locationSearchKey(option.raw_value) === key);
    if (match) return match;
  }
  return null;
}

function locationPatch(side, option) {
  return {
    [side]: locationValue(option),
    [`normalized_${side}`]: option.metro_city || option.city || option.value || option.raw_value || "",
    [`${side}_city`]: option.city || option.metro_city || "",
    [`${side}_country`]: option.country || "",
    [`${side}_zip_prefix`]: option.zip_prefix || "",
    [`${side}_state`]: option.state_code || option.state_name || "",
    [`${side}_market`]: option.market || "",
    [`${side}_region`]: option.region || "",
    [`${side}_match_reason`]: "manual catalog workbench match",
    [`${side}_match_source`]: "manual_workbench",
    [`${side}_match_confidence`]: 100,
    [`${side}_match_manual`]: true
  };
}

async function updateRowLocation(row, side, patch) {
  if (rowStatus(row) === "approved") return await updateApprovedRatewareRow(row.id, patch);
  return await updateStagingRow(row.id, patch);
}

async function fetchAllStagingByStatus(status) {
  const rows = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchStagingPage({ status, limit: CATALOG_WORKBENCH_PAGE_SIZE, offset });
    const pageRows = page.rows || [];
    rows.push(...pageRows);
    hasMore = Boolean(page.has_more);
    offset += pageRows.length;
    setStatus(`Loading ${status} rows... ${rows.length.toLocaleString()} / ${Number(page.total || rows.length).toLocaleString()}`);
    if (!pageRows.length) break;
  }
  return rows;
}

async function fetchAllApprovedRateware() {
  const rows = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchApprovedRatewarePage({ limit: CATALOG_WORKBENCH_PAGE_SIZE, offset });
    const pageRows = page.rows || [];
    rows.push(...pageRows);
    hasMore = Boolean(page.has_more);
    offset += pageRows.length;
    setStatus(`Loading approved rows... ${rows.length.toLocaleString()} / ${Number(page.total || rows.length).toLocaleString()}`);
    if (!pageRows.length) break;
  }
  return rows;
}

async function refreshWorkbenchLocationOptions() {
  const options = await fetchStagingOptions();
  locationOptions = options.locations || [];
  populateCatalogFilters();
  renderDatalist();
  renderRows();
}

async function loadCatalogValues() {
  setElementStatus(catalogStatus, "Loading catalog values...");
  try {
    const values = await fetchCatalogValues(catalogCategoryFilter?.value || "");
    renderCatalogValues(values);
  } catch (error) {
    setElementStatus(catalogStatus, error.message, "error");
  }
}

async function loadLocationCatalogValues() {
  setElementStatus(locationCatalogStatus, "Loading location catalog...");
  try {
    const rows = await fetchLocationCatalogValues(locationCatalogFilters());
    renderLocationCatalogRows(rows);
  } catch (error) {
    setElementStatus(locationCatalogStatus, error.message, "error");
  }
}

function queueLocationCatalogLoad() {
  window.clearTimeout(locationCatalogFilterTimer);
  locationCatalogFilterTimer = window.setTimeout(loadLocationCatalogValues, 220);
}

async function loadAdminCatalogs() {
  await Promise.all([
    loadCatalogValues(),
    loadLocationCatalogValues()
  ]);
}

function resetCatalogImport() {
  catalogImportWorkbook = null;
  catalogImportSheets = [];
  catalogImportFileName = "";
  catalogImportSheetName = "";
  catalogImportRows = [];
  catalogImportHeaders = [];
  catalogImportPreviewRows = [];
  if (catalogImportFileInput) catalogImportFileInput.value = "";
  if (catalogImportSheetSelect) {
    catalogImportSheetSelect.disabled = true;
    catalogImportSheetSelect.innerHTML = '<option value="">Upload a file first</option>';
  }
  if (catalogImportPreviewHead) catalogImportPreviewHead.innerHTML = '<tr><th>Preview</th></tr>';
  if (catalogImportPreviewBody) catalogImportPreviewBody.innerHTML = '<tr><td>No import preview yet.</td></tr>';
  renderImportSummary([]);
  renderImportMapping();
  if (confirmCatalogImportButton) confirmCatalogImportButton.disabled = true;
  setElementStatus(catalogImportStatus, "");
  updateCatalogImportStep("file");
}

async function confirmCatalogImport() {
  const readyRows = catalogImportPreviewRows.filter((row) => !row.issues.length).map((row) => row.mapped);
  if (!readyRows.length) {
    setElementStatus(catalogImportStatus, "Preview the file and resolve required fields before saving.", "error");
    return;
  }
  confirmCatalogImportButton.disabled = true;
  previewCatalogImportButton.disabled = true;
  let imported = 0;
  let skipped = 0;
  const warnings = [];
  try {
    for (let index = 0; index < readyRows.length; index += CATALOG_IMPORT_BATCH_SIZE) {
      const batch = readyRows.slice(index, index + CATALOG_IMPORT_BATCH_SIZE);
      setElementStatus(catalogImportStatus, `Saving ${Math.min(index + batch.length, readyRows.length).toLocaleString()} / ${readyRows.length.toLocaleString()}...`, "warning");
      const result = await bulkImportCatalogValues({
        importType: catalogImportTypeSelect?.value || "locations",
        rows: batch,
        fileName: catalogImportFileName,
        sheetName: catalogImportSheetName
      });
      imported += Number(result.imported || 0);
      skipped += Number(result.skipped || 0);
      warnings.push(...(result.warnings || []));
    }
    setElementStatus(catalogImportStatus, `Imported ${imported.toLocaleString()} row(s). ${skipped.toLocaleString()} skipped.${warnings.length ? ` ${warnings.slice(0, 2).join(" ")}` : ""}`, "success");
    await loadAdminCatalogs();
    await refreshWorkbenchLocationOptions();
  } catch (error) {
    setElementStatus(catalogImportStatus, error.message, "error");
    confirmCatalogImportButton.disabled = false;
  } finally {
    previewCatalogImportButton.disabled = false;
  }
}

async function applyCatalogMatch(tableRow, { saveAlias = false, optionOverride = null } = {}) {
  const index = Number(tableRow?.dataset.catalogEntryIndex);
  const entry = currentEntries[index];
  const message = tableRow?.querySelector("[data-catalog-status-message]");
  const input = tableRow?.querySelector("[data-catalog-suggestion]");
  const option = optionOverride || selectedLocation(input?.value);
  if (!entry || !option) {
    setStatus("Choose a catalog location before applying.", "error");
    return;
  }
  if (saveAlias && !option.id) {
    setStatus("This suggestion cannot be saved as an alias because it is missing a catalog ID.", "error");
    return;
  }
  if (saveAlias && !String(entry.raw || "").trim()) {
    setStatus("This gap has no original location text to save as an alias.", "error");
    return;
  }

  const patch = locationPatch(entry.side, option);
  const rows = entry.rows || [];
  if (message) {
    message.textContent = `Saving ${rows.length}...`;
    message.dataset.tone = "warning";
  }

  try {
    if (saveAlias) {
      await saveLocationAlias({ alias: entry.raw, target_location_id: option.id });
    }

    let updated = 0;
    for (const row of rows) {
      await updateRowLocation(row, entry.side, patch);
      updated += 1;
      if (message) message.textContent = `Saved ${updated}/${rows.length}`;
    }

    const ids = new Set(rows.map((row) => row.id));
    loadedRows = loadedRows.map((row) => ids.has(row.id) ? { ...row, ...patch } : row);
    renderRows();
    setStatus(`${updated} row${updated === 1 ? "" : "s"} updated${saveAlias ? " and alias saved" : ""}.`, "success");
  } catch (error) {
    if (message) {
      message.textContent = "Failed";
      message.dataset.tone = "error";
    }
    setStatus(error.message, "error");
  }
}

async function loadWorkbench() {
  body.innerHTML = '<tr><td colspan="7">Loading catalog gaps...</td></tr>';
  setStatus("");
  refreshButton.disabled = true;
  try {
    await requirePrivatePage();
    const [options, pendingRows, approvedRows] = await Promise.all([
      fetchStagingOptions(),
      fetchAllStagingByStatus("pending_review"),
      fetchAllApprovedRateware()
    ]);
    locationOptions = options.locations || [];
    loadedRows = [...pendingRows, ...approvedRows];
    populateCatalogFilters();
    renderDatalist();
    renderRows();
    setStatus(`Catalog workbench loaded ${loadedRows.length.toLocaleString()} rate row(s) and ${locationOptions.length.toLocaleString()} catalog location(s).`, "success");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
    setStatus(error.message, "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function syncCatalog() {
  syncButton.disabled = true;
  setStatus("Syncing catalog...");
  try {
    const result = await syncRatewareCatalog("core");
    setStatus(`Catalog synced. ${result.inserted || 0} inserted, ${result.updated || 0} updated.`, "success");
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    syncButton.disabled = false;
  }
}

initAuthControls();
populateCatalogCategoryControls();
populateImportCategoryControl();
requirePrivatePage().then(() => {
  loadAdminCatalogs();
  loadWorkbench();
});

refreshButton?.addEventListener("click", loadWorkbench);
syncButton?.addEventListener("click", syncCatalog);
catalogImportTypeSelect?.addEventListener("change", () => {
  renderImportMapping();
  if (catalogImportRows.length) renderImportPreview();
});
catalogImportSheetSelect?.addEventListener("change", () => {
  try {
    loadImportSheet(catalogImportSheetSelect.value);
  } catch (error) {
    setElementStatus(catalogImportStatus, error.message, "error");
  }
});
catalogImportFileInput?.addEventListener("change", async () => {
  const file = catalogImportFileInput.files?.[0];
  if (!file) return;
  setElementStatus(catalogImportStatus, "Reading file...");
  try {
    await parseCatalogImportFile(file);
  } catch (error) {
    setElementStatus(catalogImportStatus, error.message, "error");
  }
});
catalogImportMapFields?.addEventListener("change", () => {
  if (catalogImportPreviewRows.length) renderImportPreview();
});
previewCatalogImportButton?.addEventListener("click", renderImportPreview);
confirmCatalogImportButton?.addEventListener("click", confirmCatalogImport);
resetCatalogImportButton?.addEventListener("click", resetCatalogImport);
refreshCatalogButton?.addEventListener("click", loadCatalogValues);
catalogCategoryFilter?.addEventListener("change", loadCatalogValues);
refreshLocationCatalogButton?.addEventListener("click", loadLocationCatalogValues);
sideFilter?.addEventListener("change", renderRows);
statusFilter?.addEventListener("change", renderRows);
viewModeSelect?.addEventListener("change", renderRows);
searchInput?.addEventListener("input", renderRows);
countryFilter?.addEventListener("change", renderRows);
stateFilter?.addEventListener("change", renderRows);
marketFilter?.addEventListener("change", renderRows);
regionFilter?.addEventListener("change", renderRows);
locationSearchInput?.addEventListener("input", renderRows);
clearLocationFiltersButton?.addEventListener("click", () => {
  if (countryFilter) countryFilter.value = "";
  if (stateFilter) stateFilter.value = "";
  if (marketFilter) marketFilter.value = "";
  if (regionFilter) regionFilter.value = "";
  if (locationSearchInput) locationSearchInput.value = "";
  renderRows();
});
adminLocationCountryFilter?.addEventListener("change", loadLocationCatalogValues);
adminLocationStateFilter?.addEventListener("input", queueLocationCatalogLoad);
adminLocationMarketFilter?.addEventListener("input", queueLocationCatalogLoad);
adminLocationRegionFilter?.addEventListener("input", queueLocationCatalogLoad);
adminLocationSearchInput?.addEventListener("input", queueLocationCatalogLoad);
clearAdminLocationFiltersButton?.addEventListener("click", () => {
  if (adminLocationCountryFilter) adminLocationCountryFilter.value = "";
  if (adminLocationStateFilter) adminLocationStateFilter.value = "";
  if (adminLocationMarketFilter) adminLocationMarketFilter.value = "";
  if (adminLocationRegionFilter) adminLocationRegionFilter.value = "";
  if (adminLocationSearchInput) adminLocationSearchInput.value = "";
  loadLocationCatalogValues();
});
catalogValueForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawValue = catalogRawValueInput?.value?.trim() || "";
  if (!rawValue) {
    setElementStatus(catalogStatus, "Write a catalog value first.", "error");
    return;
  }
  setElementStatus(catalogStatus, "Saving catalog value...");
  try {
    await saveCatalogValue({
      category: catalogCategorySelect?.value || "equipment",
      raw_value: rawValue,
      normalized_value: catalogNormalizedValueInput?.value?.trim() || rawValue,
      code: catalogCodeInput?.value?.trim() || "",
      note: catalogNoteInput?.value?.trim() || ""
    });
    catalogRawValueInput.value = "";
    catalogNormalizedValueInput.value = "";
    catalogCodeInput.value = "";
    catalogNoteInput.value = "";
    setElementStatus(catalogStatus, "Catalog value saved. It is now available in Staging and Rateware dropdowns.", "success");
    await loadCatalogValues();
  } catch (error) {
    setElementStatus(catalogStatus, error.message, "error");
  }
});
catalogValuesBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-catalog-archive]");
  if (!button) return;
  const row = currentCatalogValues.find((item) => item.id === button.dataset.catalogArchive);
  const label = row?.normalized_value || row?.raw_value || "this value";
  if (!window.confirm(`Archive manual catalog value "${label}"? It will stop appearing in new dropdown options.`)) return;
  button.disabled = true;
  setElementStatus(catalogStatus, "Archiving catalog value...");
  try {
    await archiveCatalogValue(button.dataset.catalogArchive);
    setElementStatus(catalogStatus, "Catalog value archived.", "success");
    await loadCatalogValues();
  } catch (error) {
    button.disabled = false;
    setElementStatus(catalogStatus, error.message, "error");
  }
});
locationCatalogForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = locationCatalogFormValues();
  if (!values.raw_value && !values.city && !values.zip_prefix) {
    setElementStatus(locationCatalogStatus, "Add a location value, city, or ZIP first.", "error");
    return;
  }
  setElementStatus(locationCatalogStatus, "Saving location...");
  try {
    await saveLocationCatalogValue(values);
    clearLocationCatalogForm();
    setElementStatus(locationCatalogStatus, "Location saved. It is now available for lane matching and autocomplete.", "success");
    await loadLocationCatalogValues();
    await refreshWorkbenchLocationOptions();
  } catch (error) {
    setElementStatus(locationCatalogStatus, error.message, "error");
  }
});
locationCatalogBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-location-archive]");
  if (!button) return;
  const row = currentLocationCatalogRows.find((item) => item.id === button.dataset.locationArchive);
  const label = row?.raw_value || "this location";
  if (!window.confirm(`Archive manual location "${label}"? It will stop appearing in new location matches.`)) return;
  button.disabled = true;
  setElementStatus(locationCatalogStatus, "Archiving location...");
  try {
    await archiveLocationCatalogValue(button.dataset.locationArchive);
    setElementStatus(locationCatalogStatus, "Location archived.", "success");
    await loadLocationCatalogValues();
    await refreshWorkbenchLocationOptions();
  } catch (error) {
    button.disabled = false;
    setElementStatus(locationCatalogStatus, error.message, "error");
  }
});
body?.addEventListener("click", (event) => {
  const applyButton = event.target.closest("[data-apply-catalog-match]");
  const aliasButton = event.target.closest("[data-apply-catalog-alias]");
  const tableRow = event.target.closest("[data-catalog-entry-index]");
  if (tableRow && !applyButton && !aliasButton) {
    activeEntryIndex = Number(tableRow.dataset.catalogEntryIndex);
    body.querySelectorAll("[data-catalog-entry-index]").forEach((row) => row.classList.toggle("is-active", row === tableRow));
    renderInspector(activeEntryIndex);
    return;
  }
  if (!applyButton && !aliasButton) return;
  applyCatalogMatch((applyButton || aliasButton).closest("[data-catalog-entry-index]"), { saveAlias: Boolean(aliasButton) });
});
inspectorBody?.addEventListener("click", (event) => {
  const useButton = event.target.closest("[data-inspector-use-candidate]");
  const applyButton = event.target.closest("[data-inspector-apply-candidate]");
  const aliasButton = event.target.closest("[data-inspector-alias-candidate]");
  if (!useButton && !applyButton && !aliasButton) return;
  const entry = currentEntries[activeEntryIndex];
  if (!entry) return;
  const index = Number((useButton || applyButton || aliasButton).dataset.inspectorUseCandidate
    ?? (useButton || applyButton || aliasButton).dataset.inspectorApplyCandidate
    ?? (useButton || applyButton || aliasButton).dataset.inspectorAliasCandidate);
  const candidate = locationCandidates(entry.row, entry.side, 8)[index];
  if (!candidate) return;
  const tableRow = body.querySelector(`[data-catalog-entry-index="${CSS.escape(String(activeEntryIndex))}"]`);
  const input = tableRow?.querySelector("[data-catalog-suggestion]");
  if (input) input.value = locationValue(candidate.option);
  if (useButton) return;
  applyCatalogMatch(tableRow, { saveAlias: Boolean(aliasButton), optionOverride: candidate.option });
});
