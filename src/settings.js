import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  archiveCatalogValue,
  fetchCatalogValues,
  fetchSaasSettings,
  saveCatalogValue,
  updateOnboardingTask,
  updateSaasOrganization,
  updateSaasProfile
} from "./settings-service.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";

const accessMode = document.querySelector("#settings-access-mode");
const onboardingScore = document.querySelector("#settings-onboarding-score");
const auditCount = document.querySelector("#settings-audit-count");
const workspaceName = document.querySelector("#settings-workspace-name");
const accessCard = document.querySelector("#settings-access-card");
const settingsSession = document.querySelector("#settings-session");
const profileForm = document.querySelector("#profile-form");
const profileStatus = document.querySelector("#profile-status");
const organizationForm = document.querySelector("#organization-form");
const organizationStatus = document.querySelector("#organization-status");
const onboardingList = document.querySelector("#onboarding-list");
const auditLogBody = document.querySelector("#audit-log-body");
const refreshButton = document.querySelector("#refresh-settings-button");
const catalogValueForm = document.querySelector("#catalog-value-form");
const catalogCategorySelect = document.querySelector("#catalog-category");
const catalogCategoryFilter = document.querySelector("#catalog-category-filter");
const catalogRawValueInput = document.querySelector("#catalog-raw-value");
const catalogNormalizedValueInput = document.querySelector("#catalog-normalized-value");
const catalogCodeInput = document.querySelector("#catalog-code");
const catalogNoteInput = document.querySelector("#catalog-note");
const catalogStatus = document.querySelector("#catalog-status");
const catalogValuesBody = document.querySelector("#catalog-values-body");
const refreshCatalogButton = document.querySelector("#refresh-catalog-values");

const profileInputs = {
  full_name: document.querySelector("#profile-full-name"),
  job_title: document.querySelector("#profile-job-title"),
  phone: document.querySelector("#profile-phone"),
  timezone: document.querySelector("#profile-timezone"),
  preferred_language: document.querySelector("#profile-language")
};

const organizationInputs = {
  org_name: document.querySelector("#org-name"),
  workspace_slug: document.querySelector("#org-slug"),
  website: document.querySelector("#org-website"),
  industry: document.querySelector("#org-industry"),
  billing_email: document.querySelector("#org-billing-email"),
  notes: document.querySelector("#org-notes")
};

let currentSettings = null;
let currentSession = null;
let currentCatalogValues = [];
initWorkbenchTabs({ defaultView: "access" });

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

function setValue(input, value) {
  if (input) input.value = value || "";
}

function formValues(inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input?.value || ""]));
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

function fillForms(settings) {
  const profile = settings.profile || {};
  const organization = settings.organization || {};
  for (const [key, input] of Object.entries(profileInputs)) setValue(input, profile[key]);
  for (const [key, input] of Object.entries(organizationInputs)) setValue(input, organization[key]);
}

function renderAccess(settings) {
  const access = settings.access || {};
  accessMode.textContent = access.mode === "full_access" ? "Full" : "Roles later";
  workspaceName.textContent = settings.organization?.org_name || "-";
  accessCard.innerHTML = `
    <strong>${escapeHtml(access.label || "Full access enabled")}</strong>
    <p>${escapeHtml(access.detail || "All authenticated users can use every module.")}</p>
  `;
  const values = [
    currentSession?.user?.email || settings.profile?.owner_email || "-",
    access.label || "Full access enabled",
    "Disabled for MVP; all modules are available"
  ];
  settingsSession.querySelectorAll("dd").forEach((element, index) => {
    element.textContent = values[index] || "-";
  });
}

function renderOnboarding(settings) {
  const tasks = settings.onboarding || [];
  const completed = tasks.filter((task) => task.completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  onboardingScore.textContent = `${percent}%`;

  if (!tasks.length) {
    onboardingList.innerHTML = "<article>No onboarding tasks found.</article>";
    return;
  }

  onboardingList.innerHTML = tasks.map((task) => `
    <article class="${task.completed ? "is-complete" : ""}">
      <span>${task.completed ? "Done" : "Open"}</span>
      <div>
        <strong>${escapeHtml(task.label)}</strong>
        <p>${escapeHtml(task.detail)}</p>
      </div>
      <button class="secondary small-button" type="button" data-onboarding-task="${escapeHtml(task.key)}" ${task.completed ? "disabled" : ""}>
        ${task.completed ? "Complete" : "Mark done"}
      </button>
    </article>
  `).join("");
}

function renderAudit(settings) {
  const rows = settings.audit || [];
  auditCount.textContent = new Intl.NumberFormat().format(rows.length);
  if (!rows.length) {
    auditLogBody.innerHTML = `<tr><td colspan="5">No audit events yet.</td></tr>`;
    return;
  }
  auditLogBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td>
      <td>${escapeHtml(row.actor_email || row.owner_email || "-")}</td>
      <td><span class="status-pill">${escapeHtml(row.action || "-")}</span></td>
      <td>${escapeHtml([row.entity_type, row.entity_id].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(row.summary || "-")}</td>
    </tr>
  `).join("");
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
    setStatus(catalogStatus, "No values in this catalog view.", "warning");
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
  setStatus(catalogStatus, `${visibleRows.length.toLocaleString()} value(s) shown. Manual active values feed Staging and Rateware dropdowns.`, "success");
}

function renderSettings(settings) {
  currentSettings = settings;
  fillForms(settings);
  renderAccess(settings);
  renderOnboarding(settings);
  renderAudit(settings);
}

async function loadSettings() {
  try {
    const settings = await fetchSaasSettings();
    renderSettings(settings);
  } catch (error) {
    auditLogBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadCatalogValues() {
  setStatus(catalogStatus, "Loading catalog values...");
  try {
    const values = await fetchCatalogValues(catalogCategoryFilter?.value || "");
    renderCatalogValues(values);
  } catch (error) {
    setStatus(catalogStatus, error.message, "error");
  }
}

initAuthControls();
populateCatalogCategoryControls();
requirePrivatePage().then((session) => {
  currentSession = session;
  if (session?.token) loadSettings();
});

refreshButton?.addEventListener("click", loadSettings);
refreshCatalogButton?.addEventListener("click", loadCatalogValues);
catalogCategoryFilter?.addEventListener("change", loadCatalogValues);

catalogValueForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawValue = catalogRawValueInput?.value?.trim() || "";
  if (!rawValue) {
    setStatus(catalogStatus, "Write a catalog value first.", "error");
    return;
  }
  setStatus(catalogStatus, "Saving catalog value...");
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
    setStatus(catalogStatus, "Catalog value saved. It is now available in Staging and Rateware dropdowns.", "success");
    await loadCatalogValues();
  } catch (error) {
    setStatus(catalogStatus, error.message, "error");
  }
});

catalogValuesBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-catalog-archive]");
  if (!button) return;
  const row = currentCatalogValues.find((item) => item.id === button.dataset.catalogArchive);
  const label = row?.normalized_value || row?.raw_value || "this value";
  if (!window.confirm(`Archive manual catalog value "${label}"? It will stop appearing in new dropdown options.`)) return;
  button.disabled = true;
  setStatus(catalogStatus, "Archiving catalog value...");
  try {
    await archiveCatalogValue(button.dataset.catalogArchive);
    setStatus(catalogStatus, "Catalog value archived.", "success");
    await loadCatalogValues();
  } catch (error) {
    button.disabled = false;
    setStatus(catalogStatus, error.message, "error");
  }
});

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(profileStatus, "Saving profile...");
  try {
    await updateSaasProfile(formValues(profileInputs));
    setStatus(profileStatus, "Profile saved.", "success");
    await loadSettings();
  } catch (error) {
    setStatus(profileStatus, error.message, "error");
  }
});

organizationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(organizationStatus, "Saving organization...");
  try {
    await updateSaasOrganization(formValues(organizationInputs));
    setStatus(organizationStatus, "Organization saved.", "success");
    await loadSettings();
  } catch (error) {
    setStatus(organizationStatus, error.message, "error");
  }
});

onboardingList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-onboarding-task]");
  if (!button) return;
  button.disabled = true;
  try {
    const result = await updateOnboardingTask(button.dataset.onboardingTask, true);
    currentSettings.onboarding = result.onboarding || currentSettings.onboarding;
    currentSettings.audit = result.audit || currentSettings.audit;
    renderOnboarding(currentSettings);
    renderAudit(currentSettings);
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message;
  }
});
