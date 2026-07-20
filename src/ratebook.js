import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import {
  fetchRatebook,
  fetchRatebookCarriers,
  fetchRatebookAudit,
  fetchRatebookRouteDetail,
  fetchRatebookRouteQuotes,
  fetchRatebookHealth,
  fetchRatebooks,
  archiveRatebook,
  createRatebookRevision,
  publishRatebook,
  queueRatebookDistribution,
  sendRatebookDistribution,
  shareRatebookWithCarriers,
  updateRatebookQuoteReview,
} from "./ratebook-service.js";

const query = new URLSearchParams(window.location.search);

const state = {
  rows: [],
  activeRatebookId: query.get("ratebook") || "",
  projectId: query.get("project") || "",
  detail: null,
  search: "",
  status: "",
  shipperId: "",
  sourceType: "",
  segmentKey: "",
  facets: { shippers: [], sources: [], segments: [] },
  health: null,
  routeSearch: "",
  routeSegmentKey: "",
  routeStatus: "",
  carriers: [],
  selectedCarrierIds: new Set(),
  carrierSearch: "",
  magicLinks: [],
  distributionMessageIds: [],
  audit: null,
  quoteReviewPackageLaneId: "",
  quoteReview: null,
};

const elements = {
  search: document.querySelector("#ratebook-search"),
  statusFilter: document.querySelector("#ratebook-status-filter"),
  shipperFilter: document.querySelector("#ratebook-shipper-filter"),
  sourceFilter: document.querySelector("#ratebook-source-filter"),
  segmentFilter: document.querySelector("#ratebook-segment-filter"),
  status: document.querySelector("#ratebook-status"),
  count: document.querySelector("#ratebook-count"),
  overviewBooks: document.querySelector("#ratebook-overview-books"),
  overviewShippers: document.querySelector("#ratebook-overview-shippers"),
  overviewRoutes: document.querySelector("#ratebook-overview-routes"),
  overviewPublished: document.querySelector("#ratebook-overview-published"),
  healthPriority: document.querySelector("#ratebook-health-priority"),
  healthExpiring: document.querySelector("#ratebook-health-expiring"),
  healthUnquoted: document.querySelector("#ratebook-health-unquoted"),
  healthReview: document.querySelector("#ratebook-health-review"),
  decisionQueue: document.querySelector("#ratebook-decision-queue"),
  list: document.querySelector("#ratebook-list"),
  detail: document.querySelector("#ratebook-detail"),
  refresh: document.querySelector("#refresh-ratebooks"),
  drawer: document.querySelector("#ratebook-route-drawer"),
  drawerBackdrop: document.querySelector("#ratebook-drawer-backdrop"),
  drawerContent: document.querySelector("#ratebook-route-content"),
  closeDrawer: document.querySelector("#close-ratebook-route"),
  shareDialog: document.querySelector("#ratebook-share-dialog"),
  closeShareDialog: document.querySelector("#close-ratebook-share"),
  shareDescription: document.querySelector("#ratebook-share-description"),
  carrierSearch: document.querySelector("#ratebook-carrier-search"),
  carrierList: document.querySelector("#ratebook-carrier-list"),
  selectVisibleCarriers: document.querySelector("#select-visible-ratebook-carriers"),
  selectionCount: document.querySelector("#ratebook-selection-count"),
  shareStatus: document.querySelector("#ratebook-share-status"),
  shareButton: document.querySelector("#share-ratebook-with-carriers"),
  createEmailDrafts: document.querySelector("#ratebook-create-email-drafts"),
  sendDistribution: document.querySelector("#send-ratebook-distribution"),
  magicLinks: document.querySelector("#ratebook-magic-links"),
  auditDialog: document.querySelector("#ratebook-audit-dialog"),
  auditContent: document.querySelector("#ratebook-audit-content"),
  closeAuditDialog: document.querySelector("#close-ratebook-audit"),
  quoteReviewDialog: document.querySelector("#ratebook-quote-review-dialog"),
  quoteReviewContent: document.querySelector("#ratebook-quote-review-content"),
  quoteReviewDescription: document.querySelector("#ratebook-quote-review-description"),
  closeQuoteReviewDialog: document.querySelector("#close-ratebook-quote-review"),
};

let searchTimer;
let carrierSearchTimer;
let routeSearchTimer;

function text(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function escapeHtml(value) {
  return text(value, "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function label(value) {
  return text(value, "Unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat("en-US").format(numeric) : "0";
}

function money(value, currency = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric)}${currency ? ` ${text(currency, "").toUpperCase()}` : ""}`;
}

function dateTime(value) {
  if (!value) return "Not updated";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleDateString();
}

function setStatus(target, message, tone = "") {
  if (!target) return;
  target.textContent = message || "";
  target.dataset.tone = tone;
}

function activeRatebookRow() {
  return state.rows.find((row) => String(row.id) === String(state.activeRatebookId)) || null;
}

function detailValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => text(item, "")).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined && entry !== "")
      .map(([key, entry]) => `${label(key)}: ${detailValue(entry)}`)
      .join("\n");
  }
  return text(value, "Not specified");
}

function renderFilterOptions(element, options, allLabel, selectedValue) {
  if (!element) return;
  const safeOptions = Array.isArray(options) ? options : [];
  element.innerHTML = [
    `<option value="">${escapeHtml(allLabel)}</option>`,
    ...safeOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)} (${number(option.count)})</option>`),
  ].join("");
  element.value = safeOptions.some((option) => String(option.value) === String(selectedValue)) ? selectedValue : "";
}

function renderBookFilters() {
  renderFilterOptions(elements.shipperFilter, state.facets.shippers, "All shippers", state.shipperId);
  renderFilterOptions(elements.sourceFilter, state.facets.sources, "All sources", state.sourceType);
  renderFilterOptions(elements.segmentFilter, state.facets.segments, "All segments", state.segmentKey);
}

function renderRatebookOverview() {
  const rows = state.rows;
  const shippers = new Set(rows.map((row) => text(row.shipper_id || row.shipper_name || row.project?.customer_name, "Unassigned shipper")));
  const routes = rows.reduce((total, row) => total + (Number(row.lane_count) || 0), 0);
  const published = rows.filter((row) => String(row.lifecycle_status || row.status).toLowerCase() === "published").length;
  elements.overviewBooks.textContent = number(rows.length);
  elements.overviewShippers.textContent = number(shippers.size);
  elements.overviewRoutes.textContent = number(routes);
  elements.overviewPublished.textContent = number(published);
}

function renderRatebookHealth() {
  const health = state.health || {};
  const summary = health.summary || {};
  const queue = Array.isArray(health.queue) ? health.queue : [];
  elements.healthPriority.textContent = number(summary.priority_issues);
  elements.healthExpiring.textContent = number(summary.expiring);
  elements.healthUnquoted.textContent = number(summary.routes_without_offers);
  elements.healthReview.textContent = number(summary.offers_to_review);
  if (!state.health) {
    elements.decisionQueue.innerHTML = `<span>Checking Ratebook health...</span>`;
    return;
  }
  if (!queue.length) {
    elements.decisionQueue.innerHTML = `<div class="ratebook-queue-empty"><strong>Ratebook health is clear</strong><span>No source, validity, delivery, coverage, or offer-review follow-up is pending.</span></div>`;
    return;
  }
  elements.decisionQueue.innerHTML = `
    <div class="ratebook-queue-heading"><strong>Decision queue</strong><span>${number(queue.length)} prioritized follow-up${queue.length === 1 ? "" : "s"}</span></div>
    <div class="ratebook-queue-items">
      ${queue.map((item) => `<article class="ratebook-queue-item is-${escapeHtml(text(item.priority, "low"))}">
        <span class="ratebook-queue-priority">${escapeHtml(label(item.priority))}</span>
        <div><strong>${escapeHtml(text(item.title, "Ratebook follow-up"))}</strong><small>${escapeHtml(text(item.ratebook_name, "Ratebook"))}${item.shipper_name ? ` | ${escapeHtml(item.shipper_name)}` : ""} | v${number(item.version_number || 1)}. ${escapeHtml(text(item.detail, ""))}</small></div>
        <button class="button button-secondary" type="button" data-ratebook-health-action="${escapeHtml(text(item.action, "open"))}" data-ratebook-health-id="${escapeHtml(item.ratebook_id)}" data-ratebook-health-route="${escapeHtml(text(item.package_lane_id, ""))}">${item.action === "review" ? "Review offers" : item.action === "revision" ? "Create revision" : item.action === "audit" ? "View audit" : "Open distribution"}</button>
      </article>`).join("")}
    </div>`;
}

async function loadRatebookHealth() {
  try {
    state.health = await fetchRatebookHealth();
    renderRatebookHealth();
  } catch {
    state.health = { summary: {}, queue: [] };
    elements.decisionQueue.innerHTML = `<div class="ratebook-queue-empty is-error"><strong>Ratebook health is unavailable</strong><span>Refresh to retry. Route books and carrier access remain available.</span></div>`;
  }
}

function renderBookList() {
  elements.count.textContent = number(state.rows.length);
  renderRatebookOverview();
  if (!state.rows.length) {
    elements.list.innerHTML = `
      <div class="ratebook-list-empty">
        <strong>No Ratebooks found</strong>
        <span>Adjust the scope filters or create an RFx Process from Shipper CRM to materialize a route book here.</span>
      </div>`;
    return;
  }

  const byShipper = new Map();
  state.rows.forEach((row) => {
    const shipper = text(row.shipper_name || row.project?.customer_name || row.project?.title || row.project_name || row.customer_name, "Unassigned shipper");
    const rows = byShipper.get(shipper) || [];
    rows.push(row);
    byShipper.set(shipper, rows);
  });
  elements.list.innerHTML = Array.from(byShipper.entries()).map(([shipper, rows]) => `
    <section class="ratebook-shipper-group">
      <div class="ratebook-shipper-heading"><span>${escapeHtml(shipper)}</span><span>${number(rows.length)} book${rows.length === 1 ? "" : "s"}</span></div>
      ${rows.map((row) => {
        const selected = String(row.id) === String(state.activeRatebookId);
        const packageName = text(row.name || row.package?.name || row.rfx_package_name || row.package_name, "Untitled Ratebook");
        const lifecycle = label(row.lifecycle_status || row.status || "draft");
        const segments = Array.isArray(row.segments) ? row.segments.length : Number(row.segment_count) || 0;
        const sourceChanged = Boolean(row.source_changed_at);
        return `
          <button class="ratebook-list-row ${selected ? "is-selected" : ""}" type="button" data-ratebook-id="${escapeHtml(row.id)}">
            <strong>${escapeHtml(packageName)}</strong>
            <span>${escapeHtml(label(row.source_type || "rfx"))} | ${number(segments)} segment${segments === 1 ? "" : "s"}</span>
            <small>${number(row.lane_count)} routes | ${number(row.shared_carrier_count)} carriers | ${escapeHtml(lifecycle)} | v${number(row.version_number || 1)}${sourceChanged ? " | source changed" : ""}</small>
          </button>`;
      }).join("")}
    </section>`).join("");
}

function renderEmptyDetail(message = "Select a Ratebook") {
  elements.detail.innerHTML = `
    <div class="ratebook-empty-state">
      <h2>${escapeHtml(message)}</h2>
      <p>Choose an RFx route book to review routes, inspect the RFI behind each transaction, and share it with carriers.</p>
    </div>`;
}

function routeTableRow(route) {
  const sourceLaneId = text(route.source_demand_lane_id || route.id, "");
  const packageLaneId = text(route.package_lane_id, "");
  const quoteCount = Number(route.ratebook_quote_count) || 0;
  const shortlistedCount = Number(route.shortlisted_quote_count) || 0;
  return `
    <tr>
      <td><button class="ratebook-transaction-link" type="button" data-open-route-id="${escapeHtml(sourceLaneId)}">${escapeHtml(route.transaction_id || route.id)}</button></td>
      <td>${escapeHtml(route.origin)}</td>
      <td>${escapeHtml(route.destination)}</td>
      <td>${escapeHtml(route.equipment)}</td>
      <td>${escapeHtml(route.operation)}</td>
      <td>${escapeHtml(route.service)}</td>
      <td>${escapeHtml(route.segment_name || route.segment_key)}</td>
      <td>${escapeHtml(route.weekly_volume)}</td>
      <td>${escapeHtml(route.frequency)}</td>
      <td><button class="ratebook-offer-count" type="button" data-review-ratebook-route="${escapeHtml(packageLaneId)}">${number(quoteCount)} offer${quoteCount === 1 ? "" : "s"}</button></td>
      <td>${shortlistedCount ? `<span class="ratebook-shortlist-pill">${number(shortlistedCount)} shortlisted</span>` : "-"}</td>
      <td><span class="ratebook-status-pill">${escapeHtml(label(route.status || "draft"))}</span></td>
    </tr>`;
}

function visibleRatebookRoutes(routes) {
  const search = state.routeSearch.trim().toLowerCase();
  return routes.filter((route) => {
    if (state.routeSegmentKey && String(route.segment_key || "").toLowerCase() !== state.routeSegmentKey) return false;
    if (state.routeStatus && String(route.status || "").toLowerCase() !== state.routeStatus) return false;
    if (!search) return true;
    return [
      route.transaction_id,
      route.origin,
      route.destination,
      route.equipment,
      route.operation,
      route.service,
      route.segment_name,
      route.currency,
    ].map((value) => text(value, "").toLowerCase()).join(" ").includes(search);
  });
}

function renderRatebookRouteGrid() {
  const grid = elements.detail.querySelector("#ratebook-route-grid-content");
  if (!grid || !state.detail) return;
  const routes = Array.isArray(state.detail.routes) ? state.detail.routes : [];
  const visibleRoutes = visibleRatebookRoutes(routes);
  const status = elements.detail.querySelector("#ratebook-route-filter-status");
  if (status) status.textContent = `${number(visibleRoutes.length)} of ${number(routes.length)} routes visible`;
  grid.innerHTML = `
    <div class="ratebook-grid-wrap">
      <table class="ratebook-routes-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Equipment</th>
            <th>Operation</th>
            <th>Service</th>
            <th>Segment</th>
            <th>Weekly</th>
            <th>Frequency</th>
            <th>Carrier offers</th>
            <th>Shortlist</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${visibleRoutes.length ? visibleRoutes.map(routeTableRow).join("") : `<tr><td colspan="11" class="ratebook-no-routes">No Ratebook routes match the current grid filters.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function routeSegmentOptions(routes, segments) {
  const known = new Map();
  [...segments, ...routes].forEach((item) => {
    const value = text(item.segment_key, "").toLowerCase();
    if (!value) return;
    known.set(value, text(item.segment_name || item.segment_key, value));
  });
  return Array.from(known.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function renderRatebookDetail() {
  const detail = state.detail;
  if (!detail?.ratebook) {
    renderEmptyDetail();
    return;
  }

  const { ratebook, project = {}, package: packageRow = {}, event = {}, routes = [], shares = [], segments = [], readiness = {}, distribution = {} } = detail;
  const eventId = text(event.id || ratebook.rfx_event_id, "");
  const title = text(ratebook.name || packageRow.name || packageRow.package_name, "Ratebook");
  const projectName = text(project.project_name || project.name || project.customer_name, "RFx project");
  const sharedCount = shares.length || Number(ratebook.shared_carrier_count) || 0;
  const bidCount = routes.reduce((total, route) => total + (Number(route.bid_count) || 0), 0);
  const lifecycle = String(ratebook.lifecycle_status || ratebook.status || "draft").toLowerCase();
  const status = label(lifecycle);
  const isPublished = lifecycle === "published";
  const isArchived = lifecycle === "archived";
  const isPublishable = readiness.ready === true;
  const sourceFreshness = String(ratebook.source_freshness || "unknown").toLowerCase();
  const sourceChanged = sourceFreshness === "outdated";
  const shipper = text(ratebook.shipper_name || project.customer_name || project.title, "Unassigned shipper");
  const engagement = distribution.summary || {};

  elements.detail.innerHTML = `
    <div class="ratebook-detail-heading">
      <div>
        <p class="eyebrow">${escapeHtml(projectName)}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(shipper)} | ${escapeHtml(label(ratebook.source_type || "rfx"))} | v${number(ratebook.version_number || 1)} | ${escapeHtml(status)}</p>
        ${isPublished ? `<p class="ratebook-source-freshness ${sourceChanged ? "is-outdated" : "is-current"}">${sourceChanged ? "The RFx source changed after this release. Create a revision to review the new source without changing carrier access to v" + number(ratebook.version_number || 1) + "." : "Published source is current. Carrier access remains pinned to this release."}</p>` : ""}
      </div>
      <div class="ratebook-detail-actions">
        ${!isPublished && !isArchived ? `<button class="button button-primary" type="button" data-action="publish-ratebook" ${isPublishable ? "" : "disabled"} title="${isPublishable ? "Publish this complete route book." : "Complete the route audit before publishing."}">Publish Ratebook</button>` : ""}
        ${isPublished ? `<button class="button button-primary" type="button" data-action="create-ratebook-revision" title="Create a new draft from the current RFx and RFI source. Published carrier links remain on this version until the revision is published.">Create revision</button>` : ""}
        <button class="button button-secondary" type="button" data-action="view-ratebook-audit">View audit</button>
        <button class="button button-primary" type="button" data-action="share-ratebook" ${isPublished ? "" : "disabled"} title="${isPublished ? "Share controlled carrier links." : "Publish the Ratebook before sharing it."}">Share with carriers</button>
        ${!isArchived ? `<button class="button button-secondary" type="button" data-action="archive-ratebook">Archive</button>` : ""}
        <button class="button button-secondary" type="button" data-action="open-rfx-process" ${project.id ? "" : "disabled"}>Open RFx Process</button>
        <button class="button button-secondary" type="button" data-action="open-bid-room" ${eventId ? "" : "disabled"}>Open Bid Room</button>
      </div>
    </div>
    <div class="ratebook-summary-grid">
      <article><span>Routes</span><strong>${number(routes.length)}</strong></article>
      <article><span>Segments</span><strong>${number(segments.length)}</strong></article>
      <article><span>Shared carriers</span><strong>${number(sharedCount)}</strong></article>
      <article><span>Carrier responses</span><strong>${number(bidCount)}</strong></article>
      <article><span>Audit</span><strong>${isPublishable ? "Ready" : `${number(readiness.issues?.length)} issue(s)`}</strong></article>
    </div>
    ${isPublished ? `<div class="ratebook-distribution-summary" aria-label="Ratebook carrier delivery and engagement">
      <span>Drafts<strong>${number(engagement.drafted)}</strong></span>
      <span>Sent<strong>${number(engagement.sent)}</strong></span>
      <span>Accessed<strong>${number(engagement.accessed)}</strong></span>
      <span>Quoted<strong>${number(engagement.quoted)}</strong></span>
    </div>` : ""}
    ${segments.length ? `<div class="ratebook-segment-strip">${segments.map((segment) => `<span class="ratebook-segment-chip" title="${escapeHtml([segment.operation, segment.service, segment.equipment].filter(Boolean).join(" | "))}">${escapeHtml(text(segment.segment_name || segment.segment_key, "Operating segment"))} <b>${number(segment.lane_count)} routes</b></span>`).join("")}</div>` : ""}
    <div class="ratebook-grid-heading">
      <div>
        <p class="eyebrow">Route schedule</p>
        <h3>Ratebook lanes</h3>
      </div>
      <p>Open a transaction ID for the full RFI context. The grid remains limited to route-level information.</p>
    </div>
    <div class="ratebook-route-toolbar" aria-label="Ratebook route filters">
      <label class="ratebook-filter-field ratebook-search-field">
        <span>Search routes</span>
        <input type="search" value="${escapeHtml(state.routeSearch)}" data-ratebook-route-search placeholder="Transaction, origin, destination, equipment..." autocomplete="off" />
      </label>
      <label class="ratebook-filter-field">
        <span>Segment</span>
        <select data-ratebook-route-segment>
          <option value="">All segments</option>
          ${routeSegmentOptions(routes, segments).map(([value, name]) => `<option value="${escapeHtml(value)}" ${value === state.routeSegmentKey ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
      <label class="ratebook-filter-field">
        <span>Route state</span>
        <select data-ratebook-route-status>
          <option value="">All route states</option>
          ${["ready", "shared", "quoted"].map((value) => `<option value="${value}" ${value === state.routeStatus ? "selected" : ""}>${escapeHtml(label(value))}</option>`).join("")}
        </select>
      </label>
      <p class="ratebook-route-filter-status" id="ratebook-route-filter-status"></p>
    </div>
    <div id="ratebook-route-grid-content"></div>`;
  renderRatebookRouteGrid();
}

function renderRouteDetail(result) {
  const lane = result?.demand_lane || {};
  const rfiLane = result?.rfi_lane || {};
  const detail = result?.detail || {};
  const title = text(lane.lane_key || rfiLane.lane_id || lane.id, "Route detail");
  const routeLine = `${text(lane.origin || rfiLane.origin)} -> ${text(lane.destination || rfiLane.destination)}`;
  const fields = [
    ["Logistics model", detail.logistics_model],
    ["Operation criteria", detail.operation_criteria],
    ["Business rules", detail.business_rules],
    ["Service specifications", detail.service_specifications],
    ["Carrier requirements", detail.carrier_requirements],
    ["Other notes", detail.other_notes],
  ];
  const routeFields = [
    ["Origin", lane.origin || rfiLane.origin],
    ["Destination", lane.destination || rfiLane.destination],
    ["Equipment", lane.equipment || rfiLane.equipment],
    ["Trailer", lane.trailer || rfiLane.trailer],
    ["Operation", lane.operation || rfiLane.operation],
    ["Service", lane.service || rfiLane.service],
    ["Weekly volume", lane.weekly_volume || rfiLane.weekly_volume],
    ["Target rate", lane.target_rate || rfiLane.target_rate],
    ["Currency", lane.currency || rfiLane.currency],
  ];

  elements.drawerContent.innerHTML = `
    <div class="ratebook-route-title">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(routeLine)}</span>
    </div>
    <dl class="ratebook-route-fields">
      ${routeFields.map(([field, value]) => `<div><dt>${escapeHtml(field)}</dt><dd>${escapeHtml(detailValue(value))}</dd></div>`).join("")}
    </dl>
    <div class="ratebook-rfi-sections">
      ${fields.map(([field, value]) => `
        <section class="ratebook-rfi-section">
          <h3>${escapeHtml(field)}</h3>
          <p>${escapeHtml(detailValue(value))}</p>
        </section>`).join("")}
    </div>`;
}

function openRouteDrawer() {
  elements.drawer.classList.remove("hidden");
  elements.drawerBackdrop.classList.remove("hidden");
}

function closeRouteDrawer() {
  elements.drawer.classList.add("hidden");
  elements.drawerBackdrop.classList.add("hidden");
}

async function showRouteDetail(sourceDemandLaneId) {
  if (!state.activeRatebookId || !sourceDemandLaneId) return;
  openRouteDrawer();
  elements.drawerContent.innerHTML = `<div class="ratebook-drawer-loading">Loading RFI route details...</div>`;
  try {
    const result = await fetchRatebookRouteDetail(state.activeRatebookId, sourceDemandLaneId);
    renderRouteDetail(result);
  } catch (error) {
    elements.drawerContent.innerHTML = `<div class="ratebook-drawer-error">${escapeHtml(humanizeError(error))}</div>`;
  }
}

function reviewDecisionLabel(value) {
  if (value === "shortlisted") return "Shortlisted";
  if (value === "not_selected") return "Not selected";
  return "Pending";
}

function renderRatebookQuoteReview(result) {
  const route = result?.route || {};
  const quotes = Array.isArray(result?.quotes) ? result.quotes : [];
  elements.quoteReviewDescription.textContent = `${text(route.transaction_id, "Route")} | ${text(route.origin)} -> ${text(route.destination)}. Shortlisting keeps the carrier's submitted offer unchanged and does not award or move a rate into Rateware.`;
  if (!quotes.length) {
    elements.quoteReviewContent.innerHTML = `<div class="ratebook-quote-review-empty"><strong>No submitted carrier offers</strong><span>Carrier responses will appear here when a private Ratebook recipient submits an all-in offer for this route.</span></div>`;
    return;
  }
  elements.quoteReviewContent.innerHTML = `
    <div class="ratebook-quote-review-guidance">Compare offers in their quoted currency. This review is a procurement shortlist, not an award.</div>
    <div class="ratebook-quote-review-list">
      ${quotes.map((quote) => {
        const vendor = quote.vendor || {};
        const review = quote.review || {};
        const decision = text(review.decision, "pending");
        return `
          <article class="ratebook-quote-review-row" data-ratebook-quote-review-row data-quote-id="${escapeHtml(quote.id)}">
            <header>
              <div>
                <strong>${escapeHtml(text(vendor.vendor_name || vendor.domain, "Carrier"))}</strong>
                <span>${escapeHtml(text(vendor.domain || vendor.primary_email, "No primary contact"))}</span>
              </div>
              <span class="ratebook-review-decision is-${escapeHtml(decision)}">${escapeHtml(reviewDecisionLabel(decision))}</span>
            </header>
            <dl class="ratebook-quote-review-metrics">
              <div><dt>All-in</dt><dd>${escapeHtml(money(quote.all_in_rate, quote.currency))}</dd></div>
              <div><dt>Capacity</dt><dd>${escapeHtml(number(quote.weekly_capacity))} / week</dd></div>
              <div><dt>Transit</dt><dd>${escapeHtml(number(quote.transit_days))} day(s)</dd></div>
              <div><dt>Valid until</dt><dd>${escapeHtml(dateTime(quote.valid_until))}</dd></div>
              <div><dt>Revision</dt><dd>v${escapeHtml(number(quote.revision_number || 1))}</dd></div>
            </dl>
            ${quote.notes ? `<p class="ratebook-quote-review-notes">${escapeHtml(quote.notes)}</p>` : ""}
            <div class="ratebook-quote-review-controls">
              <label>Decision
                <select data-ratebook-quote-decision>
                  ${["pending", "shortlisted", "not_selected"].map((value) => `<option value="${value}" ${value === decision ? "selected" : ""}>${escapeHtml(reviewDecisionLabel(value))}</option>`).join("")}
                </select>
              </label>
              <label>Review note
                <textarea data-ratebook-quote-note maxlength="4000" placeholder="Internal rationale, commercial follow-up, or next step...">${escapeHtml(text(review.decision_note, ""))}</textarea>
              </label>
              <button class="button button-primary" type="button" data-save-ratebook-quote-review>Save review</button>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

function closeRatebookQuoteReview() {
  if (elements.quoteReviewDialog.open) elements.quoteReviewDialog.close();
  state.quoteReviewPackageLaneId = "";
  state.quoteReview = null;
}

async function showRatebookQuoteReview(packageLaneId, open = true) {
  if (!state.activeRatebookId || !packageLaneId) return;
  state.quoteReviewPackageLaneId = packageLaneId;
  if (open && !elements.quoteReviewDialog.open) elements.quoteReviewDialog.showModal();
  elements.quoteReviewDescription.textContent = "Loading carrier offers for this route...";
  elements.quoteReviewContent.innerHTML = `<div class="ratebook-quote-review-empty">Loading submitted carrier offers...</div>`;
  try {
    state.quoteReview = await fetchRatebookRouteQuotes(state.activeRatebookId, packageLaneId);
    renderRatebookQuoteReview(state.quoteReview);
  } catch (error) {
    elements.quoteReviewContent.innerHTML = `<div class="ratebook-quote-review-empty is-error">${escapeHtml(humanizeError(error))}</div>`;
  }
}

async function saveRatebookQuoteReview(button) {
  const row = button.closest("[data-ratebook-quote-review-row]");
  const quoteId = row?.dataset.quoteId;
  if (!quoteId || !state.activeRatebookId) return;
  const decision = row.querySelector("[data-ratebook-quote-decision]")?.value || "pending";
  const decisionNote = row.querySelector("[data-ratebook-quote-note]")?.value || "";
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    await updateRatebookQuoteReview(state.activeRatebookId, quoteId, {
      decision,
      decision_note: decisionNote,
    });
    await selectRatebook(state.activeRatebookId, false);
    await showRatebookQuoteReview(state.quoteReviewPackageLaneId, false);
  } catch (error) {
    button.textContent = humanizeError(error);
    window.setTimeout(() => { button.textContent = originalText; }, 2200);
  } finally {
    button.disabled = false;
    if (button.textContent === "Saving...") button.textContent = originalText;
  }
}

function renderCarrierList() {
  const rows = state.carriers;
  if (!rows.length) {
    elements.carrierList.innerHTML = `<div class="ratebook-carrier-empty">No Carrier CRM records match this search.</div>`;
  } else {
    elements.carrierList.innerHTML = rows.map((carrier) => {
      const id = String(carrier.id);
      const checked = state.selectedCarrierIds.has(id);
      const name = text(carrier.vendor_name || carrier.legal_name, "Unnamed carrier");
      const identity = text(carrier.domain || carrier.primary_email, "No primary domain");
      return `
        <label class="ratebook-carrier-row">
          <input type="checkbox" value="${escapeHtml(id)}" ${checked ? "checked" : ""} data-ratebook-carrier-select />
          <span>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(identity)}</small>
          </span>
        </label>`;
    }).join("");
  }
  const selected = state.selectedCarrierIds.size;
  elements.selectionCount.textContent = `${number(selected)} selected`;
  elements.shareButton.disabled = !selected;
}

function renderMagicLinks() {
  if (!state.magicLinks.length) {
    elements.magicLinks.classList.add("hidden");
    elements.magicLinks.innerHTML = "";
    return;
  }
  elements.magicLinks.classList.remove("hidden");
  elements.magicLinks.innerHTML = `
    <div class="ratebook-magic-links-heading">
      <strong>Private carrier links</strong>
      <span>Each link is scoped to the selected carrier and Ratebook.</span>
    </div>
    ${state.magicLinks.map((item) => `
      <div class="ratebook-magic-link-row">
        <span>${escapeHtml(text(item.vendor_name || item.carrier_name, "Carrier"))}</span>
        <button class="button button-secondary" type="button" data-copy-ratebook-link="${escapeHtml(item.magic_link || item.url || "")}">Copy private link</button>
      </div>`).join("")}`;
}

async function loadCarriers() {
  if (!state.activeRatebookId) return;
  elements.carrierList.innerHTML = `<div class="ratebook-carrier-empty">Loading Carrier CRM...</div>`;
  try {
    const result = await fetchRatebookCarriers(state.activeRatebookId, { search: state.carrierSearch });
    state.carriers = result.rows || [];
    renderCarrierList();
  } catch (error) {
    elements.carrierList.innerHTML = `<div class="ratebook-carrier-empty">${escapeHtml(humanizeError(error))}</div>`;
  }
}

async function openShareDialog() {
  if (!state.activeRatebookId) return;
  const book = activeRatebookRow();
  const lifecycle = String(state.detail?.ratebook?.lifecycle_status || book?.lifecycle_status || book?.status || "draft").toLowerCase();
  if (lifecycle !== "published") {
    setStatus(elements.status, "Publish this Ratebook before creating carrier links.", "error");
    return;
  }
  state.selectedCarrierIds.clear();
  state.carrierSearch = "";
  elements.carrierSearch.value = "";
  state.magicLinks = [];
  state.distributionMessageIds = [];
  renderMagicLinks();
  elements.sendDistribution.classList.add("hidden");
  elements.createEmailDrafts.checked = true;
  setStatus(elements.shareStatus, "");
  elements.shareDescription.textContent = `Select Carrier CRM records for ${text(book?.name || book?.rfx_package_name, "this Ratebook")}. Every carrier receives its own private link.`;
  elements.shareDialog.showModal();
  await loadCarriers();
}

function closeShareDialog() {
  if (elements.shareDialog.open) elements.shareDialog.close();
}

function closeAuditDialog() {
  if (elements.auditDialog.open) elements.auditDialog.close();
}

function renderRatebookAudit(audit) {
  const issues = Array.isArray(audit?.readiness?.issues) ? audit.readiness.issues : [];
  const segments = Array.isArray(audit?.segments) ? audit.segments : [];
  const source = audit?.source || {};
  elements.auditContent.innerHTML = `
    <div class="ratebook-audit-summary ${audit?.readiness?.ready ? "is-ready" : "has-issues"}">
      <strong>${audit?.readiness?.ready ? "Ready to publish" : "Needs route corrections"}</strong>
      <span>${number(audit?.readiness?.route_count)} route(s) checked | ${number(issues.length)} issue(s)</span>
    </div>
    <dl class="ratebook-audit-fields">
      <div><dt>Shipper</dt><dd>${escapeHtml(text(source.shipper_name, "Not linked"))}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(label(source.type || "rfx"))}</dd></div>
      <div><dt>Source freshness</dt><dd>${escapeHtml(label(source.freshness || "unknown"))}${source.changed_at ? ` since ${escapeHtml(dateTime(source.changed_at))}` : ""}</dd></div>
      <div><dt>Version</dt><dd>v${number(audit?.version || 1)}</dd></div>
      <div><dt>Validity</dt><dd>${escapeHtml(dateTime(audit?.validity?.valid_from))} - ${escapeHtml(dateTime(audit?.validity?.valid_until))}</dd></div>
    </dl>
    <section class="ratebook-audit-section">
      <h3>Operating segments</h3>
      ${segments.length ? `<div class="ratebook-audit-segments">${segments.map((segment) => `<span>${escapeHtml(text(segment.segment_name || segment.segment_key, "Operating segment"))} <b>${number(segment.lane_count)} routes</b></span>`).join("")}</div>` : "<p>No segment has been materialized yet. The route book will use its operating data until a segment is added in RFx Process.</p>"}
    </section>
    <section class="ratebook-audit-section">
      <h3>Route checks</h3>
      ${issues.length ? `<ul class="ratebook-audit-issues">${issues.map((issue) => `<li><strong>${escapeHtml(text(issue.transaction_id, "Ratebook"))}</strong>: ${escapeHtml(issue.type === "missing_routes" ? text(issue.message) : `Missing ${Array.isArray(issue.missing) ? issue.missing.join(", ") : "route data"}.`)}</li>`).join("")}</ul>` : "<p>Every route has origin, destination, equipment, operation, service and currency.</p>"}
    </section>`;
}

async function showRatebookAudit() {
  if (!state.activeRatebookId) return;
  elements.auditContent.innerHTML = `<div class="ratebook-drawer-loading">Checking Ratebook source and routes...</div>`;
  elements.auditDialog.showModal();
  try {
    state.audit = await fetchRatebookAudit(state.activeRatebookId);
    renderRatebookAudit(state.audit);
  } catch (error) {
    elements.auditContent.innerHTML = `<div class="ratebook-drawer-error">${escapeHtml(humanizeError(error))}</div>`;
  }
}

async function applyRatebookLifecycle(action) {
  if (!state.activeRatebookId) return;
  const isPublish = action === "publish-ratebook";
  const confirmation = isPublish
    ? "Publish this Ratebook? Carrier links will become available after it passes its route audit."
    : "Archive this Ratebook? Active private carrier links will no longer be available.";
  if (!window.confirm(confirmation)) return;
  setStatus(elements.status, isPublish ? "Publishing Ratebook..." : "Archiving Ratebook...");
  try {
    const result = isPublish
      ? await publishRatebook(state.activeRatebookId)
      : await archiveRatebook(state.activeRatebookId);
    state.audit = null;
    setStatus(elements.status, isPublish ? "Ratebook published. Controlled carrier links are now available." : "Ratebook archived and active carrier links were closed.", "success");
    await loadRatebooks();
    if (result?.ratebook?.id) state.activeRatebookId = result.ratebook.id;
  } catch (error) {
    setStatus(elements.status, humanizeError(error), "error");
  }
}

async function createRatebookRevisionFromPublished() {
  if (!state.activeRatebookId) return;
  if (!window.confirm("Create a new draft revision from the current RFx/RFI source? The published carrier links will remain on the existing version until this revision is published.")) return;
  setStatus(elements.status, "Creating Ratebook revision...");
  try {
    const result = await createRatebookRevision(state.activeRatebookId);
    const revisionId = result?.ratebook?.id;
    if (!revisionId) throw new Error("Ratebook revision could not be created.");
    state.activeRatebookId = revisionId;
    state.audit = null;
    await loadRatebooks();
    setStatus(elements.status, result.reused_existing_draft
      ? "Opened the existing Ratebook revision draft."
      : "Ratebook revision draft created. Review it before publishing.", "success");
  } catch (error) {
    setStatus(elements.status, humanizeError(error), "error");
  }
}

async function handleRatebookHealthAction(button) {
  const ratebookId = button.dataset.ratebookHealthId;
  const action = button.dataset.ratebookHealthAction;
  const packageLaneId = button.dataset.ratebookHealthRoute;
  if (!ratebookId) return;
  await selectRatebook(ratebookId);
  if (action === "review" && packageLaneId) {
    await showRatebookQuoteReview(packageLaneId);
  } else if (action === "revision") {
    await createRatebookRevisionFromPublished();
  } else if (action === "audit") {
    await showRatebookAudit();
  } else if (action === "share") {
    await openShareDialog();
  }
}

async function sendRatebookShares() {
  if (!state.activeRatebookId || !state.selectedCarrierIds.size) return;
  elements.shareButton.disabled = true;
  setStatus(elements.shareStatus, elements.createEmailDrafts.checked ? "Creating private links and email drafts..." : "Creating private carrier links...");
  try {
    const result = elements.createEmailDrafts.checked
      ? await queueRatebookDistribution(state.activeRatebookId, [...state.selectedCarrierIds])
      : await shareRatebookWithCarriers(state.activeRatebookId, [...state.selectedCarrierIds]);
    state.magicLinks = result.magic_links || [];
    state.distributionMessageIds = result.message_ids || [];
    renderMagicLinks();
    if (state.distributionMessageIds.length) {
      elements.sendDistribution.classList.remove("hidden");
      setStatus(elements.shareStatus, `${number(state.magicLinks.length)} private link(s) and ${number(state.distributionMessageIds.length)} email draft(s) are ready for controlled delivery.`, "success");
    } else {
      setStatus(elements.shareStatus, `${number(state.magicLinks.length)} private Ratebook link(s) ready. No email draft was created for carriers without a primary email.`, "success");
    }
    await selectRatebook(state.activeRatebookId, false);
  } catch (error) {
    setStatus(elements.shareStatus, humanizeError(error), "error");
  } finally {
    elements.shareButton.disabled = !state.selectedCarrierIds.size;
  }
}

async function sendRatebookDistributionDrafts() {
  if (!state.activeRatebookId || !state.distributionMessageIds.length) return;
  if (!window.confirm(`Send ${state.distributionMessageIds.length} Ratebook email draft(s) now using the connected Gmail sender?`)) return;
  const original = elements.sendDistribution.textContent;
  elements.sendDistribution.disabled = true;
  elements.sendDistribution.textContent = "Sending...";
  try {
    const result = await sendRatebookDistribution(state.activeRatebookId, state.distributionMessageIds);
    const failed = Number(result.failed) || 0;
    setStatus(elements.shareStatus, `${number(result.sent)} Ratebook invitation(s) sent${failed ? `; ${number(failed)} failed.` : "."}`, failed ? "error" : "success");
    state.distributionMessageIds = [];
    elements.sendDistribution.classList.add("hidden");
    await selectRatebook(state.activeRatebookId, false);
  } catch (error) {
    setStatus(elements.shareStatus, humanizeError(error), "error");
  } finally {
    elements.sendDistribution.disabled = false;
    elements.sendDistribution.textContent = original;
  }
}

async function selectRatebook(ratebookId, updateList = true) {
  state.activeRatebookId = ratebookId;
  state.routeSearch = "";
  state.routeSegmentKey = "";
  state.routeStatus = "";
  if (updateList) renderBookList();
  elements.detail.innerHTML = `<div class="ratebook-detail-loading">Loading Ratebook routes...</div>`;
  try {
    state.detail = await fetchRatebook(ratebookId);
    renderRatebookDetail();
    const url = new URL(window.location.href);
    url.searchParams.set("ratebook", ratebookId);
    url.searchParams.delete("project");
    window.history.replaceState({}, "", url);
  } catch (error) {
    state.detail = null;
    elements.detail.innerHTML = `<div class="ratebook-detail-error"><strong>Ratebook could not load</strong><span>${escapeHtml(humanizeError(error))}</span></div>`;
  }
}

async function loadRatebooks() {
  setStatus(elements.status, "Loading route books...");
  try {
    const result = await fetchRatebooks({
      search: state.search,
      status: state.status,
      shipper_id: state.shipperId || undefined,
      source_type: state.sourceType || undefined,
      segment_key: state.segmentKey || undefined,
      project_id: state.projectId || undefined,
    });
    state.rows = result.rows || [];
    state.facets = result.facets || { shippers: [], sources: [], segments: [] };
    renderBookFilters();
    const activeExists = state.rows.some((row) => String(row.id) === String(state.activeRatebookId));
    if (!activeExists) state.activeRatebookId = state.rows[0]?.id || "";
    renderBookList();
    void loadRatebookHealth();
    setStatus(elements.status, `${number(state.rows.length)} Ratebook(s) loaded.`, "success");
    if (state.activeRatebookId) await selectRatebook(state.activeRatebookId, false);
    else renderEmptyDetail("No Ratebooks found");
  } catch (error) {
    state.rows = [];
    state.facets = { shippers: [], sources: [], segments: [] };
    renderBookFilters();
    renderBookList();
    renderEmptyDetail("Ratebooks could not load");
    setStatus(elements.status, humanizeError(error), "error");
  }
}

async function copyText(value) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setStatus(elements.shareStatus, "Private link copied.", "success");
  } catch {
    setStatus(elements.shareStatus, "Copy the private link manually from the Ratebook share output.", "error");
  }
}

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ratebook-id]");
  if (button) selectRatebook(button.dataset.ratebookId);
});

elements.decisionQueue.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ratebook-health-action]");
  if (button) handleRatebookHealthAction(button);
});

elements.detail.addEventListener("click", (event) => {
  const quoteReviewButton = event.target.closest("[data-review-ratebook-route]");
  if (quoteReviewButton) {
    showRatebookQuoteReview(quoteReviewButton.dataset.reviewRatebookRoute);
    return;
  }
  const routeButton = event.target.closest("[data-open-route-id]");
  if (routeButton) {
    showRouteDetail(routeButton.dataset.openRouteId);
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "share-ratebook") openShareDialog();
  if (action === "publish-ratebook" || action === "archive-ratebook") applyRatebookLifecycle(action);
  if (action === "create-ratebook-revision") createRatebookRevisionFromPublished();
  if (action === "view-ratebook-audit") showRatebookAudit();
  if (action === "open-rfx-process" && state.detail?.project?.id) {
    window.location.assign(`./rfx-process.html?project=${encodeURIComponent(state.detail.project.id)}`);
  }
  if (action === "open-bid-room" && (state.detail?.event?.id || state.detail?.ratebook?.rfx_event_id)) {
    const eventId = state.detail.event?.id || state.detail.ratebook?.rfx_event_id;
    window.location.assign(`./rfx-events.html?rfx_event_id=${encodeURIComponent(eventId)}`);
  }
});

elements.detail.addEventListener("input", (event) => {
  const field = event.target.closest("[data-ratebook-route-search]");
  if (!field) return;
  state.routeSearch = field.value;
  window.clearTimeout(routeSearchTimer);
  routeSearchTimer = window.setTimeout(renderRatebookRouteGrid, 120);
});

elements.detail.addEventListener("change", (event) => {
  const segment = event.target.closest("[data-ratebook-route-segment]");
  const status = event.target.closest("[data-ratebook-route-status]");
  if (segment) state.routeSegmentKey = segment.value;
  if (status) state.routeStatus = status.value;
  if (segment || status) renderRatebookRouteGrid();
});

elements.closeDrawer.addEventListener("click", closeRouteDrawer);
elements.drawerBackdrop.addEventListener("click", closeRouteDrawer);
elements.closeShareDialog.addEventListener("click", closeShareDialog);
elements.closeAuditDialog.addEventListener("click", closeAuditDialog);
elements.closeQuoteReviewDialog.addEventListener("click", closeRatebookQuoteReview);
elements.shareDialog.addEventListener("click", (event) => {
  if (event.target === elements.shareDialog) closeShareDialog();
});
elements.auditDialog.addEventListener("click", (event) => {
  if (event.target === elements.auditDialog) closeAuditDialog();
});
elements.quoteReviewDialog.addEventListener("click", (event) => {
  if (event.target === elements.quoteReviewDialog) closeRatebookQuoteReview();
});
elements.quoteReviewContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-save-ratebook-quote-review]");
  if (button) saveRatebookQuoteReview(button);
});
elements.refresh.addEventListener("click", loadRatebooks);

elements.search.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.search = elements.search.value.trim();
    loadRatebooks();
  }, 250);
});

elements.statusFilter.addEventListener("change", () => {
  state.status = elements.statusFilter.value;
  loadRatebooks();
});

elements.shipperFilter.addEventListener("change", () => {
  state.shipperId = elements.shipperFilter.value;
  loadRatebooks();
});

elements.sourceFilter.addEventListener("change", () => {
  state.sourceType = elements.sourceFilter.value;
  loadRatebooks();
});

elements.segmentFilter.addEventListener("change", () => {
  state.segmentKey = elements.segmentFilter.value;
  loadRatebooks();
});

elements.carrierSearch.addEventListener("input", () => {
  window.clearTimeout(carrierSearchTimer);
  carrierSearchTimer = window.setTimeout(() => {
    state.carrierSearch = elements.carrierSearch.value.trim();
    loadCarriers();
  }, 250);
});

elements.carrierList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-ratebook-carrier-select]");
  if (!checkbox) return;
  if (checkbox.checked) state.selectedCarrierIds.add(checkbox.value);
  else state.selectedCarrierIds.delete(checkbox.value);
  renderCarrierList();
});

elements.selectVisibleCarriers.addEventListener("click", () => {
  state.carriers.forEach((carrier) => state.selectedCarrierIds.add(String(carrier.id)));
  renderCarrierList();
});

elements.shareButton.addEventListener("click", sendRatebookShares);
elements.sendDistribution.addEventListener("click", sendRatebookDistributionDrafts);
elements.magicLinks.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-ratebook-link]");
  if (button) copyText(button.dataset.copyRatebookLink);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRouteDrawer();
    closeAuditDialog();
    closeRatebookQuoteReview();
  }
});

initAuthControls();
requirePrivatePage()
  .then(loadRatebooks)
  .catch((error) => setStatus(elements.status, humanizeError(error), "error"));
