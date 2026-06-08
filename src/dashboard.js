import { initAuthControls, requirePrivatePage } from "./auth.js";
import { callRatewareApi } from "./rateware-api.js";

const metricUploads = document.querySelector("#metric-uploads");
const metricVendors = document.querySelector("#metric-vendors");
const metricPending = document.querySelector("#metric-pending");
const metricApproved = document.querySelector("#metric-approved");
const diagnostics = document.querySelector("#access-diagnostics");

function setMetric(element, value) {
  element.textContent = new Intl.NumberFormat().format(Number(value || 0));
}

async function loadAccessDiagnostics(session) {
  if (!diagnostics) return;

  try {
    const values = [
      session.user?.email || "Kinde user",
      "Full access enabled",
      "All authenticated users can use every module"
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
    setMetric(metricVendors, summary.vendors);
    setMetric(metricPending, summary.pending_review);
    setMetric(metricApproved, summary.approved_rows);
  } catch (error) {
    metricUploads.textContent = "-";
    metricVendors.textContent = "-";
    metricPending.textContent = "-";
    metricApproved.textContent = "-";
  }
}

initAuthControls();
loadDashboard();
