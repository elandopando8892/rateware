import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  fetchSaasSettings,
  updateOnboardingTask,
  updateSaasOrganization,
  updateSaasProfile
} from "./settings-service.js";

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

initAuthControls();
requirePrivatePage().then((session) => {
  currentSession = session;
  if (session?.token) loadSettings();
});

refreshButton?.addEventListener("click", loadSettings);

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
