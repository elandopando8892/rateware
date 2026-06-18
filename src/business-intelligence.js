import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { askCarrierIntelligence, fetchBusinessIntelligencePivot, promoteCarrierRecommendations } from "./business-intelligence-service.js";

const chatForm = document.querySelector("#bi-chat-form");
const promptInput = document.querySelector("#bi-prompt");
const submitButton = document.querySelector("#bi-submit-button");
const statusMessage = document.querySelector("#bi-status");
const modelStatus = document.querySelector("#bi-model-status");
const answerPanel = document.querySelector("#bi-answer");
const resultsBody = document.querySelector("#bi-results-body");
const selectAll = document.querySelector("#bi-select-all");
const selectedCount = document.querySelector("#bi-selected-count");
const promoteSelectedButton = document.querySelector("#bi-promote-selected");
const copyListButton = document.querySelector("#bi-copy-list");
const metricRecommendations = document.querySelector("#bi-metric-recommendations");
const metricCandidates = document.querySelector("#bi-metric-candidates");
const metricRates = document.querySelector("#bi-metric-rates");
const metricSelected = document.querySelector("#bi-metric-selected");
const runPivotButton = document.querySelector("#bi-run-pivot");
const copyPivotButton = document.querySelector("#bi-copy-pivot");
const pivotHead = document.querySelector("#bi-pivot-head");
const pivotBody = document.querySelector("#bi-pivot-body");
const pivotStatus = document.querySelector("#bi-pivot-status");
const pivotTransactions = document.querySelector("#bi-pivot-transactions");
const pivotCarriers = document.querySelector("#bi-pivot-carriers");
const pivotAvgRate = document.querySelector("#bi-pivot-avg-rate");
const pivotRateRange = document.querySelector("#bi-pivot-rate-range");

let currentRecommendations = [];
let currentPivot = null;
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

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
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
      ${columns.map((column) => `<td>${escapeHtml(row.cells?.[column] ?? "-")}</td>`).join("")}
      <td><strong>${escapeHtml(row.total ?? "-")}</strong></td>
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

function renderRecommendations(rows = []) {
  currentRecommendations = rows;
  selectedVendorIds.clear();
  metricRecommendations.textContent = formatNumber(rows.length);

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
  answerPanel.innerHTML = `
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

initAuthControls();
setupPivotControls();
requirePrivatePage()
  .then(async () => {
    await applyPermissionState("#bi-submit-button, #bi-promote-selected, #bi-copy-list, #bi-run-pivot, #bi-copy-pivot", "business-intelligence:use");
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
runPivotButton?.addEventListener("click", runPivot);
copyPivotButton?.addEventListener("click", copyPivot);

document.querySelector("#bi-pivot-metric")?.addEventListener("change", () => {
  const metric = readValue("#bi-pivot-metric");
  const aggregation = document.querySelector("#bi-pivot-aggregation");
  if (!aggregation) return;
  if (metric === "transaction_count") aggregation.value = "count";
  else if (metric === "distinct_carriers") aggregation.value = "distinct";
  else if (["all_in_rate", "cost_per_mile", "cost_per_km", "calculated_miles", "calculated_km", "us_miles", "mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].includes(metric)) aggregation.value = "avg";
});
