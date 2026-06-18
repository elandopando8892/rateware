import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { askCarrierIntelligence, promoteCarrierRecommendations } from "./business-intelligence-service.js";

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

let currentRecommendations = [];
const selectedVendorIds = new Set();

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
requirePrivatePage()
  .then(() => applyPermissionState("#bi-submit-button, #bi-promote-selected, #bi-copy-list", "business-intelligence:use"))
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
