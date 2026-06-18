import { initAuthControls, requirePrivatePage } from "./auth.js";
import { syncRatewareCatalog } from "./catalog-service.js";
import { callRatewareApi } from "./rateware-api.js";

const metricSourcing = document.querySelector("#metric-sourcing");
const metricProcurement = document.querySelector("#metric-procurement");
const metricPending = document.querySelector("#metric-pending");
const metricApproved = document.querySelector("#metric-approved");
const signalUploads = document.querySelector("#signal-uploads");
const signalArchived = document.querySelector("#signal-archived");
const signalFailed = document.querySelector("#signal-failed");
const workflowSourcing = document.querySelector("#workflow-sourcing");
const workflowProcurement = document.querySelector("#workflow-procurement");
const workflowUploads = document.querySelector("#workflow-uploads");
const workflowStaging = document.querySelector("#workflow-staging");
const workflowRateware = document.querySelector("#workflow-rateware");
const diagnostics = document.querySelector("#access-diagnostics");
const syncCatalogButton = document.querySelector("#sync-catalog-button");
const catalogSyncStatus = document.querySelector("#catalog-sync-status");
const priorityQueue = document.querySelector("#priority-queue");

function setMetric(element, value) {
  element.textContent = new Intl.NumberFormat().format(Number(value || 0));
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numberValue(value) {
  return Number(value || 0);
}

function formatCount(value) {
  return new Intl.NumberFormat().format(numberValue(value));
}

function priorityItems(summary) {
  const items = [
    {
      tone: "danger",
      count: numberValue(summary.failed_uploads),
      title: "Fix failed interpretations",
      detail: "Review files that failed interpretation before uploading more source data.",
      href: "./upload-history.html",
      action: "Open failed uploads"
    },
    {
      tone: "warning",
      count: numberValue(summary.pending_review),
      title: "Review staged rates",
      detail: "Approve clean rows or correct missing rate/location issues before they enter Rateware.",
      href: "./staging-review.html",
      action: "Open staging"
    },
    {
      tone: "neutral",
      count: numberValue(summary.raw_uploads),
      title: "Interpret source files",
      detail: "Use Upload History to move preserved carrier files into staging.",
      href: "./upload-history.html",
      action: "Open upload history"
    },
    {
      tone: "neutral",
      count: numberValue(summary.sourcing_vendors),
      title: "Curate sourcing base",
      detail: "Clean vendor contacts, tags, and coverage before moving targets into Procurement Base.",
      href: "./vendors.html",
      action: "Open vendors"
    },
    {
      tone: "success",
      count: numberValue(summary.approved_rows),
      title: "Use approved Rateware",
      detail: "Search, inspect, and export approved rates for commercial use.",
      href: "./rateware.html",
      action: "Open Rateware"
    }
  ];

  return items
    .filter((item) => item.count > 0 || item.tone === "success")
    .sort((a, b) => {
      const rank = { danger: 0, warning: 1, neutral: 2, success: 3 };
      return rank[a.tone] - rank[b.tone] || b.count - a.count;
    })
    .slice(0, 4);
}

function renderPriorityQueue(summary) {
  if (!priorityQueue) return;
  const items = priorityItems(summary);
  if (!items.length) {
    priorityQueue.innerHTML = `
      <article class="success">
        <strong>Pipeline is clear</strong>
        <span>Upload source files or add vendors to start building Rateware.</span>
        <a href="./upload-center.html">Upload source files</a>
      </article>
    `;
    return;
  }

  priorityQueue.innerHTML = items
    .map(
      (item) => `
        <article class="${item.tone}">
          <div>
            <strong>${item.title}</strong>
            <span>${item.detail}</span>
          </div>
          <b>${formatCount(item.count)}</b>
          <a href="${item.href}">${item.action}</a>
        </article>
      `
    )
    .join("");
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
    setMetric(metricSourcing, summary.sourcing_vendors);
    setMetric(metricProcurement, summary.procurement_vendors);
    setMetric(metricPending, summary.pending_review);
    setMetric(metricApproved, summary.approved_rows);
    setText(workflowSourcing, `${new Intl.NumberFormat().format(Number(summary.sourcing_vendors || 0))} vendors sourced`);
    setText(workflowProcurement, `${new Intl.NumberFormat().format(Number(summary.procurement_vendors || 0))} target carriers`);
    setText(workflowUploads, `${new Intl.NumberFormat().format(Number(summary.raw_uploads || 0))} source files`);
    setText(workflowStaging, `${new Intl.NumberFormat().format(Number(summary.pending_review || 0))} pending review`);
    setText(workflowRateware, `${new Intl.NumberFormat().format(Number(summary.approved_rows || 0))} approved rows`);
    setText(signalUploads, `${new Intl.NumberFormat().format(Number(summary.raw_uploads || 0))} source files`);
    setText(signalArchived, `${new Intl.NumberFormat().format(Number(summary.archived_vendors || 0))} archived vendors`);
    setText(signalFailed, `${new Intl.NumberFormat().format(Number(summary.failed_uploads || 0))} failed uploads`);
    renderPriorityQueue(summary);
  } catch (error) {
    metricSourcing.textContent = "-";
    metricProcurement.textContent = "-";
    metricPending.textContent = "-";
    metricApproved.textContent = "-";
    if (priorityQueue) {
      priorityQueue.innerHTML = `
        <article class="danger">
          <strong>Could not load priorities</strong>
          <span>${escapeHtml(error.message)}</span>
          <a href="./upload-history.html">Open upload history</a>
        </article>
      `;
    }
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
