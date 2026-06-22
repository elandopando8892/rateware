import { initAuthControls, requirePrivatePage } from "./auth.js";
import { callRatewareApi } from "./rateware-api.js";

const nextActionCard = document.querySelector("#next-best-action");
const nextActionTitle = document.querySelector("#next-action-title");
const nextActionDetail = document.querySelector("#next-action-detail");
const nextActionLink = document.querySelector("#next-action-link");

const metricPending = document.querySelector("#metric-pending");
const metricFailed = document.querySelector("#metric-failed");
const metricApproved = document.querySelector("#metric-approved");
const metricProcurement = document.querySelector("#metric-procurement");
const metricRfxOpen = document.querySelector("#metric-rfx-open");
const metricRfxBids = document.querySelector("#metric-rfx-bids");

const workflowStaging = document.querySelector("#workflow-staging");
const workflowFailed = document.querySelector("#workflow-failed");
const workflowRfx = document.querySelector("#workflow-rfx");
const workflowUploads = document.querySelector("#workflow-uploads");
const workflowVendors = document.querySelector("#workflow-vendors");
const priorityQueue = document.querySelector("#priority-queue");
const progressUpload = document.querySelector("#progress-upload");
const progressInterpret = document.querySelector("#progress-interpret");
const progressReview = document.querySelector("#progress-review");
const progressRateware = document.querySelector("#progress-rateware");
const progressRfx = document.querySelector("#progress-rfx");
const progressOutreach = document.querySelector("#progress-outreach");

function numberValue(value) {
  return Number(value || 0);
}

function formatCount(value) {
  return new Intl.NumberFormat().format(numberValue(value));
}

function setMetric(element, value) {
  if (element) element.textContent = formatCount(value);
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

function buildActionList(summary) {
  const failedUploads = numberValue(summary.failed_uploads);
  const pendingReview = numberValue(summary.pending_review);
  const openRfx = numberValue(summary.rfx_open_events);
  const rfxBids = numberValue(summary.rfx_bids);
  const procurementVendors = numberValue(summary.procurement_vendors);
  const sourcingVendors = numberValue(summary.sourcing_vendors);
  const rawUploads = numberValue(summary.raw_uploads);
  const approvedRows = numberValue(summary.approved_rows);

  const actions = [];

  if (failedUploads > 0) {
    actions.push({
      severity: "critical",
      count: failedUploads,
      title: "Fix failed uploads",
      detail: "Files need review before their rates can be trusted.",
      href: "./upload-history.html?status=failed",
      action: "Open failed uploads"
    });
  }

  if (pendingReview > 0) {
    actions.push({
      severity: "warning",
      count: pendingReview,
      title: "Approve staged rates",
      detail: "Rows are waiting for human review before they become Rateware.",
      href: "./staging-review.html",
      action: "Open staging"
    });
  }

  if (openRfx > 0) {
    actions.push({
      severity: "info",
      count: openRfx,
      title: "Check open RFx events",
      detail: rfxBids > 0 ? "Compare bid responses and decide which lanes need follow-up." : "Shortlist vendors and send invitations.",
      href: "./rfx-events.html",
      action: "Open RFx"
    });
  }

  if (procurementVendors === 0 && sourcingVendors > 0) {
    actions.push({
      severity: "warning",
      count: sourcingVendors,
      title: "Promote target vendors",
      detail: "Move selected carriers from Sourcing Base into Procurement Base.",
      href: "./vendors.html",
      action: "Open vendors"
    });
  }

  if (rawUploads === 0) {
    actions.push({
      severity: "info",
      count: 0,
      title: "Upload carrier quotes",
      detail: "Start with PDFs, emails, spreadsheets, or images from carriers.",
      href: "./upload-center.html",
      action: "Upload files"
    });
  }

  if (approvedRows === 0 && pendingReview === 0) {
    actions.push({
      severity: "info",
      count: 0,
      title: "Ask AI for sourcing targets",
      detail: "Get recommended carriers by operation, corridor, market, or equipment.",
      href: "./business-intelligence.html",
      action: "Ask AI"
    });
  }

  if (!actions.length) {
    actions.push({
      severity: "success",
      count: approvedRows,
      title: "Rateware is ready",
      detail: "Use the approved rate book or ask AI where to optimize next.",
      href: "./business-intelligence.html",
      action: "Ask AI Analyst"
    });
  }

  return actions;
}

function renderNextBestAction(summary) {
  const [action] = buildActionList(summary);
  if (!action || !nextActionTitle || !nextActionDetail || !nextActionLink) return;

  nextActionCard?.setAttribute("data-severity", action.severity);
  nextActionTitle.textContent = action.title;
  nextActionDetail.textContent = action.detail;
  nextActionLink.textContent = action.action;
  nextActionLink.href = action.href;
}

function renderPriorityQueue(summary) {
  if (!priorityQueue) return;
  const items = buildActionList(summary).slice(0, 5);

  priorityQueue.innerHTML = items
    .map(
      (item) => `
        <a class="priority-alert ${item.severity}" href="${item.href}">
          <div>
            <span>${item.severity === "critical" ? "Critical" : item.severity === "warning" ? "Needs review" : item.severity === "success" ? "Ready" : "Next"}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.detail)}</small>
          </div>
          <b>${item.count ? formatCount(item.count) : "Go"}</b>
        </a>
      `
    )
    .join("");
}

function renderSummary(summary) {
  setMetric(metricPending, summary.pending_review);
  setMetric(metricFailed, summary.failed_uploads);
  setMetric(metricApproved, summary.approved_rows);
  setMetric(metricProcurement, summary.procurement_vendors);
  setMetric(metricRfxOpen, summary.rfx_open_events);
  setMetric(metricRfxBids, summary.rfx_bids);

  setText(workflowStaging, `${formatCount(summary.pending_review)} pending rows`);
  setText(workflowFailed, `${formatCount(summary.failed_uploads)} files need review`);
  setText(workflowRfx, `${formatCount(summary.rfx_open_events)} open events`);
  setText(workflowUploads, `${formatCount(summary.raw_uploads)} source files`);
  setText(workflowVendors, `${formatCount(summary.procurement_vendors)} procurement vendors`);
  setText(progressUpload, `${formatCount(summary.raw_uploads)} files`);
  setText(progressInterpret, `${formatCount(summary.failed_uploads)} failed`);
  setText(progressReview, `${formatCount(summary.pending_review)} pending`);
  setText(progressRateware, `${formatCount(summary.approved_rows)} approved`);
  setText(progressRfx, `${formatCount(summary.rfx_open_events)} events`);
  setText(progressOutreach, `${formatCount(summary.rfx_bids)} bids`);

  renderNextBestAction(summary);
  renderPriorityQueue(summary);
}

function renderLoadError(error) {
  setMetric(metricPending, 0);
  setMetric(metricFailed, 0);
  setMetric(metricApproved, 0);
  setMetric(metricProcurement, 0);
  setMetric(metricRfxOpen, 0);
  setMetric(metricRfxBids, 0);

  if (nextActionCard) nextActionCard.setAttribute("data-severity", "critical");
  setText(nextActionTitle, "Dashboard could not load");
  setText(nextActionDetail, error.message);
  if (nextActionLink) {
    nextActionLink.textContent = "Open uploads";
    nextActionLink.href = "./upload-history.html?status=failed";
  }

  if (priorityQueue) {
    priorityQueue.innerHTML = `
      <a class="priority-alert critical" href="./upload-history.html?status=failed">
        <div>
          <span>Critical</span>
          <strong>Could not load today's queue</strong>
          <small>${escapeHtml(error.message)}</small>
        </div>
        <b>Open</b>
      </a>
    `;
  }
}

async function loadDashboard() {
  try {
    const session = await requirePrivatePage();
    if (!session?.token) return;
    const summary = await callRatewareApi("dashboard_summary");
    renderSummary(summary);
  } catch (error) {
    renderLoadError(error);
  }
}

initAuthControls();
loadDashboard();
