import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import { fetchVendors } from "./vendor-service.js";
import {
  createVendorImprovementCase,
  fetchVendorImprovementCases,
  updateVendorImprovementCase,
  upsertVendorValueScorecard
} from "./vendor-improvement-service.js";

const CASE_TYPES = [
  ["service_quality", "Service quality"],
  ["cost_variance", "Cost variance"],
  ["capacity_commitment", "Capacity commitment"],
  ["compliance", "Compliance"],
  ["documentation", "Documentation"],
  ["technology", "Technology / integration"],
  ["claims", "Claims"],
  ["billing", "Billing"],
  ["communication", "Communication"],
  ["strategic_growth", "Strategic growth"]
];

const STATUSES = [
  ["open", "Open"],
  ["define", "Define"],
  ["measure", "Measure"],
  ["analyze", "Analyze"],
  ["improve", "Improve"],
  ["control", "Control"],
  ["resolved", "Resolved"],
  ["archived", "Archived"]
];

const TIERS = [
  ["watchlist", "Watchlist"],
  ["tactical", "Tactical"],
  ["strategic", "Strategic"],
  ["collaborative", "Collaborative"]
];

const refreshButton = document.querySelector("#refresh-vendor-ci");
const statusFilter = document.querySelector("#ci-status-filter");
const typeFilter = document.querySelector("#ci-type-filter");
const tierFilter = document.querySelector("#ci-tier-filter");
const searchInput = document.querySelector("#ci-search");
const clearButton = document.querySelector("#clear-ci-filters");
const statusMessage = document.querySelector("#ci-status-message");
const createForm = document.querySelector("#ci-create-form");
const vendorSelect = document.querySelector("#ci-vendor-select");
const titleInput = document.querySelector("#ci-title");
const caseTypeInput = document.querySelector("#ci-case-type");
const severityInput = document.querySelector("#ci-severity");
const targetTierInput = document.querySelector("#ci-target-tier");
const dueDateInput = document.querySelector("#ci-due-date");
const vendorRequestInput = document.querySelector("#ci-vendor-request");
const caseBody = document.querySelector("#ci-case-body");
const scorecardBody = document.querySelector("#ci-scorecard-body");
const playbooksContainer = document.querySelector("#ci-playbooks");
const valueCurveContainer = document.querySelector("#ci-value-curve");

const metricOpen = document.querySelector("#ci-open");
const metricCritical = document.querySelector("#ci-critical");
const metricDueSoon = document.querySelector("#ci-due-soon");
const metricCollaborative = document.querySelector("#ci-collaborative");
const metricAverageScore = document.querySelector("#ci-average-score");

let vendorRows = [];
let caseRows = [];
let scorecardRows = [];
let playbookRows = [];
let activeTab = "cases";
let searchTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function labelFor(items, value, fallback = "-") {
  return items.find(([id]) => id === value)?.[1] || fallback;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function scoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function setStatus(message = "", tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = tone === "error" ? humanizeError(message) : message;
  statusMessage.dataset.tone = tone;
}

function fillSelect(select, rows, selectedValue = "") {
  if (!select) return;
  select.innerHTML = rows
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function vendorLabel(row) {
  return row.vendor_name || row.name || row.legal_name || row.domain || "Unnamed vendor";
}

function renderVendorOptions() {
  if (!vendorSelect) return;
  const options = vendorRows.map((row) => `
    <option value="${escapeHtml(row.id)}">${escapeHtml(vendorLabel(row))}${row.domain ? ` (${escapeHtml(row.domain)})` : ""}</option>
  `);
  vendorSelect.innerHTML = `<option value="">Choose vendor</option>${options.join("")}`;
}

function readFilters() {
  return {
    status: statusFilter?.value || "all",
    case_type: typeFilter?.value || "all",
    tier: tierFilter?.value || "all",
    search: searchInput?.value || "",
    limit: 1000
  };
}

function renderMetrics(summary = {}) {
  metricOpen.textContent = String(summary.open_active || 0);
  metricCritical.textContent = String(summary.critical || 0);
  metricDueSoon.textContent = String(summary.due_soon || 0);
  metricCollaborative.textContent = String(summary.collaborative || 0);
  metricAverageScore.textContent = String(scoreValue(summary.average_value_score));
}

function caseTone(row) {
  if (row.severity === "critical") return "danger";
  if (row.severity === "high") return "warning";
  if (row.status === "resolved") return "success";
  if (row.status === "archived") return "muted";
  return "neutral";
}

function renderCases() {
  if (!caseBody) return;
  if (!caseRows.length) {
    caseBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state compact-empty">
            <strong>No continuous improvement cases in current filters</strong>
            <span>Create a case when a carrier needs to fix a requirement, close an operational gap, or move up the value curve.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  caseBody.innerHTML = caseRows.map((row) => `
    <tr data-ci-case-id="${escapeHtml(row.id)}">
      <td>
        <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
        <small>${escapeHtml(row.vendor_domain || row.vendor_email || "-")}</small>
        <span class="status-pill neutral">${escapeHtml(labelFor(TIERS, row.current_tier || row.tier_at_open, "Tactical"))}</span>
      </td>
      <td>
        <strong>${escapeHtml(row.title)}</strong>
        <small>${escapeHtml(row.vendor_request || row.description || "No vendor request documented")}</small>
      </td>
      <td>${escapeHtml(labelFor(CASE_TYPES, row.case_type, row.case_type))}</td>
      <td>
        <strong>${escapeHtml((row.methodology || "dmaic").toUpperCase())}</strong>
        <small>${escapeHtml(row.next_step || "Define problem, measure impact, confirm action owner.")}</small>
      </td>
      <td>
        <select data-ci-case-field="status">
          ${STATUSES.map(([status, label]) => `<option value="${status}" ${row.status === status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </td>
      <td>
        <select data-ci-case-field="severity">
          ${["critical", "high", "medium", "low"].map((severity) => `<option value="${severity}" ${row.severity === severity ? "selected" : ""}>${severity}</option>`).join("")}
        </select>
        <span class="status-pill ${caseTone(row)}">${escapeHtml(row.severity || "medium")}</span>
      </td>
      <td>${escapeHtml(formatDate(row.due_date))}</td>
      <td>
        <div class="ci-action-plan">
          <small>Root cause: ${escapeHtml(row.root_cause || "pending")}</small>
          <small>Corrective: ${escapeHtml(row.corrective_action || "pending")}</small>
          <small>Metric: ${escapeHtml(row.success_metric || "pending")}</small>
          <button class="small-button" type="button" data-ci-case-action="advance">Advance</button>
          <button class="small-button secondary" type="button" data-ci-case-action="resolved">Resolve</button>
          <a class="secondary small-button" href="./vendors.html?vendor_id=${encodeURIComponent(row.vendor_id || "")}">Vendor</a>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderScorecards() {
  if (!scorecardBody) return;
  if (!scorecardRows.length) {
    scorecardBody.innerHTML = `
      <tr><td colspan="9">No scorecards yet. Create an improvement case or save a vendor scorecard.</td></tr>
    `;
    return;
  }

  scorecardBody.innerHTML = scorecardRows.map((row) => `
    <tr data-ci-scorecard-id="${escapeHtml(row.id || "")}" data-ci-scorecard-vendor-id="${escapeHtml(row.vendor_id || "")}">
      <td>
        <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
        <small>${escapeHtml(row.vendor_domain || row.vendor_email || "-")}</small>
      </td>
      <td>
        <select data-ci-scorecard-field="tier">
          ${TIERS.map(([tier, label]) => `<option value="${tier}" ${row.tier === tier ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </td>
      ${["value_score", "operational_score", "commercial_score", "compliance_score", "technology_score", "relationship_score"].map((field) => `
        <td><input type="number" min="0" max="100" step="1" value="${escapeHtml(scoreValue(row[field]))}" data-ci-scorecard-field="${field}" /></td>
      `).join("")}
      <td><button class="small-button" type="button" data-ci-scorecard-save>Save</button></td>
    </tr>
  `).join("");
}

function tierSummary(tier) {
  const rows = scorecardRows.filter((row) => row.tier === tier);
  const avg = rows.length ? rows.reduce((sum, row) => sum + Number(row.value_score || 0), 0) / rows.length : 0;
  return { rows, avg: scoreValue(avg) };
}

function renderValueCurve() {
  if (!valueCurveContainer) return;
  const tiers = ["watchlist", "tactical", "strategic", "collaborative"];
  valueCurveContainer.innerHTML = tiers.map((tier) => {
    const summary = tierSummary(tier);
    const topRows = summary.rows
      .slice()
      .sort((a, b) => Number(b.value_score || 0) - Number(a.value_score || 0))
      .slice(0, 8);
    return `
      <article class="vendor-ci-tier-card" data-tier="${tier}">
        <div>
          <span>${escapeHtml(labelFor(TIERS, tier, tier))}</span>
          <strong>${summary.rows.length}</strong>
          <small>Avg ${summary.avg}/100</small>
        </div>
        <ul>
          ${topRows.map((row) => `
            <li>
              <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
              <span>${escapeHtml(scoreValue(row.value_score))}/100</span>
            </li>
          `).join("") || "<li><em>No vendors scored</em></li>"}
        </ul>
      </article>
    `;
  }).join("");
}

function renderPlaybooks() {
  if (!playbooksContainer) return;
  playbooksContainer.innerHTML = playbookRows.map((playbook) => `
    <article class="vendor-ci-playbook-card">
      <div>
        <p class="eyebrow">${escapeHtml((playbook.methodology || "dmaic").toUpperCase())}</p>
        <h3>${escapeHtml(playbook.label || labelFor(CASE_TYPES, playbook.case_type, playbook.case_type))}</h3>
      </div>
      <p>${escapeHtml(playbook.goal || "")}</p>
      <ol>
        ${(playbook.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
      <small>${escapeHtml(playbook.evidence || "")}</small>
    </article>
  `).join("");
}

function setActiveTab(nextTab) {
  activeTab = nextTab;
  document.querySelectorAll("[data-ci-tab]").forEach((button) => {
    const active = button.dataset.ciTab === nextTab;
    button.classList.toggle("secondary", !active);
  });
  document.querySelectorAll("[data-ci-view]").forEach((section) => {
    section.classList.toggle("hidden", section.dataset.ciView !== nextTab);
  });
}

async function loadVendors() {
  const result = await fetchVendors({ base_stage: "procurement", lightweight: true, limit: 1000 });
  vendorRows = result.rows || [];
  renderVendorOptions();
}

async function loadImprovementCases() {
  setStatus("Loading vendor continuous improvement...");
  if (caseBody) caseBody.innerHTML = '<tr><td colspan="8">Loading improvement cases...</td></tr>';
  try {
    await requirePrivatePage();
    const [improvementResult] = await Promise.all([
      fetchVendorImprovementCases(readFilters()),
      vendorRows.length ? Promise.resolve() : loadVendors()
    ]);
    caseRows = improvementResult.rows || [];
    scorecardRows = improvementResult.scorecards || [];
    playbookRows = improvementResult.playbooks || [];
    renderMetrics(improvementResult.summary || {});
    renderCases();
    renderScorecards();
    renderValueCurve();
    renderPlaybooks();
    setStatus(`${caseRows.length.toLocaleString()} CI case(s) loaded.`, "success");
  } catch (error) {
    caseRows = [];
    scorecardRows = [];
    renderMetrics();
    if (caseBody) {
      caseBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state error-state">
              <strong>Vendor CI could not load</strong>
              <span>${escapeHtml(humanizeError(error))}</span>
              <button type="button" data-ci-retry>Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
    setStatus(error, "error");
  }
}

async function createCase(event) {
  event.preventDefault();
  const vendorId = vendorSelect?.value;
  if (!vendorId) {
    setStatus("Choose a vendor before creating a case.", "error");
    return;
  }
  setStatus("Creating improvement case...");
  try {
    await requirePrivatePage();
    await createVendorImprovementCase({
      vendor_id: vendorId,
      title: titleInput?.value,
      case_type: caseTypeInput?.value,
      severity: severityInput?.value,
      target_tier: targetTierInput?.value,
      due_date: dueDateInput?.value,
      vendor_request: vendorRequestInput?.value
    });
    createForm.reset();
    fillSelect(caseTypeInput, CASE_TYPES, "service_quality");
    await loadImprovementCases();
    setStatus("Improvement case created.", "success");
  } catch (error) {
    setStatus(error, "error");
  }
}

function nextStatus(current) {
  const flow = ["open", "define", "measure", "analyze", "improve", "control", "resolved"];
  const index = Math.max(0, flow.indexOf(current));
  return flow[Math.min(index + 1, flow.length - 1)];
}

async function updateCase(id, patch) {
  if (!id) return;
  setStatus("Updating improvement case...");
  try {
    await requirePrivatePage();
    const row = await updateVendorImprovementCase(id, patch);
    caseRows = caseRows.map((item) => (item.id === id ? { ...item, ...row } : item));
    renderCases();
    setStatus("Improvement case updated.", "success");
  } catch (error) {
    setStatus(error, "error");
  }
}

async function saveScorecard(rowElement) {
  const vendorId = rowElement?.dataset.ciScorecardVendorId;
  if (!vendorId) return;
  const scorecard = { vendor_id: vendorId };
  rowElement.querySelectorAll("[data-ci-scorecard-field]").forEach((input) => {
    scorecard[input.dataset.ciScorecardField] = input.value;
  });
  setStatus("Saving scorecard...");
  try {
    await requirePrivatePage();
    await upsertVendorValueScorecard(scorecard);
    await loadImprovementCases();
    setStatus("Scorecard saved.", "success");
  } catch (error) {
    setStatus(error, "error");
  }
}

function initOptions() {
  fillSelect(typeFilter, [["all", "All types"], ...CASE_TYPES], "all");
  fillSelect(caseTypeInput, CASE_TYPES, "service_quality");
}

refreshButton?.addEventListener("click", loadImprovementCases);
clearButton?.addEventListener("click", () => {
  statusFilter.value = "all";
  typeFilter.value = "all";
  tierFilter.value = "all";
  searchInput.value = "";
  loadImprovementCases();
});
[statusFilter, typeFilter, tierFilter].forEach((control) => control?.addEventListener("change", loadImprovementCases));
searchInput?.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadImprovementCases, 250);
});
document.querySelectorAll("[data-ci-tab]").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.ciTab || "cases"));
});
createForm?.addEventListener("submit", createCase);
caseBody?.addEventListener("click", async (event) => {
  if (event.target.closest("[data-ci-retry]")) {
    await loadImprovementCases();
    return;
  }
  const button = event.target.closest("[data-ci-case-action]");
  if (!button) return;
  const row = button.closest("[data-ci-case-id]");
  const current = caseRows.find((item) => item.id === row?.dataset.ciCaseId);
  const targetStatus = button.dataset.ciCaseAction === "advance" ? nextStatus(current?.status) : button.dataset.ciCaseAction;
  await updateCase(row?.dataset.ciCaseId, { status: targetStatus });
});
caseBody?.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-ci-case-field]");
  if (!input) return;
  const row = input.closest("[data-ci-case-id]");
  await updateCase(row?.dataset.ciCaseId, { [input.dataset.ciCaseField]: input.value });
});
scorecardBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ci-scorecard-save]");
  if (!button) return;
  await saveScorecard(button.closest("[data-ci-scorecard-vendor-id]"));
});

initOptions();
setActiveTab(activeTab);
applyPermissionState();
initAuthControls();
loadImprovementCases();
