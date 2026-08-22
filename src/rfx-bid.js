import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { SUPABASE_URL } from "./config.js";
import { apiErrorMessage, humanizeError } from "./error-copy.js";
import {
  bidTemplateSourceRows,
  canonicalLaneStatus,
  currentEventBookRows,
  eventInvitedLaneRows,
  isBidToolsEligibleRow,
  reconcileBidTemplateUploadRows
} from "./rfx-bid-lane-scope.js";

const title = document.querySelector("#bid-event-title");
const card = document.querySelector("#bid-invitation-card");
const bidSupportPanel = document.querySelector("#bid-support-agent");

let boardRefreshTimer = null;
let bookSearchTimer = null;
let lastCarrierBook = null;
let lastCarrierChat = { rows: [], google_chat_configured: false };
let lastInvitation = null;
let lastLiveBoard = {};
let lastSegmentConfirmations = [];
let lastBidHistory = [];
let lastQuickBidSaveStatus = null;
let lastBidSupportQuestion = "";
let lastBidSupportResult = null;
let pendingBidTemplateRows = [];
let pendingBidTemplateCoverage = null;
const segmentConfirmationSaveTimers = new Map();
const segmentConfirmationSavingTokens = new Set();
let bidTemplateSubmitting = false;
let bidSupportSubmitting = false;
let carrierChatSubmitting = false;
let privateLaneSwitching = false;
let selectedBidToolsToken = "";
let bidToolsLaneSelectionVersion = 0;
const pendingQuickBidDrafts = new Map();
const quickBidRowMutationKeys = new Set();
const bidParticipationMutationKeys = new Set();
const laneAccessRequestMutationKeys = new Set();
const PUBLIC_BOARD_VERIFIED_INVITES_KEY = "rateware.publicBidBoard.verifiedInvitations";
const PUBLIC_BOARD_INVITE_EMAIL_KEY = "rateware.publicBidBoard.inviteEmail";
const PUBLIC_BOARD_INVITE_LANES_KEY = "rateware.publicBidBoard.invitedLaneIds";
const PUBLIC_BOARD_INVITE_EVENTS_KEY = "rateware.publicBidBoard.invitedEventIds";
const bookFilters = {
  view: "all",
  query: ""
};
// Three phases in the order a carrier actually moves through them: understand
// the business, price the lanes, see where they stand. The private book used to
// be a fourth tab; it answers "where do I stand", so it lives inside `award`.
const PRIVATE_WORKSPACE_VALUES = new Set(["master", "bids", "award"]);
// Carriers who left the old fourth tab selected must not land on a dead panel.
const RETIRED_PRIVATE_WORKSPACES = new Map([["book", "award"]]);
let activePrivateWorkspace = "master";

function privateWorkspaceStorageKey() {
  return `rateware.privateBidWorkspace:${tokenFromUrl() || "default"}`;
}

function resolvePrivateWorkspace(value) {
  const raw = String(value || "");
  if (PRIVATE_WORKSPACE_VALUES.has(raw)) return raw;
  return RETIRED_PRIVATE_WORKSPACES.get(raw) || "master";
}

function readPrivateWorkspace() {
  return resolvePrivateWorkspace(localStorage.getItem(privateWorkspaceStorageKey()));
}

function setPrivateWorkspace(value = "master") {
  const next = resolvePrivateWorkspace(value);
  activePrivateWorkspace = next;
  localStorage.setItem(privateWorkspaceStorageKey(), next);
  card.querySelectorAll("[data-private-workspace-tab]").forEach((tab) => {
    const active = tab.dataset.privateWorkspaceTab === next;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });
  card.querySelectorAll("[data-private-workspace-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.privateWorkspacePanel !== next;
  });
}
const PRIVATE_BID_ANNOUNCEMENTS = {
  en: {
    enabled: "Private Bid Room alerts enabled.",
    quote: "Quote Available.",
    displaced: "Place new bid. Your offer has been displaced.",
    rankChanged: "Your rank changed. Review your offer.",
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
    rankChanged: "Tu ranking cambio. Revisa tu oferta.",
    leading: "Vas liderando.",
    chat: "Nuevo mensaje en el chat del Bid Room.",
    bidSubmitted: "Oferta enviada.",
    closing: "La oportunidad esta por cerrar.",
    supportAnswer: "El asistente respondio.",
    supportTicket: "Ticket de soporte creado."
  }
};
const privateAlertState = {
  language: storedPortalLanguage() || browserPortalLanguage(),
  soundEnabled: localStorage.getItem("rateware.privateBidRoom.sound") !== "off",
  audioContext: null,
  alerts: [],
  loaded: false,
  chatLoaded: false,
  previousSnapshot: null,
  previousChatSnapshot: null,
  pendingOwnOfferRevisionTokens: new Set()
};
const PRIVATE_BID_SOUND_DEFAULT_VERSION = "2026-07-08-sound-on";
if (localStorage.getItem("rateware.privateBidRoom.soundDefault") !== PRIVATE_BID_SOUND_DEFAULT_VERSION) {
  localStorage.setItem("rateware.privateBidRoom.sound", "on");
  localStorage.setItem("rateware.privateBidRoom.soundDefault", PRIVATE_BID_SOUND_DEFAULT_VERSION);
  privateAlertState.soundEnabled = true;
}
let excelJsModule = null;
const DEFAULT_COMMERCIAL_SHARE_PCT = 3;
const XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12;
const XBF_BUY_SELL_MIN_MARKUP_PCT = 7.5;
const XBF_BUY_SELL_MAX_MARKUP_PCT = 15;
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
    rankingMovement: "Live activity",
    enableSound: "Enable sound",
    soundOn: "Sound on",
    soundOff: "Sound off",
    noMovement: "No movement yet. Enable sound to hear ranking, quote, chat, and deadline alerts.",
    noMovementSoundOn: "Nothing has moved yet. Alerts are on.",
    noMovementSoundOff: "Nothing has moved yet. Turn sound on to be alerted.",
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
    status: "Status",
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
    validThrough: "Valid through",
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
    currentUnitLocation: "Current unit location",
    deadheadDistance: "Deadhead distance",
    deadheadUnit: "Deadhead unit",
    etaPickup: "ETA pickup",
    etaDelivery: "ETA delivery",
    mirrorAccount: "Mirror account enabled",
    unitDetails: "Unit details",
    reviewSubmit: "Review and submit",
    reviewCopy: "This is what procurement will see.",
    notes: "Notes",
    confirmTerms: "Confirm capacity and commercial terms",
    rejectInvitation: "Reject lane",
    withdrawOffer: "Withdraw offer",
    logisticsModel: "Logistics model",
    operationCriteria: "Operation criteria",
    businessRules: "Business rules",
    serviceSpecifications: "Service specifications",
    carrierRequirements: "Required carrier profile",
    otherNotes: "Other notes",
    talkToUs: "Talk to us",
    chatSupport: "Chat Support",
    goMarketplace: "Go to Marketplace",
    publicLiveBoard: "Go to Marketplace",
    publicLiveBoardHelp: "Open the real-time marketplace screen for this bid room.",
    masterPackageEyebrow: "RFx master package",
    masterPackageTitle: "Project requirements and route schedule",
    masterPackageCopy: "Review the business book as one RFx package. Confirm each operating segment so procurement can measure operational fit before award.",
    segmentChecklist: "Segment checklist",
    routeSchedule: "Route schedule",
    fitConfirmation: "Fit confirmation",
    agree: "Agree",
    exception: "Exception",
    disagree: "Disagree",
    notApplicable: "N/A",
    saveFit: "Save fit checklist",
    fitSaved: "Fit checklist saved.",
    fitPending: "Confirm the rubrics that apply to your operation."
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
    rankingMovement: "Actividad en vivo",
    enableSound: "Activar sonido",
    soundOn: "Sonido activo",
    soundOff: "Sonido apagado",
    noMovement: "Sin movimiento todavia. Activa sonido para escuchar ranking, cotizaciones, chat y vencimientos.",
    noMovementSoundOn: "Nada se ha movido todavia. Las alertas estan activas.",
    noMovementSoundOff: "Nada se ha movido todavia. Activa el sonido para enterarte.",
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
    status: "Estado",
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
    validThrough: "Vigente hasta",
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
    currentUnitLocation: "Ubicacion actual de unidad",
    deadheadDistance: "Deadhead / vacio",
    deadheadUnit: "Unidad deadhead",
    etaPickup: "ETA pickup",
    etaDelivery: "ETA delivery",
    mirrorAccount: "Cuenta espejo habilitada",
    unitDetails: "Datos de unidad",
    reviewSubmit: "Revisar y enviar",
    reviewCopy: "Esto es lo que procurement va a ver.",
    notes: "Notas",
    confirmTerms: "Confirmar capacidad y terminos comerciales",
    rejectInvitation: "Rechazar ruta",
    withdrawOffer: "Retirar oferta",
    logisticsModel: "Modelo logistico",
    operationCriteria: "Criterios de operacion",
    businessRules: "Reglas de negocio",
    serviceSpecifications: "Especificaciones de servicio",
    carrierRequirements: "Perfil requerido del carrier",
    otherNotes: "Otras notas",
    talkToUs: "Hablar con nosotros",
    chatSupport: "Soporte",
    goMarketplace: "Ir al Marketplace",
    publicLiveBoard: "Ir al Marketplace",
    publicLiveBoardHelp: "Abrir la pantalla interactiva en tiempo real de este bid room.",
    masterPackageEyebrow: "Paquete maestro RFx",
    masterPackageTitle: "Cedula del proyecto y rutas",
    masterPackageCopy: "Revisa el libro de negocio como un solo paquete RFx. Confirma cada segmento operativo para que procurement mida el fit antes del award.",
    segmentChecklist: "Checklist del segmento",
    routeSchedule: "Cedula de rutas",
    fitConfirmation: "Confirmacion de fit",
    agree: "De acuerdo",
    exception: "Excepcion",
    disagree: "No de acuerdo",
    notApplicable: "N/A",
    saveFit: "Guardar checklist de fit",
    fitSaved: "Checklist de fit guardado.",
    fitPending: "Confirma los rubros que aplican a tu operacion."
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

// Only a real toggle writes this key, so a stored value always means the carrier
// chose. Nothing else may overwrite it.
function storedPortalLanguage() {
  const stored = localStorage.getItem("rateware.privateBidRoom.language");
  return stored === "es" || stored === "en" ? stored : "";
}

// The carrier's own browser is the only hint available before the invitation loads.
function browserPortalLanguage() {
  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return tags.some((tag) => String(tag || "").toLowerCase().startsWith("es")) ? "es" : "en";
}

// Most carriers in this Bid Room are Mexican, and plenty of them browse with an
// English-locale device. Once the invitation is loaded its own data is a better
// signal than the browser. Free-text origin is deliberately not inspected: a lane
// like "Manzanillo, CL" would misread the state code as a country.
function carrierPortalLanguage(invitation = {}) {
  const vendor = invitation.vendors || {};
  const lane = invitation.rfx_lanes || {};
  const currency = String(invitation.currency || lane.currency || "").toUpperCase();
  if (currency === "MXN") return "es";
  const contacts = [vendor.domain, vendor.primary_email].map((value) => String(value || "").toLowerCase());
  if (contacts.some((value) => /\.mx$/.test(value.split("@").pop() || ""))) return "es";
  const countries = [lane.origin_country, lane.destination_country]
    .map((value) => String(value || "").trim().toLowerCase());
  if (countries.some((value) => ["mx", "mex", "mexico", "méxico"].includes(value))) return "es";
  return "";
}

// Applied on load only when the carrier has not chosen a language themselves.
function applyCarrierLanguageDefault(invitation) {
  if (storedPortalLanguage()) return false;
  const detected = carrierPortalLanguage(invitation);
  if (!detected || detected === privateAlertState.language) return false;
  privateAlertState.language = detected;
  syncPortalLanguageChrome();
  return true;
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
  const savedEmail = publicBoardAccessText(localStorage.getItem(PUBLIC_BOARD_INVITE_EMAIL_KEY)).toLowerCase();
  const email = publicBoardAccessText(vendor.primary_email).toLowerCase();
  // Keep the email explicitly verified through soft login. A vendor can have
  // multiple valid contacts, so replacing it with the primary CRM email would
  // make a previously verified invitation look unavailable.
  if (!savedEmail && email) localStorage.setItem(PUBLIC_BOARD_INVITE_EMAIL_KEY, email);
}

async function callBidApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rfx-bid-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Carriers read the portal in their own language; server-side errors should
    // arrive in it too. Callers can still override by passing `language`.
    body: JSON.stringify({ action, token: tokenFromUrl(), language: portalLanguage(), ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(apiErrorMessage(data, text, "Bid request failed."));
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
    [t("carrierRequirements"), lane.carrier_requirements],
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

const MASTER_PACKAGE_RUBRICS = [
  ["logistics_model", () => t("logisticsModel")],
  ["operation_criteria", () => t("operationCriteria")],
  ["business_rules", () => t("businessRules")],
  ["service_specifications", () => t("serviceSpecifications")],
  ["carrier_requirements", () => t("carrierRequirements")],
  ["other_notes", () => t("otherNotes")]
];

function safeMasterPackage(event = {}) {
  const payload = event.rfx_master_package;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function laneSegmentKey(lane = {}) {
  return String(lane.rfx_segment_key || [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join("-") || "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

function laneSegmentName(lane = {}) {
  return lane.rfx_segment_name || [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join(" / ") || "General RFx segment";
}

function deriveMasterPackageFromRows(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  const rows = currentEventBookRows(carrierBook, event);
  const groups = new Map();
  rows.forEach((row) => {
    const lane = row.lane || {};
    const key = laneSegmentKey(lane);
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  });
  const segments = [...groups.entries()].map(([segmentKey, rowsForSegment]) => {
    const firstLane = rowsForSegment[0]?.lane || {};
    return {
      segment_key: segmentKey,
      segment_name: laneSegmentName(firstLane),
      operation: firstLane.operation || "",
      service: firstLane.service || "",
      equipment: firstLane.equipment || "",
      trailer: firstLane.trailer || "",
      lane_count: rowsForSegment.length,
      lane_ids: rowsForSegment.map((row) => row.lane?.id).filter(Boolean),
      logistics_model: firstLane.logistics_model || "",
      operation_criteria: firstLane.operation_criteria || "",
      business_rules: firstLane.business_rules || "",
      service_specifications: firstLane.service_specifications || "",
      carrier_requirements: firstLane.carrier_requirements || "",
      other_notes: firstLane.other_notes || "",
      checklist: MASTER_PACKAGE_RUBRICS.map(([key, label]) => ({
        key,
        label: label(),
        detail: firstLane[key] || ""
      }))
    };
  });
  return {
    mode: "derived_package",
    package_name: event.source_rfx_package_name || event.name || event.rfx_id,
    lane_count: rows.length,
    segment_count: segments.length,
    requires_carrier_confirmation: Boolean(segments.length),
    segments
  };
}

function masterPackageForCarrier(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  const payload = safeMasterPackage(event);
  if (Array.isArray(payload.segments) && payload.segments.length) return payload;
  return deriveMasterPackageFromRows(carrierBook, invitation);
}

function invitationIdForFit(invitation = {}) {
  return String(invitation.id || invitation.invitation_id || "").trim();
}

function segmentConfirmationMap(invitation = lastInvitation || {}) {
  const invitationId = invitationIdForFit(invitation);
  const map = new Map();
  (Array.isArray(lastSegmentConfirmations) ? lastSegmentConfirmations : []).forEach((row) => {
    if (!invitationId || String(row.rfx_lane_vendor_id || "") !== invitationId) return;
    const key = `${row.segment_key || ""}::${row.rubric_key || ""}`;
    if (key !== "::" && !map.has(key)) map.set(key, row);
  });
  return map;
}

function confirmationStatusFor(segmentKey, rubricKey, invitation = lastInvitation || {}) {
  return segmentConfirmationMap(invitation).get(`${segmentKey}::${rubricKey}`) || { answer: "pending", comment: "" };
}

function packageSegmentForLane(lane = {}, packagePayload = {}) {
  const segmentKey = laneSegmentKey(lane);
  const segments = Array.isArray(packagePayload.segments) ? packagePayload.segments : [];
  return segments.find((segment) => String(segment.segment_key || "general") === segmentKey)
    || segments.find((segment) => Array.isArray(segment.lane_ids) && segment.lane_ids.map(String).includes(String(lane.id || "")))
    || { segment_key: segmentKey, segment_name: laneSegmentName(lane) };
}

function laneChecklist(lane = {}, packagePayload = {}) {
  const segment = packageSegmentForLane(lane, packagePayload);
  const configuredChecklist = Array.isArray(segment.checklist) ? segment.checklist : [];
  return MASTER_PACKAGE_RUBRICS.map(([key, label]) => {
    const configured = configuredChecklist.find((rubric) => rubric?.key === key) || {};
    return {
      ...configured,
      key,
      label: configured.label || label(),
      detail: lane[key] || configured.detail || segment[key] || ""
    };
  });
}

function laneFitProgress(lane = {}, invitation = lastInvitation || {}, packagePayload = {}) {
  const segmentKey = packageSegmentForLane(lane, packagePayload).segment_key || laneSegmentKey(lane);
  const checklist = laneChecklist(lane, packagePayload);
  const confirmations = segmentConfirmationMap(invitation);
  let complete = 0;
  let exceptions = 0;
  let disagreements = 0;
  checklist.forEach((rubric) => {
    const answer = confirmations.get(`${segmentKey}::${rubric.key}`)?.answer || "pending";
    if (answer !== "pending") complete += 1;
    if (answer === "exception") exceptions += 1;
    if (answer === "disagree") disagreements += 1;
  });
  return {
    total: checklist.length,
    complete,
    exceptions,
    disagreements,
    pending: Math.max(checklist.length - complete, 0),
    ready: checklist.length > 0 && complete === checklist.length && exceptions === 0 && disagreements === 0,
    segmentKey,
    checklist
  };
}

function rowFitProgress(row = {}, packagePayload = {}) {
  return laneFitProgress(row.lane || {}, { id: row.invitation_id || row.id || "" }, packagePayload);
}

function laneFitLabel(progress = {}) {
  if (!progress.total) return "-";
  if (progress.exceptions || progress.disagreements) return dualText("Needs review", "Requiere revision");
  return progress.ready
    ? dualText("Fit complete", "Fit completo")
    : dualText(`${progress.complete}/${progress.total} confirmed`, `${progress.complete}/${progress.total} confirmados`);
}

function quickFitActionLabel(progress = {}) {
  if (!progress.total) return dualText("Fit", "Fit");
  return dualText(`Fit ${progress.complete}/${progress.total}`, `Fit ${progress.complete}/${progress.total}`);
}

function quickFitActionTone(progress = {}) {
  if (progress.exceptions || progress.disagreements) return "is-review";
  if (progress.ready) return "is-ready";
  return "";
}

function portalHelp(text) {
  const label = escapeAttribute(text || "");
  return `<span class="field-help portal-help" role="img" tabindex="0" aria-label="${label}" title="${label}">?</span>`;
}

function renderMasterPackageRoutes(carrierBook = {}, invitation = {}) {
  const packagePayload = masterPackageForCarrier(carrierBook, invitation);
  const rows = eventInvitedLaneRows(carrierBook, invitation);
  const currentToken = selectedBidToolsToken || String(invitation.invitation_token || tokenFromUrl() || "");
  return `
    <section class="carrier-lane-switcher carrier-lane-switcher-master" id="carrier-lane-book-overview">
      <div class="bid-room-section-heading carrier-lane-book-heading">
        <div>
          <p class="eyebrow">${escapeHtml(dualText("Invited lane book", "Cedula de rutas invitadas"))}</p>
          <h3>${escapeHtml(dualText(`${rows.length} lanes in this RFx`, `${rows.length} rutas en este RFx`))} ${portalHelp(dualText("This is the complete invited route book. Open a lane only when you need to quote or review its recorded outcome.", "Esta es la cedula completa de rutas invitadas. Abre una ruta solo cuando necesites cotizar o revisar su resultado."))}</h3>
        </div>
        <span class="status-pill neutral">${escapeHtml(dualText("One action per lane", "Una accion por ruta"))}</span>
      </div>
      <div class="master-package-routes">
        <table class="carrier-lane-book-table">
          <thead><tr><th>Lane</th><th>${escapeHtml(dualText("Route", "Ruta"))}</th><th>${escapeHtml(dualText("Equipment / service", "Equipo / servicio"))}</th><th>${escapeHtml(t("weeklyVolume"))}</th><th>Fit</th><th>${escapeHtml(t("status"))}</th><th>${escapeHtml(dualText("Actions", "Acciones"))}</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const lane = row.lane || {};
              const invitationToken = String(row.invitation_token || "");
              const isCurrent = invitationToken === currentToken;
              const fit = rowFitProgress(row, packagePayload);
              const status = bookStatus(row, packagePayload);
              const normalizedStatus = String(status || "").toLowerCase();
              const canQuote = isBidToolsEligibleRow(row, (candidate) => bookStatus(candidate, packagePayload));
              const hasOutcome = ["awarded", "backup", "not_awarded"].includes(normalizedStatus);
              const quoteActionLabel = normalizedStatus === "quoted"
                ? dualText("Update quote", "Actualizar oferta")
                : dualText("Quote lane", "Cotizar ruta");
              return `
                <tr class="${isCurrent ? "is-current" : ""}">
                  <td>#${escapeHtml(lane.lane_number || "")}</td>
                  <td><strong>${escapeHtml(formatLane(lane))}</strong><small>${escapeHtml(marketLabel(lane))}</small></td>
                  <td><strong>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</strong><small>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</small></td>
                  <td>${escapeHtml(lane.weekly_volume ?? "-")}</td>
                  <td><span class="lane-fit-indicator ${fit.ready ? "is-ready" : ""}" title="${escapeAttribute(dualText("Each route has its own operational fit checklist.", "Cada ruta tiene su propio checklist de fit operativo."))}">${escapeHtml(laneFitLabel(fit))}</span></td>
                  <td><span class="status-pill ${statusTone(status)}" data-lane-lifecycle-status data-lane-lifecycle-token="${escapeAttribute(invitationToken)}" title="${escapeAttribute(laneStatusDescription(status))}">${escapeHtml(statusLabel(status))}</span></td>
                  <td>
                    <div class="lane-row-actions">
                      ${hasOutcome
                        ? `<button type="button" class="secondary small-button" data-route-book-filter="${escapeAttribute(normalizedStatus)}" title="${escapeAttribute(dualText("Open this lane result in the private business book.", "Abre el resultado de esta ruta en el libro privado."))}">${escapeHtml(dualText("View outcome", "Ver resultado"))}</button>`
                        : canQuote
                          ? `<button type="button" class="primary small-button" data-route-offer-token="${escapeAttribute(invitationToken)}" title="${escapeAttribute(dualText("Open Bid tools for this route without reloading the page.", "Abre Bid tools para esta ruta sin recargar la pagina."))}">${escapeHtml(quoteActionLabel)}</button>`
                          : ""}
                    </div>
                  </td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="7">${escapeHtml(dualText("No invited lanes loaded.", "No hay rutas invitadas cargadas."))}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSegmentRubricControl(segment = {}, rubric = {}, invitation = lastInvitation || {}) {
  const segmentKey = segment.segment_key || "general";
  const rubricKey = rubric.key;
  const confirmation = confirmationStatusFor(segmentKey, rubricKey, invitation);
  const answer = confirmation.answer || "pending";
  const label = rubric.es_label && portalLanguage() === "es" ? rubric.es_label : rubric.label || MASTER_PACKAGE_RUBRICS.find(([key]) => key === rubricKey)?.[1]?.() || rubricKey;
  const detail = rubric.detail || segment[rubricKey] || "";
  const controlName = `fit-${segmentKey}-${rubricKey}`;
  return `
    <article class="segment-rubric" data-segment-confirmation data-segment-key="${escapeAttribute(segmentKey)}" data-rubric-key="${escapeAttribute(rubricKey)}">
      <div>
        <strong>${escapeHtml(label)}</strong>
        ${detail
          ? `<div class="bid-lane-rich-text">${renderLaneDetailValue(detail)}</div>`
          : `<span class="segment-rubric-empty" title="${escapeAttribute(dualText("No additional route-specific detail was provided for this criterion.", "No se proporciono detalle adicional especifico para esta ruta."))}">${escapeHtml(dualText("No added condition", "Sin condicion adicional"))}</span>`}
      </div>
      <div class="segment-rubric-controls" role="radiogroup" aria-label="${escapeAttribute(label)}">
        ${[
          ["agree", t("agree")],
          ["exception", t("exception")],
          ["disagree", t("disagree")],
          ["not_applicable", t("notApplicable")]
        ].map(([value, text]) => `
          <label class="${answer === value ? "is-selected" : ""}">
            <input type="radio" name="${escapeAttribute(controlName)}" value="${escapeAttribute(value)}" data-segment-answer ${answer === value ? "checked" : ""} />
            <span>${escapeHtml(text)}</span>
          </label>
        `).join("")}
      </div>
      <textarea data-segment-comment rows="2" placeholder="${escapeAttribute(dualText("Comment exceptions or conditions...", "Comenta excepciones o condiciones..."))}">${escapeHtml(confirmation.comment || "")}</textarea>
    </article>
  `;
}

function renderLaneFitChecklist(lane = {}, invitation = {}, packagePayload = {}) {
  const segment = packageSegmentForLane(lane, packagePayload);
  const progress = laneFitProgress(lane, invitation, packagePayload);
  const checklist = progress.checklist;
  const statusCopy = progress.ready
    ? dualText("Fit complete. Procurement can see the route context.", "Fit completo. Procurement puede ver el contexto de la ruta.")
    : progress.disagreements
      ? dualText("A disagreement is visible to procurement. You can still quote with conditions or reject this lane.", "El desacuerdo queda visible para procurement. Aun puedes cotizar con condiciones o rechazar esta ruta.")
      : dualText("Fit answers are optional and save automatically. They improve procurement context without blocking a quote.", "Las respuestas de fit son opcionales y se guardan automaticamente. Mejoran el contexto de procurement sin bloquear una cotizacion.");
  return `
    <details id="carrier-lane-fit" class="master-package-segment lane-fit-checklist lane-fit-disclosure" data-lane-fit-checklist data-invitation-token="${escapeAttribute(invitation.invitation_token || "")}" data-master-segment-key="${escapeAttribute(segment.segment_key || "general")}">
      <summary>
        <div>
          <p class="eyebrow">${escapeHtml(dualText("Operational fit", "Fit operativo"))} ${portalHelp(dualText("Optional route context. Every answer autosaves and remains visible to procurement.", "Contexto opcional de la ruta. Cada respuesta se guarda automaticamente y permanece visible para procurement."))}</p>
          <strong>${escapeHtml(formatLane(lane))}</strong>
        </div>
        <div class="lane-fit-disclosure-summary-meta">
          <span class="lane-fit-autosave-state" data-lane-fit-autosave-state data-tone="neutral">${escapeHtml(dualText("Autosaved", "Autoguardado"))}</span>
          <span class="lane-fit-disclosure-trigger">${escapeHtml(dualText("Fit details", "Ver fit"))}</span>
          <span class="master-package-segment-progress ${progress.pending ? "is-pending" : ""}" data-lane-fit-progress>${escapeHtml(laneFitLabel(progress))}</span>
        </div>
      </summary>
      <div class="lane-fit-disclosure-body">
        <div class="segment-rubric-grid">
          ${checklist.map((rubric) => renderSegmentRubricControl(segment, rubric, invitation)).join("")}
        </div>
        <div class="master-package-actions">
          <p data-segment-confirmation-status class="status-message" role="status">${escapeHtml(statusCopy)}</p>
          <button type="button" class="secondary small-button" data-decline-invitation data-invitation-token="${escapeAttribute(invitation.invitation_token || "")}" ${["declined", "rejected", "awarded", "backup", "not_awarded"].includes(String(invitation.invitation_status || "").toLowerCase()) ? "disabled" : ""}>${escapeHtml(dualText("Reject lane", "Rechazar ruta"))}</button>
        </div>
      </div>
    </details>
  `;
}

function renderCarrierMasterPackage(carrierBook = {}, invitation = {}) {
  const packagePayload = masterPackageForCarrier(carrierBook, invitation);
  const segments = Array.isArray(packagePayload.segments) ? packagePayload.segments : [];
  if (!segments.length) return "";
  return `
    <section class="rfx-master-package-card">
      <div class="master-package-header">
        <div>
          <p class="eyebrow">${escapeHtml(t("masterPackageEyebrow"))}</p>
          <h3>${escapeHtml(packagePayload.package_name || t("masterPackageTitle"))} ${portalHelp(dualText("Review the opportunity once, then open only the route you want to quote. Operational fit is optional and autosaves.", "Revisa la oportunidad una vez y despues abre solo la ruta que quieras cotizar. El fit operativo es opcional y se guarda automaticamente."))}</h3>
        </div>
        <aside title="${escapeAttribute(dualText("Invited lanes available in this RFx package.", "Rutas invitadas disponibles en este paquete RFx."))}"><span>${escapeHtml(dualText("Lanes", "Rutas"))}</span><strong>${formatNumber(packagePayload.lane_count || currentEventBookRows(carrierBook, invitation.rfx_events || {}).length)}</strong></aside>
      </div>
      <div class="master-package-statline">
        <article title="${escapeAttribute(dualText("Complete invited route schedule.", "Cedula completa de rutas invitadas."))}"><span>${escapeHtml(t("routeSchedule"))}</span><strong>${formatNumber(packagePayload.lane_count || currentEventBookRows(carrierBook, invitation.rfx_events || {}).length)}</strong></article>
        <article title="${escapeAttribute(dualText("Operational reference groups included in this package.", "Grupos operativos de referencia incluidos en este paquete."))}"><span>${escapeHtml(t("segmentChecklist"))}</span><strong>${formatNumber(segments.length)}</strong></article>
        <article title="${escapeAttribute(dualText("Optional operational criteria available for each route.", "Criterios operativos opcionales disponibles por ruta."))}"><span>${escapeHtml(dualText("Fit criteria", "Criterios de fit"))}</span><strong>${formatNumber(MASTER_PACKAGE_RUBRICS.length)}</strong></article>
      </div>
      ${commercialModelGuideHtml()}
    </section>
  `;
}

function collectSegmentConfirmations(section = card.querySelector("[data-lane-fit-checklist]")) {
  if (!section) return [];
  return Array.from(section.querySelectorAll("[data-segment-confirmation]")).map((row) => {
    const checked = row.querySelector("[data-segment-answer]:checked");
    return {
      segment_key: row.dataset.segmentKey || "",
      rubric_key: row.dataset.rubricKey || "",
      answer: checked?.value || "pending",
      comment: row.querySelector("[data-segment-comment]")?.value || ""
    };
  });
}

function segmentConfirmationRowKey(row = {}) {
  return `${row.rfx_lane_vendor_id || ""}::${row.segment_key || ""}::${row.rubric_key || ""}`;
}

function mergeSegmentConfirmations(rows = []) {
  const next = new Map((Array.isArray(lastSegmentConfirmations) ? lastSegmentConfirmations : []).map((row) => [segmentConfirmationRowKey(row), row]));
  (Array.isArray(rows) ? rows : []).forEach((row) => next.set(segmentConfirmationRowKey(row), row));
  lastSegmentConfirmations = [...next.values()];
}

function fitProgressFromSection(section) {
  const rows = collectSegmentConfirmations(section);
  const total = rows.length;
  const complete = rows.filter((row) => row.answer && row.answer !== "pending").length;
  const exceptions = rows.filter((row) => row.answer === "exception").length;
  const disagreements = rows.filter((row) => row.answer === "disagree").length;
  return {
    total,
    complete,
    exceptions,
    disagreements,
    pending: Math.max(total - complete, 0),
    ready: total > 0 && complete === total && exceptions === 0 && disagreements === 0
  };
}

function fitStatusCopy(progress = {}) {
  if (progress.ready) return dualText("Fit complete. Procurement can see the route context.", "Fit completo. Procurement puede ver el contexto de la ruta.");
  if (progress.exceptions || progress.disagreements) return dualText("The exception is visible to procurement. You can still quote with conditions or reject this lane.", "La excepcion queda visible para procurement. Aun puedes cotizar con condiciones o rechazar esta ruta.");
  return dualText("Fit answers are optional and save automatically. They improve procurement context without blocking a quote.", "Las respuestas de fit son opcionales y se guardan automaticamente. Mejoran el contexto de procurement sin bloquear una cotizacion.");
}

function refreshLaneFitUi(section, message = "", tone = "neutral") {
  if (!section) return;
  const progress = fitProgressFromSection(section);
  const progressNode = section.querySelector("[data-lane-fit-progress]");
  const status = section.querySelector("[data-segment-confirmation-status]");
  if (progressNode) {
    progressNode.textContent = laneFitLabel(progress);
    progressNode.classList.toggle("is-pending", Boolean(progress.pending));
  }
  if (status) {
    status.textContent = message || fitStatusCopy(progress);
    status.dataset.tone = tone;
  }
  const invitationToken = String(section.dataset.invitationToken || "");
  if (invitationToken) {
    const action = card.querySelector(`[data-quick-bid-row][data-invitation-token="${CSS.escape(invitationToken)}"] [data-open-quick-lane-fit]`);
    if (action) {
      action.textContent = quickFitActionLabel(progress);
      action.classList.toggle("is-ready", progress.ready);
      action.classList.toggle("is-review", Boolean(progress.exceptions || progress.disagreements));
    }
    refreshLaneLifecycleStatusUi(invitationToken);
  }
}

function refreshLaneLifecycleStatusUi(invitationToken) {
  const row = allBookRows(lastCarrierBook || {}).find((candidate) => String(candidate.invitation_token || "") === String(invitationToken || ""));
  if (!row) return;
  const packagePayload = masterPackageForCarrier(lastCarrierBook || {}, lastInvitation || {});
  const status = bookStatus(row, packagePayload);
  card.querySelectorAll("[data-lane-lifecycle-status]").forEach((node) => {
    if (String(node.dataset.laneLifecycleToken || "") !== String(invitationToken || "")) return;
    node.textContent = statusLabel(status);
    node.title = laneStatusDescription(status);
    node.classList.remove("success", "warning", "danger", "neutral", "muted");
    node.classList.add(statusTone(status));
  });
}

function setLaneFitAutosaveState(section, state = "saved") {
  const node = section?.querySelector?.("[data-lane-fit-autosave-state]");
  if (!node) return;
  const labels = {
    pending: dualText("Unsaved", "Pendiente"),
    saving: dualText("Saving...", "Guardando..."),
    saved: dualText("Autosaved", "Autoguardado"),
    error: dualText("Retry needed", "Reintentar")
  };
  node.textContent = labels[state] || labels.saved;
  node.dataset.tone = state === "error" ? "error" : state === "saved" ? "success" : "neutral";
}

async function saveSegmentConfirmations(section) {
  if (!section) return;
  const invitationToken = String(section.dataset.invitationToken || "");
  const saveKey = invitationToken || String(section.dataset.masterSegmentKey || "default");
  const pendingTimer = segmentConfirmationSaveTimers.get(saveKey);
  if (pendingTimer) {
    window.clearTimeout(pendingTimer);
    segmentConfirmationSaveTimers.delete(saveKey);
  }
  if (segmentConfirmationSavingTokens.has(saveKey)) {
    section.dataset.savePending = "true";
    return;
  }
  const status = section.querySelector("[data-segment-confirmation-status]");
  segmentConfirmationSavingTokens.add(saveKey);
  delete section.dataset.savePending;
  section.dataset.saving = "true";
  setLaneFitAutosaveState(section, "saving");
  if (status) {
    status.textContent = dualText("Saving fit checklist...", "Guardando checklist de fit...");
    status.dataset.tone = "neutral";
  }
  try {
    const result = await callBidApi("save_segment_confirmations", {
      token: invitationToken,
      confirmations: collectSegmentConfirmations(section)
    });
    mergeSegmentConfirmations(result.rows || []);
    setLaneFitAutosaveState(section, "saved");
    refreshLaneFitUi(section, dualText("Fit saved automatically.", "Fit guardado automaticamente."), "success");
  } catch (error) {
    setLaneFitAutosaveState(section, "error");
    if (status) {
      status.textContent = humanizeError(error);
      status.dataset.tone = "error";
    }
  } finally {
    segmentConfirmationSavingTokens.delete(saveKey);
    delete section.dataset.saving;
    if (section.dataset.savePending === "true") {
      delete section.dataset.savePending;
      queueSegmentConfirmationSave(section);
    }
  }
}

function queueSegmentConfirmationSave(section) {
  if (!section) return;
  const invitationToken = String(section.dataset.invitationToken || "");
  const saveKey = invitationToken || String(section.dataset.masterSegmentKey || "default");
  const existingTimer = segmentConfirmationSaveTimers.get(saveKey);
  if (existingTimer) window.clearTimeout(existingTimer);
  section.dataset.savePending = "true";
  setLaneFitAutosaveState(section, "pending");
  const timer = window.setTimeout(() => {
    segmentConfirmationSaveTimers.delete(saveKey);
    saveSegmentConfirmations(section);
  }, 550);
  segmentConfirmationSaveTimers.set(saveKey, timer);
}

async function flushSegmentConfirmationSave(section) {
  if (!section) return;
  const invitationToken = String(section.dataset.invitationToken || "");
  const saveKey = invitationToken || String(section.dataset.masterSegmentKey || "default");
  const pendingTimer = segmentConfirmationSaveTimers.get(saveKey);
  if (pendingTimer) {
    window.clearTimeout(pendingTimer);
    segmentConfirmationSaveTimers.delete(saveKey);
  }
  if (section.dataset.savePending === "true") {
    await saveSegmentConfirmations(section);
  }
}

function formatMoney(value, currency = "USD") {
  const number = typeof value === "number" ? value : numberFromInput(value);
  if (!Number.isFinite(number)) return "-";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)} ${currency || "USD"}`;
}

function formatNumber(value, digits = 0) {
  const number = typeof value === "number" ? value : numberFromInput(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits
  }).format(number);
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
      agreed: "Agreed",
      exception: "Exception",
      quoted: "Quoted",
      bid_submitted: "Quoted",
      awarded: "Awarded",
      backup: "Backup",
      not_awarded: "Not awarded",
      pending: "Pending",
      declined: "Rejected",
      rejected: "Rejected",
      withdrawn: "Withdrawn",
      open: "Open",
      not_invited: "Request invite"
    },
    es: {
      drafted: "Borrador",
      invited: "Invitado",
      viewed: "Visto",
      responded: "Respondido",
      agreed: "De acuerdo",
      exception: "Excepcion",
      quoted: "Cotizado",
      bid_submitted: "Cotizado",
      awarded: "Asignado",
      backup: "Backup",
      not_awarded: "No asignado",
      pending: "Pendiente",
      declined: "Rechazada",
      rejected: "Rechazada",
      withdrawn: "Retirada",
      open: "Abierto",
      not_invited: "Solicitar invitacion"
    }
  };
  return (labels[portalLanguage()] || labels.en)[value] || value;
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "awarded" || value === "agreed") return "success";
  if (value === "backup" || value === "quoted" || value === "bid_submitted") return "neutral";
  if (value === "rejected" || value === "declined") return "danger";
  if (value === "not_awarded" || value === "withdrawn") return "muted";
  if (value === "exception" || value === "invited" || value === "viewed" || value === "responded") return "warning";
  return "muted";
}

function laneStatusDescription(status) {
  const value = String(status || "invited").toLowerCase();
  const copy = {
    invited: dualText("The carrier is invited and has not recorded fit or an offer yet.", "El carrier esta invitado y aun no registra fit ni oferta."),
    agreed: dualText("All route fit criteria were confirmed without exceptions.", "Todos los criterios de fit de la ruta fueron confirmados sin excepciones."),
    exception: dualText("The route fit includes an exception or disagreement for procurement review.", "El fit de la ruta incluye una excepcion o desacuerdo para revision de procurement."),
    rejected: dualText("The carrier rejected this route and it is no longer actionable.", "El carrier rechazo esta ruta y ya no esta habilitada para cotizar."),
    quoted: dualText("An active carrier offer is recorded for this route.", "Existe una oferta activa del carrier para esta ruta."),
    withdrawn: dualText("The carrier withdrew the active offer; its history is preserved.", "El carrier retiro la oferta activa; su historial se conserva."),
    awarded: dualText("This route was awarded to the carrier.", "Esta ruta fue adjudicada al carrier."),
    backup: dualText("The carrier was selected as backup capacity for this route.", "El carrier fue seleccionado como capacidad backup para esta ruta."),
    not_awarded: dualText("The event closed without awarding this route to the carrier.", "El evento cerro sin adjudicar esta ruta al carrier."),
    open: dualText("This route is visible but the carrier has not been invited.", "Esta ruta es visible, pero el carrier no ha sido invitado.")
  };
  return copy[value] || statusLabel(value);
}

// A due date is a calendar day; it needs a zone to become an instant. Mexico City
// has had no daylight saving since 2022, so a fixed -06:00 is stable. Must stay
// identical to BID_DEADLINE_UTC_OFFSET in supabase/functions/rfx-bid-api.
const BID_DEADLINE_UTC_OFFSET = "-06:00";

// Mirrors how rfx-bid-api counts a quoted lane, so the progress a carrier sees
// can never disagree with the buyer's board.
function isQuotedBookRow(row = {}) {
  if (row.bid_rate !== null && row.bid_rate !== undefined) return true;
  return ["quoted", "bid_submitted", "awarded"].includes(String(row.participation_status || "").toLowerCase());
}

// "3 of 7 lanes quoted" — the one number that tells a carrier whether they are
// done. Nothing in the portal used to answer it.
function carrierLaneProgress(carrierBook = {}, event = {}) {
  const rows = currentEventBookRows(carrierBook, event);
  const total = rows.length;
  const quoted = rows.filter(isQuotedBookRow).length;
  return { total, quoted, remaining: Math.max(0, total - quoted), pct: total ? Math.round((quoted / total) * 100) : 0 };
}

// A carrier arrives from an email with three questions: who is asking, how long
// do I have, and how far along am I. This bar answers all three and stays on
// screen while they price, so the deadline is visible where the decision happens.
function renderPortalStatusBar(event = {}, vendor = {}, progress = { total: 0, quoted: 0, pct: 0 }) {
  const deadline = deadlineCopy(event);
  const circumference = 2 * Math.PI * 15.5;
  const filled = (Math.max(0, Math.min(100, progress.pct)) / 100) * circumference;
  const identity = [event.customer, event.rfx_id].filter(Boolean).join(" / ") || t("privateRoom");
  const progressLabel = progress.total
    ? dualText(`${progress.quoted} of ${progress.total}`, `${progress.quoted} de ${progress.total}`)
    : "-";
  return `
    <div class="bid-portal-statusbar">
      <div class="bid-portal-statusbar-id">
        <strong>${escapeHtml(identity)}</strong>
        <span>${escapeHtml(vendor.vendor_name || vendor.domain || t("carrier"))}</span>
      </div>
      <div class="bid-portal-statusbar-meta">
        <div class="bid-portal-clock" data-tone="${escapeAttribute(deadline.tone)}" title="${escapeAttribute(deadline.detail)}">
          <strong>${escapeHtml(deadline.label)}</strong>
          <span>${escapeHtml(deadline.detail)}</span>
        </div>
        <div class="bid-portal-progress" title="${escapeAttribute(dualText("Lanes you have quoted in this bid room.", "Rutas que ya cotizaste en esta puja."))}">
          <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" stroke-width="4"></circle>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round"
                    stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 18 18)"></circle>
          </svg>
          <div>
            <strong>${escapeHtml(progressLabel)}</strong>
            <span>${escapeHtml(dualText("lanes quoted", "rutas cotizadas"))}</span>
          </div>
        </div>
        <div class="bid-room-language-toggle" aria-label="${escapeAttribute(t("languageToggle"))}">
          <button type="button" data-private-language-toggle="en" aria-pressed="${portalLanguage() === "en" ? "true" : "false"}">EN</button>
          <button type="button" data-private-language-toggle="es" aria-pressed="${portalLanguage() === "es" ? "true" : "false"}">ES</button>
        </div>
      </div>
    </div>
  `;
}

// Replaces the old hero, which restated the event name the page heading already
// showed and the RFx id, customer and deadline the status bar above already
// showed. Three headers stacked put the phase tabs 673px down the page, so the
// carrier scrolled past everything before learning what to do. This block says
// only what the other two cannot: who is inviting you, and what is expected of
// you next.
function renderCarrierBrief(event = {}, vendor = {}, liveBoard = {}, laneCount = 0) {
  const carrier = vendor.vendor_name || vendor.domain || t("carrier");
  const customer = event.customer || dualText("Procurement", "Procurement");
  const lanes = Math.max(1, Number(laneCount) || 1);
  return `
    <section class="bid-room-brief">
      <div class="bid-room-brief-copy">
        <p class="bid-room-greeting">${escapeHtml(dualText(`Hello, ${carrier}`, `Hola, ${carrier}`))}</p>
        <p class="bid-room-invite">${escapeHtml(dualText(
          `${customer} invited you to quote ${lanes} ${lanes === 1 ? "lane" : "lanes"}. Price them one at a time — every row saves on its own, so you can stop and come back.`,
          `${customer} te invito a cotizar ${lanes} ${lanes === 1 ? "ruta" : "rutas"}. Cotizalas de una en una: cada fila se guarda sola, asi que puedes parar y volver.`
        ))}</p>
        <p class="bid-room-privacy">
          <span class="bid-room-privacy-badge">${escapeHtml(visibilityLabel(liveBoard.visibility || {}))}</span>
          <span>${escapeHtml(dualText("Only your company sees this room.", "Solo tu empresa ve esta sala."))}</span>
        </p>
      </div>
      <div class="bid-room-brief-side">
        <div class="bid-room-brief-actions">
          <button type="button" class="secondary small-button" data-carrier-chat-focus="carrier_private">
            ${escapeHtml(t("talkToUs"))}
          </button>
          <a class="secondary small-button" href="${escapeAttribute(eventMarketplaceUrl(event))}" target="_blank" rel="noreferrer" title="${escapeAttribute(t("publicLiveBoardHelp"))}">
            ${escapeHtml(t("goMarketplace"))}
          </a>
          <button id="private-bid-sound" class="bid-room-sound-toggle" type="button" aria-pressed="${privateAlertState.soundEnabled ? "true" : "false"}">
            ${escapeHtml(privateAlertState.soundEnabled ? t("soundOn") : t("soundOff"))}
          </button>
        </div>
        <div class="bid-room-brief-feed" title="${escapeAttribute(dualText("Updates every 30 seconds.", "Se actualiza cada 30 segundos."))}">
          <span>${escapeHtml(t("rankingMovement"))}</span>
          <div id="private-bid-alerts" class="private-bid-alerts" aria-live="polite">
            <p>${escapeHtml(privateAlertState.soundEnabled ? t("noMovementSoundOn") : t("noMovementSoundOff"))}</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function deadlineCopy(event = {}) {
  if (!event.due_date) return { label: dualText("No deadline", "Sin fecha limite"), tone: "muted", detail: dualText("Procurement has not set a close date.", "Procurement no ha definido fecha de cierre.") };
  // Same instant the server enforces. Parsed bare this would use the carrier's
  // own device zone, so a carrier abroad would be told they still had time after
  // the bid had already closed.
  const dueAt = new Date(`${event.due_date}T23:59:59${BID_DEADLINE_UTC_OFFSET}`);
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

function legacyCommercialModel(value, fallback = "direct_cost_plus") {
  const text = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    fee_plus: "direct_cost_plus",
    cost_plus: "direct_cost_plus",
    direct_cost_plus: "direct_cost_plus",
    sell_share: "carrier_share",
    carrier_share: "carrier_share",
    brokerage: "xbf_buy_sell",
    xbf_buy_sell: "xbf_buy_sell"
  };
  return aliases[text] || fallback;
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
      carrier_share: "Carrier comparte facturacion",
      xbf_buy_sell: "XBF compra-venta"
    }
  };
  return (labels[portalLanguage()] || labels.en)[legacyCommercialModel(value, "")] || t("notDeclared");
}

function commercialStructureConfig(value) {
  const model = legacyCommercialModel(value);
  const configs = {
    direct_cost_plus: {
      tone: dualText("Cost-plus", "Cost-plus"),
      rateLabel: dualText("Direct carrier all-in", "All-in directo del carrier"),
      rateEntryHelp: commercialModelEntryRule("direct_cost_plus"),
      percentageField: "marksman",
      percentageLabel: t("suggestedMargin"),
      percentageTooltip: dualText(
        "This percentage increases the board/customer comparable price over the carrier all-in rate. The calculated commission is invoiced after the customer pays.",
        "Este porcentaje incrementa el precio comparable del board/cliente sobre la tarifa all-in del carrier. La comision calculada se factura cuando pague el cliente."
      ),
      copy: dualText(
        "Use when the carrier enters its direct cost and suggests the MARKSMAN margin used for the Board price.",
        "Usa esto cuando el carrier captura su costo directo y sugiere el margen MARKSMAN usado para el precio del Board."
      )
    },
    carrier_share: {
      tone: dualText("Carrier shares", "Carrier comparte"),
      rateLabel: dualText("All-in you want to keep", "All-in que quieres conservar"),
      rateEntryHelp: commercialModelEntryRule("carrier_share"),
      percentageField: "carrier",
      percentageLabel: t("carrierShare"),
      percentageTooltip: dualText(
        "This does not change the bid price. It calculates the carrier invoice-share fee to be billed after the customer pays.",
        "Esto no modifica el precio de la puja. Calcula el fee de share factura carrier que se cobrara cuando pague el cliente."
      ),
      copy: dualText(
        "Use when the carrier keeps its rate unchanged and agrees to a billing-share percentage after payment.",
        "Usa esto cuando el carrier conserva su tarifa sin cambios y acepta un porcentaje de share sobre facturacion despues del pago."
      )
    },
    xbf_buy_sell: {
      tone: dualText("XBF buy-sell", "XBF compra-venta"),
      rateLabel: dualText("Sell rate to XBF", "Tarifa de venta a XBF"),
      rateEntryHelp: commercialModelEntryRule("xbf_buy_sell"),
      percentageField: "marksman",
      percentageLabel: dualText("Suggested XBF margin %", "Margen sugerido XBF %"),
      percentageTooltip: dualText(
        "Optional. Enter a suggested XBF buy-sell margin from 7.5% to 15%. If blank, Rateware applies 12%.",
        "Opcional. Captura un margen sugerido XBF compra-venta de 7.5% a 15%. Si queda vacio, Rateware aplica 12%."
      ),
      copy: dualText(
        "Use when the carrier submits its sell rate to XBF. The Board/customer comparable price uses the suggested buy-sell margin, or 12% by default.",
        "Usa esto cuando el carrier envia su tarifa de venta a XBF. El precio comparable del Board/cliente usa el margen compra-venta sugerido, o 12% por default."
      )
    }
  };
  return configs[model] || configs.direct_cost_plus;
}

function commercialModelEffect(value) {
  const model = legacyCommercialModel(value);
  const effects = {
    direct_cost_plus: dualText(
      "Your carrier rate is your direct cost; the suggested margin is added to the Board price. The fee is calculated after customer payment.",
      "Tu tarifa carrier es tu costo directo; el margen sugerido se suma al precio del Board. La comision se calcula despues del pago del cliente."
    ),
    carrier_share: dualText(
      "Your carrier rate does not change. The selected share is calculated as a fee after customer payment.",
      "Tu tarifa carrier no cambia. El porcentaje seleccionado se calcula como comision sobre la facturacion despues del pago del cliente."
    ),
    xbf_buy_sell: dualText(
      "Your carrier rate is your sell rate to XBF. The Board price adds the suggested XBF margin, or 12% when blank.",
      "Tu tarifa carrier es tu tarifa de venta a XBF. El precio del Board suma el margen XBF sugerido, o 12% si queda vacio."
    )
  };
  return effects[model] || effects.direct_cost_plus;
}

function commercialModelQuickEffect(value) {
  const model = legacyCommercialModel(value);
  const effects = {
    direct_cost_plus: dualText(
      "Board adds the suggested margin.",
      "El Board suma el margen sugerido."
    ),
    carrier_share: dualText(
      "Board keeps this rate; the fee follows payment.",
      "El Board conserva esta tarifa; el fee se cobra despues del pago."
    ),
    xbf_buy_sell: dualText(
      "Board adds the XBF margin.",
      "El Board suma el margen XBF."
    )
  };
  return effects[model] || effects.direct_cost_plus;
}

function commercialModelEntryRule(value) {
  const model = legacyCommercialModel(value);
  const rules = {
    direct_cost_plus: dualText(
      "You enter: your direct carrier cost.",
      "Capturas: tu costo directo como carrier."
    ),
    carrier_share: dualText(
      "You enter: the all-in you want to keep.",
      "Capturas: el all-in que quieres conservar."
    ),
    xbf_buy_sell: dualText(
      "You enter: your sell rate to XBF.",
      "Capturas: tu tarifa de venta a XBF."
    )
  };
  return rules[model] || rules.direct_cost_plus;
}

function commercialModelGuideHtml(selectedModel = "") {
  const activeModel = legacyCommercialModel(selectedModel, "");
  const models = [
    {
      key: "direct_cost_plus",
      title: dualText("Direct / cost-plus", "Directo / cost-plus"),
      rule: dualText("Suggested margin: 2-5%. Blank = 3%.", "Margen sugerido: 2-5%. Vacio = 3%."),
      effect: commercialModelEffect("direct_cost_plus")
    },
    {
      key: "carrier_share",
      title: dualText("Carrier invoice share", "Carrier comparte facturacion"),
      rule: dualText("Invoice share: 2-5%. Blank = 3%.", "Share de facturacion: 2-5%. Vacio = 3%."),
      effect: commercialModelEffect("carrier_share")
    },
    {
      key: "xbf_buy_sell",
      title: dualText("XBF buy-sell", "XBF compra-venta"),
      rule: dualText("Suggested XBF margin: 7.5-15%. Blank = 12%.", "Margen sugerido XBF: 7.5-15%. Vacio = 12%."),
      effect: commercialModelEffect("xbf_buy_sell")
    }
  ];
  return `
    <details class="commercial-model-guide">
      <summary>
        <span>${escapeHtml(dualText("Commercial models", "Modelos comerciales"))}</span>
        <small>${escapeHtml(dualText("Compare your carrier rate, Board price and fee.", "Compara tu tarifa carrier, precio del Board y fee."))}</small>
      </summary>
      <div class="commercial-model-guide-grid">
        ${models.map((model) => `
          <article data-commercial-model-guide="${escapeAttribute(model.key)}" class="${model.key === activeModel ? "is-selected" : ""}" ${model.key === activeModel ? 'aria-current="true"' : ""}>
            <strong>${escapeHtml(model.title)}</strong>
            <span>${escapeHtml(model.effect)}</span>
            <small>${escapeHtml(model.rule)}</small>
          </article>
        `).join("")}
      </div>
    </details>
  `;
}

function commercialModelSelectedContextHtml(selectedModel = "direct_cost_plus") {
  const model = legacyCommercialModel(selectedModel);
  const contexts = {
    direct_cost_plus: {
      entry: dualText("Direct carrier all-in", "All-in directo del carrier"),
      board: dualText("Board adds your suggested margin. Blank uses 3%.", "El Board suma tu margen sugerido. Vacio usa 3%."),
      fee: dualText("The resulting commission is invoiced after customer payment.", "La comision resultante se factura despues del pago del cliente.")
    },
    carrier_share: {
      entry: dualText("The all-in you want to keep", "El all-in que quieres conservar"),
      board: dualText("Board keeps this rate unchanged. Blank share uses 3%.", "El Board conserva esta tarifa sin cambios. Share vacio usa 3%."),
      fee: dualText("Your invoice-share fee is calculated after customer payment.", "Tu fee de share se calcula despues del pago del cliente.")
    },
    xbf_buy_sell: {
      entry: dualText("Your sell rate to XBF", "Tu tarifa de venta a XBF"),
      board: dualText("Board adds the suggested XBF margin. Blank uses 12%.", "El Board suma el margen sugerido XBF. Vacio usa 12%."),
      fee: dualText("No carrier share applies. Suggested XBF margin range: 7.5-15%.", "No aplica share del carrier. Rango de margen sugerido XBF: 7.5-15%.")
    }
  };
  const context = contexts[model] || contexts.direct_cost_plus;
  return `
    <div class="commercial-model-selected-context" data-commercial-model-selected-context role="status" aria-live="polite">
      <strong>${escapeHtml(commercialModelLabel(model))}</strong>
      <span title="${escapeAttribute(dualText("What you enter as the carrier", "Lo que capturas como carrier"))}"><b>${escapeHtml(dualText("You enter", "Capturas"))}</b>${escapeHtml(context.entry)}</span>
      <span title="${escapeAttribute(dualText("How the comparable Board price is calculated", "Como se calcula el precio comparable del Board"))}"><b>${escapeHtml(dualText("Board", "Board"))}</b>${escapeHtml(context.board)}</span>
      <span title="${escapeAttribute(dualText("When the commercial fee applies", "Cuando aplica el fee comercial"))}"><b>${escapeHtml(dualText("Fee", "Fee"))}</b>${escapeHtml(context.fee)}</span>
    </div>
  `;
}

function commercialPercentSummary(draft = {}) {
  const config = commercialStructureConfig(draft.commercial_model);
  if (legacyCommercialModel(draft.commercial_model) === "xbf_buy_sell") return dualText(`${draft.marksman_margin_pct || XBF_BUY_SELL_DEFAULT_MARKUP_PCT}% XBF buy-sell margin`, `${draft.marksman_margin_pct || XBF_BUY_SELL_DEFAULT_MARKUP_PCT}% margen XBF compra-venta`);
  if (config.percentageField === "marksman") return dualText(`${draft.marksman_margin_pct || DEFAULT_COMMERCIAL_SHARE_PCT}% suggested margin`, `${draft.marksman_margin_pct || DEFAULT_COMMERCIAL_SHARE_PCT}% margen sugerido`);
  if (config.percentageField === "carrier" && draft.carrier_share_pct) return dualText(`${draft.carrier_share_pct}% invoice share`, `${draft.carrier_share_pct}% share factura`);
  if (config.percentageField === "carrier") return dualText(`${DEFAULT_COMMERCIAL_SHARE_PCT}% invoice share`, `${DEFAULT_COMMERCIAL_SHARE_PCT}% share factura`);
  return dualText(`${config.percentageLabel || "Percentage"} not declared`, `${config.percentageLabel || "Porcentaje"} no declarado`);
}

function commercialRateDetails(row = {}) {
  const model = legacyCommercialModel(row.commercial_model);
  const carrierRate = numberOrNull(row.carrier_bid_rate ?? row.bid_rate ?? row.amount);
  let boardRate = numberOrNull(row.board_rate ?? row.rate_visibility ?? row.amount);
  let commissionFee = numberOrNull(row.commission_fee);
  const defaultPct = model === "xbf_buy_sell" ? XBF_BUY_SELL_DEFAULT_MARKUP_PCT : DEFAULT_COMMERCIAL_SHARE_PCT;
  const commissionPct = numberOrNull(row.commission_pct ?? (model === "direct_cost_plus" ? row.marksman_margin_pct : row.carrier_share_pct)) ?? (model === "xbf_buy_sell" ? null : defaultPct);
  let markupFee = numberOrNull(row.markup_fee);
  const markupPct = numberOrNull(row.markup_pct) ?? (model === "xbf_buy_sell" ? (numberOrNull(row.marksman_margin_pct) ?? XBF_BUY_SELL_DEFAULT_MARKUP_PCT) : null);
  if (carrierRate !== null && boardRate === null) {
    if (model === "carrier_share") boardRate = carrierRate;
    else if (model === "xbf_buy_sell") boardRate = carrierRate * (1 + (markupPct ?? XBF_BUY_SELL_DEFAULT_MARKUP_PCT) / 100);
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
      `Carrier rate ${formatMoney(details.carrierRate, details.currency)}. Board rate includes XBF buy-sell markup ${details.markupPct ?? XBF_BUY_SELL_DEFAULT_MARKUP_PCT}% (${markup}).`,
      `Tarifa carrier ${formatMoney(details.carrierRate, details.currency)}. El board incluye markup compra-venta XBF ${details.markupPct ?? XBF_BUY_SELL_DEFAULT_MARKUP_PCT}% (${markup}).`
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
    rankChanged: "Rank changed",
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

function clearPrivateBidAlerts(types = []) {
  const blocked = new Set(types);
  privateAlertState.alerts = privateAlertState.alerts.filter((alert) => !blocked.has(alert.type));
  renderPrivateBidAlerts();
}

function markOwnOfferRevisionPending(invitationToken = tokenFromUrl()) {
  const token = String(invitationToken || "").trim();
  if (token) privateAlertState.pendingOwnOfferRevisionTokens.add(token);
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
  const currentInvitationId = String(liveBoard.current_invitation_id || data.invitation?.id || currentRow.id || "");
  const currentInvitationToken = String(liveBoard.current_invitation_token || data.invitation?.invitation_token || "");
  const currentOfferRevisionAt = String(
    liveBoard.current_offer_revision_at
      || currentRow.offer_revision_at
      || data.invitation?.updated_at
      || data.invitation?.responded_at
      || ""
  );
  const currentOfferFingerprint = JSON.stringify({
    invitation_id: currentInvitationId,
    amount: numberOrNull(currentRow.amount ?? data.invitation?.bid_rate),
    capacity: numberOrNull(currentRow.weekly_capacity ?? data.invitation?.weekly_capacity),
    transit: numberOrNull(currentRow.transit_days ?? data.invitation?.transit_days),
    valid_through: currentRow.valid_through || data.invitation?.valid_through || "",
    commercial_model: currentRow.commercial_model || data.invitation?.commercial_model || "",
    suggested_margin: numberOrNull(currentRow.marksman_margin_pct ?? data.invitation?.marksman_margin_pct),
    carrier_share: numberOrNull(currentRow.carrier_share_pct ?? data.invitation?.carrier_share_pct)
  });
  return {
    currentInvitationId,
    currentInvitationToken,
    rank: numberOrNull(liveBoard.current_rank ?? currentRow.rank),
    bidCount: Number(liveBoard.bid_count || rows.length || 0),
    currentRate: numberOrNull(currentRow.amount ?? data.invitation?.bid_rate),
    currentUpdatedAt: currentOfferRevisionAt,
    currentOfferFingerprint,
    competitorActivityAt: String(liveBoard.latest_competitor_activity_at || ""),
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

  const ownOfferChanged = Boolean(
    (snapshot.currentUpdatedAt && snapshot.currentUpdatedAt !== previous.currentUpdatedAt)
    || snapshot.currentOfferFingerprint !== previous.currentOfferFingerprint
    || (snapshot.currentRate !== null && previous.currentRate !== null && snapshot.currentRate !== previous.currentRate)
    || (snapshot.historyCount > previous.historyCount)
  );
  const ownRevisionPending = privateAlertState.pendingOwnOfferRevisionTokens.has(snapshot.currentInvitationToken);
  const competitorActivityAdvanced = Boolean(
    snapshot.competitorActivityAt
    && snapshot.competitorActivityAt !== previous.competitorActivityAt
  );
  if (ownOfferChanged || ownRevisionPending) {
    privateAlertState.pendingOwnOfferRevisionTokens.delete(snapshot.currentInvitationToken);
    clearPrivateBidAlerts(["displaced"]);
  }
  if (snapshot.rank && previous.rank && snapshot.rank > previous.rank) {
    if (ownOfferChanged || ownRevisionPending) {
      queuePrivateBidAlert("rankChanged", dualText(
        `Your rank moved from #${previous.rank} to #${snapshot.rank} after your latest offer update.`,
        `Tu ranking cambio de #${previous.rank} a #${snapshot.rank} despues de tu ultima actualizacion.`
      ));
    } else if (competitorActivityAdvanced) {
      queuePrivateBidAlert("displaced", `Your rank moved from #${previous.rank} to #${snapshot.rank}. Review the live board and consider a new bid.`);
    } else {
      queuePrivateBidAlert("rankChanged", dualText(
        `Your rank changed from #${previous.rank} to #${snapshot.rank}. Review the live board for the latest activity.`,
        `Tu ranking cambio de #${previous.rank} a #${snapshot.rank}. Revisa el tablero para ver la actividad mas reciente.`
      ));
    }
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

function dateOnlyValue(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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
  if (config.percentageField === "marksman" && row.marksman_margin_pct !== null && row.marksman_margin_pct !== undefined) {
    parts.push(legacyCommercialModel(row.commercial_model) === "xbf_buy_sell" ? `${row.marksman_margin_pct}% XBF margin` : `${row.marksman_margin_pct}% suggested margin`);
  }
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

function validateNonNegativeNumberIssue(value, field, label, required = true) {
  const text = String(value ?? "").trim();
  if (!text) return required ? validationIssue(field, `${label} is required and must be numeric.`) : null;
  const number = numberFromInput(value);
  if (number === null) return validationIssue(field, `${label} must be numeric.`);
  if (number < 0) return validationIssue(field, `${label} must be zero or greater.`);
  return null;
}

function validatePercentIssue(value, field, label, options = {}) {
  const text = String(value ?? "").trim();
  if (!text) return options.required ? validationIssue(field, `${label} is required for this commercial model.`) : null;
  const number = numberFromInput(value);
  if (number === null) return validationIssue(field, `${label} must be numeric.`);
  if (number < 0 || number > 100) return validationIssue(field, `${label} must be between 0% and 100%.`);
  if (options.min !== undefined && number < options.min) return validationIssue(field, `${label} must be at least ${options.min}%.`);
  if (options.max !== undefined && number > options.max) return validationIssue(field, `${label} must be at most ${options.max}%.`);
  if (options.procurementRange && (number < 2 || number > 5)) return validationIssue(field, `${label} must be between 2% and 5%.`);
  return null;
}

function validDateTimeValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validDateValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T12:00:00`);
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
    valid_through: card.querySelector("#bid-valid-through")?.value || "",
    commercial_model: commercialModel,
    marksman_margin_pct: commercialConfig.percentageField === "marksman" ? card.querySelector("#bid-marksman-margin")?.value || "" : "",
    carrier_share_pct: commercialConfig.percentageField === "carrier" ? card.querySelector("#bid-carrier-share")?.value || "" : "",
    best_alternative_offered: card.querySelector("#bid-alt-enabled")?.checked || false,
    alternative_equipment: card.querySelector("#bid-alt-equipment")?.value || "",
    alternative_units: card.querySelector("#bid-alt-units")?.value || "",
    alternative_notes: card.querySelector("#bid-alt-notes")?.value || "",
    equipment_available: card.querySelector("#bid-equipment-available")?.value || "",
    current_unit_location: card.querySelector("#bid-current-unit-location")?.value || "",
    deadhead_distance: card.querySelector("#bid-deadhead-distance")?.value || "",
    deadhead_unit: card.querySelector("#bid-deadhead-unit")?.value || "mi",
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
  const rateLabel = commercialStructureConfig(draft.commercial_model).rateLabel || dualText("Carrier rate", "Tarifa carrier");
  const commercialModel = legacyCommercialModel(draft.commercial_model);
  const errors = [
    validatePositiveNumberIssue(draft.bid_rate, "bid-rate", rateLabel),
    validatePositiveNumberIssue(draft.weekly_capacity, "bid-capacity", "Weekly capacity", false),
    validatePositiveNumberIssue(draft.transit_days, "bid-transit-days", "Transit days", false)
  ].filter(Boolean);

  if (!/^[A-Z]{3}$/.test(String(draft.currency || "").trim().toUpperCase())) {
    errors.push(validationIssue("bid-currency", "Currency must be USD, MXN, CAD, or another 3-letter code."));
  }

  if (commercialModel === "direct_cost_plus") {
    const marginIssue = validatePercentIssue(draft.marksman_margin_pct, "bid-marksman-margin", "Suggested margin to share %", { required: false, procurementRange: true });
    if (marginIssue) errors.push(marginIssue);
  }

  if (commercialModel === "carrier_share") {
    const shareIssue = validatePercentIssue(draft.carrier_share_pct, "bid-carrier-share", "Carrier invoice share %", { required: false, procurementRange: true });
    if (shareIssue) errors.push(shareIssue);
  }

  if (commercialModel === "xbf_buy_sell") {
    const markupIssue = validatePercentIssue(draft.marksman_margin_pct, "bid-marksman-margin", "Suggested XBF margin %", { required: false, min: XBF_BUY_SELL_MIN_MARKUP_PCT, max: XBF_BUY_SELL_MAX_MARKUP_PCT });
    if (markupIssue) errors.push(markupIssue);
  }

  const alternativeUnitsIssue = validatePositiveNumberIssue(draft.alternative_units, "bid-alt-units", "Alternative units", false);
  if (alternativeUnitsIssue) errors.push(alternativeUnitsIssue);
  if (draft.best_alternative_offered && !draft.alternative_equipment.trim() && numberFromInput(draft.alternative_units) === null) {
    errors.push(validationIssue("bid-alt-equipment", "Best alternative needs equipment or a positive unit count."));
  }
  const deadheadIssue = validateNonNegativeNumberIssue(draft.deadhead_distance, "bid-deadhead-distance", "Deadhead distance", false);
  if (deadheadIssue) errors.push(deadheadIssue);
  if (String(draft.deadhead_distance || "").trim() && !["mi", "km"].includes(String(draft.deadhead_unit || "").trim().toLowerCase())) {
    errors.push(validationIssue("bid-deadhead-unit", "Deadhead unit must be mi or km."));
  }

  const pickupEta = validDateTimeValue(draft.eta_pickup);
  const deliveryEta = validDateTimeValue(draft.eta_delivery);
  const validThrough = validDateValue(draft.valid_through);
  if (draft.valid_through && !validThrough) errors.push(validationIssue("bid-valid-through", "Valid through must be a valid date."));
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
  if (!String(draft.valid_through || "").trim()) {
    warnings.push("Offer validity date is recommended for procurement review.");
  }
  if (draft.best_alternative_offered && !draft.alternative_notes.trim()) {
    warnings.push("Alternative notes help procurement understand assumptions and restrictions.");
  }
  if (draft.equipment_available !== "true") {
    warnings.push("Declaring available equipment and ETAs improves award scoring.");
  } else {
    if (!pickupEta) warnings.push("Pickup ETA is recommended when equipment is available.");
    if (!deliveryEta) warnings.push("Delivery ETA is recommended when equipment is available.");
    if (!draft.current_unit_location.trim()) warnings.push("Current unit location helps procurement validate live capacity.");
    if (!String(draft.deadhead_distance || "").trim()) warnings.push("Deadhead distance helps compare live capacity.");
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
  {
    key: "all_in_rate",
    label: "Carrier rate / Tarifa carrier",
    aliases: ["Carrier rate", "Tarifa carrier", "All-in rate", "Tarifa all-in"],
    width: 18,
    validation: "positiveNumber",
    required: true
  },
  { key: "currency", label: "Currency / Moneda", aliases: ["Currency", "Moneda"], width: 14, validation: "currency", required: true },
  { key: "weekly_capacity", label: "Weekly capacity / Capacidad semanal", aliases: ["Weekly capacity", "Capacidad semanal"], width: 20, validation: "positiveNumberBlank", recommended: true },
  { key: "transit_days", label: "Transit days / Dias transito", aliases: ["Transit days", "Dias transito"], width: 18, validation: "positiveNumberBlank", recommended: true },
  { key: "valid_through", label: "Valid through / Vigente hasta", aliases: ["Valid through", "Vigente hasta", "Offer valid through", "Vigencia"], width: 20, validation: "dateBlank", recommended: true },
  { key: "commercial_model", label: "Commercial model / Modelo comercial", aliases: ["Commercial model", "Modelo comercial"], width: 28, validation: "commercialModel", required: true },
  { key: "suggested_margin_pct", label: "Suggested / XBF margin % / Margen sugerido XBF %", aliases: ["Suggested margin %", "XBF margin %", "Margen sugerido %", "Margen XBF %"], width: 30, validation: "percent2to15Blank", conditional: "Optional. Direct/cost-plus defaults to 3%; XBF buy-sell defaults to 12%. / Opcional. Direct/cost-plus default 3%; XBF compra-venta default 12%." },
  { key: "carrier_invoice_share_pct", label: "Carrier invoice share % / Share factura carrier %", aliases: ["Carrier invoice share %", "Share factura carrier %"], width: 28, validation: "percent2to5", conditional: "Optional. Defaults to 3% for Carrier invoice share. / Opcional. Default 3% para Carrier invoice share." },
  { key: "best_alternative", label: "Best alternative / Mejor alternativa", aliases: ["Best alternative", "Mejor alternativa"], width: 22, validation: "yesNoBlank" },
  { key: "alternative_equipment", label: "Alternative equipment / Equipo alternativo", aliases: ["Alternative equipment", "Equipo alternativo"], width: 26 },
  { key: "alternative_units", label: "Alternative units / Unidades alternativas", aliases: ["Alternative units", "Unidades alternativas"], width: 22, validation: "positiveNumberBlank" },
  { key: "alternative_notes", label: "Alternative notes / Notas alternativa", aliases: ["Alternative notes", "Notas alternativa"], width: 38 },
  { key: "equipment_available", label: "Equipment available / Equipo disponible", aliases: ["Equipment available", "Equipo disponible"], width: 24, validation: "availability" },
  { key: "current_unit_location", label: "Current unit location / Ubicacion unidad", aliases: ["Current unit location", "Ubicacion unidad", "Unit location", "Ubicacion actual"], width: 28, recommended: true },
  { key: "deadhead_distance", label: "Deadhead distance / Vacio mi-km", aliases: ["Deadhead distance", "Vacio mi-km", "Millas vacias", "Kms vacios"], width: 22, validation: "nonNegativeNumberBlank", recommended: true },
  { key: "deadhead_unit", label: "Deadhead unit / Unidad deadhead", aliases: ["Deadhead unit", "Unidad deadhead"], width: 18, validation: "deadheadUnit", recommended: true },
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

function normalizeTemplateDeadheadUnit(value) {
  const text = textValue(value).toLowerCase();
  if (!text) return "mi";
  if (["km", "kms", "kilometer", "kilometers", "kilometro", "kilometros"].includes(text)) return "km";
  if (["mi", "mile", "miles", "milla", "millas"].includes(text)) return "mi";
  return text;
}

function normalizeTemplateDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateTimeLocalValue(value.toISOString());
  return textValue(value);
}

function normalizeTemplateDate(value) {
  return dateOnlyValue(value) || textValue(value);
}

function normalizeTemplateCurrency(value, fallback = "USD") {
  const currency = textValue(value || fallback).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : currency || fallback;
}

function bidTemplateCommercialModelValue(value) {
  const model = legacyCommercialModel(value);
  if (model === "carrier_share") return "Carrier invoice share";
  if (model === "xbf_buy_sell") return "XBF buy-sell";
  return "Direct / cost-plus";
}

function bidTemplateRows(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || {};
  return bidTemplateSourceRows(carrierBook, invitation, bookStatus)
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
        valid_through: dateOnlyValue(row.valid_through),
        commercial_model: bidTemplateCommercialModelValue(row.commercial_model),
        suggested_margin_pct: row.marksman_margin_pct ?? "",
        carrier_invoice_share_pct: row.carrier_share_pct ?? "",
        best_alternative: row.best_alternative_offered ? "TRUE" : "",
        alternative_equipment: row.alternative_equipment || "",
        alternative_units: row.alternative_units ?? "",
        alternative_notes: row.alternative_notes || "",
        equipment_available: row.equipment_available === true ? "Available" : row.equipment_available === false ? "Not available" : "",
        current_unit_location: row.current_unit_location || "",
        deadhead_distance: row.deadhead_distance ?? "",
        deadhead_unit: row.deadhead_unit || "mi",
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
  if (column.validation === "nonNegativeNumberBlank") {
    return {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [0],
      ...common,
      error: "Enter zero or a positive number, or leave blank. / Captura cero o un numero positivo, o deja en blanco."
    };
  }
  if (column.validation === "deadheadUnit") {
    return { type: "list", allowBlank: true, formulae: ['"mi,km"'], ...common };
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
  if (column.validation === "percent2to15Blank") {
    return {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [2, 15],
      ...common,
      error: "Enter a valid percentage. Direct/cost-plus uses 2-5; XBF buy-sell uses 7.5-15. / Captura un porcentaje valido. Direct/cost-plus usa 2-5; XBF compra-venta usa 7.5-15."
    };
  }
  if (column.validation === "dateBlank") {
    return {
      type: "date",
      operator: "greaterThan",
      allowBlank: true,
      formulae: [new Date(2020, 0, 1)],
      ...common,
      error: "Enter a valid date or leave blank. / Captura una fecha valida o deja en blanco."
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
  for (const key of ["all_in_rate", "weekly_capacity", "transit_days", "suggested_margin_pct", "carrier_invoice_share_pct", "alternative_units", "deadhead_distance"]) {
    worksheet.getColumn(BID_TEMPLATE_COLUMNS.findIndex((column) => column.key === key) + 1).numFmt = "#,##0.00";
  }
  worksheet.getColumn(BID_TEMPLATE_COLUMNS.findIndex((column) => column.key === "valid_through") + 1).numFmt = "yyyy-mm-dd";
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
      en: "Required to submit: Carrier rate, Currency, Commercial model. The carrier-rate meaning changes by commercial model; commercial percentages are optional and Rateware applies defaults when blank.",
      es: "Obligatorio para enviar: Tarifa carrier, Moneda, Modelo comercial. El significado de la tarifa carrier cambia segun el modelo comercial; los porcentajes comerciales son opcionales y Rateware aplica defaults si quedan vacios."
    },
    {
      section: "Recommended columns",
      en: "Weekly capacity, transit days, valid through date, equipment availability, current unit location, deadhead distance, ETAs, unit details, alternatives, and notes improve scoring and procurement review, but they do not block submission unless the value entered is invalid.",
      es: "Capacidad semanal, dias de transito, vigencia, disponibilidad, ubicacion actual de unidad, deadhead/vacio, ETAs, datos de unidad, alternativas y notas mejoran el scoring y la revision, pero no bloquean el envio salvo que el valor capturado sea invalido."
    },
    {
      section: "Dropdowns",
      en: "Use dropdowns for Submit this lane, Currency, Commercial model, Best alternative, Equipment available, Deadhead unit, Mirror account, and Best/final.",
      es: "Usa las listas desplegables para Enviar ruta, Moneda, Modelo comercial, Mejor alternativa, Equipo disponible, Unidad deadhead, Cuenta espejo y Mejor/final."
    },
    {
      section: "Commercial model",
      en: "Direct / cost-plus: enter your direct carrier cost; Suggested margin is 2-5%, default 3%. Carrier invoice share: enter the all-in price you want to keep; Invoice share is 2-5%, default 3%. XBF buy-sell: enter your sell rate to XBF; Suggested / XBF margin is 7.5-15%, default 12%.",
      es: "Directo / cost-plus: captura tu costo directo como carrier; Margen sugerido es 2-5%, default 3%. Carrier invoice share: captura el all-in que quieres conservar; Share factura es 2-5%, default 3%. XBF compra-venta: captura tu tarifa de venta a XBF; Margen sugerido / XBF es 7.5-15%, default 12%."
    },
    {
      section: "Rate",
      en: "Carrier rate is required and must be greater than zero. Enter the direct cost, preserved all-in, or sell rate to XBF according to the commercial model. Weekly capacity and transit days are optional, but if entered they must be numeric and greater than zero. Deadhead distance is optional and may be zero or positive.",
      es: "La tarifa carrier es obligatoria y debe ser mayor a cero. Captura el costo directo, all-in que deseas conservar o tarifa de venta a XBF segun el modelo comercial. Capacidad semanal y dias de transito son opcionales, pero si se capturan deben ser numericos y mayores a cero. Deadhead/vacio es opcional y puede ser cero o positivo."
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

function setCarrierPortalStatus(selector, message, tone = "neutral") {
  const status = card?.querySelector(selector);
  if (!status) return false;
  status.textContent = message;
  status.dataset.tone = tone;
  return true;
}

async function downloadBidTemplate(carrierBook = {}, invitation = {}) {
  const rows = bidTemplateRows(carrierBook, invitation);
  if (!rows.length) {
    setCarrierPortalStatus(
      "#carrier-bid-template-status",
      dualText("No invited lanes are available for this bid template.", "No hay lanes invitadas disponibles para este template."),
      "error"
    );
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
    valid_through: normalizeTemplateDate(row.valid_through),
    commercial_model: commercialModel,
    marksman_margin_pct: ["direct_cost_plus", "xbf_buy_sell"].includes(commercialModel) ? textValue(row.suggested_margin_pct) : "",
    carrier_share_pct: commercialModel === "carrier_share" ? textValue(row.carrier_invoice_share_pct) : "",
    best_alternative_offered: normalizeTemplateBoolean(row.best_alternative),
    alternative_equipment: textValue(row.alternative_equipment),
    alternative_units: textValue(row.alternative_units),
    alternative_notes: textValue(row.alternative_notes),
    equipment_available: normalizeTemplateAvailability(row.equipment_available),
    current_unit_location: textValue(row.current_unit_location),
    deadhead_distance: textValue(row.deadhead_distance),
    deadhead_unit: normalizeTemplateDeadheadUnit(row.deadhead_unit),
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
  row.submission_status = "ready";
  row.submission_error = "";
  row.draft = draftFromBidTemplateRow(row);
  row.validation = validateBidTemplateRow(row);
  return row;
}

function validateBidTemplateRow(row) {
  if (!row.submit_this_lane) return { errors: [], warnings: [] };
  const validation = validateBidDraft(row.draft);
  const errors = [
    ...(row.scope_errors || []).map((message) => validationIssue("invitation-token", `Row ${row.row_number}: ${message}`)),
    ...validation.errors
  ];
  if (!row.invitation_token && !(row.scope_errors || []).length) {
    errors.unshift(validationIssue("invitation-token", `Row ${row.row_number}: missing invitation token. Download a fresh template.`));
  }
  return { errors, warnings: validation.warnings };
}

async function parseBidTemplateFile(file, carrierBook = lastCarrierBook || {}, invitation = lastInvitation || {}) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets["Bid Template"] || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("Workbook does not contain a bid template sheet.");
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
  const normalizedRows = rows
    .map(normalizeBidTemplateRow)
    .filter((row) => row.invitation_token || row.submit_this_lane || row.all_in_rate || row.weekly_capacity || row.valid_through || row.deadhead_distance || row.current_unit_location);
  const reconciliation = reconcileBidTemplateUploadRows(normalizedRows, bidTemplateRows(carrierBook, invitation));
  reconciliation.rows.forEach((row) => {
    row.draft = draftFromBidTemplateRow(row);
    row.validation = validateBidTemplateRow(row);
  });
  return reconciliation;
}

function renderBidTemplatePreview(rows = pendingBidTemplateRows) {
  const preview = card.querySelector("#carrier-bid-template-preview");
  const submitButton = card.querySelector("[data-submit-bid-template]");
  const status = card.querySelector("#carrier-bid-template-status");
  if (!preview || !submitButton) return;
  const selectedRows = rows.filter((row) => row.submit_this_lane);
  const invalidRows = selectedRows.filter((row) => row.validation.errors.length);
  const retryRows = selectedRows.filter((row) => row.submission_status !== "submitted");
  const failedRows = selectedRows.filter((row) => row.submission_status === "failed");
  const submittedRows = selectedRows.filter((row) => row.submission_status === "submitted");
  submitButton.disabled = !retryRows.length || invalidRows.length > 0 || bidTemplateSubmitting;
  submitButton.textContent = failedRows.length
    ? dualText(`Retry ${failedRows.length} failed`, `Reintentar ${failedRows.length} fallidas`)
    : t("confirmXlsx");
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
      : failedRows.length
        ? dualText(`${submittedRows.length} submitted; ${failedRows.length} failed. Retry sends failed rows only.`, `${submittedRows.length} enviadas; ${failedRows.length} fallaron. Reintentar envia solo las filas fallidas.`)
      : dualText(`${selectedRows.length} row(s) ready. Review the preview, then confirm submission.`, `${selectedRows.length} fila(s) listas. Revisa la vista previa y confirma el envio.`);
    status.dataset.tone = invalidRows.length || failedRows.length ? "error" : "success";
  }
  const coverage = pendingBidTemplateCoverage || { active: 0, matched: 0, missing: 0, stale: 0, duplicate: 0 };
  const displayRows = [...rows]
    .sort((left, right) => Number(Boolean(right.validation.errors.length)) - Number(Boolean(left.validation.errors.length)) || left.row_number - right.row_number)
    .slice(0, 50);
  preview.innerHTML = `
    <div class="bid-template-preview-summary">
      <span>${escapeHtml(dualText(`${coverage.matched}/${coverage.active} active lanes matched`, `${coverage.matched}/${coverage.active} rutas activas conciliadas`))}</span>
      <span>${escapeHtml(t("selectedRows", { count: selectedRows.length }))}</span>
      <span>${escapeHtml(t("errorRows", { count: invalidRows.length }))}</span>
      <span>${escapeHtml(t("skippedRows", { count: rows.length - selectedRows.length }))}</span>
      ${coverage.missing ? `<span class="status-pill warning">${escapeHtml(dualText(`${coverage.missing} active lane(s) missing from file`, `${coverage.missing} ruta(s) activa(s) faltan en el archivo`))}</span>` : ""}
    </div>
    <div class="table-wrap">
      <table class="bid-template-preview-table">
        <thead><tr><th>${escapeHtml(dualText("Row", "Fila"))}</th><th>Lane</th><th>${escapeHtml(dualText("Rate", "Tarifa"))}</th><th>${escapeHtml(dualText("Capacity", "Capacidad"))}</th><th>${escapeHtml(dualText("Valid through", "Vigente hasta"))}</th><th>Status</th></tr></thead>
        <tbody>
          ${displayRows.map((row) => {
            const errors = row.validation.errors.map((issue) => issue.message);
            const lane = [row.origin, row.destination].filter(Boolean).join(" -> ") || row.lane_number || "-";
            const statusHtml = row.submission_status === "submitted"
              ? `<span class="status-pill success">${escapeHtml(dualText("Submitted", "Enviada"))}</span>`
              : row.submission_status === "failed"
                ? `<span class="status-pill danger">${escapeHtml(dualText("Failed", "Fallo"))}</span><small>${escapeHtml(row.submission_error || "")}</small>`
              : !row.submit_this_lane
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
                <td>${escapeHtml(row.draft.valid_through || "-")}</td>
                <td>${statusHtml}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    ${rows.length > 50 ? `<p class="bid-board-note">${escapeHtml(dualText(`Showing 50 of ${rows.length} rows; rows with errors appear first.`, `Mostrando 50 de ${rows.length} filas; las filas con errores aparecen primero.`))}</p>` : ""}
  `;
}

async function submitBidTemplateRows() {
  if (bidTemplateSubmitting) return;
  const status = card.querySelector("#carrier-bid-template-status");
  const button = card.querySelector("[data-submit-bid-template]");
  const rows = pendingBidTemplateRows.filter((row) => row.submit_this_lane && row.submission_status !== "submitted");
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
  bidTemplateSubmitting = true;
  let completedAll = false;
  if (button) button.disabled = true;
  if (status) {
    status.textContent = dualText(`Submitting ${rows.length} XLSX bid row(s)...`, `Enviando ${rows.length} fila(s) de puja XLSX...`);
    status.dataset.tone = "neutral";
  }
  try {
    let submitted = 0;
    let failed = 0;
    for (const [index, row] of rows.entries()) {
      row.submission_status = "submitting";
      row.submission_error = "";
      if (status) status.textContent = dualText(`Submitting ${index + 1} of ${rows.length}...`, `Enviando ${index + 1} de ${rows.length}...`);
      try {
        await callBidApi("submit_bid", { token: row.invitation_token, ...row.draft });
        row.submission_status = "submitted";
        markOwnOfferRevisionPending(row.invitation_token);
        submitted += 1;
      } catch (error) {
        row.submission_status = "failed";
        row.submission_error = humanizeError(error);
        failed += 1;
      }
      renderBidTemplatePreview();
    }
    if (failed) {
      if (status) {
        status.textContent = dualText(`${submitted} submitted; ${failed} failed. Retry sends failed rows only.`, `${submitted} enviadas; ${failed} fallaron. Reintentar envia solo las filas fallidas.`);
        status.dataset.tone = "error";
      }
    } else {
      pendingBidTemplateRows = [];
      pendingBidTemplateCoverage = null;
      queuePrivateBidAlert("bidSubmitted", dualText(`${submitted} bid row(s) submitted from XLSX.`, `${submitted} fila(s) enviadas desde XLSX.`));
      await loadInvitation();
      completedAll = true;
    }
  } finally {
    bidTemplateSubmitting = false;
    if (!completedAll) renderBidTemplatePreview();
  }
}

function renderBidTemplateTools(carrierBook = {}, invitation = {}) {
  const rows = bidTemplateRows(carrierBook, invitation);
  const invitedCount = eventInvitedLaneRows(carrierBook, invitation).length;
  if (!rows.length && !invitedCount) return "";
  const activeLaneCount = rows.length || invitedCount;
  const laneScope = activeLaneCount === 1
    ? dualText(
      "1 active invited lane is available. Individual route actions stay in Bid tools.",
      "1 ruta invitada activa esta disponible. Las acciones individuales por ruta permanecen en Herramientas de puja."
    )
    : dualText(
      `${activeLaneCount} active invited lanes are available. Individual route actions stay in Bid tools.`,
      `${activeLaneCount} rutas invitadas activas estan disponibles. Las acciones individuales por ruta permanecen en Herramientas de puja.`
    );
  return `
    <details class="carrier-bid-template-tools" data-bid-template-tools>
      <summary>
        <div class="carrier-bid-template-summary-copy">
          <p class="eyebrow">${escapeHtml(dualText("Batch quote", "Cotizacion masiva"))}</p>
          <strong>${escapeHtml(t("xlsxTitle"))} ${portalHelp(laneScope)}</strong>
        </div>
        <div class="carrier-bid-template-summary-meta">
          <span class="status-pill muted">${escapeHtml(dualText(`${activeLaneCount} lanes`, `${activeLaneCount} rutas`))}</span>
          <span class="carrier-bid-template-trigger">${escapeHtml(dualText("Open", "Abrir"))}</span>
        </div>
      </summary>
      <div class="carrier-bid-template-tools-body">
        <div class="carrier-bid-template-copy">
          <p class="carrier-bid-template-scope">${escapeHtml(dualText(
            "Download the invited lane book, edit offer fields, then upload it. Unselected lanes and offer history remain unchanged.",
            "Descarga la cedula invitada, edita los campos de oferta y subela. Las rutas no seleccionadas y el historial no cambian."
          ))}</p>
        </div>
        <div class="carrier-bid-template-workflow">
          <div class="carrier-bid-template-actions">
            <button type="button" data-download-bid-template ${rows.length ? "" : "disabled"}>${escapeHtml(t("downloadXlsx"))}</button>
            <label class="carrier-bid-template-upload">
              <span>${escapeHtml(t("uploadXlsx"))}</span>
              <input id="carrier-bid-template-file" type="file" accept=".xlsx,.xls,.csv" ${rows.length ? "" : "disabled"} />
            </label>
            <button type="button" data-submit-bid-template disabled>${escapeHtml(t("confirmXlsx"))}</button>
          </div>
        </div>
      </div>
      <p id="carrier-bid-template-status" class="status-message" role="status">${escapeHtml(rows.length
        ? dualText("All active invited lanes are included. Select only the rows you want to create or update.", "Todas las rutas invitadas activas se incluyen. Selecciona solamente las filas que deseas crear o actualizar.")
        : dualText("No active invited lanes are available for this XLSX template.", "No hay rutas invitadas activas disponibles para este template XLSX."))}</p>
      <div id="carrier-bid-template-preview" class="carrier-bid-template-preview"></div>
    </details>
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

function bidReviewSummaryHtml(draft) {
  const validation = validateBidDraft(draft);
  const warnings = [...validation.errors.map((issue) => issue.message), ...validation.warnings];
  const commercialConfig = commercialStructureConfig(draft.commercial_model);
  const alternative = draft.best_alternative_offered
    ? [draft.alternative_equipment, draft.alternative_units ? `${draft.alternative_units} unit(s)` : null].filter(Boolean).join(" / ") || "Alternative declared"
    : "No alternative";
  const availability = draft.equipment_available === "true"
    ? ["Available", draft.eta_pickup ? `Pickup ${draft.eta_pickup.replace("T", " ")}` : null, draft.eta_delivery ? `Delivery ${draft.eta_delivery.replace("T", " ")}` : null].filter(Boolean).join(" | ")
    : draft.equipment_available === "false"
      ? "Not available"
      : "Not declared";
  const deadhead = String(draft.deadhead_distance || "").trim()
    ? `Deadhead ${draft.deadhead_distance} ${draft.deadhead_unit || "mi"}${draft.current_unit_location ? ` from ${draft.current_unit_location}` : ""}`
    : draft.current_unit_location
      ? `Unit at ${draft.current_unit_location}`
      : "No deadhead details";
  return `
    <div class="bid-review-summary-grid">
      <article title="${escapeAttribute(commercialConfig.rateEntryHelp)}"><span>${escapeHtml(commercialConfig.rateLabel)}</span><strong>${escapeHtml(formatMoney(draft.bid_rate, draft.currency))}</strong><small>${escapeHtml(draft.weekly_capacity || "-")} / wk | ${escapeHtml(draft.transit_days || "-")} day(s) | ${escapeHtml(draft.valid_through || "no validity date")}</small></article>
      <article><span>Commercial model</span><strong>${escapeHtml(commercialModelLabel(draft.commercial_model))}</strong><small>${escapeHtml(commercialFeeSummary(draft))}</small></article>
      <article><span>Alternative</span><strong>${escapeHtml(alternative)}</strong><small>${escapeHtml(draft.alternative_notes || "No alternative notes")}</small></article>
      <article><span>Capacity</span><strong>${escapeHtml(availability)}</strong><small>${escapeHtml([deadhead, draft.mirror_account_enabled ? "Mirror account requested" : draft.unit_details || "No unit details"].filter(Boolean).join(" | "))}</small></article>
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
  const marksmanLabel = card.querySelector("#bid-marksman-margin-label");
  const helper = card.querySelector("#bid-commercial-helper");
  const activePercent = card.querySelector("#bid-commercial-active-percent");
  const rateLabel = card.querySelector("#bid-rate-label");
  const rateEntryHelp = card.querySelector("#bid-rate-entry-help");

  marksmanGroup?.classList.toggle("hidden", config.percentageField !== "marksman");
  carrierGroup?.classList.toggle("hidden", config.percentageField !== "carrier");
  if (marksmanInput) marksmanInput.disabled = config.percentageField !== "marksman";
  if (carrierInput) carrierInput.disabled = config.percentageField !== "carrier";
  if (marksmanInput) marksmanInput.placeholder = model === "xbf_buy_sell" ? "7.5-15 (default 12)" : "2-5 (default 3)";
  if (carrierInput) carrierInput.placeholder = "2-5 (default 3)";
  if (marksmanLabel) marksmanLabel.textContent = config.percentageLabel || t("suggestedMargin");
  if (rateLabel) rateLabel.textContent = config.rateLabel || t("allInRate");
  if (rateEntryHelp) rateEntryHelp.textContent = config.rateEntryHelp || commercialModelEntryRule(model);
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
    activePercent.textContent = config.percentageLabel;
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
  setFormValue("#bid-valid-through", dateOnlyValue(firstDefined(source.valid_through, invitation.valid_through, "")));
  setFormValue("#bid-commercial-model", legacyCommercialModel(firstDefined(source.commercial_model, invitation.commercial_model, "direct_cost_plus")));
  setFormValue("#bid-marksman-margin", firstDefined(source.marksman_margin_pct, invitation.marksman_margin_pct, ""));
  setFormValue("#bid-carrier-share", firstDefined(source.carrier_share_pct, invitation.carrier_share_pct, ""));
  setFormChecked("#bid-alt-enabled", firstDefined(source.best_alternative_offered, invitation.best_alternative_offered, false) === true);
  setFormValue("#bid-alt-equipment", firstDefined(source.alternative_equipment, invitation.alternative_equipment, ""));
  setFormValue("#bid-alt-units", firstDefined(source.alternative_units, invitation.alternative_units, ""));
  setFormValue("#bid-alt-notes", invitation.alternative_notes || "");
  const equipmentAvailable = firstDefined(source.equipment_available, invitation.equipment_available, "");
  setFormValue("#bid-equipment-available", equipmentAvailable === true ? "true" : equipmentAvailable === false ? "false" : "");
  setFormValue("#bid-current-unit-location", firstDefined(source.current_unit_location, invitation.current_unit_location, ""));
  setFormValue("#bid-deadhead-distance", firstDefined(source.deadhead_distance, invitation.deadhead_distance, ""));
  setFormValue("#bid-deadhead-unit", firstDefined(source.deadhead_unit, invitation.deadhead_unit, "mi"));
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
  const participationStatus = String(lastInvitation?.invitation_status || "").toLowerCase();
  const canReject = !editing && !["declined", "rejected", "withdrawn", "awarded"].includes(participationStatus);
  const canWithdraw = editing && participationStatus !== "awarded";
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
  const rejectButton = card.querySelector("[data-decline-invitation]");
  if (rejectButton) rejectButton.hidden = !canReject;
  const withdrawButton = card.querySelector("[data-withdraw-offer]");
  if (withdrawButton) withdrawButton.hidden = !canWithdraw;
}

function openBidEditor(options = {}) {
  // Legacy entry points now land in the selected lane's inline quick-bid row.
  const panelBySection = {
    alternative: "alternative",
    capacity: "capacity"
  };
  const invitationToken = selectedBidToolsToken || String(lastInvitation?.invitation_token || tokenFromUrl() || "");
  selectBidToolsLane(invitationToken, {
    panel: panelBySection[options.section] || "",
    focusQuickBid: !panelBySection[options.section]
  });
}

function focusCurrentOfferEditor() {
  openBidEditor({ section: "primary" });
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
        <thead><tr><th>Rank</th><th>Bidder</th><th>Score</th><th>Rate visibility</th><th>Commercial</th><th>Market signals</th><th>Capacity</th><th>Transit</th><th>Valid through</th><th>Action</th></tr></thead>
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
              <td>
                ${escapeHtml(row.weekly_capacity ?? "-")}
                ${row.deadhead_distance !== null && row.deadhead_distance !== undefined ? `<small>${escapeHtml(`DH ${row.deadhead_distance} ${row.deadhead_unit || "mi"}`)}</small>` : ""}
              </td>
              <td>${escapeHtml(row.transit_days ?? "-")}</td>
              <td>${escapeHtml(row.valid_through ? formatDate(row.valid_through) : "-")}</td>
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
    before.valid_through !== after.valid_through && after.valid_through !== undefined
      ? `Valid through ${after.valid_through || "-"}`
      : null,
    legacyCommercialModel(before.commercial_model, "") !== legacyCommercialModel(after.commercial_model, "") && after.commercial_model
      ? commercialModelLabel(after.commercial_model)
      : null,
    after.bid_rate !== undefined && after.commercial_model
      ? commercialFeeSummary(after)
      : null,
    before.equipment_available !== after.equipment_available && after.equipment_available !== undefined
      ? `Equipment ${after.equipment_available ? "available" : "not available"}`
      : null,
    before.current_unit_location !== after.current_unit_location && after.current_unit_location
      ? `Unit location ${after.current_unit_location}`
      : null,
    before.deadhead_distance !== after.deadhead_distance && after.deadhead_distance !== undefined
      ? `Deadhead ${after.deadhead_distance ?? "-"} ${after.deadhead_unit || "mi"}`
      : null,
    before.eta_pickup !== after.eta_pickup && after.eta_pickup !== undefined
      ? `Pickup ETA ${after.eta_pickup ? formatDateTime(after.eta_pickup) : "-"}`
      : null,
    before.eta_delivery !== after.eta_delivery && after.eta_delivery !== undefined
      ? `Delivery ETA ${after.eta_delivery ? formatDateTime(after.eta_delivery) : "-"}`
      : null,
    before.unit_details !== after.unit_details && after.unit_details !== undefined
      ? `Unit details ${after.unit_details || "-"}`
      : null,
    before.availability_validation_status !== after.availability_validation_status && after.availability_validation_status !== undefined
      ? `Availability validation ${after.availability_validation_status || "-"}`
      : null,
    before.mirror_account_enabled !== after.mirror_account_enabled && after.mirror_account_enabled !== undefined
      ? `Mirror account ${after.mirror_account_enabled ? "requested" : "not requested"}`
      : null
  ].filter(Boolean);
  return deltas.length
    ? deltas.map((delta) => `<span>${escapeHtml(delta)}</span>`).join("")
    : "<span>No field-level delta captured</span>";
}

function bidCommitmentSnapshotHtml(metadata = {}) {
  const after = metadata.after || {};
  const commitments = [
    after.valid_through ? `Valid through ${after.valid_through}` : null,
    after.weekly_capacity !== null && after.weekly_capacity !== undefined ? `Capacity ${after.weekly_capacity} / wk` : null,
    after.equipment_available === true ? "Equipment available" : after.equipment_available === false ? "Equipment unavailable" : null,
    after.deadhead_distance !== null && after.deadhead_distance !== undefined ? `Deadhead ${after.deadhead_distance} ${after.deadhead_unit || "mi"}` : null,
    after.eta_pickup ? `Pickup ${formatDateTime(after.eta_pickup)}` : null,
    after.eta_delivery ? `Delivery ${formatDateTime(after.eta_delivery)}` : null
  ].filter(Boolean);
  return commitments.length
    ? `<small class="carrier-bid-history-commitments">${escapeHtml(commitments.join(" | "))}</small>`
    : "";
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
                ${bidCommitmentSnapshotHtml(metadata)}
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
  const panel = bidSupportPanel;
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
  const panel = bidSupportPanel;
  if (!panel) return;
  panel.dataset.open = open ? "true" : "false";
  panel.querySelector("[data-bid-support-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) window.setTimeout(() => panel.querySelector("#bid-support-message")?.focus({ preventScroll: true }), 40);
}

async function askBidSupport(options = {}) {
  if (bidSupportSubmitting) return;
  const status = bidSupportPanel?.querySelector("#bid-support-status");
  const input = bidSupportPanel?.querySelector("#bid-support-message");
  const buttons = Array.from(bidSupportPanel?.querySelectorAll("#bid-support-form button") || []);
  const message = String(options.createTicket ? lastBidSupportQuestion : input?.value || "").trim();
  if (!message) {
    if (status) {
      status.textContent = dualText("Write a support question first.", "Escribe una pregunta primero.");
      status.dataset.tone = "error";
    }
    input?.focus();
    return;
  }
  bidSupportSubmitting = true;
  buttons.forEach((button) => { button.disabled = true; });
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
    const nextStatus = bidSupportPanel?.querySelector("#bid-support-status");
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
      status.textContent = humanizeError(error) || dualText("Support could not answer.", "Soporte no pudo responder.");
      status.dataset.tone = "error";
    }
  } finally {
    bidSupportSubmitting = false;
    const nextButtons = Array.from(bidSupportPanel?.querySelectorAll("#bid-support-form button") || []);
    nextButtons.forEach((button) => { button.disabled = false; });
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

function bookStatus(row = {}, packagePayload = null) {
  const payload = packagePayload || masterPackageForCarrier(lastCarrierBook || {}, {
    rfx_events: row.event || row.rfx_events || {}
  });
  return canonicalLaneStatus(row, rowFitProgress(row, payload));
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
      || (bookFilters.view === "invited" && status === "invited")
      || (bookFilters.view === "agreed" && status === "agreed")
      || (bookFilters.view === "exception" && status === "exception")
      || (bookFilters.view === "open" && !row.is_invited)
      || (bookFilters.view === "quoted" && status === "quoted")
      || (bookFilters.view === "awarded" && status === "awarded")
      || (bookFilters.view === "backup" && status === "backup")
      || (bookFilters.view === "not_awarded" && status === "not_awarded")
      || (["rejected", "declined"].includes(bookFilters.view) && status === "rejected")
      || (bookFilters.view === "withdrawn" && status === "withdrawn");
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
    const status = bookStatus(row);
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
        <td><span class="status-pill ${statusTone(status)}" data-lane-lifecycle-status data-lane-lifecycle-token="${escapeAttribute(row.invitation_token || "")}" title="${escapeAttribute(laneStatusDescription(status))}">${escapeHtml(statusLabel(status))}</span></td>
        <td>
          ${amount}
          ${boardAmount && boardAmount !== amount ? `<small>${escapeHtml(dualText(`Board ${boardAmount}`, `Board ${boardAmount}`))}</small>` : ""}
          <small>${row.weekly_capacity ? `${escapeHtml(row.weekly_capacity)} / wk` : ""}</small>
          <small>${row.deadhead_distance !== null && row.deadhead_distance !== undefined ? `${escapeHtml(dualText("Deadhead", "Vacio"))} ${escapeHtml(row.deadhead_distance)} ${escapeHtml(row.deadhead_unit || "mi")}` : ""}</small>
          <small>${row.valid_through ? `${escapeHtml(dualText("Valid through", "Vigente hasta"))} ${escapeHtml(formatDate(row.valid_through))}` : ""}</small>
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
  const packagePayload = masterPackageForCarrier(carrierBook, invitation);
  return eventInvitedLaneRows(carrierBook, invitation)
    .filter((row) => isBidToolsEligibleRow(row, (candidate) => bookStatus(candidate, packagePayload)));
}

function quickBidCommercialPercent(row = {}) {
  const model = legacyCommercialModel(row.commercial_model);
  if (model === "carrier_share") return row.carrier_share_pct ?? "";
  if (model === "direct_cost_plus" || model === "xbf_buy_sell") return row.marksman_margin_pct ?? "";
  return "";
}

function quickBidCommercialPlaceholder(model) {
  const value = legacyCommercialModel(model);
  if (value === "xbf_buy_sell") return "7.5-15";
  return "2-5";
}

function quickBidCommercialPercentLabel(model) {
  const value = legacyCommercialModel(model);
  const labels = {
    direct_cost_plus: dualText("Suggested margin %", "Margen sugerido %"),
    carrier_share: dualText("Invoice share %", "Participacion de factura %"),
    xbf_buy_sell: dualText("XBF margin %", "Margen XBF %")
  };
  return labels[value] || labels.direct_cost_plus;
}

function quickBidRowStatus(row = {}) {
  const localDraft = pendingQuickBidDrafts.get(String(row.invitation_token || ""));
  if (localDraft?.local_only) {
    return `<span class="status-message quick-bid-local-draft" data-tone="warning" title="${escapeAttribute(dualText("These changes are retained in this browser until you publish the route offer.", "Estos cambios se conservan en este navegador hasta que publiques la oferta de la ruta."))}">${escapeHtml(dualText("Unpublished changes", "Cambios sin publicar"))}</span>`;
  }
  if (!lastQuickBidSaveStatus || lastQuickBidSaveStatus.token !== row.invitation_token) return "";
  return `<span class="status-message" data-tone="${escapeAttribute(lastQuickBidSaveStatus.tone || "neutral")}">${escapeHtml(lastQuickBidSaveStatus.message || "")}</span>`;
}

function renderQuickBidCommercialEffect(model) {
  const config = commercialStructureConfig(model);
  const effect = commercialModelEffect(model);
  const quickEffect = commercialModelQuickEffect(model);
  return `<small class="quick-bid-commercial-effect" data-quick-bid-commercial-effect title="${escapeAttribute(effect)}">${escapeHtml(config.tone)}: ${escapeHtml(quickEffect)}</small>`;
}

function quickBidCommercialPreview(row = {}) {
  const details = commercialRateDetails(row);
  const currency = details.currency || "USD";
  if (details.carrierRate === null) {
    const entryRule = commercialModelEntryRule(row.commercial_model);
    return {
      state: "empty",
      text: `${entryRule} ${dualText("Preview the board impact before submitting.", "Revisa el impacto en board antes de enviar.")}`,
      title: dualText("Board price and fee update before you submit this lane.", "El precio de board y el fee se actualizan antes de enviar esta ruta.")
    };
  }
  if (details.model === "carrier_share") {
    const fee = formatMoney(details.commissionFee, currency);
    return {
      state: "ready",
      text: dualText(
        `Carrier / board ${formatMoney(details.carrierRate, currency)} | Fee ${fee}`,
        `Carrier / board ${formatMoney(details.carrierRate, currency)} | Fee ${fee}`
      ),
      title: commercialFeeSummary(row)
    };
  }
  if (details.model === "xbf_buy_sell") {
    const margin = formatMoney(details.markupFee, currency);
    return {
      state: "ready",
      text: dualText(
        `Carrier ${formatMoney(details.carrierRate, currency)} | Board ${formatMoney(details.boardRate, currency)} | Margin ${margin}`,
        `Carrier ${formatMoney(details.carrierRate, currency)} | Board ${formatMoney(details.boardRate, currency)} | Margen ${margin}`
      ),
      title: commercialFeeSummary(row)
    };
  }
  const fee = formatMoney(details.commissionFee, currency);
  return {
    state: "ready",
    text: dualText(
      `Carrier ${formatMoney(details.carrierRate, currency)} | Board ${formatMoney(details.boardRate, currency)} | Fee ${fee}`,
      `Carrier ${formatMoney(details.carrierRate, currency)} | Board ${formatMoney(details.boardRate, currency)} | Fee ${fee}`
    ),
    title: commercialFeeSummary(row)
  };
}

function renderQuickBidCommercialPreview(row = {}) {
  const preview = quickBidCommercialPreview(row);
  return `<small class="quick-bid-commercial-preview" data-quick-bid-commercial-preview data-preview-state="${escapeAttribute(preview.state)}" title="${escapeAttribute(preview.title)}">${escapeHtml(preview.text)}</small>`;
}

function syncQuickBidCommercialPresentation(rowElement, { resetPercentage = false } = {}) {
  if (!rowElement) return;
  const modelInput = rowElement.querySelector("[data-quick-bid-field='commercial_model']");
  if (!modelInput) return;
  const config = commercialStructureConfig(modelInput.value);
  modelInput.title = commercialModelEffect(modelInput.value);
  const rateInput = rowElement.querySelector("[data-quick-bid-field='bid_rate']");
  if (rateInput) {
    rateInput.setAttribute("aria-label", config.rateLabel || dualText("Carrier rate", "Tarifa carrier"));
    rateInput.title = config.rateEntryHelp || commercialModelEntryRule(modelInput.value);
  }
  const percentageInput = rowElement.querySelector("[data-quick-bid-field='commercial_pct']");
  if (percentageInput) {
    percentageInput.disabled = false;
    if (resetPercentage) percentageInput.value = "";
    percentageInput.placeholder = quickBidCommercialPlaceholder(modelInput.value);
    percentageInput.setAttribute("aria-label", quickBidCommercialPercentLabel(modelInput.value));
    percentageInput.setAttribute("title", quickBidCommercialPercentLabel(modelInput.value));
  }
  const percentageLabel = rowElement.querySelector("[data-quick-bid-commercial-percent-label]");
  if (percentageLabel) percentageLabel.textContent = quickBidCommercialPercentLabel(modelInput.value);
  const activeModel = String(modelInput.value || "direct_cost_plus").toLowerCase();
  card.querySelectorAll("[data-commercial-model-guide]").forEach((guide) => {
    const isSelected = guide.dataset.commercialModelGuide === activeModel;
    guide.classList.toggle("is-selected", isSelected);
    if (isSelected) guide.setAttribute("aria-current", "true");
    else guide.removeAttribute("aria-current");
  });
  const effect = rowElement.querySelector("[data-quick-bid-commercial-effect]");
  if (effect) effect.outerHTML = renderQuickBidCommercialEffect(modelInput.value);
  const selectedContext = card.querySelector("[data-commercial-model-selected-context]");
  if (selectedContext) selectedContext.outerHTML = commercialModelSelectedContextHtml(modelInput.value);
  const preview = rowElement.querySelector("[data-quick-bid-commercial-preview]");
  if (preview) preview.outerHTML = renderQuickBidCommercialPreview(quickBidDraftFromRow(rowElement));
}

function renderQuickBidDetails(row = {}) {
  const equipmentAvailable = row.equipment_available === true ? "true" : row.equipment_available === false ? "false" : "";
  return `
    <tr class="quick-bid-details-row" data-quick-bid-details hidden>
      <td colspan="11">
        <div class="quick-bid-expand-panels">
          <section class="quick-bid-expand-panel" data-quick-bid-panel="alternative" hidden>
            <header>
              <div>
                <strong>${escapeHtml(dualText("Best alternative", "Mejor alternativa"))}</strong>
                <small>${escapeHtml(dualText("Use only when a substitute equipment or capacity model improves the offer.", "Usa esto solo cuando un equipo o modelo de capacidad alternativo mejora la oferta."))}</small>
              </div>
              <button type="button" class="icon-button quick-bid-panel-close" data-close-quick-bid-panel title="${escapeAttribute(dualText("Close alternative", "Cerrar alternativa"))}" aria-label="${escapeAttribute(dualText("Close alternative", "Cerrar alternativa"))}">x</button>
            </header>
            <div class="quick-bid-extra-grid">
              <label class="quick-bid-check"><input type="checkbox" data-quick-bid-extra-field="best_alternative_offered" ${row.best_alternative_offered ? "checked" : ""} />${escapeHtml(dualText("Include alternative", "Incluir alternativa"))}</label>
              <label>${escapeHtml(dualText("Alternative equipment", "Equipo alternativo"))}<input data-quick-bid-extra-field="alternative_equipment" value="${escapeAttribute(row.alternative_equipment || "")}" placeholder="2 x 3.5 ton, 4 vans..." /></label>
              <label>${escapeHtml(dualText("Alternative units", "Unidades alternativas"))}<input data-quick-bid-extra-field="alternative_units" inputmode="decimal" value="${escapeAttribute(row.alternative_units ?? "")}" placeholder="2" /></label>
              <label class="quick-bid-extra-notes">${escapeHtml(dualText("Alternative notes", "Notas de alternativa"))}<textarea data-quick-bid-extra-field="alternative_notes" rows="2" placeholder="Capacity, restrictions or assumptions...">${escapeHtml(row.alternative_notes || "")}</textarea></label>
            </div>
          </section>
          <section class="quick-bid-expand-panel" data-quick-bid-panel="capacity" hidden>
            <header>
              <div>
                <strong>${escapeHtml(dualText("Live capacity", "Capacidad en vivo"))}</strong>
                <small>${escapeHtml(dualText("Add availability, ETAs and unit context only when they are confirmed.", "Agrega disponibilidad, ETAs y contexto de unidad solo cuando esten confirmados."))}</small>
              </div>
              <button type="button" class="icon-button quick-bid-panel-close" data-close-quick-bid-panel title="${escapeAttribute(dualText("Close capacity", "Cerrar capacidad"))}" aria-label="${escapeAttribute(dualText("Close capacity", "Cerrar capacidad"))}">x</button>
            </header>
            <div class="quick-bid-extra-grid">
              <label>${escapeHtml(dualText("Equipment available", "Equipo disponible"))}<select data-quick-bid-extra-field="equipment_available"><option value="">${escapeHtml(dualText("Not declared", "No declarado"))}</option><option value="true" ${equipmentAvailable === "true" ? "selected" : ""}>${escapeHtml(dualText("Available", "Disponible"))}</option><option value="false" ${equipmentAvailable === "false" ? "selected" : ""}>${escapeHtml(dualText("Not available", "No disponible"))}</option></select></label>
              <label>${escapeHtml(dualText("Current unit location", "Ubicacion actual"))}<input data-quick-bid-extra-field="current_unit_location" value="${escapeAttribute(row.current_unit_location || "")}" placeholder="Laredo, TX" /></label>
              <label>${escapeHtml(dualText("Deadhead", "Vacio"))}<input data-quick-bid-extra-field="deadhead_distance" inputmode="decimal" value="${escapeAttribute(row.deadhead_distance ?? "")}" placeholder="80" /></label>
              <label>${escapeHtml(dualText("Unit", "Unidad"))}<select data-quick-bid-extra-field="deadhead_unit"><option value="mi" ${(row.deadhead_unit || "mi") === "mi" ? "selected" : ""}>mi</option><option value="km" ${row.deadhead_unit === "km" ? "selected" : ""}>km</option></select></label>
              <label>${escapeHtml(dualText("Pickup ETA", "ETA recoleccion"))}<input data-quick-bid-extra-field="eta_pickup" type="datetime-local" value="${escapeAttribute(dateTimeLocalValue(row.eta_pickup || ""))}" /></label>
              <label>${escapeHtml(dualText("Delivery ETA", "ETA entrega"))}<input data-quick-bid-extra-field="eta_delivery" type="datetime-local" value="${escapeAttribute(dateTimeLocalValue(row.eta_delivery || ""))}" /></label>
              <label class="quick-bid-check"><input type="checkbox" data-quick-bid-extra-field="mirror_account_enabled" ${row.mirror_account_enabled ? "checked" : ""} />${escapeHtml(dualText("Mirror account validated", "Cuenta espejo validada"))}</label>
              <label class="quick-bid-extra-notes">${escapeHtml(dualText("Unit details", "Datos de unidad"))}<textarea data-quick-bid-extra-field="unit_details" rows="2" placeholder="Truck, trailer, driver, plate or tracking details...">${escapeHtml(row.unit_details || "")}</textarea></label>
              <label class="quick-bid-extra-notes">${escapeHtml(dualText("Unit and availability notes", "Notas de unidad y disponibilidad"))}<textarea data-quick-bid-extra-field="availability_validation_notes" rows="2" placeholder="Truck, trailer, driver or validation details...">${escapeHtml(row.availability_validation_notes || "")}</textarea></label>
              <label class="quick-bid-extra-notes">${escapeHtml(dualText("Carrier assumptions", "Supuestos del carrier"))}<textarea data-quick-bid-extra-field="notes" rows="2" placeholder="Accessorials, restrictions or conditions...">${escapeHtml(row.notes || "")}</textarea></label>
            </div>
          </section>
        </div>
      </td>
    </tr>
  `;
}

// Every invited lane is listed here with its own rate field. This table is the
// lane navigator: a carrier prices the whole package without switching context,
// which is what the separate route selectors used to force.
function renderQuickLaneBidGridShell(carrierBook = {}, invitation = {}, options = {}) {
  const rows = quickBidRows(carrierBook, invitation);
  if (!rows.length) return "";
  const packagePayload = masterPackageForCarrier(carrierBook, invitation);
  const selectedToken = String(options.invitationToken || selectedBidToolsToken || invitation.invitation_token || "");
  const selectedRow = rows.find((row) => String(row.invitation_token || "") === selectedToken) || rows[0];
  const quoted = rows.filter(isQuotedBookRow).length;
  const remaining = rows.length - quoted;
  return `
    <section id="carrier-quick-bid-grid" class="carrier-quick-bid-grid" data-selected-quick-bid-token="${escapeAttribute(selectedRow.invitation_token || "")}">
      <div class="bid-room-section-heading quick-bid-heading">
        <div class="quick-bid-heading-copy">
          <h3>${escapeHtml(dualText("Your lanes", "Tus rutas"))} ${portalHelp(dualText("Enter the carrier rate, commercial model and core operating commitment for each route. Every row saves on its own; additional actions are under More.", "Captura la tarifa carrier, modelo comercial y compromiso operativo de cada ruta. Cada fila se guarda por separado; las acciones adicionales estan en Mas."))}</h3>
        </div>
        <span class="status-pill ${remaining ? "warning" : "success"}">${escapeHtml(remaining
          ? dualText(`${remaining} of ${rows.length} still to quote`, `Faltan ${remaining} de ${rows.length} por cotizar`)
          : dualText(`All ${rows.length} lanes quoted`, `Las ${rows.length} rutas estan cotizadas`))}</span>
      </div>
      ${commercialModelSelectedContextHtml(selectedRow?.commercial_model)}
      <div class="table-wrap">
        <table class="quick-bid-table">
          <thead>
            <tr>
              <th>Lane</th>
              <th>${escapeHtml(dualText("Equipment", "Equipo"))}</th>
              <th title="${escapeAttribute(dualText("The amount the carrier enters. Its commercial meaning changes with the selected model.", "El importe que captura el carrier. Su significado comercial cambia con el modelo seleccionado."))}">${escapeHtml(dualText("Carrier rate", "Tarifa carrier"))}</th>
              <th>${escapeHtml(dualText("Currency", "Moneda"))}</th>
              <th>${escapeHtml(dualText("Capacity", "Capacidad"))}</th>
              <th>${escapeHtml(dualText("Transit", "Transito"))}</th>
              <th>${escapeHtml(dualText("Valid through", "Vigente hasta"))}</th>
              <th>${escapeHtml(dualText("Commercial", "Comercial"))}</th>
              <th title="${escapeAttribute(dualText("The percentage changes meaning by commercial model.", "El porcentaje cambia de significado segun el modelo comercial."))}">${escapeHtml(dualText("Commercial %", "% comercial"))}</th>
              <th>${escapeHtml(dualText("Status", "Estado"))}</th>
              <th>${escapeHtml(dualText("Action", "Accion"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const draft = pendingQuickBidDrafts.get(String(row.invitation_token || ""));
              const displayRow = draft ? { ...row, ...draft } : row;
              const lane = displayRow.lane || row.lane || {};
              const model = legacyCommercialModel(displayRow.commercial_model);
              const fit = rowFitProgress(displayRow, packagePayload);
              const fitActionLabel = quickFitActionLabel(fit);
              return `
                <tr
                  data-quick-bid-row
                  data-invitation-token="${escapeAttribute(row.invitation_token || "")}"
                  data-best-alternative="${escapeAttribute(displayRow.best_alternative_offered ? "true" : "false")}"
                  data-alternative-equipment="${escapeAttribute(displayRow.alternative_equipment || "")}"
                  data-alternative-units="${escapeAttribute(displayRow.alternative_units ?? "")}"
                  data-alternative-notes="${escapeAttribute(displayRow.alternative_notes || "")}"
                  data-equipment-available="${escapeAttribute(displayRow.equipment_available === true ? "true" : displayRow.equipment_available === false ? "false" : "")}"
                  data-current-unit-location="${escapeAttribute(displayRow.current_unit_location || "")}"
                  data-deadhead-distance="${escapeAttribute(displayRow.deadhead_distance ?? "")}"
                  data-deadhead-unit="${escapeAttribute(displayRow.deadhead_unit || "mi")}"
                  data-unit-details="${escapeAttribute(displayRow.unit_details || "")}"
                  data-eta-pickup="${escapeAttribute(displayRow.eta_pickup || "")}"
                  data-eta-delivery="${escapeAttribute(displayRow.eta_delivery || "")}"
                  data-mirror-account-enabled="${escapeAttribute(displayRow.mirror_account_enabled ? "true" : "false")}"
                  data-availability-validation-notes="${escapeAttribute(displayRow.availability_validation_notes || "")}"
                  data-notes="${escapeAttribute(displayRow.notes || "")}"
                >
                  <td>
                    <strong>${escapeHtml(laneLabel(lane))}</strong>
                    <small>${escapeHtml([lane.lane_number ? `#${lane.lane_number}` : null, marketLabel(lane)].filter(Boolean).join(" | "))}</small>
                  </td>
                  <td>
                    ${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}
                    <small>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</small>
                  </td>
                  <td><input data-quick-bid-field="bid_rate" inputmode="decimal" value="${escapeAttribute(displayRow.bid_rate ?? "")}" placeholder="2900" aria-label="${escapeAttribute(commercialStructureConfig(model).rateLabel)}" title="${escapeAttribute(commercialStructureConfig(model).rateEntryHelp)}" /></td>
                  <td>
                    <select data-quick-bid-field="currency">
                      ${["USD", "MXN", "CAD"].map((currency) => `<option value="${currency}" ${currency === (displayRow.currency || lane.currency || "USD") ? "selected" : ""}>${currency}</option>`).join("")}
                    </select>
                  </td>
                  <td><input data-quick-bid-field="weekly_capacity" inputmode="decimal" value="${escapeAttribute(displayRow.weekly_capacity ?? "")}" placeholder="5" /></td>
                  <td><input data-quick-bid-field="transit_days" inputmode="decimal" value="${escapeAttribute(displayRow.transit_days ?? "")}" placeholder="2" /></td>
                  <td><input data-quick-bid-field="valid_through" type="date" value="${escapeAttribute(dateOnlyValue(displayRow.valid_through))}" /></td>
                  <td>
                    <select data-quick-bid-field="commercial_model" title="${escapeAttribute(commercialModelEffect(model))}">
                      <option value="direct_cost_plus" ${model === "direct_cost_plus" ? "selected" : ""}>Cost-plus</option>
                      <option value="carrier_share" ${model === "carrier_share" ? "selected" : ""}>Carrier share</option>
                      <option value="xbf_buy_sell" ${model === "xbf_buy_sell" ? "selected" : ""}>XBF buy-sell</option>
                    </select>
                  </td>
                  <td class="quick-bid-commercial-percent-cell">
                    <input data-quick-bid-field="commercial_pct" inputmode="decimal" value="${escapeAttribute(quickBidCommercialPercent(displayRow))}" placeholder="${escapeAttribute(quickBidCommercialPlaceholder(model))}" aria-label="${escapeAttribute(quickBidCommercialPercentLabel(model))}" title="${escapeAttribute(quickBidCommercialPercentLabel(model))}" />
                    <small data-quick-bid-commercial-percent-label>${escapeHtml(quickBidCommercialPercentLabel(model))}</small>
                  </td>
                  <td class="quick-bid-row-status">${quickBidRowStatus(row)}</td>
                  <td>
                    <div class="quick-bid-actions">
                      <button type="button" class="secondary small-button ${quickFitActionTone(fit)}" data-open-quick-lane-fit="${escapeAttribute(row.invitation_token || "")}" aria-expanded="false" title="${escapeAttribute(dualText("Review or update the optional operational fit for this route. Selections save automatically.", "Revisa o actualiza el fit operativo opcional de esta ruta. Las selecciones se guardan automaticamente."))}">${escapeHtml(fitActionLabel)}</button>
                      <button type="button" class="small-button" data-save-quick-bid title="${escapeAttribute(dualText("Publish or update this route offer.", "Publicar o actualizar la oferta de esta ruta."))}">${escapeHtml(displayRow.bid_rate ? dualText("Update", "Actualizar") : dualText("Offer", "Oferta"))}</button>
                      <details class="quick-bid-more-actions">
                        <summary class="secondary small-button" title="${escapeAttribute(dualText("Alternative offer, live capacity and route participation.", "Oferta alternativa, capacidad en vivo y participacion de la ruta."))}" aria-label="${escapeAttribute(dualText("More route actions", "Mas acciones de ruta"))}"><span aria-hidden="true">...</span><span class="sr-only">${escapeHtml(dualText("More", "Mas"))}</span></summary>
                        <div class="quick-bid-more-actions-menu">
                          <button type="button" class="secondary small-button" data-toggle-quick-bid-panel="alternative" aria-expanded="false" title="${escapeAttribute(dualText("Add a compliant equipment or capacity alternative.", "Agrega una alternativa de equipo o capacidad compatible."))}">${escapeHtml(dualText("Alternative", "Alternativa"))}</button>
                          <button type="button" class="secondary small-button" data-toggle-quick-bid-panel="capacity" aria-expanded="false" title="${escapeAttribute(dualText("Add availability, ETAs and unit details.", "Agrega disponibilidad, ETAs y datos de unidad."))}">${escapeHtml(dualText("Live capacity", "Capacidad en vivo"))}</button>
                          ${displayRow.bid_rate
                            ? `<button type="button" class="secondary small-button danger-text" data-withdraw-quick-bid title="${escapeAttribute(dualText("Remove your current offer for this route.", "Retira tu oferta actual de esta ruta."))}">${escapeHtml(dualText("Withdraw offer", "Retirar oferta"))}</button>`
                            : `<button type="button" class="secondary small-button danger-text" data-decline-quick-invitation title="${escapeAttribute(dualText("Decline this route when you will not quote it.", "Rechaza esta ruta si no la vas a cotizar."))}">${escapeHtml(dualText("Reject lane", "Rechazar ruta"))}</button>`}
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
                ${renderQuickBidDetails(displayRow)}
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

function quickBidExtraField(rowElement, field, fallback = "") {
  const details = rowElement?.nextElementSibling?.matches("[data-quick-bid-details]")
    ? rowElement.nextElementSibling
    : null;
  const input = details?.querySelector(`[data-quick-bid-extra-field="${field}"]`);
  if (!input) return fallback;
  if (input.type === "checkbox") return input.checked ? "true" : "false";
  return input.value || "";
}

function quickBidDraftFromRow(rowElement) {
  const commercialModel = quickBidField(rowElement, "commercial_model") || "direct_cost_plus";
  const commercialPercent = quickBidField(rowElement, "commercial_pct");
  const extra = (field, fallback = "") => quickBidExtraField(rowElement, field, fallback);
  return {
    bid_rate: quickBidField(rowElement, "bid_rate"),
    currency: quickBidField(rowElement, "currency") || "USD",
    weekly_capacity: quickBidField(rowElement, "weekly_capacity"),
    transit_days: quickBidField(rowElement, "transit_days"),
    valid_through: quickBidField(rowElement, "valid_through"),
    commercial_model: commercialModel,
    marksman_margin_pct: ["direct_cost_plus", "xbf_buy_sell"].includes(commercialModel) ? commercialPercent : "",
    carrier_share_pct: commercialModel === "carrier_share" ? commercialPercent : "",
    best_alternative_offered: extra("best_alternative_offered", rowElement.dataset.bestAlternative || "") === "true",
    alternative_equipment: extra("alternative_equipment", rowElement.dataset.alternativeEquipment || ""),
    alternative_units: extra("alternative_units", rowElement.dataset.alternativeUnits || ""),
    alternative_notes: extra("alternative_notes", rowElement.dataset.alternativeNotes || ""),
    equipment_available: extra("equipment_available", rowElement.dataset.equipmentAvailable || ""),
    current_unit_location: extra("current_unit_location", rowElement.dataset.currentUnitLocation || ""),
    deadhead_distance: extra("deadhead_distance", rowElement.dataset.deadheadDistance || ""),
    deadhead_unit: extra("deadhead_unit", rowElement.dataset.deadheadUnit || "mi"),
    unit_details: extra("unit_details", rowElement.dataset.unitDetails || ""),
    eta_pickup: dateTimeLocalValue(extra("eta_pickup", rowElement.dataset.etaPickup || "")),
    eta_delivery: dateTimeLocalValue(extra("eta_delivery", rowElement.dataset.etaDelivery || "")),
    mirror_account_enabled: extra("mirror_account_enabled", rowElement.dataset.mirrorAccountEnabled || "") === "true",
    availability_validation_notes: extra("availability_validation_notes", rowElement.dataset.availabilityValidationNotes || ""),
    best_final: false,
    notes: extra("notes", rowElement.dataset.notes || "")
  };
}

function capturePendingQuickBidDrafts(scope = card) {
  scope?.querySelectorAll?.("[data-quick-bid-row]").forEach((rowElement) => {
    rememberQuickBidDraft(rowElement);
  });
}

function rememberQuickBidDraft(rowElement, { localOnly = false } = {}) {
  const invitationToken = String(rowElement?.dataset?.invitationToken || "").trim();
  if (!invitationToken) return;
  const existing = pendingQuickBidDrafts.get(invitationToken);
  pendingQuickBidDrafts.set(invitationToken, {
    ...quickBidDraftFromRow(rowElement),
    local_only: localOnly || existing?.local_only === true
  });
}

function toggleQuickBidPanel(rowElement, panelName) {
  const details = rowElement?.nextElementSibling?.matches("[data-quick-bid-details]")
    ? rowElement.nextElementSibling
    : null;
  if (!details) return;
  const panel = details.querySelector(`[data-quick-bid-panel="${CSS.escape(panelName || "")}"]`);
  if (!panel) return;
  const opening = panel.hidden;
  details.querySelectorAll("[data-quick-bid-panel]").forEach((candidate) => {
    candidate.hidden = true;
  });
  rowElement.querySelectorAll("[data-toggle-quick-bid-panel]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  details.hidden = !opening;
  if (!opening) return;
  panel.hidden = false;
  rowElement.querySelector(`[data-toggle-quick-bid-panel="${CSS.escape(panelName || "")}"]`)?.setAttribute("aria-expanded", "true");
  panel.querySelector("input, select, textarea")?.focus({ preventScroll: true });
}

function closeQuickBidPanel(rowElement) {
  const details = rowElement?.nextElementSibling?.matches("[data-quick-bid-details]")
    ? rowElement.nextElementSibling
    : null;
  if (!details) return;
  details.querySelectorAll("[data-quick-bid-panel]").forEach((panel) => {
    panel.hidden = true;
  });
  rowElement.querySelectorAll("[data-toggle-quick-bid-panel]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  details.hidden = true;
}

function setQuickBidRowStatus(rowElement, message, tone = "neutral") {
  const status = rowElement.querySelector(".quick-bid-row-status");
  if (!status) return;
  status.innerHTML = `<span class="status-message" data-tone="${escapeAttribute(tone)}">${escapeHtml(message)}</span>`;
}

function setQuickBidLocalDraftStatus(rowElement) {
  const status = rowElement?.querySelector(".quick-bid-row-status");
  if (!status) return;
  const message = dualText("Unpublished changes", "Cambios sin publicar");
  const title = dualText(
    "These changes are retained in this browser until you publish the route offer.",
    "Estos cambios se conservan en este navegador hasta que publiques la oferta de la ruta."
  );
  status.innerHTML = `<span class="status-message quick-bid-local-draft" data-tone="warning" title="${escapeAttribute(title)}">${escapeHtml(message)}</span>`;
}

function markQuickBidRowInvalid(rowElement, field) {
  rowElement.querySelectorAll("[aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
  const map = {
    "bid-rate": "bid_rate",
    "bid-currency": "currency",
    "bid-capacity": "weekly_capacity",
    "bid-transit-days": "transit_days",
    "bid-valid-through": "valid_through",
    "bid-marksman-margin": "commercial_pct",
    "bid-carrier-share": "commercial_pct"
  };
  const input = rowElement.querySelector(`[data-quick-bid-field="${map[field] || field}"]`);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
}

async function saveQuickBidRow(rowElement, button) {
  const rowToken = rowElement.dataset.invitationToken || "";
  const mutationKey = `quick-bid:${rowToken}`;
  if (quickBidRowMutationKeys.has(mutationKey)) return;
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
  quickBidRowMutationKeys.add(mutationKey);
  button.disabled = true;
  setQuickBidRowStatus(rowElement, dualText("Saving lane offer...", "Guardando oferta de la ruta..."), "neutral");
  try {
    await callBidApi("submit_bid", { token: rowToken, ...draft });
    pendingQuickBidDrafts.delete(String(rowToken));
    markOwnOfferRevisionPending(rowToken);
    lastQuickBidSaveStatus = {
      token: rowToken,
      tone: "success",
      message: dualText("Saved. Published as the latest offer.", "Guardado. Publicado como la oferta mas reciente.")
    };
    queuePrivateBidAlert("bidSubmitted", dualText("Lane offer updated.", "Oferta de ruta actualizada."));
    await loadInvitation({ refreshOnly: true, refreshForm: rowToken === tokenFromUrl(), refreshQuickGrid: true });
  } catch (error) {
    setQuickBidRowStatus(rowElement, humanizeError(error), "error");
    button.disabled = false;
  } finally {
    quickBidRowMutationKeys.delete(mutationKey);
  }
}

async function updateBidParticipation(action, button, options = {}) {
  const rowElement = options.rowElement || null;
  const actionToken = options.token || rowElement?.dataset.invitationToken || tokenFromUrl();
  const mutationKey = `${action}:${actionToken}`;
  if (bidParticipationMutationKeys.has(mutationKey)) return;
  const isWithdraw = action === "withdraw_bid";
  const confirmation = isWithdraw
    ? dualText(
      "Withdraw this offer? The active price will leave the live board, but procurement keeps the history.",
      "Retirar esta oferta? La tarifa activa saldra del tablero, pero procurement conserva el historial."
    )
    : dualText(
      "Reject this lane? Procurement will see that you are not participating for now.",
      "Rechazar esta ruta? Procurement vera que no participas por ahora."
  );
  if (!window.confirm(confirmation)) return;

  bidParticipationMutationKeys.add(mutationKey);
  const status = rowElement ? null : card.querySelector("#bid-submit-status");
  const progressText = isWithdraw
    ? dualText("Withdrawing offer...", "Retirando oferta...")
    : dualText("Rejecting lane...", "Rechazando ruta...");
  const successText = isWithdraw
    ? dualText("Offer withdrawn. It is no longer active on the live board.", "Oferta retirada. Ya no esta activa en el tablero.")
    : dualText("Lane rejected. Procurement can still invite or reopen it later.", "Ruta rechazada. Procurement puede invitar o reabrirla despues.");
  button.disabled = true;
  if (rowElement) setQuickBidRowStatus(rowElement, progressText, "neutral");
  if (status) {
    status.textContent = progressText;
    status.dataset.tone = "neutral";
  }
  try {
    await callBidApi(action, { token: actionToken });
    pendingQuickBidDrafts.delete(String(actionToken));
    if (rowElement) {
      lastQuickBidSaveStatus = { token: actionToken, tone: "success", message: successText };
    }
    if (status) {
      status.textContent = successText;
      status.dataset.tone = "success";
    }
    queuePrivateBidAlert(isWithdraw ? "bidSubmitted" : "supportAnswer", successText);
    await loadInvitation(options.refreshPage
      ? {}
      : { refreshOnly: true, refreshForm: actionToken === tokenFromUrl(), refreshQuickGrid: true });
  } catch (error) {
    const message = humanizeError(error);
    if (rowElement) setQuickBidRowStatus(rowElement, message, "error");
    if (status) {
      status.textContent = message;
      status.dataset.tone = "error";
    }
    button.disabled = false;
  } finally {
    bidParticipationMutationKeys.delete(mutationKey);
  }
}

function renderCarrierLaneSwitcher(carrierBook = {}, invitation = {}) {
  return renderMasterPackageRoutes(carrierBook, invitation);
}

function focusRouteFit() {
  setPrivateWorkspace("bids");
  const section = card.querySelector("#carrier-lane-fit");
  if (!section) return;
  section.open = true;
  section.classList.add("is-focused");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => section.classList.remove("is-focused"), 1800);
}

function openSelectedLaneOfferEditor() {
  selectBidToolsLane(selectedBidToolsToken || String(lastInvitation?.invitation_token || tokenFromUrl() || ""), { focusQuickBid: true });
}

async function selectPrivateLane(invitationToken, options = {}) {
  const nextToken = String(invitationToken || "").trim();
  if (!nextToken || privateLaneSwitching) return;
  if (nextToken === tokenFromUrl()) {
    if (options.workspace && PRIVATE_WORKSPACE_VALUES.has(options.workspace)) {
      setPrivateWorkspace(options.workspace);
    }
    if (options.after === "fit") focusRouteFit();
    else if (options.after === "offer") openSelectedLaneOfferEditor();
    else card.querySelector("#carrier-lane-book-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  privateLaneSwitching = true;
  const nextWorkspace = options.workspace && PRIVATE_WORKSPACE_VALUES.has(options.workspace)
    ? options.workspace
    : activePrivateWorkspace;
  activePrivateWorkspace = nextWorkspace;
  localStorage.setItem(privateWorkspaceStorageKey(), nextWorkspace);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("token", nextToken);
  nextUrl.searchParams.delete("view");
  window.history.pushState({}, "", nextUrl);
  card.innerHTML = `<p class="status-message rw-public-state" data-platform55-public-state data-state="loading">${escapeHtml(dualText("Loading selected lane...", "Cargando la lane seleccionada..."))}</p>`;
  try {
    await loadInvitation();
    if (options.after === "fit") focusRouteFit();
    else if (options.after === "offer") openSelectedLaneOfferEditor();
    else card.querySelector("#carrier-lane-book-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    privateLaneSwitching = false;
  }
}

function bidToolsInvitationFromRow(row = {}, fallback = {}) {
  const lane = row.lane || fallback.rfx_lanes || {};
  return {
    ...fallback,
    ...row,
    id: row.invitation_id || row.id || fallback.id,
    invitation_id: row.invitation_id || row.id || fallback.invitation_id,
    invitation_token: row.invitation_token || fallback.invitation_token,
    invitation_status: row.invitation_status || fallback.invitation_status,
    rfx_lane_id: row.rfx_lane_id || lane.id || fallback.rfx_lane_id,
    rfx_lanes: lane,
    rfx_events: row.event || fallback.rfx_events || {}
  };
}

function selectedBidToolsRow(carrierBook = {}, invitation = {}) {
  const rows = quickBidRows(carrierBook, invitation);
  const currentToken = String(selectedBidToolsToken || invitation.invitation_token || tokenFromUrl() || "");
  const selected = rows.find((row) => String(row.invitation_token || "") === currentToken)
    || rows.find((row) => String(row.invitation_token || "") === String(invitation.invitation_token || ""))
    || rows[0]
    || null;
  if (selected?.invitation_token) selectedBidToolsToken = String(selected.invitation_token);
  return selected;
}

function renderBidToolsWorkspace(carrierBook = {}, invitation = {}) {
  const selected = selectedBidToolsRow(carrierBook, invitation);
  const selectedInvitation = selected ? bidToolsInvitationFromRow(selected, invitation) : invitation;
  // The grid lists every invited lane, so the separate route selector that used
  // to sit above it is gone. The fit checklist follows whichever lane a row's
  // Fit button selects.
  return `
    ${renderQuickLaneBidGridShell(carrierBook, invitation, { invitationToken: selectedInvitation.invitation_token })}
    ${renderSelectedLaneWorkspace(selectedInvitation.rfx_lanes || {}, selectedInvitation, [], false, carrierBook)}
  `;
}

function selectBidToolsLane(invitationToken, options = {}) {
  const nextToken = String(invitationToken || "").trim();
  const selected = quickBidRows(lastCarrierBook || {}, lastInvitation || {})
    .find((row) => String(row.invitation_token || "") === nextToken);
  if (!selected) return;
  const selectionVersion = ++bidToolsLaneSelectionVersion;
  const currentPanel = card.querySelector('[data-private-workspace-panel="bids"]');
  capturePendingQuickBidDrafts(currentPanel);
  const pendingFitSave = flushSegmentConfirmationSave(currentPanel?.querySelector("[data-lane-fit-checklist]"));
  pendingFitSave?.catch?.(() => {});
  if (selectionVersion !== bidToolsLaneSelectionVersion) return;
  selectedBidToolsToken = nextToken;
  setPrivateWorkspace("bids");
  const panel = card.querySelector('[data-private-workspace-panel="bids"]');
  if (!panel) return;
  panel.innerHTML = renderBidToolsWorkspace(lastCarrierBook || {}, lastInvitation || {});
  const fit = panel.querySelector("#carrier-lane-fit");
  const row = panel.querySelector(`[data-quick-bid-row][data-invitation-token="${CSS.escape(nextToken)}"]`);
  if (options.openFit && fit) {
    fit.open = true;
    fit.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (options.focusQuickBid && row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.querySelector('[data-quick-bid-field="bid_rate"]')?.focus({ preventScroll: true });
  }
  if (options.panel && row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    toggleQuickBidPanel(row, options.panel);
  }
}

function renderSelectedLaneWorkspace(lane = {}, invitation = {}, _selectedLaneDetails = [], _isBookView = false, carrierBook = {}) {
  const packagePayload = masterPackageForCarrier(carrierBook, invitation);
  const currentRow = allBookRows(carrierBook).find((row) => String(row.invitation_token || "") === String(invitation.invitation_token || ""));
  const status = currentRow
    ? bookStatus(currentRow, packagePayload)
    : canonicalLaneStatus({ participation_status: invitation.invitation_status, is_invited: true });
  return `
    <section class="bid-tools-selected-route">
      ${["declined", "rejected", "awarded", "backup", "not_awarded"].includes(status)
        ? `<p class="bid-board-note">${escapeHtml(dualText("This route is no longer available for a new offer.", "Esta ruta ya no esta disponible para una nueva oferta."))}</p>`
        : renderLaneFitChecklist(lane, invitation, packagePayload)}
    </section>
  `;
}

function awardNextSteps(status, liveOutcome = {}) {
  if (status === "awarded") {
    return [
      "Confirm capacity and ETA if anything changes.",
      liveOutcome.rateware_closeout_at ? "The awarded cost is in procurement review." : "Procurement is preparing the awarded cost for review.",
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
    ["all", dualText("All", "Todas")],
    ["invited", dualText("Invited", "Invitadas")],
    ["agreed", dualText("Agreed", "De acuerdo")],
    ["exception", dualText("Exception", "Excepcion")],
    ["open", dualText("Open book", "Libro abierto")],
    ["quoted", dualText("Quoted", "Cotizadas")],
    ["awarded", dualText("Awarded", "Adjudicadas")],
    ["backup", "Backup"],
    ["not_awarded", dualText("Not awarded", "No adjudicadas")],
    ["rejected", dualText("Rejected", "Rechazadas")],
    ["withdrawn", dualText("Withdrawn", "Retiradas")]
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
        <p class="eyebrow">${escapeHtml(dualText("Award outcome", "Resultado"))}</p>
        <h3>${escapeHtml(formatLane(invitation.rfx_lanes || {}))}</h3>
      </div>
      <span class="status-pill ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span>
    </div>
    <p class="bid-board-note">${escapeHtml(reason || copy)}</p>
    <div class="carrier-award-summary">
      <article>
        <span>Event awards</span>
        <strong>${escapeHtml(summary.awarded || 0)} awarded</strong>
        <small>${escapeHtml(summary.backup || 0)} backup | ${escapeHtml(summary.not_awarded || 0)} not awarded</small>
      </article>
      <article>
        <span>Rate review</span>
        <strong>${escapeHtml(liveOutcome.rateware_closeout_at ? "In review" : status === "awarded" ? "Pending" : "-")}</strong>
        <small>${escapeHtml(liveOutcome.rateware_closeout_at ? new Date(liveOutcome.rateware_closeout_at).toLocaleString() : "Procurement approves production rates after review.")}</small>
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
      <button class="secondary small-button" type="button" data-carrier-chat-focus>${escapeHtml(dualText("Ask about this result", "Preguntar sobre este resultado"))}</button>
    </div>
  `;
}

function renderInvitation(invitation, liveBoard = {}, carrierBook = {}) {
  lastInvitation = invitation;
  pendingBidTemplateRows = [];
  pendingBidTemplateCoverage = null;
  activePrivateWorkspace = readPrivateWorkspace();
  const event = invitation.rfx_events || {};
  const lane = invitation.rfx_lanes || {};
  const vendor = invitation.vendors || {};
  const multiLaneRows = currentEventBookRows(carrierBook, event);
  const bidToolRows = quickBidRows(carrierBook, invitation);
  const bidCommercialConfig = commercialStructureConfig(invitation.commercial_model || "direct_cost_plus");
  if (!bidToolRows.some((row) => String(row.invitation_token || "") === String(selectedBidToolsToken || ""))) {
    selectedBidToolsToken = String(invitation.invitation_token || bidToolRows[0]?.invitation_token || "");
  }
  syncPortalLanguageChrome();
  title.textContent = event.name || event.rfx_id || "Private Bid Room";
  card.innerHTML = `
    ${renderPortalStatusBar(event, vendor, carrierLaneProgress(carrierBook, event))}
    ${renderCarrierBrief(event, vendor, liveBoard, multiLaneRows.length)}

    <nav class="bid-private-workspace-tabs" aria-label="${escapeAttribute(dualText("Bid room phases", "Fases de la puja"))}" role="tablist">
      <button type="button" role="tab" data-private-workspace-tab="master" aria-selected="true" title="${escapeAttribute(dualText("Who is asking, what they need, and the rules of this business.", "Quien pide, que necesita, y las reglas de este negocio."))}" aria-label="${escapeAttribute(dualText("Phase 1: The business", "Fase 1: El negocio"))}">
        <strong>${escapeHtml(dualText("1. The business", "1. El negocio"))}</strong>
      </button>
      <button type="button" role="tab" data-private-workspace-tab="bids" aria-selected="false" tabindex="-1" title="${escapeAttribute(dualText("Price every invited lane. Each row saves on its own.", "Cotiza cada ruta invitada. Cada fila se guarda por separado."))}" aria-label="${escapeAttribute(dualText("Phase 2: Your lanes", "Fase 2: Tus rutas"))}">
        <strong>${escapeHtml(dualText("2. Your lanes", "2. Tus rutas"))}</strong>
      </button>
      <button type="button" role="tab" data-private-workspace-tab="award" aria-selected="false" tabindex="-1" title="${escapeAttribute(dualText("Where you stand: live ranking, award outcome and your full lane book.", "Donde estas parado: ranking en vivo, resultado y tu libro completo de rutas."))}" aria-label="${escapeAttribute(dualText("Phase 3: Result", "Fase 3: Resultado"))}">
        <strong>${escapeHtml(dualText("3. Result", "3. Resultado"))}</strong>
      </button>
    </nav>

    <section data-private-workspace-panel="master" class="private-workspace-section">
      ${renderCarrierMasterPackage(carrierBook, invitation)}
      ${renderCarrierLaneSwitcher(carrierBook, invitation)}
      ${renderBidTemplateTools(carrierBook, invitation)}
    </section>

    <section data-private-workspace-panel="bids" class="private-workspace-section" hidden>
      ${renderBidToolsWorkspace(carrierBook, invitation)}
    </section>

    <section id="carrier-bid-chat" class="carrier-bid-chat bid-chat-widget" data-open="false">
      <p class="status-message">${escapeHtml(t("loadingChat"))}</p>
    </section>

    <section data-private-workspace-panel="award" class="private-workspace-section" hidden>
      <section id="carrier-award-outcome" class="carrier-award-outcome"></section>
      <section id="bid-live-board" class="bid-live-board private-award-live-board">
        <p class="status-message">${escapeHtml(t("loadingLiveRoom"))}</p>
      </section>
      <section id="carrier-bid-history" class="carrier-bid-history">
        <p class="status-message">${escapeHtml(t("loadingHistory"))}</p>
      </section>
      <section id="carrier-business-book" class="carrier-business-book">
        <p class="status-message">${escapeHtml(dualText("Loading your lane book...", "Cargando tu libro de rutas..."))}</p>
      </section>
    </section>
  `;

  renderLiveBoard(liveBoard);
  renderBidSupportAgent();
  setPrivateWorkspace(activePrivateWorkspace);
  syncCommercialStructureFields();
  updateBidReviewSummary();
  syncBidFormMode();
}

async function loadInvitation(options = {}) {
  if (!tokenFromUrl()) {
    card.innerHTML = `<p class="status-message rw-public-state" data-platform55-public-state data-state="signed-out" data-tone="error">Missing invitation token.</p>`;
    return;
  }
  try {
    const data = await callBidApi("get_invitation", options.refreshOnly
      ? {
          refresh_only: true,
          include_history: options.refreshForm === true || options.refreshQuickGrid === true
        }
      : {});
    lastInvitation = data.invitation;
    // Runs before the first render so a Mexican carrier never sees the page in
    // English first. A carrier who picked a language keeps it.
    applyCarrierLanguageDefault(lastInvitation);
    lastLiveBoard = data.live_board || {};
    if (Array.isArray(data.segment_confirmations)) lastSegmentConfirmations = data.segment_confirmations;
    if (Array.isArray(data.bid_history)) lastBidHistory = data.bid_history;
    if (data.carrier_book) lastCarrierBook = data.carrier_book;
    if (data.current_book_row && lastCarrierBook) {
      const invited = Array.isArray(lastCarrierBook.invited) ? [...lastCarrierBook.invited] : [];
      const rowIndex = invited.findIndex((row) => row.invitation_id === data.current_book_row.invitation_id);
      if (rowIndex >= 0) invited[rowIndex] = data.current_book_row;
      else invited.push(data.current_book_row);
      const quoted = invited.filter(isQuotedBookRow);
      lastCarrierBook = {
        ...lastCarrierBook,
        invited,
        quoted,
        summary: {
          ...(lastCarrierBook.summary || {}),
          invited: invited.length,
          quoted: quoted.length,
          awarded: invited.filter((row) => row.award_status === "awarded").length,
          backup: invited.filter((row) => row.award_status === "backup").length,
          not_awarded: invited.filter((row) => row.award_status === "not_awarded").length
        }
      };
    }
    rememberPublicBoardInvitationAccess(data.invitation || {}, lastCarrierBook || {});
    if (options.refreshOnly && card.querySelector("[data-private-workspace-panel]")) {
      renderLiveBoard(data.live_board);
      renderAwardOutcome(data.invitation, lastCarrierBook || {}, data.live_board);
      renderBidHistory(lastBidHistory);
      if (options.refreshForm) hydrateBidFormFromOffer(currentSubmittedOffer(data.live_board), data.invitation);
      else syncBidFormMode();
      const quickGridHasFocus = Boolean(document.activeElement?.closest?.("#carrier-quick-bid-grid"));
      if (options.refreshQuickGrid || !quickGridHasFocus) renderQuickLaneBidGrid(lastCarrierBook || {}, data.invitation);
    } else {
      renderInvitation(data.invitation, data.live_board, lastCarrierBook || {});
      renderAwardOutcome(data.invitation, lastCarrierBook || {}, data.live_board);
      renderBidHistory(lastBidHistory);
      renderCarrierBook(lastCarrierBook || {});
    }
    detectPrivateBidRoomSignals(data);
    await loadCarrierChat();
  } catch (error) {
    if (options.refreshOnly) return;
    title.textContent = "Bid request unavailable";
    card.innerHTML = `<p class="status-message rw-public-state" data-platform55-public-state data-state="error" data-tone="error">${escapeHtml(humanizeError(error))}</p>`;
  }
}

document.addEventListener("click", async (event) => {
  const privateWorkspaceTab = event.target.closest("[data-private-workspace-tab]");
  if (privateWorkspaceTab) {
    setPrivateWorkspace(privateWorkspaceTab.dataset.privateWorkspaceTab || "master");
    return;
  }

  const routeFitButton = event.target.closest("[data-route-fit-token]");
  if (routeFitButton) {
    selectBidToolsLane(routeFitButton.dataset.routeFitToken || "", { openFit: true });
    return;
  }

  const routeOfferButton = event.target.closest("[data-route-offer-token]");
  if (routeOfferButton) {
    routeOfferButton.closest(".lane-offer-menu")?.removeAttribute("open");
    selectBidToolsLane(routeOfferButton.dataset.routeOfferToken || "", { focusQuickBid: true });
    return;
  }

  const routeParticipationButton = event.target.closest("[data-route-participation-action]");
  if (routeParticipationButton) {
    routeParticipationButton.closest(".lane-offer-menu")?.removeAttribute("open");
    await updateBidParticipation(routeParticipationButton.dataset.routeParticipationAction || "decline_invitation", routeParticipationButton, {
      token: routeParticipationButton.dataset.routeParticipationToken || "",
      refreshPage: true
    });
    return;
  }

  const privateLaneButton = event.target.closest("[data-select-private-lane]");
  if (privateLaneButton) {
    await selectPrivateLane(privateLaneButton.dataset.selectPrivateLane || "");
    return;
  }

  const bidToolsLaneButton = event.target.closest("[data-bid-tools-lane-token]");
  if (bidToolsLaneButton) {
    selectBidToolsLane(bidToolsLaneButton.dataset.bidToolsLaneToken || "");
    return;
  }

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
    openSelectedLaneOfferEditor();
    return;
  }

  const openBidEditorSectionButton = event.target.closest("[data-open-bid-editor-section]");
  if (openBidEditorSectionButton) {
    const section = openBidEditorSectionButton.dataset.openBidEditorSection || "primary";
    selectBidToolsLane(selectedBidToolsToken || String(lastInvitation?.invitation_token || ""), {
      panel: section === "primary" ? "" : section,
      focusQuickBid: section === "primary"
    });
    return;
  }

  const quickBidSaveButton = event.target.closest("[data-save-quick-bid]");
  if (quickBidSaveButton) {
    const row = quickBidSaveButton.closest("[data-quick-bid-row]");
    if (row) await saveQuickBidRow(row, quickBidSaveButton);
    return;
  }

  const quickBidPanelButton = event.target.closest("[data-toggle-quick-bid-panel]");
  if (quickBidPanelButton) {
    quickBidPanelButton.closest(".quick-bid-more-actions")?.removeAttribute("open");
    const row = quickBidPanelButton.closest("[data-quick-bid-row]");
    if (row) toggleQuickBidPanel(row, quickBidPanelButton.dataset.toggleQuickBidPanel || "");
    return;
  }

  const closeQuickBidPanelButton = event.target.closest("[data-close-quick-bid-panel]");
  if (closeQuickBidPanelButton) {
    const row = closeQuickBidPanelButton.closest("[data-quick-bid-details]")?.previousElementSibling;
    if (row?.matches("[data-quick-bid-row]")) closeQuickBidPanel(row);
    return;
  }

  const openQuickLaneFitButton = event.target.closest("[data-open-quick-lane-fit]");
  if (openQuickLaneFitButton) {
    // There is one fit checklist and it belongs to the selected lane, so a row
    // has to select its own lane first. Without this every row would open
    // whichever lane happened to be selected.
    const fitToken = openQuickLaneFitButton.dataset.openQuickLaneFit || "";
    const fit = card.querySelector("#carrier-lane-fit");
    const alreadySelected = fitToken && fitToken === String(selectedBidToolsToken || "");
    if (alreadySelected && fit) {
      fit.open = !fit.open;
      fit.classList.add("is-focused");
      openQuickLaneFitButton.setAttribute("aria-expanded", String(fit.open));
      window.setTimeout(() => fit.classList.remove("is-focused"), 1800);
    } else if (fitToken) {
      selectBidToolsLane(fitToken, { openFit: true });
    }
    return;
  }

  const quickBidWithdrawButton = event.target.closest("[data-withdraw-quick-bid]");
  if (quickBidWithdrawButton) {
    quickBidWithdrawButton.closest(".quick-bid-more-actions")?.removeAttribute("open");
    const row = quickBidWithdrawButton.closest("[data-quick-bid-row]");
    if (row) await updateBidParticipation("withdraw_bid", quickBidWithdrawButton, { rowElement: row });
    return;
  }

  const quickBidDeclineButton = event.target.closest("[data-decline-quick-invitation]");
  if (quickBidDeclineButton) {
    quickBidDeclineButton.closest(".quick-bid-more-actions")?.removeAttribute("open");
    const row = quickBidDeclineButton.closest("[data-quick-bid-row]");
    if (row) await updateBidParticipation("decline_invitation", quickBidDeclineButton, { rowElement: row });
    return;
  }

  const withdrawOfferButton = event.target.closest("[data-withdraw-offer]");
  if (withdrawOfferButton) {
    await updateBidParticipation("withdraw_bid", withdrawOfferButton);
    return;
  }

  const declineInvitationButton = event.target.closest("[data-decline-invitation]");
  if (declineInvitationButton) {
    await updateBidParticipation("decline_invitation", declineInvitationButton, {
      token: declineInvitationButton.dataset.invitationToken || ""
    });
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
    setPrivateWorkspace("award");
    renderCarrierBook(lastCarrierBook || {});
    card.querySelector("#carrier-business-book")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const routeBookFilterButton = event.target.closest("[data-route-book-filter]");
  if (routeBookFilterButton) {
    bookFilters.view = routeBookFilterButton.dataset.routeBookFilter || "all";
    setPrivateWorkspace("award");
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
    const panel = bidSupportPanel;
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
    const input = bidSupportPanel?.querySelector("#bid-support-message");
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
        status.textContent = humanizeError(error);
        status.dataset.tone = "error";
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
  const laneId = String(button.dataset.requestLane || "").trim();
  if (!laneId || laneAccessRequestMutationKeys.has(laneId)) return;
  laneAccessRequestMutationKeys.add(laneId);
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Requesting...";
  try {
    const result = await callBidApi("request_lane_access", { lane_id: laneId });
    button.textContent = result.requested ? "Requested" : "Already in book";
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    setCarrierPortalStatus("#carrier-book-status", humanizeError(error), "error")
      || setCarrierPortalStatus("#carrier-bid-template-status", humanizeError(error), "error");
  } finally {
    laneAccessRequestMutationKeys.delete(laneId);
  }
});

document.addEventListener("submit", async (event) => {
  const chatForm = event.target.closest("#carrier-chat-form");
  const supportForm = event.target.closest("#bid-support-form");
  if (!chatForm && !supportForm) return;
  event.preventDefault();
  if (supportForm) {
    await askBidSupport();
    return;
  }
  if (carrierChatSubmitting) return;
  const status = card.querySelector("#carrier-chat-status");
  const message = card.querySelector("#carrier-chat-message");
  const submitButton = chatForm.querySelector("button[type='submit']");
  const body = String(message?.value || "").trim();
  if (!body) {
    if (status) {
      status.textContent = "Write a message first.";
      status.dataset.tone = "error";
    }
    message?.focus();
    return;
  }
  carrierChatSubmitting = true;
  if (submitButton) submitButton.disabled = true;
  if (message) message.disabled = true;
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
      status.textContent = humanizeError(error);
      status.dataset.tone = "error";
    }
  } finally {
    carrierChatSubmitting = false;
    if (submitButton) submitButton.disabled = false;
    if (message) message.disabled = false;
  }
});

card.addEventListener("input", (event) => {
  const laneFitComment = event.target.closest("[data-segment-comment]");
  if (laneFitComment) {
    const section = laneFitComment.closest("[data-lane-fit-checklist]");
    refreshLaneFitUi(section);
    queueSegmentConfirmationSave(section);
    return;
  }


  const quickBidInput = event.target.closest("[data-quick-bid-field], [data-quick-bid-extra-field]");
  if (quickBidInput) {
    const row = quickBidInput.closest("[data-quick-bid-row]");
    syncQuickBidCommercialPresentation(row);
    rememberQuickBidDraft(row, { localOnly: true });
    setQuickBidLocalDraftStatus(row);
    return;
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
  const laneFitAnswer = event.target.closest("[data-segment-answer]");
  if (laneFitAnswer) {
    const section = laneFitAnswer.closest("[data-lane-fit-checklist]");
    refreshLaneFitUi(section);
    queueSegmentConfirmationSave(section);
    return;
  }

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
      const parsedTemplate = await parseBidTemplateFile(file, lastCarrierBook || {}, lastInvitation || {});
      pendingBidTemplateRows = parsedTemplate.rows;
      pendingBidTemplateCoverage = parsedTemplate.coverage;
      renderBidTemplatePreview();
    } catch (error) {
      pendingBidTemplateRows = [];
      pendingBidTemplateCoverage = null;
      renderBidTemplatePreview();
      if (status) {
        status.textContent = humanizeError(error);
        status.dataset.tone = "error";
      }
    }
    return;
  }


  const quickCommercialModel = event.target.closest("[data-quick-bid-field='commercial_model']");
  if (quickCommercialModel) {
    const row = quickCommercialModel.closest("[data-quick-bid-row]");
    syncQuickBidCommercialPresentation(row, { resetPercentage: true });
    rememberQuickBidDraft(row, { localOnly: true });
    setQuickBidLocalDraftStatus(row);
    return;
  }

  const quickBidChange = event.target.closest("[data-quick-bid-field], [data-quick-bid-extra-field]");
  if (quickBidChange) {
    const row = quickBidChange.closest("[data-quick-bid-row]");
    syncQuickBidCommercialPresentation(row);
    rememberQuickBidDraft(row, { localOnly: true });
    setQuickBidLocalDraftStatus(row);
  }
});

document.addEventListener("keydown", (event) => {
  const bidToolsTab = event.target.closest?.("[data-bid-tools-lane-token]");
  if (bidToolsTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    const tabs = [...bidToolsTab.closest("[role='tablist']")?.querySelectorAll("[data-bid-tools-lane-token]") || []];
    const index = tabs.indexOf(bidToolsTab);
    if (tabs.length && index >= 0) {
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      const nextToken = tabs[nextIndex]?.dataset.bidToolsLaneToken || "";
      selectBidToolsLane(nextToken);
      requestAnimationFrame(() => card.querySelector(`[data-bid-tools-lane-token="${CSS.escape(nextToken)}"]`)?.focus());
      return;
    }
  }
  if (event.key === "Escape" && bidSupportPanel?.dataset.open === "true") {
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

window.addEventListener("popstate", () => {
  if (!tokenFromUrl() || privateLaneSwitching) return;
  activePrivateWorkspace = "master";
  loadInvitation();
});

syncPortalLanguageChrome();
loadInvitation().then(() => {
  if (boardRefreshTimer) window.clearInterval(boardRefreshTimer);
  boardRefreshTimer = window.setInterval(() => loadInvitation({ refreshOnly: true }), 30000);
});
