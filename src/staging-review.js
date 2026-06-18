import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { installSpreadsheetGrid } from "./spreadsheet-grid.js";
import { archiveStagingRows, enrichStagingLocationZips, fetchStagingOptions, fetchStagingRows, matchStagingVendors, removeStagingRows, renormalizeStagingRows, updateStagingRow } from "./staging-service.js";

const body = document.querySelector("#staging-body");
const refreshButton = document.querySelector("#refresh-staging-button");
const clearFiltersButton = document.querySelector("#clear-staging-filters");
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
const bulkMatchVendorsButton = document.querySelector("#bulk-match-vendors-button");
const bulkApproveButton = document.querySelector("#bulk-approve-button");
const bulkRejectButton = document.querySelector("#bulk-reject-button");
const bulkEnrichZipsButton = document.querySelector("#bulk-enrich-zips-button");
const bulkRenormalizeButton = document.querySelector("#bulk-renormalize-button");
const bulkArchiveButton = document.querySelector("#bulk-archive-button");
const bulkRemoveButton = document.querySelector("#bulk-remove-button");
const bulkActionStatus = document.querySelector("#bulk-action-status");
const columnFilterInputs = document.querySelectorAll("[data-staging-column-filter]");
const clearColumnFiltersButton = document.querySelector("#clear-staging-column-filters");
const stagingMetricVisible = document.querySelector("#staging-metric-visible");
const stagingMetricLocation = document.querySelector("#staging-metric-location");
const stagingMetricRate = document.querySelector("#staging-metric-rate");
const stagingMetricSelected = document.querySelector("#staging-metric-selected");
const reviewFilterButtons = document.querySelectorAll("[data-staging-filter]");
let currentRows = [];
let loadedRows = [];
let activeRowId = null;
const selectedRowIds = new Set();
let activeReviewFilter = "all";
const autoSaveTimers = new Map();
let stagingOptions = {
  categories: {},
  vendors: [],
  locations: [],
  mx_crossings: [],
  us_crossings: [],
  currencies: ["USD", "MXN", "CAD"]
};
const STAGING_COLSPAN = 32;

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
  const inputType = options.type || (options.money ? "number" : "text");
  const step = options.step || (options.money ? "0.01" : "");
  return `<input class="staging-input ${widthClass}" data-field="${field}" type="${inputType}" value="${escapeHtml(value)}" ${options.list ? `list="${escapeHtml(options.list)}"` : ""} ${options.min ? `min="${escapeHtml(options.min)}"` : ""} ${options.max ? `max="${escapeHtml(options.max)}"` : ""} ${step ? `step="${escapeHtml(step)}"` : ""} ${options.money ? 'inputmode="decimal"' : ""} />`;
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
  setTableField(tableRow, `${prefix}_match_reason`, "manual catalog selection");
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

function setBulkStatus(message, tone = "neutral") {
  bulkActionStatus.textContent = message;
  bulkActionStatus.dataset.tone = tone;
}

function updateBulkControls() {
  const selectedCount = selectedRows().length;
  const totalRows = body.querySelectorAll("[data-row-id]").length;
  bulkSelectionCount.textContent = `${selectedCount} selected`;
  if (stagingMetricSelected) stagingMetricSelected.textContent = String(selectedCount);
  bulkSaveButton.disabled = selectedCount === 0;
  if (bulkMatchVendorsButton) bulkMatchVendorsButton.disabled = selectedCount === 0;
  bulkApproveButton.disabled = selectedCount === 0;
  bulkRejectButton.disabled = selectedCount === 0;
  if (bulkEnrichZipsButton) bulkEnrichZipsButton.disabled = selectedCount === 0;
  if (bulkRenormalizeButton) bulkRenormalizeButton.disabled = selectedCount === 0;
  bulkArchiveButton.disabled = selectedCount === 0;
  bulkRemoveButton.disabled = selectedCount === 0;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
  updateReviewMetrics();
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

function needsNumericRate(row) {
  return !hasNumericValue(row.all_in_rate) && !hasNumericValue(row.mx_linehaul) && !hasNumericValue(row.us_linehaul);
}

function hasSplitRate(row) {
  return ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].some((field) => hasNumericValue(row[field]));
}

function rowReviewIssues(row) {
  const issues = [];
  if (!row.vendors?.vendor_name) issues.push({ tone: "warning", label: "No vendor match" });
  if (needsLocationMatch(row)) issues.push({ tone: "danger", label: "Needs location" });
  if (needsNumericRate(row)) issues.push({ tone: "danger", label: "Needs rate" });
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
  if (needsNumericRate(row) || needsLocationMatch(row)) return "needs-review";
  if (rowAuditFlags(row).length || rowExtractionWarnings(row).length) return "has-warning";
  if (!row.vendors?.vendor_name || !row.quote_date || !row.weekly_capacity) return "has-warning";
  return "";
}

function validationRow(baseRow = {}, patch = {}) {
  return { ...baseRow, ...patch };
}

function approvalBlockers(row) {
  const blockers = [];
  if (needsNumericRate(row)) blockers.push("numeric rate");
  if (needsLocationMatch(row)) blockers.push("location match");
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

function applyReviewFilter(rows = loadedRows) {
  if (activeReviewFilter === "needs-location") return rows.filter(needsLocationMatch);
  if (activeReviewFilter === "needs-rate") return rows.filter(needsNumericRate);
  if (activeReviewFilter === "all-in") return rows.filter((row) => hasNumericValue(row.all_in_rate));
  if (activeReviewFilter === "split-rate") return rows.filter(hasSplitRate);
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
    .map((input) => [input.dataset.stagingColumnFilter, String(input.value || "").trim().toLowerCase()])
    .filter(([, value]) => value);

  if (!filters.length) return rows;
  return rows.filter((row) => filters.every(([field, value]) => columnFilterText(row, field).toLowerCase().includes(value)));
}

function visibleStagingRows() {
  return applyColumnFilters(applyReviewFilter(loadedRows));
}

function updateReviewFilters() {
  reviewFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stagingFilter === activeReviewFilter);
  });
}

function updateReviewMetrics() {
  if (stagingMetricVisible) stagingMetricVisible.textContent = String(currentRows.length);
  if (stagingMetricLocation) stagingMetricLocation.textContent = String(loadedRows.filter(needsLocationMatch).length);
  if (stagingMetricRate) stagingMetricRate.textContent = String(loadedRows.filter(needsNumericRate).length);
  if (stagingMetricSelected) stagingMetricSelected.textContent = String(selectedRows().length);
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
  if (needsLocationMatch(row)) {
    items.push({
      tone: "danger",
      title: "Resolve origin and destination",
      detail: "Choose catalog-backed cities so ZIP/state/market can be matched."
    });
  }
  if (!row.vendors?.vendor_name) {
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

function renderRowDetail(row) {
  const legs = Array.isArray(row.rateware_lane_legs)
    ? row.rateware_lane_legs.slice().sort((a, b) => Number(a.leg_sequence || 0) - Number(b.leg_sequence || 0))
    : [];

  rowDetail.innerHTML = `
    ${renderDrawerBrief(row)}
    ${renderFixChecklist(row)}
    ${renderExtractionAudit(row)}
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
  `;
}

function renderRows(rows) {
  currentRows = rows;
  renderDatalists();
  updateReviewFilters();

  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="${STAGING_COLSPAN}"><div class="empty-state"><strong>No staging rows found</strong><span>Interpret uploaded quotes to create rows for review.</span><a href="./upload-history.html">Open upload history</a></div></td></tr>`;
    updateBulkControls();
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr class="${escapeHtml(rowQualityClass(row))}" data-row-id="${escapeHtml(row.id)}">
          <td class="select-column">
            <input data-select-row="${escapeHtml(row.id)}" type="checkbox" aria-label="Select staging row" ${selectedRowIds.has(row.id) ? "checked" : ""} />
          </td>
          <td class="vendor-review-cell">
            ${row.vendors?.vendor_name ? `<strong>${escapeHtml(row.vendors.vendor_name)}</strong>` : ""}
            ${inputCell(row, "vendor_domain", { wide: true, list: "staging-vendor-options" })}
            ${row.vendors?.vendor_name ? `<span class="match-pill">${escapeHtml(row.vendors.base_stage || "matched")}</span>` : ""}
            ${renderReviewChips(row)}
          </td>
          <td>${inputCell(row, "quote_date", { type: "date", short: true })}</td>
          <td>${inputCell(row, "rfx_id", { short: true })}</td>
          <td>${datalistCell(row, "origin", stagingOptions.locations, { wide: true })}${hiddenLocationFields(row, "origin")}</td>
          <td>${inputCell(row, "origin_zip_prefix", { short: true, list: "staging-zip-options" })}</td>
          <td>${inputCell(row, "origin_state", { short: true, list: "staging-state-options" })}</td>
          <td>${inputCell(row, "origin_market", { wide: true, list: "staging-market-options" })}</td>
          <td>${inputCell(row, "origin_region", { wide: true, list: "staging-region-options" })}</td>
          <td>${datalistCell(row, "destination", stagingOptions.locations, { wide: true })}${hiddenLocationFields(row, "destination")}</td>
          <td>${inputCell(row, "destination_zip_prefix", { short: true, list: "staging-zip-options" })}</td>
          <td>${inputCell(row, "destination_state", { short: true, list: "staging-state-options" })}</td>
          <td>${inputCell(row, "destination_market", { wide: true, list: "staging-market-options" })}</td>
          <td>${inputCell(row, "destination_region", { wide: true, list: "staging-region-options" })}</td>
          <td>${selectCell(row, "equipment", stagingOptions.categories.equipment || [], { short: true })}</td>
          <td>${selectCell(row, "trailer", stagingOptions.categories.trailer || [], { short: true })}</td>
          <td>${checkboxCell(row, "hazmat", "Hazmat")}</td>
          <td>${checkboxCell(row, "temperature_controlled", "Temperature controlled")}</td>
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
  document.querySelector("#edit-hazmat").checked = Boolean(row.hazmat);
  document.querySelector("#edit-temperature-controlled").checked = Boolean(row.temperature_controlled);
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
    patch[input.dataset.field] = input.matches('input[type="checkbox"]') ? input.checked : input.value;
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
  setRowStatus(id, "Saving...");

  try {
    await ensureSignedIn();
    const updated = await updateStagingRow(id, readInlinePatch(tableRow, status));
    replaceStoredRow(updated);
    tableRow.classList.remove("dirty-row");
    setRowStatus(id, status ? `Marked ${status.replace("_", " ")}` : "Saved", "success");
    return updated;
  } catch (error) {
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
    await loadRows();
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function runBulkMatchVendors() {
  const rows = selectedRows();
  if (!rows.length) return;
  const ids = rows.map((row) => row.dataset.rowId);

  setBulkStatus(`Matching vendors for ${ids.length} rows...`);
  if (bulkMatchVendorsButton) bulkMatchVendorsButton.disabled = true;

  try {
    await ensureSignedIn();
    const result = await matchStagingVendors(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setBulkStatus(`${result.updated || 0} rows linked to vendors.`, "success");
    await loadRows();
  } catch (error) {
    setBulkStatus(error.message, "error");
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
      vendors: options.vendors || [],
      locations: options.locations || [],
      mx_crossings: options.mx_crossings || [],
      us_crossings: options.us_crossings || [],
      currencies: options.currencies || ["USD", "MXN", "CAD"]
    };
    loadedRows = rows;
    renderRows(visibleStagingRows());
    await applyPermissionState("[data-save-id], [data-approve-id], [data-reject-id], #save-staging-button, #approve-staging-button, #reject-staging-button, #bulk-save-button, #bulk-match-vendors-button, #bulk-approve-button, #bulk-reject-button, #bulk-enrich-zips-button, #bulk-renormalize-button, #bulk-archive-button, #bulk-remove-button", "staging:approve");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${STAGING_COLSPAN}">Could not load staging rows. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function clearStagingFilters() {
  statusFilter.value = "pending_review";
  activeReviewFilter = "all";
  columnFilterInputs.forEach((input) => {
    input.value = "";
  });
  selectedRowIds.clear();
  setBulkStatus("");
  drawer.classList.add("hidden");
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
    await loadRows();
  } catch (error) {
    button.disabled = false;
    setRowStatus(id, error.message, "error");
  }
});

body.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  const tableRow = field.closest("[data-row-id]");
  applySuggestionFromField(tableRow, field.dataset.field, field.value);
  markStagingRowDirty(tableRow);
  scheduleStagingAutoSave(tableRow);
});

body.addEventListener("change", (event) => {
  const field = event.target.closest("[data-field]");
  if (field) {
    const tableRow = field.closest("[data-row-id]");
    applySuggestionFromField(tableRow, field.dataset.field, field.value);
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
  container: body,
  rowSelector: "[data-row-id]",
  cellSelector: "[data-field]",
  saveRow: saveStagingTableRow,
  onRowsChanged: (rows) => rows.forEach((row) => scheduleStagingAutoSave(row, 1000))
});

refreshButton.addEventListener("click", loadRows);
clearFiltersButton?.addEventListener("click", clearStagingFilters);
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
    renderRows(visibleStagingRows());
  });
});
columnFilterInputs.forEach((input) => {
  input.addEventListener("input", () => {
    selectedRowIds.clear();
    setBulkStatus("");
    renderRows(visibleStagingRows());
  });
});
clearColumnFiltersButton?.addEventListener("click", () => {
  columnFilterInputs.forEach((input) => {
    input.value = "";
  });
  selectedRowIds.clear();
  setBulkStatus("");
  renderRows(visibleStagingRows());
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
bulkMatchVendorsButton?.addEventListener("click", runBulkMatchVendors);
bulkApproveButton?.addEventListener("click", () => runBulkAction("approved"));
bulkRejectButton?.addEventListener("click", () => runBulkAction("rejected"));
bulkEnrichZipsButton?.addEventListener("click", runBulkEnrichZips);
bulkRenormalizeButton?.addEventListener("click", runBulkRenormalize);
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
