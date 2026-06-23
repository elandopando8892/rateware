import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import { archiveMemoryRules, createMemoryRule, listMemoryAudit, listMemoryRules, simulateMemoryRule, updateMemoryRule } from "./memory-service.js";

const memoryTotal = document.querySelector("#memory-total");
const memoryGlobal = document.querySelector("#memory-global");
const memoryTargeted = document.querySelector("#memory-targeted");
const memoryUsed = document.querySelector("#memory-used");
const memorySuspect = document.querySelector("#memory-suspect");
const memoryForm = document.querySelector("#memory-form");
const memoryFormStatus = document.querySelector("#memory-form-status");
const memoryTableStatus = document.querySelector("#memory-table-status");
const memoryBody = document.querySelector("#memory-body");
const refreshButton = document.querySelector("#refresh-memory-button");
const scopeFilter = document.querySelector("#memory-scope-filter");
const healthFilter = document.querySelector("#memory-health-filter");
const recommendationFilter = document.querySelector("#memory-recommendation-filter");
const searchInput = document.querySelector("#memory-search");
const selectAllMemory = document.querySelector("#select-all-memory");
const selectionCount = document.querySelector("#memory-selection-count");
const archiveSelectedButton = document.querySelector("#archive-memory-selected");
const simulateDraftButton = document.querySelector("#simulate-draft-memory");
const simulationPanel = document.querySelector("#memory-simulation-panel");
const closeSimulationButton = document.querySelector("#close-memory-simulation");
const simulationTitle = document.querySelector("#memory-simulation-title");
const simulationUploadCount = document.querySelector("#simulation-upload-count");
const simulationStagedRows = document.querySelector("#simulation-staged-rows");
const simulationExpectedRows = document.querySelector("#simulation-expected-rows");
const simulationWarningCount = document.querySelector("#simulation-warning-count");
const simulationFailedCount = document.querySelector("#simulation-failed-count");
const simulationList = document.querySelector("#memory-simulation-list");
const memoryChangeLog = document.querySelector("#memory-change-log");
const refreshMemoryLogButton = document.querySelector("#refresh-memory-log-button");
const scopeSuggestion = document.querySelector("#memory-scope-suggestion");
const scopeRationale = document.querySelector("#memory-scope-rationale");
const applyScopeSuggestionButton = document.querySelector("#apply-scope-suggestion");

const formInputs = {
  title: document.querySelector("#new-memory-title"),
  scope: document.querySelector("#new-memory-scope"),
  vendor_domain: document.querySelector("#new-memory-vendor-domain"),
  rfx_hint: document.querySelector("#new-memory-rfx"),
  instruction: document.querySelector("#new-memory-instruction")
};

let loadedRules = [];
const selectedIds = new Set();
let currentScopeSuggestion = { scope: "global", rationale: "Write a rule and Rateware will suggest the safest scope before saving." };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function scopeLabel(scope) {
  if (scope === "vendor") return "Vendor";
  if (scope === "rfx") return "RFx";
  if (scope === "upload") return "Upload";
  return "Global";
}

function scopeTone(scope) {
  if (scope === "global") return "success";
  if (scope === "vendor" || scope === "rfx") return "warning";
  return "neutral";
}

function targetLabel(rule) {
  if (rule.scope === "vendor") return rule.vendor_domain || rule.vendor_id || "-";
  if (rule.scope === "rfx") return rule.rfx_hint || "-";
  if (rule.scope === "upload") return rule.raw_upload_id || "-";
  return "All uploads";
}

function ruleHealth(rule) {
  return rule.effectiveness?.health || (Number(rule.usage_count || 0) > 0 ? "unmeasured" : "unused");
}

function healthLabel(health) {
  if (health === "healthy") return "Healthy";
  if (health === "watch") return "Watch";
  if (health === "suspect") return "Suspect";
  if (health === "unmeasured") return "Unmeasured";
  return "Unused";
}

function healthTone(health) {
  if (health === "healthy") return "success";
  if (health === "watch" || health === "unmeasured") return "warning";
  if (health === "suspect") return "danger";
  return "muted";
}

function recommendationCode(rule) {
  return rule.recommendation?.code || "";
}

function recommendationTone(rule) {
  const tone = rule.recommendation?.tone || "neutral";
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  if (tone === "muted") return "muted";
  return "neutral";
}

function recommendationLabel(rule) {
  return rule.recommendation?.label || "Monitor";
}

function recommendationRationale(rule) {
  return rule.recommendation?.rationale || "No recommendation yet.";
}

function recommendationActions(rule) {
  if (!rule.owner_email) return "";
  const code = recommendationCode(rule);
  if (code === "resolve_conflict") {
    return `<button type="button" class="small-button secondary" data-focus-memory="${escapeHtml(rule.id)}">Review rule</button>`;
  }
  if (code === "archive_candidate" || code === "review_or_archive") {
    return `<button type="button" class="small-button danger" data-apply-recommendation="${escapeHtml(rule.id)}" data-recommendation-action="archive">Apply: Archive</button>`;
  }
  if (code === "promote_candidate") {
    return `<button type="button" class="small-button" data-apply-recommendation="${escapeHtml(rule.id)}" data-recommendation-action="promote_global">Simulate promote</button>`;
  }
  if (code === "tighten_rule") {
    return `<button type="button" class="small-button secondary" data-focus-memory="${escapeHtml(rule.id)}">Edit wording</button>`;
  }
  return "";
}

function simulationInputFromForm() {
  const scope = formValue("scope") || "global";
  return {
    title: formValue("title"),
    scope,
    instruction: formValue("instruction"),
    vendor_domain: scope === "vendor" ? formValue("vendor_domain") : "",
    rfx_hint: scope === "rfx" ? formValue("rfx_hint") : ""
  };
}

function hasAny(text, terms = []) {
  return terms.some((term) => text.includes(term));
}

function suggestMemoryScope() {
  const title = String(formValue("title") || "").toLowerCase();
  const instruction = String(formValue("instruction") || "").toLowerCase();
  const text = `${title} ${instruction}`;
  const vendorDomain = String(formValue("vendor_domain") || "").trim();
  const rfxHint = String(formValue("rfx_hint") || "").trim();

  if (!text.trim() && !vendorDomain && !rfxHint) {
    return {
      scope: "global",
      confidence: "low",
      rationale: "Write a rule and Rateware will suggest the safest scope before saving."
    };
  }

  if (rfxHint || hasAny(text, ["this rfx", "bid package", "procurement event", "lane package", "route family", "spot book"])) {
    return {
      scope: "rfx",
      confidence: rfxHint ? "high" : "medium",
      rationale: rfxHint
        ? "This rule references an RFx, so keep it scoped to that procurement event."
        : "The wording sounds tied to a specific bid package or lane family."
    };
  }

  if (vendorDomain || hasAny(text, ["vendor", "carrier", "domain", "table format", "email format", "this carrier", "carrier-specific"])) {
    return {
      scope: "vendor",
      confidence: vendorDomain ? "high" : "medium",
      rationale: vendorDomain
        ? "A vendor domain is present, so this should stay carrier-specific unless simulation proves it is broadly true."
        : "The wording sounds carrier-specific. Start with Vendor scope before promoting globally."
    };
  }

  if (hasAny(text, ["all uploads", "every upload", "global", "always", "never", "only classify", "do not infer", "ignore marksman", "ignore heymarksman", "ignore template", "tier 1", "tier 2", "tier 3", "please estimate", "n/a"])) {
    return {
      scope: "global",
      confidence: "high",
      rationale: "This reads like a universal interpretation guardrail and is safe to start as Global."
    };
  }

  return {
    scope: "vendor",
    confidence: "low",
    rationale: "This may be too specific for a global rule. Use Vendor first, then simulate/promote if it works across uploads."
  };
}

function renderScopeSuggestion() {
  currentScopeSuggestion = suggestMemoryScope();
  if (scopeSuggestion) {
    scopeSuggestion.className = `review-chip ${scopeTone(currentScopeSuggestion.scope)}`;
    scopeSuggestion.textContent = `Suggested: ${scopeLabel(currentScopeSuggestion.scope)} (${currentScopeSuggestion.confidence})`;
  }
  if (scopeRationale) scopeRationale.textContent = currentScopeSuggestion.rationale;
}

function globalSimulationInputFromRow(row) {
  return {
    scope: "global",
    title: row?.querySelector('[data-memory-field="title"]')?.value || "Global interpretation rule",
    instruction: row?.querySelector('[data-memory-field="instruction"]')?.value || ""
  };
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function auditActionLabel(action) {
  if (action === "create") return "Created";
  if (action === "update") return "Updated";
  if (action === "promote") return "Promoted";
  if (action === "archive") return "Archived";
  return String(action || "Changed");
}

function auditActionTone(action) {
  if (action === "create" || action === "promote") return "success";
  if (action === "archive") return "danger";
  if (action === "update") return "neutral";
  return "muted";
}

function auditMetadataLabel(metadata = {}) {
  const changedFields = Array.isArray(metadata.changed_fields) ? metadata.changed_fields.filter(Boolean) : [];
  if (metadata.prior_scope && metadata.next_scope && metadata.prior_scope !== metadata.next_scope) {
    return `${metadata.prior_scope} -> ${metadata.next_scope}${changedFields.length ? ` / ${changedFields.join(", ")}` : ""}`;
  }
  if (Number(metadata.archived_count || 0)) return `${metadata.archived_count} rule(s)`;
  if (metadata.scope) return `Scope: ${metadata.scope}`;
  if (changedFields.length) return `Fields: ${changedFields.join(", ")}`;
  return "";
}

function renderMemoryAudit(rows = []) {
  if (!memoryChangeLog) return;
  if (!rows.length) {
    memoryChangeLog.innerHTML = '<p class="detail-note">No memory changes have been recorded yet.</p>';
    return;
  }
  memoryChangeLog.innerHTML = rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const metadataLabel = auditMetadataLabel(metadata);
    return `
      <article>
        <div class="memory-change-main">
          <span class="review-chip ${escapeHtml(auditActionTone(row.action))}">${escapeHtml(auditActionLabel(row.action))}</span>
          <strong>${escapeHtml(row.summary || "Memory rule changed")}</strong>
          ${metadataLabel ? `<small>${escapeHtml(metadataLabel)}</small>` : ""}
        </div>
        <div class="memory-change-meta">
          <time>${escapeHtml(formatDate(row.created_at))}</time>
          <span>${escapeHtml(row.actor_email || row.owner_email || "Rateware")}</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadMemoryAudit() {
  if (!memoryChangeLog) return;
  memoryChangeLog.innerHTML = '<p class="detail-note">Loading memory activity...</p>';
  try {
    const rows = await listMemoryAudit({ limit: 80 });
    renderMemoryAudit(rows);
  } catch (error) {
    memoryChangeLog.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(humanizeError(error))}</p>`;
  }
}

function renderSimulation(result) {
  const impact = result.impact || {};
  const rows = result.rows || [];
  simulationPanel?.classList.remove("hidden");
  simulationTitle.textContent = result.rule?.title ? `Impact preview: ${result.rule.title}` : "Rule impact preview";
  simulationUploadCount.textContent = String(impact.upload_count || 0);
  simulationStagedRows.textContent = String(impact.staged_rows || 0);
  simulationExpectedRows.textContent = String(impact.expected_rows || 0);
  simulationWarningCount.textContent = String(impact.warning_count || 0);
  simulationFailedCount.textContent = String(impact.failed_count || 0);
  simulationList.innerHTML = rows.length
    ? rows.map((row) => `
        <article>
          <div>
            <strong>${escapeHtml(row.filename || "Upload")}</strong>
            <span>${escapeHtml([row.vendor, row.rfx_hint, row.document_type].filter(Boolean).join(" / ") || "-")}</span>
          </div>
          <div>
            <span class="review-chip ${escapeHtml(row.status === "failed" ? "danger" : row.audit_status === "needs_review" ? "warning" : "neutral")}">${escapeHtml(row.status || "-")}</span>
            <small>${escapeHtml(row.interpreted_rate_rows || 0)} / ${escapeHtml(row.expected_rate_rows || row.interpreted_rate_rows || 0)} rows</small>
          </div>
        </article>
      `).join("")
    : '<p class="detail-note">No recent uploads would be affected by this rule.</p>';
  simulationPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runSimulation(input, statusElement = memoryTableStatus) {
  setStatus(statusElement, "Simulating rule impact...");
  try {
    const result = await simulateMemoryRule(input);
    renderSimulation(result);
    setStatus(statusElement, "Simulation ready.", "success");
  } catch (error) {
    setStatus(statusElement, humanizeError(error), "error");
  }
}

function effectivenessLabel(rule) {
  const effectiveness = rule.effectiveness || {};
  const completion = effectiveness.completion_rate;
  const uploads = Number(effectiveness.upload_count || 0);
  if (!uploads) return "No interpreted uploads yet";
  const pieces = [
    completion === null || completion === undefined ? null : `${completion}% rows`,
    `${uploads} upload${uploads === 1 ? "" : "s"}`,
    Number(effectiveness.warning_count || 0) ? `${effectiveness.warning_count} warnings` : null,
    Number(effectiveness.failed_count || 0) ? `${effectiveness.failed_count} failed` : null
  ].filter(Boolean);
  return pieces.join(" / ");
}

function qualityTone(score, conflicts = {}) {
  const conflictCount = Number(conflicts.count || 0);
  if (conflictCount > 1 || Number(score || 0) < 55) return "danger";
  if (conflictCount === 1 || Number(score || 0) < 75) return "warning";
  if (Number(score || 0) >= 90) return "success";
  return "neutral";
}

function qualityLabel(rule) {
  const effectiveness = rule.effectiveness || {};
  const score = Number(effectiveness.quality_score || 0);
  if (!score) return effectiveness.quality_label || "No evidence";
  return `${score} / ${effectiveness.quality_label || "Measured"}`;
}

function conflictLabel(rule) {
  const conflicts = rule.conflicts || {};
  const issues = Array.isArray(conflicts.issues) ? conflicts.issues : [];
  if (!issues.length) return "No active conflicts detected.";
  return issues.join(" ");
}

function filteredRules() {
  const scope = scopeFilter?.value || "";
  const health = healthFilter?.value || "";
  const recommendation = recommendationFilter?.value || "";
  const search = String(searchInput?.value || "").trim().toLowerCase();
  return loadedRules.filter((rule) => {
    if (scope && rule.scope !== scope) return false;
    if (health && ruleHealth(rule) !== health) return false;
    if (recommendation && recommendationCode(rule) !== recommendation) return false;
    if (!search) return true;
    return [rule.title, rule.instruction, rule.vendor_domain, rule.rfx_hint, rule.scope]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function updateMetrics(rows = loadedRules) {
  memoryTotal.textContent = String(rows.length);
  memoryGlobal.textContent = String(rows.filter((rule) => rule.scope === "global").length);
  memoryTargeted.textContent = String(rows.filter((rule) => rule.scope === "vendor" || rule.scope === "rfx").length);
  memoryUsed.textContent = String(rows.filter((rule) => Number(rule.usage_count || 0) > 0).length);
  memorySuspect.textContent = String(rows.filter((rule) => ["suspect", "watch"].includes(ruleHealth(rule))).length);
}

function updateSelection() {
  const visibleIds = [...memoryBody.querySelectorAll("[data-memory-select]")].map((input) => input.dataset.memorySelect);
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id));
  selectionCount.textContent = `${selectedVisible.length} selected`;
  archiveSelectedButton.disabled = selectedVisible.length === 0;
  if (selectAllMemory) {
    selectAllMemory.checked = selectedVisible.length > 0 && selectedVisible.length === visibleIds.length;
    selectAllMemory.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
  }
}

function renderRules() {
  const rows = filteredRules();
  updateMetrics(loadedRules);
  if (!rows.length) {
    memoryBody.innerHTML = `<tr><td colspan="10">No memory rules match this view.</td></tr>`;
    updateSelection();
    return;
  }

  memoryBody.innerHTML = rows.map((rule) => `
    <tr data-memory-row="${escapeHtml(rule.id)}">
      <td><input data-memory-select="${escapeHtml(rule.id)}" type="checkbox" ${selectedIds.has(rule.id) ? "checked" : ""} /></td>
      <td><span class="review-chip neutral">${escapeHtml(scopeLabel(rule.scope))}</span></td>
      <td><input class="memory-inline-input" data-memory-field="title" value="${escapeHtml(rule.title || "")}" /></td>
      <td><textarea class="memory-inline-textarea" data-memory-field="instruction" rows="2">${escapeHtml(rule.instruction || "")}</textarea></td>
      <td>${escapeHtml(targetLabel(rule))}</td>
      <td>
        <div class="memory-quality">
          <span class="review-chip ${escapeHtml(qualityTone(rule.effectiveness?.quality_score, rule.conflicts))}">${escapeHtml(qualityLabel(rule))}</span>
          <small>${escapeHtml(conflictLabel(rule))}</small>
        </div>
      </td>
      <td>
        <div class="memory-effectiveness">
          <span class="review-chip ${escapeHtml(healthTone(ruleHealth(rule)))}">${escapeHtml(healthLabel(ruleHealth(rule)))}</span>
          <small>${escapeHtml(effectivenessLabel(rule))}</small>
        </div>
      </td>
      <td>
        <div class="memory-recommendation">
          <span class="review-chip ${escapeHtml(recommendationTone(rule))}">${escapeHtml(recommendationLabel(rule))}</span>
          <small>${escapeHtml(recommendationRationale(rule))}</small>
        </div>
      </td>
      <td>${escapeHtml(formatDate(rule.effectiveness?.last_upload_at || rule.last_used_at))}</td>
      <td class="history-actions">
        ${rule.owner_email ? `<button type="button" class="small-button" data-save-memory="${escapeHtml(rule.id)}">Save</button>` : ""}
        <button type="button" class="small-button secondary" data-simulate-memory="${escapeHtml(rule.id)}">Simulate</button>
        ${recommendationActions(rule)}
        ${rule.owner_email ? `<button type="button" class="small-button danger" data-archive-memory="${escapeHtml(rule.id)}">Archive</button>` : `<span class="review-chip muted">System</span>`}
        <small class="row-save-status" data-memory-status="${escapeHtml(rule.id)}"></small>
      </td>
    </tr>
  `).join("");
  updateSelection();
}

async function loadMemory() {
  memoryBody.innerHTML = `<tr><td colspan="10">Loading memory rules...</td></tr>`;
  setStatus(memoryTableStatus, "");
  try {
    await requirePrivatePage();
    loadedRules = await listMemoryRules();
    selectedIds.clear();
    renderRules();
    await loadMemoryAudit();
  } catch (error) {
    memoryBody.innerHTML = `<tr><td colspan="10">${escapeHtml(humanizeError(error))}</td></tr>`;
  }
}

function formValue(name) {
  return formInputs[name]?.value || "";
}

function clearForm() {
  Object.values(formInputs).forEach((input) => {
    if (!input) return;
    if (input.tagName === "SELECT") input.value = "global";
    else input.value = "";
  });
  renderScopeSuggestion();
}

initAuthControls();
renderScopeSuggestion();
requirePrivatePage().then(loadMemory).catch(() => {});

refreshButton?.addEventListener("click", loadMemory);
refreshMemoryLogButton?.addEventListener("click", loadMemoryAudit);
scopeFilter?.addEventListener("change", renderRules);
healthFilter?.addEventListener("change", renderRules);
recommendationFilter?.addEventListener("change", renderRules);
searchInput?.addEventListener("input", renderRules);
closeSimulationButton?.addEventListener("click", () => simulationPanel?.classList.add("hidden"));
simulateDraftButton?.addEventListener("click", () => runSimulation(simulationInputFromForm(), memoryFormStatus));
Object.values(formInputs).forEach((input) => input?.addEventListener("input", renderScopeSuggestion));
Object.values(formInputs).forEach((input) => input?.addEventListener("change", renderScopeSuggestion));
applyScopeSuggestionButton?.addEventListener("click", () => {
  renderScopeSuggestion();
  if (formInputs.scope) formInputs.scope.value = currentScopeSuggestion.scope;
  if (currentScopeSuggestion.scope === "global") {
    if (formInputs.vendor_domain) formInputs.vendor_domain.value = "";
    if (formInputs.rfx_hint) formInputs.rfx_hint.value = "";
  }
  if (currentScopeSuggestion.scope === "vendor" && !formValue("vendor_domain")) {
    formInputs.vendor_domain?.focus();
  }
  if (currentScopeSuggestion.scope === "rfx" && !formValue("rfx_hint")) {
    formInputs.rfx_hint?.focus();
  }
});

memoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(memoryFormStatus, "Creating rule...");
  try {
    const scope = formValue("scope") || "global";
    await createMemoryRule({
      title: formValue("title"),
      scope,
      instruction: formValue("instruction"),
      vendor_domain: scope === "vendor" ? formValue("vendor_domain") : "",
      rfx_hint: scope === "rfx" ? formValue("rfx_hint") : ""
    });
    setStatus(memoryFormStatus, "Memory rule created.", "success");
    clearForm();
    await loadMemory();
  } catch (error) {
    setStatus(memoryFormStatus, humanizeError(error), "error");
  }
});

selectAllMemory?.addEventListener("change", () => {
  memoryBody.querySelectorAll("[data-memory-select]").forEach((input) => {
    input.checked = selectAllMemory.checked;
    if (input.checked) selectedIds.add(input.dataset.memorySelect);
    else selectedIds.delete(input.dataset.memorySelect);
  });
  updateSelection();
});

memoryBody?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-memory-select]");
  if (checkbox) {
    if (checkbox.checked) selectedIds.add(checkbox.dataset.memorySelect);
    else selectedIds.delete(checkbox.dataset.memorySelect);
    updateSelection();
    return;
  }

  const editable = event.target.closest("[data-memory-field]");
  if (editable) {
    const row = editable.closest("[data-memory-row]");
    const promoteButton = row?.querySelector('[data-recommendation-action="promote_global"]');
    if (promoteButton?.dataset.confirmPromote === "true") {
      promoteButton.dataset.confirmPromote = "false";
      promoteButton.textContent = "Simulate promote";
    }
  }
});

memoryBody?.addEventListener("click", async (event) => {
  const saveButton = event.target.closest("[data-save-memory]");
  const archiveButton = event.target.closest("[data-archive-memory]");
  const applyButton = event.target.closest("[data-apply-recommendation]");
  const focusButton = event.target.closest("[data-focus-memory]");
  const simulateButton = event.target.closest("[data-simulate-memory]");
  const id = saveButton?.dataset.saveMemory || archiveButton?.dataset.archiveMemory || applyButton?.dataset.applyRecommendation || focusButton?.dataset.focusMemory || simulateButton?.dataset.simulateMemory;
  if (!id) return;
  const row = memoryBody.querySelector(`[data-memory-row="${CSS.escape(id)}"]`);
  const status = memoryBody.querySelector(`[data-memory-status="${CSS.escape(id)}"]`);

  if (focusButton) {
    row?.querySelector('[data-memory-field="instruction"]')?.focus();
    setStatus(status, "Edit the wording, then Save.", "warning");
    return;
  }

  if (simulateButton) {
    await runSimulation({ id }, status);
    return;
  }

  try {
    if (saveButton) {
      saveButton.disabled = true;
      setStatus(status, "Saving...");
      const patch = {};
      row.querySelectorAll("[data-memory-field]").forEach((input) => {
        patch[input.dataset.memoryField] = input.value;
      });
      await updateMemoryRule(id, patch);
      setStatus(status, "Saved.", "success");
      await loadMemory();
    }

    if (archiveButton) {
      archiveButton.disabled = true;
      await archiveMemoryRules([id]);
      setStatus(memoryTableStatus, "Rule archived.", "success");
      await loadMemory();
    }

    if (applyButton) {
      applyButton.disabled = true;
      const action = applyButton.dataset.recommendationAction;
      if (action === "archive") {
        await archiveMemoryRules([id]);
        setStatus(memoryTableStatus, "Recommendation applied: rule archived.", "success");
      }
      if (action === "promote_global") {
        if (applyButton.dataset.confirmPromote !== "true") {
          await runSimulation(globalSimulationInputFromRow(row), status);
          applyButton.dataset.confirmPromote = "true";
          applyButton.textContent = "Confirm promote";
          applyButton.disabled = false;
          setStatus(status, "Review the global impact simulation, then click Confirm promote.", "warning");
          return;
        }
        await updateMemoryRule(id, {
          scope: "global",
          title: row.querySelector('[data-memory-field="title"]')?.value || "Global interpretation rule",
          instruction: row.querySelector('[data-memory-field="instruction"]')?.value || ""
        });
        setStatus(memoryTableStatus, "Recommendation applied: rule promoted to global.", "success");
      }
      await loadMemory();
    }
  } catch (error) {
    setStatus(status || memoryTableStatus, humanizeError(error), "error");
  }
});

archiveSelectedButton?.addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (!ids.length) return;
  setStatus(memoryTableStatus, `Archiving ${ids.length} rule(s)...`);
  try {
    await archiveMemoryRules(ids);
    selectedIds.clear();
    setStatus(memoryTableStatus, "Selected rules archived.", "success");
    await loadMemory();
  } catch (error) {
    setStatus(memoryTableStatus, humanizeError(error), "error");
  }
});
