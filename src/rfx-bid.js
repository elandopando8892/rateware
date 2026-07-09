import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");

let boardRefreshTimer = null;
let bookSearchTimer = null;
let lastCarrierBook = null;
let lastCarrierChat = { rows: [], google_chat_configured: false };
let lastInvitation = null;
let lastLiveBoard = {};
let lastQuickBidSaveStatus = null;
let lastBidSupportQuestion = "";
let lastBidSupportResult = null;
let pendingBidTemplateRows = [];
const PUBLIC_BOARD_VERIFIED_INVITES_KEY = "rateware.publicBidBoard.verifiedInvitations";
const PUBLIC_BOARD_INVITE_EMAIL_KEY = "rateware.publicBidBoard.inviteEmail";
const PUBLIC_BOARD_INVITE_LANES_KEY = "rateware.publicBidBoard.invitedLaneIds";
const PUBLIC_BOARD_INVITE_EVENTS_KEY = "rateware.publicBidBoard.invitedEventIds";
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
    closing: "Deadline closing soon.",
    supportAnswer: "Bid assistant answered.",
    supportTicket: "Support ticket created."
  },
  es: {
    enabled: "Alertas del Bid Room privado activadas.",
    quote: "Cotizacion disponible.",
    displaced: "Necesitas pujar de nuevo. Has sido superado.",
    leading: "Vas liderando.",
    chat: "Nuevo mensaje en el chat del Bid Room.",
    bidSubmitted: "Oferta enviada.",
    closing: "La oportunidad esta por cerrar.",
    supportAnswer: "El asistente respondio.",
    supportTicket: "Ticket de soporte creado."
  }
};
const privateAlertState = {
  language: localStorage.getItem("rateware.privateBidRoom.language") || "en",
  soundEnabled: localStorage.getItem("rateware.privateBidRoom.sound") !== "off",
  audioContext: null,
  alerts: [],
  loaded: false,
  chatLoaded: false,
  previousSnapshot: null,
  previousChatSnapshot: null
};
const PRIVATE_BID_SOUND_DEFAULT_VERSION = "2026-07-08-sound-on";
if (localStorage.getItem("rateware.privateBidRoom.soundDefault") !== PRIVATE_BID_SOUND_DEFAULT_VERSION) {
  localStorage.setItem("rateware.privateBidRoom.sound", "on");
  localStorage.setItem("rateware.privateBidRoom.soundDefault", PRIVATE_BID_SOUND_DEFAULT_VERSION);
  privateAlertState.soundEnabled = true;
}
let excelJsModule = null;
const BID_PORTAL_COPY = {
  en: {
    privateCarrierAccess: "Private carrier access",
    languageLabel: "English",
    otherLanguageLabel: "Espanol",
    languageToggle: "Language",
    privateRoom: "Private Bid Room v1",
    requestFallback: "Bid request",
    carrierCanReview: "{carrier} can review {lane_count}, request access to open opportunities, and submit all-in offers.",
    invitedLanes: "{count} invited lanes",
    selectedLane: "the selected lane",
    customer: "Customer",
    carrier: "Carrier",
    visibility: "Visibility",
    refresh: "Refresh",
    multimediaAlerts: "Multimedia alerts",
    rankingMovement: "Ranking, quote and chat movement",
    enableSound: "Enable sound",
    soundOn: "Sound on",
    soundOff: "Sound off",
    noMovement: "No movement yet. Enable sound to hear ranking, quote, chat, and deadline alerts.",
    noMovementSoundOn: "No movement yet. Sound is on for ranking, quote, chat, and deadline alerts.",
    noMovementSoundOff: "No movement yet. Sound is off. Turn it on to hear ranking, quote, chat, and deadline alerts.",
    xlsxEyebrow: "XLSX bid template",
    xlsxTitle: "Quote multiple invited lanes in Excel",
    xlsxCopy: "Download the prefilled bid workbook, edit only the offer columns, upload it here, then confirm after validation.",
    downloadXlsx: "Download XLSX template",
    uploadXlsx: "Upload completed XLSX",
    confirmXlsx: "Confirm and submit XLSX bids",
    uploadXlsxStatus: "Upload the completed XLSX to validate it before submitting.",
    selectedRows: "{count} selected",
    errorRows: "{count} with errors",
    skippedRows: "{count} skipped",
    fixRequired: "Fix required",
    ready: "Ready",
    skipped: "Skipped",
    currentLane: "Current lane",
    selectedLaneFromBook: "Selected lane from book",
    equipment: "Equipment",
    operation: "Operation",
    service: "Service",
    weeklyVolume: "Weekly volume",
    loadingLiveRoom: "Loading live bid room...",
    loadingHistory: "Loading offer history...",
    loadingChat: "Loading Bid Room Chat...",
    submitOrUpdate: "Submit or update offer",
    updateOffer: "Update published offer",
    editSubmittedOffer: "Edit price / capacity",
    editingSubmittedOffer: "Editing your submitted offer",
    guidedBidFlow: "Guided bid flow",
    primaryAlt: "Primary + alternatives",
    submitPrimary: "Submit primary bid",
    commercialModel: "Commercial model",
    addAlternative: "Add alternative",
    confirmCapacity: "Confirm capacity",
    bestFinal: "Best and final",
    primaryOffer: "Primary offer",
    primaryOfferCopy: "Your compliant all-in bid for this lane.",
    allInRate: "All-in rate",
    currency: "Currency",
    weeklyCapacity: "Weekly capacity",
    transitDays: "Transit days",
    commercialStructure: "Commercial structure",
    suggestedMargin: "Suggested margin to share %",
    carrierShare: "Carrier invoice share %",
    bestAlternative: "Best alternative",
    bestAlternativeOffer: "Best alternative offer",
    alternativeEquipment: "Alternative equipment",
    alternativeUnits: "Alternative units",
    alternativeNotes: "Alternative notes",
    liveCapacity: "Live capacity commitment",
    liveCapacityCopy: "Confirm availability, unit details, validation and ETAs.",
    equipmentAvailable: "Equipment available",
    notDeclared: "Not declared",
    available: "Available",
    notAvailable: "Not available",
    etaPickup: "ETA pickup",
    etaDelivery: "ETA delivery",
    mirrorAccount: "Mirror account enabled",
    unitDetails: "Unit details",
    reviewSubmit: "Review and submit",
    reviewCopy: "This is what procurement will see.",
    notes: "Notes",
    confirmTerms: "Confirm capacity and commercial terms",
    logisticsModel: "Logistics model",
    operationCriteria: "Operation criteria",
    businessRules: "Business rules",
    serviceSpecifications: "Service specifications",
    otherNotes: "Other notes",
    talkToUs: "Talk to us",
    chatSupport: "Chat Support",
    goMarketplace: "Go to Marketplace",
    publicLiveBoard: "Go to Marketplace",
    publicLiveBoardHelp: "Open the real-time marketplace screen for this bid room."
  },
  es: {
    privateCarrierAccess: "Acceso privado para carrier",
    languageLabel: "Espanol",
    otherLanguageLabel: "English",
    languageToggle: "Idioma",
    privateRoom: "Bid Room privado v1",
    requestFallback: "Solicitud de cotizacion",
    carrierCanReview: "{carrier} puede revisar {lane_count}, solicitar acceso a oportunidades abiertas y enviar tarifas all-in.",
    invitedLanes: "{count} lanes invitadas",
    selectedLane: "la lane seleccionada",
    customer: "Cliente",
    carrier: "Carrier",
    visibility: "Visibilidad",
    refresh: "Actualizacion",
    multimediaAlerts: "Alertas multimedia",
    rankingMovement: "Movimiento de ranking, cotizaciones y chat",
    enableSound: "Activar sonido",
    soundOn: "Sonido activo",
    soundOff: "Sonido apagado",
    noMovement: "Sin movimiento todavia. Activa sonido para escuchar ranking, cotizaciones, chat y vencimientos.",
    noMovementSoundOn: "Sin movimiento todavia. El sonido esta activo para ranking, cotizaciones, chat y vencimientos.",
    noMovementSoundOff: "Sin movimiento todavia. El sonido esta apagado. Activalo para escuchar ranking, cotizaciones, chat y vencimientos.",
    xlsxEyebrow: "Template XLSX de puja",
    xlsxTitle: "Cotiza varias lanes invitadas en Excel",
    xlsxCopy: "Descarga el libro prellenado, edita solo las columnas de oferta, subelo aqui y confirma despues de la validacion.",
    downloadXlsx: "Descargar template XLSX",
    uploadXlsx: "Subir XLSX completado",
    confirmXlsx: "Confirmar y enviar pujas XLSX",
    uploadXlsxStatus: "Sube el XLSX completado para validarlo antes de enviar.",
    selectedRows: "{count} seleccionadas",
    errorRows: "{count} con errores",
    skippedRows: "{count} omitidas",
    fixRequired: "Requiere correccion",
    ready: "Listo",
    skipped: "Omitido",
    currentLane: "Lane actual",
    selectedLaneFromBook: "Lane seleccionada del libro",
    equipment: "Equipo",
    operation: "Operacion",
    service: "Servicio",
    weeklyVolume: "Volumen semanal",
    loadingLiveRoom: "Cargando Bid Room en vivo...",
    loadingHistory: "Cargando historial de ofertas...",
    loadingChat: "Cargando chat del Bid Room...",
    submitOrUpdate: "Enviar o actualizar oferta",
    updateOffer: "Actualizar oferta publicada",
    editSubmittedOffer: "Editar tarifa / capacidad",
    editingSubmittedOffer: "Editando tu oferta enviada",
    guidedBidFlow: "Flujo guiado de puja",
    primaryAlt: "Primaria + alternativas",
    submitPrimary: "Enviar puja primaria",
    commercialModel: "Modelo comercial",
    addAlternative: "Agregar alternativa",
    confirmCapacity: "Confirmar capacidad",
    bestFinal: "Mejor y final",
    primaryOffer: "Oferta primaria",
    primaryOfferCopy: "Tu oferta all-in compliant para esta lane.",
    allInRate: "Tarifa all-in",
    currency: "Moneda",
    weeklyCapacity: "Capacidad semanal",
    transitDays: "Dias de transito",
    commercialStructure: "Estructura comercial",
    suggestedMargin: "Margen sugerido a compartir %",
    carrierShare: "Carrier invoice share %",
    bestAlternative: "Mejor alternativa",
    bestAlternativeOffer: "Oferta alternativa",
    alternativeEquipment: "Equipo alternativo",
    alternativeUnits: "Unidades alternativas",
    alternativeNotes: "Notas de alternativa",
    liveCapacity: "Compromiso de capacidad en vivo",
    liveCapacityCopy: "Confirma disponibilidad, datos de unidad, validacion y ETAs.",
    equipmentAvailable: "Equipo disponible",
    notDeclared: "No declarado",
    available: "Disponible",
    notAvailable: "No disponible",
    etaPickup: "ETA pickup",
    etaDelivery: "ETA delivery",
    mirrorAccount: "Cuenta espejo habilitada",
    unitDetails: "Datos de unidad",
    reviewSubmit: "Revisar y enviar",
    reviewCopy: "Esto es lo que procurement va a ver.",
    notes: "Notas",
    confirmTerms: "Confirmar capacidad y terminos comerciales",
    logisticsModel: "Modelo logistico",
    operationCriteria: "Criterios de operacion",
    businessRules: "Reglas de negocio",
    serviceSpecifications: "Especificaciones de servicio",
    otherNotes: "Otras notas",
    talkToUs: "Hablar con nosotros",
    chatSupport: "Soporte",
    goMarketplace: "Ir al Marketplace",
    publicLiveBoard: "Ir al Marketplace",
    publicLiveBoardHelp: "Abrir la pantalla interactiva en tiempo real de este bid room."
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function portalLanguage() {
  return privateAlertState.language === "es" ? "es" : "en";
}

function t(key, params = {}) {
  const dictionary = BID_PORTAL_COPY[portalLanguage()] || BID_PORTAL_COPY.en;
  const fallback = BID_PORTAL_COPY.en[key] || key;
  return String(dictionary[key] || fallback).replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? ""));
}

function dualText(en, es) {
  return portalLanguage() === "es" ? es : en;
}

function syncPortalLanguageChrome() {
  document.documentElement.lang = portalLanguage();
  const eyebrow = document.querySelector("[data-bid-private-eyebrow]");
  if (eyebrow) eyebrow.textContent = t("privateCarrierAccess");
}

async function setPrivateLanguage(language) {
  privateAlertState.language = language === "es" ? "es" : "en";
  localStorage.setItem("rateware.privateBidRoom.language", privateAlertState.language);
  syncPortalLanguageChrome();
  renderPrivateBidAlerts();
  if (lastInvitation) {
    renderInvitation(lastInvitation, lastLiveBoard || {}, lastCarrierBook || {});
    renderAwardOutcome(lastInvitation, lastCarrierBook || {}, lastLiveBoard || {});
    renderCarrierBook(lastCarrierBook || {});
    renderPrivateBidAlerts();
    await loadCarrierChat({ suppressAlert: true });
  }
}

function viewModeFromUrl() {
  return new URLSearchParams(window.location.search).get("view") || "";
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

function publicBoardAccessText(value) {
  return String(value ?? "").trim();
}

function publicBoardRelation(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === "object" ? value : {};
}

function storedPublicBoardVerifiedInvitations() {
  try {
    const rows = JSON.parse(localStorage.getItem(PUBLIC_BOARD_VERIFIED_INVITES_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function rememberPublicBoardInvitationAccess(invitation = {}, carrierBook = {}) {
  const existing = new Map();
  for (const row of storedPublicBoardVerifiedInvitations()) {
    const laneId = publicBoardAccessText(row?.lane_id);
    const token = publicBoardAccessText(row?.token);
    if (laneId && token) existing.set(laneId, { ...row, lane_id: laneId, token });
  }
  const rowsToStore = [];
  const vendor = publicBoardRelation(invitation.vendors);
  const currentEvent = publicBoardRelation(invitation.rfx_events);
  const currentLane = publicBoardRelation(invitation.rfx_lanes);
  const currentToken = publicBoardAccessText(invitation.invitation_token) || tokenFromUrl();
  const addRow = (row = {}) => {
    const lane = publicBoardRelation(row.lane || row.rfx_lanes);
    const event = publicBoardRelation(row.event || row.rfx_events);
    const token = publicBoardAccessText(row.invitation_token || row.token || currentToken);
    const laneId = publicBoardAccessText(row.rfx_lane_id || lane.id);
    if (!laneId || !token) return;
    const eventId = publicBoardAccessText(row.rfx_event_id || event.id);
    rowsToStore.push({
      lane_id: laneId,
      event_id: eventId,
      token,
      rfx_id: publicBoardAccessText(event.rfx_id || event.name),
      route_label: [lane.origin || lane.origin_city, lane.destination || lane.destination_city].filter(Boolean).join(" -> "),
      updated_at: new Date().toISOString()
    });
  };
  addRow({
    rfx_lane_id: invitation.rfx_lane_id,
    rfx_event_id: invitation.rfx_event_id,
    invitation_token: currentToken,
    rfx_lanes: currentLane,
    rfx_events: currentEvent
  });
  for (const row of Array.isArray(carrierBook.invited) ? carrierBook.invited : []) addRow(row);
  for (const row of rowsToStore) existing.set(row.lane_id, row);
  const verifiedRows = [...existing.values()].slice(-250);
  localStorage.setItem(PUBLIC_BOARD_VERIFIED_INVITES_KEY, JSON.stringify(verifiedRows));
  const laneIds = [...new Set(verifiedRows.map((row) => publicBoardAccessText(row.lane_id)).filter(Boolean))];
  const eventIds = [...new Set(verifiedRows.map((row) => publicBoardAccessText(row.event_id)).filter(Boolean))];
  localStorage.setItem(PUBLIC_BOARD_INVITE_LANES_KEY, JSON.stringify(laneIds));
  localStorage.setItem(PUBLIC_BOARD_INVITE_EVENTS_KEY, JSON.stringify(eventIds));
  const email = publicBoardAccessText(vendor.primary_email).toLowerCase();
  if (email) localStorage.setItem(PUBLIC_BOARD_INVITE_EMAIL_KEY, email);
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
    [t("logisticsModel"), lane.logistics_model],
    [t("operationCriteria"), lane.operation_criteria],
    [t("businessRules"), lane.business_rules],
    [t("serviceSpecifications"), lane.service_specifications],
    [t("otherNotes"), lane.other_notes],
    [t("notes"), lane.notes]
  ].filter(([, value]) => String(value || "").trim());
}

function sanitizeRichTextNode(node) {
  if (!node) return "";
  if (node.nodeType === 3) return escapeHtml(node.textContent || "").replace(/\u00a0/g, " ");
  if (node.nodeType !== 1) return "";
  const tag = String(node.tagName || "").toLowerCase();
  if (["script", "style", "meta", "link", "iframe", "object", "embed", "svg"].includes(tag)) return "";
  const children = Array.from(node.childNodes || []).map(sanitizeRichTextNode).join("");
  if (tag === "br") return "<br>";
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const safeHref = /^(https?:|mailto:|tel:)/i.test(href) ? href : "";
    return safeHref
      ? `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noreferrer">${children || escapeHtml(safeHref)}</a>`
      : children;
  }
  if ((tag === "li" || tag === "p") && !children.trim()) return "";
  if (["p", "ul", "ol", "li", "strong", "b", "em", "i", "u", "table", "thead", "tbody", "tr", "th", "td"].includes(tag)) {
    return `<${tag}>${children}</${tag}>`;
  }
  return children;
}

function renderLaneDetailValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return escapeHtml(raw).replace(/\r?\n/g, "<br>");
  }
  try {
    const parsed = new DOMParser().parseFromString(raw, "text/html");
    const source = parsed.body || parsed;
    const html = Array.from(source.childNodes || []).map(sanitizeRichTextNode).join("").trim();
    return html || escapeHtml(source.textContent || raw).replace(/\r?\n/g, "<br>");
  } catch (_error) {
    return escapeHtml(raw).replace(/\r?\n/g, "<br>");
  }
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
    en: {
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
    },
    es: {
      drafted: "Borrador",
      invited: "Invitado",
      viewed: "Visto",
      responded: "Respondido",
      quoted: "Cotizado",
      bid_submitted: "Cotizado",
      awarded: "Asignado",
      backup: "Backup",
      not_awarded: "No asignado",
      pending: "Pendiente",
      declined: "Declinado",
      open: "Abierto",
      not_invited: "Solicitar invitacion"
    }
  };
  return (labels[portalLanguage()] || labels.en)[value] || value;
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
  if (!event.due_date) return { label: dualText("No deadline", "Sin fecha limite"), tone: "muted", detail: dualText("Procurement has not set a close date.", "Procurement no ha definido fecha de cierre.") };
  const dueAt = new Date(`${event.due_date}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return { label: formatDate(event.due_date), tone: "neutral", detail: dualText("Deadline date needs review.", "La fecha limite requiere revision.") };
  const days = Math.ceil((dueAt.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: dualText("Closed", "Cerrado"), tone: "danger", detail: dualText(`Closed ${Math.abs(days)} day(s) ago.`, `Cerro hace ${Math.abs(days)} dia(s).`) };
  if (days === 0) return { label: dualText("Closes today", "Cierra hoy"), tone: "warning", detail: dualText("Submit or update your offer today.", "Envia o actualiza tu oferta hoy.") };
  if (days === 1) return { label: dualText("1 day left", "Queda 1 dia"), tone: "warning", detail: dualText(`Due ${formatDate(event.due_date)}.`, `Vence ${formatDate(event.due_date)}.`) };
  return { label: dualText(`${days} days left`, `Quedan ${days} dias`), tone: "success", detail: dualText(`Due ${formatDate(event.due_date)}.`, `Vence ${formatDate(event.due_date)}.`) };
}

function visibilityCopy(visibility = {}) {
  if (visibility.mode === "open_leaderboard") {
    return dualText("Open leaderboard - competitor names and exact submitted rates are visible.", "Leaderboard abierto: nombres de competidores y tarifas exactas son visibles.");
  }
  if (visibility.mode === "anonymous_rank") {
    return dualText("Anonymous rank - competitor names and exact third-party rates are hidden.", "Ranking anonimo: nombres de competidores y tarifas exactas de terceros estan ocultas.");
  }
  if (visibility.mode === "private") {
    return dualText("Private - procurement sees all offers; carriers only see their own submitted bid.", "Privado: procurement ve todas las ofertas; los carriers solo ven su propia oferta.");
  }
  return dualText("Private visibility controlled by procurement.", "Visibilidad privada controlada por procurement.");
}

function visibilityLabel(visibility = {}) {
  const labels = {
    en: {
      private: "Private",
      anonymous_rank: "Anonymous rank",
      open_leaderboard: "Open leaderboard"
    },
    es: {
      private: "Privado",
      anonymous_rank: "Ranking anonimo",
      open_leaderboard: "Leaderboard abierto"
    }
  };
  return (labels[portalLanguage()] || labels.en)[visibility.mode] || labels[portalLanguage()].private;
}

function commercialModelLabel(value) {
  const labels = {
    en: {
      direct_cost_plus: "Direct / cost-plus",
      carrier_share: "Carrier invoice share",
      xbf_buy_sell: "XBF buy-sell"
    },
    es: {
      direct_cost_plus: "Directo / cost-plus",
      carrier_share: "Carrier invoice share",
      xbf_buy_sell: "XBF compra-venta"
    }
  };
  return (labels[portalLanguage()] || labels.en)[String(value || "").toLowerCase()] || t("notDeclared");
}

function commercialStructureConfig(value) {
  const model = String(value || "direct_cost_plus").toLowerCase();
  const configs = {
    direct_cost_plus: {
      tone: dualText("Cost-plus", "Cost-plus"),
      percentageField: "marksman",
      percentageLabel: t("suggestedMargin"),
      percentageTooltip: dualText(
        "This percentage increases the board/customer comparable price over the carrier all-in rate. The calculated commission is invoiced after the customer pays.",
        "Este porcentaje incrementa el precio comparable del board/cliente sobre la tarifa all-in del carrier. La comision calculada se factura cuando pague el cliente."
      ),
      copy: dualText(
        "Use when the carrier quotes its direct all-in cost and suggests the MARKSMAN margin to add on the Bid Board.",
        "Usa esto cuando el carrier cotiza su costo directo all-in y sugiere el margen MARKSMAN a sumar en el Bid Board."
      )
    },
    carrier_share: {
      tone: dualText("Carrier shares", "Carrier comparte"),
      percentageField: "carrier",
      percentageLabel: t("carrierShare"),
      percentageTooltip: dualText(
        "This does not change the bid price. It calculates the carrier invoice-share fee to be billed after the customer pays.",
        "Esto no modifica el precio de la puja. Calcula el fee de share factura carrier que se cobrara cuando pague el cliente."
      ),
      copy: dualText(
        "Use when the carrier keeps the same quoted price but agrees to share a billing percentage after payment.",
        "Usa esto cuando el carrier conserva la misma tarifa cotizada pero acepta compartir un porcentaje de facturacion despues del pago."
      )
    },
    xbf_buy_sell: {
      tone: dualText("XBF buy-sell", "XBF compra-venta"),
      percentageField: "none",
      percentageLabel: "",
      percentageTooltip: dualText("No percentage is requested from the carrier. The Bid Board applies an automatic 15% XBF buy-sell markup.", "No se solicita porcentaje al carrier. El Bid Board aplica un markup automatico XBF compra-venta de 15%."),
      copy: dualText("Use when the carrier only submits its sell rate to XBF. The board price is automatically marked up by 15%.", "Usa esto cuando el carrier solo envia su tarifa de venta a XBF. El precio del board se incrementa automaticamente 15%.")
    }
  };
  return configs[model] || configs.direct_cost_plus;
}

function commercialPercentSummary(draft = {}) {
  const config = commercialStructureConfig(draft.commercial_model);
  if (config.percentageField === "marksman" && draft.marksman_margin_pct) return dualText(`${draft.marksman_margin_pct}% suggested margin`, `${draft.marksman_margin_pct}% margen sugerido`);
  if (config.percentageField === "carrier" && draft.carrier_share_pct) return dualText(`${draft.carrier_share_pct}% invoice share`, `${draft.carrier_share_pct}% share factura`);
  if (config.percentageField === "none") return dualText("No percentage applies", "No aplica porcentaje");
  return dualText(`${config.percentageLabel || "Percentage"} not declared`, `${config.percentageLabel || "Porcentaje"} no declarado`);
}

function commercialRateDetails(row = {}) {
  const model = String(row.commercial_model || "direct_cost_plus").toLowerCase();
  const carrierRate = numberOrNull(row.carrier_bid_rate ?? row.bid_rate ?? row.amount);
  let boardRate = numberOrNull(row.board_rate ?? row.rate_visibility ?? row.amount);
  let commissionFee = numberOrNull(row.commission_fee);
  const commissionPct = numberOrNull(row.commission_pct ?? (model === "direct_cost_plus" ? row.marksman_margin_pct : row.carrier_share_pct));
  let markupFee = numberOrNull(row.markup_fee);
  const markupPct = numberOrNull(row.markup_pct) ?? (model === "xbf_buy_sell" ? 15 : null);
  if (carrierRate !== null && boardRate === null) {
    if (model === "carrier_share") boardRate = carrierRate;
    else if (model === "xbf_buy_sell") boardRate = carrierRate * (1 + (markupPct ?? 15) / 100);
    else boardRate = commissionPct !== null ? carrierRate * (1 + commissionPct / 100) : carrierRate;
  }
  if (carrierRate !== null && commissionFee === null && (model === "carrier_share" || model === "direct_cost_plus") && commissionPct !== null) {
    commissionFee = model === "carrier_share" ? carrierRate * commissionPct / 100 : (boardRate ?? carrierRate) - carrierRate;
  }
  if (carrierRate !== null && markupFee === null && model === "xbf_buy_sell" && boardRate !== null) {
    markupFee = boardRate - carrierRate;
  }
  return {
    model,
    currency: row.currency || "USD",
    carrierRate,
    boardRate,
    commissionFee,
    commissionPct,
    markupFee,
    markupPct
  };
}

function commercialRateDisplay(row = {}) {
  const details = commercialRateDetails(row);
  return formatMoney(details.boardRate ?? details.carrierRate, details.currency);
}

function commercialFeeSummary(row = {}) {
  const details = commercialRateDetails(row);
  if (details.model === "carrier_share") {
    const fee = details.commissionFee !== null ? formatMoney(details.commissionFee, details.currency) : "-";
    return dualText(
      `Carrier rate stays ${formatMoney(details.carrierRate, details.currency)}. Invoice share fee ${fee}${details.commissionPct !== null ? ` (${details.commissionPct}%)` : ""} after customer payment.`,
      `La tarifa del carrier queda en ${formatMoney(details.carrierRate, details.currency)}. Fee share factura ${fee}${details.commissionPct !== null ? ` (${details.commissionPct}%)` : ""} cuando pague el cliente.`
    );
  }
  if (details.model === "xbf_buy_sell") {
    const markup = details.markupFee !== null ? formatMoney(details.markupFee, details.currency) : "-";
    return dualText(
      `Carrier rate ${formatMoney(details.carrierRate, details.currency)}. Board rate includes XBF buy-sell markup ${details.markupPct ?? 15}% (${markup}).`,
      `Tarifa carrier ${formatMoney(details.carrierRate, details.currency)}. El board incluye markup compra-venta XBF ${details.markupPct ?? 15}% (${markup}).`
    );
  }
  const fee = details.commissionFee !== null ? formatMoney(details.commissionFee, details.currency) : "-";
  return dualText(
    `Carrier rate ${formatMoney(details.carrierRate, details.currency)}. Board rate ${formatMoney(details.boardRate, details.currency)} includes suggested margin${details.commissionPct !== null ? ` ${details.commissionPct}%` : ""}; commission ${fee} after customer payment.`,
    `Tarifa carrier ${formatMoney(details.carrierRate, details.currency)}. Board rate ${formatMoney(details.boardRate, details.currency)} incluye margen sugerido${details.commissionPct !== null ? ` ${details.commissionPct}%` : ""}; comision ${fee} cuando pague el cliente.`
  );
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
    closing: "Deadline risk",
    supportAnswer: "Assistant answer",
    supportTicket: "Support ticket"
  };
  return labels[type] || privateAlertPhrase(type);
}

function renderPrivateBidAlerts() {
  const panel = card.querySelector("#private-bid-alerts");
  const button = card.querySelector("#private-bid-sound");
  const languageButtons = card.querySelectorAll("[data-private-language-toggle]");
  if (button) {
    button.textContent = privateAlertState.soundEnabled ? t("soundOn") : t("soundOff");
    button.setAttribute("aria-pressed", privateAlertState.soundEnabled ? "true" : "false");
    button.classList.toggle("is-muted", !privateAlertState.soundEnabled);
    button.disabled = false;
  }
  languageButtons.forEach((languageButton) => {
    const active = languageButton.dataset.privateLanguageToggle === portalLanguage();
    languageButton.setAttribute("aria-pressed", active ? "true" : "false");
    languageButton.classList.toggle("is-active", active);
  });
  if (!panel) return;
  if (!privateAlertState.alerts.length) {
    panel.innerHTML = privateAlertState.soundEnabled
      ? `<p>${escapeHtml(t("noMovementSoundOn"))}</p>`
      : `<p>${escapeHtml(t("noMovementSoundOff"))}</p>`;
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

async function armPrivateBidAudio() {
  if (!privateAlertState.soundEnabled) return;
  const context = ensurePrivateAudioContext();
  if (context?.state === "suspended") {
    await context.resume().catch(() => {});
  }
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
    leading: [784, 988],
    supportAnswer: [659, 988],
    supportTicket: [494, 740]
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
  localStorage.setItem("rateware.privateBidRoom.sound", "on");
  const context = ensurePrivateAudioContext();
  if (context?.state === "suspended") await context.resume();
  queuePrivateBidAlert("enabled", "Multimedia alerts are active for this private bid room.");
}

function disablePrivateBidAlerts() {
  privateAlertState.soundEnabled = false;
  localStorage.setItem("rateware.privateBidRoom.sound", "off");
  renderPrivateBidAlerts();
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
  if (row.board_rate !== null && row.board_rate !== undefined && row.carrier_bid_rate !== null && row.carrier_bid_rate !== undefined && Number(row.board_rate) !== Number(row.carrier_bid_rate)) {
    parts.push(`Board ${formatMoney(row.board_rate, row.currency)}`);
  }
  if (row.commission_fee !== null && row.commission_fee !== undefined) parts.push(`Fee ${formatMoney(row.commission_fee, row.currency)}`);
  if (row.markup_fee !== null && row.markup_fee !== undefined) parts.push(`Markup ${formatMoney(row.markup_fee, row.currency)}`);
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
    validatePositiveNumberIssue(draft.weekly_capacity, "bid-capacity", "Weekly capacity", false),
    validatePositiveNumberIssue(draft.transit_days, "bid-transit-days", "Transit days", false)
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
  if (pickupEta && deliveryEta && deliveryEta.getTime() <= pickupEta.getTime()) {
    errors.push(validationIssue("bid-eta-delivery", "Delivery ETA must be after pickup ETA."));
  }

  const warnings = [];
  if (!String(draft.weekly_capacity || "").trim()) {
    warnings.push("Weekly capacity is recommended for award scoring.");
  }
  if (!String(draft.transit_days || "").trim()) {
    warnings.push("Transit days are recommended for service comparison.");
  }
  if (draft.best_alternative_offered && !draft.alternative_notes.trim()) {
    warnings.push("Alternative notes help procurement understand assumptions and restrictions.");
  }
  if (draft.equipment_available !== "true") {
    warnings.push("Declaring available equipment and ETAs improves award scoring.");
  } else {
    if (!pickupEta) warnings.push("Pickup ETA is recommended when equipment is available.");
    if (!deliveryEta) warnings.push("Delivery ETA is recommended when equipment is available.");
    if (!draft.unit_details.trim()) warnings.push("Unit, trailer, driver or mirror details help procurement validate capacity.");
  }
  return { errors, warnings };
}

const BID_TEMPLATE_COLUMNS = [
  { key: "rfx_id", label: "RFx", aliases: ["RFx"], width: 16, readonly: true },
  { key: "event_name", label: "Event / Evento", aliases: ["Event", "Evento"], width: 28, readonly: true },
  { key: "lane_number", label: "Lane # / Ruta #", aliases: ["Lane #", "Ruta #"], width: 12, readonly: true },
  { key: "origin", label: "Origin / Origen", aliases: ["Origin", "Origen"], width: 22, readonly: true },
  { key: "destination", label: "Destination / Destino", aliases: ["Destination", "Destino"], width: 22, readonly: true },
  { key: "equipment", label: "Equipment / Equipo", aliases: ["Equipment", "Equipo"], width: 18, readonly: true },
  { key: "trailer", label: "Trailer / Remolque", aliases: ["Trailer", "Remolque"], width: 16, readonly: true },
  { key: "config", label: "Config / Configuracion", aliases: ["Config", "Configuracion"], width: 16, readonly: true },
  { key: "operation", label: "Operation / Operacion", aliases: ["Operation", "Operacion"], width: 18, readonly: true },
  { key: "service", label: "Service / Servicio", aliases: ["Service", "Servicio"], width: 16, readonly: true },
  { key: "weekly_volume", label: "Weekly volume / Volumen semanal", aliases: ["Weekly volume", "Volumen semanal"], width: 18, readonly: true },
  { key: "target_rate", label: "Target rate / Tarifa objetivo", aliases: ["Target rate", "Tarifa objetivo"], width: 18, readonly: true },
  { key: "target_currency", label: "Target currency / Moneda objetivo", aliases: ["Target currency", "Moneda objetivo"], width: 18, readonly: true },
  { key: "invitation_token", label: "Invitation token / Token invitacion", aliases: ["Invitation token", "Token invitacion"], width: 28, readonly: true, hidden: true },
  { key: "submit_this_lane", label: "Submit this lane / Enviar esta ruta", aliases: ["Submit this lane", "Enviar esta ruta"], width: 20, validation: "yesNoBlank" },
  { key: "all_in_rate", label: "All-in rate / Tarifa all-in", aliases: ["All-in rate", "Tarifa all-in"], width: 18, validation: "positiveNumber", required: true },
  { key: "currency", label: "Currency / Moneda", aliases: ["Currency", "Moneda"], width: 14, validation: "currency", required: true },
  { key: "weekly_capacity", label: "Weekly capacity / Capacidad semanal", aliases: ["Weekly capacity", "Capacidad semanal"], width: 20, validation: "positiveNumberBlank", recommended: true },
  { key: "transit_days", label: "Transit days / Dias transito", aliases: ["Transit days", "Dias transito"], width: 18, validation: "positiveNumberBlank", recommended: true },
  { key: "commercial_model", label: "Commercial model / Modelo comercial", aliases: ["Commercial model", "Modelo comercial"], width: 28, validation: "commercialModel", required: true },
  { key: "suggested_margin_pct", label: "Suggested margin % / Margen sugerido %", aliases: ["Suggested margin %", "Margen sugerido %"], width: 24, validation: "percent2to5", conditional: "Required only for Direct / cost-plus. / Obligatorio solo para Direct / cost-plus." },
  { key: "carrier_invoice_share_pct", label: "Carrier invoice share % / Share factura carrier %", aliases: ["Carrier invoice share %", "Share factura carrier %"], width: 28, validation: "percent2to5", conditional: "Required only for Carrier invoice share. / Obligatorio solo para Carrier invoice share." },
  { key: "best_alternative", label: "Best alternative / Mejor alternativa", aliases: ["Best alternative", "Mejor alternativa"], width: 22, validation: "yesNoBlank" },
  { key: "alternative_equipment", label: "Alternative equipment / Equipo alternativo", aliases: ["Alternative equipment", "Equipo alternativo"], width: 26 },
  { key: "alternative_units", label: "Alternative units / Unidades alternativas", aliases: ["Alternative units", "Unidades alternativas"], width: 22, validation: "positiveNumberBlank" },
  { key: "alternative_notes", label: "Alternative notes / Notas alternativa", aliases: ["Alternative notes", "Notas alternativa"], width: 38 },
  { key: "equipment_available", label: "Equipment available / Equipo disponible", aliases: ["Equipment available", "Equipo disponible"], width: 24, validation: "availability" },
  { key: "eta_pickup", label: "Pickup ETA / ETA carga", aliases: ["Pickup ETA", "ETA carga"], width: 22 },
  { key: "eta_delivery", label: "Delivery ETA / ETA entrega", aliases: ["Delivery ETA", "ETA entrega"], width: 22 },
  { key: "mirror_account_enabled", label: "Mirror account / Cuenta espejo", aliases: ["Mirror account", "Cuenta espejo"], width: 22, validation: "yesNoBlank" },
  { key: "unit_details", label: "Unit details / Datos unidad", aliases: ["Unit details", "Datos unidad"], width: 36 },
  { key: "best_final", label: "Best and final / Mejor y final", aliases: ["Best and final", "Mejor y final"], width: 22, validation: "yesNoBlank" },
  { key: "notes", label: "Notes / Notas", aliases: ["Notes", "Notas"], width: 38 }
];

function bidTemplateColumn(key) {
  return BID_TEMPLATE_COLUMNS.find((column) => column.key === key) || { key, label: key };
}

function bidTemplateValue(row, key) {
  const column = bidTemplateColumn(key);
  for (const candidate of [column.label, ...(column.aliases || []), column.key]) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) return row[candidate];
  }
  return "";
}

function textValue(value) {
  return String(value ?? "").trim();
}

function normalizeTemplateBoolean(value, defaultValue = false) {
  const text = textValue(value).toLowerCase();
  if (!text) return defaultValue;
  if (["true", "yes", "y", "si", "sí", "verdadero", "x", "1", "include", "submit", "enviar", "available", "disponible"].includes(text)) return true;
  if (["false", "no", "n", "falso", "0", "exclude", "skip", "omitir", "not available", "no disponible"].includes(text)) return false;
  return defaultValue;
}

function normalizeTemplateCommercialModel(value) {
  const text = textValue(value).toLowerCase();
  if (!text) return "direct_cost_plus";
  if (text.includes("carrier") || text.includes("invoice") || text.includes("share")) return "carrier_share";
  if (text.includes("xbf") || text.includes("buy") || text.includes("sell")) return "xbf_buy_sell";
  return "direct_cost_plus";
}

function normalizeTemplateAvailability(value) {
  const text = textValue(value).toLowerCase();
  if (!text) return "";
  if (["true", "yes", "y", "si", "sí", "verdadero", "1", "available", "disponible"].includes(text)) return "true";
  if (["false", "no", "n", "falso", "0", "not available", "no disponible"].includes(text)) return "false";
  return "";
}

function normalizeTemplateDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateTimeLocalValue(value.toISOString());
  return textValue(value);
}

function normalizeTemplateCurrency(value, fallback = "USD") {
  const currency = textValue(value || fallback).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : currency || fallback;
}

function bidTemplateCommercialModelValue(value) {
  const model = String(value || "direct_cost_plus").toLowerCase();
  if (model === "carrier_share") return "Carrier invoice share";
  if (model === "xbf_buy_sell") return "XBF buy-sell";
  return "Direct / cost-plus";
}

function bidTemplateRows(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  return currentEventBookRows(carrierBook, event)
    .filter((row) => row.is_invited && row.invitation_token)
    .map((row, index) => {
      const lane = row.lane || {};
      const rowEvent = row.event || event;
      return {
        rfx_id: rowEvent.rfx_id || event.rfx_id || "",
        event_name: rowEvent.name || event.name || "",
        lane_number: lane.lane_number || index + 1,
        origin: lane.origin || "",
        destination: lane.destination || "",
        equipment: lane.equipment || "",
        trailer: lane.trailer || "",
        config: lane.config || "",
        operation: lane.operation || "",
        service: lane.service || "",
        weekly_volume: lane.weekly_volume ?? "",
        target_rate: lane.target_rate ?? lane.target_buy_rate ?? lane.benchmark_rate ?? "",
        target_currency: lane.currency || row.currency || "USD",
        invitation_token: row.invitation_token || "",
        submit_this_lane: "TRUE",
        all_in_rate: row.bid_rate ?? "",
        currency: row.currency || lane.currency || "USD",
        weekly_capacity: row.weekly_capacity ?? "",
        transit_days: row.transit_days ?? "",
        commercial_model: bidTemplateCommercialModelValue(row.commercial_model),
        suggested_margin_pct: row.marksman_margin_pct ?? "",
        carrier_invoice_share_pct: row.carrier_share_pct ?? "",
        best_alternative: row.best_alternative_offered ? "TRUE" : "",
        alternative_equipment: row.alternative_equipment || "",
        alternative_units: row.alternative_units ?? "",
        alternative_notes: row.alternative_notes || "",
        equipment_available: row.equipment_available === true ? "Available" : row.equipment_available === false ? "Not available" : "",
        eta_pickup: dateTimeLocalValue(row.eta_pickup),
        eta_delivery: dateTimeLocalValue(row.eta_delivery),
        mirror_account_enabled: row.mirror_account_enabled ? "TRUE" : "",
        unit_details: row.unit_details || "",
        best_final: "",
        notes: row.notes || ""
      };
    });
}

function safeSheetName(value, fallback = "Bid Template") {
  const name = textValue(value || fallback).replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim();
  return name || fallback;
}

function eventMarketplaceUrl(event = {}) {
  return "./bid-room-board.html";
}

async function loadExcelJs() {
  if (!excelJsModule) {
    excelJsModule = await import("https://esm.sh/exceljs@4.4.0?bundle");
  }
  return excelJsModule.default || excelJsModule;
}

function bidTemplateValidation(column) {
  const common = {
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Invalid value / Valor invalido",
    error: "Choose a valid value from the dropdown or instructions. / Elige un valor valido de la lista o instrucciones."
  };
  if (column.validation === "yesNo") {
    return { type: "list", allowBlank: false, formulae: ['"TRUE,FALSE"'], ...common };
  }
  if (column.validation === "yesNoBlank") {
    return { type: "list", allowBlank: true, formulae: ['"TRUE,FALSE"'], ...common };
  }
  if (column.validation === "currency") {
    return { type: "list", allowBlank: false, formulae: ['"USD,MXN,CAD"'], ...common };
  }
  if (column.validation === "availability") {
    return { type: "list", allowBlank: true, formulae: ['"Available,Not available,Not declared"'], ...common };
  }
  if (column.validation === "commercialModel") {
    return { type: "list", allowBlank: false, formulae: ['"Direct / cost-plus,Carrier invoice share,XBF buy-sell"'], ...common };
  }
  if (column.validation === "positiveNumber") {
    return {
      type: "decimal",
      operator: "greaterThan",
      allowBlank: false,
      formulae: [0],
      ...common,
      error: "Enter a number greater than zero. / Captura un numero mayor a cero."
    };
  }
  if (column.validation === "positiveNumberBlank") {
    return {
      type: "decimal",
      operator: "greaterThan",
      allowBlank: true,
      formulae: [0],
      ...common,
      error: "Enter a number greater than zero or leave blank. / Captura un numero mayor a cero o deja en blanco."
    };
  }
  if (column.validation === "percent2to5") {
    return {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [2, 5],
      ...common,
      error: "Enter a percentage between 2 and 5. / Captura un porcentaje entre 2 y 5."
    };
  }
  return null;
}

function applyBidTemplateWorksheetRules(worksheet, rowCount) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rowCount + 1, 1), column: BID_TEMPLATE_COLUMNS.length }
  };
  worksheet.getRow(1).height = 34;
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203040" } };
  BID_TEMPLATE_COLUMNS.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    excelColumn.width = column.width || 16;
    excelColumn.hidden = Boolean(column.hidden);
    excelColumn.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD8DEE8" } },
        left: { style: "thin", color: { argb: "FFD8DEE8" } },
        bottom: { style: "thin", color: { argb: "FFD8DEE8" } },
        right: { style: "thin", color: { argb: "FFD8DEE8" } }
      };
      if (rowNumber === 1) {
        cell.note = column.readonly
          ? "Readonly / No editar"
          : column.required
            ? "Required to submit. Use dropdowns where available. / Obligatorio para enviar. Usa las listas donde existan."
            : column.conditional
              ? column.conditional
              : column.recommended
                ? "Recommended, but not required. / Recomendado, pero no obligatorio."
                : "Optional. Use dropdowns where available. / Opcional. Usa las listas donde existan.";
        return;
      }
      cell.alignment = { vertical: "middle", wrapText: true };
      let fillColor = "FFFFFFFF";
      if (column.readonly) fillColor = "FFF3F6FA";
      else if (column.required) fillColor = "FFFFF2CC";
      else if (column.conditional) fillColor = "FFEAF3FF";
      else if (column.recommended) fillColor = "FFF8FBFF";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      const validation = bidTemplateValidation(column);
      if (validation) cell.dataValidation = validation;
    });
  });
  for (const key of ["all_in_rate", "weekly_capacity", "transit_days", "suggested_margin_pct", "carrier_invoice_share_pct", "alternative_units"]) {
    worksheet.getColumn(BID_TEMPLATE_COLUMNS.findIndex((column) => column.key === key) + 1).numFmt = "#,##0.00";
  }
}

function addBidTemplateInstructions(workbook) {
  const instructions = workbook.addWorksheet("Instructions - Instrucciones");
  instructions.columns = [
    { header: "Section / Seccion", key: "section", width: 28 },
    { header: "English", key: "en", width: 70 },
    { header: "Espanol", key: "es", width: 74 }
  ];
  instructions.addRows([
    {
      section: "Workflow",
      en: "1) Review the readonly lane context. 2) Complete the required offer columns. 3) Add recommended/optional details when available. 4) Upload this workbook in Rateware. 5) Confirm submission only after validation passes.",
      es: "1) Revisa el contexto readonly de la ruta. 2) Completa las columnas obligatorias de oferta. 3) Agrega detalles recomendados/opcionales cuando existan. 4) Sube este archivo en Rateware. 5) Confirma el envio solo cuando la validacion pase."
    },
    {
      section: "Required columns",
      en: "Required to submit: All-in rate, Currency, Commercial model. Suggested margin % is required only for Direct / cost-plus. Carrier invoice share % is required only for Carrier invoice share.",
      es: "Obligatorio para enviar: Tarifa all-in, Moneda, Modelo comercial. Margen sugerido % solo es obligatorio para Direct / cost-plus. Share factura carrier % solo es obligatorio para Carrier invoice share."
    },
    {
      section: "Recommended columns",
      en: "Weekly capacity, transit days, equipment availability, ETAs, unit details, alternatives, and notes improve scoring and procurement review, but they do not block submission unless the value entered is invalid.",
      es: "Capacidad semanal, dias de transito, disponibilidad, ETAs, datos de unidad, alternativas y notas mejoran el scoring y la revision, pero no bloquean el envio salvo que el valor capturado sea invalido."
    },
    {
      section: "Dropdowns",
      en: "Use dropdowns for Submit this lane, Currency, Commercial model, Best alternative, Equipment available, Mirror account, and Best/final.",
      es: "Usa las listas desplegables para Enviar ruta, Moneda, Modelo comercial, Mejor alternativa, Equipo disponible, Cuenta espejo y Mejor/final."
    },
    {
      section: "Commercial model",
      en: "Direct / cost-plus requires Suggested margin % between 2 and 5. Carrier invoice share requires Carrier invoice share % between 2 and 5. XBF buy-sell does not require a percentage.",
      es: "Direct / cost-plus requiere Margen sugerido % entre 2 y 5. Carrier invoice share requiere Share factura carrier % entre 2 y 5. XBF buy-sell no requiere porcentaje."
    },
    {
      section: "Rate",
      en: "All-in rate is required and must be greater than zero. Weekly capacity and transit days are optional, but if entered they must also be numeric and greater than zero.",
      es: "La tarifa all-in es obligatoria y debe ser mayor a cero. Capacidad semanal y dias de transito son opcionales, pero si se capturan tambien deben ser numericos y mayores a cero."
    },
    {
      section: "Availability",
      en: "If equipment is available, add pickup ETA, delivery ETA, and unit details when possible. Mirror account means procurement can validate availability.",
      es: "Si el equipo esta disponible, agrega ETA de carga, ETA de entrega y datos de unidad cuando sea posible. Cuenta espejo permite validar disponibilidad."
    },
    {
      section: "Important",
      en: "Do not delete or overwrite the hidden invitation token. It links each row to the correct private lane.",
      es: "No elimines ni sobrescribas el token oculto de invitacion. Vincula cada fila con la lane privada correcta."
    }
  ]);
  instructions.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203040" } };
  instructions.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD8DEE8" } },
        left: { style: "thin", color: { argb: "FFD8DEE8" } },
        bottom: { style: "thin", color: { argb: "FFD8DEE8" } },
        right: { style: "thin", color: { argb: "FFD8DEE8" } }
      };
    });
  });
}

function downloadWorkbookBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadBidTemplate(carrierBook = {}, invitation = {}) {
  const rows = bidTemplateRows(carrierBook, invitation);
  if (!rows.length) {
    window.alert(dualText("No invited lanes are available for this bid template.", "No hay lanes invitadas disponibles para este template."));
    return;
  }
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rateware";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Bid Template");
  worksheet.columns = BID_TEMPLATE_COLUMNS.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.width || 16,
    hidden: Boolean(column.hidden)
  }));
  rows.forEach((row) => worksheet.addRow(row));
  applyBidTemplateWorksheetRules(worksheet, rows.length);
  addBidTemplateInstructions(workbook);
  const event = invitation.rfx_events || {};
  const filename = safeSheetName(`${event.rfx_id || "rfx"} bid template`, "bid-template");
  const buffer = await workbook.xlsx.writeBuffer();
  downloadWorkbookBuffer(buffer, `${filename}.xlsx`);
}

function draftFromBidTemplateRow(row) {
  const commercialModel = normalizeTemplateCommercialModel(row.commercial_model);
  return {
    bid_rate: textValue(row.all_in_rate),
    currency: normalizeTemplateCurrency(row.currency, row.target_currency || "USD"),
    weekly_capacity: textValue(row.weekly_capacity),
    transit_days: textValue(row.transit_days),
    commercial_model: commercialModel,
    marksman_margin_pct: commercialModel === "direct_cost_plus" ? textValue(row.suggested_margin_pct) : "",
    carrier_share_pct: commercialModel === "carrier_share" ? textValue(row.carrier_invoice_share_pct) : "",
    best_alternative_offered: normalizeTemplateBoolean(row.best_alternative),
    alternative_equipment: textValue(row.alternative_equipment),
    alternative_units: textValue(row.alternative_units),
    alternative_notes: textValue(row.alternative_notes),
    equipment_available: normalizeTemplateAvailability(row.equipment_available),
    unit_details: textValue(row.unit_details),
    eta_pickup: normalizeTemplateDateTime(row.eta_pickup),
    eta_delivery: normalizeTemplateDateTime(row.eta_delivery),
    mirror_account_enabled: normalizeTemplateBoolean(row.mirror_account_enabled),
    best_final: normalizeTemplateBoolean(row.best_final),
    notes: textValue(row.notes)
  };
}

function normalizeBidTemplateRow(rawRow = {}, index = 0) {
  const row = Object.fromEntries(BID_TEMPLATE_COLUMNS.map((column) => [column.key, bidTemplateValue(rawRow, column.key)]));
  row.row_number = index + 2;
  row.submit_this_lane = normalizeTemplateBoolean(row.submit_this_lane);
  row.invitation_token = textValue(row.invitation_token);
  row.draft = draftFromBidTemplateRow(row);
  row.validation = validateBidTemplateRow(row);
  return row;
}

function validateBidTemplateRow(row) {
  if (!row.submit_this_lane) return { errors: [], warnings: [] };
  const validation = validateBidDraft(row.draft);
  const errors = [...validation.errors];
  if (!row.invitation_token) errors.unshift(validationIssue("invitation-token", `Row ${row.row_number}: missing invitation token. Download a fresh template.`));
  return { errors, warnings: validation.warnings };
}

async function parseBidTemplateFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets["Bid Template"] || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("Workbook does not contain a bid template sheet.");
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
  return rows
    .map(normalizeBidTemplateRow)
    .filter((row) => row.invitation_token || row.submit_this_lane || row.all_in_rate || row.weekly_capacity);
}

function renderBidTemplatePreview(rows = pendingBidTemplateRows) {
  const preview = card.querySelector("#carrier-bid-template-preview");
  const submitButton = card.querySelector("[data-submit-bid-template]");
  const status = card.querySelector("#carrier-bid-template-status");
  if (!preview || !submitButton) return;
  const selectedRows = rows.filter((row) => row.submit_this_lane);
  const invalidRows = selectedRows.filter((row) => row.validation.errors.length);
  submitButton.disabled = !selectedRows.length || invalidRows.length > 0;
  if (!rows.length) {
    preview.innerHTML = "";
    if (status) {
      status.textContent = t("uploadXlsxStatus");
      status.dataset.tone = "neutral";
    }
    return;
  }
  if (status) {
    status.textContent = invalidRows.length
      ? dualText(`${invalidRows.length} row(s) need correction before submit.`, `${invalidRows.length} fila(s) requieren correccion antes de enviar.`)
      : dualText(`${selectedRows.length} row(s) ready. Review the preview, then confirm submission.`, `${selectedRows.length} fila(s) listas. Revisa la vista previa y confirma el envio.`);
    status.dataset.tone = invalidRows.length ? "error" : "success";
  }
  preview.innerHTML = `
    <div class="bid-template-preview-summary">
      <span>${escapeHtml(t("selectedRows", { count: selectedRows.length }))}</span>
      <span>${escapeHtml(t("errorRows", { count: invalidRows.length }))}</span>
      <span>${escapeHtml(t("skippedRows", { count: rows.length - selectedRows.length }))}</span>
    </div>
    <div class="table-wrap">
      <table class="bid-template-preview-table">
        <thead><tr><th>${escapeHtml(dualText("Row", "Fila"))}</th><th>Lane</th><th>${escapeHtml(dualText("Rate", "Tarifa"))}</th><th>${escapeHtml(dualText("Capacity", "Capacidad"))}</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.slice(0, 12).map((row) => {
            const errors = row.validation.errors.map((issue) => issue.message);
            const lane = [row.origin, row.destination].filter(Boolean).join(" -> ") || row.lane_number || "-";
            const statusHtml = !row.submit_this_lane
              ? `<span class="status-pill muted">${escapeHtml(t("skipped"))}</span>`
              : errors.length
                ? `<span class="status-pill danger">${escapeHtml(t("fixRequired"))}</span><small>${escapeHtml(errors.join(" | "))}</small>`
                : `<span class="status-pill success">${escapeHtml(t("ready"))}</span>`;
            return `
              <tr>
                <td>${escapeHtml(row.row_number)}</td>
                <td>${escapeHtml(lane)}</td>
                <td>${escapeHtml(row.draft.bid_rate || "-")} ${escapeHtml(row.draft.currency || "")}</td>
                <td>${escapeHtml(row.draft.weekly_capacity || "-")} / wk</td>
                <td>${statusHtml}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    ${rows.length > 12 ? `<p class="bid-board-note">${escapeHtml(dualText(`Previewing first 12 of ${rows.length} rows.`, `Mostrando primeras 12 de ${rows.length} filas.`))}</p>` : ""}
  `;
}

async function submitBidTemplateRows() {
  const status = card.querySelector("#carrier-bid-template-status");
  const button = card.querySelector("[data-submit-bid-template]");
  const rows = pendingBidTemplateRows.filter((row) => row.submit_this_lane);
  const invalidRows = rows.filter((row) => row.validation.errors.length);
  if (!rows.length) {
    if (status) {
      status.textContent = dualText("No XLSX rows selected for submit.", "No hay filas XLSX seleccionadas para enviar.");
      status.dataset.tone = "error";
    }
    return;
  }
  if (invalidRows.length) {
    renderBidTemplatePreview();
    return;
  }
  if (button) button.disabled = true;
  if (status) {
    status.textContent = dualText(`Submitting ${rows.length} XLSX bid row(s)...`, `Enviando ${rows.length} fila(s) de puja XLSX...`);
    status.dataset.tone = "neutral";
  }
  try {
    for (const row of rows) {
      await callBidApi("submit_bid", { token: row.invitation_token, ...row.draft });
    }
    pendingBidTemplateRows = [];
    if (status) {
      status.textContent = dualText(`${rows.length} bid row(s) submitted. The private book will refresh now.`, `${rows.length} fila(s) enviadas. El libro privado se actualizara ahora.`);
      status.dataset.tone = "success";
    }
    queuePrivateBidAlert("bidSubmitted", dualText(`${rows.length} bid row(s) submitted from XLSX.`, `${rows.length} fila(s) enviadas desde XLSX.`));
    await loadInvitation();
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
    if (button) button.disabled = false;
  }
}

function renderBidTemplateTools(carrierBook = {}, invitation = {}) {
  const rows = bidTemplateRows(carrierBook, invitation);
  if (!rows.length) return "";
  return `
    <section class="carrier-bid-template-tools">
      <div>
        <p class="eyebrow">${escapeHtml(t("xlsxEyebrow"))}</p>
        <h3>${escapeHtml(t("xlsxTitle"))}</h3>
        <p>${escapeHtml(t("xlsxCopy"))}</p>
      </div>
      <div class="carrier-bid-template-actions">
        <button type="button" data-download-bid-template>${escapeHtml(t("downloadXlsx"))}</button>
        <label class="carrier-bid-template-upload">
          <span>${escapeHtml(t("uploadXlsx"))}</span>
          <input id="carrier-bid-template-file" type="file" accept=".xlsx,.xls,.csv" />
        </label>
        <button type="button" data-submit-bid-template disabled>${escapeHtml(t("confirmXlsx"))}</button>
      </div>
      <p id="carrier-bid-template-status" class="status-message" role="status">${escapeHtml(t("uploadXlsxStatus"))}</p>
      <div id="carrier-bid-template-preview" class="carrier-bid-template-preview"></div>
    </section>
  `;
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
      <article><span>Commercial model</span><strong>${escapeHtml(commercialModelLabel(draft.commercial_model))}</strong><small>${escapeHtml(commercialFeeSummary(draft))}</small></article>
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

function currentSubmittedOffer(liveBoard = lastLiveBoard) {
  const rows = Array.isArray(liveBoard?.rows) ? liveBoard.rows : [];
  return rows.find((row) => row?.is_current) || null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function setFormValue(selector, value) {
  const input = card.querySelector(selector);
  if (!input) return;
  input.value = value === undefined || value === null ? "" : String(value);
}

function setFormChecked(selector, value) {
  const input = card.querySelector(selector);
  if (!input) return;
  input.checked = value === true;
}

function hydrateBidFormFromOffer(offer = currentSubmittedOffer(), invitation = lastInvitation || {}) {
  const lane = invitation.rfx_lanes || {};
  const source = offer || {};
  setFormValue("#bid-rate", firstDefined(source.carrier_bid_rate, invitation.bid_rate, source.amount, ""));
  setFormValue("#bid-currency", firstDefined(source.currency, invitation.currency, lane.currency, "USD"));
  setFormValue("#bid-capacity", firstDefined(source.weekly_capacity, invitation.weekly_capacity, ""));
  setFormValue("#bid-transit-days", firstDefined(source.transit_days, invitation.transit_days, ""));
  setFormValue("#bid-commercial-model", firstDefined(source.commercial_model, invitation.commercial_model, "direct_cost_plus"));
  setFormValue("#bid-marksman-margin", firstDefined(source.marksman_margin_pct, invitation.marksman_margin_pct, ""));
  setFormValue("#bid-carrier-share", firstDefined(source.carrier_share_pct, invitation.carrier_share_pct, ""));
  setFormChecked("#bid-alt-enabled", firstDefined(source.best_alternative_offered, invitation.best_alternative_offered, false) === true);
  setFormValue("#bid-alt-equipment", firstDefined(source.alternative_equipment, invitation.alternative_equipment, ""));
  setFormValue("#bid-alt-units", firstDefined(source.alternative_units, invitation.alternative_units, ""));
  setFormValue("#bid-alt-notes", invitation.alternative_notes || "");
  const equipmentAvailable = firstDefined(source.equipment_available, invitation.equipment_available, "");
  setFormValue("#bid-equipment-available", equipmentAvailable === true ? "true" : equipmentAvailable === false ? "false" : "");
  setFormValue("#bid-eta-pickup", dateTimeLocalValue(firstDefined(source.eta_pickup, invitation.eta_pickup, "")));
  setFormValue("#bid-eta-delivery", dateTimeLocalValue(firstDefined(source.eta_delivery, invitation.eta_delivery, "")));
  setFormChecked("#bid-mirror-account", firstDefined(source.mirror_account_enabled, invitation.mirror_account_enabled, false) === true);
  setFormValue("#bid-unit-details", firstDefined(source.unit_details, invitation.unit_details, ""));
  setFormValue("#bid-notes", invitation.notes || "");
  setFormChecked("#bid-confirm-review", false);
  setFormChecked("#bid-best-final", false);
  syncCommercialStructureFields();
  updateBidReviewSummary();
  syncBidFormMode();
}

function hasSubmittedOffer(invitation = lastInvitation, liveBoard = lastLiveBoard) {
  const bidRate = invitation?.bid_rate;
  return Boolean(currentSubmittedOffer(liveBoard) || (bidRate !== undefined && bidRate !== null && String(bidRate).trim() !== ""));
}

function syncBidFormMode() {
  const form = card.querySelector("#bid-form");
  if (!form) return;
  const editing = hasSubmittedOffer();
  form.dataset.editingSubmittedOffer = editing ? "true" : "false";
  const mode = card.querySelector("[data-bid-form-mode]");
  if (mode) {
    mode.textContent = editing ? t("editingSubmittedOffer") : t("primaryAlt");
    mode.dataset.tone = editing ? "neutral" : "muted";
    mode.classList.toggle("neutral", editing);
    mode.classList.toggle("muted", !editing);
  }
  const submitButton = card.querySelector("[data-bid-submit-button]");
  if (submitButton) submitButton.textContent = editing ? t("updateOffer") : t("submitPrimary");
}

function openBidEditor(options = {}) {
  const modal = card.querySelector("#bid-editor-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("bid-editor-open");
  const section = options.section
    ? card.querySelector(`[data-bid-section="${CSS.escape(options.section)}"]`)
    : null;
  const focusTarget = options.focusSelector
    ? card.querySelector(options.focusSelector)
    : section?.querySelector("input, select, textarea, button") || card.querySelector("#bid-rate");
  window.setTimeout(() => {
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusTarget?.focus({ preventScroll: true });
  }, 80);
}

function closeBidEditor() {
  const modal = card.querySelector("#bid-editor-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("bid-editor-open");
}

function focusCurrentOfferEditor() {
  const offer = currentSubmittedOffer();
  hydrateBidFormFromOffer(offer, lastInvitation || {});
  const status = card.querySelector("#bid-submit-status");
  openBidEditor({ section: "primary", focusSelector: "#bid-rate" });
  if (status) {
    status.textContent = dualText(
      "Update the fields you need, confirm terms, then save this revised offer.",
      "Actualiza los campos necesarios, confirma terminos y guarda esta revision."
    );
    status.dataset.tone = "neutral";
  }
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
        <thead><tr><th>Rank</th><th>Bidder</th><th>Score</th><th>Rate visibility</th><th>Commercial</th><th>Market signals</th><th>Capacity</th><th>Transit</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.is_current ? "is-current" : ""}">
              <td>#${escapeHtml(row.rank)}</td>
              <td>${escapeHtml(row.bidder)}</td>
              <td>${marketplaceScoreHtml(row)}</td>
              <td>
                ${row.amount !== null && row.amount !== undefined
                  ? `<strong>${escapeHtml(commercialRateDisplay(row))}</strong><small title="${escapeAttribute(commercialFeeSummary(row))}">${escapeHtml(row.carrier_bid_rate !== null && row.carrier_bid_rate !== undefined && Number(row.carrier_bid_rate) !== Number(row.amount) ? `Carrier ${formatMoney(row.carrier_bid_rate, row.currency)}` : row.amount_display || "Board rate")}</small>`
                  : `<span class="masked-rate">${escapeHtml(row.amount_display || "Hidden")}</span>`}
              </td>
              <td title="${escapeAttribute(row.amount !== null && row.amount !== undefined ? commercialFeeSummary(row) : "")}">${escapeHtml(commercialSummary(row))}</td>
              <td>${marketplaceBadgesHtml(row)}</td>
              <td>${escapeHtml(row.weekly_capacity ?? "-")}</td>
              <td>${escapeHtml(row.transit_days ?? "-")}</td>
              <td class="bid-live-action-cell">
                ${row.is_current
                  ? `<button type="button" class="secondary small-button" data-edit-current-offer>${escapeHtml(t("editSubmittedOffer"))}</button>`
                  : `<span class="muted-cell">-</span>`}
              </td>
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
    after.bid_rate !== undefined && after.commercial_model
      ? commercialFeeSummary(after)
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
  const labels = portalLanguage() === "es"
    ? {
        carrier_private: "Privado con procurement",
        event_group: "Sala del evento",
        lane_group: "Ruta enfocada"
      }
    : {
        carrier_private: "Private with procurement",
        event_group: "Event room",
        lane_group: "Focused lane"
      };
  return labels[threadType] || labels.carrier_private;
}

function carrierChatDescription(threadType = "") {
  const descriptions = portalLanguage() === "es"
    ? {
        carrier_private: "Mensajes privados entre tu equipo y procurement para este negocio.",
        event_group: "Preguntas generales visibles para la sala del evento dentro de Rateware.",
        lane_group: "Conversacion enfocada en la ruta seleccionada."
      }
    : {
        carrier_private: "Private messages between your team and procurement for this opportunity.",
        event_group: "General questions visible in the event room inside Rateware.",
        lane_group: "Conversation focused on the selected lane."
      };
  return descriptions[threadType] || descriptions.carrier_private;
}

function carrierChatPlaceholder(threadType = "") {
  const placeholders = portalLanguage() === "es"
    ? {
        carrier_private: "Escribe un mensaje privado a procurement...",
        event_group: "Escribe una pregunta para la sala del evento...",
        lane_group: "Escribe un mensaje sobre esta ruta..."
      }
    : {
        carrier_private: "Write a private message to procurement...",
        event_group: "Write a question for the event room...",
        lane_group: "Write a message about this lane..."
      };
  return placeholders[threadType] || placeholders.carrier_private;
}

function normalizedCarrierChatThreadType(value) {
  return ["carrier_private", "event_group", "lane_group"].includes(value) ? value : "carrier_private";
}

function renderCarrierChat(chat = lastCarrierChat) {
  lastCarrierChat = chat || { rows: [], google_chat_configured: false };
  const panel = card.querySelector("#carrier-bid-chat");
  if (!panel) return;
  const keepOpen = panel.dataset.open === "true";
  const activeThreadType = normalizedCarrierChatThreadType(panel.dataset.threadType);
  panel.dataset.open = keepOpen ? "true" : "false";
  panel.dataset.threadType = activeThreadType;
  const allRows = Array.isArray(lastCarrierChat.rows) ? lastCarrierChat.rows : [];
  const rows = allRows.filter((thread) => normalizedCarrierChatThreadType(thread.thread_type || "event_group") === activeThreadType);
  const messageCount = rows.reduce((sum, thread) => sum + (Array.isArray(thread.messages) ? thread.messages.length : 0), 0);
  const totalMessageCount = allRows.reduce((sum, thread) => sum + (Array.isArray(thread.messages) ? thread.messages.length : 0), 0);
  const threadCounts = allRows.reduce((counts, thread) => {
    const type = normalizedCarrierChatThreadType(thread.thread_type || "event_group");
    counts[type] = (counts[type] || 0) + (Array.isArray(thread.messages) ? thread.messages.length : 0);
    return counts;
  }, {});
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
    <button type="button" class="bid-chat-launcher" data-carrier-chat-toggle aria-expanded="${keepOpen ? "true" : "false"}">
      <span>${escapeHtml(carrierChatLabel(activeThreadType))}</span>
      <small>${escapeHtml(`${totalMessageCount} message(s) | ${chatSyncLabel}`)}</small>
    </button>
    <div class="bid-chat-popover" role="dialog" aria-modal="false" aria-label="${escapeAttribute(dualText("Bid Room messages", "Mensajes del Bid Room"))}">
      <header>
        <div>
          <p class="eyebrow">Bid Room Messages</p>
          <h3>${escapeHtml(carrierChatLabel(activeThreadType))}</h3>
          <p>${escapeHtml(carrierChatDescription(activeThreadType))}</p>
        </div>
        <div class="bid-chat-header-actions">
          <span class="status-pill ${chatSyncTone}">${escapeHtml(chatSyncLabel)}</span>
          <button type="button" class="secondary small-button" data-carrier-chat-close>${escapeHtml(dualText("Close", "Cerrar"))}</button>
        </div>
      </header>
      ${inboundStatus === "needs_reconnect" ? `<p class="status-message warning">Google Chat can send outbound mirror messages, but Settings must be reconnected once before Rateware can import replies typed in Google Chat.</p>` : ""}
      <div class="bid-chat-thread-tabs" role="tablist" aria-label="${escapeAttribute(dualText("Message scope", "Alcance del mensaje"))}">
        ${["carrier_private", "event_group", "lane_group"].map((type) => `
          <button type="button" data-carrier-chat-thread="${escapeHtml(type)}" aria-pressed="${activeThreadType === type ? "true" : "false"}">
            <span>${escapeHtml(carrierChatLabel(type))}</span>
            <small>${escapeHtml(String(threadCounts[type] || 0))}</small>
          </button>
        `).join("")}
      </div>
      <div class="carrier-chat-thread-list">
        ${rows.length ? rows.map((thread) => {
          const messages = Array.isArray(thread.messages) ? thread.messages : [];
          return `
            <article class="bid-room-chat-thread">
              <header>
                <div>
                  <strong>${escapeHtml(thread.title || carrierChatLabel(thread.thread_type || "event_group"))}</strong>
                  <span>${escapeHtml(carrierChatLabel(thread.thread_type || "event_group"))}</span>
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
            <span>${escapeHtml(carrierChatDescription(activeThreadType))}</span>
          </div>
        `}
      </div>
      <form id="carrier-chat-form" class="bid-room-chat-form">
        <input id="carrier-chat-scope" type="hidden" value="${escapeHtml(activeThreadType)}" />
        <textarea id="carrier-chat-message" rows="2" placeholder="${escapeAttribute(carrierChatPlaceholder(activeThreadType))}"></textarea>
        <button type="submit">${escapeHtml(dualText("Send", "Enviar"))}</button>
      </form>
      <p id="carrier-chat-status" class="status-message" role="status"></p>
    </div>
  `;
}

function setCarrierChatOpen(open = true) {
  const panel = card.querySelector("#carrier-bid-chat");
  if (!panel) return;
  panel.dataset.open = open ? "true" : "false";
  panel.querySelector("[data-carrier-chat-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) window.setTimeout(() => panel.querySelector("#carrier-chat-message")?.focus({ preventScroll: true }), 40);
}

function bidSupportPromptList() {
  const lane = lastInvitation?.rfx_lanes || {};
  const route = lane.origin && lane.destination ? `${lane.origin} -> ${lane.destination}` : "";
  const routePromptEs = route ? `Que detalles tiene ${route}?` : "Que detalles tiene esta ruta?";
  const routePromptEn = route ? `What details are available for ${route}?` : "What details are available for this lane?";
  return portalLanguage() === "es"
    ? ["Resumen de la oportunidad", routePromptEs, "Como mejoro mi ranking?", "Que modelo comercial debo elegir?", "Como subo una alternativa?"]
    : ["Opportunity summary", routePromptEn, "How do I improve my rank?", "Which commercial model should I use?", "How do I submit an alternative?"];
}

function renderBidSupportHighlights(items = []) {
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

function renderBidSupportNextSteps(steps = []) {
  if (!Array.isArray(steps) || !steps.length) return "";
  return `
    <div class="bid-support-next-steps">
      <span>${escapeHtml(dualText("Suggested next step", "Siguiente paso sugerido"))}</span>
      <ol>
        ${steps.slice(0, 3).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function renderBidSupportSuggestions(prompts = []) {
  if (!Array.isArray(prompts) || !prompts.length) return "";
  return `
    <div class="bid-support-suggestions">
      <span>${escapeHtml(dualText("Go deeper", "Preguntas para profundizar"))}</span>
      <div class="bid-support-suggestion-actions">
        ${prompts.map((prompt) => `<button type="button" class="secondary small-button" data-bid-support-prompt="${escapeAttribute(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderBidSupportAgent(result = lastBidSupportResult) {
  lastBidSupportResult = result || null;
  const panel = card.querySelector("#bid-support-agent");
  if (!panel) return;
  const keepOpen = panel.dataset.open === "true" || Boolean(result);
  panel.dataset.open = keepOpen ? "true" : "false";
  const event = lastInvitation?.rfx_events || {};
  const lane = lastInvitation?.rfx_lanes || {};
  const scope = result?.scope || [
    dualText("Private Bid Room", "Bid Room privado"),
    event.rfx_id || event.name,
    lane.origin && lane.destination ? `${lane.origin} -> ${lane.destination}` : null
  ].filter(Boolean).join(" | ");
  const starterPrompts = bidSupportPromptList();
  const question = result?.question || lastBidSupportQuestion;
  panel.innerHTML = `
    <button type="button" class="bid-support-launcher" data-bid-support-toggle aria-expanded="${keepOpen ? "true" : "false"}">
      <span>${escapeHtml(dualText("Bid assistant", "Asistente de puja"))}</span>
      <small>${escapeHtml(dualText("Ranking, bid rules, tickets", "Ranking, reglas, tickets"))}</small>
    </button>
    <div class="bid-support-popover" role="dialog" aria-modal="false" aria-label="${escapeAttribute(dualText("Private Bid Room support assistant", "Asistente de soporte del Bid Room privado"))}">
      <header>
        <div>
          <p class="eyebrow">${escapeHtml(dualText("Contextual support", "Soporte contextual"))}</p>
          <h3>${escapeHtml(dualText("Ask about this opportunity", "Pregunta sobre esta oportunidad"))}</h3>
          <p>${escapeHtml(dualText("The assistant can answer from the event, invited lanes, visible business rules, ranking, and current bid context. If it needs procurement, it creates a ticket.", "El asistente puede responder sobre el evento, rutas invitadas, reglas visibles del negocio, ranking y puja actual. Si requiere procurement, crea un ticket."))}</p>
        </div>
        <button type="button" class="secondary small-button" data-bid-support-close>${escapeHtml(dualText("Close", "Cerrar"))}</button>
      </header>
      <p class="bid-support-scope">${escapeHtml(scope || dualText("Private Bid Room context", "Contexto del Bid Room privado"))}</p>
      ${result ? "" : `
        <div class="bid-support-prompts">
          ${starterPrompts.map((prompt) => `<button type="button" class="secondary small-button" data-bid-support-prompt="${escapeAttribute(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
        </div>
      `}
      <div class="bid-support-chat-log">
        ${result ? `
          <div class="bid-support-thread">
            ${question ? `
              <article class="bid-support-message is-user">
                <span>${escapeHtml(dualText("You asked", "Tu pregunta"))}</span>
                <p>${escapeHtml(question)}</p>
              </article>
            ` : ""}
            <article class="bid-support-answer bid-support-message is-assistant" data-needs-ticket="${result.needs_ticket ? "true" : "false"}">
              <div>
                <strong>${escapeHtml(result.intent_label || (result.needs_ticket ? dualText("Human follow-up recommended", "Requiere seguimiento humano") : dualText("Support answer", "Respuesta de soporte")))}</strong>
                <span>${escapeHtml(result.confidence ? `${dualText("Confidence", "Confianza")}: ${result.confidence}` : "")}</span>
              </div>
              ${renderBidSupportHighlights(result.support_highlights)}
              <p>${escapeHtml(result.answer || "")}</p>
              ${renderBidSupportNextSteps(result.next_steps)}
              ${result.ticket?.id ? `<small>${escapeHtml(dualText("Ticket created", "Ticket creado"))}: ${escapeHtml(result.ticket.id)}</small>` : ""}
              ${result.needs_ticket && result.ticket_suggestion ? `<small>${escapeHtml(result.ticket_suggestion)}</small>` : ""}
              ${renderBidSupportSuggestions(result.suggested_prompts)}
            </article>
          </div>
        ` : `
          <article class="bid-support-answer">
            <div>
              <strong>${escapeHtml(dualText("How can I help?", "Como te puedo ayudar?"))}</strong>
              <span>${escapeHtml(dualText("Opportunity + lanes", "Oportunidad + rutas"))}</span>
            </div>
            <p>${escapeHtml(dualText("Ask about the full opportunity, a specific lane, business rules, ranking, commercial model, ETA, alternatives, or next steps.", "Pregunta sobre la oportunidad completa, una ruta especifica, reglas de negocio, ranking, modelo comercial, ETA, alternativas o siguientes pasos."))}</p>
          </article>
        `}
      </div>
      <form id="bid-support-form" class="bid-support-form bid-support-chat-form">
        <textarea id="bid-support-message" rows="2" placeholder="${escapeAttribute(dualText("Ask the Bid Room assistant...", "Pregunta al asistente del Bid Room..."))}">${escapeHtml(lastBidSupportQuestion)}</textarea>
        <div>
          <button type="submit">${escapeHtml(dualText("Send", "Enviar"))}</button>
          ${result?.needs_ticket ? `<button type="button" class="secondary" data-create-support-ticket>${escapeHtml(dualText("Create ticket", "Crear ticket"))}</button>` : ""}
        </div>
        <p id="bid-support-status" class="status-message" role="status"></p>
      </form>
    </div>
  `;
}

function setBidSupportOpen(open = true) {
  const panel = card.querySelector("#bid-support-agent");
  if (!panel) return;
  panel.dataset.open = open ? "true" : "false";
  panel.querySelector("[data-bid-support-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) window.setTimeout(() => panel.querySelector("#bid-support-message")?.focus({ preventScroll: true }), 40);
}

async function askBidSupport(options = {}) {
  const status = card.querySelector("#bid-support-status");
  const input = card.querySelector("#bid-support-message");
  const message = String(options.createTicket ? lastBidSupportQuestion : input?.value || "").trim();
  if (!message) {
    if (status) {
      status.textContent = dualText("Write a support question first.", "Escribe una pregunta primero.");
      status.dataset.tone = "error";
    }
    input?.focus();
    return;
  }
  lastBidSupportQuestion = message;
  if (status) {
    status.textContent = options.createTicket
      ? dualText("Creating ticket...", "Creando ticket...")
      : dualText("Checking opportunity context...", "Revisando contexto de la oportunidad...");
    status.dataset.tone = "neutral";
  }
  try {
    const result = await callBidApi("bid_support_reply", {
      message,
      create_ticket: options.createTicket === true,
      language: portalLanguage()
    });
    renderBidSupportAgent(result);
    queuePrivateBidAlert(result.ticket?.id ? "supportTicket" : "supportAnswer", result.intent_label || result.answer || privateAlertPhrase("supportAnswer"));
    const nextStatus = card.querySelector("#bid-support-status");
    if (nextStatus) {
      nextStatus.textContent = result.ticket?.id
        ? dualText("Ticket created for procurement follow-up.", "Ticket creado para seguimiento de procurement.")
        : result.needs_ticket
          ? dualText("Support recommends creating a ticket.", "Soporte recomienda crear un ticket.")
          : dualText("Answered from opportunity and lane context.", "Respondido con contexto de oportunidad y rutas.");
      nextStatus.dataset.tone = result.ticket?.id || !result.needs_ticket ? "success" : "warning";
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || dualText("Support could not answer.", "Soporte no pudo responder.");
      status.dataset.tone = "error";
    }
  }
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
    return `<tr><td colspan="8">${escapeHtml(dualText("No opportunities match this view.", "No hay oportunidades que coincidan con esta vista."))}</td></tr>`;
  }
  return rows.map((row) => {
    const lane = row.lane || {};
    const event = row.event || {};
    const amount = row.bid_rate !== null && row.bid_rate !== undefined ? formatMoney(row.bid_rate, row.currency || lane.currency) : "-";
    const boardAmount = row.board_rate !== null && row.board_rate !== undefined ? formatMoney(row.board_rate, row.currency || lane.currency) : "";
    const action = row.is_invited
      ? `<a class="secondary small-button" href="./rfx-bid.html?token=${encodeURIComponent(row.invitation_token || "")}">${escapeHtml(dualText("Open bid", "Abrir puja"))}</a>`
      : `<button class="secondary small-button" type="button" data-request-lane="${escapeHtml(lane.id || "")}">${escapeHtml(statusLabel("not_invited"))}</button>`;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(event.rfx_id || event.name || "-")}</strong>
          <small>${escapeHtml(event.customer || "")}${event.due_date ? ` | ${escapeHtml(dualText("Due", "Vence"))} ${escapeHtml(formatDate(event.due_date))}` : ""}</small>
        </td>
        <td>
          ${escapeHtml(laneLabel(lane))}
          <small>${escapeHtml(marketLabel(lane))}</small>
        </td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</td>
        <td>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</td>
        <td>${renderBookFitSummary(row)}</td>
        <td><span class="status-pill ${statusTone(bookStatus(row))}">${escapeHtml(statusLabel(bookStatus(row)))}</span></td>
        <td>
          ${amount}
          ${boardAmount && boardAmount !== amount ? `<small>${escapeHtml(dualText(`Board ${boardAmount}`, `Board ${boardAmount}`))}</small>` : ""}
          <small>${row.weekly_capacity ? `${escapeHtml(row.weekly_capacity)} / wk` : ""}</small>
          <small title="${escapeAttribute(row.bid_rate !== null && row.bid_rate !== undefined ? commercialFeeSummary(row) : "")}">${escapeHtml(row.bid_rate !== null && row.bid_rate !== undefined ? commercialSummary(row) : "")}</small>
        </td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");
}

function renderBookFitSummary(row = {}) {
  const tags = fitTags(row).filter(Boolean);
  if (!tags.length) return `<span class="book-fit-summary">No fit tags</span>`;
  const label = tags.length > 1 ? `${tags[0]} +${tags.length - 1}` : tags[0];
  return `<span class="book-fit-summary" title="${escapeAttribute(tags.join(" | "))}">${escapeHtml(label)}</span>`;
}

function quickBidRows(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  return currentEventBookRows(carrierBook, event).filter((row) => row.is_invited && row.invitation_token);
}

function quickBidCommercialPercent(row = {}) {
  const model = String(row.commercial_model || "direct_cost_plus").toLowerCase();
  if (model === "carrier_share") return row.carrier_share_pct ?? "";
  if (model === "direct_cost_plus") return row.marksman_margin_pct ?? "";
  return "";
}

function quickBidRowStatus(row = {}) {
  if (!lastQuickBidSaveStatus || lastQuickBidSaveStatus.token !== row.invitation_token) return "";
  return `<span class="status-message" data-tone="${escapeAttribute(lastQuickBidSaveStatus.tone || "neutral")}">${escapeHtml(lastQuickBidSaveStatus.message || "")}</span>`;
}

function renderQuickLaneBidGridShell(carrierBook = {}, invitation = {}) {
  const rows = quickBidRows(carrierBook, invitation);
  if (!rows.length) return "";
  return `
    <section id="carrier-quick-bid-grid" class="carrier-quick-bid-grid">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">${escapeHtml(dualText("Quick lane bids", "Pujas rapidas por ruta"))}</p>
          <h3>${escapeHtml(dualText("Quote or edit every invited lane in rows", "Cotiza o edita cada ruta invitada en filas"))}</h3>
        </div>
        <span class="status-pill neutral">${escapeHtml(dualText(`${rows.length} editable lane(s)`, `${rows.length} ruta(s) editables`))}</span>
      </div>
      <p class="bid-board-note">${escapeHtml(dualText(
        "Use this grid for fast price, capacity and transit updates. Open the guided form only when you need alternatives, ETA, unit details or full notes.",
        "Usa esta grilla para actualizar rapido precio, capacidad y transito. Abre el formulario guiado solo si necesitas alternativas, ETA, datos de unidad o notas completas."
      ))}</p>
      <div class="table-wrap">
        <table class="quick-bid-table">
          <thead>
            <tr>
              <th>Lane</th>
              <th>${escapeHtml(dualText("Equipment", "Equipo"))}</th>
              <th>${escapeHtml(dualText("All-in", "All-in"))}</th>
              <th>${escapeHtml(dualText("Currency", "Moneda"))}</th>
              <th>${escapeHtml(dualText("Capacity", "Capacidad"))}</th>
              <th>${escapeHtml(dualText("Transit", "Transito"))}</th>
              <th>${escapeHtml(dualText("Commercial", "Comercial"))}</th>
              <th>${escapeHtml(dualText("%", "%"))}</th>
              <th>${escapeHtml(dualText("Status", "Estado"))}</th>
              <th>${escapeHtml(dualText("Action", "Accion"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const lane = row.lane || {};
              const model = String(row.commercial_model || "direct_cost_plus").toLowerCase();
              return `
                <tr
                  data-quick-bid-row
                  data-invitation-token="${escapeAttribute(row.invitation_token || "")}"
                  data-best-alternative="${escapeAttribute(row.best_alternative_offered ? "true" : "false")}"
                  data-alternative-equipment="${escapeAttribute(row.alternative_equipment || "")}"
                  data-alternative-units="${escapeAttribute(row.alternative_units ?? "")}"
                  data-alternative-notes="${escapeAttribute(row.alternative_notes || "")}"
                  data-equipment-available="${escapeAttribute(row.equipment_available === true ? "true" : row.equipment_available === false ? "false" : "")}"
                  data-unit-details="${escapeAttribute(row.unit_details || "")}"
                  data-eta-pickup="${escapeAttribute(row.eta_pickup || "")}"
                  data-eta-delivery="${escapeAttribute(row.eta_delivery || "")}"
                  data-mirror-account-enabled="${escapeAttribute(row.mirror_account_enabled ? "true" : "false")}"
                  data-availability-validation-notes="${escapeAttribute(row.availability_validation_notes || "")}"
                  data-notes="${escapeAttribute(row.notes || "")}"
                >
                  <td>
                    <strong>${escapeHtml(laneLabel(lane))}</strong>
                    <small>${escapeHtml([lane.lane_number ? `#${lane.lane_number}` : null, marketLabel(lane)].filter(Boolean).join(" | "))}</small>
                  </td>
                  <td>
                    ${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}
                    <small>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</small>
                  </td>
                  <td><input data-quick-bid-field="bid_rate" inputmode="decimal" value="${escapeAttribute(row.bid_rate ?? "")}" placeholder="2900" /></td>
                  <td>
                    <select data-quick-bid-field="currency">
                      ${["USD", "MXN", "CAD"].map((currency) => `<option value="${currency}" ${currency === (row.currency || lane.currency || "USD") ? "selected" : ""}>${currency}</option>`).join("")}
                    </select>
                  </td>
                  <td><input data-quick-bid-field="weekly_capacity" inputmode="decimal" value="${escapeAttribute(row.weekly_capacity ?? "")}" placeholder="5" /></td>
                  <td><input data-quick-bid-field="transit_days" inputmode="decimal" value="${escapeAttribute(row.transit_days ?? "")}" placeholder="2" /></td>
                  <td>
                    <select data-quick-bid-field="commercial_model">
                      <option value="direct_cost_plus" ${model === "direct_cost_plus" ? "selected" : ""}>Cost-plus</option>
                      <option value="carrier_share" ${model === "carrier_share" ? "selected" : ""}>Carrier share</option>
                      <option value="xbf_buy_sell" ${model === "xbf_buy_sell" ? "selected" : ""}>XBF buy-sell</option>
                    </select>
                  </td>
                  <td><input data-quick-bid-field="commercial_pct" inputmode="decimal" value="${escapeAttribute(quickBidCommercialPercent(row))}" placeholder="${model === "xbf_buy_sell" ? "-" : "2-5"}" ${model === "xbf_buy_sell" ? "disabled" : ""} /></td>
                  <td class="quick-bid-row-status">${quickBidRowStatus(row)}</td>
                  <td><button type="button" class="small-button" data-save-quick-bid>${escapeHtml(row.bid_rate ? dualText("Update", "Actualizar") : dualText("Submit", "Enviar"))}</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderQuickLaneBidGrid(carrierBook = lastCarrierBook || {}, invitation = lastInvitation || {}) {
  const grid = card.querySelector("#carrier-quick-bid-grid");
  const html = renderQuickLaneBidGridShell(carrierBook, invitation);
  if (grid && html) {
    grid.outerHTML = html;
  } else if (grid && !html) {
    grid.remove();
  }
}

function quickBidField(rowElement, field) {
  return rowElement.querySelector(`[data-quick-bid-field="${field}"]`)?.value || "";
}

function quickBidDraftFromRow(rowElement) {
  const commercialModel = quickBidField(rowElement, "commercial_model") || "direct_cost_plus";
  const commercialPercent = quickBidField(rowElement, "commercial_pct");
  return {
    bid_rate: quickBidField(rowElement, "bid_rate"),
    currency: quickBidField(rowElement, "currency") || "USD",
    weekly_capacity: quickBidField(rowElement, "weekly_capacity"),
    transit_days: quickBidField(rowElement, "transit_days"),
    commercial_model: commercialModel,
    marksman_margin_pct: commercialModel === "direct_cost_plus" ? commercialPercent : "",
    carrier_share_pct: commercialModel === "carrier_share" ? commercialPercent : "",
    best_alternative_offered: rowElement.dataset.bestAlternative === "true",
    alternative_equipment: rowElement.dataset.alternativeEquipment || "",
    alternative_units: rowElement.dataset.alternativeUnits || "",
    alternative_notes: rowElement.dataset.alternativeNotes || "",
    equipment_available: rowElement.dataset.equipmentAvailable || "",
    unit_details: rowElement.dataset.unitDetails || "",
    eta_pickup: dateTimeLocalValue(rowElement.dataset.etaPickup || ""),
    eta_delivery: dateTimeLocalValue(rowElement.dataset.etaDelivery || ""),
    mirror_account_enabled: rowElement.dataset.mirrorAccountEnabled === "true",
    availability_validation_notes: rowElement.dataset.availabilityValidationNotes || "",
    best_final: false,
    notes: rowElement.dataset.notes || ""
  };
}

function setQuickBidRowStatus(rowElement, message, tone = "neutral") {
  const status = rowElement.querySelector(".quick-bid-row-status");
  if (!status) return;
  status.innerHTML = `<span class="status-message" data-tone="${escapeAttribute(tone)}">${escapeHtml(message)}</span>`;
}

function markQuickBidRowInvalid(rowElement, field) {
  rowElement.querySelectorAll("[aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
  const map = {
    "bid-rate": "bid_rate",
    "bid-currency": "currency",
    "bid-capacity": "weekly_capacity",
    "bid-transit-days": "transit_days",
    "bid-marksman-margin": "commercial_pct",
    "bid-carrier-share": "commercial_pct"
  };
  const input = rowElement.querySelector(`[data-quick-bid-field="${map[field] || field}"]`);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
}

async function saveQuickBidRow(rowElement, button) {
  const rowToken = rowElement.dataset.invitationToken || "";
  const draft = quickBidDraftFromRow(rowElement);
  const validation = validateBidDraft(draft);
  rowElement.querySelectorAll("[aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
  if (!rowToken) {
    setQuickBidRowStatus(rowElement, dualText("Missing invitation token.", "Falta token de invitacion."), "error");
    return;
  }
  if (validation.errors.length) {
    setQuickBidRowStatus(rowElement, validation.errors[0].message, "error");
    markQuickBidRowInvalid(rowElement, validation.errors[0].field);
    return;
  }
  button.disabled = true;
  setQuickBidRowStatus(rowElement, dualText("Saving lane offer...", "Guardando oferta de la ruta..."), "neutral");
  try {
    await callBidApi("submit_bid", { token: rowToken, ...draft });
    lastQuickBidSaveStatus = {
      token: rowToken,
      tone: "success",
      message: dualText("Saved. Published as the latest offer.", "Guardado. Publicado como la oferta mas reciente.")
    };
    queuePrivateBidAlert("bidSubmitted", dualText("Lane offer updated.", "Oferta de ruta actualizada."));
    await loadInvitation({ refreshOnly: true, refreshForm: rowToken === tokenFromUrl(), refreshQuickGrid: true });
  } catch (error) {
    setQuickBidRowStatus(rowElement, error.message, "error");
    button.disabled = false;
  }
}

function currentEventBookRows(carrierBook = {}, event = {}) {
  const eventId = String(event.id || "");
  const rows = Array.isArray(carrierBook.invited) ? carrierBook.invited : [];
  if (!eventId) return rows;
  return rows.filter((row) => String(row.event?.id || "") === eventId);
}

function renderCarrierLaneSwitcher(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  const currentLaneId = String(invitation.rfx_lane_id || invitation.rfx_lanes?.id || "");
  const rows = currentEventBookRows(carrierBook, event);
  if (rows.length <= 1) return "";
  return `
    <section class="carrier-lane-switcher" id="carrier-lane-book-overview">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Invited lane book</p>
          <h3>${escapeHtml(dualText(`${rows.length} lanes available in this RFx`, `${rows.length} lanes disponibles en este RFx`))}</h3>
        </div>
        <span class="status-pill neutral">${escapeHtml(dualText("Pick a lane to quote", "Elige una lane para cotizar"))}</span>
      </div>
      <p class="bid-board-note">${escapeHtml(dualText("Your private invitation covers multiple lanes. The form below is for the selected lane; use this list to switch routes.", "Tu invitacion privada cubre multiples lanes. El formulario inferior corresponde a la lane seleccionada; usa esta lista para cambiar de ruta."))}</p>
      <div class="carrier-lane-switcher-grid">
        ${rows.map((row) => {
          const lane = row.lane || {};
          const isCurrent = String(lane.id || "") === currentLaneId || String(row.invitation_id || "") === String(invitation.id || "");
          return `
            <article class="${isCurrent ? "is-current" : ""}">
              <div>
                <span class="status-pill ${statusTone(bookStatus(row))}">${escapeHtml(isCurrent ? dualText("Selected lane", "Lane seleccionada") : statusLabel(bookStatus(row)))}</span>
                <strong>${escapeHtml(laneLabel(lane))}</strong>
                <small>${escapeHtml([marketLabel(lane), [lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / "), [lane.operation, lane.service].filter(Boolean).join(" / ")].filter(Boolean).join(" | "))}</small>
              </div>
              <a class="${isCurrent ? "small-button" : "secondary small-button"}" href="./rfx-bid.html?token=${encodeURIComponent(row.invitation_token || "")}">
                ${escapeHtml(isCurrent ? dualText("Current bid", "Puja actual") : dualText("Open lane", "Abrir lane"))}
              </a>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
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

function renderInvitation(invitation, liveBoard = {}, carrierBook = {}) {
  lastInvitation = invitation;
  pendingBidTemplateRows = [];
  const event = invitation.rfx_events || {};
  const lane = invitation.rfx_lanes || {};
  const vendor = invitation.vendors || {};
  const deadline = deadlineCopy(event);
  const multiLaneRows = currentEventBookRows(carrierBook, event);
  const isBookView = viewModeFromUrl() === "book" && multiLaneRows.length > 1;
  syncPortalLanguageChrome();
  title.textContent = event.name || event.rfx_id || "Private Bid Room";
  card.innerHTML = `
    <section class="bid-room-hero">
      <div>
        <p class="eyebrow">${escapeHtml(t("privateRoom"))}</p>
        <h2>${escapeHtml(event.name || event.rfx_id || t("requestFallback"))}</h2>
        <p>${escapeHtml(t("carrierCanReview", {
          carrier: vendor.vendor_name || vendor.domain || t("carrier"),
          lane_count: multiLaneRows.length > 1 ? t("invitedLanes", { count: multiLaneRows.length }) : t("selectedLane")
        }))}</p>
      </div>
      <aside class="bid-room-hero-side">
        <div class="bid-room-deadline-card">
          <span class="status-pill" data-tone="${deadline.tone}">${escapeHtml(deadline.label)}</span>
          <strong>${escapeHtml(event.rfx_id || "RFx")}</strong>
          <small>${escapeHtml(deadline.detail)}</small>
        </div>
        <div class="bid-room-hero-toolbar" aria-label="${escapeAttribute(t("multimediaAlerts"))}">
          <div class="bid-room-language-toggle" aria-label="${escapeAttribute(t("languageToggle"))}">
            <span>${escapeHtml(t("languageToggle"))}</span>
            <button type="button" data-private-language-toggle="en" aria-pressed="${portalLanguage() === "en" ? "true" : "false"}">EN</button>
            <button type="button" data-private-language-toggle="es" aria-pressed="${portalLanguage() === "es" ? "true" : "false"}">ES</button>
          </div>
          <button id="private-bid-sound" class="bid-room-sound-toggle" type="button" aria-pressed="${privateAlertState.soundEnabled ? "true" : "false"}">
            ${escapeHtml(privateAlertState.soundEnabled ? t("soundOn") : t("soundOff"))}
          </button>
        </div>
        <div class="bid-room-hero-actions">
          <button type="button" class="secondary small-button" data-carrier-chat-focus="carrier_private">
            ${escapeHtml(t("talkToUs"))}
          </button>
          <button type="button" class="secondary small-button" data-bid-support-focus>
            ${escapeHtml(t("chatSupport"))}
          </button>
          <a class="secondary small-button" href="${escapeAttribute(eventMarketplaceUrl(event))}" target="_blank" rel="noreferrer" title="${escapeAttribute(t("publicLiveBoardHelp"))}">
            ${escapeHtml(t("goMarketplace"))}
          </a>
        </div>
        <div class="bid-room-alert-feed">
          <span>${escapeHtml(t("rankingMovement"))}</span>
          <div id="private-bid-alerts" class="private-bid-alerts" aria-live="polite">
            <p>${escapeHtml(privateAlertState.soundEnabled ? t("noMovementSoundOn") : t("noMovementSoundOff"))}</p>
          </div>
        </div>
      </aside>
    </section>

    <div class="bid-context">
      <article><span>${escapeHtml(t("customer"))}</span><strong>${escapeHtml(event.customer || "-")}</strong></article>
      <article><span>${escapeHtml(t("carrier"))}</span><strong>${escapeHtml(vendor.vendor_name || vendor.domain || "-")}</strong></article>
      <article><span>${escapeHtml(t("visibility"))}</span><strong>${escapeHtml(visibilityLabel(liveBoard.visibility || {}))}</strong></article>
      <article><span>${escapeHtml(t("refresh"))}</span><strong>30 sec</strong></article>
    </div>

    <section id="bid-support-agent" class="bid-support-agent bid-support-widget private-bid-support-widget" data-open="false">
      <p class="status-message">${escapeHtml(dualText("Loading contextual support...", "Cargando soporte contextual..."))}</p>
    </section>

    <section id="carrier-award-outcome" class="carrier-award-outcome" hidden></section>

    ${renderCarrierLaneSwitcher(carrierBook, invitation)}

    ${renderBidTemplateTools(carrierBook, invitation)}

    ${renderQuickLaneBidGridShell(carrierBook, invitation)}

    <section class="bid-lane-summary">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">${escapeHtml(isBookView ? t("selectedLaneFromBook") : t("currentLane"))}</p>
          <h2>${escapeHtml(formatLane(lane))}</h2>
        </div>
        <span class="status-pill neutral">${escapeHtml(statusLabel(invitation.invitation_status))}</span>
      </div>
      <dl>
        <div><dt>${escapeHtml(t("equipment"))}</dt><dd>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</dd></div>
        <div><dt>${escapeHtml(t("operation"))}</dt><dd>${escapeHtml(lane.operation || "-")}</dd></div>
        <div><dt>${escapeHtml(t("service"))}</dt><dd>${escapeHtml(lane.service || "-")}</dd></div>
        <div><dt>${escapeHtml(t("weeklyVolume"))}</dt><dd>${escapeHtml(lane.weekly_volume ?? "-")}</dd></div>
      </dl>
      ${laneDetailSections(lane).length ? `
        <div class="bid-lane-detail-sections">
          ${laneDetailSections(lane).map(([label, value]) => `
            <article>
              <span>${escapeHtml(label)}</span>
              <div class="bid-lane-rich-text">${renderLaneDetailValue(value)}</div>
            </article>
          `).join("")}
        </div>
      ` : ""}
    </section>

    <section id="bid-live-board" class="bid-live-board">
      <p class="status-message">${escapeHtml(t("loadingLiveRoom"))}</p>
    </section>

    <section id="carrier-bid-history" class="carrier-bid-history">
      <p class="status-message">${escapeHtml(t("loadingHistory"))}</p>
    </section>

    <section id="carrier-bid-chat" class="carrier-bid-chat bid-chat-widget" data-open="false">
      <p class="status-message">${escapeHtml(t("loadingChat"))}</p>
    </section>

    <section class="bid-offer-launcher">
      <div>
        <p class="eyebrow">${escapeHtml(t("submitOrUpdate"))}</p>
        <h3>${escapeHtml(dualText("Advanced offer editor", "Editor avanzado de oferta"))}</h3>
        <p>${escapeHtml(dualText(
          "Use the row grid for quick updates. Open this editor for alternatives, ETA, unit details, notes and best-final confirmation.",
          "Usa la grilla para cambios rapidos. Abre este editor para alternativas, ETA, datos de unidad, notas y confirmacion best-final."
        ))}</p>
      </div>
      <button type="button" data-open-bid-editor>${escapeHtml(dualText("Open offer editor", "Abrir editor de oferta"))}</button>
    </section>

    <div id="bid-editor-modal" class="bid-editor-modal" hidden>
      <button class="bid-editor-scrim" type="button" data-close-bid-editor aria-label="Close offer editor"></button>
      <div class="bid-editor-panel" role="dialog" aria-modal="true" aria-labelledby="bid-editor-title">
    <form id="bid-form" class="bid-form">
      <div class="bid-form-header">
        <div>
          <p class="eyebrow">${escapeHtml(t("submitOrUpdate"))}</p>
          <h3 id="bid-editor-title">${escapeHtml(t("guidedBidFlow"))}</h3>
        </div>
        <div class="bid-form-header-actions">
          <span class="status-pill muted" data-bid-form-mode>${escapeHtml(t("primaryAlt"))}</span>
          <button type="button" class="secondary small-button" data-close-bid-editor>${escapeHtml(dualText("Close", "Cerrar"))}</button>
        </div>
      </div>
      <div class="carrier-bid-workflow full-width" aria-label="Bid steps">
        <button type="button" data-bid-section-target="primary">${escapeHtml(t("submitPrimary"))}</button>
        <button type="button" data-bid-section-target="commercial">${escapeHtml(t("commercialModel"))}</button>
        <button type="button" data-bid-section-target="alternative">${escapeHtml(t("addAlternative"))}</button>
        <button type="button" data-bid-section-target="capacity">${escapeHtml(t("confirmCapacity"))}</button>
        <button type="button" data-bid-section-target="review">${escapeHtml(t("bestFinal"))}</button>
      </div>
      <section class="guided-bid-section full-width" data-bid-section="primary">
        <div class="bid-form-section-title">
          <strong>${escapeHtml(t("primaryOffer"))}</strong>
          <span>${escapeHtml(t("primaryOfferCopy"))}</span>
        </div>
        <div class="guided-bid-fields">
          <label>
            ${escapeHtml(t("allInRate"))}
            <input id="bid-rate" required inputmode="decimal" value="${escapeHtml(invitation.bid_rate ?? "")}" placeholder="2900" />
          </label>
          <label>
            ${escapeHtml(t("currency"))}
            <select id="bid-currency">
              ${["USD", "MXN", "CAD"].map((currency) => `<option value="${currency}" ${currency === (invitation.currency || lane.currency || "USD") ? "selected" : ""}>${currency}</option>`).join("")}
            </select>
          </label>
          <label>
            ${escapeHtml(t("weeklyCapacity"))}
            <input id="bid-capacity" inputmode="decimal" value="${escapeHtml(invitation.weekly_capacity ?? "")}" placeholder="5" />
          </label>
          <label>
            ${escapeHtml(t("transitDays"))}
            <input id="bid-transit-days" inputmode="decimal" value="${escapeHtml(invitation.transit_days ?? "")}" placeholder="2" />
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="commercial">
        <div class="bid-form-section-title">
          <strong>${escapeHtml(t("commercialStructure"))}</strong>
          <span id="bid-commercial-active-percent">${escapeHtml(t("suggestedMargin"))}</span>
        </div>
        <div id="bid-commercial-helper" class="commercial-structure-helper"></div>
        <div class="guided-bid-fields">
          <label>
            ${escapeHtml(t("commercialModel"))}
            <select id="bid-commercial-model">
              ${[
                ["direct_cost_plus", dualText("Direct carrier / cost-plus", "Carrier directo / cost-plus")],
                ["carrier_share", dualText("Carrier shares billing %", "Carrier comparte facturacion %")],
                ["xbf_buy_sell", dualText("XBF buy-sell", "XBF compra-venta")]
              ].map(([value, label]) => `<option value="${value}" ${value === (invitation.commercial_model || "direct_cost_plus") ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label data-commercial-field="marksman">
            ${escapeHtml(t("suggestedMargin"))}
            <span class="field-help" title="Adds this percentage to the board/customer comparable price over your all-in rate.">?</span>
            <input id="bid-marksman-margin" inputmode="decimal" value="${escapeHtml(invitation.marksman_margin_pct ?? "")}" placeholder="2-5" />
          </label>
          <label data-commercial-field="carrier">
            ${escapeHtml(t("carrierShare"))}
            <span class="field-help" title="Keeps your bid price unchanged and calculates the fee billed after the customer pays.">?</span>
            <input id="bid-carrier-share" inputmode="decimal" value="${escapeHtml(invitation.carrier_share_pct ?? "")}" placeholder="2-5" />
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="alternative">
        <div class="bid-form-section-title">
          <strong>${escapeHtml(t("bestAlternative"))}</strong>
          <span>Offer substitute equipment, multiple units, or a different capacity model.</span>
        </div>
        <div class="guided-bid-fields">
          <label class="bid-checkbox-label">
            <input id="bid-alt-enabled" type="checkbox" ${invitation.best_alternative_offered ? "checked" : ""} />
            ${escapeHtml(t("bestAlternativeOffer"))}
          </label>
          <label>
            ${escapeHtml(t("alternativeEquipment"))}
            <input id="bid-alt-equipment" value="${escapeHtml(invitation.alternative_equipment || "")}" placeholder="2 x 3.5 ton, 4 vans..." />
          </label>
          <label>
            ${escapeHtml(t("alternativeUnits"))}
            <input id="bid-alt-units" inputmode="decimal" value="${escapeHtml(invitation.alternative_units ?? "")}" placeholder="2" />
          </label>
          <label class="wide-field">
            ${escapeHtml(t("alternativeNotes"))}
            <textarea id="bid-alt-notes" rows="2" placeholder="Capacity, restrictions, rate assumptions for the alternative...">${escapeHtml(invitation.alternative_notes || "")}</textarea>
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="capacity">
        <div class="bid-form-section-title">
          <strong>${escapeHtml(t("liveCapacity"))}</strong>
          <span>${escapeHtml(t("liveCapacityCopy"))}</span>
        </div>
        <div class="guided-bid-fields">
          <label>
            ${escapeHtml(t("equipmentAvailable"))}
            <select id="bid-equipment-available">
              <option value="" ${invitation.equipment_available === null || invitation.equipment_available === undefined ? "selected" : ""}>${escapeHtml(t("notDeclared"))}</option>
              <option value="true" ${invitation.equipment_available === true ? "selected" : ""}>${escapeHtml(t("available"))}</option>
              <option value="false" ${invitation.equipment_available === false ? "selected" : ""}>${escapeHtml(t("notAvailable"))}</option>
            </select>
          </label>
          <label>
            ${escapeHtml(t("etaPickup"))}
            <input id="bid-eta-pickup" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(invitation.eta_pickup))}" />
          </label>
          <label>
            ${escapeHtml(t("etaDelivery"))}
            <input id="bid-eta-delivery" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(invitation.eta_delivery))}" />
          </label>
          <label class="bid-checkbox-label">
            <input id="bid-mirror-account" type="checkbox" ${invitation.mirror_account_enabled ? "checked" : ""} />
            ${escapeHtml(t("mirrorAccount"))}
          </label>
          <label class="wide-field">
            ${escapeHtml(t("unitDetails"))}
            <textarea id="bid-unit-details" rows="2" placeholder="Truck, trailer, driver, plate, tracking or mirror account validation details...">${escapeHtml(invitation.unit_details || "")}</textarea>
          </label>
        </div>
      </section>
      <section class="guided-bid-section full-width" data-bid-section="review">
        <div class="bid-form-section-title">
          <strong>${escapeHtml(t("reviewSubmit"))}</strong>
          <span>${escapeHtml(t("reviewCopy"))}</span>
        </div>
        <div id="bid-review-summary" class="bid-review-summary"></div>
        <label class="wide-field">
          ${escapeHtml(t("notes"))}
          <textarea id="bid-notes" rows="3" placeholder="Assumptions, validity, accessorials...">${escapeHtml(invitation.notes || "")}</textarea>
        </label>
        <div class="bid-final-actions">
          <label class="bid-checkbox-label">
            <input id="bid-best-final" type="checkbox" />
            ${escapeHtml(t("bestFinal"))}
          </label>
          <label class="bid-checkbox-label">
            <input id="bid-confirm-review" type="checkbox" />
            ${escapeHtml(t("confirmTerms"))}
          </label>
          <button type="submit" data-bid-submit-button>${escapeHtml(t("submitPrimary"))}</button>
        </div>
      </section>
      <p id="bid-submit-status" class="status-message" role="status"></p>
    </form>
      </div>
    </div>

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
    const wasUpdate = hasSubmittedOffer();
    try {
      await callBidApi("submit_bid", draft);
      status.textContent = wasUpdate
        ? dualText("Offer revision saved. Your updated price and capacity are now published.", "Revision guardada. Tu tarifa y capacidad actualizadas ya estan publicadas.")
        : "Bid submitted with commercial and availability details. Your rank will refresh automatically.";
      status.dataset.tone = "success";
      queuePrivateBidAlert("bidSubmitted", wasUpdate ? dualText("Your offer was updated.", "Tu oferta fue actualizada.") : "Your bid was submitted. The live board will refresh your rank automatically.");
      await loadInvitation({ refreshOnly: true, refreshForm: true });
    } catch (error) {
      status.textContent = error.message;
      status.dataset.tone = "error";
    }
  });
  renderLiveBoard(liveBoard);
  renderBidSupportAgent();
  syncCommercialStructureFields();
  updateBidReviewSummary();
  syncBidFormMode();
}

async function loadInvitation(options = {}) {
  if (!tokenFromUrl()) {
    card.innerHTML = `<p class="status-message" data-tone="error">Missing invitation token.</p>`;
    return;
  }
  try {
    const data = await callBidApi("get_invitation");
    lastInvitation = data.invitation;
    lastLiveBoard = data.live_board || {};
    rememberPublicBoardInvitationAccess(data.invitation || {}, data.carrier_book || {});
    if (options.refreshOnly && card.querySelector("#bid-form")) {
      renderLiveBoard(data.live_board);
      renderAwardOutcome(data.invitation, data.carrier_book, data.live_board);
      renderBidHistory(data.bid_history);
      renderCarrierBook(data.carrier_book);
      if (options.refreshForm) hydrateBidFormFromOffer(currentSubmittedOffer(data.live_board), data.invitation);
      else syncBidFormMode();
      const quickGridHasFocus = Boolean(document.activeElement?.closest?.("#carrier-quick-bid-grid"));
      if (options.refreshQuickGrid || !quickGridHasFocus) renderQuickLaneBidGrid(data.carrier_book, data.invitation);
    } else {
      renderInvitation(data.invitation, data.live_board, data.carrier_book);
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
  const languageToggleButton = event.target.closest("[data-private-language-toggle]");
  if (languageToggleButton) {
    await setPrivateLanguage(languageToggleButton.dataset.privateLanguageToggle);
    return;
  }

  const soundButton = event.target.closest("#private-bid-sound");
  if (soundButton) {
    soundButton.disabled = true;
    soundButton.textContent = privateAlertState.soundEnabled
      ? dualText("Turning off...", "Apagando...")
      : dualText("Turning on...", "Activando...");
    try {
      if (privateAlertState.soundEnabled) disablePrivateBidAlerts();
      else await enablePrivateBidAlerts();
    } catch (_error) {
      privateAlertState.soundEnabled = false;
      localStorage.setItem("rateware.privateBidRoom.sound", "off");
      soundButton.disabled = false;
      soundButton.textContent = t("soundOff");
    }
    renderPrivateBidAlerts();
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

  const editCurrentOfferButton = event.target.closest("[data-edit-current-offer]");
  if (editCurrentOfferButton) {
    focusCurrentOfferEditor();
    return;
  }

  const openBidEditorButton = event.target.closest("[data-open-bid-editor]");
  if (openBidEditorButton) {
    hydrateBidFormFromOffer(currentSubmittedOffer(), lastInvitation || {});
    openBidEditor({ section: "primary", focusSelector: "#bid-rate" });
    return;
  }

  const closeBidEditorButton = event.target.closest("[data-close-bid-editor]");
  if (closeBidEditorButton) {
    closeBidEditor();
    return;
  }

  const quickBidSaveButton = event.target.closest("[data-save-quick-bid]");
  if (quickBidSaveButton) {
    const row = quickBidSaveButton.closest("[data-quick-bid-row]");
    if (row) await saveQuickBidRow(row, quickBidSaveButton);
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
    const panel = card.querySelector("#carrier-bid-chat");
    if (panel) {
      panel.dataset.threadType = normalizedCarrierChatThreadType(chatFocusButton.dataset.carrierChatFocus || "carrier_private");
      renderCarrierChat(lastCarrierChat);
    }
    setCarrierChatOpen(true);
    return;
  }

  const chatThreadButton = event.target.closest("[data-carrier-chat-thread]");
  if (chatThreadButton) {
    const panel = card.querySelector("#carrier-bid-chat");
    if (panel) {
      panel.dataset.threadType = normalizedCarrierChatThreadType(chatThreadButton.dataset.carrierChatThread);
      renderCarrierChat(lastCarrierChat);
      setCarrierChatOpen(true);
    }
    return;
  }

  const chatToggleButton = event.target.closest("[data-carrier-chat-toggle]");
  if (chatToggleButton) {
    const panel = card.querySelector("#carrier-bid-chat");
    setCarrierChatOpen(panel?.dataset.open !== "true");
    return;
  }

  const chatCloseButton = event.target.closest("[data-carrier-chat-close]");
  if (chatCloseButton) {
    setCarrierChatOpen(false);
    return;
  }

  const supportFocusButton = event.target.closest("[data-bid-support-focus]");
  if (supportFocusButton) {
    setBidSupportOpen(true);
    return;
  }

  const supportToggleButton = event.target.closest("[data-bid-support-toggle]");
  if (supportToggleButton) {
    const panel = card.querySelector("#bid-support-agent");
    setBidSupportOpen(panel?.dataset.open !== "true");
    return;
  }

  const supportCloseButton = event.target.closest("[data-bid-support-close]");
  if (supportCloseButton) {
    setBidSupportOpen(false);
    return;
  }

  const supportPromptButton = event.target.closest("[data-bid-support-prompt]");
  if (supportPromptButton) {
    setBidSupportOpen(true);
    const input = card.querySelector("#bid-support-message");
    if (input) {
      input.value = supportPromptButton.dataset.bidSupportPrompt || "";
      input.focus();
    }
    return;
  }

  const supportTicketButton = event.target.closest("[data-create-support-ticket]");
  if (supportTicketButton) {
    await askBidSupport({ createTicket: true });
    return;
  }

  const downloadTemplateButton = event.target.closest("[data-download-bid-template]");
  if (downloadTemplateButton) {
    const status = card.querySelector("#carrier-bid-template-status");
    downloadTemplateButton.disabled = true;
    if (status) {
      status.textContent = dualText("Preparing XLSX template with dropdowns...", "Preparando template XLSX con listas desplegables...");
      status.dataset.tone = "neutral";
    }
    try {
      await downloadBidTemplate(lastCarrierBook || {}, lastInvitation || {});
      if (status) {
        status.textContent = dualText("Template downloaded. Complete the yellow cells, then upload it here.", "Template descargado. Completa las celdas amarillas y despues subelo aqui.");
        status.dataset.tone = "success";
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.dataset.tone = "error";
      } else {
        window.alert(error.message);
      }
    } finally {
      downloadTemplateButton.disabled = false;
    }
    return;
  }

  const submitTemplateButton = event.target.closest("[data-submit-bid-template]");
  if (submitTemplateButton) {
    await submitBidTemplateRows();
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
  const supportForm = event.target.closest("#bid-support-form");
  if (!chatForm && !supportForm) return;
  event.preventDefault();
  if (supportForm) {
    await askBidSupport();
    return;
  }
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
    const threadType = normalizedCarrierChatThreadType(card.querySelector("#carrier-chat-scope")?.value || card.querySelector("#carrier-bid-chat")?.dataset.threadType);
    const result = await callBidApi("post_bid_room_chat_message", {
      thread_type: threadType,
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

card.addEventListener("change", async (event) => {
  const templateFileInput = event.target.closest("#carrier-bid-template-file");
  if (templateFileInput) {
    const status = card.querySelector("#carrier-bid-template-status");
    const file = templateFileInput.files?.[0];
    if (!file) return;
    if (status) {
      status.textContent = dualText("Reading XLSX bid template...", "Leyendo template XLSX...");
      status.dataset.tone = "neutral";
    }
    try {
      pendingBidTemplateRows = await parseBidTemplateFile(file);
      renderBidTemplatePreview();
    } catch (error) {
      pendingBidTemplateRows = [];
      renderBidTemplatePreview();
      if (status) {
        status.textContent = error.message;
        status.dataset.tone = "error";
      }
    }
    return;
  }

  if (event.target.closest("#bid-form")) {
    if (event.target.closest("#bid-commercial-model")) {
      syncCommercialStructureFields({ clearInapplicable: true });
    }
    clearBidValidationState();
    updateBidReviewSummary();
  }

  const quickCommercialModel = event.target.closest("[data-quick-bid-field='commercial_model']");
  if (quickCommercialModel) {
    const row = quickCommercialModel.closest("[data-quick-bid-row]");
    const pct = row?.querySelector("[data-quick-bid-field='commercial_pct']");
    if (pct) {
      const disabled = quickCommercialModel.value === "xbf_buy_sell";
      pct.disabled = disabled;
      if (disabled) pct.value = "";
      pct.placeholder = disabled ? "-" : "2-5";
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !card.querySelector("#bid-editor-modal")?.hidden) {
    closeBidEditor();
  }
  if (event.key === "Escape" && card.querySelector("#bid-support-agent")?.dataset.open === "true") {
    setBidSupportOpen(false);
  }
  if (event.key === "Escape" && card.querySelector("#carrier-bid-chat")?.dataset.open === "true") {
    setCarrierChatOpen(false);
  }
  armPrivateBidAudio();
});

document.addEventListener("pointerdown", () => {
  armPrivateBidAudio();
}, { capture: true });

syncPortalLanguageChrome();
loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
