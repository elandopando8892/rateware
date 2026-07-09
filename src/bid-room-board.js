import { SUPABASE_URL } from "./config.js";
import { apiErrorMessage } from "./error-copy.js";

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
const supportJumpButton = document.querySelector("#public-board-support-jump");
const findInvitesButton = document.querySelector("#public-board-find-invites");
const detailDrawer = document.querySelector("#public-board-detail-drawer");
const detailContent = document.querySelector("#public-board-detail-content");
const detailClose = document.querySelector("#public-board-detail-close");
const softLoginDrawer = document.querySelector("#public-board-soft-login-drawer");
const softLoginClose = document.querySelector("#public-board-soft-login-close");
const supportForm = document.querySelector("#public-board-support-form");
const supportReply = document.querySelector("#public-board-support-reply");
const supportMessage = document.querySelector("#public-board-support-message");
const supportEmail = document.querySelector("#public-board-support-email");
const supportWidget = document.querySelector("#public-board-support-widget");
const supportLauncher = document.querySelector("#public-board-support-launcher");
const supportClose = document.querySelector("#public-board-support-close");
const supportFollowup = document.querySelector("#public-board-support-followup");

const API_URL = `${SUPABASE_URL}/functions/v1/rfx-bid-api`;
const INVITE_ACCESS_EMAIL_KEY = "rateware.publicBidBoard.inviteEmail";
const INVITE_ACCESS_LANES_KEY = "rateware.publicBidBoard.invitedLaneIds";
const INVITE_ACCESS_EVENTS_KEY = "rateware.publicBidBoard.invitedEventIds";
const VERIFIED_INVITES_KEY = "rateware.publicBidBoard.verifiedInvitations";
const PUBLIC_BOARD_SOUND_DEFAULT_VERSION = "2026-07-08-sound-on";
if (localStorage.getItem("rateware.publicBidBoard.soundDefault") !== PUBLIC_BOARD_SOUND_DEFAULT_VERSION) {
  localStorage.setItem("rateware.publicBidBoard.sound", "on");
  localStorage.setItem("rateware.publicBidBoard.soundDefault", PUBLIC_BOARD_SOUND_DEFAULT_VERSION);
}
const ANNOUNCEMENTS = {
  en: {
    enabled: "Rateware bid room alerts enabled.",
    opportunity: "New opportunity available.",
    quote: "Quote Available.",
    bestUpdated: "Best offer updated.",
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
ANNOUNCEMENTS.es.bestUpdated = "Mejor oferta actualizada.";
ANNOUNCEMENTS.es.closing = "La oportunidad esta por cerrar.";
ANNOUNCEMENTS.es.inviteSent = "Solicitud de invitacion enviada.";
ANNOUNCEMENTS.es.linksSent = "Links privados enviados.";
ANNOUNCEMENTS.en.supportAnswer = "Bid assistant answered.";
ANNOUNCEMENTS.es.supportAnswer = "El asistente respondio.";
ANNOUNCEMENTS.en.supportTicket = "Support ticket created.";
ANNOUNCEMENTS.es.supportTicket = "Ticket de soporte creado.";

function normalizePublicEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function storedStringList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function storedVerifiedInvitations() {
  try {
    const rows = JSON.parse(localStorage.getItem(VERIFIED_INVITES_KEY) || "[]");
    return Array.isArray(rows)
      ? rows.filter((row) => row && typeof row === "object" && row.lane_id && row.token)
      : [];
  } catch {
    return [];
  }
}

function refreshVerifiedInvitations() {
  state.verifiedInvitations = storedVerifiedInvitations();
}

const state = {
  rows: [],
  summary: {},
  previousRows: new Map(),
  loaded: false,
  viewMode: localStorage.getItem("rateware.publicBidBoard.view") || "cards",
  language: localStorage.getItem("rateware.publicBidBoard.language") || "en",
  soundEnabled: localStorage.getItem("rateware.publicBidBoard.sound") !== "off",
  audioContext: null,
  alerts: [],
  selectedRowId: null,
  supportLaneId: "",
  supportQuestion: "",
  inviteEmail: normalizePublicEmail(localStorage.getItem(INVITE_ACCESS_EMAIL_KEY) || ""),
  inviteLookupComplete: Boolean(localStorage.getItem(INVITE_ACCESS_EMAIL_KEY)),
  invitedLaneIds: new Set(storedStringList(INVITE_ACCESS_LANES_KEY)),
  invitedEventIds: new Set(storedStringList(INVITE_ACCESS_EVENTS_KEY)),
  verifiedInvitations: storedVerifiedInvitations()
};

languageSelect.value = state.language;

function syncSoundButton() {
  if (!soundButton) return;
  soundButton.textContent = state.soundEnabled ? "Sound on" : "Sound off";
  soundButton.setAttribute("aria-pressed", state.soundEnabled ? "true" : "false");
  soundButton.classList.toggle("is-muted", !state.soundEnabled);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
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

function countdownDueValue(row = {}) {
  return row.event?.due_date || row.due_state?.due_date || "";
}

function parseCountdownDueDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countdownMeta(value) {
  const dueAt = parseCountdownDueDate(value);
  if (!dueAt) {
    return {
      label: state.language === "es" ? "Sin fecha limite" : "No deadline",
      caption: state.language === "es" ? "Cierre pendiente" : "Close date pending",
      tone: "muted"
    };
  }
  const diff = dueAt.getTime() - Date.now();
  if (diff <= 0) {
    return {
      label: state.language === "es" ? "Cerrado" : "Closed",
      caption: state.language === "es" ? "Tiempo finalizado" : "Time expired",
      tone: "expired"
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(diff / dayMs);
  const hours = Math.floor((diff % dayMs) / hourMs);
  const minutes = Math.floor((diff % hourMs) / minuteMs);
  const seconds = Math.floor((diff % minuteMs) / 1000);
  return {
    label: `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`,
    caption: state.language === "es" ? "Tiempo para cerrar" : "Time to close",
    tone: days === 0 && hours < 6 ? "urgent" : days <= 1 ? "warning" : "live"
  };
}

function renderCountdown(row = {}, compact = false) {
  const dueDate = countdownDueValue(row);
  const meta = countdownMeta(dueDate);
  return `
    <div class="public-opportunity-countdown ${compact ? "is-compact" : ""}" data-public-countdown data-due-date="${escapeHtml(dueDate)}" data-tone="${escapeHtml(meta.tone)}">
      <strong>${escapeHtml(meta.label)}</strong>
      <span>${escapeHtml(meta.caption)}</span>
    </div>
  `;
}

function updateCountdowns() {
  document.querySelectorAll("[data-public-countdown]").forEach((node) => {
    const meta = countdownMeta(node.dataset.dueDate || "");
    node.dataset.tone = meta.tone;
    const label = node.querySelector("strong");
    const caption = node.querySelector("span");
    if (label) label.textContent = meta.label;
    if (caption) caption.textContent = meta.caption;
  });
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
  if (!response.ok) throw new Error(apiErrorMessage(data, text, `Bid Room board failed (${response.status})`));
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
  if (!response.ok) throw new Error(apiErrorMessage(data, text, `Invitation request failed (${response.status})`));
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
  if (!response.ok) throw new Error(apiErrorMessage(data, text, `Invitation lookup failed (${response.status})`));
  return data;
}

async function callBidSupport(payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "bid_support_reply", public_context: true, ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(apiErrorMessage(data, text, `Support request failed (${response.status})`));
  return data;
}

function renderSupportSuggestions(prompts = []) {
  if (!Array.isArray(prompts) || !prompts.length) return "";
  const label = state.language === "es" ? "Preguntas para profundizar" : "Go deeper";
  return `
    <div class="bid-support-suggestions">
      <span>${escapeHtml(label)}</span>
      <div class="bid-support-suggestion-actions">
        ${prompts.map((prompt) => `<button type="button" class="secondary small-button" data-public-support-prompt="${escapeAttribute(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderSupportHighlights(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <div class="bid-support-highlights">
      ${items.map((item) => `
        <div>
          <span>${escapeHtml(item.label || "")}</span>
          <strong>${escapeHtml(item.value || "-")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSupportNextSteps(steps = []) {
  if (!Array.isArray(steps) || !steps.length) return "";
  const label = state.language === "es" ? "Siguiente paso sugerido" : "Suggested next step";
  return `
    <div class="bid-support-next-steps">
      <span>${escapeHtml(label)}</span>
      <ol>
        ${steps.slice(0, 3).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function renderPublicSupportReply(result = null, status = "") {
  if (!supportReply) return;
  if (!result && !status) {
    supportReply.innerHTML = "";
    supportFollowup?.setAttribute("hidden", "");
    return;
  }
  if (status) {
    supportReply.innerHTML = `<p class="status-message">${escapeHtml(status)}</p>`;
    return;
  }
  supportFollowup?.setAttribute("hidden", "");
  const title = result.intent_label || (result.needs_ticket ? "Human follow-up recommended" : "Support answer");
  const confidence = result.confidence ? `Confidence: ${result.confidence}` : "";
  const question = result.question || state.supportQuestion;
  supportReply.innerHTML = `
    <div class="bid-support-thread">
      ${question ? `
        <article class="bid-support-message is-user">
          <span>${escapeHtml(state.language === "es" ? "Tu pregunta" : "You asked")}</span>
          <p>${escapeHtml(question)}</p>
        </article>
      ` : ""}
      <article class="bid-support-answer bid-support-message is-assistant" data-needs-ticket="${result.needs_ticket ? "true" : "false"}">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(confidence)}</span>
        </div>
        <small>${escapeHtml(result.scope || "Public Bid Room")}</small>
        ${renderSupportHighlights(result.support_highlights)}
        <p>${escapeHtml(result.answer || "")}</p>
        ${renderSupportNextSteps(result.next_steps)}
        ${result.ticket?.id ? `<small>Ticket created: ${escapeHtml(result.ticket.id)}</small>` : ""}
        ${result.needs_ticket && result.ticket_suggestion ? `<small>${escapeHtml(result.ticket_suggestion)}</small>` : ""}
        ${renderSupportSuggestions(result.suggested_prompts)}
        ${result.needs_ticket && !result.ticket?.id ? `
          <small>${escapeHtml(state.language === "es" ? "Solo crea ticket si necesitas respuesta humana de procurement." : "Create a ticket only if procurement should answer directly.")}</small>
          <button type="button" class="secondary small-button" data-public-support-ticket>${escapeHtml(state.language === "es" ? "Crear ticket" : "Create ticket")}</button>
        ` : ""}
      </article>
    </div>
  `;
}

function setPublicSupportOpen(open = true) {
  if (!supportWidget) return;
  supportWidget.dataset.open = open ? "true" : "false";
  supportLauncher?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    window.setTimeout(() => supportMessage?.focus({ preventScroll: true }), 40);
  }
}

function openPublicSupportForRow(row = null) {
  state.supportLaneId = row?.id || "";
  if (supportMessage && row) {
    supportMessage.value = `Can you explain how to participate in ${row.route_label || "this opportunity"}?`;
    state.supportQuestion = supportMessage.value;
  }
  setPublicSupportOpen(true);
}

async function askPublicSupport(options = {}) {
  const message = String(options.createTicket ? state.supportQuestion : supportMessage?.value || "").trim();
  if (!message) {
    renderPublicSupportReply(null, "Write a support question first.");
    supportMessage?.focus();
    return;
  }
  if (options.createTicket && !String(supportEmail?.value || "").trim()) {
    supportFollowup?.removeAttribute("hidden");
    renderPublicSupportReply(null, "Add an email so procurement can follow up on the ticket.");
    supportEmail?.focus();
    return;
  }
  state.supportQuestion = message;
  if (!options.createTicket) supportFollowup?.setAttribute("hidden", "");
  renderPublicSupportReply(null, options.createTicket ? "Creating ticket..." : "Checking public Bid Room context...");
  try {
    const result = await callBidSupport({
      message,
      create_ticket: options.createTicket === true,
      language: state.language,
      lane_id: state.supportLaneId || "",
      email: supportEmail?.value || ""
    });
    renderPublicSupportReply(result);
    queueSupportAlert(result.ticket?.id ? "supportTicket" : "supportAnswer", result.intent_label || result.answer);
  } catch (error) {
    renderPublicSupportReply(null, error.message || "Support could not answer.");
  }
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

function queueSupportAlert(type, message = "") {
  const language = ANNOUNCEMENTS[state.language] ? state.language : "en";
  const label = ANNOUNCEMENTS[language][type] || ANNOUNCEMENTS.en[type] || "Bid support";
  const alert = {
    id: `${Date.now()}-${Math.random()}`,
    type,
    label,
    route: message || (state.language === "es" ? "Soporte contextual" : "Contextual support"),
    event: state.language === "es" ? "Asistente del Bid Room" : "Bid Room assistant",
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
      queueAlert("bestUpdated", row);
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

async function armPublicBoardAudio() {
  if (!state.soundEnabled) return;
  const context = ensureAudioContext();
  if (context?.state === "suspended") {
    await context.resume().catch(() => {});
  }
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
    alertsRoot.innerHTML = state.soundEnabled
      ? "<p>No movement yet. Sound is on for opportunity, quote, deadline, and ranking alerts.</p>"
      : "<p>No movement yet. Sound is off. Turn it on to hear opportunity, quote, deadline, and ranking alerts.</p>";
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
  document.body.classList.remove("is-event-scoped-board");
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
  return "";
}

function laneTags(row) {
  return [
    row.lane?.equipment,
    row.lane?.trailer,
    row.lane?.operation,
    row.lane?.service
  ].filter(Boolean).slice(0, 4);
}

function publicLaneDetailSections(row = {}) {
  const lane = row.lane || {};
  return [
    ["Logistics model / Modelo logistico", lane.logistics_model],
    ["Operation criteria / Criterios de operacion", lane.operation_criteria],
    ["Business rules / Reglas de negocio", lane.business_rules],
    ["Service specifications / Especificaciones de servicio", lane.service_specifications],
    ["Other notes / Otras notas", lane.other_notes],
    ["Notes / Notas", lane.notes]
  ].filter(([, value]) => String(value || "").trim());
}

function renderPublicRichText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return `<p>${escapeHtml(raw).replace(/\r?\n/g, "<br>")}</p>`;
  }
  const allowedTags = new Set(["p", "ul", "ol", "li", "br", "strong", "b", "em", "i", "span"]);
  const parser = new DOMParser();
  const documentValue = parser.parseFromString(raw, "text/html");
  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.nodeName.toLowerCase();
    const children = [...node.childNodes].map(sanitizeNode).join("");
    if (tag === "body" || tag === "html" || tag === "span") return children;
    if (!allowedTags.has(tag)) return children;
    if (tag === "br") return "<br>";
    const outputTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
    return `<${outputTag}>${children}</${outputTag}>`;
  };
  return sanitizeNode(documentValue.body);
}

function renderBusinessDetailPreview(row = {}) {
  const sections = publicLaneDetailSections(row);
  if (!sections.length) return "";
  return `
    <div class="public-business-detail-preview" title="Business details available">
      <strong>Business details</strong>
      ${sections.slice(0, 3).map(([label]) => `<span>${escapeHtml(label.split(" / ")[0])}</span>`).join("")}
    </div>
  `;
}

function renderBusinessDetails(row = {}) {
  const sections = publicLaneDetailSections(row);
  if (!sections.length) return "";
  return `
    <section class="public-board-detail-section public-business-detail-section">
      <h3>Business details / Detalles del negocio</h3>
      <div class="public-business-detail-grid">
        ${sections.map(([label, value]) => `
          <article>
            <h4>${escapeHtml(label)}</h4>
            <div class="public-rich-text">${renderPublicRichText(value)}</div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
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

function persistInvitationAccess() {
  if (state.inviteEmail) localStorage.setItem(INVITE_ACCESS_EMAIL_KEY, state.inviteEmail);
  else localStorage.removeItem(INVITE_ACCESS_EMAIL_KEY);
  localStorage.setItem(INVITE_ACCESS_LANES_KEY, JSON.stringify([...state.invitedLaneIds]));
  localStorage.setItem(INVITE_ACCESS_EVENTS_KEY, JSON.stringify([...state.invitedEventIds]));
}

function rememberInvitationAccess(email, data = {}) {
  const normalizedEmail = normalizePublicEmail(email);
  state.inviteEmail = normalizedEmail;
  state.inviteLookupComplete = Boolean(normalizedEmail);
  state.invitedLaneIds = new Set(
    Array.isArray(data.matched_lane_ids)
      ? data.matched_lane_ids.map((id) => String(id || "")).filter(Boolean)
      : []
  );
  state.invitedEventIds = new Set(
    Array.isArray(data.matched_event_ids)
      ? data.matched_event_ids.map((id) => String(id || "")).filter(Boolean)
      : []
  );
  persistInvitationAccess();
}

function verifiedInvitationForRow(row = {}) {
  const laneId = String(row.id || "");
  if (!laneId) return null;
  return state.verifiedInvitations.find((item) => String(item.lane_id || "") === laneId && item.token) || null;
}

function invitationAccessForRow(row = {}) {
  if (verifiedInvitationForRow(row)) return "verified";
  if (!state.inviteEmail || !state.inviteLookupComplete) return "unknown";
  const laneId = String(row.id || "");
  const eventId = String(row.event?.id || row.event_id || "");
  if ((laneId && state.invitedLaneIds.has(laneId)) || (!laneId && eventId && state.invitedEventIds.has(eventId))) {
    return "invited";
  }
  return "not_invited";
}

function invitationActionForRow(row = {}) {
  const access = invitationAccessForRow(row);
  if (access === "verified") {
    return {
      access,
      label: state.language === "es" ? "Abrir puja" : "Open private bid",
      attribute: "data-public-board-open-private"
    };
  }
  if (access === "invited") {
    return {
      access,
      label: state.language === "es" ? "Recuperar link" : "Recover link",
      attribute: "data-public-board-private-link"
    };
  }
  if (access === "not_invited") {
    return {
      access,
      label: state.language === "es" ? "Solicitar invitacion" : "Request invitation",
      attribute: "data-public-board-request"
    };
  }
  return {
    access,
    label: state.language === "es" ? "Verificar acceso" : "Check access",
    attribute: "data-public-board-soft-login"
  };
}

function renderInvitationAction(row = {}, primary = true) {
  const action = invitationActionForRow(row);
  const className = primary ? "page-primary-action" : "secondary";
  return `<button type="button" class="${className}" ${action.attribute}="${escapeHtml(row.id || "")}">${escapeHtml(action.label)}</button>`;
}

function invitationRuleCopy(row) {
  const access = invitationAccessForRow(row);
  if (access === "verified") {
    return state.language === "es"
      ? "Ya verificaste esta invitacion en este navegador. Puedes abrir el Bid Room privado y pujar directamente."
      : "This invitation is already verified in this browser. You can open the private Bid Room and bid directly.";
  }
  if (access === "invited") {
    return state.language === "es"
      ? "Ya tienes invitacion para esta oportunidad, pero este navegador aun no tiene el token privado. Recupera el link en tu correo para verificarlo una vez."
      : "You already have an invitation for this opportunity, but this browser does not have the private token yet. Recover the link by email once to verify access.";
  }
  if (access === "unknown") {
    return state.language === "es"
      ? "Primero verifica el correo que procurement uso para invitarte. Si no hay invitacion activa, podras solicitar acceso."
      : "First check the email procurement used to invite you. If no active invitation exists, you can request access.";
  }
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
  const access = invitationAccessForRow(row);
  const requestForm = access === "not_invited" ? `
    <form id="public-invite-request-form" class="public-board-request-form" data-event-id="${escapeHtml(row.event?.id || row.event_id || "")}" data-lane-id="${escapeHtml(row.id)}">
      <h3>Request invitation</h3>
      <div class="public-board-form-grid">
        <label>Carrier company<input name="company" required value="${escapeHtml(profile.company || "")}" placeholder="Carrier legal or commercial name" /></label>
        <label>Contact name<input name="contact_name" value="${escapeHtml(profile.contact_name || "")}" placeholder="Your name" /></label>
        <label>Email<input name="email" type="email" required value="${escapeHtml(profile.email || state.inviteEmail || "")}" placeholder="name@carrier.com" /></label>
        <label>Phone / WhatsApp<input name="phone" value="${escapeHtml(profile.phone || "")}" placeholder="+52..." /></label>
      </div>
      <label>Notes<textarea name="notes" rows="3" placeholder="Capacity, equipment fit, target corridor, or why your carrier should be invited."></textarea></label>
      <div class="public-board-request-actions">
        <button type="submit" class="page-primary-action">Send invitation request</button>
        <span id="public-invite-request-status" class="row-save-status" role="status"></span>
      </div>
    </form>
  ` : "";
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
      <span>${renderCountdown(row, true)}</span>
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
    ${renderBusinessDetails(row)}
    <section class="public-board-invite-rule">
      <strong>Invitation required to bid</strong>
      <p>${escapeHtml(invitationRuleCopy(row))}</p>
      ${renderInvitationAction(row, false)}
      <button type="button" class="secondary" data-public-board-support="${escapeHtml(row.id)}">Ask support about this opportunity</button>
    </section>
    ${requestForm}
  `;
  detailDrawer.hidden = false;
  document.body.classList.add("has-public-board-drawer");
  updateCountdowns();
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
  if (emailInput) emailInput.value = state.inviteEmail || profile.email || "";
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
  const action = renderInvitationAction(row, true);
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
      ${renderCountdown(row)}
      <div class="public-opportunity-tags">
        ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>No tags</span>"}
      </div>
      ${renderBusinessDetailPreview(row)}
      <div class="public-opportunity-actions">
        <button type="button" class="secondary" data-public-board-details="${escapeHtml(row.id)}">View details</button>
        ${action}
      </div>
      <footer>
        <span>Due: ${escapeHtml(countdownDueValue(row) || "No deadline")}</span>
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
            <th>Business details</th>
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
              <td>${publicLaneDetailSections(row).length ? "Available" : "-"}</td>
              <td>${renderCountdown(row, true)}</td>
              <td>${escapeHtml(formatDateTime(row.last_quote_at))}</td>
              <td>${renderInvitationAction(row, false)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBoard() {
  refreshVerifiedInvitations();
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
  updateCountdowns();
}

async function sendPrivateLinksForRow(row, button = null) {
  if (!row) return;
  if (!state.inviteEmail) {
    openSoftLoginDrawer(row);
    return;
  }
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = state.language === "es" ? "Enviando..." : "Sending...";
  }
  statusEl.textContent = state.language === "es"
    ? `Enviando link privado a ${state.inviteEmail}...`
    : `Sending private link to ${state.inviteEmail}...`;
  try {
    const data = await callFindInvitations({
      email: state.inviteEmail,
      event_id: row.event?.id || row.event_id || "",
      lane_id: row.id || "",
      language: state.language
    });
    rememberInvitationAccess(state.inviteEmail, data);
    renderBoard();
    statusEl.textContent = apiErrorMessage({ message: data.message }, "", (
      state.language === "es"
        ? `Si existe invitacion, enviamos el link privado a ${state.inviteEmail}.`
        : `If an invitation exists, the private link was sent to ${state.inviteEmail}.`
    ));
    if (data.sent) queueAlert("linksSent", row);
  } catch (error) {
    statusEl.textContent = error.message || "Could not send private links right now.";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function openVerifiedPrivateBid(row) {
  const verified = verifiedInvitationForRow(row);
  if (!verified?.token) {
    openSoftLoginDrawer(row);
    return;
  }
  window.location.href = `./rfx-bid.html?token=${encodeURIComponent(verified.token)}`;
}

async function loadBoard({ announceChanges = true } = {}) {
  refreshButton.disabled = true;
  statusEl.textContent = "Refreshing all public Bid Room opportunities...";
  try {
    const data = await callPublicBoard({ limit: 1000 });
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
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem("rateware.publicBidBoard.sound", state.soundEnabled ? "on" : "off");
  if (state.soundEnabled) {
    const context = ensureAudioContext();
    if (context?.state === "suspended") await context.resume();
    announce("enabled");
  }
  syncSoundButton();
  renderAlerts();
});

languageSelect.addEventListener("change", () => {
  state.language = languageSelect.value;
  localStorage.setItem("rateware.publicBidBoard.language", state.language);
  announce("enabled");
});

refreshButton.addEventListener("click", () => loadBoard());
searchInput.addEventListener("input", renderBoard);
supportJumpButton?.addEventListener("click", () => {
  openPublicSupportForRow(null);
});
supportLauncher?.addEventListener("click", () => setPublicSupportOpen(supportWidget?.dataset.open !== "true"));
supportClose?.addEventListener("click", () => setPublicSupportOpen(false));
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
  const softLoginButton = event.target.closest("[data-public-board-soft-login]");
  if (softLoginButton) {
    openSoftLoginDrawer(rowById(softLoginButton.dataset.publicBoardSoftLogin));
    return;
  }
  const privateLinkButton = event.target.closest("[data-public-board-private-link]");
  if (privateLinkButton) {
    sendPrivateLinksForRow(rowById(privateLinkButton.dataset.publicBoardPrivateLink), privateLinkButton);
    return;
  }
  const openPrivateButton = event.target.closest("[data-public-board-open-private]");
  if (openPrivateButton) {
    openVerifiedPrivateBid(rowById(openPrivateButton.dataset.publicBoardOpenPrivate));
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
  const privateLinkButton = event.target.closest("[data-public-board-private-link]");
  if (privateLinkButton) {
    sendPrivateLinksForRow(rowById(privateLinkButton.dataset.publicBoardPrivateLink), privateLinkButton);
    return;
  }
  const openPrivateButton = event.target.closest("[data-public-board-open-private]");
  if (openPrivateButton) {
    openVerifiedPrivateBid(rowById(openPrivateButton.dataset.publicBoardOpenPrivate));
    return;
  }
  const softLoginButton = event.target.closest("[data-public-board-soft-login]");
  if (softLoginButton) {
    const row = rowById(softLoginButton.dataset.publicBoardSoftLogin);
    closeDetailDrawer();
    openSoftLoginDrawer(row);
    return;
  }
  const requestButton = event.target.closest("[data-public-board-request]");
  if (requestButton) {
    detailContent?.querySelector("#public-invite-request-form [name='company']")?.focus();
    return;
  }
  const supportButton = event.target.closest("[data-public-board-support]");
  if (supportButton) {
    const row = rowById(supportButton.dataset.publicBoardSupport);
    closeDetailDrawer();
    openPublicSupportForRow(row);
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
    status.textContent = apiErrorMessage({ message: data.message }, "", "Invitation request sent.");
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
    rememberInvitationAccess(email, data);
    renderBoard();
    status.textContent = apiErrorMessage({ message: data.message }, "", "If invitations exist, private links were sent to that email.");
    if (data.sent) queueAlert("linksSent", { route_label: "Private Bid Room", event: { name: "Soft login" } });
  } catch (error) {
    status.textContent = error.message || "Could not find invitations right now.";
  } finally {
    submitButton.disabled = false;
  }
});

supportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await askPublicSupport();
});

supportReply?.addEventListener("click", async (event) => {
  const promptButton = event.target.closest("[data-public-support-prompt]");
  if (promptButton) {
    const prompt = promptButton.dataset.publicSupportPrompt || promptButton.textContent || "";
    if (supportMessage) supportMessage.value = prompt;
    state.supportQuestion = prompt;
    setPublicSupportOpen(true);
    supportMessage?.focus();
    return;
  }
  if (!event.target.closest("[data-public-support-ticket]")) return;
  await askPublicSupport({ createTicket: true });
});
document.addEventListener("keydown", (event) => {
  armPublicBoardAudio();
  if (event.key !== "Escape") return;
  if (detailDrawer && !detailDrawer.hidden) closeDetailDrawer();
  if (softLoginDrawer && !softLoginDrawer.hidden) closeSoftLoginDrawer();
  if (supportWidget?.dataset.open === "true") setPublicSupportOpen(false);
});

document.addEventListener("pointerdown", () => {
  armPublicBoardAudio();
}, { capture: true });

setInterval(() => {
  if (autoRefreshInput.checked && document.visibilityState !== "hidden") loadBoard();
}, 15000);

setInterval(updateCountdowns, 1000);

syncSoundButton();
renderAlerts();
initScopedBoardMode();
loadBoard({ announceChanges: false });
