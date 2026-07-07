import { SUPABASE_URL } from "./config.js";

const boardRoot = document.querySelector("#public-board-root");
const summaryRoot = document.querySelector("#public-board-summary");
const alertsRoot = document.querySelector("#public-board-alerts");
const statusEl = document.querySelector("#public-board-status");
const soundButton = document.querySelector("#public-board-sound");
const languageSelect = document.querySelector("#public-board-language");
const refreshButton = document.querySelector("#public-board-refresh");
const fullscreenButton = document.querySelector("#public-board-fullscreen");
const boardActions = document.querySelector(".public-board-actions");
const statusFilter = document.querySelector("#public-board-status-filter");
const searchInput = document.querySelector("#public-board-search");
const autoRefreshInput = document.querySelector("#public-board-auto-refresh");
const viewButtons = [...document.querySelectorAll("[data-board-view]")];
const findInvitesButton = document.querySelector("#public-board-find-invites");
const detailDrawer = document.querySelector("#public-board-detail-drawer");
const detailContent = document.querySelector("#public-board-detail-content");
const detailClose = document.querySelector("#public-board-detail-close");
const softLoginDrawer = document.querySelector("#public-board-soft-login-drawer");
const softLoginClose = document.querySelector("#public-board-soft-login-close");

const API_URL = `${SUPABASE_URL}/functions/v1/rfx-bid-api`;
const boardParams = new URLSearchParams(window.location.search);
const scopedEventId = boardParams.get("event_id") || boardParams.get("rfx_event_id") || "";
const ANNOUNCEMENTS = {
  en: {
    enabled: "Rateware bid room alerts enabled.",
    opportunity: "New opportunity available.",
    quote: "Quote Available.",
    closing: "Deadline closing soon.",
    displaced: "Place new bid. Your offer has been displaced.",
    inviteSent: "Invitation request sent.",
    linksSent: "Private Bid Room links sent."
  },
  es: {
    enabled: "Alertas del Bid Room activadas.",
    quote: "Cotización disponible.",
    displaced: "Necesitas pujar de nuevo. Has sido superado."
  }
};

ANNOUNCEMENTS.es.opportunity = "Nueva oportunidad disponible.";
ANNOUNCEMENTS.es.closing = "La oportunidad esta por cerrar.";
ANNOUNCEMENTS.es.inviteSent = "Solicitud de invitacion enviada.";
ANNOUNCEMENTS.es.linksSent = "Links privados enviados.";

const state = {
  rows: [],
  summary: {},
  previousRows: new Map(),
  loaded: false,
  viewMode: localStorage.getItem("rateware.publicBidBoard.view") || "cards",
  language: localStorage.getItem("rateware.publicBidBoard.language") || "en",
  soundEnabled: false,
  audioContext: null,
  alerts: [],
  selectedRowId: null
};

languageSelect.value = state.language;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString() : "-";
}

function formatMoney(value, currency = "USD") {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return `${numberValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency || "USD"}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value) {
  const labels = {
    live: "Live",
    closing: "Closing",
    expired: "Expired",
    awarded: "Awarded"
  };
  return labels[value] || value || "Unknown";
}

function rowSearchText(row) {
  return [
    row.event?.rfx_id,
    row.event?.name,
    row.event?.customer,
    row.route_label,
    row.lane?.origin,
    row.lane?.destination,
    row.lane?.origin_market,
    row.lane?.destination_market,
    row.lane?.equipment,
    row.lane?.trailer,
    row.lane?.operation,
    row.lane?.service,
    ...(row.fit_tags || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function visibleRows() {
  const query = (searchInput.value || "").trim().toLowerCase();
  if (!query) return state.rows;
  return state.rows.filter((row) => rowSearchText(row).includes(query));
}

async function callPublicBoard(payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "public_bid_room_board", ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(data.error || data.message || text || `Bid Room board failed (${response.status})`);
  return data;
}

async function callInviteRequest(payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "public_bid_room_request_invite", ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(data.error || data.message || text || `Invitation request failed (${response.status})`);
  return data;
}

async function callFindInvitations(payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "public_bid_room_find_invitations", ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(data.error || data.message || text || `Invitation lookup failed (${response.status})`);
  return data;
}

function rowSnapshot(row) {
  return {
    quote_count: Number(row.quote_count || 0),
    best_rate: Number(row.best_rate || 0),
    board_status: row.board_status,
    last_quote_at: row.last_quote_at || null
  };
}

function rememberRows(rows) {
  state.previousRows = new Map(rows.map((row) => [String(row.id), rowSnapshot(row)]));
}

function queueAlert(type, row) {
  const language = ANNOUNCEMENTS[state.language] ? state.language : "en";
  const label = ANNOUNCEMENTS[language][type] || ANNOUNCEMENTS.en[type];
  const route = row.route_label || [row.lane?.origin, row.lane?.destination].filter(Boolean).join(" -> ") || "Selected lane";
  const alert = {
    id: `${Date.now()}-${Math.random()}`,
    type,
    label,
    route,
    event: row.event?.rfx_id || row.event?.name || "Bid Room",
    created_at: new Date().toISOString()
  };
  state.alerts = [alert, ...state.alerts].slice(0, 8);
  renderAlerts();
  announce(type);
}

function detectBoardSignals(rows) {
  if (!state.loaded) return;
  let alertCount = 0;
  for (const row of rows) {
    if (alertCount >= 3) break;
    const previous = state.previousRows.get(String(row.id));
    if (!previous) {
      if (["live", "closing"].includes(row.board_status)) {
        queueAlert("opportunity", row);
        alertCount += 1;
      }
      continue;
    }
    const quoteCount = Number(row.quote_count || 0);
    const bestRate = Number(row.best_rate || 0);
    if (quoteCount > Number(previous.quote_count || 0)) {
      queueAlert("quote", row);
      alertCount += 1;
    } else if (row.board_status === "closing" && previous.board_status !== "closing") {
      queueAlert("closing", row);
      alertCount += 1;
    } else if (bestRate > 0 && Number(previous.best_rate || 0) > 0 && bestRate < Number(previous.best_rate)) {
      queueAlert("displaced", row);
      alertCount += 1;
    }
  }
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.audioContext) state.audioContext = new AudioContextClass();
  return state.audioContext;
}

function playTone(type) {
  const context = ensureAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  const startFrequency = type === "displaced" ? 392 : type === "closing" ? 494 : type === "inviteSent" ? 587 : 659;
  const endFrequency = type === "displaced" ? 523 : type === "closing" ? 659 : type === "inviteSent" ? 784 : 880;
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.45);
}

function announce(type) {
  if (!state.soundEnabled) return;
  const language = ANNOUNCEMENTS[state.language] ? state.language : "en";
  const phrase = ANNOUNCEMENTS[language][type] || ANNOUNCEMENTS.en[type] || "";
  playTone(type);
  if (!("speechSynthesis" in window) || !phrase) return;
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = language === "es" ? "es-MX" : "en-US";
  utterance.rate = 0.94;
  utterance.pitch = type === "displaced" ? 0.9 : 1.05;
  window.speechSynthesis.speak(utterance);
}

function renderAlerts() {
  if (!state.alerts.length) {
    alertsRoot.innerHTML = "<p>No movement yet. Enable sound to hear opportunity, quote, deadline, and ranking alerts.</p>";
    return;
  }
  alertsRoot.innerHTML = state.alerts.map((alert) => `
    <article class="public-board-alert is-${escapeHtml(alert.type)}">
      <strong>${escapeHtml(alert.label)}</strong>
      <span>${escapeHtml(alert.event)} | ${escapeHtml(alert.route)}</span>
      <small>${escapeHtml(formatDateTime(alert.created_at))}</small>
    </article>
  `).join("");
}

function initScopedBoardMode() {
  if (!scopedEventId || !boardActions) return;
  document.body.classList.add("is-event-scoped-board");
  const link = document.createElement("a");
  link.className = "secondary-link public-board-all-link";
  link.href = "./bid-room-board.html";
  link.textContent = "View all opportunities";
  boardActions.append(link);
}

function renderSummary() {
  const summary = state.summary || {};
  summaryRoot.innerHTML = `
    <article><span>Live</span><strong>${formatNumber(summary.live)}</strong><small>Open lanes</small></article>
    <article><span>Closing</span><strong>${formatNumber(summary.closing)}</strong><small>Deadline risk</small></article>
    <article><span>Expired</span><strong>${formatNumber(summary.expired)}</strong><small>Closed rooms</small></article>
    <article><span>Quotes</span><strong>${formatNumber(summary.total_quotes)}</strong><small>${formatNumber(summary.lanes_with_quotes)} quoted lanes</small></article>
  `;
}

function scopedEventLabel(rows = state.rows) {
  if (!scopedEventId) return "";
  const event = rows.find((row) => row.event?.id === scopedEventId)?.event || {};
  return event.rfx_id || event.name
    ? `Event marketplace: ${event.rfx_id || event.name}`
    : "Event marketplace: selected bid event";
}

function laneTags(row) {
  return [
    row.lane?.equipment,
    row.lane?.trailer,
    row.lane?.operation,
    row.lane?.service
  ].filter(Boolean).slice(0, 4);
}

function rowById(id) {
  return state.rows.find((row) => String(row.id) === String(id)) || null;
}

function requestProfile() {
  try {
    return JSON.parse(localStorage.getItem("rateware.publicBidBoard.requestProfile") || "{}");
  } catch {
    return {};
  }
}

function saveRequestProfile(profile) {
  localStorage.setItem("rateware.publicBidBoard.requestProfile", JSON.stringify(profile || {}));
}

function invitationRuleCopy(row) {
  if (row.board_status === "awarded") {
    return "This lane is awarded. You can still request access so procurement can consider you for future coverage.";
  }
  if (row.board_status === "expired") {
    return "This room is closed. Request access if you want procurement to review your carrier profile or reopen access.";
  }
  return "Public cards do not accept direct bids. Request an invitation and procurement will decide whether to add your carrier to the private Bid Room.";
}

function renderDetailDrawer(row, focusRequest = false) {
  if (!detailDrawer || !detailContent || !row) return;
  const profile = requestProfile();
  const tags = laneTags(row);
  state.selectedRowId = row.id;
  detailContent.innerHTML = `
    <div class="public-board-drawer-header">
      <span class="status-pill ${row.board_status === "live" ? "success" : row.board_status === "closing" ? "warning" : "neutral"}">${escapeHtml(statusLabel(row.board_status))}</span>
      <small>${escapeHtml(row.event?.rfx_id || row.event?.name || "Bid Room")}</small>
      <h2>${escapeHtml(row.route_label || "Lane pending")}</h2>
      <p>${escapeHtml(row.event?.customer || "Public marketplace")} | ${escapeHtml(row.event?.event_type || "rfx")}</p>
    </div>
    <div class="public-board-drawer-metrics">
      <span><b>${formatNumber(row.quote_count)}</b><small>quotes</small></span>
      <span><b>${formatMoney(row.best_rate, row.currency)}</b><small>best visible</small></span>
      <span><b>${formatNumber(row.total_weekly_capacity)}</b><small>weekly cap</small></span>
      <span><b>${escapeHtml(row.due_state?.due_date || "No deadline")}</b><small>deadline</small></span>
    </div>
    <section class="public-board-detail-section">
      <h3>Opportunity detail</h3>
      <dl>
        <div><dt>Origin</dt><dd>${escapeHtml(row.lane?.origin || "-")}</dd></div>
        <div><dt>Destination</dt><dd>${escapeHtml(row.lane?.destination || "-")}</dd></div>
        <div><dt>Equipment</dt><dd>${escapeHtml([row.lane?.equipment, row.lane?.trailer, row.lane?.config].filter(Boolean).join(" / ") || "-")}</dd></div>
        <div><dt>Service</dt><dd>${escapeHtml([row.lane?.operation, row.lane?.service].filter(Boolean).join(" / ") || "-")}</dd></div>
      </dl>
      <div class="public-opportunity-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>No tags</span>"}</div>
    </section>
    <section class="public-board-invite-rule">
      <strong>Invitation required to bid</strong>
      <p>${escapeHtml(invitationRuleCopy(row))}</p>
      <button type="button" class="secondary" data-public-board-soft-login="${escapeHtml(row.id)}">Already invited? Find my private link</button>
    </section>
    <form id="public-invite-request-form" class="public-board-request-form" data-event-id="${escapeHtml(row.event?.id || row.event_id || "")}" data-lane-id="${escapeHtml(row.id)}">
      <h3>Request invitation</h3>
      <div class="public-board-form-grid">
        <label>Carrier company<input name="company" required value="${escapeHtml(profile.company || "")}" placeholder="Carrier legal or commercial name" /></label>
        <label>Contact name<input name="contact_name" value="${escapeHtml(profile.contact_name || "")}" placeholder="Your name" /></label>
        <label>Email<input name="email" type="email" required value="${escapeHtml(profile.email || "")}" placeholder="name@carrier.com" /></label>
        <label>Phone / WhatsApp<input name="phone" value="${escapeHtml(profile.phone || "")}" placeholder="+52..." /></label>
      </div>
      <label>Notes<textarea name="notes" rows="3" placeholder="Capacity, equipment fit, target corridor, or why your carrier should be invited."></textarea></label>
      <div class="public-board-request-actions">
        <button type="submit" class="page-primary-action">Send invitation request</button>
        <span id="public-invite-request-status" class="row-save-status" role="status"></span>
      </div>
    </form>
  `;
  detailDrawer.hidden = false;
  document.body.classList.add("has-public-board-drawer");
  if (focusRequest) detailContent.querySelector("[name='company']")?.focus();
}

function closeDetailDrawer() {
  if (!detailDrawer) return;
  detailDrawer.hidden = true;
  document.body.classList.remove("has-public-board-drawer");
  state.selectedRowId = null;
}

function openSoftLoginDrawer(row = null) {
  if (!softLoginDrawer) return;
  const profile = requestProfile();
  const emailInput = softLoginDrawer.querySelector("[name='email']");
  const status = softLoginDrawer.querySelector("#public-soft-login-status");
  softLoginDrawer.dataset.eventId = row?.event?.id || row?.event_id || "";
  softLoginDrawer.dataset.laneId = row?.id || "";
  if (emailInput && profile.email) emailInput.value = profile.email;
  if (status) status.textContent = "";
  softLoginDrawer.hidden = false;
  document.body.classList.add("has-public-board-drawer");
  emailInput?.focus();
}

function closeSoftLoginDrawer() {
  if (!softLoginDrawer) return;
  softLoginDrawer.hidden = true;
  document.body.classList.remove("has-public-board-drawer");
  softLoginDrawer.dataset.eventId = "";
  softLoginDrawer.dataset.laneId = "";
}

function renderOpportunityCard(row) {
  const tags = laneTags(row);
  return `
    <article class="public-opportunity-card is-${escapeHtml(row.board_status)}" data-public-board-card="${escapeHtml(row.id)}">
      <div class="public-opportunity-head">
        <span class="status-pill ${row.board_status === "live" ? "success" : row.board_status === "closing" ? "warning" : "neutral"}">${escapeHtml(statusLabel(row.board_status))}</span>
        <small>${escapeHtml(row.event?.rfx_id || row.event?.name || "Bid Room")}</small>
      </div>
      <h3>${escapeHtml(row.route_label || "Lane pending")}</h3>
      <p>${escapeHtml(row.event?.customer || "Public marketplace")} | ${escapeHtml(row.event?.event_type || "rfx")}</p>
      <div class="public-opportunity-metrics">
        <span><b>${formatNumber(row.quote_count)}</b><small>quotes</small></span>
        <span><b>${formatMoney(row.best_rate, row.currency)}</b><small>best</small></span>
        <span><b>${formatNumber(row.total_weekly_capacity)}</b><small>weekly cap</small></span>
      </div>
      <div class="public-opportunity-tags">
        ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>No tags</span>"}
      </div>
      <div class="public-opportunity-actions">
        <button type="button" class="secondary" data-public-board-details="${escapeHtml(row.id)}">View details</button>
        <button type="button" class="page-primary-action" data-public-board-request="${escapeHtml(row.id)}">Request invitation</button>
      </div>
      <footer>
        <span>Due: ${escapeHtml(row.due_state?.due_date || "No deadline")}</span>
        <span>Last quote: ${escapeHtml(formatDateTime(row.last_quote_at))}</span>
      </footer>
    </article>
  `;
}

function renderCards(rows) {
  return `<div class="public-board-card-grid">${rows.map(renderOpportunityCard).join("")}</div>`;
}

function renderPipeline(rows) {
  const columns = [
    ["live", "Live"],
    ["closing", "Closing"],
    ["expired", "Expired"],
    ["awarded", "Awarded"]
  ];
  return `
    <div class="public-board-pipeline">
      ${columns.map(([status, label]) => {
        const bucket = rows.filter((row) => row.board_status === status);
        return `
          <section class="public-board-pipeline-column">
            <header><strong>${label}</strong><span>${bucket.length}</span></header>
            <div>${bucket.map(renderOpportunityCard).join("") || "<p class=\"public-board-empty-small\">No opportunities</p>"}</div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderSheet(rows) {
  return `
    <div class="public-board-sheet-wrap">
      <table class="public-board-sheet">
        <thead>
          <tr>
            <th>Status</th>
            <th>RFx</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Equipment</th>
            <th>Service</th>
            <th>Quotes</th>
            <th>Best</th>
            <th>Capacity</th>
            <th>Due</th>
            <th>Last quote</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-public-board-card="${escapeHtml(row.id)}">
              <td>${escapeHtml(statusLabel(row.board_status))}</td>
              <td>${escapeHtml(row.event?.rfx_id || row.event?.name || "-")}</td>
              <td>${escapeHtml(row.lane?.origin || "-")}</td>
              <td>${escapeHtml(row.lane?.destination || "-")}</td>
              <td>${escapeHtml([row.lane?.equipment, row.lane?.trailer].filter(Boolean).join(" / ") || "-")}</td>
              <td>${escapeHtml([row.lane?.operation, row.lane?.service].filter(Boolean).join(" / ") || "-")}</td>
              <td>${formatNumber(row.quote_count)}</td>
              <td>${formatMoney(row.best_rate, row.currency)}</td>
              <td>${formatNumber(row.total_weekly_capacity)}</td>
              <td>${escapeHtml(row.due_state?.due_date || "-")}</td>
              <td>${escapeHtml(formatDateTime(row.last_quote_at))}</td>
              <td><button type="button" class="secondary" data-public-board-request="${escapeHtml(row.id)}">Request invitation</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBoard() {
  const rows = visibleRows();
  viewButtons.forEach((button) => {
    const active = button.dataset.boardView === state.viewMode;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (!rows.length) {
    boardRoot.innerHTML = `
      <section class="public-board-empty">
        <strong>No opportunities in current filters</strong>
        <p>Try another status or clear the search. The board refreshes automatically when new Bid Room activity appears.</p>
      </section>
    `;
    return;
  }
  if (state.viewMode === "pipeline") boardRoot.innerHTML = renderPipeline(rows);
  else if (state.viewMode === "sheet") boardRoot.innerHTML = renderSheet(rows);
  else boardRoot.innerHTML = renderCards(rows);
}

async function loadBoard({ announceChanges = true } = {}) {
  refreshButton.disabled = true;
  statusEl.textContent = scopedEventId ? "Refreshing selected event marketplace..." : "Refreshing public Bid Room board...";
  try {
    const data = await callPublicBoard({ status: statusFilter.value, limit: 250, event_id: scopedEventId });
    if (announceChanges) detectBoardSignals(data.rows || []);
    state.rows = data.rows || [];
    state.summary = data.summary || {};
    rememberRows(state.rows);
    state.loaded = true;
    renderSummary();
    renderBoard();
    statusEl.textContent = `${scopedEventLabel() || "Public marketplace"} | Updated ${formatDateTime(data.generated_at)} | ${formatNumber(state.rows.length)} opportunities`;
  } catch (error) {
    statusEl.textContent = error.message || "Public board could not load.";
    boardRoot.innerHTML = `
      <section class="public-board-empty is-error">
        <strong>Bid Room board could not load</strong>
        <p>${escapeHtml(error.message || "Check the connection and retry.")}</p>
        <button type="button" class="secondary" data-retry-public-board>Retry</button>
      </section>
    `;
  } finally {
    refreshButton.disabled = false;
  }
}

soundButton.addEventListener("click", async () => {
  state.soundEnabled = true;
  const context = ensureAudioContext();
  if (context?.state === "suspended") await context.resume();
  soundButton.textContent = "Sound enabled";
  soundButton.disabled = true;
  announce("enabled");
});

languageSelect.addEventListener("change", () => {
  state.language = languageSelect.value;
  localStorage.setItem("rateware.publicBidBoard.language", state.language);
  announce("enabled");
});

refreshButton.addEventListener("click", () => loadBoard());
statusFilter.addEventListener("change", () => loadBoard({ announceChanges: false }));
searchInput.addEventListener("input", renderBoard);
findInvitesButton?.addEventListener("click", () => openSoftLoginDrawer());
fullscreenButton.addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.viewMode = button.dataset.boardView || "cards";
    localStorage.setItem("rateware.publicBidBoard.view", state.viewMode);
    renderBoard();
  });
});

boardRoot.addEventListener("click", (event) => {
  if (event.target.closest("[data-retry-public-board]")) {
    loadBoard();
    return;
  }
  const requestButton = event.target.closest("[data-public-board-request]");
  if (requestButton) {
    renderDetailDrawer(rowById(requestButton.dataset.publicBoardRequest), true);
    return;
  }
  const detailsButton = event.target.closest("[data-public-board-details]");
  if (detailsButton) {
    renderDetailDrawer(rowById(detailsButton.dataset.publicBoardDetails), false);
    return;
  }
  const card = event.target.closest("[data-public-board-card]");
  if (card && !event.target.closest("button, a, input, select, textarea")) {
    renderDetailDrawer(rowById(card.dataset.publicBoardCard), false);
  }
});

detailClose?.addEventListener("click", closeDetailDrawer);
detailDrawer?.addEventListener("click", (event) => {
  const softLoginButton = event.target.closest("[data-public-board-soft-login]");
  if (softLoginButton) {
    const row = rowById(softLoginButton.dataset.publicBoardSoftLogin);
    closeDetailDrawer();
    openSoftLoginDrawer(row);
    return;
  }
  if (event.target === detailDrawer) closeDetailDrawer();
});
detailDrawer?.addEventListener("submit", async (event) => {
  const form = event.target.closest("#public-invite-request-form");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector("button[type='submit']");
  const status = form.querySelector("#public-invite-request-status");
  const formData = new FormData(form);
  const payload = {
    event_id: form.dataset.eventId,
    lane_id: form.dataset.laneId,
    company: formData.get("company"),
    contact_name: formData.get("contact_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    notes: formData.get("notes"),
    language: state.language
  };
  submitButton.disabled = true;
  status.textContent = "Sending request...";
  try {
    const data = await callInviteRequest(payload);
    saveRequestProfile({
      company: payload.company,
      contact_name: payload.contact_name,
      email: payload.email,
      phone: payload.phone
    });
    status.textContent = data.message || "Invitation request sent.";
    queueAlert("inviteSent", rowById(form.dataset.laneId) || { route_label: "Bid Room", event: { name: "Bid Room" } });
  } catch (error) {
    status.textContent = error.message || "Could not send the invitation request.";
  } finally {
    submitButton.disabled = false;
  }
});
softLoginClose?.addEventListener("click", closeSoftLoginDrawer);
softLoginDrawer?.addEventListener("click", (event) => {
  if (event.target === softLoginDrawer) closeSoftLoginDrawer();
});
softLoginDrawer?.addEventListener("submit", async (event) => {
  const form = event.target.closest("#public-soft-login-form");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector("button[type='submit']");
  const status = form.querySelector("#public-soft-login-status");
  const formData = new FormData(form);
  const email = formData.get("email");
  submitButton.disabled = true;
  status.textContent = "Looking up invitations...";
  try {
    const data = await callFindInvitations({
      email,
      event_id: softLoginDrawer.dataset.eventId || "",
      lane_id: softLoginDrawer.dataset.laneId || "",
      language: state.language
    });
    const profile = requestProfile();
    saveRequestProfile({ ...profile, email });
    status.textContent = data.message || "If invitations exist, private links were sent to that email.";
    if (data.sent) queueAlert("linksSent", { route_label: "Private Bid Room", event: { name: "Soft login" } });
  } catch (error) {
    status.textContent = error.message || "Could not find invitations right now.";
  } finally {
    submitButton.disabled = false;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (detailDrawer && !detailDrawer.hidden) closeDetailDrawer();
  if (softLoginDrawer && !softLoginDrawer.hidden) closeSoftLoginDrawer();
});

setInterval(() => {
  if (autoRefreshInput.checked && document.visibilityState !== "hidden") loadBoard();
}, 15000);

renderAlerts();
initScopedBoardMode();
loadBoard({ announceChanges: false });
