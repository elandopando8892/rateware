import { getAccessContext, initAuthControls, requirePrivatePage } from "./auth.js";
import { callRatewareApi } from "./rateware-api.js";

const metricUploads = document.querySelector("#metric-uploads");
const metricPending = document.querySelector("#metric-pending");
const metricApproved = document.querySelector("#metric-approved");
const metricFailed = document.querySelector("#metric-failed");
const diagnostics = document.querySelector("#access-diagnostics");

function setMetric(element, value) {
  element.textContent = new Intl.NumberFormat().format(Number(value || 0));
}

function roleLabel(role) {
  if (!role) return "";
  if (typeof role === "string") return role;
  return role.name || role.key || JSON.stringify(role);
}

function permissionLabel(permission) {
  if (!permission) return "";
  if (typeof permission === "string") return permission;
  return permission.name || permission.key || JSON.stringify(permission);
}

async function loadAccessDiagnostics(session) {
  if (!diagnostics) return;

  try {
    const access = await getAccessContext();
    const values = [
      session.user?.email || "Kinde user",
      access.roles.map(roleLabel).join(", ") || "No roles assigned",
      access.permissions.map(permissionLabel).join(", ") || "No permissions assigned"
    ];

    diagnostics.querySelectorAll("dd").forEach((element, index) => {
      element.textContent = values[index];
    });
  } catch (error) {
    diagnostics.querySelectorAll("dd").forEach((element) => {
      element.textContent = error.message;
    });
  }
}

async function loadDashboard() {
  try {
    const session = await requirePrivatePage();
    if (!session?.token) return;
    await loadAccessDiagnostics(session);
    const summary = await callRatewareApi("dashboard_summary");
    setMetric(metricUploads, summary.raw_uploads);
    setMetric(metricPending, summary.pending_review);
    setMetric(metricApproved, summary.approved_rows);
    setMetric(metricFailed, summary.failed_uploads);
  } catch (error) {
    metricUploads.textContent = "-";
    metricPending.textContent = "-";
    metricApproved.textContent = "-";
    metricFailed.textContent = "-";
  }
}

initAuthControls();
loadDashboard();
