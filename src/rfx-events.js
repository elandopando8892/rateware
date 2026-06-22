import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  archiveRfxLaneVendors,
  autoShortlistRfxLane,
  createRfxEvent,
  fetchRfxDetail,
  fetchRfxEvents,
  importRfxLanes,
  inviteRfxLaneVendors,
  shortlistRfxLaneVendors,
  updateRfxBid,
  updateRfxEvent
} from "./rfx-service.js";
import { fetchVendors } from "./vendor-service.js";

const eventForm = document.querySelector("#rfx-event-form");
const rfxIdInput = document.querySelector("#rfx-id");
const rfxNameInput = document.querySelector("#rfx-name");
const rfxCustomerInput = document.querySelector("#rfx-customer");
const rfxTypeInput = document.querySelector("#rfx-type");
const rfxDueDateInput = document.querySelector("#rfx-due-date");
const eventStatus = document.querySelector("#rfx-event-status");
const eventList = document.querySelector("#rfx-event-list");
const detailTitle = document.querySelector("#rfx-detail-title");
const openRfxButton = document.querySelector("#open-rfx-button");
const closeRfxButton = document.querySelector("#close-rfx-button");
const lanePaste = document.querySelector("#rfx-lane-paste");
const importLanesButton = document.querySelector("#import-rfx-lanes-button");
const clearLanesInputButton = document.querySelector("#clear-rfx-lanes-input");
const laneImportStatus = document.querySelector("#rfx-lane-import-status");
const lanesBody = document.querySelector("#rfx-lanes-body");
const refreshButton = document.querySelector("#refresh-rfx-events");
const selectionCount = document.querySelector("#rfx-selection-count");
const autoShortlistButton = document.querySelector("#auto-shortlist-selected");
const inviteSelectedButton = document.querySelector("#invite-selected-rfx");
const archiveSelectedButton = document.querySelector("#archive-selected-rfx");
const actionStatus = document.querySelector("#rfx-action-status");
const metricEvents = document.querySelector("#rfx-metric-events");
const metricLanes = document.querySelector("#rfx-metric-lanes");
const metricInvites = document.querySelector("#rfx-metric-invites");
const metricBids = document.querySelector("#rfx-metric-bids");
const dashboardTitle = document.querySelector("#rfx-dashboard-title");
const eventDashboard = document.querySelector("#rfx-event-dashboard");
const inviteStatusMix = document.querySelector("#rfx-invite-status");
const dashboardOutreachLink = document.querySelector("#rfx-dashboard-outreach-link");
const laneCoverage = document.querySelector("#rfx-lane-coverage");
const coverageSummary = document.querySelector("#rfx-coverage-summary");
const manualShortlistLane = document.querySelector("#manual-shortlist-lane");
const manualShortlistSearch = document.querySelector("#manual-shortlist-search");
const manualShortlistVendors = document.querySelector("#manual-shortlist-vendors");
const manualShortlistButton = document.querySelector("#manual-shortlist-button");
const manualShortlistStatus = document.querySelector("#manual-shortlist-status");

let events = [];
let selectedEventId = null;
let selectedEvent = null;
let currentLanes = [];
let vendorOptions = [];
let selectedLaneIds = new Set();
let selectedInvitationIds = new Set();

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

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(number);
}

function formatMoney(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)} ${currency || "USD"}`;
}

function cleanHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDelimitedRows(text) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function mapHeader(header) {
  const aliases = {
    from: "origin",
    orig: "origin",
    o_city: "origin_city",
    o_state: "origin_state",
    o_st: "origin_state",
    o_market: "origin_market",
    o_region: "origin_region",
    to: "destination",
    dest: "destination",
    d_city: "destination_city",
    d_state: "destination_state",
    d_st: "destination_state",
    d_market: "destination_market",
    d_region: "destination_region",
    equip: "equipment",
    trailer_type: "trailer",
    loads_per_week: "weekly_volume",
    weekly_loads: "weekly_volume",
    volume: "weekly_volume",
    target: "target_rate",
    budget: "target_rate"
  };
  const key = cleanHeader(header);
  return aliases[key] || key;
}

function parseLanePaste(text) {
  const rows = parseDelimitedRows(text);
  if (!rows.length) return [];
  const firstRow = rows[0].map(mapHeader);
  const hasHeader = firstRow.some((header) => ["origin", "destination", "equipment", "trailer", "operation", "service"].includes(header));
  const headers = hasHeader
    ? firstRow
    : ["origin", "destination", "equipment", "trailer", "operation", "service", "weekly_volume", "target_rate", "currency"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row, index) => {
    const item = { lane_number: index + 1 };
    headers.forEach((header, cellIndex) => {
      if (!header) return;
      item[header] = row[cellIndex] || "";
    });
    return item;
  }).filter((row) => row.origin || row.destination);
}

function portalUrl(token) {
  return `${window.location.origin}/rfx-bid.html?token=${encodeURIComponent(token)}`;
}

function vendorLabel(invitation) {
  const vendor = invitation.vendors || {};
  return vendor.vendor_name || vendor.domain || vendor.primary_email || "Vendor";
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["bid_submitted", "awarded", "sent", "open"].includes(value)) return "success";
  if (["invited", "viewed", "queued"].includes(value)) return "neutral";
  if (["declined", "archived", "closed"].includes(value)) return "danger";
  return "muted";
}

function statusChip(status) {
  const value = status || "shortlisted";
  return `<span class="status-pill" data-tone="${statusTone(value)}">${escapeHtml(value)}</span>`;
}

function laneRoute(lane) {
  return `${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function invitationStatusCounts(lanes = currentLanes) {
  const counts = {};
  lanes.forEach((lane) => {
    (lane.invitations || []).forEach((invitation) => {
      const status = invitation.invitation_status || "shortlisted";
      counts[status] = (counts[status] || 0) + 1;
    });
  });
  return counts;
}

function coverageRatio(lane) {
  const invitations = lane.invitations || [];
  const activeInvitations = invitations.filter((item) => item.invitation_status !== "archived");
  return Math.min(100, Math.round((activeInvitations.length / 3) * 100));
}

function responseRatio(lane) {
  const invitations = (lane.invitations || []).filter((item) => item.invitation_status !== "archived");
  if (!invitations.length) return 0;
  const bids = invitations.filter((item) => item.bid_rate !== null || item.invitation_status === "bid_submitted").length;
  return Math.round((bids / invitations.length) * 100);
}

function renderEventDashboard() {
  if (!selectedEvent) {
    dashboardTitle.textContent = "No event selected";
    if (dashboardOutreachLink) dashboardOutreachLink.href = "./outreach.html";
    if (eventDashboard) {
      eventDashboard.innerHTML = `
        <article>
          <span>Status</span>
          <strong>-</strong>
          <small>Select an RFx event to see lane coverage, invitation status, and bid progress.</small>
        </article>
      `;
    }
    if (inviteStatusMix) inviteStatusMix.innerHTML = "";
    return;
  }

  const invitations = currentLanes.flatMap((lane) => lane.invitations || []);
  const activeInvitations = invitations.filter((item) => item.invitation_status !== "archived");
  const bids = activeInvitations.filter((item) => item.bid_rate !== null || item.invitation_status === "bid_submitted");
  const lanesWithShortlist = currentLanes.filter((lane) => (lane.invitations || []).some((item) => item.invitation_status !== "archived")).length;
  const lanesWithBids = currentLanes.filter((lane) => (lane.invitations || []).some((item) => item.bid_rate !== null || item.invitation_status === "bid_submitted")).length;
  const shortlistCoverage = currentLanes.length ? Math.round((lanesWithShortlist / currentLanes.length) * 100) : 0;
  const bidCoverage = currentLanes.length ? Math.round((lanesWithBids / currentLanes.length) * 100) : 0;
  const responseRate = activeInvitations.length ? Math.round((bids.length / activeInvitations.length) * 100) : 0;

  dashboardTitle.textContent = `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || "Selected event"}`;
  if (dashboardOutreachLink) dashboardOutreachLink.href = `./outreach.html?rfx_event_id=${encodeURIComponent(selectedEvent.id)}`;
  if (eventDashboard) {
    eventDashboard.innerHTML = `
      <article>
        <span>Status</span>
        <strong>${escapeHtml(selectedEvent.status || "draft")}</strong>
        <small>${escapeHtml([selectedEvent.customer, selectedEvent.due_date ? `Due ${selectedEvent.due_date}` : ""].filter(Boolean).join(" | ") || "No customer or due date")}</small>
      </article>
      <article>
        <span>Lane coverage</span>
        <strong>${formatNumber(shortlistCoverage)}%</strong>
        <small>${formatNumber(lanesWithShortlist)} of ${formatNumber(currentLanes.length)} lanes have vendors shortlisted.</small>
      </article>
      <article>
        <span>Bid coverage</span>
        <strong>${formatNumber(bidCoverage)}%</strong>
        <small>${formatNumber(lanesWithBids)} lane(s) have at least one bid.</small>
      </article>
      <article>
        <span>Response rate</span>
        <strong>${formatNumber(responseRate)}%</strong>
        <small>${formatNumber(bids.length)} bid(s) from ${formatNumber(activeInvitations.length)} active invitation(s).</small>
      </article>
    `;
  }

  const counts = invitationStatusCounts();
  if (inviteStatusMix) {
    inviteStatusMix.innerHTML = Object.keys(counts).length
      ? Object.entries(counts).map(([status, count]) => `
        <span data-tone="${statusTone(status)}">${escapeHtml(status)} <strong>${formatNumber(count)}</strong></span>
      `).join("")
      : "<span>No vendors shortlisted yet.</span>";
  }
}

function renderLaneCoverage() {
  if (!laneCoverage || !coverageSummary) return;
  if (!selectedEventId) {
    coverageSummary.textContent = "No event";
    laneCoverage.innerHTML = "<article>Select an event to inspect lane coverage.</article>";
    return;
  }
  if (!currentLanes.length) {
    coverageSummary.textContent = "No lanes";
    laneCoverage.innerHTML = "<article>Paste lanes to build coverage.</article>";
    return;
  }

  const covered = currentLanes.filter((lane) => (lane.invitations || []).some((item) => item.invitation_status !== "archived")).length;
  coverageSummary.textContent = `${formatNumber(covered)} / ${formatNumber(currentLanes.length)} lanes covered`;
  laneCoverage.innerHTML = currentLanes.map((lane) => {
    const invitations = (lane.invitations || []).filter((item) => item.invitation_status !== "archived");
    const bids = invitations.filter((item) => item.bid_rate !== null || item.invitation_status === "bid_submitted");
    const coverage = coverageRatio(lane);
    const responses = responseRatio(lane);
    const tone = bids.length ? "success" : invitations.length ? "neutral" : "danger";
    return `
      <article class="rfx-coverage-card" data-tone="${tone}">
        <button type="button" data-rfx-focus-lane="${escapeHtml(lane.id)}">
          <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
          <span>${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</span>
        </button>
        <div class="coverage-meter" aria-label="Shortlist coverage">
          <span style="width: ${coverage}%"></span>
        </div>
        <small>${formatNumber(invitations.length)} vendors | ${formatNumber(bids.length)} bids | ${formatNumber(responses)}% response</small>
      </article>
    `;
  }).join("");
}

function updateMetrics() {
  const laneCount = events.reduce((sum, event) => sum + Number(event.lane_count || 0), 0);
  const inviteCount = events.reduce((sum, event) => sum + Number(event.invitation_count || 0), 0);
  const bidCount = events.reduce((sum, event) => sum + Number(event.bid_count || 0), 0);
  metricEvents.textContent = formatNumber(events.length);
  metricLanes.textContent = formatNumber(laneCount);
  metricInvites.textContent = formatNumber(inviteCount);
  metricBids.textContent = formatNumber(bidCount);
}

function renderEvents() {
  updateMetrics();
  if (!events.length) {
    eventList.innerHTML = "<article>No RFx events yet.</article>";
    return;
  }
  eventList.innerHTML = events.map((event) => `
    <button class="rfx-event-card ${event.id === selectedEventId ? "is-active" : ""}" type="button" data-rfx-event-id="${escapeHtml(event.id)}">
      <span>${escapeHtml(event.status || "draft")}</span>
      <strong>${escapeHtml(event.name || event.rfx_id)}</strong>
      <small>${escapeHtml(event.rfx_id || "")}${event.customer ? ` | ${escapeHtml(event.customer)}` : ""}</small>
      <b>${formatNumber(event.lane_count)} lanes / ${formatNumber(event.bid_count)} bids</b>
    </button>
  `).join("");
}

function updateSelectionControls() {
  const laneCount = selectedLaneIds.size;
  const inviteCount = selectedInvitationIds.size;
  selectionCount.textContent = `${laneCount} lanes / ${inviteCount} vendors selected`;
  autoShortlistButton.disabled = !laneCount;
  inviteSelectedButton.disabled = !inviteCount;
  archiveSelectedButton.disabled = !inviteCount;
}

function vendorSearchText(row) {
  return [row.vendor_name, row.domain, row.primary_email, row.coverage_notes, row.notes, ...(Array.isArray(row.tags) ? row.tags : [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderManualShortlistControls() {
  if (!manualShortlistLane || !manualShortlistVendors) return;
  manualShortlistLane.innerHTML = currentLanes.map((lane) => `
    <option value="${escapeHtml(lane.id)}">#${escapeHtml(lane.lane_number || "")} ${escapeHtml(lane.origin || "-")} -> ${escapeHtml(lane.destination || "-")}</option>
  `).join("");
  const term = String(manualShortlistSearch?.value || "").trim().toLowerCase();
  const rows = vendorOptions
    .filter((vendor) => !term || vendorSearchText(vendor).includes(term))
    .slice(0, 200);
  manualShortlistVendors.innerHTML = rows.map((vendor) => `
    <option value="${escapeHtml(vendor.id)}">${escapeHtml(vendor.vendor_name || vendor.domain || "Vendor")} | ${escapeHtml(vendor.base_stage || "")} | ${escapeHtml(vendor.primary_email || vendor.domain || "")}</option>
  `).join("");
  manualShortlistButton.disabled = !currentLanes.length || !rows.length;
}

function renderInvitation(invitation, lane) {
  const bidDelta = Number(invitation.bid_delta);
  const hasDelta = Number.isFinite(bidDelta);
  const deltaTone = hasDelta && bidDelta <= 0 ? "success" : hasDelta ? "danger" : "neutral";
  return `
    <article class="rfx-invitation" data-rfx-invite-id="${escapeHtml(invitation.id)}">
      <label class="table-checkbox">
        <input type="checkbox" data-rfx-invitation-select="${escapeHtml(invitation.id)}" ${selectedInvitationIds.has(invitation.id) ? "checked" : ""} />
      </label>
      <div>
        <strong>${escapeHtml(vendorLabel(invitation))}</strong>
        ${statusChip(invitation.invitation_status || "shortlisted")}
        <small>${escapeHtml([invitation.vendors?.primary_email, invitation.vendors?.whatsapp_phone].filter(Boolean).join(" | ") || "No contact channel")}</small>
      </div>
      <input data-rfx-bid-field="bid_rate" value="${escapeHtml(invitation.bid_rate ?? "")}" placeholder="Rate" inputmode="decimal" />
      <input data-rfx-bid-field="weekly_capacity" value="${escapeHtml(invitation.weekly_capacity ?? "")}" placeholder="Cap" inputmode="decimal" />
      <input data-rfx-bid-field="transit_days" value="${escapeHtml(invitation.transit_days ?? "")}" placeholder="Days" inputmode="decimal" />
      <input data-rfx-bid-field="currency" value="${escapeHtml(invitation.currency || lane.currency || "USD")}" class="short-input" />
      <button class="small-button" type="button" data-rfx-save-bid="${escapeHtml(invitation.id)}">Save bid</button>
      <button class="secondary small-button" type="button" data-rfx-copy-link="${escapeHtml(invitation.invitation_token)}">Copy link</button>
      <span class="rfx-bid-delta" data-tone="${deltaTone}">${hasDelta ? `${bidDelta >= 0 ? "+" : ""}${formatMoney(bidDelta, invitation.currency)}` : "-"}</span>
    </article>
  `;
}

function renderLanes() {
  selectedLaneIds = new Set([...selectedLaneIds].filter((id) => currentLanes.some((lane) => lane.id === id)));
  selectedInvitationIds = new Set([...selectedInvitationIds].filter((id) => currentLanes.some((lane) => (lane.invitations || []).some((invite) => invite.id === id))));
  updateSelectionControls();
  renderManualShortlistControls();
  renderEventDashboard();
  renderLaneCoverage();

  if (!selectedEventId) {
    lanesBody.innerHTML = `<tr><td colspan="9">Select an event to load lanes.</td></tr>`;
    return;
  }
  if (!currentLanes.length) {
    lanesBody.innerHTML = `<tr><td colspan="9">Paste lanes above to build this RFx book.</td></tr>`;
    return;
  }
  lanesBody.innerHTML = currentLanes.map((lane) => {
    const benchmark = lane.benchmark;
    const invitations = lane.invitations || [];
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}">
        <td>
          <label class="table-checkbox">
            <input type="checkbox" data-rfx-lane-select="${escapeHtml(lane.id)}" ${selectedLaneIds.has(lane.id) ? "checked" : ""} />
          </label>
        </td>
        <td>
          <strong>#${escapeHtml(lane.lane_number || "")}</strong>
          <span>${escapeHtml(lane.service || "")}</span>
        </td>
        <td>${escapeHtml(lane.origin || "-")}<small>${escapeHtml([lane.origin_market, lane.origin_region].filter(Boolean).join(" | "))}</small></td>
        <td>${escapeHtml(lane.destination || "-")}<small>${escapeHtml([lane.destination_market, lane.destination_region].filter(Boolean).join(" | "))}</small></td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config, lane.operation].filter(Boolean).join(" / ") || "-")}</td>
        <td>${formatNumber(lane.weekly_volume)} / wk<small>Target ${formatMoney(lane.target_rate, lane.currency)}</small></td>
        <td>${benchmark ? `${formatMoney(benchmark.all_in_rate, benchmark.currency)}<small>${escapeHtml(benchmark.vendor || "Rateware")} | ${benchmark.score}%</small>` : "-"}</td>
        <td>
          <div class="rfx-invitation-list">
            ${invitations.length ? invitations.map((invitation) => renderInvitation(invitation, lane)).join("") : "<span>No vendors shortlisted.</span>"}
          </div>
        </td>
        <td>
          <button class="small-button" type="button" data-rfx-auto-shortlist="${escapeHtml(lane.id)}">Auto shortlist</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadEvents() {
  try {
    events = await fetchRfxEvents();
    if (!selectedEventId && events[0]) selectedEventId = events[0].id;
    renderEvents();
    if (selectedEventId) await loadDetail(selectedEventId);
    else {
      selectedEvent = null;
      currentLanes = [];
      renderEventDashboard();
      renderLaneCoverage();
    }
  } catch (error) {
    eventList.innerHTML = `<article>${escapeHtml(error.message)}</article>`;
  }
}

async function loadVendorOptions() {
  try {
    const result = await fetchVendors({ limit: 250, view: "all" });
    vendorOptions = result.rows || [];
    renderManualShortlistControls();
  } catch (error) {
    setStatus(manualShortlistStatus, error.message, "error");
  }
}

async function loadDetail(eventId) {
  selectedEventId = eventId;
  setStatus(actionStatus, "Loading RFx detail...");
  try {
    const detail = await fetchRfxDetail(eventId);
    selectedEvent = detail.event;
    currentLanes = detail.lanes || [];
    detailTitle.textContent = `${selectedEvent.name || selectedEvent.rfx_id} (${selectedEvent.status})`;
    importLanesButton.disabled = false;
    openRfxButton.disabled = false;
    closeRfxButton.disabled = false;
    renderEvents();
    renderLanes();
    renderEventDashboard();
    renderLaneCoverage();
    setStatus(actionStatus, "RFx loaded.", "success");
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
}

async function autoShortlistLane(laneId) {
  setStatus(actionStatus, "Building shortlist...");
  const result = await autoShortlistRfxLane(laneId, 10);
  setStatus(actionStatus, `${result.inserted || 0} vendor(s) shortlisted.`, "success");
}

initAuthControls();
requirePrivatePage().then((session) => {
  if (session?.token) {
    loadVendorOptions();
    loadEvents();
  }
});

eventForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(eventStatus, "Creating RFx event...");
  try {
    const row = await createRfxEvent({
      rfx_id: rfxIdInput.value,
      name: rfxNameInput.value,
      customer: rfxCustomerInput.value,
      event_type: rfxTypeInput.value,
      due_date: rfxDueDateInput.value
    });
    selectedEventId = row.id;
    eventForm.reset();
    setStatus(eventStatus, "RFx event created.", "success");
    await loadEvents();
  } catch (error) {
    setStatus(eventStatus, error.message, "error");
  }
});

refreshButton?.addEventListener("click", loadEvents);

eventList?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-rfx-event-id]");
  if (!card) return;
  await loadDetail(card.dataset.rfxEventId);
});

laneCoverage?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-focus-lane]");
  if (!button) return;
  const row = [...(lanesBody?.querySelectorAll("[data-rfx-lane-id]") || [])]
    .find((item) => item.dataset.rfxLaneId === button.dataset.rfxFocusLane);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("is-focused-row");
  window.setTimeout(() => row.classList.remove("is-focused-row"), 1400);
});

importLanesButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  const rows = parseLanePaste(lanePaste.value);
  if (!rows.length) {
    setStatus(laneImportStatus, "Paste at least one lane.", "error");
    return;
  }
  importLanesButton.disabled = true;
  setStatus(laneImportStatus, "Importing lanes...");
  try {
    const result = await importRfxLanes(selectedEventId, rows);
    setStatus(laneImportStatus, `${result.inserted || 0} lane(s) imported.`, "success");
    lanePaste.value = "";
    await loadDetail(selectedEventId);
    await loadEvents();
  } catch (error) {
    setStatus(laneImportStatus, error.message, "error");
  } finally {
    importLanesButton.disabled = false;
  }
});

clearLanesInputButton?.addEventListener("click", () => {
  lanePaste.value = "";
});

openRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  await updateRfxEvent(selectedEventId, { status: "open" });
  await loadEvents();
});

closeRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  await updateRfxEvent(selectedEventId, { status: "closed" });
  await loadEvents();
});

lanesBody?.addEventListener("change", (event) => {
  const laneInput = event.target.closest("[data-rfx-lane-select]");
  if (laneInput) {
    if (laneInput.checked) selectedLaneIds.add(laneInput.dataset.rfxLaneSelect);
    else selectedLaneIds.delete(laneInput.dataset.rfxLaneSelect);
  }
  const inviteInput = event.target.closest("[data-rfx-invitation-select]");
  if (inviteInput) {
    if (inviteInput.checked) selectedInvitationIds.add(inviteInput.dataset.rfxInvitationSelect);
    else selectedInvitationIds.delete(inviteInput.dataset.rfxInvitationSelect);
  }
  updateSelectionControls();
});

lanesBody?.addEventListener("click", async (event) => {
  const shortlistButton = event.target.closest("[data-rfx-auto-shortlist]");
  if (shortlistButton) {
    shortlistButton.disabled = true;
    try {
      await autoShortlistLane(shortlistButton.dataset.rfxAutoShortlist);
      await loadDetail(selectedEventId);
    } catch (error) {
      setStatus(actionStatus, error.message, "error");
    } finally {
      shortlistButton.disabled = false;
    }
    return;
  }

  const saveButton = event.target.closest("[data-rfx-save-bid]");
  if (saveButton) {
    const invitation = saveButton.closest("[data-rfx-invite-id]");
    const patch = {};
    invitation.querySelectorAll("[data-rfx-bid-field]").forEach((input) => {
      patch[input.dataset.rfxBidField] = input.value;
    });
    saveButton.disabled = true;
    try {
      await updateRfxBid(saveButton.dataset.rfxSaveBid, patch);
      setStatus(actionStatus, "Bid saved.", "success");
      await loadDetail(selectedEventId);
    } catch (error) {
      setStatus(actionStatus, error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
    return;
  }

  const copyButton = event.target.closest("[data-rfx-copy-link]");
  if (copyButton) {
    const url = portalUrl(copyButton.dataset.rfxCopyLink);
    try {
      await navigator.clipboard.writeText(url);
      setStatus(actionStatus, "Bid link copied.", "success");
    } catch {
      setStatus(actionStatus, url, "neutral");
    }
  }
});

autoShortlistButton?.addEventListener("click", async () => {
  const ids = [...selectedLaneIds];
  if (!ids.length) return;
  autoShortlistButton.disabled = true;
  setStatus(actionStatus, "Building shortlists...");
  try {
    let inserted = 0;
    for (const id of ids) {
      const result = await autoShortlistRfxLane(id, 10);
      inserted += Number(result.inserted || 0);
    }
    setStatus(actionStatus, `${inserted} vendor shortlist row(s) created.`, "success");
    selectedLaneIds.clear();
    await loadDetail(selectedEventId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    updateSelectionControls();
  }
});

inviteSelectedButton?.addEventListener("click", async () => {
  const ids = [...selectedInvitationIds];
  if (!ids.length) return;
  setStatus(actionStatus, "Marking invitations as sent...");
  try {
    const result = await inviteRfxLaneVendors(ids);
    setStatus(actionStatus, `${result.updated || 0} invitation(s) marked invited.`, "success");
    selectedInvitationIds.clear();
    await loadDetail(selectedEventId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
});

archiveSelectedButton?.addEventListener("click", async () => {
  const ids = [...selectedInvitationIds];
  if (!ids.length) return;
  setStatus(actionStatus, "Archiving invitation rows...");
  try {
    const result = await archiveRfxLaneVendors(ids);
    setStatus(actionStatus, `${result.updated || 0} invitation row(s) archived.`, "success");
    selectedInvitationIds.clear();
    await loadDetail(selectedEventId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
});

manualShortlistSearch?.addEventListener("input", renderManualShortlistControls);

manualShortlistButton?.addEventListener("click", async () => {
  const laneId = manualShortlistLane?.value;
  const vendorIds = [...manualShortlistVendors.selectedOptions].map((option) => option.value).filter(Boolean);
  if (!laneId || !vendorIds.length) {
    setStatus(manualShortlistStatus, "Select one lane and at least one vendor.", "error");
    return;
  }
  manualShortlistButton.disabled = true;
  setStatus(manualShortlistStatus, "Adding vendors...");
  try {
    const result = await shortlistRfxLaneVendors(laneId, vendorIds);
    setStatus(manualShortlistStatus, `${result.inserted || 0} vendor(s) added to shortlist.`, "success");
    await loadDetail(selectedEventId);
  } catch (error) {
    setStatus(manualShortlistStatus, error.message, "error");
  } finally {
    renderManualShortlistControls();
  }
});
