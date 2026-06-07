import { initAuthControls, requirePrivatePage } from "./auth.js";
import { callRatewareApi } from "./rateware-api.js";

const metricUploads = document.querySelector("#metric-uploads");
const metricPending = document.querySelector("#metric-pending");
const metricApproved = document.querySelector("#metric-approved");
const metricFailed = document.querySelector("#metric-failed");

function setMetric(element, value) {
  element.textContent = new Intl.NumberFormat().format(Number(value || 0));
}

async function loadDashboard() {
  try {
    await requirePrivatePage();
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
