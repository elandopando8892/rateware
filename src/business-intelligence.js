import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { askCarrierIntelligence, fetchBusinessIntelligenceDrilldown, fetchBusinessIntelligencePivot, fetchCarrierRecommendations, promoteCarrierRecommendations } from "./business-intelligence-service.js";

const chatForm = document.querySelector("#bi-chat-form");
const promptInput = document.querySelector("#bi-prompt");
const submitButton = document.querySelector("#bi-submit-button");
const statusMessage = document.querySelector("#bi-status");
const modelStatus = document.querySelector("#bi-model-status");
const answerPanel = document.querySelector("#bi-answer");
const analystSummary = document.querySelector("#bi-analyst-summary");
const suggestedPivots = document.querySelector("#bi-suggested-pivots");
const dataGaps = document.querySelector("#bi-data-gaps");
const rfxShortlist = document.querySelector("#bi-rfx-shortlist");
const proposedActions = document.querySelector("#bi-proposed-actions");
const copyActionsButton = document.querySelector("#bi-copy-actions");
const resultsBody = document.querySelector("#bi-results-body");
const selectAll = document.querySelector("#bi-select-all");
const selectedCount = document.querySelector("#bi-selected-count");
const promoteSelectedButton = document.querySelector("#bi-promote-selected");
const copyListButton = document.querySelector("#bi-copy-list");
const metricRecommendations = document.querySelector("#bi-metric-recommendations");
const metricCandidates = document.querySelector("#bi-metric-candidates");
const metricRates = document.querySelector("#bi-metric-rates");
const metricSelected = document.querySelector("#bi-metric-selected");
const runRecommendationsButton = document.querySelector("#bi-run-recommendations");
const exportRecommendationsButton = document.querySelector("#bi-export-recommendations");
const recommendationStatus = document.querySelector("#bi-rec-status");
const runPivotButton = document.querySelector("#bi-run-pivot");
const copyPivotButton = document.querySelector("#bi-copy-pivot");
const exportPivotButton = document.querySelector("#bi-export-pivot");
const pivotHead = document.querySelector("#bi-pivot-head");
const pivotBody = document.querySelector("#bi-pivot-body");
const pivotStatus = document.querySelector("#bi-pivot-status");
const pivotTransactions = document.querySelector("#bi-pivot-transactions");
const pivotCarriers = document.querySelector("#bi-pivot-carriers");
const pivotAvgRate = document.querySelector("#bi-pivot-avg-rate");
const pivotRateRange = document.querySelector("#bi-pivot-rate-range");
const drilldownTitle = document.querySelector("#bi-drilldown-title");
const drilldownStatus = document.querySelector("#bi-drilldown-status");
const drilldownBody = document.querySelector("#bi-drilldown-body");
const exportDrilldownButton = document.querySelector("#bi-export-drilldown");

let currentRecommendations = [];
let currentPivot = null;
let currentDrilldown = null;
let currentAnalystResult = null;
const selectedVendorIds = new Set();

const PIVOT_DIMENSIONS = [
  ["", "None"],
  ["vendor", "Carrier"],
  ["vendor_domain", "Carrier domain"],
  ["vendor_stage", "Vendor base"],
  ["vendor_status", "Vendor status"],
  ["route", "Route"],
  ["corridor", "Corridor"],
  ["origin", "Origin"],
  ["destination", "Destination"],
  ["origin_market", "Origin market"],
  ["destination_market", "Destination market"],
  ["origin_state", "Origin state"],
  ["destination_state", "Destination state"],
  ["origin_country", "Origin country"],
  ["destination_country", "Destination country"],
  ["equipment", "Equipment"],
  ["trailer", "Trailer"],
  ["hazmat", "Hazmat"],
  ["temperature_controlled", "Temperature controlled"],
  ["operation", "Operation"],
  ["service", "Service"],
  ["mx_crossing", "MX crossing"],
  ["us_crossing", "US crossing"],
  ["border_pair", "Border pair"],
  ["quote_month", "Quote month"],
  ["currency", "Currency"],
  ["rate_status", "Rate status"]
];

const PIVOT_METRICS = [
  ["transaction_count", "Transactions"],
  ["distinct_carriers", "Distinct carriers"],
  ["all_in_rate", "All-in rate"],
  ["cost_per_mile", "Cost per mile"],
  ["cost_per_km", "Cost per km"],
  ["calculated_miles", "Calculated miles"],
  ["calculated_km", "Calculated km"],
  ["us_miles", "US miles"],
  ["mx_linehaul", "MX linehaul"],
  ["us_linehaul", "US linehaul"],
  ["fsc", "FSC"],
  ["border_crossing_fee", "Border fee"]
];

const BI_TEMPLATES = {
  "pareto-d2d": {
    rows: ["vendor", "corridor", ""],
    columns: ["operation", "service"],
    metric: "transaction_count",
    aggregation: "count",
    filters: { crossborder: true, d2d: true }
  },
  "cost-mile-corridor": {
    rows: ["corridor", "vendor", ""],
    columns: ["operation", "service"],
    metric: "cost_per_mile",
    aggregation: "avg",
    filters: { crossborder: true }
  },
  "border-crossing": {
    rows: ["border_pair", "vendor", ""],
    columns: ["operation", "service"],
    metric: "transaction_count",
    aggregation: "count",
    filters: { crossborder: true }
  },
  "equipment-service": {
    rows: ["equipment", "trailer", "service"],
    columns: ["operation", "vendor_stage"],
    metric: "transaction_count",
    aggregation: "count",
    filters: {}
  },
  "market-carriers": {
    rows: ["origin_market", "destination_market", "vendor"],
    columns: ["operation", ""],
    metric: "distinct_carriers",
    aggregation: "distinct",
    filters: {}
  },
  "data-quality": {
    rows: ["rate_status", "vendor_stage", "vendor"],
    columns: ["operation", "service"],
    metric: "transaction_count",
    aggregation: "count",
    filters: {}
  }
};

const RECOMMENDATION_TEMPLATES = {
  "fit-crossborder": {
    ranking_mode: "fit",
    limit: 30,
    min_transactions: 0,
    pivot: { filters: { crossborder: true } }
  },
  "pareto-d2d": {
    ranking_mode: "pareto",
    limit: 30,
    min_transactions: 1,
    pivot: { filters: { crossborder: true, d2d: true } }
  },
  "cost-mile": {
    ranking_mode: "cost_per_mile",
    limit: 30,
    min_transactions: 1,
    pivot: { filters: { crossborder: true } }
  },
  "cost-km": {
    ranking_mode: "cost_per_km",
    limit: 30,
    min_transactions: 1,
    pivot: { filters: {} }
  },
  "border-laredo": {
    ranking_mode: "transactions",
    limit: 30,
    min_transactions: 1,
    pivot: { filters: { crossborder: true, mx_crossing: "Nuevo Laredo", us_crossing: "Laredo" } }
  },
  "equipment-service": {
    ranking_mode: "fit",
    limit: 30,
    min_transactions: 0,
    pivot: { rows: ["equipment", "trailer", "service"], columns: ["operation"], filters: {} }
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function setStatus(message, tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function setRecommendationStatus(message, tone = "neutral") {
  if (!recommendationStatus) return;
  recommendationStatus.textContent = message;
  recommendationStatus.dataset.tone = tone;
}

function setModelStatus(value, tone = "muted") {
  if (!modelStatus) return;
  modelStatus.textContent = value;
  modelStatus.className = `status-pill ${tone}`;
}

function setPivotStatus(message, tone = "neutral") {
  if (!pivotStatus) return;
  pivotStatus.textContent = message;
  pivotStatus.dataset.tone = tone;
}

function setDrilldownStatus(message, tone = "neutral") {
  if (!drilldownStatus) return;
  drilldownStatus.textContent = message;
  drilldownStatus.dataset.tone = tone;
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fillSelect(selector, options, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.innerHTML = options.map(([optionValue, label]) => `<option value="${escapeHtml(optionValue)}">${escapeHtml(label)}</option>`).join("");
  element.value = value;
}

function setupPivotControls() {
  fillSelect("#bi-pivot-row-1", PIVOT_DIMENSIONS, "vendor");
  fillSelect("#bi-pivot-row-2", PIVOT_DIMENSIONS, "origin_market");
  fillSelect("#bi-pivot-row-3", PIVOT_DIMENSIONS, "");
  fillSelect("#bi-pivot-column-1", PIVOT_DIMENSIONS, "operation");
  fillSelect("#bi-pivot-column-2", PIVOT_DIMENSIONS, "service");
  fillSelect("#bi-pivot-metric", PIVOT_METRICS, "transaction_count");
  document.querySelector("#bi-pivot-aggregation").value = "count";
}

function setControl(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.value = value || "";
}

function setChecked(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.checked = Boolean(value);
}

function clearPivotFilters() {
  [
    "#bi-filter-search",
    "#bi-filter-vendor",
    "#bi-filter-route",
    "#bi-filter-corridor",
    "#bi-filter-origin-state",
    "#bi-filter-destination-state",
    "#bi-filter-equipment",
    "#bi-filter-trailer",
    "#bi-filter-operation",
    "#bi-filter-service",
    "#bi-filter-mx-crossing",
    "#bi-filter-us-crossing"
  ].forEach((selector) => setControl(selector, ""));
  setChecked("#bi-filter-crossborder", false);
  setChecked("#bi-filter-d2d", false);
}

function applyPivotConfig(config) {
  const rows = config.rows || [];
  const columns = config.columns || [];
  setControl("#bi-pivot-row-1", rows[0] || "");
  setControl("#bi-pivot-row-2", rows[1] || "");
  setControl("#bi-pivot-row-3", rows[2] || "");
  setControl("#bi-pivot-column-1", columns[0] || "");
  setControl("#bi-pivot-column-2", columns[1] || "");
  setControl("#bi-pivot-metric", config.metric || "transaction_count");
  setControl("#bi-pivot-aggregation", config.aggregation || "count");
  clearPivotFilters();
  const filters = config.filters || {};
  setControl("#bi-filter-search", filters.search || "");
  setControl("#bi-filter-vendor", filters.vendor || "");
  setControl("#bi-filter-route", filters.route || "");
  setControl("#bi-filter-corridor", filters.corridor || "");
  setControl("#bi-filter-origin-state", filters.origin_state || "");
  setControl("#bi-filter-destination-state", filters.destination_state || "");
  setControl("#bi-filter-equipment", filters.equipment || "");
  setControl("#bi-filter-trailer", filters.trailer || "");
  setControl("#bi-filter-operation", filters.operation || "");
  setControl("#bi-filter-service", filters.service || "");
  setControl("#bi-filter-mx-crossing", filters.mx_crossing || "");
  setControl("#bi-filter-us-crossing", filters.us_crossing || "");
  setChecked("#bi-filter-crossborder", filters.crossborder);
  setChecked("#bi-filter-d2d", filters.d2d);
}

function applyRecommendationTemplate(template) {
  if (template.pivot) {
    applyPivotConfig({
      rows: template.pivot.rows || ["vendor", "corridor", ""],
      columns: template.pivot.columns || ["operation", "service"],
      metric: template.pivot.metric || "transaction_count",
      aggregation: template.pivot.aggregation || "count",
      filters: template.pivot.filters || {}
    });
  }
  setControl("#bi-rec-ranking-mode", template.ranking_mode || "fit");
  setControl("#bi-rec-limit", template.limit || 30);
  setControl("#bi-rec-min-transactions", template.min_transactions || 0);
}

function readValue(selector) {
  return String(document.querySelector(selector)?.value || "").trim();
}

function readChecked(selector) {
  return Boolean(document.querySelector(selector)?.checked);
}

function readPivotConfig() {
  const rows = ["#bi-pivot-row-1", "#bi-pivot-row-2", "#bi-pivot-row-3"].map(readValue).filter(Boolean);
  const columns = ["#bi-pivot-column-1", "#bi-pivot-column-2"].map(readValue).filter(Boolean);
  const filters = {
    search: readValue("#bi-filter-search"),
    vendor: readValue("#bi-filter-vendor"),
    route: readValue("#bi-filter-route"),
    corridor: readValue("#bi-filter-corridor"),
    origin_state: readValue("#bi-filter-origin-state"),
    destination_state: readValue("#bi-filter-destination-state"),
    equipment: readValue("#bi-filter-equipment"),
    trailer: readValue("#bi-filter-trailer"),
    operation: readValue("#bi-filter-operation"),
    service: readValue("#bi-filter-service"),
    mx_crossing: readValue("#bi-filter-mx-crossing"),
    us_crossing: readValue("#bi-filter-us-crossing"),
    crossborder: readChecked("#bi-filter-crossborder"),
    d2d: readChecked("#bi-filter-d2d")
  };

  Object.keys(filters).forEach((key) => {
    if (!filters[key]) delete filters[key];
  });

  return {
    rows: rows.length ? rows : ["vendor"],
    columns,
    metric: readValue("#bi-pivot-metric") || "transaction_count",
    aggregation: readValue("#bi-pivot-aggregation") || "count",
    filters
  };
}

function readRecommendationConfig() {
  const pivotConfig = readPivotConfig();
  return {
    ranking_mode: readValue("#bi-rec-ranking-mode") || "fit",
    limit: Number(readValue("#bi-rec-limit")) || 30,
    min_transactions: Number(readValue("#bi-rec-min-transactions")) || 0,
    filters: pivotConfig.filters
  };
}

function pivotMetricLabel(result) {
  const metric = PIVOT_METRICS.find(([key]) => key === result.metric)?.[1] || result.metric;
  return `${metric} (${result.aggregation})`;
}

function renderPivot(result) {
  currentPivot = result;
  const rowLabels = (result.row_dimensions || []).map((dimension) => PIVOT_DIMENSIONS.find(([key]) => key === dimension)?.[1] || dimension);
  const columns = result.columns || [];
  const metricLabel = pivotMetricLabel(result);

  pivotTransactions.textContent = formatNumber(result.summary?.transactions);
  pivotCarriers.textContent = formatNumber(result.summary?.carriers);
  pivotAvgRate.textContent = moneyValue(result.summary?.avg_all_in_rate);
  pivotRateRange.textContent = `${moneyValue(result.summary?.min_all_in_rate)} - ${moneyValue(result.summary?.max_all_in_rate)}`;
  copyPivotButton.disabled = !(result.rows || []).length;
  exportPivotButton.disabled = !(result.rows || []).length;

  pivotHead.innerHTML = `
    <tr>
      ${rowLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}
      ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
      <th>Total ${escapeHtml(metricLabel)}</th>
    </tr>
  `;

  if (!(result.rows || []).length) {
    pivotBody.innerHTML = `
      <tr>
        <td colspan="${Math.max(2, rowLabels.length + columns.length + 1)}">
          <div class="empty-state">
            <strong>No matching rows</strong>
            <span>Relax filters or choose a broader dimension.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  pivotBody.innerHTML = result.rows.map((row) => `
    <tr>
      ${(row.row_values || []).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}
      ${columns.map((column) => `<td><button type="button" class="bi-cell-button" data-pivot-row="${escapeHtml(JSON.stringify(row.row_values || []))}" data-pivot-column="${escapeHtml(column)}">${escapeHtml(row.cells?.[column] ?? "-")}</button></td>`).join("")}
      <td><button type="button" class="bi-cell-button strong" data-pivot-row="${escapeHtml(JSON.stringify(row.row_values || []))}" data-pivot-column="Total">${escapeHtml(row.total ?? "-")}</button></td>
    </tr>
  `).join("");
}

async function runPivot() {
  runPivotButton.disabled = true;
  setPivotStatus("Building pivot...");

  try {
    await requirePrivatePage();
    const result = await fetchBusinessIntelligencePivot(readPivotConfig());
    renderPivot(result);
    setPivotStatus(`${formatNumber(result.summary?.transactions)} transaction(s), ${formatNumber((result.rows || []).length)} pivot row(s).`, "success");
  } catch (error) {
    setPivotStatus(error.message, "error");
  } finally {
    runPivotButton.disabled = false;
  }
}

async function copyPivot() {
  if (!currentPivot) return;
  const rowLabels = currentPivot.row_dimensions || [];
  const columns = currentPivot.columns || [];
  const header = [...rowLabels, ...columns, "total"].join("\t");
  const lines = (currentPivot.rows || []).map((row) => [
    ...(row.row_values || []),
    ...columns.map((column) => row.cells?.[column] ?? ""),
    row.total ?? ""
  ].join("\t"));
  await navigator.clipboard.writeText([header, ...lines].join("\n"));
  setPivotStatus("Pivot copied.", "success");
}

function exportPivotCsv() {
  if (!currentPivot) return;
  const rowLabels = currentPivot.row_dimensions || [];
  const columns = currentPivot.columns || [];
  const rows = [
    [...rowLabels, ...columns, "total"],
    ...(currentPivot.rows || []).map((row) => [
      ...(row.row_values || []),
      ...columns.map((column) => row.cells?.[column] ?? ""),
      row.total ?? ""
    ])
  ];
  downloadCsv("rateware-bi-pivot.csv", rows);
  setPivotStatus("Pivot CSV exported.", "success");
}

function renderDrilldown(result) {
  currentDrilldown = result;
  exportDrilldownButton.disabled = !(result.rows || []).length;
  drilldownTitle.textContent = [result.cell?.row_values?.join(" | "), result.cell?.column_value].filter(Boolean).join(" / ") || "Cell detail";

  if (!(result.rows || []).length) {
    drilldownBody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="empty-state">
            <strong>No rows in this cell</strong>
            <span>The selected value has no drilldown rows.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  drilldownBody.innerHTML = result.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.vendor || "-")}</td>
      <td>${escapeHtml([row.quote_date, row.rfx_id].filter(Boolean).join(" | ") || "-")}</td>
      <td>${escapeHtml([row.origin, row.destination].filter(Boolean).join(" -> ") || "-")}</td>
      <td>${escapeHtml([row.origin_market, row.destination_market].filter(Boolean).join(" -> ") || "-")}</td>
      <td>${escapeHtml([row.equipment, row.trailer].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(row.operation || "-")}</td>
      <td>${escapeHtml(row.service || "-")}</td>
      <td>${escapeHtml([row.mx_crossing, row.us_crossing].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml([row.all_in_rate, row.currency].filter(Boolean).join(" ") || "-")}</td>
      <td>${escapeHtml(row.cost_per_mile ?? "-")}</td>
      <td>${escapeHtml(row.cost_per_km ?? "-")}</td>
    </tr>
  `).join("");
}

async function runDrilldown(rowValues, columnValue) {
  setDrilldownStatus("Loading detail...");
  try {
    await requirePrivatePage();
    const result = await fetchBusinessIntelligenceDrilldown(readPivotConfig(), {
      row_values: rowValues,
      column_value: columnValue
    });
    renderDrilldown(result);
    setDrilldownStatus(`${formatNumber(result.total || 0)} source rate row(s).`, "success");
  } catch (error) {
    setDrilldownStatus(error.message, "error");
  }
}

function exportDrilldownCsv() {
  if (!currentDrilldown) return;
  const rows = [
    ["carrier", "quote", "rfx", "origin", "destination", "origin_market", "destination_market", "equipment", "trailer", "operation", "service", "mx_crossing", "us_crossing", "all_in", "currency", "cost_per_mile", "cost_per_km", "status"],
    ...(currentDrilldown.rows || []).map((row) => [
      row.vendor,
      row.quote_date,
      row.rfx_id,
      row.origin,
      row.destination,
      row.origin_market,
      row.destination_market,
      row.equipment,
      row.trailer,
      row.operation,
      row.service,
      row.mx_crossing,
      row.us_crossing,
      row.all_in_rate,
      row.currency,
      row.cost_per_mile,
      row.cost_per_km,
      row.status
    ])
  ];
  downloadCsv("rateware-bi-drilldown.csv", rows);
  setDrilldownStatus("Drilldown CSV exported.", "success");
}

function selectedRecommendations() {
  return currentRecommendations.filter((row) => row.vendor_id && selectedVendorIds.has(row.vendor_id));
}

function updateSelectionState() {
  const selectable = currentRecommendations.filter((row) => row.vendor_id);
  const selected = selectedRecommendations();
  selectedCount.textContent = `${selected.length} selected`;
  metricSelected.textContent = formatNumber(selected.length);
  promoteSelectedButton.disabled = selected.length === 0;
  copyListButton.disabled = currentRecommendations.length === 0;
  if (selectAll) {
    selectAll.checked = selectable.length > 0 && selected.length === selectable.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < selectable.length;
  }
}

function listItems(values = []) {
  if (!values.length) return '<span class="muted-text">-</span>';
  return `<ul>${values.slice(0, 4).map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function pivotFiltersToObject(filters) {
  if (!filters) return {};
  if (!Array.isArray(filters)) return { ...filters };
  return Object.fromEntries(filters
    .filter((item) => item?.key && item.value !== undefined && item.value !== "")
    .map((item) => {
      const text = String(item.value);
      const value = text.toLowerCase() === "true" ? true : text.toLowerCase() === "false" ? false : text;
      return [item.key, value];
    }));
}

function suggestedPivotConfig(pivot) {
  return {
    rows: pivot.rows || ["vendor"],
    columns: pivot.columns || [],
    metric: pivot.metric || "transaction_count",
    aggregation: pivot.aggregation || "count",
    filters: pivotFiltersToObject(pivot.filters)
  };
}

function analystCard(title, detail, extra = "", className = "") {
  return `
    <article${className ? ` class="${className}"` : ""}>
      <strong>${escapeHtml(title || "-")}</strong>
      <p>${escapeHtml(detail || "-")}</p>
      ${extra}
    </article>
  `;
}

function analystEmpty(message) {
  return `<article class="bi-empty-card">${escapeHtml(message)}</article>`;
}

function suggestedPivotMeta(pivot = {}) {
  const rows = (pivot.rows || []).join(", ") || "vendor";
  const columns = (pivot.columns || []).join(", ") || "none";
  const metric = PIVOT_METRICS.find(([key]) => key === pivot.metric)?.[1] || pivot.metric || "Transactions";
  return `Rows: ${rows} | Columns: ${columns} | Metric: ${metric}`;
}

function renderSuggestedPivotCard(pivot = {}, index) {
  const meta = suggestedPivotMeta(pivot);
  return analystCard(
    pivot.title || "Suggested pivot",
    pivot.purpose || "Validate the analyst answer with Rateware data.",
    `
      <span>${escapeHtml(meta)}</span>
      <button type="button" class="secondary small-button bi-pivot-suggestion-button" data-analyst-pivot="${index}">Run validation pivot</button>
    `,
    "bi-pivot-card"
  );
}

function renderDataGapCard(gap = {}) {
  return analystCard(
    gap.title || "Data gap",
    gap.impact || "This weakens the recommendation.",
    gap.suggested_fix ? `<span>${escapeHtml(gap.suggested_fix)}</span>` : "",
    "bi-gap-card"
  );
}

function renderRfxShortlistCard(item = {}) {
  return analystCard(
    item.vendor_name || "Carrier",
    item.reason || "Recommended for this RFx scenario.",
    `
      <div class="bi-shortlist-meta">
        <span>${escapeHtml(item.suggested_role || "Invite")}</span>
        <span>${escapeHtml(item.risk || "No visible risk")}</span>
        <em>Review only</em>
      </div>
    `,
    "bi-shortlist-card"
  );
}

function renderActionPlanCard(action = {}, index) {
  const priority = action.priority || "Medium";
  const confirmation = action.requires_confirmation === false ? "Advisory" : "Requires confirmation";
  return analystCard(
    `${index + 1}. ${priority} priority`,
    action.action || "Review the analyst recommendation.",
    `
      ${action.rationale ? `<span>${escapeHtml(action.rationale)}</span>` : ""}
      <em>${escapeHtml(confirmation)}</em>
    `,
    "bi-action-card"
  );
}

function renderAnalystLayer(result = {}) {
  currentAnalystResult = result;
  const summary = result.analyst_summary || {};
  const reasoning = Array.isArray(summary.reasoning) ? summary.reasoning : [];
  analystSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(summary.headline || result.answer || "AI Analyst response")}</strong>
      <span>${escapeHtml([summary.confidence_label ? `${summary.confidence_label} confidence` : "", summary.data_scope || result.filters?.data_scope || ""].filter(Boolean).join(" | "))}</span>
    </div>
    ${reasoning.length ? `<ul>${reasoning.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
  `;

  const pivots = Array.isArray(result.suggested_pivots) ? result.suggested_pivots : [];
  suggestedPivots.innerHTML = pivots.length
    ? pivots.map((pivot, index) => renderSuggestedPivotCard(pivot, index)).join("")
    : analystEmpty("No pivot suggestions returned.");

  const gaps = Array.isArray(result.data_gaps) ? result.data_gaps : [];
  dataGaps.innerHTML = gaps.length
    ? gaps.map((gap) => renderDataGapCard(gap)).join("")
    : analystEmpty("No data gaps returned.");

  const shortlist = Array.isArray(result.rfx_shortlist) ? result.rfx_shortlist : [];
  rfxShortlist.innerHTML = shortlist.length
    ? shortlist.map((item) => renderRfxShortlistCard(item)).join("")
    : analystEmpty("No RFx shortlist returned.");

  const actions = Array.isArray(result.proposed_actions) ? result.proposed_actions : [];
  proposedActions.innerHTML = actions.length
    ? actions.map((action, index) => renderActionPlanCard(action, index)).join("")
    : analystEmpty("No proposed actions returned.");

  copyActionsButton.disabled = !actions.length && !shortlist.length && !pivots.length;
}

function renderRecommendations(rows = []) {
  currentRecommendations = rows;
  selectedVendorIds.clear();
  metricRecommendations.textContent = formatNumber(rows.length);
  exportRecommendationsButton.disabled = !rows.length;

  if (!rows.length) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>No matching carriers</strong>
            <span>Try a broader instruction or import more vendors.</span>
          </div>
        </td>
      </tr>
    `;
    updateSelectionState();
    return;
  }

  resultsBody.innerHTML = rows
    .map((row) => {
      const vendorId = row.vendor_id || "";
      return `
        <tr>
          <td class="select-column">
            <input data-bi-select="${escapeHtml(vendorId)}" type="checkbox" ${vendorId ? "" : "disabled"} />
          </td>
          <td><strong>${escapeHtml(row.rank || "-")}</strong></td>
          <td>
            <div class="bi-carrier-cell">
              <strong>${escapeHtml(row.vendor_name || "Unnamed carrier")}</strong>
              <span>${escapeHtml([row.domain, row.primary_email].filter(Boolean).join(" | ") || "No contact")}</span>
              <small>${escapeHtml([row.base_stage, row.status].filter(Boolean).join(" | "))}</small>
            </div>
          </td>
          <td>
            <span class="bi-score">${escapeHtml(row.fit_score ?? 0)}</span>
          </td>
          <td>
            <strong>${escapeHtml(row.why || "")}</strong>
            ${listItems(row.evidence || [])}
            ${row.score_breakdown?.length ? `<div class="bi-score-breakdown">${row.score_breakdown.slice(0, 5).map((item) => `<span>${escapeHtml(item.label)} ${Number(item.value) > 0 ? "+" : ""}${escapeHtml(item.value)}: ${escapeHtml(item.detail)}</span>`).join("")}</div>` : ""}
          </td>
          <td>${listItems(row.gaps || [])}</td>
          <td>${escapeHtml(row.recommended_action || "-")}</td>
        </tr>
      `;
    })
    .join("");

  updateSelectionState();
}

function renderAnswer(result) {
  renderAnalystLayer(result);
  if (answerPanel) answerPanel.innerHTML = `
    <strong>${escapeHtml(result.answer || "Carrier intelligence response")}</strong>
    <span>${escapeHtml(result.filters?.focus?.join(", ") || "general fit")}</span>
    ${(result.next_actions || []).length ? `<ol>${result.next_actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol>` : ""}
  `;
  metricCandidates.textContent = formatNumber(result.candidate_count);
  metricRates.textContent = formatNumber(result.rate_signal_count);
  setModelStatus(result.model_status === "ai" ? "AI ranked" : "Fallback ranked", result.model_status === "ai" ? "success" : "muted");
  if (result.model_error) setStatus("AI fallback used. Recommendations are still ranked from Rateware data.", "error");
}

async function runIntelligenceQuery(message) {
  const prompt = String(message || promptInput.value || "").trim();
  if (!prompt) {
    setStatus("Add a carrier intelligence request.", "error");
    return;
  }

  submitButton.disabled = true;
  setModelStatus("Thinking", "neutral");
  setStatus("Analyzing carriers, coverage, contacts, and rate signals...");

  try {
    await requirePrivatePage();
    const result = await askCarrierIntelligence(prompt);
    renderAnswer(result);
    renderRecommendations(result.recommendations || []);
    if (!result.model_error) setStatus(`${formatNumber((result.recommendations || []).length)} recommendation(s) ready.`, "success");
  } catch (error) {
    setModelStatus("Unavailable", "danger");
    setStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function renderRecommendationResult(result) {
  renderAnswer(result);
  renderRecommendations(result.recommendations || []);
  metricCandidates.textContent = formatNumber(result.candidate_count);
  metricRates.textContent = formatNumber(result.rate_signal_count);
  setModelStatus("Engine ranked", "success");
}

async function runStructuredRecommendations() {
  runRecommendationsButton.disabled = true;
  setRecommendationStatus("Ranking carriers...");

  try {
    await requirePrivatePage();
    const result = await fetchCarrierRecommendations(readRecommendationConfig());
    renderRecommendationResult(result);
    setRecommendationStatus(`${formatNumber((result.recommendations || []).length)} carrier(s) ranked by ${result.filters?.ranking_mode || "fit"}.`, "success");
  } catch (error) {
    setRecommendationStatus(error.message, "error");
  } finally {
    runRecommendationsButton.disabled = false;
  }
}

async function promoteSelected() {
  const ids = selectedRecommendations().map((row) => row.vendor_id);
  if (!ids.length) return;

  promoteSelectedButton.disabled = true;
  setStatus("Moving selected carriers to Procurement Base...");

  try {
    await requirePrivatePage();
    const result = await promoteCarrierRecommendations(ids);
    setStatus(`${formatNumber(result.updated || 0)} carrier(s) moved to Procurement Base.`, "success");
    currentRecommendations = currentRecommendations.map((row) => ids.includes(row.vendor_id) ? { ...row, base_stage: "procurement", status: "active" } : row);
    selectedVendorIds.clear();
    renderRecommendations(currentRecommendations);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    updateSelectionState();
  }
}

async function copyRecommendations() {
  const lines = currentRecommendations.map((row) => [
    row.rank,
    row.vendor_name,
    row.domain || "",
    row.primary_email || "",
    row.fit_score,
    row.base_stage || "",
    row.status || "",
    row.why || ""
  ].join("\t"));
  const text = ["Rank\tCarrier\tDomain\tEmail\tFit\tBase\tStatus\tWhy", ...lines].join("\n");
  await navigator.clipboard.writeText(text);
  setStatus("Recommendation list copied.", "success");
}

async function copyAnalystActionPlan() {
  if (!currentAnalystResult) return;
  const summary = currentAnalystResult.analyst_summary || {};
  const sections = [
    ["AI Analyst Summary", [summary.headline, summary.confidence_label, ...(summary.reasoning || [])]],
    ["Suggested Pivots", (currentAnalystResult.suggested_pivots || []).map((item) => `${item.title}: ${item.purpose}`)],
    ["Data Gaps", (currentAnalystResult.data_gaps || []).map((item) => `${item.title}: ${item.impact} Fix: ${item.suggested_fix}`)],
    ["RFx Shortlist", (currentAnalystResult.rfx_shortlist || []).map((item) => `${item.vendor_name} (${item.suggested_role}): ${item.reason}. Risk: ${item.risk}`)],
    ["Proposed Actions", (currentAnalystResult.proposed_actions || []).map((item) => `${item.priority}: ${item.action}. ${item.rationale}`)]
  ];
  const text = sections
    .map(([title, values]) => [`${title}:`, ...(values || []).filter(Boolean).map((value) => `- ${value}`)].join("\n"))
    .join("\n\n");
  await navigator.clipboard.writeText(text);
  setStatus("AI Analyst action plan copied.", "success");
}

function exportRecommendationsCsv() {
  if (!currentRecommendations.length) return;
  const rows = [
    ["rank", "carrier", "domain", "email", "fit_score", "base_stage", "status", "why", "linked_rates", "approved_rates", "crossborder_rates", "d2d_rates", "avg_all_in", "avg_cost_per_mile", "avg_cost_per_km", "evidence", "gaps", "score_breakdown"],
    ...currentRecommendations.map((row) => [
      row.rank,
      row.vendor_name,
      row.domain,
      row.primary_email,
      row.fit_score,
      row.base_stage,
      row.status,
      row.why,
      row.metrics?.linked_rates,
      row.metrics?.approved_rates,
      row.metrics?.crossborder_rates,
      row.metrics?.d2d_import_export_rates,
      row.metrics?.avg_all_in_rate,
      row.metrics?.avg_cost_per_mile,
      row.metrics?.avg_cost_per_km,
      (row.evidence || []).join(" | "),
      (row.gaps || []).join(" | "),
      (row.score_breakdown || []).map((item) => `${item.label} ${item.value}: ${item.detail}`).join(" | ")
    ])
  ];
  downloadCsv("rateware-carrier-recommendations.csv", rows);
  setRecommendationStatus("Recommendations CSV exported.", "success");
}

initAuthControls();
setupPivotControls();
requirePrivatePage()
  .then(async () => {
    await applyPermissionState("#bi-submit-button, #bi-promote-selected, #bi-copy-list, #bi-run-recommendations, #bi-export-recommendations, #bi-run-pivot, #bi-copy-pivot, #bi-export-pivot, #bi-export-drilldown", "business-intelligence:use");
    await runPivot();
  })
  .catch((error) => setStatus(error.message, "error"));

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runIntelligenceQuery();
});

document.querySelectorAll("[data-bi-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.biPrompt || "";
    runIntelligenceQuery(promptInput.value);
  });
});

resultsBody?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-bi-select]");
  if (!input) return;
  if (input.checked) selectedVendorIds.add(input.dataset.biSelect);
  else selectedVendorIds.delete(input.dataset.biSelect);
  updateSelectionState();
});

selectAll?.addEventListener("change", () => {
  selectedVendorIds.clear();
  if (selectAll.checked) {
    currentRecommendations.filter((row) => row.vendor_id).forEach((row) => selectedVendorIds.add(row.vendor_id));
  }
  resultsBody.querySelectorAll("[data-bi-select]").forEach((input) => {
    input.checked = selectedVendorIds.has(input.dataset.biSelect);
  });
  updateSelectionState();
});

promoteSelectedButton?.addEventListener("click", promoteSelected);
copyListButton?.addEventListener("click", copyRecommendations);
copyActionsButton?.addEventListener("click", copyAnalystActionPlan);
runRecommendationsButton?.addEventListener("click", runStructuredRecommendations);
exportRecommendationsButton?.addEventListener("click", exportRecommendationsCsv);
runPivotButton?.addEventListener("click", runPivot);
copyPivotButton?.addEventListener("click", copyPivot);
exportPivotButton?.addEventListener("click", exportPivotCsv);
exportDrilldownButton?.addEventListener("click", exportDrilldownCsv);

document.querySelectorAll("[data-bi-template]").forEach((button) => {
  button.addEventListener("click", async () => {
    const template = BI_TEMPLATES[button.dataset.biTemplate];
    if (!template) return;
    applyPivotConfig(template);
    setPivotStatus(`Template loaded: ${button.textContent}.`);
    await runPivot();
  });
});

document.querySelectorAll("[data-rec-template]").forEach((button) => {
  button.addEventListener("click", async () => {
    const template = RECOMMENDATION_TEMPLATES[button.dataset.recTemplate];
    if (!template) return;
    applyRecommendationTemplate(template);
    setRecommendationStatus(`Template loaded: ${button.textContent}.`);
    await runStructuredRecommendations();
  });
});

suggestedPivots?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-analyst-pivot]");
  if (!button || !currentAnalystResult) return;
  const pivot = currentAnalystResult.suggested_pivots?.[Number(button.dataset.analystPivot)];
  if (!pivot) return;
  applyPivotConfig(suggestedPivotConfig(pivot));
  setPivotStatus(`Analyst validation pivot: ${pivot.title}.`);
  await runPivot();
});

pivotBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pivot-row]");
  if (!button) return;
  let rowValues = [];
  try {
    rowValues = JSON.parse(button.dataset.pivotRow || "[]");
  } catch {
    rowValues = [];
  }
  runDrilldown(rowValues, button.dataset.pivotColumn || "Total");
});

document.querySelector("#bi-pivot-metric")?.addEventListener("change", () => {
  const metric = readValue("#bi-pivot-metric");
  const aggregation = document.querySelector("#bi-pivot-aggregation");
  if (!aggregation) return;
  if (metric === "transaction_count") aggregation.value = "count";
  else if (metric === "distinct_carriers") aggregation.value = "distinct";
  else if (["all_in_rate", "cost_per_mile", "cost_per_km", "calculated_miles", "calculated_km", "us_miles", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].includes(metric)) aggregation.value = "avg";
});
