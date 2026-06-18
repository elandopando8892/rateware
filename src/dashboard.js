import { initAuthControls, requirePrivatePage } from "./auth.js";
import { syncRatewareCatalog } from "./catalog-service.js";
import { callRatewareApi } from "./rateware-api.js";

const metricUploads = document.querySelector("#metric-uploads");
const metricVendors = document.querySelector("#metric-vendors");
const metricPending = document.querySelector("#metric-pending");
const metricApproved = document.querySelector("#metric-approved");
const workflowSourcing = document.querySelector("#workflow-sourcing");
const workflowProcurement = document.querySelector("#workflow-procurement");
const workflowUploads = document.querySelector("#workflow-uploads");
const workflowStaging = document.querySelector("#workflow-staging");
const workflowRateware = document.querySelector("#workflow-rateware");
const diagnostics = document.querySelector("#access-diagnostics");
const syncCatalogButton = document.querySelector("#sync-catalog-button");
const catalogSyncStatus = document.querySelector("#catalog-sync-status");

function setMetric(element, value) {
  element.textContent = new Intl.NumberFormat().format(Number(value || 0));
}

function setText(element, value) {
  if (element) element.textContent = value;
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
    setText(workflowSourcing, `${new Intl.NumberFormat().format(Number(summary.vendors || 0))} vendors sourced`);
    setText(workflowProcurement, "Curated target carriers");
    setText(workflowUploads, `${new Intl.NumberFormat().format(Number(summary.raw_uploads || 0))} source files`);
    setText(workflowStaging, `${new Intl.NumberFormat().format(Number(summary.pending_review || 0))} pending review`);
    setText(workflowRateware, `${new Intl.NumberFormat().format(Number(summary.approved_rows || 0))} approved rows`);
  } catch (error) {
    metricUploads.textContent = "-";
    metricVendors.textContent = "-";
    metricPending.textContent = "-";
    metricApproved.textContent = "-";
  }
}

initAuthControls();
loadDashboard();

syncCatalogButton?.addEventListener("click", async () => {
  syncCatalogButton.disabled = true;
  catalogSyncStatus.textContent = "Syncing catalog...";
  catalogSyncStatus.dataset.tone = "neutral";

  try {
    const result = await syncRatewareCatalog();
    catalogSyncStatus.textContent = `Catalog synced: ${result.catalog_items} items, ${result.locations || 0} locations, ${result.fsc_trend || 0} fuel/FSC rows.`;
    catalogSyncStatus.dataset.tone = "success";
  } catch (error) {
    catalogSyncStatus.textContent = error.message;
    catalogSyncStatus.dataset.tone = "error";
  } finally {
    syncCatalogButton.disabled = false;
  }
});
