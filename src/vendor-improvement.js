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
const vendorSearchInput = document.querySelector("#ci-vendor-search");
const vendorIdInput = document.querySelector("#ci-vendor-id");
const vendorResults = document.querySelector("#ci-vendor-results");
const selectedVendorMessage = document.querySelector("#ci-selected-vendor");
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
let vendorSearchTimer = null;
let vendorSearchSequence = 0;
let selectedVendor = null;
let activePlaybook = null;

const CRM_VENDOR_SEARCH_LIMIT = 1000;
const CRM_VENDOR_RENDER_LIMIT = 40;

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

function compactNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function scorecardSignals(row = {}) {
  const signals = row.attributes?.signals || {};
  return {
    linked_rates: Number(row.linked_rates ?? signals.linked_rates ?? 0),
    approved_rates: Number(row.approved_rates ?? signals.approved_rates ?? 0),
    bid_responses: Number(row.bid_responses ?? signals.bid_responses ?? 0),
    bid_invitations: Number(row.bid_invitations ?? signals.bid_invitations ?? 0),
    awards: Number(row.awards ?? signals.awards ?? 0),
    support_open: Number(row.support_open ?? signals.support_open ?? 0),
    chat_messages: Number(row.chat_messages ?? signals.carrier_chat_messages ?? 0)
  };
}

function scorecardSignalText(row = {}) {
  const signals = scorecardSignals(row);
  return [
    `${compactNumber(signals.linked_rates)} rates`,
    `${compactNumber(signals.bid_responses)}/${compactNumber(signals.bid_invitations)} bids`,
    `${compactNumber(signals.awards)} awards`,
    `${compactNumber(signals.support_open)} open issues`,
    `${compactNumber(signals.chat_messages)} chat`
  ].join(" | ");
}

function isoDateAfterDays(days = 14) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(Number(days) || 14, 1));
  return date.toISOString().slice(0, 10);
}

function playbookByType(caseType) {
  return playbookRows.find((playbook) => playbook.case_type === caseType);
}

function playbookCaseTitle(playbook = {}) {
  return playbook.default_title || `${playbook.label || labelFor(CASE_TYPES, playbook.case_type, "Improvement")} required`;
}

function playbookRequestText(playbook = {}) {
  const actions = Array.isArray(playbook.actions) ? playbook.actions : [];
  const metric = playbook.success_metric ? `\n\nSuccess metric: ${playbook.success_metric}` : "";
  const owner = playbook.owner_role ? `\nOwner expected from vendor: ${playbook.owner_role}` : "";
  const actionText = actions.length ? `\nRequired actions:\n- ${actions.join("\n- ")}` : "";
  return `${playbook.vendor_request_template || playbook.goal || ""}${actionText}${metric}${owner}`.trim();
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

function normalizeTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function vendorSearchText(row) {
  return [
    row.vendor_name,
    row.name,
    row.legal_name,
    row.contact_name,
    row.domain,
    row.primary_email,
    Array.isArray(row.secondary_emails) ? row.secondary_emails.join(" ") : row.secondary_emails,
    row.coverage_notes,
    row.notes
  ].filter(Boolean).join(" ");
}

function vendorMeta(row) {
  return [
    row.domain,
    row.primary_email,
    row.contact_name,
    row.base_stage,
    row.status
  ].filter(Boolean).join(" | ");
}

function rankVendorForQuery(row, query) {
  const term = normalizeTerm(query);
  if (!term) return 10;
  const label = normalizeTerm(vendorLabel(row));
  const domain = normalizeTerm(row.domain);
  const email = normalizeTerm(row.primary_email);
  const contact = normalizeTerm(row.contact_name);
  const searchText = normalizeTerm(vendorSearchText(row));
  if (label === term || domain === term || email === term) return 0;
  if (label.startsWith(term) || domain.startsWith(term)) return 1;
  if (contact.startsWith(term)) return 2;
  if (label.includes(term) || domain.includes(term) || email.includes(term)) return 3;
  if (searchText.includes(term)) return 4;
  return 20;
}

function setVendorPickerMessage(message, tone = "neutral") {
  if (!selectedVendorMessage) return;
  selectedVendorMessage.textContent = message;
  selectedVendorMessage.dataset.tone = tone;
}

function hideVendorResults() {
  vendorResults?.classList.add("hidden");
  vendorSearchInput?.setAttribute("aria-expanded", "false");
}

function showVendorResults() {
  vendorResults?.classList.remove("hidden");
  vendorSearchInput?.setAttribute("aria-expanded", "true");
}

function clearVendorSelection(message = "Start typing to search the full Carrier CRM.") {
  selectedVendor = null;
  if (vendorIdInput) vendorIdInput.value = "";
  setVendorPickerMessage(message);
}

function selectVendorForCase(row) {
  selectedVendor = row;
  if (vendorIdInput) vendorIdInput.value = row.id || "";
  if (vendorSearchInput) vendorSearchInput.value = vendorLabel(row);
  setVendorPickerMessage(`${vendorLabel(row)}${vendorMeta(row) ? ` - ${vendorMeta(row)}` : ""}`, "success");
  hideVendorResults();
}

function renderVendorSearchResults(rows = [], query = "") {
  if (!vendorResults) return 0;
  const term = normalizeTerm(query);
  const matchingRows = rows.filter((row) => !term || normalizeTerm(vendorSearchText(row)).includes(term));
  const rankedRows = matchingRows
    .slice()
    .sort((left, right) => rankVendorForQuery(left, query) - rankVendorForQuery(right, query) || vendorLabel(left).localeCompare(vendorLabel(right)))
    .slice(0, CRM_VENDOR_RENDER_LIMIT);

  if (!rankedRows.length) {
    vendorResults.innerHTML = `
      <div class="vendor-ci-vendor-empty">
        <strong>No CRM carriers found</strong>
        <span>Try vendor name, legal name, domain, contact, email, or coverage notes.</span>
      </div>
    `;
    showVendorResults();
    return 0;
  }

  vendorRows = rankedRows;
  vendorResults.innerHTML = rankedRows.map((row, index) => `
    <button type="button" role="option" data-ci-vendor-result="${escapeHtml(row.id || "")}" ${index === 0 ? 'aria-selected="true"' : ""}>
      <strong>${escapeHtml(vendorLabel(row))}</strong>
      <span>${escapeHtml(vendorMeta(row) || "Carrier CRM")}</span>
    </button>
  `).join("");
  showVendorResults();
  return matchingRows.length;
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
      <tr><td colspan="9">No CRM vendors match current filters. Clear filters or sync Carrier CRM.</td></tr>
    `;
    return;
  }

  scorecardBody.innerHTML = scorecardRows.map((row) => `
    <tr data-ci-scorecard-id="${escapeHtml(row.id || "")}" data-ci-scorecard-vendor-id="${escapeHtml(row.vendor_id || "")}">
      <td>
        <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
        <small>${escapeHtml(row.vendor_domain || row.vendor_email || "-")}</small>
        <small>${escapeHtml(row.source_summary || scorecardSignalText(row))}</small>
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
              <div>
                <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
                <small>${escapeHtml(scorecardSignalText(row))}</small>
              </div>
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
    <article class="vendor-ci-playbook-card" data-ci-playbook="${escapeHtml(playbook.case_type || "")}">
      <div>
        <p class="eyebrow">${escapeHtml((playbook.methodology || "dmaic").toUpperCase())}</p>
        <h3>${escapeHtml(playbook.label || labelFor(CASE_TYPES, playbook.case_type, playbook.case_type))}</h3>
      </div>
      <p>${escapeHtml(playbook.goal || "")}</p>
      <div class="vendor-ci-playbook-meta">
        <span>Due ${escapeHtml(playbook.due_days || 14)}d</span>
        <span>${escapeHtml(playbook.suggested_severity || "medium")}</span>
        <span>${escapeHtml(labelFor(TIERS, playbook.suggested_target_tier, "Strategic"))}</span>
      </div>
      <ul class="vendor-ci-playbook-actions">
        ${(playbook.actions || []).map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
      </ul>
      <details>
        <summary>Checklist and evidence</summary>
        <ol>
          ${(playbook.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
        <small>${escapeHtml(playbook.evidence || "")}</small>
      </details>
      <div class="vendor-ci-playbook-buttons">
        <button class="small-button" type="button" data-ci-playbook-action="use" data-ci-playbook-type="${escapeHtml(playbook.case_type || "")}">Open case</button>
        <button class="small-button secondary" type="button" data-ci-playbook-action="filter" data-ci-playbook-type="${escapeHtml(playbook.case_type || "")}">Show cases</button>
        <button class="small-button secondary" type="button" data-ci-playbook-action="copy" data-ci-playbook-type="${escapeHtml(playbook.case_type || "")}">Copy request</button>
      </div>
    </article>
  `).join("");
}

async function copyPlaybookRequest(playbook) {
  const text = playbookRequestText(playbook);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Playbook vendor request copied.", "success");
  } catch {
    setStatus(text, "neutral");
  }
}

function applyPlaybookToCaseForm(playbook) {
  activePlaybook = playbook;
  setActiveTab("cases");
  if (caseTypeInput) caseTypeInput.value = playbook.case_type || "service_quality";
  if (severityInput) severityInput.value = playbook.suggested_severity || "medium";
  if (targetTierInput) targetTierInput.value = playbook.suggested_target_tier || "strategic";
  if (titleInput && !titleInput.value) titleInput.value = playbookCaseTitle(playbook);
  if (vendorRequestInput) vendorRequestInput.value = playbookRequestText(playbook);
  if (dueDateInput && !dueDateInput.value) dueDateInput.value = isoDateAfterDays(playbook.due_days || 14);
  setStatus(`Playbook loaded: ${playbook.label || labelFor(CASE_TYPES, playbook.case_type, "Improvement")}. Choose a vendor and create the case.`, "success");
  vendorSearchInput?.focus();
}

function filterCasesByPlaybook(playbook) {
  setActiveTab("cases");
  if (typeFilter) typeFilter.value = playbook.case_type || "all";
  loadImprovementCases();
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

async function searchCrmVendors(query = "") {
  if (!vendorResults) return;
  const term = query.trim();
  vendorSearchSequence += 1;
  const sequence = vendorSearchSequence;
  if (!term) {
    vendorResults.innerHTML = `
      <div class="vendor-ci-vendor-empty">
        <strong>Search the Carrier CRM</strong>
        <span>Type a carrier name, domain, contact, email, or coverage keyword.</span>
      </div>
    `;
    showVendorResults();
    return;
  }
  if (term.length < 2) {
    vendorResults.innerHTML = `
      <div class="vendor-ci-vendor-empty">
        <strong>Keep typing</strong>
        <span>Use at least 2 characters to search the full CRM.</span>
      </div>
    `;
    showVendorResults();
    return;
  }

  setVendorPickerMessage("Searching full Carrier CRM...");
  try {
    const result = await fetchVendors({ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true, search: term });
    if (sequence !== vendorSearchSequence || term !== String(vendorSearchInput?.value || "").trim()) return;
    const renderedMatches = renderVendorSearchResults(result.rows || [], term);
    setVendorPickerMessage(`${Number(renderedMatches || 0).toLocaleString()} CRM match(es). Choose one to create the case.`, renderedMatches ? "neutral" : "error");
  } catch (error) {
    if (sequence !== vendorSearchSequence) return;
    vendorResults.innerHTML = `
      <div class="vendor-ci-vendor-empty error-state">
        <strong>CRM search failed</strong>
        <span>${escapeHtml(humanizeError(error))}</span>
      </div>
    `;
    showVendorResults();
    setVendorPickerMessage(humanizeError(error), "error");
  }
}

async function loadImprovementCases() {
  setStatus("Loading vendor continuous improvement...");
  if (caseBody) caseBody.innerHTML = '<tr><td colspan="8">Loading improvement cases...</td></tr>';
  try {
    await requirePrivatePage();
    const improvementResult = await fetchVendorImprovementCases(readFilters());
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
  const vendorId = vendorIdInput?.value;
  if (!vendorId) {
    setStatus("Search the Carrier CRM and choose a vendor before creating a case.", "error");
    setVendorPickerMessage("Choose one of the CRM search results before creating the case.", "error");
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
      vendor_request: vendorRequestInput?.value,
      methodology: activePlaybook?.methodology,
      success_metric: activePlaybook?.success_metric,
      source: activePlaybook ? "playbook" : "manual",
      source_ref: activePlaybook?.case_type,
      metadata: activePlaybook ? {
        playbook_label: activePlaybook.label,
        playbook_actions: activePlaybook.actions || [],
        owner_role: activePlaybook.owner_role || ""
      } : {}
    });
    createForm.reset();
    activePlaybook = null;
    clearVendorSelection();
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
vendorSearchInput?.addEventListener("input", () => {
  if (selectedVendor && vendorSearchInput.value !== vendorLabel(selectedVendor)) {
    clearVendorSelection("Search changed. Choose a CRM result again before creating the case.");
  }
  window.clearTimeout(vendorSearchTimer);
  vendorSearchTimer = window.setTimeout(() => searchCrmVendors(vendorSearchInput.value), 250);
});
vendorSearchInput?.addEventListener("focus", () => {
  if (vendorResults?.innerHTML) {
    showVendorResults();
    return;
  }
  searchCrmVendors(vendorSearchInput.value);
});
vendorSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const firstResult = vendorResults?.querySelector("[data-ci-vendor-result]");
    if (firstResult) {
      event.preventDefault();
      const row = vendorRows.find((item) => item.id === firstResult.dataset.ciVendorResult);
      if (row) selectVendorForCase(row);
    }
  }
  if (event.key === "Escape") hideVendorResults();
});
vendorResults?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ci-vendor-result]");
  if (!button) return;
  const row = vendorRows.find((item) => item.id === button.dataset.ciVendorResult);
  if (row) selectVendorForCase(row);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".vendor-ci-vendor-picker")) hideVendorResults();
});
document.querySelectorAll("[data-ci-tab]").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.ciTab || "cases"));
});
playbooksContainer?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ci-playbook-action]");
  if (!button) return;
  const playbook = playbookByType(button.dataset.ciPlaybookType);
  if (!playbook) return;
  const action = button.dataset.ciPlaybookAction;
  if (action === "use") applyPlaybookToCaseForm(playbook);
  if (action === "filter") filterCasesByPlaybook(playbook);
  if (action === "copy") await copyPlaybookRequest(playbook);
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
