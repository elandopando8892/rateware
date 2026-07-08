import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");

let boardRefreshTimer = null;
let bookSearchTimer = null;
let lastCarrierBook = null;
let lastCarrierChat = { rows: [], google_chat_configured: false };
const bookFilters = {
  view: "all",
  query: ""
};
const PRIVATE_BID_ANNOUNCEMENTS = {
  en: {
    enabled: "Private Bid Room alerts enabled.",
    quote: "Quote Available.",
    displaced: "Place new bid. Your offer has been displaced.",
    leading: "You are currently leading.",
    chat: "New message in Bid Room chat.",
    bidSubmitted: "Bid submitted.",
    closing: "Deadline closing soon."
  },
  es: {
    enabled: "Alertas del Bid Room privado activadas.",
    quote: "Cotizacion disponible.",
    displaced: "Necesitas pujar de nuevo. Has sido superado.",
    leading: "Vas liderando.",
    chat: "Nuevo mensaje en el chat del Bid Room.",
    bidSubmitted: "Oferta enviada.",
    closing: "La oportunidad esta por cerrar."
  }
};
const privateAlertState = {
  language: localStorage.getItem("rateware.privateBidRoom.language") || "en",
  soundEnabled: false,
  audioContext: null,
  alerts: [],
  loaded: false,
  chatLoaded: false,
  previousSnapshot: null,
  previousChatSnapshot: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

async function callBidApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rfx-bid-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: tokenFromUrl(), ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Bid request failed.");
  return data;
}

function formatLane(lane = {}) {
  return `${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function laneDetailSections(lane = {}) {
  return [
    ["Logistics model", lane.logistics_model],
    ["Operation criteria", lane.operation_criteria],
    ["Business rules", lane.business_rules],
    ["Service specifications", lane.service_specifications],
    ["Other notes", lane.other_notes],
    ["Notes", lane.notes]
  ].filter(([, value]) => String(value || "").trim());
}

function formatMoney(value, currency = "USD") {
  const number = typeof value === "number" ? value : numberFromInput(value);
  if (!Number.isFinite(number)) return "-";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)} ${currency || "USD"}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusLabel(status) {
  const value = String(status || "drafted").toLowerCase();
  const labels = {
    drafted: "Drafted",
    invited: "Invited",
    viewed: "Viewed",
    responded: "Responded",
    quoted: "Quoted",
    bid_submitted: "Quoted",
    awarded: "Awarded",
    backup: "Backup",
    not_awarded: "Not awarded",
    pending: "Pending",
    declined: "Declined",
    open: "Open",
    not_invited: "Request invite"
  };
  return labels[value] || value;
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "awarded") return "success";
  if (value === "backup" || value === "quoted" || value === "bid_submitted") return "neutral";
  if (value === "not_awarded" || value === "declined") return "muted";
  if (value === "invited" || value === "viewed" || value === "responded") return "warning";
  return "muted";
}

function deadlineCopy(event = {}) {
  if (!event.due_date) return { label: "No deadline", tone: "muted", detail: "Procurement has not set a close date." };
  const dueAt = new Date(`${event.due_date}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return { label: formatDate(event.due_date), tone: "neutral", detail: "Deadline date needs review." };
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Closed", tone: "danger", detail: `Closed ${Math.abs(days)} day(s) ago.` };
  if (days === 0) return { label: "Closes today", tone: "warning", detail: "Submit or update your offer today." };
  if (days === 1) return { label: "1 day left", tone: "warning", detail: `Due ${formatDate(event.due_date)}.` };
  return { label: `${days} days left`, tone: "success", detail: `Due ${formatDate(event.due_date)}.` };
}

function visibilityCopy(visibility = {}) {
  if (visibility.mode === "open_leaderboard") {
    return "Open leaderboard - competitor names and exact submitted rates are visible.";
  }
  if (visibility.mode === "anonymous_rank") {
    return "Anonymous rank - competitor names and exact third-party rates are hidden.";
  }
  if (visibility.mode === "private") {
    return "Private - procurement sees all offers; carriers only see their own submitted bid.";
  }
  return "Private visibility controlled by procurement.";
}

function visibilityLabel(visibility = {}) {
  const labels = {
    private: "Private",
    anonymous_rank: "Anonymous rank",
    open_leaderboard: "Open leaderboard"
  };
  return labels[visibility.mode] || "Private";
}

function commercialModelLabel(value) {
  const labels = {
    direct_cost_plus: "Direct / cost-plus",
    carrier_share: "Carrier invoice share",
    xbf_buy_sell: "XBF buy-sell"
  };
  return labels[String(value || "").toLowerCase()] || "Not declared";
}

function commercialStructureConfig(value) {
  const model = String(value || "direct_cost_plus").toLowerCase();
  const configs = {
    direct_cost_plus: {
      tone: "Cost-plus",
      percentageField: "marksman",
      percentageLabel: "Suggested margin to share %",
      percentageTooltip: "Optional commercial guidance for MARKSMAN. The carrier shares the suggested margin MARKSMAN may add on top of the carrier all-in cost.",
      copy: "Use when the carrier is quoting their direct all-in cost and can suggest the MARKSMAN margin to share with the customer."
    },
    carrier_share: {
      tone: "Carrier shares",
      percentageField: "carrier",
      percentageLabel: "Carrier invoice share %",
      percentageTooltip: "Percentage of the customer billing amount the carrier is willing to share from the original quoted amount.",
      copy: "Use when the carrier wants MARKSMAN to bill the customer and share a percentage of that billing based on the carrier quote."
    },
    xbf_buy_sell: {
      tone: "XBF buy-sell",
      percentageField: "none",
      percentageLabel: "",
      percentageTooltip: "No percentage is requested. XBF controls the customer markup at its discretion.",
      copy: "Use when the carrier only submits their sell rate to XBF. No margin or share percentage is collected."
    }
  };
  return configs[model] || configs.direct_cost_plus;
}

function commercialPercentSummary(draft = {}) {
  const config = commercialStructureConfig(draft.commercial_model);
  if (config.percentageField === "marksman" && draft.marksman_margin_pct) return `${draft.marksman_margin_pct}% suggested margin`;
  if (config.percentageField === "carrier" && draft.carrier_share_pct) return `${draft.carrier_share_pct}% invoice share`;
  if (config.percentageField === "none") return "No percentage applies";
  return `${config.percentageLabel || "Percentage"} not declared`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function privateAlertPhrase(type) {
  const language = PRIVATE_BID_ANNOUNCEMENTS[privateAlertState.language] ? privateAlertState.language : "en";
  return PRIVATE_BID_ANNOUNCEMENTS[language][type] || PRIVATE_BID_ANNOUNCEMENTS.en[type] || type;
}

function privateAlertLabel(type) {
  const labels = {
    enabled: "Alerts enabled",
    quote: "Quote movement",
    displaced: "Rank changed",
    leading: "Leading offer",
    chat: "New chat message",
    bidSubmitted: "Bid submitted",
    closing: "Deadline risk"
  };
  return labels[type] || privateAlertPhrase(type);
}

function renderPrivateBidAlerts() {
  const panel = card.querySelector("#private-bid-alerts");
  const button = card.querySelector("#private-bid-sound");
  const language = card.querySelector("#private-bid-language");
  if (button) {
    button.textContent = privateAlertState.soundEnabled ? "Sound enabled" : "Enable sound";
    button.disabled = privateAlertState.soundEnabled;
  }
  if (language) language.value = privateAlertState.language;
  if (!panel) return;
  if (!privateAlertState.alerts.length) {
    panel.innerHTML = "<p>No movement yet. Enable sound to hear ranking, quote, chat, and deadline alerts.</p>";
    return;
  }
  panel.innerHTML = privateAlertState.alerts.map((alert) => `
    <article class="private-bid-alert is-${escapeHtml(alert.type)}">
      <strong>${escapeHtml(privateAlertLabel(alert.type))}</strong>
      <span>${escapeHtml(alert.message)}</span>
      <small>${escapeHtml(formatDateTime(alert.created_at))}</small>
    </article>
  `).join("");
}

function ensurePrivateAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!privateAlertState.audioContext) privateAlertState.audioContext = new AudioContextClass();
  return privateAlertState.audioContext;
}

function playPrivateBidTone(type) {
  const context = ensurePrivateAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const tones = {
    displaced: [392, 523],
    closing: [494, 659],
    chat: [587, 740],
    bidSubmitted: [659, 880],
    leading: [784, 988]
  };
  const [startFrequency, endFrequency] = tones[type] || [659, 880];
  oscillator.type = "sine";
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

function announcePrivateBidAlert(type) {
  if (!privateAlertState.soundEnabled) return;
  const language = PRIVATE_BID_ANNOUNCEMENTS[privateAlertState.language] ? privateAlertState.language : "en";
  const phrase = privateAlertPhrase(type);
  playPrivateBidTone(type);
  if (!("speechSynthesis" in window) || !phrase) return;
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = language === "es" ? "es-MX" : "en-US";
  utterance.rate = 0.94;
  utterance.pitch = type === "displaced" ? 0.9 : 1.05;
  window.speechSynthesis.speak(utterance);
}

function queuePrivateBidAlert(type, message = "") {
  const alert = {
    id: `${Date.now()}-${Math.random()}`,
    type,
    message: message || privateAlertPhrase(type),
    created_at: new Date().toISOString()
  };
  privateAlertState.alerts = [alert, ...privateAlertState.alerts].slice(0, 8);
  renderPrivateBidAlerts();
  announcePrivateBidAlert(type);
}

async function enablePrivateBidAlerts() {
  privateAlertState.soundEnabled = true;
  const context = ensurePrivateAudioContext();
  if (context?.state === "suspended") await context.resume();
  queuePrivateBidAlert("enabled", "Multimedia alerts are active for this private bid room.");
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function privateBidRoomSnapshot(data = {}) {
  const liveBoard = data.live_board || {};
  const rows = Array.isArray(liveBoard.rows) ? liveBoard.rows : [];
  const currentRow = rows.find((row) => row.is_current) || {};
  const event = data.invitation?.rfx_events || {};
  const deadline = deadlineCopy(event);
  return {
    rank: numberOrNull(liveBoard.current_rank ?? currentRow.rank),
    bidCount: Number(liveBoard.bid_count || rows.length || 0),
    currentRate: numberOrNull(currentRow.amount ?? data.invitation?.bid_rate),
    signal: liveBoard.marketplace_signal || liveBoard.position_signal || "",
    historyCount: Array.isArray(data.bid_history) ? data.bid_history.length : 0,
    deadlineTone: deadline.tone,
    updatedAt: liveBoard.updated_at || ""
  };
}

function detectPrivateBidRoomSignals(data = {}) {
  const snapshot = privateBidRoomSnapshot(data);
  const previous = privateAlertState.previousSnapshot;
  if (!privateAlertState.loaded || !previous) {
    privateAlertState.previousSnapshot = snapshot;
    privateAlertState.loaded = true;
    renderPrivateBidAlerts();
    return;
  }

  if (snapshot.rank && previous.rank && snapshot.rank > previous.rank) {
    queuePrivateBidAlert("displaced", `Your rank moved from #${previous.rank} to #${snapshot.rank}. Review the live board and consider a new bid.`);
  } else if (snapshot.rank === 1 && previous.rank !== 1) {
    queuePrivateBidAlert("leading", "Your offer moved into the leading position.");
  } else if (snapshot.bidCount > previous.bidCount) {
    queuePrivateBidAlert("quote", "New bid activity is available in this private room.");
  } else if (snapshot.deadlineTone === "warning" && previous.deadlineTone !== "warning") {
    queuePrivateBidAlert("closing", "The bid deadline is close. Review your offer before the room closes.");
  }

  privateAlertState.previousSnapshot = snapshot;
}

function privateChatSnapshot(chat = {}) {
  const rows = Array.isArray(chat.rows) ? chat.rows : [];
  const messages = rows.flatMap((thread) => Array.isArray(thread.messages) ? thread.messages : []);
  const latest = messages
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || {};
  return {
    count: messages.length,
    latestId: latest.id || latest.google_chat_message_name || latest.created_at || ""
  };
}

function detectPrivateChatSignals(chat = {}) {
  const snapshot = privateChatSnapshot(chat);
  const previous = privateAlertState.previousChatSnapshot;
  if (!privateAlertState.chatLoaded || !previous) {
    privateAlertState.previousChatSnapshot = snapshot;
    privateAlertState.chatLoaded = true;
    return;
  }
  if (snapshot.count > previous.count && snapshot.latestId !== previous.latestId) {
    queuePrivateBidAlert("chat", "A new message was added to the event group discussion.");
  }
  privateAlertState.previousChatSnapshot = snapshot;
}

function dateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function availabilitySummary(row = {}) {
  if (row.equipment_available === true) {
    return ["Available", row.eta_pickup ? `PU ${formatDateTime(row.eta_pickup)}` : null, row.eta_delivery ? `DEL ${formatDateTime(row.eta_delivery)}` : null].filter(Boolean).join(" | ");
  }
  if (row.equipment_available === false) return "Not available";
  return "Availability pending";
}

function commercialSummary(row = {}) {
  const parts = [commercialModelLabel(row.commercial_model)];
  const config = commercialStructureConfig(row.commercial_model);
  if (config.percentageField === "marksman" && row.marksman_margin_pct !== null && row.marksman_margin_pct !== undefined) parts.push(`${row.marksman_margin_pct}% suggested margin`);
  if (config.percentageField === "carrier" && row.carrier_share_pct !== null && row.carrier_share_pct !== undefined) parts.push(`${row.carrier_share_pct}% invoice share`);
  if (row.best_alternative_offered) {
    parts.push(row.alternative_equipment ? `Alt: ${row.alternative_equipment}` : "Best alternative");
  }
  return parts.filter(Boolean).join(" | ");
}

function marketplaceBucketLabel(bucket = "") {
  const labels = {
    leading: "Leading",
    strong: "Strong",
    competitive: "Competitive",
    needs_review: "Needs review"
  };
  return labels[String(bucket || "").toLowerCase()] || "Unscored";
}

function marketplaceScoreTone(bucket = "") {
  const value = String(bucket || "").toLowerCase();
  if (value === "leading" || value === "strong") return "success";
  if (value === "competitive") return "neutral";
  if (value === "needs_review") return "warning";
  return "muted";
}

function marketplaceScoreHtml(row = {}) {
  const score = Number(row.marketplace_score);
  const tone = marketplaceScoreTone(row.score_bucket);
  const label = marketplaceBucketLabel(row.score_bucket);
  if (Number.isFinite(score)) {
    return `<span class="marketplace-score-pill" data-tone="${escapeHtml(tone)}">${escapeHtml(score)}/100 <small>${escapeHtml(label)}</small></span>`;
  }
  return `<span class="marketplace-score-pill masked" data-tone="${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function marketplaceBadgesHtml(row = {}) {
  const badges = Array.isArray(row.marketplace_badges) ? row.marketplace_badges : [];
  const riskFlags = Array.isArray(row.risk_flags) ? row.risk_flags : [];
  const signals = [
    ...badges.map((label) => ({ label, tone: "success" })),
    ...riskFlags.map((label) => ({ label, tone: "warning" }))
  ].slice(0, 6);
  if (!signals.length) return `<span class="marketplace-badge muted">No signals</span>`;
  return `<span class="marketplace-badges">${signals.map((signal) => `<span class="marketplace-badge ${escapeHtml(signal.tone)}" title="${escapeHtml(signal.label)}">${escapeHtml(signal.label)}</span>`).join("")}</span>`;
}

function numberFromInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/[$,]/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function validationIssue(field, message) {
  return { field, message };
}

function validatePositiveNumberIssue(value, field, label, required = true) {
  const text = String(value ?? "").trim();
  if (!text) return required ? validationIssue(field, `${label} is required and must be numeric.`) : null;
  const number = numberFromInput(value);
  if (number === null) return validationIssue(field, `${label} must be numeric.`);
  if (number <= 0) return validationIssue(field, `${label} must be greater than zero.`);
  return null;
}

function validatePercentIssue(value, field, label, options = {}) {
  const text = String(value ?? "").trim();
  if (!text) return options.required ? validationIssue(field, `${label} is required for this commercial model.`) : null;
  const number = numberFromInput(value);
  if (number === null) return validationIssue(field, `${label} must be numeric.`);
  if (number < 0 || number > 100) return validationIssue(field, `${label} must be between 0% and 100%.`);
  if (options.procurementRange && (number < 2 || number > 5)) return validationIssue(field, `${label} must be between 2% and 5%.`);
  return null;
}

function validDateTimeValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function collectBidDraft() {
  const bestFinal = card.querySelector("#bid-best-final")?.checked || false;
  const notes = card.querySelector("#bid-notes")?.value || "";
  const commercialModel = card.querySelector("#bid-commercial-model")?.value || "direct_cost_plus";
  const commercialConfig = commercialStructureConfig(commercialModel);
  const draft = {
    bid_rate: card.querySelector("#bid-rate")?.value || "",
    currency: card.querySelector("#bid-currency")?.value || "USD",
    weekly_capacity: card.querySelector("#bid-capacity")?.value || "",
    transit_days: card.querySelector("#bid-transit-days")?.value || "",
    commercial_model: commercialModel,
    marksman_margin_pct: commercialConfig.percentageField === "marksman" ? card.querySelector("#bid-marksman-margin")?.value || "" : "",
    carrier_share_pct: commercialConfig.percentageField === "carrier" ? card.querySelector("#bid-carrier-share")?.value || "" : "",
    best_alternative_offered: card.querySelector("#bid-alt-enabled")?.checked || false,
    alternative_equipment: card.querySelector("#bid-alt-equipment")?.value || "",
    alternative_units: card.querySelector("#bid-alt-units")?.value || "",
    alternative_notes: card.querySelector("#bid-alt-notes")?.value || "",
    equipment_available: card.querySelector("#bid-equipment-available")?.value || "",
    unit_details: card.querySelector("#bid-unit-details")?.value || "",
    eta_pickup: card.querySelector("#bid-eta-pickup")?.value || "",
    eta_delivery: card.querySelector("#bid-eta-delivery")?.value || "",
    mirror_account_enabled: card.querySelector("#bid-mirror-account")?.checked || false,
    best_final: bestFinal,
    notes: [notes, bestFinal ? "Best and final offer confirmed." : null].filter(Boolean).join(" | ")
  };
  return draft;
}

function validateBidDraft(draft) {
  const errors = [
    validatePositiveNumberIssue(draft.bid_rate, "bid-rate", "All-in rate"),
    validatePositiveNumberIssue(draft.weekly_capacity, "bid-capacity", "Weekly capacity"),
    validatePositiveNumberIssue(draft.transit_days, "bid-transit-days", "Transit days")
  ].filter(Boolean);

  if (!/^[A-Z]{3}$/.test(String(draft.currency || "").trim().toUpperCase())) {
    errors.push(validationIssue("bid-currency", "Currency must be USD, MXN, CAD, or another 3-letter code."));
  }

  if (draft.commercial_model === "direct_cost_plus") {
    const marginIssue = validatePercentIssue(draft.marksman_margin_pct, "bid-marksman-margin", "Suggested margin to share %", { required: true, procurementRange: true });
    if (marginIssue) errors.push(marginIssue);
  }

  if (draft.commercial_model === "carrier_share") {
    const shareIssue = validatePercentIssue(draft.carrier_share_pct, "bid-carrier-share", "Carrier invoice share %", { required: true, procurementRange: true });
    if (shareIssue) errors.push(shareIssue);
  }

  const alternativeUnitsIssue = validatePositiveNumberIssue(draft.alternative_units, "bid-alt-units", "Alternative units", false);
  if (alternativeUnitsIssue) errors.push(alternativeUnitsIssue);
  if (draft.best_alternative_offered && !draft.alternative_equipment.trim() && numberFromInput(draft.alternative_units) === null) {
    errors.push(validationIssue("bid-alt-equipment", "Best alternative needs equipment or a positive unit count."));
  }

  const pickupEta = validDateTimeValue(draft.eta_pickup);
  const deliveryEta = validDateTimeValue(draft.eta_delivery);
  if (draft.eta_pickup && !pickupEta) errors.push(validationIssue("bid-eta-pickup", "Pickup ETA must be a valid date and time."));
  if (draft.eta_delivery && !deliveryEta) errors.push(validationIssue("bid-eta-delivery", "Delivery ETA must be a valid date and time."));
  if (draft.equipment_available === "true") {
    if (!pickupEta) errors.push(validationIssue("bid-eta-pickup", "Pickup ETA is required when equipment is available."));
    if (!deliveryEta) errors.push(validationIssue("bid-eta-delivery", "Delivery ETA is required when equipment is available."));
    if (!draft.unit_details.trim()) errors.push(validationIssue("bid-unit-details", "Unit, trailer, driver or mirror details are required when equipment is available."));
  }
  if (pickupEta && deliveryEta && deliveryEta.getTime() <= pickupEta.getTime()) {
    errors.push(validationIssue("bid-eta-delivery", "Delivery ETA must be after pickup ETA."));
  }

  const warnings = [];
  if (draft.best_alternative_offered && !draft.alternative_notes.trim()) {
    warnings.push("Alternative notes help procurement understand assumptions and restrictions.");
  }
  if (draft.equipment_available !== "true") {
    warnings.push("Declaring available equipment and ETAs improves award scoring.");
  }
  return { errors, warnings };
}

function bidDraftWarnings(draft) {
  const validation = validateBidDraft(draft);
  return [...validation.errors.map((issue) => issue.message), ...validation.warnings];
}

function focusBidValidationField(field) {
  const input = card.querySelector(`#${field}`);
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => input.focus(), 200);
}

function clearBidValidationState() {
  card.querySelectorAll("#bid-form [aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
}

function bidReviewSummaryHtml(draft) {
  const validation = validateBidDraft(draft);
  const warnings = [...validation.errors.map((issue) => issue.message), ...validation.warnings];
  const alternative = draft.best_alternative_offered
    ? [draft.alternative_equipment, draft.alternative_units ? `${draft.alternative_units} unit(s)` : null].filter(Boolean).join(" / ") || "Alternative declared"
    : "No alternative";
  const availability = draft.equipment_available === "true"
    ? ["Available", draft.eta_pickup ? `Pickup ${draft.eta_pickup.replace("T", " ")}` : null, draft.eta_delivery ? `Delivery ${draft.eta_delivery.replace("T", " ")}` : null].filter(Boolean).join(" | ")
    : draft.equipment_available === "false"
      ? "Not available"
      : "Not declared";
  return `
    <div class="bid-review-summary-grid">
      <article><span>Primary offer</span><strong>${escapeHtml(formatMoney(draft.bid_rate, draft.currency))}</strong><small>${escapeHtml(draft.weekly_capacity || "-")} / wk | ${escapeHtml(draft.transit_days || "-")} day(s)</small></article>
      <article><span>Commercial model</span><strong>${escapeHtml(commercialModelLabel(draft.commercial_model))}</strong><small>${escapeHtml(commercialPercentSummary(draft))}</small></article>
      <article><span>Alternative</span><strong>${escapeHtml(alternative)}</strong><small>${escapeHtml(draft.alternative_notes || "No alternative notes")}</small></article>
      <article><span>Capacity</span><strong>${escapeHtml(availability)}</strong><small>${escapeHtml(draft.mirror_account_enabled ? "Mirror account requested" : draft.unit_details || "No unit details")}</small></article>
    </div>
    <div class="bid-review-warnings" data-tone="${validation.errors.length ? "danger" : warnings.length ? "warning" : "success"}">
      ${warnings.length
        ? warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")
        : "<span>Ready to submit. Procurement will see the full commercial and capacity context.</span>"}
    </div>
  `;
}

function updateBidReviewSummary() {
  const summary = card.querySelector("#bid-review-summary");
  if (!summary) return;
  summary.innerHTML = bidReviewSummaryHtml(collectBidDraft());
}

function syncCommercialStructureFields({ clearInapplicable = false } = {}) {
  const model = card.querySelector("#bid-commercial-model")?.value || "direct_cost_plus";
  const config = commercialStructureConfig(model);
  const marksmanGroup = card.querySelector("[data-commercial-field='marksman']");
  const carrierGroup = card.querySelector("[data-commercial-field='carrier']");
  const marksmanInput = card.querySelector("#bid-marksman-margin");
  const carrierInput = card.querySelector("#bid-carrier-share");
  const helper = card.querySelector("#bid-commercial-helper");
  const activePercent = card.querySelector("#bid-commercial-active-percent");

  marksmanGroup?.classList.toggle("hidden", config.percentageField !== "marksman");
  carrierGroup?.classList.toggle("hidden", config.percentageField !== "carrier");
  if (marksmanInput) marksmanInput.disabled = config.percentageField !== "marksman";
  if (carrierInput) carrierInput.disabled = config.percentageField !== "carrier";
  if (clearInapplicable) {
    if (config.percentageField !== "marksman" && marksmanInput) marksmanInput.value = "";
    if (config.percentageField !== "carrier" && carrierInput) carrierInput.value = "";
  }
  if (helper) {
    helper.innerHTML = `
      <strong>${escapeHtml(config.tone)}</strong>
      <span>${escapeHtml(config.copy)}</span>
      <button type="button" class="tooltip-icon" aria-label="${escapeHtml(config.percentageTooltip)}" title="${escapeHtml(config.percentageTooltip)}">?</button>
    `;
  }
  if (activePercent) {
    activePercent.textContent = config.percentageField === "none" ? "No percentage required" : config.percentageLabel;
  }
}

function signalTone(signal = "") {
  const value = signal.toLowerCase();
  if (value.includes("leading")) return "success";
  if (value.includes("competitive") || value.includes("active")) return "neutral";
  if (value.includes("review")) return "warning";
  return "muted";
}

function renderLiveBoard(liveBoard = {}) {
  const board = card.querySelector("#bid-live-board");
  if (!board) return;
  const rows = Array.isArray(liveBoard.rows) ? liveBoard.rows : [];
  const signal = liveBoard.marketplace_signal || liveBoard.position_signal || "Awaiting first offer";
  const visibility = liveBoard.visibility || {};
  if (!rows.length) {
    board.innerHTML = `
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Live bid room</p>
          <h3>No submitted offers yet</h3>
        </div>
        <span class="status-pill muted">Auto refresh</span>
      </div>
      <div class="bid-room-empty">
        <strong>Submit your all-in offer to start the lane auction.</strong>
        <span>${escapeHtml(visibilityCopy(visibility))}</span>
      </div>
    `;
    return;
  }
  const currentScore = Number(liveBoard.current_score);
  const currentScoreText = Number.isFinite(currentScore) ? `${currentScore}/100` : "-";
  const currentScoreTone = marketplaceScoreTone(liveBoard.current_score_bucket);

  board.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Live bid room</p>
        <h3>${escapeHtml(liveBoard.current_rank ? `Your rank: #${liveBoard.current_rank}` : signal)}</h3>
      </div>
      <span class="status-pill" data-tone="${signalTone(signal)}">${escapeHtml(signal)}</span>
    </div>
    <div class="bid-board-stats">
      <article>
        <span>Visibility</span>
        <strong>${escapeHtml(visibilityLabel(visibility))}</strong>
        <small>${escapeHtml(visibilityCopy(visibility))}</small>
      </article>
      <article>
        <span>Your score</span>
        <strong><span class="marketplace-score-pill" data-tone="${escapeHtml(currentScoreTone)}">${escapeHtml(currentScoreText)}</span></strong>
        <small>${escapeHtml(marketplaceBucketLabel(liveBoard.current_score_bucket))}</small>
      </article>
      <article>
        <span>Your position</span>
        <strong>${liveBoard.current_rank ? `#${escapeHtml(liveBoard.current_rank)}` : "-"}</strong>
        <small>${escapeHtml(liveBoard.guidance || "Submit a bid to see your rank.")}</small>
      </article>
      <article>
        <span>Bid activity</span>
        <strong>${escapeHtml(liveBoard.bid_count || rows.length)}</strong>
        <small>Last refresh ${escapeHtml(new Date(liveBoard.updated_at || Date.now()).toLocaleTimeString())}</small>
      </article>
    </div>
    <div class="table-wrap">
      <table class="bid-live-table">
        <thead><tr><th>Rank</th><th>Bidder</th><th>Score</th><th>Rate visibility</th><th>Commercial</th><th>Market signals</th><th>Capacity</th><th>Transit</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.is_current ? "is-current" : ""}">
              <td>#${escapeHtml(row.rank)}</td>
              <td>${escapeHtml(row.bidder)}</td>
              <td>${marketplaceScoreHtml(row)}</td>
              <td>${row.amount !== null && row.amount !== undefined ? formatMoney(row.amount, row.currency) : `<span class="masked-rate">${escapeHtml(row.amount_display || "Hidden")}</span>`}</td>
              <td>${escapeHtml(commercialSummary(row))}</td>
              <td>${marketplaceBadgesHtml(row)}</td>
              <td>${escapeHtml(row.weekly_capacity ?? "-")}</td>
              <td>${escapeHtml(row.transit_days ?? "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="bid-board-note">Marketplace rank combines price, capacity, transit, pickup ETA, availability validation, commercial model and alternative offers. ${escapeHtml(visibilityCopy(visibility))}</p>
  `;
}

function bidHistoryMetadata(row = {}) {
  if (row.metadata && typeof row.metadata === "object") return row.metadata;
  if (typeof row.metadata === "string") {
    try {
      return JSON.parse(row.metadata);
    } catch (_error) {
      return {};
    }
  }
  return {};
}

function bidRevisionLabel(row = {}) {
  const metadata = bidHistoryMetadata(row);
  const value = String(metadata.revision_type || "").toLowerCase();
  if (metadata.best_final || value === "best_final") return "Best and final";
  if (value === "revision") return "Revision";
  if (value === "initial") return "Initial quote";
  return row.subject || "Quote update";
}

function bidRevisionTone(row = {}) {
  const label = bidRevisionLabel(row).toLowerCase();
  if (label.includes("best")) return "success";
  if (label.includes("revision")) return "warning";
  return "neutral";
}

function bidHistoryDeltaHtml(metadata = {}) {
  const before = metadata.before || {};
  const after = metadata.after || {};
  const deltas = [
    before.bid_rate !== after.bid_rate && after.bid_rate !== undefined
      ? `Rate ${formatMoney(after.bid_rate, after.currency || before.currency)}`
      : null,
    before.weekly_capacity !== after.weekly_capacity && after.weekly_capacity !== undefined
      ? `Capacity ${after.weekly_capacity ?? "-"} / wk`
      : null,
    before.transit_days !== after.transit_days && after.transit_days !== undefined
      ? `Transit ${after.transit_days ?? "-"} day(s)`
      : null,
    before.commercial_model !== after.commercial_model && after.commercial_model
      ? commercialModelLabel(after.commercial_model)
      : null,
    before.equipment_available !== after.equipment_available && after.equipment_available !== undefined
      ? `Equipment ${after.equipment_available ? "available" : "not available"}`
      : null
  ].filter(Boolean);
  return deltas.length
    ? deltas.map((delta) => `<span>${escapeHtml(delta)}</span>`).join("")
    : "<span>No field-level delta captured</span>";
}

function renderBidHistory(rows = []) {
  const panel = card.querySelector("#carrier-bid-history");
  if (!panel) return;
  const historyRows = Array.isArray(rows) ? rows : [];
  panel.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Offer history</p>
        <h3>Bid revisions and best-and-final trail</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(historyRows.length)} update(s)</span>
    </div>
    ${historyRows.length ? `
      <div class="carrier-bid-history-list">
        ${historyRows.slice(0, 8).map((row) => {
          const metadata = bidHistoryMetadata(row);
          const after = metadata.after || {};
          return `
            <article>
              <div class="carrier-bid-history-dot" data-tone="${escapeHtml(bidRevisionTone(row))}"></div>
              <div>
                <header>
                  <strong>${escapeHtml(bidRevisionLabel(row))}</strong>
                  <span>${escapeHtml(formatDateTime(row.occurred_at || row.created_at))}</span>
                </header>
                <p>${escapeHtml(row.body_preview || row.subject || "Carrier offer update")}</p>
                <div class="carrier-bid-history-deltas">${bidHistoryDeltaHtml(metadata)}</div>
                ${after.responded_at ? `<small>Submitted ${escapeHtml(formatDateTime(after.responded_at))}</small>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    ` : `
      <div class="bid-room-empty">
        <strong>No bid revisions yet.</strong>
        <span>Your submitted offers and best-and-final changes will appear here.</span>
      </div>
    `}
  `;
}

function carrierChatLabel(threadType = "") {
  const labels = {
    event_group: "Event group"
  };
  return labels[threadType] || "Event group";
}

function renderCarrierChat(chat = lastCarrierChat) {
  lastCarrierChat = chat || { rows: [], google_chat_configured: false };
  const panel = card.querySelector("#carrier-bid-chat");
  if (!panel) return;
  const rows = (Array.isArray(lastCarrierChat.rows) ? lastCarrierChat.rows : []).filter((thread) => (thread.thread_type || "event_group") === "event_group");
  const inboundStatus = lastCarrierChat.google_chat_inbound?.status || "";
  const chatSyncLabel = inboundStatus === "needs_reconnect"
    ? "Reconnect Google Chat"
    : lastCarrierChat.google_chat_configured
      ? "Google Chat linked"
      : "Rateware chat";
  const chatSyncTone = inboundStatus === "needs_reconnect"
    ? "warning"
    : lastCarrierChat.google_chat_configured
      ? "success"
      : "muted";
  panel.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Bid Room Chat</p>
        <h3>Event group discussion</h3>
      </div>
      <span class="status-pill ${chatSyncTone}">${escapeHtml(chatSyncLabel)}</span>
    </div>
    ${inboundStatus === "needs_reconnect" ? `<p class="status-message warning">Google Chat can send outbound mirror messages, but Settings must be reconnected once before Rateware can import replies typed in Google Chat.</p>` : ""}
    <p class="bid-room-chat-scope-note">One shared event thread keeps questions, clarifications, and live capacity updates in the same place.</p>
    <div class="carrier-chat-thread-list">
      ${rows.length ? rows.map((thread) => {
        const messages = Array.isArray(thread.messages) ? thread.messages : [];
        return `
          <article class="bid-room-chat-thread">
            <header>
              <div>
                <strong>${escapeHtml(thread.title || carrierChatLabel(thread.thread_type))}</strong>
                <span>${escapeHtml(carrierChatLabel(thread.thread_type))}</span>
              </div>
              <small>${messages.length} message(s)</small>
            </header>
            <div class="bid-room-chat-messages">
              ${messages.slice(-8).map((message) => `
                <div class="bid-room-chat-message" data-role="${escapeHtml(message.sender_role || "carrier")}">
                  <b>${escapeHtml(message.sender_name || message.sender_email || message.sender_role || "User")}</b>
                  <p>${escapeHtml(message.body)}</p>
                  <span>${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString() : "")}</span>
                </div>
              `).join("")}
            </div>
          </article>
        `;
      }).join("") : `
        <div class="bid-room-empty">
          <strong>No chat messages yet.</strong>
          <span>Send the first event group message to procurement.</span>
        </div>
      `}
    </div>
    <form id="carrier-chat-form" class="bid-room-chat-form">
      <input id="carrier-chat-scope" type="hidden" value="event_group" />
      <textarea id="carrier-chat-message" rows="2" placeholder="Write an event group message..."></textarea>
      <button type="submit">Send</button>
    </form>
    <p id="carrier-chat-status" class="status-message" role="status"></p>
  `;
}

async function loadCarrierChat(options = {}) {
  try {
    const chat = await callBidApi("list_bid_room_chat");
    renderCarrierChat(chat);
    if (!options.suppressAlert) detectPrivateChatSignals(chat);
  } catch (_error) {
    renderCarrierChat({ rows: [], google_chat_configured: false });
  }
}

function laneLabel(row = {}) {
  return `${row.origin || "-"} -> ${row.destination || "-"}`;
}

function marketLabel(lane = {}) {
  return [lane.origin_market, lane.destination_market].filter(Boolean).join(" -> ") || "-";
}

function eventLabel(row = {}) {
  return [row.rfx_id, row.name].filter(Boolean).join(" | ") || "-";
}

function fitTags(row = {}) {
  const tags = Array.isArray(row.fit_tags) ? row.fit_tags : [];
  if (tags.length) return tags;
  const lane = row.lane || {};
  return [lane.equipment, lane.trailer, lane.operation, lane.service, lane.origin_market, lane.destination_market].filter(Boolean).slice(0, 5);
}

function bookStatus(row = {}) {
  return row.award_status || row.business_status || (row.is_invited ? row.participation_status : "open");
}

function allBookRows(carrierBook = {}) {
  const invited = Array.isArray(carrierBook.invited) ? carrierBook.invited : [];
  const openNotInvited = Array.isArray(carrierBook.open_not_invited) ? carrierBook.open_not_invited : [];
  return [...invited, ...openNotInvited];
}

function filteredBookRows(carrierBook = {}) {
  const term = bookFilters.query.trim().toLowerCase();
  return allBookRows(carrierBook).filter((row) => {
    const status = bookStatus(row);
    const lane = row.lane || {};
    const event = row.event || {};
    const viewMatches = bookFilters.view === "all"
      || (bookFilters.view === "invited" && row.is_invited && !["quoted", "awarded", "backup", "not_awarded"].includes(status))
      || (bookFilters.view === "open" && !row.is_invited)
      || (bookFilters.view === "quoted" && status === "quoted")
      || (bookFilters.view === "awarded" && status === "awarded")
      || (bookFilters.view === "backup" && status === "backup")
      || (bookFilters.view === "not_awarded" && status === "not_awarded");
    if (!viewMatches) return false;
    if (!term) return true;
    return [
      eventLabel(event),
      laneLabel(lane),
      marketLabel(lane),
      lane.equipment,
      lane.trailer,
      lane.config,
      lane.operation,
      lane.service,
      status,
      ...fitTags(row)
    ].filter(Boolean).join(" ").toLowerCase().includes(term);
  });
}

function renderBookRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="8">No opportunities match this view.</td></tr>`;
  }
  return rows.map((row) => {
    const lane = row.lane || {};
    const event = row.event || {};
    const amount = row.bid_rate !== null && row.bid_rate !== undefined ? formatMoney(row.bid_rate, row.currency || lane.currency) : "-";
    const action = row.is_invited
      ? `<a class="secondary small-button" href="./rfx-bid.html?token=${encodeURIComponent(row.invitation_token || "")}">Open bid</a>`
      : `<button class="secondary small-button" type="button" data-request-lane="${escapeHtml(lane.id || "")}">Request invite</button>`;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(event.rfx_id || event.name || "-")}</strong>
          <small>${escapeHtml(event.customer || "")}${event.due_date ? ` | Due ${escapeHtml(formatDate(event.due_date))}` : ""}</small>
        </td>
        <td>
          ${escapeHtml(laneLabel(lane))}
          <small>${escapeHtml(marketLabel(lane))}</small>
        </td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</td>
        <td>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</td>
        <td>
          <div class="book-fit-tags">
            ${fitTags(row).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>No fit tags</span>"}
          </div>
        </td>
        <td><span class="status-pill ${statusTone(bookStatus(row))}">${escapeHtml(statusLabel(bookStatus(row)))}</span></td>
        <td>
          ${amount}
          <small>${row.weekly_capacity ? `${escapeHtml(row.weekly_capacity)} / wk` : ""}</small>
          <small>${escapeHtml(commercialSummary(row))}</small>
        </td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");
}

function awardNextSteps(status, liveOutcome = {}) {
  if (status === "awarded") {
    return [
      "Confirm capacity and ETA if anything changes.",
      liveOutcome.rateware_closeout_at ? "Rateware closeout is complete for this lane." : "Procurement is finalizing Rateware closeout.",
      "Watch Bid Room Chat for execution, onboarding, or document follow-up."
    ];
  }
  if (status === "backup") {
    return [
      "Keep equipment availability current while procurement confirms primary capacity.",
      "Use Bid Room Chat to update any ETA or capacity changes.",
      "Your offer remains visible as backup for this lane."
    ];
  }
  if (status === "not_awarded") {
    return [
      "Review the business book for other open or invited lanes.",
      "Keep your commercial profile and capacity current for future events.",
      "Procurement may still use your quote as market intelligence for later awards."
    ];
  }
  return [
    "Procurement is still closing the event.",
    "Keep your offer and capacity assumptions current until the final closeout.",
    "Use Bid Room Chat for questions or updates."
  ];
}

function carrierAwardRows(carrierBook = {}) {
  const rows = [
    ...(Array.isArray(carrierBook.invited) ? carrierBook.invited : []),
    ...(Array.isArray(carrierBook.quoted) ? carrierBook.quoted : [])
  ];
  const seen = new Set();
  return rows
    .filter((row) => ["awarded", "backup", "not_awarded"].includes(String(bookStatus(row) || "").toLowerCase()))
    .filter((row) => {
      const id = row.invitation_id || row.lane?.id || `${row.event?.id}-${row.lane?.lane_number}-${bookStatus(row)}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function renderCarrierAwardTimeline(carrierBook = {}) {
  const rows = carrierAwardRows(carrierBook).slice(0, 6);
  if (!rows.length) return '<div class="carrier-award-timeline empty">No lane-level closeout results loaded yet.</div>';
  return `
    <div class="carrier-award-timeline">
      ${rows.map((row) => {
        const status = bookStatus(row);
        return `
          <article>
            <span class="status-pill ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
            <strong>${escapeHtml(laneLabel(row.lane || {}))}</strong>
            <small>${escapeHtml([row.event?.rfx_id || row.event?.name, row.bid_rate ? formatMoney(row.bid_rate, row.currency) : null].filter(Boolean).join(" | "))}</small>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderCarrierBook(carrierBook = {}) {
  const book = card.querySelector("#carrier-business-book");
  if (!book) return;
  lastCarrierBook = carrierBook;
  const summary = carrierBook.summary || {};
  const carrier = carrierBook.carrier || {};
  const rows = filteredBookRows(carrierBook);
  const filterButtons = [
    ["all", "All"],
    ["invited", "Invited"],
    ["open", "Open book"],
    ["quoted", "Quoted"],
    ["awarded", "Awarded"],
    ["backup", "Backup"],
    ["not_awarded", "Not awarded"]
  ];
  book.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Private business book</p>
        <h3>${escapeHtml(carrier.vendor_name || "Carrier portal")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(carrier.domain || carrier.primary_email || "Private access")}</span>
    </div>
    <div class="carrier-book-summary">
      <article><span>Invited lanes</span><strong>${escapeHtml(summary.invited || 0)}</strong></article>
      <article><span>Open book</span><strong>${escapeHtml(summary.not_invited_open || 0)}</strong></article>
      <article><span>Submitted bids</span><strong>${escapeHtml(summary.quoted || 0)}</strong></article>
      <article><span>Awarded</span><strong>${escapeHtml(summary.awarded || 0)}</strong></article>
      <article><span>Backup</span><strong>${escapeHtml(summary.backup || 0)}</strong></article>
      <article><span>Not awarded</span><strong>${escapeHtml(summary.not_awarded || 0)}</strong></article>
    </div>
    <div class="bid-book-toolbar">
      <div class="segmented-control">
        ${filterButtons.map(([value, label]) => `<button class="${bookFilters.view === value ? "is-active" : ""}" type="button" data-book-filter="${value}">${label}</button>`).join("")}
      </div>
      <input data-book-search type="search" value="${escapeHtml(bookFilters.query)}" placeholder="Search lane, market, equipment, RFx..." />
    </div>
    <div class="table-wrap">
      <table class="carrier-book-table">
        <thead><tr><th>RFx</th><th>Lane</th><th>Equipment</th><th>Service</th><th>Fit</th><th>Status</th><th>Your bid</th><th>Action</th></tr></thead>
        <tbody>${renderBookRows(rows)}</tbody>
      </table>
    </div>
    <p class="bid-board-note">Open book lanes are visible for discovery. You can request access, but you cannot bid until procurement invites you to that lane.</p>
  `;
}

function renderAwardOutcome(invitation = {}, carrierBook = {}, liveBoard = {}) {
  const panel = card.querySelector("#carrier-award-outcome");
  if (!panel) return;
  const event = invitation.rfx_events || {};
  const liveOutcome = liveBoard.award_outcome || {};
  const currentStatus = liveOutcome.status || invitation.award_role && (invitation.award_role === "primary" ? "awarded" : "backup");
  const summary = carrierBook.summary || {};
  const hasOutcome = ["awarded", "backup", "not_awarded"].includes(String(currentStatus || ""))
    || Number(summary.awarded || 0) > 0
    || Number(summary.backup || 0) > 0
    || Number(summary.not_awarded || 0) > 0
    || String(event.status || "").toLowerCase() === "awarded";
  if (!hasOutcome) {
    panel.innerHTML = "";
    panel.hidden = true;
    return;
  }
  const status = ["awarded", "backup", "not_awarded"].includes(String(currentStatus || ""))
    ? currentStatus
    : "pending";
  const reason = liveOutcome.reason || invitation.award_reason || invitation.award_notes || "";
  const copy = status === "awarded"
    ? "This lane is awarded to your team. Procurement may follow up with final onboarding and execution details."
    : status === "backup"
      ? "You are selected as backup capacity. Keep availability current in case the primary award changes."
      : status === "not_awarded"
        ? "This lane was awarded to another carrier. Your bid remains visible for future procurement decisions."
      : "Procurement has started the award closeout. Final lane results are still being confirmed.";
  const steps = awardNextSteps(status, liveOutcome);
  const filterTarget = status === "awarded" || status === "backup" || status === "not_awarded" ? status : "all";
  panel.hidden = false;
  panel.innerHTML = `
    <div class="bid-room-section-heading">
      <div>
        <p class="eyebrow">Award outcome</p>
        <h3>${escapeHtml(statusLabel(status))}</h3>
      </div>
      <span class="status-pill ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
    </div>
    <div class="carrier-award-summary">
      <article>
        <span>Current lane</span>
        <strong>${escapeHtml(statusLabel(status))}</strong>
        <small>${escapeHtml(reason || copy)}</small>
      </article>
      <article>
        <span>Event awards</span>
        <strong>${escapeHtml(summary.awarded || 0)} awarded</strong>
        <small>${escapeHtml(summary.backup || 0)} backup | ${escapeHtml(summary.not_awarded || 0)} not awarded</small>
      </article>
      <article>
        <span>Rateware closeout</span>
        <strong>${escapeHtml(liveOutcome.rateware_closeout_at ? "Created" : status === "awarded" ? "Pending" : "-")}</strong>
        <small>${escapeHtml(liveOutcome.rateware_closeout_at ? new Date(liveOutcome.rateware_closeout_at).toLocaleString() : "Procurement controls final Rateware insert.")}</small>
      </article>
    </div>
    <div class="carrier-award-next">
      <section>
        <span>Next steps</span>
        <ol>
          ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
      </section>
      <section>
        <span>Event closeout</span>
        ${renderCarrierAwardTimeline(carrierBook)}
      </section>
    </div>
    <div class="carrier-award-actions">
      <button class="secondary small-button" type="button" data-carrier-award-filter="${escapeHtml(filterTarget)}">View ${escapeHtml(statusLabel(filterTarget))} lanes</button>
      <button class="secondary small-button" type="button" data-carrier-chat-focus>Open Bid Room Chat</button>
    </div>
    <p class="bid-board-note">${escapeHtml(copy)}</p>
  `;
}

function renderInvitation(invitation, liveBoard = {}) {
  const event = invitation.rfx_events || {};
  const lane = invitation.rfx_lanes || {};
  const vendor = invitation.vendors || {};
  const deadline = deadlineCopy(event);
  title.textContent = event.name || event.rfx_id || "Private Bid Room";
  card.innerHTML = `
    <section class="bid-room-hero">
      <div>
        <p class="eyebrow">Private Bid Room v1</p>
        <h2>${escapeHtml(event.name || event.rfx_id || "Bid request")}</h2>
        <p>${escapeHtml(vendor.vendor_name || vendor.domain || "Carrier")} can review invited lanes, request access to open opportunities, and submit all-in offers.</p>
      </div>
      <aside>
        <span class="status-pill" data-tone="${deadline.tone}">${escapeHtml(deadline.label)}</span>
        <strong>${escapeHtml(event.rfx_id || "RFx")}</strong>
        <small>${escapeHtml(deadline.detail)}</small>
      </aside>
    </section>

    <div class="bid-context">
      <article><span>Customer</span><strong>${escapeHtml(event.customer || "-")}</strong></article>
      <article><span>Carrier</span><strong>${escapeHtml(vendor.vendor_name || vendor.domain || "-")}</strong></article>
      <article><span>Visibility</span><strong>${escapeHtml(visibilityLabel(liveBoard.visibility || {}))}</strong></article>
      <article><span>Refresh</span><strong>30 sec</strong></article>
    </div>

    <section class="private-bid-alert-panel" aria-live="polite">
      <div>
        <p class="eyebrow">Multimedia alerts</p>
        <h3>Ranking, quote and chat movement</h3>
      </div>
      <div class="private-bid-alert-actions">
        <select id="private-bid-language" aria-label="Private Bid Room alert language">
          <option value="en" ${privateAlertState.language === "en" ? "selected" : ""}>English alerts</option>
          <option value="es" ${privateAlertState.language === "es" ? "selected" : ""}>Alertas en espanol</option>
        </select>
        <button id="private-bid-sound" type="button">Enable sound</button>
      </div>
      <div id="private-bid-alerts" class="private-bid-alerts">
        <p>No movement yet. Enable sound to hear ranking, quote, chat, and deadline alerts.</p>
      </div>
    </section>

    <section id="carrier-award-outcome" class="carrier-award-outcome" hidden></section>

    <section class="bid-lane-summary">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Current lane</p>
          <h2>${escapeHtml(formatLane(lane))}</h2>
        </div>
        <span class="status-pill neutral">${escapeHtml(statusLabel(invitation.invitation_status))}</span>
      </div>
      <dl>
        <div><dt>Equipment</dt><dd>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</dd></div>
        <div><dt>Operation</dt><dd>${escapeHtml(lane.operation || "-")}</dd></div>
        <div><dt>Service</dt><dd>${escapeHtml(lane.service || "-")}</dd></div>
        <div><dt>Weekly volume</dt><dd>${escapeHtml(lane.weekly_volume ?? "-")}</dd></div>
      </dl>
      ${laneDetailSections(lane).length ? `
        <div class="bid-lane-detail-sections">
          ${laneDetailSections(lane).map(([label, value]) => `
            <article>
              <span>${escapeHtml(label)}</span>
              <p>${escapeHtml(value)}</p>
            </article>
          `).join("")}
        </div>
      ` : ""}
    </section>

    <section id="bid-live-board" class="bid-live-board">
      <p class="status-message">Loading live bid room...</p>
    </section>

    <section id="carrier-bid-history" class="carrier-bid-history">
      <p class="status-message">Loading offer history...</p>
    </section>

    <section id="carrier-bid-chat" class="carrier-bid-chat">
      <p class="status-message">Loading Bid Room Chat...</p>
    </section>

    <form id="bid-form" class="bid-form">
      <div class="bid-form-header">
        <div>
          <p class="eyebrow">Submit or update offer</p>
          <h3>Guided bid flow</h3>
        </div>
        <span class="status-pill muted">Primary + alternatives</span>
      </div>
      <div class="carrier-bid-workflow full-width" aria-label="Bid steps">
        <button type="button" data-bid-section-target="primary">Submit primary bid</button>
        <button type="button" data-bid-section-target="commercial">Commercial model</button>
        <button type="button" data-bid-section-target="alternative">Add alternative</button>
        <button type="button" data-bid-section-target="capacity">Confirm capacity</button>
        <button type="button" data-bid-section-target="review">Best and final</button>
      </div>
      <section class="guided-bid-section full-width" data-bid-section="primary">
        <div class="bid-form-section-title">
          <strong>Primary offer</strong>
          <span>Your compliant all-in bid for this lane.</span>
        </div>
        <div class="guided-bid-fields">
          <label>
            All-in rate
            <input id="bid-rate" required inputmode="decimal" value="${escapeHtml(invitation.bid_rate ?? "")}" placeholder="2900" />
          </label>
          <label>
            Currency
            <select id="bid-currency">
              ${["USD", "MXN", "CAD"].map((currency) => `<option value="${currency}" ${currency === (invitation.currency || lane.currency || "USD") ? "selected" : ""}>${currency}</option>`).join("")}
            </select>
          </label>
          <label>
            Weekly capacity
            <input id="bid-capacity" inputmode="decimal" value="${escapeHtml(invitation.weekly_capacity ?? "")}" placeholder="5" />
          </label>
          <label>
            Transit days
            <input id="bid-transit-days" inputmode="decimal" value="${escapeHtml(invitation.transit_days ?? "")}" placeholder="2" />
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="commercial">
        <div class="bid-form-section-title">
          <strong>Commercial structure</strong>
          <span id="bid-commercial-active-percent">Suggested margin to share %</span>
        </div>
        <div id="bid-commercial-helper" class="commercial-structure-helper"></div>
        <div class="guided-bid-fields">
          <label>
            Commercial model
            <select id="bid-commercial-model">
              ${[
                ["direct_cost_plus", "Direct carrier / cost-plus"],
                ["carrier_share", "Carrier shares billing %"],
                ["xbf_buy_sell", "XBF buy-sell"]
              ].map(([value, label]) => `<option value="${value}" ${value === (invitation.commercial_model || "direct_cost_plus") ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label data-commercial-field="marksman">
            Suggested margin to share %
            <span class="field-help" title="Recommended MARKSMAN margin over your all-in cost. This is not a carrier invoice share.">?</span>
            <input id="bid-marksman-margin" inputmode="decimal" value="${escapeHtml(invitation.marksman_margin_pct ?? "")}" placeholder="2-5" />
          </label>
          <label data-commercial-field="carrier">
            Carrier invoice share %
            <span class="field-help" title="Percent of customer billing the carrier is willing to share based on the original quote. This does not apply to cost-plus.">?</span>
            <input id="bid-carrier-share" inputmode="decimal" value="${escapeHtml(invitation.carrier_share_pct ?? "")}" placeholder="2-5" />
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="alternative">
        <div class="bid-form-section-title">
          <strong>Best alternative</strong>
          <span>Offer substitute equipment, multiple units, or a different capacity model.</span>
        </div>
        <div class="guided-bid-fields">
          <label class="bid-checkbox-label">
            <input id="bid-alt-enabled" type="checkbox" ${invitation.best_alternative_offered ? "checked" : ""} />
            Best alternative offer
          </label>
          <label>
            Alternative equipment
            <input id="bid-alt-equipment" value="${escapeHtml(invitation.alternative_equipment || "")}" placeholder="2 x 3.5 ton, 4 vans..." />
          </label>
          <label>
            Alternative units
            <input id="bid-alt-units" inputmode="decimal" value="${escapeHtml(invitation.alternative_units ?? "")}" placeholder="2" />
          </label>
          <label class="wide-field">
            Alternative notes
            <textarea id="bid-alt-notes" rows="2" placeholder="Capacity, restrictions, rate assumptions for the alternative...">${escapeHtml(invitation.alternative_notes || "")}</textarea>
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="capacity">
        <div class="bid-form-section-title">
          <strong>Live capacity commitment</strong>
          <span>Confirm availability, unit details, validation and ETAs.</span>
        </div>
        <div class="guided-bid-fields">
          <label>
            Equipment available
            <select id="bid-equipment-available">
              <option value="" ${invitation.equipment_available === null || invitation.equipment_available === undefined ? "selected" : ""}>Not declared</option>
              <option value="true" ${invitation.equipment_available === true ? "selected" : ""}>Available</option>
              <option value="false" ${invitation.equipment_available === false ? "selected" : ""}>Not available</option>
            </select>
          </label>
          <label>
            ETA pickup
            <input id="bid-eta-pickup" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(invitation.eta_pickup))}" />
          </label>
          <label>
            ETA delivery
            <input id="bid-eta-delivery" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(invitation.eta_delivery))}" />
          </label>
          <label class="bid-checkbox-label">
            <input id="bid-mirror-account" type="checkbox" ${invitation.mirror_account_enabled ? "checked" : ""} />
            Mirror account enabled
          </label>
          <label class="wide-field">
            Unit details
            <textarea id="bid-unit-details" rows="2" placeholder="Truck, trailer, driver, plate, tracking or mirror account validation details...">${escapeHtml(invitation.unit_details || "")}</textarea>
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="review">
        <div class="bid-form-section-title">
          <strong>Review and submit</strong>
          <span>This is what procurement will see.</span>
        </div>
        <div id="bid-review-summary" class="bid-review-summary"></div>
        <label class="wide-field">
          Notes
          <textarea id="bid-notes" rows="3" placeholder="Assumptions, validity, accessorials...">${escapeHtml(invitation.notes || "")}</textarea>
        </label>
        <div class="bid-final-actions">
          <label class="bid-checkbox-label">
            <input id="bid-best-final" type="checkbox" />
            Best and final offer
          </label>
          <label class="bid-checkbox-label">
            <input id="bid-confirm-review" type="checkbox" />
            Confirm capacity and commercial terms
          </label>
          <button type="submit">Submit primary bid</button>
        </div>
      </section>
      <p id="bid-submit-status" class="status-message" role="status"></p>
    </form>

    <section id="carrier-business-book" class="carrier-business-book">
      <p class="status-message">Loading private business book...</p>
    </section>
  `;

  card.querySelector("#bid-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = card.querySelector("#bid-submit-status");
    const draft = collectBidDraft();
    const validation = validateBidDraft(draft);
    clearBidValidationState();
    updateBidReviewSummary();
    if (validation.errors.length) {
      const firstError = validation.errors[0];
      status.textContent = firstError.message;
      status.dataset.tone = "error";
      focusBidValidationField(firstError.field);
      return;
    }
    if (!card.querySelector("#bid-confirm-review")?.checked) {
      status.textContent = "Confirm capacity and commercial terms before submitting.";
      status.dataset.tone = "error";
      focusBidValidationField("bid-confirm-review");
      card.querySelector('[data-bid-section="review"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    status.textContent = validation.warnings.length ? "Submitting bid with validation warnings..." : "Submitting bid...";
    status.dataset.tone = "neutral";
    try {
      await callBidApi("submit_bid", draft);
      status.textContent = "Bid submitted with commercial and availability details. Your rank will refresh automatically.";
      status.dataset.tone = "success";
      queuePrivateBidAlert("bidSubmitted", "Your bid was submitted. The live board will refresh your rank automatically.");
      await loadInvitation({ refreshOnly: true });
    } catch (error) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
  });
  renderLiveBoard(liveBoard);
  syncCommercialStructureFields();
  updateBidReviewSummary();
}

async function loadInvitation(options = {}) {
  if (!tokenFromUrl()) {
    card.innerHTML = `<p class="status-message" data-tone="error">Missing invitation token.</p>`;
    return;
  }
  try {
    const data = await callBidApi("get_invitation");
    if (options.refreshOnly && card.querySelector("#bid-form")) {
      renderLiveBoard(data.live_board);
      renderAwardOutcome(data.invitation, data.carrier_book, data.live_board);
      renderBidHistory(data.bid_history);
      renderCarrierBook(data.carrier_book);
    } else {
      renderInvitation(data.invitation, data.live_board);
      renderAwardOutcome(data.invitation, data.carrier_book, data.live_board);
      renderBidHistory(data.bid_history);
      renderCarrierBook(data.carrier_book);
    }
    detectPrivateBidRoomSignals(data);
    await loadCarrierChat();
  } catch (error) {
    if (options.refreshOnly) return;
    title.textContent = "Bid request unavailable";
    card.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

card.addEventListener("click", async (event) => {
  const soundButton = event.target.closest("#private-bid-sound");
  if (soundButton) {
    soundButton.disabled = true;
    soundButton.textContent = "Enabling...";
    try {
      await enablePrivateBidAlerts();
    } catch (_error) {
      privateAlertState.soundEnabled = false;
      soundButton.disabled = false;
      soundButton.textContent = "Enable sound";
    }
    return;
  }

  const bidSectionButton = event.target.closest("[data-bid-section-target]");
  if (bidSectionButton) {
    const target = card.querySelector(`[data-bid-section="${CSS.escape(bidSectionButton.dataset.bidSectionTarget || "")}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
    }
    return;
  }

  const scopeButton = event.target.closest("[data-carrier-chat-scope]");
  if (scopeButton) {
    const select = card.querySelector("#carrier-chat-scope");
    if (select) select.value = "event_group";
    card.querySelector("#carrier-chat-message")?.focus();
    return;
  }

  const filterButton = event.target.closest("[data-book-filter]");
  if (filterButton) {
    bookFilters.view = filterButton.dataset.bookFilter || "all";
    renderCarrierBook(lastCarrierBook || {});
    return;
  }

  const awardFilterButton = event.target.closest("[data-carrier-award-filter]");
  if (awardFilterButton) {
    bookFilters.view = awardFilterButton.dataset.carrierAwardFilter || "all";
    renderCarrierBook(lastCarrierBook || {});
    card.querySelector("#carrier-business-book")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const chatFocusButton = event.target.closest("[data-carrier-chat-focus]");
  if (chatFocusButton) {
    card.querySelector("#carrier-bid-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    card.querySelector("#carrier-chat-message")?.focus({ preventScroll: true });
    return;
  }

  const button = event.target.closest("[data-request-lane]");
  if (!button) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Requesting...";
  try {
    const result = await callBidApi("request_lane_access", { lane_id: button.dataset.requestLane });
    button.textContent = result.requested ? "Requested" : "Already in book";
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    window.alert(error.message);
  }
});

card.addEventListener("submit", async (event) => {
  const chatForm = event.target.closest("#carrier-chat-form");
  if (!chatForm) return;
  event.preventDefault();
  const status = card.querySelector("#carrier-chat-status");
  const message = card.querySelector("#carrier-chat-message");
  const body = String(message?.value || "").trim();
  if (!body) {
    if (status) {
      status.textContent = "Write a message first.";
      status.dataset.tone = "error";
    }
    message?.focus();
    return;
  }
  if (status) {
    status.textContent = "Sending message...";
    status.dataset.tone = "neutral";
  }
  try {
    const result = await callBidApi("post_bid_room_chat_message", {
      thread_type: "event_group",
      body
    });
    if (message) message.value = "";
    if (status) {
      status.textContent = result.google_chat_configured ? "Message sent and mirrored to Google Chat." : "Message sent.";
      status.dataset.tone = "success";
    }
    await loadCarrierChat({ suppressAlert: true });
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
  }
});

card.addEventListener("input", (event) => {
  if (event.target.closest("#bid-form")) {
    clearBidValidationState();
    updateBidReviewSummary();
  }

  const search = event.target.closest("[data-book-search]");
  if (!search) return;
  bookFilters.query = search.value;
  if (bookSearchTimer) window.clearTimeout(bookSearchTimer);
  bookSearchTimer = window.setTimeout(() => {
    renderCarrierBook(lastCarrierBook || {});
    const nextSearch = card.querySelector("[data-book-search]");
    nextSearch?.focus();
    nextSearch?.setSelectionRange(bookFilters.query.length, bookFilters.query.length);
  }, 180);
});

card.addEventListener("change", (event) => {
  const privateLanguage = event.target.closest("#private-bid-language");
  if (privateLanguage) {
    privateAlertState.language = privateLanguage.value || "en";
    localStorage.setItem("rateware.privateBidRoom.language", privateAlertState.language);
    renderPrivateBidAlerts();
    return;
  }

  if (event.target.closest("#bid-form")) {
    if (event.target.closest("#bid-commercial-model")) {
      syncCommercialStructureFields({ clearInapplicable: true });
    }
    clearBidValidationState();
    updateBidReviewSummary();
  }
});

loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
