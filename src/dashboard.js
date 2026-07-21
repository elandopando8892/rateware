import { initAuthControls, requirePrivatePage } from "./auth.js";
import { callRatewareApi } from "./rateware-api.js";
import { humanizeError } from "./error-copy.js";
import { loadingState, stateBlock } from "./ui-state.js";

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

const rateBookHealthPanel = document.querySelector("#rate-book-health");
const freshnessBar = document.querySelector("#freshness-bar");
const freshnessFresh = document.querySelector("#freshness-fresh");
const freshnessAging = document.querySelector("#freshness-aging");
const freshnessStale = document.querySelector("#freshness-stale");
const healthFreshShare = document.querySelector("#health-fresh-share");
const healthRecent = document.querySelector("#health-recent");
const healthGaps = document.querySelector("#health-gaps");

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

function rateBookFreshness(summary) {
  const fresh = numberValue(summary.fresh_rates);
  const aging = numberValue(summary.aging_rates);
  const stale = numberValue(summary.stale_rates);
  const total = fresh + aging + stale;
  return {
    available: summary.fresh_rates !== undefined,
    fresh,
    aging,
    stale,
    total,
    staleShare: total ? stale / total : 0,
    freshShare: total ? fresh / total : 0
  };
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
  const freshness = rateBookFreshness(summary);

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
      title: "Check open Bid Rooms",
      detail: rfxBids > 0 ? "Compare bid responses and decide which lanes need follow-up." : "Shortlist vendors and send invitations.",
      href: "./rfx-events.html",
      action: "Open Bid Room"
    });
  }

  if (freshness.available && freshness.stale > 0 && freshness.staleShare >= 0.35) {
    actions.push({
      severity: "warning",
      count: freshness.stale,
      title: "Re-quote stale lanes",
      detail: `${Math.round(freshness.staleShare * 100)}% of the approved book is older than 60 days. Launch a Bid Room to refresh pricing.`,
      href: "./rfx-events.html",
      action: "Open Bid Room"
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

function renderRateBookHealth(summary) {
  if (!rateBookHealthPanel) return;
  const freshness = rateBookFreshness(summary);

  // Older deployments of the rateware-api function do not return freshness
  // fields yet; keep the panel hidden until the data exists.
  if (!freshness.available || !freshness.total) {
    rateBookHealthPanel.classList.add("hidden");
    return;
  }

  if (freshnessBar) {
    const segments = { fresh: freshness.fresh, aging: freshness.aging, stale: freshness.stale };
    Object.entries(segments).forEach(([key, value]) => {
      const segment = freshnessBar.querySelector(`.${key}`);
      if (segment) segment.style.flexGrow = String(value || 0);
    });
    freshnessBar.setAttribute(
      "aria-label",
      `Quote freshness: ${formatCount(freshness.fresh)} fresh, ${formatCount(freshness.aging)} aging, ${formatCount(freshness.stale)} stale`
    );
  }

  setText(freshnessFresh, formatCount(freshness.fresh));
  setText(freshnessAging, formatCount(freshness.aging));
  setText(freshnessStale, formatCount(freshness.stale));
  setText(healthFreshShare, `${Math.round(freshness.freshShare * 100)}%`);
  setMetric(healthRecent, summary.recent_rates_7d);
  setMetric(healthGaps, summary.location_gap_rates);
  rateBookHealthPanel.classList.remove("hidden");
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
  setText(workflowRfx, `${formatCount(summary.rfx_open_events)} open Bid Rooms`);
  setText(workflowUploads, `${formatCount(summary.raw_uploads)} source files`);
  setText(workflowVendors, `${formatCount(summary.procurement_vendors)} procurement vendors`);
  setText(progressUpload, `${formatCount(summary.raw_uploads)} files`);
  setText(progressInterpret, `${formatCount(summary.failed_uploads)} failed`);
  setText(progressReview, `${formatCount(summary.pending_review)} pending`);
  setText(progressRateware, `${formatCount(summary.approved_rows)} approved`);
  setText(progressRfx, `${formatCount(summary.rfx_open_events)} events`);
  setText(progressOutreach, `${formatCount(summary.rfx_bids)} bids`);

  renderRateBookHealth(summary);
  renderNextBestAction(summary);
  renderPriorityQueue(summary);
}

function renderDashboardLoading() {
  [metricPending, metricFailed, metricApproved, metricProcurement, metricRfxOpen, metricRfxBids].forEach((element) => {
    if (element) element.textContent = "-";
  });
  if (nextActionCard) nextActionCard.setAttribute("data-severity", "info");
  setText(nextActionTitle, "Checking today's work...");
  setText(nextActionDetail, "Loading the highest-impact action from uploads, staging, AI, and Bid Room.");
  if (nextActionLink) {
    nextActionLink.textContent = "Loading";
    nextActionLink.href = "#";
  }
  if (priorityQueue) {
    priorityQueue.innerHTML = loadingState({
      title: "Loading priorities",
      detail: "Checking staging, failed uploads, Bid Room, and vendor readiness."
    });
  }
}

function renderLoadError(error) {
  const message = humanizeError(error);
  setMetric(metricPending, 0);
  setMetric(metricFailed, 0);
  setMetric(metricApproved, 0);
  setMetric(metricProcurement, 0);
  setMetric(metricRfxOpen, 0);
  setMetric(metricRfxBids, 0);

  if (nextActionCard) nextActionCard.setAttribute("data-severity", "critical");
  setText(nextActionTitle, "Dashboard could not load");
  setText(nextActionDetail, message);
  if (nextActionLink) {
    nextActionLink.textContent = "Retry";
    nextActionLink.href = "#";
    nextActionLink.dataset.retryAction = "load-dashboard";
  }

  if (priorityQueue) {
    priorityQueue.innerHTML = stateBlock({
      tone: "danger",
      eyebrow: "Needs attention",
      title: "Could not load today's queue",
      detail: message,
      actionButton: '<button class="secondary small-button" type="button" data-retry-action="load-dashboard">Retry dashboard</button>'
    });
  }
}

let dashboardLoadVersion = 0;

async function loadDashboard() {
  const loadVersion = ++dashboardLoadVersion;
  renderDashboardLoading();
  try {
    const session = await requirePrivatePage();
    if (loadVersion !== dashboardLoadVersion || !session?.token) return;
    const summary = await callRatewareApi("dashboard_summary");
    if (loadVersion !== dashboardLoadVersion) return;
    renderSummary(summary);
  } catch (error) {
    if (loadVersion !== dashboardLoadVersion) return;
    renderLoadError(error);
  }
}

initAuthControls();
loadDashboard();

document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-action='load-dashboard']");
  if (!retryButton) return;
  event.preventDefault();
  if (nextActionLink) delete nextActionLink.dataset.retryAction;
  loadDashboard();
});
