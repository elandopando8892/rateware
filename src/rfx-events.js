import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  applyBidUpdateFromChat,
  archiveRfxEvent,
  archiveRfxLaneVendors,
  awardRfxLaneVendor,
  clearRfxAward,
  closeoutAwardedRfxToRateware,
  generateRfxAwardNotices,
  autoShortlistRfxLane,
  createRfxEvent,
  deleteRfxEvent,
  duplicateRfxEvent,
  fetchRfxDetail,
  fetchRfxEvents,
  importRfxLanes,
  inviteRfxLaneVendors,
  fetchBidRoomChat,
  postBidRoomChatMessage,
  shortlistRfxLaneVendors,
  syncBidRoomEventThread,
  updateBidRoomChatThread,
  updateRfxBid,
  updateRfxEvent
} from "./rfx-service.js";
import {
  createOutreachCampaign,
  createOutreachTemplate,
  fetchContactHistory,
  fetchOutreachMessages,
  fetchOutreachTemplates,
  generateOutreachDrafts,
  deleteOutreachMessages,
  markOutreachMessages,
  sendOutreachMessages,
  updateOutreachTemplate
} from "./outreach-service.js";
import { createVendorSegment, deleteVendorSegment, fetchVendorSegments, fetchVendors, updateVendorSegment } from "./vendor-service.js";
import { humanizeError } from "./error-copy.js";
import { errorState, stateBlock, tableErrorState, tableState } from "./ui-state.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const eventForm = document.querySelector("#rfx-event-form");
const rfxIdInput = document.querySelector("#rfx-id");
const rfxNameInput = document.querySelector("#rfx-name");
const rfxCustomerInput = document.querySelector("#rfx-customer");
const rfxTypeInput = document.querySelector("#rfx-type");
const rfxBidVisibilityInput = document.querySelector("#rfx-bid-visibility");
const rfxDueDateInput = document.querySelector("#rfx-due-date");
const eventStatus = document.querySelector("#rfx-event-status");
const eventList = document.querySelector("#rfx-event-list");
const detailTitle = document.querySelector("#rfx-detail-title");
const createRfxEventButton = document.querySelector("#create-rfx-event-button");
const editRfxButton = document.querySelector("#edit-rfx-button");
const duplicateRfxButton = document.querySelector("#duplicate-rfx-button");
const openRfxButton = document.querySelector("#open-rfx-button");
const closeRfxButton = document.querySelector("#close-rfx-button");
const archiveRfxButton = document.querySelector("#archive-rfx-button");
const deleteRfxButton = document.querySelector("#delete-rfx-button");
const lanePaste = document.querySelector("#rfx-lane-paste");
const laneTemplateFileInput = document.querySelector("#rfx-lane-template-file");
const downloadLaneTemplateButton = document.querySelector("#download-rfx-lane-template");
const importLanesButton = document.querySelector("#import-rfx-lanes-button");
const clearLanesInputButton = document.querySelector("#clear-rfx-lanes-input");
const laneImportStatus = document.querySelector("#rfx-lane-import-status");
const laneTemplatePreview = document.querySelector("#rfx-lane-template-preview");
const laneTemplatePreviewBody = document.querySelector("#rfx-lane-template-preview-body");
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
const copyRfxSummaryButton = document.querySelector("#copy-rfx-summary");
const eventFlow = document.querySelector("#rfx-event-flow");
const laneCoverage = document.querySelector("#rfx-lane-coverage");
const coverageSummary = document.querySelector("#rfx-coverage-summary");
const laneSearch = document.querySelector("#rfx-lane-search");
const laneDecisionTitle = document.querySelector("#rfx-lane-decision-title");
const laneDecisionStatusPill = document.querySelector("#rfx-lane-decision-status");
const laneDecisionBody = document.querySelector("#rfx-lane-decision-body");
const responseSummary = document.querySelector("#rfx-response-summary");
const responseBody = document.querySelector("#rfx-response-body");
const manualShortlistLane = document.querySelector("#manual-shortlist-lane");
const manualShortlistSearch = document.querySelector("#manual-shortlist-search");
const manualShortlistVendors = document.querySelector("#manual-shortlist-vendors");
const manualShortlistVendorList = document.querySelector("#manual-shortlist-vendor-list");
const manualShortlistSourceSummary = document.querySelector("#manual-shortlist-source-summary");
const manualShortlistSegment = document.querySelector("#manual-shortlist-segment");
const manualShortlistSelectedCount = document.querySelector("#manual-shortlist-selected-count");
const manualShortlistSelectedList = document.querySelector("#manual-shortlist-selected-list");
const selectVisibleCarriersButton = document.querySelector("#select-visible-carriers");
const selectSegmentCarriersButton = document.querySelector("#select-segment-carriers");
const clearCarrierSelectionButton = document.querySelector("#clear-carrier-selection");
const manualShortlistTemplateName = document.querySelector("#manual-shortlist-template-name");
const saveManualShortlistTemplateButton = document.querySelector("#save-manual-shortlist-template");
const loadManualShortlistTemplateButton = document.querySelector("#load-manual-shortlist-template");
const updateManualShortlistTemplateButton = document.querySelector("#update-manual-shortlist-template");
const deleteManualShortlistTemplateButton = document.querySelector("#delete-manual-shortlist-template");
const manualShortlistButton = document.querySelector("#manual-shortlist-button");
const manualShortlistStatus = document.querySelector("#manual-shortlist-status");
const carrierTemplateFileInput = document.querySelector("#rfx-carrier-template-file");
const downloadCarrierTemplateButton = document.querySelector("#download-rfx-carrier-template");
const importCarrierTemplateButton = document.querySelector("#import-rfx-carrier-template");
const carrierTemplatePreview = document.querySelector("#rfx-carrier-template-preview");
const carrierTemplatePreviewBody = document.querySelector("#rfx-carrier-template-preview-body");
const carrierTemplateStatus = document.querySelector("#rfx-carrier-template-status");
const rfxOutreachForm = document.querySelector("#rfx-outreach-form");
const rfxOutreachCampaignName = document.querySelector("#rfx-outreach-campaign-name");
const rfxOutreachTemplate = document.querySelector("#rfx-outreach-template");
const rfxOutreachChannel = document.querySelector("#rfx-outreach-channel");
const rfxOutreachSender = document.querySelector("#rfx-outreach-sender");
const createRfxOutreachCampaignButton = document.querySelector("#create-rfx-outreach-campaign");
const rfxOutreachStatus = document.querySelector("#rfx-outreach-status");
const rfxOutreachPreview = document.querySelector("#rfx-outreach-preview");
const rfxTemplateEditor = document.querySelector("#rfx-template-editor");
const rfxTemplateSubject = document.querySelector("#rfx-template-subject");
const rfxTemplateHtml = document.querySelector("#rfx-template-html");
const rfxTemplateWhatsapp = document.querySelector("#rfx-template-whatsapp");
const saveRfxTemplateHtmlButton = document.querySelector("#save-rfx-template-html");
const resetRfxTemplateHtmlButton = document.querySelector("#reset-rfx-template-html");
const rfxTemplateEditorStatus = document.querySelector("#rfx-template-editor-status");
const touchpointSummary = document.querySelector("#rfx-touchpoint-summary");
const touchpointList = document.querySelector("#rfx-touchpoint-list");
const draftSummary = document.querySelector("#rfx-draft-summary");
const draftList = document.querySelector("#rfx-draft-list");
const draftSelectionLabel = document.querySelector("#rfx-draft-selection-label");
const draftToggleVisible = document.querySelector("#rfx-toggle-visible-drafts");
const draftSelectAllEmailsButton = document.querySelector("#rfx-select-all-email-drafts");
const draftClearSelectionButton = document.querySelector("#rfx-clear-draft-selection");
const draftSendSelectedButton = document.querySelector("#rfx-send-selected-email-drafts");
const draftArchiveSelectedButton = document.querySelector("#rfx-archive-selected-drafts");
const draftDeleteSelectedButton = document.querySelector("#rfx-delete-selected-drafts");
const wizardRefreshButton = document.querySelector("#rfx-wizard-refresh");
const wizardLiveOffersButton = document.querySelector("#rfx-wizard-live-offers");
const wizardSteps = document.querySelector("#rfx-wizard-steps");
const wizardPrimary = document.querySelector("#rfx-wizard-primary");
const wizardPreview = document.querySelector("#rfx-wizard-preview");
const liveOfferManager = document.querySelector("#rfx-live-offer-manager");
const rfxChatThreadType = document.querySelector("#rfx-chat-thread-type");
const rfxChatLane = document.querySelector("#rfx-chat-lane");
const rfxChatVendor = document.querySelector("#rfx-chat-vendor");
const rfxChatRefresh = document.querySelector("#rfx-chat-refresh");
const rfxChatStartEventThread = document.querySelector("#rfx-chat-start-event-thread");
const rfxChatThreadList = document.querySelector("#rfx-chat-thread-list");
const rfxChatForm = document.querySelector("#rfx-chat-form");
const rfxChatMessage = document.querySelector("#rfx-chat-message");
const rfxChatSend = document.querySelector("#rfx-chat-send");
const rfxChatStatus = document.querySelector("#rfx-chat-status");
const rfxChatSyncStatus = document.querySelector("#rfx-chat-sync-status");
const rfxChatMetricThreads = document.querySelector("#rfx-chat-metric-threads");
const rfxChatMetricNeedsReply = document.querySelector("#rfx-chat-metric-needs-reply");
const rfxChatMetricCarrier = document.querySelector("#rfx-chat-metric-carrier");
const rfxChatMetricGoogle = document.querySelector("#rfx-chat-metric-google");
const rfxChatInboxFilters = document.querySelector("#rfx-chat-inbox-filters");
const rfxChatCopySummary = document.querySelector("#rfx-chat-copy-summary");
const rfxChatAiSummary = document.querySelector("#rfx-chat-ai-summary");
const rfxChatSignalQueue = document.querySelector("#rfx-chat-signal-queue");
const rfxChatBidUpdateDrawer = document.querySelector("#rfx-chat-bid-update-drawer");
const rfxChatBidUpdateForm = document.querySelector("#rfx-chat-bid-update-form");
const rfxChatBidUpdateTitle = document.querySelector("#rfx-chat-bid-update-title");
const rfxChatBidUpdateInvitation = document.querySelector("#rfx-chat-bid-update-invitation");
const rfxChatBidUpdateRate = document.querySelector("#rfx-chat-bid-update-rate");
const rfxChatBidUpdateCurrency = document.querySelector("#rfx-chat-bid-update-currency");
const rfxChatBidUpdateCapacity = document.querySelector("#rfx-chat-bid-update-capacity");
const rfxChatBidUpdateTransit = document.querySelector("#rfx-chat-bid-update-transit");
const rfxChatBidUpdateNotes = document.querySelector("#rfx-chat-bid-update-notes");
const rfxChatBidUpdateSource = document.querySelector("#rfx-chat-bid-update-source");
const rfxChatBidUpdateClose = document.querySelector("#rfx-chat-bid-update-close");
const rfxChatBidUpdateCloseSecondary = document.querySelector("#rfx-chat-bid-update-close-secondary");
const rfxChatBidUpdateApply = document.querySelector("#rfx-chat-bid-update-apply");
const rfxChatBidUpdateStatus = document.querySelector("#rfx-chat-bid-update-status");
const rfxOpsTitle = document.querySelector("#rfx-ops-title");
const rfxOpsSubtitle = document.querySelector("#rfx-ops-subtitle");
const rfxOpsHealth = document.querySelector("#rfx-ops-health");
const rfxOpsOutreachLink = document.querySelector("#rfx-ops-outreach-link");
const rfxOpsStageRail = document.querySelector("#rfx-ops-stage-rail");
const rfxOpsNextAction = document.querySelector("#rfx-ops-next-action");
const rfxLaunchReadiness = document.querySelector("#rfx-launch-readiness");
const rfxManagerFlow = document.querySelector("#rfx-manager-flow");
const rfxManagerFocus = document.querySelector("#rfx-manager-focus");
const rfxManagerQueue = document.querySelector("#rfx-manager-queue");
const rfxAwardBoard = document.querySelector("#rfx-award-board");
const rfxAwardStatus = document.querySelector("#rfx-award-status");
const rfxAwardStatusPill = document.querySelector("#rfx-award-status-pill");
const rfxAwardLanes = document.querySelector("#rfx-award-lanes");
const rfxAwardPrimary = document.querySelector("#rfx-award-primary");
const rfxAwardBackup = document.querySelector("#rfx-award-backup");
const rfxAwardRateware = document.querySelector("#rfx-award-rateware");
const rfxAwardReadiness = document.querySelector("#rfx-award-readiness");
const rfxApplyRecommendedAwardsButton = document.querySelector("#rfx-apply-recommended-awards");
const rfxCloseoutAwardsButton = document.querySelector("#rfx-closeout-awards-to-rateware");
const rfxRefreshAwardsButton = document.querySelector("#rfx-refresh-awards");
const rfxGenerateAwardNoticesButton = document.querySelector("#rfx-generate-award-notices");
const rfxSendAwardNoticesButton = document.querySelector("#rfx-send-award-notices");
const rfxAwardNoticeSummary = document.querySelector("#rfx-award-notice-summary");
const rfxAwardNoticeQueue = document.querySelector("#rfx-award-notice-queue");

let events = [];
let selectedEventId = null;
let selectedEvent = null;
let editingEventId = null;
let currentLanes = [];
let vendorOptions = [];
let outreachTemplates = [];
let rfxTemplateEditorTemplateId = null;
let rfxTemplateEditorDirty = false;
let rfxTemplateVisualEditing = false;
let contactHistoryRows = [];
let outreachMessages = [];
let bidRoomChatThreads = { rows: [], google_chat_configured: false };
let bidRoomChatFilter = "all";
let bidRoomChatRefreshTimer = null;
let pendingChatBidUpdate = null;
let selectedLaneIds = new Set();
let selectedInvitationIds = new Set();
let selectedDraftMessageIds = new Set();
let focusedLaneId = null;
let activeLaneFilter = "all";
let pendingLaneTemplateRows = [];
let pendingLaneTemplateIssues = [];
let pendingCarrierTemplateRows = [];
let pendingCarrierTemplateMatches = [];
let vendorOptionsLoading = true;
let vendorSearchLoading = false;
let vendorSearchTimer = null;
let vendorSearchSequence = 0;
let vendorSegmentsLoading = true;
let savedVendorSegments = [];
let selectedManualVendorIdsState = new Set();
const rfxPageParams = new URLSearchParams(window.location.search);
const requestedRfxEventId = rfxPageParams.get("rfx_event_id");
const rfxWorkbench = initWorkbenchTabs({ defaultView: "setup" });
const APPROVED_GMAIL_SENDER = "sales@heymarksman.com";

const RFX_LANE_TEMPLATE_COLUMNS = [
  { key: "lane_number", label: "Lane #", example: "1" },
  { key: "origin", label: "Origin", required: true, example: "Apodaca, NL" },
  { key: "origin_city", label: "Origin City", example: "Apodaca" },
  { key: "origin_state", label: "Origin ST", example: "NL" },
  { key: "origin_country", label: "Origin Country", example: "MX" },
  { key: "origin_market", label: "Origin Market", example: "Monterrey Market" },
  { key: "origin_region", label: "Origin Region", example: "Northeast Mexico" },
  { key: "destination", label: "Destination", required: true, example: "Dallas, TX" },
  { key: "destination_city", label: "Destination City", example: "Dallas" },
  { key: "destination_state", label: "Destination ST", example: "TX" },
  { key: "destination_country", label: "Destination Country", example: "US" },
  { key: "destination_market", label: "Destination Market", example: "Dallas Mkt (TX)" },
  { key: "destination_region", label: "Destination Region", example: "Texas" },
  { key: "equipment", label: "Equipment", example: "Truck Trailer" },
  { key: "trailer", label: "Trailer", example: "Dry Van" },
  { key: "config", label: "Config", example: "Single" },
  { key: "operation", label: "Operation", example: "D2D Export" },
  { key: "service", label: "Service", example: "One Way" },
  { key: "weekly_volume", label: "Weekly Volume", example: "10" },
  { key: "annual_volume", label: "Annual Volume", example: "520" },
  { key: "target_rate", label: "Target Rate", example: "2900" },
  { key: "currency", label: "Currency", example: "USD" },
  { key: "incumbent_vendor", label: "Incumbent Vendor", example: "carrier.com" },
  { key: "notes", label: "Notes", example: "Hazmat allowed" }
];

const RFX_CARRIER_TEMPLATE_COLUMNS = [
  { key: "participate", label: "Participate", example: "TRUE" },
  { key: "vendor_id", label: "CRM Vendor ID", example: "" },
  { key: "vendor_name", label: "Vendor Name", example: "Carrier Logistics" },
  { key: "vendor_domain", label: "Vendor Domain", example: "carrier.com" },
  { key: "vendor_email", label: "Vendor Email", example: "pricing@carrier.com" },
  { key: "base_stage", label: "Base Stage", example: "procurement" },
  { key: "status", label: "Status", example: "active" },
  { key: "preferred_channel", label: "Preferred Channel", example: "email" },
  { key: "coverage_notes", label: "Coverage Notes", example: "Cross-border MX-US" },
  { key: "tags", label: "Tags", example: "flatbed; cross-border" },
  { key: "notes", label: "Notes", example: "Target invite wave 1" }
];
const BID_ROOM_EVENT_THREAD_TYPE = "event_group";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = tone === "error" ? humanizeError(message) : message;
  element.dataset.tone = tone;
}

function rfxEventPayload() {
  return {
    rfx_id: rfxIdInput.value,
    name: rfxNameInput.value,
    customer: rfxCustomerInput.value,
    event_type: rfxTypeInput.value,
    bid_visibility_mode: rfxBidVisibilityInput?.value || "anonymous_rank",
    due_date: rfxDueDateInput.value
  };
}

function updateEventActionState() {
  const hasSelection = Boolean(selectedEventId);
  [editRfxButton, duplicateRfxButton, openRfxButton, closeRfxButton, archiveRfxButton, deleteRfxButton]
    .forEach((button) => {
      if (button) button.disabled = !hasSelection;
    });
}

function eventLifecycleRiskSummary() {
  const invitations = currentLanes.flatMap((lane) => lane.invitations || []);
  const activeInviteRows = invitations.filter((item) => item.invitation_status !== "archived");
  const messageRows = selectedEventId
    ? outreachMessages.filter((message) => message.rfx_event_id === selectedEventId && String(message.status || "").toLowerCase() !== "archived")
    : [];
  return {
    lanes: currentLanes.length,
    participants: activeInviteRows.length,
    bids: invitations.filter(hasBid).length,
    awards: activeInviteRows.filter((item) => item.award_role).length,
    ratewareRows: activeInviteRows.filter((item) => item.rate_staging_id).length,
    messages: messageRows.length,
    sentMessages: messageRows.filter((message) => String(message.status || "").toLowerCase() === "sent").length
  };
}

function eventLifecycleRiskLines(summary = eventLifecycleRiskSummary()) {
  return [
    `${formatNumber(summary.lanes)} lane(s)`,
    `${formatNumber(summary.participants)} participant row(s)`,
    `${formatNumber(summary.bids)} bid(s)`,
    `${formatNumber(summary.awards)} award decision(s)`,
    `${formatNumber(summary.ratewareRows)} Rateware closeout row(s)`,
    `${formatNumber(summary.sentMessages)} sent email(s)`
  ];
}

function confirmEventLifecycleAction(action) {
  const label = selectedEvent?.rfx_id || selectedEvent?.name || "this bid event";
  const summaryText = eventLifecycleRiskLines().join(" | ");
  if (action === "open") {
    return window.confirm(`Open ${label}? Current scope: ${summaryText}.`);
  }
  if (action === "close") {
    return window.confirm(`Close ${label}? Current scope: ${summaryText}.`);
  }
  if (action === "duplicate") {
    return window.confirm(`Duplicate ${label}? Lanes and active shortlisted vendors will be copied. This does not send invitations. Current scope: ${summaryText}.`);
  }
  if (action === "archive") {
    return window.confirm(`Archive ${label}? It will be hidden from active Bid Room lists. Current scope: ${summaryText}.`);
  }
  if (action === "delete") {
    const typed = window.prompt(`Type "${label}" to delete this bid event and related RFx rows. Current scope: ${summaryText}.`);
    return typed === label;
  }
  return true;
}

function resetRfxEventForm() {
  editingEventId = null;
  eventForm?.reset();
  if (createRfxEventButton) createRfxEventButton.textContent = "Create event";
}

function fillRfxEventForm(event) {
  if (!event) return;
  editingEventId = event.id;
  rfxIdInput.value = event.rfx_id || "";
  rfxNameInput.value = event.name || "";
  rfxCustomerInput.value = event.customer || "";
  rfxTypeInput.value = event.event_type || "spot";
  if (rfxBidVisibilityInput) rfxBidVisibilityInput.value = event.bid_visibility_mode || "anonymous_rank";
  rfxDueDateInput.value = event.due_date || "";
  if (createRfxEventButton) createRfxEventButton.textContent = "Save changes";
  activateWorkbenchView("setup", "#rfx-id");
  eventForm?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function bidVisibilityLabel(mode = "anonymous_rank") {
  const labels = {
    private: "Private blind",
    anonymous_rank: "Anonymous rank",
    open_leaderboard: "Open leaderboard"
  };
  return labels[mode] || labels.anonymous_rank;
}

function marketplaceUrlForEvent(eventId) {
  return `./bid-room-board.html?event_id=${encodeURIComponent(eventId || "")}`;
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

function slugify(value) {
  return String(value || "list")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "list";
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

function rowsFromTemplateMatrix(matrix = []) {
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(mapHeader);
    return headers.includes("origin") && headers.includes("destination");
  });
  if (headerIndex < 0) {
    throw new Error("Template headers not found. Keep the RFx lane template header row intact.");
  }
  const headers = matrix[headerIndex].map(mapHeader);
  return matrix.slice(headerIndex + 1)
    .map((row, index) => {
      const item = { lane_number: index + 1 };
      headers.forEach((header, cellIndex) => {
        if (!header) return;
        item[header] = row[cellIndex] ?? "";
      });
      return item;
    })
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "lane_number" && String(value ?? "").trim()));
}

function normalizeTemplateRows(rows = []) {
  return rows.map((row, index) => {
    const normalized = { lane_number: Number(row.lane_number || row.lane || row.seq || index + 1) || index + 1 };
    RFX_LANE_TEMPLATE_COLUMNS.forEach((column) => {
      if (column.key === "lane_number") return;
      const value = row[column.key] ?? row[mapHeader(column.label)] ?? "";
      normalized[column.key] = typeof value === "string" ? value.trim() : value;
    });
    normalized.currency = String(normalized.currency || "USD").trim().toUpperCase();
    return normalized;
  });
}

function validateLaneTemplateRows(rows = []) {
  return rows.map((row, index) => {
    const issues = [];
    if (!String(row.origin || "").trim()) issues.push("origin required");
    if (!String(row.destination || "").trim()) issues.push("destination required");
    if (!String(row.equipment || "").trim()) issues.push("equipment recommended");
    if (!String(row.trailer || "").trim()) issues.push("trailer recommended");
    if (!String(row.operation || "").trim()) issues.push("operation recommended");
    if (!String(row.service || "").trim()) issues.push("service recommended");
    return { index, row, issues };
  });
}

function readyLaneTemplateRows() {
  return pendingLaneTemplateIssues
    .filter((item) => !item.issues.some((issue) => issue.includes("required")))
    .map((item) => item.row);
}

function updateLaneImportButton() {
  if (!importLanesButton) return;
  const hasTemplateRows = readyLaneTemplateRows().length > 0;
  const hasPasteRows = Boolean(lanePaste?.value?.trim());
  importLanesButton.disabled = !selectedEventId || (!hasTemplateRows && !hasPasteRows);
}

function renderLaneTemplatePreview() {
  if (!laneTemplatePreview || !laneTemplatePreviewBody) return;
  const issues = pendingLaneTemplateIssues;
  const readyRows = readyLaneTemplateRows();
  laneTemplatePreview.hidden = !issues.length;
  if (!issues.length) {
    laneTemplatePreviewBody.innerHTML = "";
    return;
  }
  laneTemplatePreviewBody.innerHTML = issues.slice(0, 8).map((item) => `
    <tr class="${item.issues.some((issue) => issue.includes("required")) ? "is-muted-row" : ""}">
      <td>${escapeHtml(item.row.lane_number || item.index + 1)}</td>
      <td>${escapeHtml(item.row.origin || "-")}</td>
      <td>${escapeHtml(item.row.destination || "-")}</td>
      <td>${escapeHtml(item.row.equipment || "-")} / ${escapeHtml(item.row.trailer || "-")}</td>
      <td>${escapeHtml(item.row.operation || "-")} / ${escapeHtml(item.row.service || "-")}</td>
      <td>${escapeHtml(item.issues.join(", ") || "ready")}</td>
    </tr>
  `).join("");
  updateLaneImportButton();
  const blocked = issues.length - readyRows.length;
  const suffix = selectedEventId ? "" : " Select or create a bid event before import.";
  const message = `${readyRows.length} ready lane(s). ${blocked} row(s) need required origin/destination cleanup.${suffix}`;
  setStatus(laneImportStatus, message, readyRows.length ? "success" : "error");
}

function clearLaneTemplateImport({ preserveStatus = false } = {}) {
  pendingLaneTemplateRows = [];
  pendingLaneTemplateIssues = [];
  if (laneTemplateFileInput) laneTemplateFileInput.value = "";
  if (lanePaste) lanePaste.value = "";
  if (laneTemplatePreview) laneTemplatePreview.hidden = true;
  if (laneTemplatePreviewBody) laneTemplatePreviewBody.innerHTML = "";
  if (!preserveStatus) setStatus(laneImportStatus, "Upload the RFx lane book template to preview lanes.");
  updateLaneImportButton();
}

function emptyBidRoomChatThreads() {
  return {
    rows: [],
    google_chat_configured: false,
    google_chat_inbound: null,
    google_chat_space_name: "",
    google_chat_space_display_name: ""
  };
}

function getSettledValue(result, fallback) {
  return result && result.status === "fulfilled" ? result.value : fallback;
}

function getSettledWarning(result, label) {
  if (!result || result.status !== "rejected") return "";
  const message = humanizeError(result.reason?.message || result.reason || "");
  return `${label} could not load${message ? ` (${message})` : ""}.`;
}

async function parseLaneTemplateFile(file) {
  if (!file) return [];
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "csv" || file.type === "text/csv") {
    return normalizeTemplateRows(rowsFromTemplateMatrix(parseDelimitedRows(await file.text())));
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => /rfx|lane|book/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets were found in this template.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  return normalizeTemplateRows(rowsFromTemplateMatrix(matrix));
}

function downloadRfxLaneTemplate() {
  const headers = RFX_LANE_TEMPLATE_COLUMNS.map((column) => column.key);
  const example = Object.fromEntries(RFX_LANE_TEMPLATE_COLUMNS.map((column) => [column.key, column.example || ""]));
  const blank = Object.fromEntries(RFX_LANE_TEMPLATE_COLUMNS.map((column) => [column.key, ""]));
  const workbook = XLSX.utils.book_new();
  const templateSheet = XLSX.utils.json_to_sheet([example, blank], { header: headers });
  templateSheet["!cols"] = RFX_LANE_TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.key.length + 2, 14) }));
  templateSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  XLSX.utils.book_append_sheet(workbook, templateSheet, "RFx Lane Template");
  const referenceRows = [
    ["Column", "Required", "How to use"],
    ...RFX_LANE_TEMPLATE_COLUMNS.map((column) => [
      column.key,
      column.required ? "Yes" : "No",
      column.required ? "Required for import." : "Optional but improves matching, shortlist and bidding."
    ])
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceRows), "Field Reference");
  XLSX.writeFile(workbook, `rateware-rfx-lane-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function mapCarrierHeader(header) {
  const aliases = {
    participate: "participate",
    participates: "participate",
    participant: "participate",
    include: "participate",
    included: "participate",
    invite: "participate",
    invited: "participate",
    selected: "participate",
    select: "participate",
    true_false: "participate",
    y_n: "participate",
    yes_no: "participate",
    vendor_id: "vendor_id",
    crm_vendor_id: "vendor_id",
    id: "vendor_id",
    carrier: "vendor_name",
    carrier_name: "vendor_name",
    vendor: "vendor_name",
    vendor_name: "vendor_name",
    name: "vendor_name",
    company: "vendor_name",
    company_name: "vendor_name",
    domain: "vendor_domain",
    vendor_domain: "vendor_domain",
    carrier_domain: "vendor_domain",
    website: "vendor_domain",
    email: "vendor_email",
    vendor_email: "vendor_email",
    carrier_email: "vendor_email",
    primary_email: "vendor_email",
    contact_email: "vendor_email",
    stage: "base_stage",
    crm_stage: "base_stage",
    base: "base_stage",
    channel: "preferred_channel",
    coverage: "coverage_notes",
    coverage_note: "coverage_notes",
    tag: "tags"
  };
  const key = cleanHeader(header);
  return aliases[key] || key;
}

function parseBooleanFlag(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return ["true", "yes", "y", "1", "x", "si", "sí", "selected", "include", "included", "invite"].includes(text);
}

function normalizeDomain(value) {
  const text = String(value || "").trim().toLowerCase();
  const fromEmail = text.includes("@") ? text.split("@").pop() : text;
  return fromEmail
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|sa|de|cv|sapi|corp|corporation|company|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsFromCarrierTemplateMatrix(matrix = []) {
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(mapCarrierHeader);
    return headers.includes("participate")
      && headers.some((header) => ["vendor_id", "vendor_domain", "vendor_email", "vendor_name"].includes(header));
  });
  if (headerIndex < 0) {
    throw new Error("Carrier catalog template headers not found. Use participate plus vendor_id, vendor_domain, vendor_email or vendor_name.");
  }
  const headers = matrix[headerIndex].map(mapCarrierHeader);
  return matrix.slice(headerIndex + 1)
    .map((row) => {
      const item = {};
      headers.forEach((header, cellIndex) => {
        if (!header) return;
        item[header] = row[cellIndex] ?? "";
      });
      return item;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function normalizeCarrierTemplateRows(rows = []) {
  return rows.map((row) => {
    const normalized = {};
    RFX_CARRIER_TEMPLATE_COLUMNS.forEach((column) => {
      const value = row[column.key] ?? row[mapCarrierHeader(column.label)] ?? "";
      normalized[column.key] = typeof value === "string" ? value.trim() : value;
    });
    normalized.participate = parseBooleanFlag(normalized.participate);
    normalized.vendor_id = String(normalized.vendor_id || "").trim();
    normalized.vendor_domain = normalizeDomain(normalized.vendor_domain || normalized.vendor_email);
    normalized.vendor_email = String(normalized.vendor_email || "").trim().toLowerCase();
    normalized.vendor_name = String(normalized.vendor_name || "").trim();
    normalized.base_stage = String(normalized.base_stage || "").trim();
    normalized.status = String(normalized.status || "").trim();
    normalized.preferred_channel = String(normalized.preferred_channel || "").trim();
    normalized.coverage_notes = String(normalized.coverage_notes || "").trim();
    normalized.tags = String(Array.isArray(normalized.tags) ? normalized.tags.join("; ") : normalized.tags || "").trim();
    normalized.notes = String(normalized.notes || "").trim();
    return normalized;
  });
}

async function parseCarrierTemplateFile(file) {
  if (!file) return [];
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "csv" || extension === "tsv" || file.type === "text/csv") {
    return normalizeCarrierTemplateRows(rowsFromCarrierTemplateMatrix(parseDelimitedRows(await file.text())));
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => /carrier|vendor|participant|shortlist|target/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets were found in this CRM participant catalog.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  return normalizeCarrierTemplateRows(rowsFromCarrierTemplateMatrix(matrix));
}

function downloadRfxCarrierTemplate() {
  if (!vendorOptions.length) {
    setStatus(carrierTemplateStatus, "Carrier CRM is still loading. Wait a moment and download the catalog again.", "error");
    return;
  }
  const headers = RFX_CARRIER_TEMPLATE_COLUMNS.map((column) => column.key);
  const segmentId = selectedSegmentId();
  const selectedIds = selectedManualVendorIds();
  const presetList = segmentId !== "all";
  const sourceRows = shortlistCandidateRows();
  if (!sourceRows.length) {
    setStatus(carrierTemplateStatus, "No carriers match the current CRM list or search.", "error");
    return;
  }
  const rows = sourceRows.map((vendor) => ({
    participate: selectedIds.includes(vendor.id) || (presetList && !selectedIds.length) ? "TRUE" : "FALSE",
    vendor_id: vendor.id || "",
    vendor_name: vendor.vendor_name || "",
    vendor_domain: vendor.domain || normalizeDomain(vendor.primary_email || ""),
    vendor_email: vendor.primary_email || "",
    base_stage: vendor.base_stage || "",
    status: vendor.status || "",
    preferred_channel: vendor.preferred_channel || "",
    coverage_notes: vendor.coverage_notes || "",
    tags: Array.isArray(vendor.tags) ? vendor.tags.join("; ") : vendor.tags || "",
    notes: vendor.notes || ""
  }));
  const workbook = XLSX.utils.book_new();
  const templateSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  templateSheet["!cols"] = RFX_CARRIER_TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.key.length + 2, 18) }));
  templateSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  XLSX.utils.book_append_sheet(workbook, templateSheet, "Carrier CRM Catalog");
  const referenceRows = [
    ["Column", "How to use"],
    ["participate", "Set TRUE for carriers that should receive this bid invitation. FALSE rows stay as catalog reference."],
    ["vendor_id", "Best match key exported from Carrier CRM. Do not edit if possible."],
    ["vendor_domain", "Fallback match key if vendor_id is missing."],
    ["vendor_email", "Fallback match key if vendor_id/domain are missing."],
    ["vendor_name", "Fallback exact-name match when id/domain/email are not available."],
    ["base_stage/status/channel/coverage/tags", "Read-only CRM context to help decide who participates."],
    ["notes", "Optional operator notes; not required for import."]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceRows), "Field Reference");
  const segment = savedVendorSegments.find((item) => item.id === segmentId);
  const listName = segment?.segment_name || (segmentId === "procurement" ? "procurement" : "all-crm");
  XLSX.writeFile(workbook, `rateware-bid-carrier-catalog-${slugify(listName)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  setStatus(carrierTemplateStatus, `${formatNumber(rows.length)} carrier(s) exported from ${listName}.`, "success");
}

function portalUrl(token) {
  return `${window.location.origin}/rfx-bid.html?token=${encodeURIComponent(token)}`;
}

function vendorLabel(invitation) {
  const vendor = invitation.vendors || {};
  return vendor.vendor_name || vendor.domain || vendor.primary_email || "Vendor";
}

function commercialStatus(status) {
  const value = String(status || "drafted").toLowerCase();
  if (value === "shortlisted") return "drafted";
  if (value === "bid_submitted") return "quoted";
  if (value === "replied") return "responded";
  return value || "drafted";
}

function statusLabel(status) {
  const labels = {
    drafted: "Drafted",
    invited: "Invited",
    viewed: "Viewed",
    responded: "Responded",
    quoted: "Quoted",
    declined: "Declined",
    awarded: "Awarded",
    archived: "Archived",
    open: "Open",
    closed: "Closed"
  };
  const value = commercialStatus(status);
  return labels[value] || value;
}

function statusTone(status) {
  const value = commercialStatus(status);
  if (["quoted", "awarded", "sent", "open"].includes(value)) return "success";
  if (["invited", "viewed", "responded", "queued"].includes(value)) return "neutral";
  if (["declined", "archived", "closed"].includes(value)) return "danger";
  return "muted";
}

function statusChip(status) {
  const value = commercialStatus(status);
  return `<span class="status-pill" data-tone="${statusTone(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function commercialModelLabel(value) {
  const labels = {
    direct_cost_plus: "Direct / cost-plus",
    carrier_share: "Carrier share",
    xbf_buy_sell: "XBF buy-sell"
  };
  return labels[String(value || "").toLowerCase()] || "Not declared";
}

function formatCompactDateTime(value) {
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

function offerCommercialSummary(invitation = {}) {
  const parts = [commercialModelLabel(invitation.commercial_model)];
  if (invitation.marksman_margin_pct !== null && invitation.marksman_margin_pct !== undefined) parts.push(`${invitation.marksman_margin_pct}% MARKSMAN`);
  if (invitation.carrier_share_pct !== null && invitation.carrier_share_pct !== undefined) parts.push(`${invitation.carrier_share_pct}% share`);
  if (invitation.best_alternative_offered) parts.push(invitation.alternative_equipment ? `Alt: ${invitation.alternative_equipment}` : "Best alternative");
  return parts.filter(Boolean).join(" | ");
}

function offerAvailabilitySummary(invitation = {}) {
  if (invitation.equipment_available === true) {
    return ["Available", invitation.eta_pickup ? `PU ${formatCompactDateTime(invitation.eta_pickup)}` : null, invitation.eta_delivery ? `DEL ${formatCompactDateTime(invitation.eta_delivery)}` : null].filter(Boolean).join(" | ");
  }
  if (invitation.equipment_available === false) return "Not available";
  return "Pending";
}

function decisionNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseOptionalBidNumber(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, value: "" };
  const normalized = text.replace(/[$,\s]/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return { ok: false, error: `${label} must be numeric.` };
  if (number <= 0) return { ok: false, error: `${label} must be greater than zero.` };
  return { ok: true, value: number };
}

function validateRfxBidPatch(rawPatch = {}) {
  const patch = { ...rawPatch };
  const numericFields = [
    ["bid_rate", "Bid rate"],
    ["weekly_capacity", "Weekly capacity"],
    ["transit_days", "Transit days"]
  ];
  for (const [field, label] of numericFields) {
    const parsed = parseOptionalBidNumber(patch[field], label);
    if (!parsed.ok) return { ok: false, field, error: parsed.error };
    patch[field] = parsed.value;
  }
  const currency = String(patch.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, field: "currency", error: "Currency must be a 3-letter code like USD, MXN, or CAD." };
  }
  patch.currency = currency;
  return { ok: true, patch };
}

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scoreFromRange(value, bestValue, worstValue, maxScore, lowerIsBetter = true) {
  if (value === null || bestValue === null || worstValue === null) return 0;
  if (bestValue === worstValue) return maxScore;
  const progress = lowerIsBetter
    ? (worstValue - value) / (worstValue - bestValue)
    : (value - worstValue) / (bestValue - worstValue);
  return clampScore(progress * maxScore, 0, maxScore);
}

function laneDecisionContext(rows = []) {
  const amounts = rows.map((row) => decisionNumber(row.amount)).filter((value) => value !== null);
  const capacities = rows.map((row) => decisionNumber(row.invitation.weekly_capacity)).filter((value) => value !== null);
  const transits = rows.map((row) => decisionNumber(row.invitation.transit_days)).filter((value) => value !== null);
  const pickupEtas = rows
    .map((row) => {
      const date = new Date(row.invitation.eta_pickup || "");
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    })
    .filter((value) => value !== null);
  return {
    lowestAmount: amounts.length ? Math.min(...amounts) : null,
    highestAmount: amounts.length ? Math.max(...amounts) : null,
    bestCapacity: capacities.length ? Math.max(...capacities) : null,
    weakestCapacity: capacities.length ? Math.min(...capacities) : null,
    fastestTransit: transits.length ? Math.min(...transits) : null,
    slowestTransit: transits.length ? Math.max(...transits) : null,
    earliestPickupEta: pickupEtas.length ? Math.min(...pickupEtas) : null,
    latestPickupEta: pickupEtas.length ? Math.max(...pickupEtas) : null
  };
}

function commercialDecisionScore(invitation = {}) {
  const model = String(invitation.commercial_model || "").toLowerCase();
  const marksmanMargin = decisionNumber(invitation.marksman_margin_pct);
  const carrierShare = decisionNumber(invitation.carrier_share_pct);
  let score = 0;
  if (model === "direct_cost_plus") score += 6;
  if (model === "carrier_share") score += 5;
  if (model === "xbf_buy_sell") score += 4;
  if (marksmanMargin !== null && marksmanMargin >= 2 && marksmanMargin <= 5) score += 3;
  if (carrierShare !== null && carrierShare >= 2 && carrierShare <= 5) score += 3;
  if (marksmanMargin !== null && marksmanMargin > 5) score -= 2;
  if (carrierShare !== null && carrierShare > 5) score -= 2;
  return clampScore(score, 0, 10);
}

function procurementDecisionForBid(row, laneRows = []) {
  const invitation = row.invitation || {};
  const context = laneDecisionContext(laneRows);
  const amount = decisionNumber(row.amount);
  const capacity = decisionNumber(invitation.weekly_capacity);
  const transit = decisionNumber(invitation.transit_days);
  const pickupDate = new Date(invitation.eta_pickup || "");
  const pickupEta = Number.isNaN(pickupDate.getTime()) ? null : pickupDate.getTime();
  const priceScore = scoreFromRange(amount, context.lowestAmount, context.highestAmount, 35, true);
  const capacityScore = scoreFromRange(capacity, context.bestCapacity, context.weakestCapacity, 15, false);
  const transitScore = scoreFromRange(transit, context.fastestTransit, context.slowestTransit, 10, true);
  const etaScore = pickupEta !== null
    ? scoreFromRange(pickupEta, context.earliestPickupEta, context.latestPickupEta, 5, true)
    : 0;
  const availabilityScore = invitation.equipment_available === true
    ? 12
    : invitation.equipment_available === false
      ? -6
      : 0;
  const validationScore = [
    invitation.mirror_account_enabled ? 4 : 0,
    invitation.unit_details ? 3 : 0,
    invitation.availability_validation_status === "validated" ? 3 : 0
  ].reduce((sum, value) => sum + value, 0);
  const commercialScore = commercialDecisionScore(invitation);
  const alternativeScore = invitation.best_alternative_offered ? 5 : 0;
  const riskFlags = [];
  if (capacity === null) riskFlags.push("No capacity");
  if (invitation.equipment_available !== true) riskFlags.push("Availability not validated");
  if (invitation.equipment_available === true && pickupEta === null) riskFlags.push("Missing pickup ETA");
  if (invitation.equipment_available === true && !invitation.unit_details) riskFlags.push("Missing unit details");
  if (Number.isFinite(Number(invitation.bid_delta)) && Number(invitation.bid_delta) > 0) riskFlags.push("Above Rateware");
  if (!invitation.commercial_model) riskFlags.push("No commercial model");
  const score = clampScore(priceScore + capacityScore + transitScore + etaScore + availabilityScore + validationScore + commercialScore + alternativeScore - Math.min(12, riskFlags.length * 3));
  return {
    score,
    price_score: priceScore,
    capacity_score: capacityScore,
    speed_score: transitScore + etaScore,
    availability_score: availabilityScore,
    validation_score: validationScore,
    commercial_score: commercialScore,
    alternative_score: alternativeScore,
    risk_flags: riskFlags,
    badges: []
  };
}

function decisionBadgesForBid(row, laneRows = []) {
  const context = laneDecisionContext(laneRows);
  const decisionRows = laneRows.map((candidate) => ({ row: candidate, decision: procurementDecisionForBid(candidate, laneRows) }));
  const bestScore = decisionRows.length ? Math.max(...decisionRows.map((item) => item.decision.score)) : null;
  const badges = [];
  if (bestScore !== null && procurementDecisionForBid(row, laneRows).score === bestScore) badges.push({ label: "Best overall", tone: "success" });
  if (decisionNumber(row.amount) === context.lowestAmount) badges.push({ label: "Lowest", tone: "success" });
  if (row.invitation.equipment_available === true) badges.push({ label: "Available", tone: "success" });
  if (decisionNumber(row.invitation.weekly_capacity) === context.bestCapacity && context.bestCapacity !== null) badges.push({ label: "Best capacity", tone: "neutral" });
  if (decisionNumber(row.invitation.transit_days) === context.fastestTransit && context.fastestTransit !== null) badges.push({ label: "Fastest transit", tone: "neutral" });
  if (row.invitation.best_alternative_offered) badges.push({ label: "Alternative offered", tone: "warning" });
  const decision = procurementDecisionForBid(row, laneRows);
  if (decision.risk_flags.length) badges.push({ label: "Needs validation", tone: "danger" });
  return badges.slice(0, 6);
}

function decisionBadgeHtml(badge) {
  return `<span class="rfx-decision-badge" data-tone="${escapeHtml(badge.tone || "neutral")}">${escapeHtml(badge.label)}</span>`;
}

function decisionRecommendation(row, rank, laneRows = []) {
  const decision = procurementDecisionForBid(row, laneRows);
  const badges = decisionBadgesForBid(row, laneRows).map((badge) => badge.label);
  const parts = [];
  if (rank === 1) parts.push(`Best overall score ${decision.score}/100`);
  if (badges.includes("Lowest")) parts.push("lowest all-in");
  if (badges.includes("Available")) parts.push("equipment available");
  if (badges.includes("Best capacity")) parts.push("strongest capacity");
  if (badges.includes("Fastest transit")) parts.push("fastest transit");
  if (row.invitation.commercial_model) parts.push(commercialModelLabel(row.invitation.commercial_model));
  if (row.invitation.best_alternative_offered) parts.push("alternative option available");
  if (decision.risk_flags.length) parts.push(`validate: ${decision.risk_flags.slice(0, 2).join(", ")}`);
  return parts.join("; ") || "Procurement decision";
}

function hasBid(invitation) {
  return (invitation.bid_rate !== null
    && invitation.bid_rate !== undefined
    && invitation.bid_rate !== "")
    || ["quoted", "bid_submitted"].includes(String(invitation.invitation_status || "").toLowerCase());
}

function hasInvitationStarted(invitation) {
  return ["invited", "viewed", "responded", "quoted", "bid_submitted", "declined", "awarded"].includes(String(invitation.invitation_status || "").toLowerCase());
}

function selectedOutreachTemplate() {
  return outreachTemplates.find((template) => template.id === rfxOutreachTemplate?.value) || outreachTemplates[0] || null;
}

function selectedOutreachTemplateDraft() {
  const template = selectedOutreachTemplate();
  if (!template) return null;
  if (rfxTemplateEditorTemplateId === template.id && rfxTemplateHtml) {
    return {
      ...template,
      subject: rfxTemplateSubject?.value || "",
      html_body: rfxTemplateHtml.value || "",
      whatsapp_body: rfxTemplateWhatsapp?.value || ""
    };
  }
  return template;
}

function templateSavePayload(template) {
  return {
    name: template?.name || "RFx invitation template",
    channel: template?.channel || rfxOutreachChannel?.value || "multi",
    subject: rfxTemplateSubject?.value || "",
    html_body: rfxTemplateHtml?.value || "",
    whatsapp_body: rfxTemplateWhatsapp?.value || ""
  };
}

function renderRfxTemplateEditor({ force = false } = {}) {
  if (!rfxTemplateEditor || !rfxTemplateHtml) return;
  const template = selectedOutreachTemplate();
  const hasTemplate = Boolean(template);
  rfxTemplateEditor.toggleAttribute("data-empty", !hasTemplate);
  [rfxTemplateSubject, rfxTemplateHtml, rfxTemplateWhatsapp, saveRfxTemplateHtmlButton, resetRfxTemplateHtmlButton].forEach((field) => {
    if (field) field.disabled = !hasTemplate;
  });
  if (!template) {
    rfxTemplateEditorTemplateId = null;
    rfxTemplateEditorDirty = false;
    if (rfxTemplateSubject) rfxTemplateSubject.value = "";
    rfxTemplateHtml.value = "";
    if (rfxTemplateWhatsapp) rfxTemplateWhatsapp.value = "";
    setStatus(rfxTemplateEditorStatus, "Select a template to edit the HTML.", "neutral");
    return;
  }
  if (force || rfxTemplateEditorTemplateId !== template.id || !rfxTemplateEditorDirty) {
    rfxTemplateEditorTemplateId = template.id;
    rfxTemplateEditorDirty = false;
    if (rfxTemplateSubject) rfxTemplateSubject.value = template.subject || "";
    rfxTemplateHtml.value = template.html_body || "";
    if (rfxTemplateWhatsapp) rfxTemplateWhatsapp.value = template.whatsapp_body || "";
    const scope = template.owner_email ? "Editable user template." : "Default template: saving creates your editable copy.";
    setStatus(rfxTemplateEditorStatus, scope, "neutral");
  }
}

function sanitizeEditableTemplate(root) {
  root.querySelectorAll("script, object, embed, iframe").forEach((item) => item.remove());
  root.querySelectorAll("*").forEach((item) => {
    [...item.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "").trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) item.removeAttribute(attribute.name);
      if (name === "contenteditable") item.removeAttribute(attribute.name);
    });
  });
}

function tokenChip(token) {
  const span = document.createElement("span");
  span.className = token === "lane_table" ? "template-token-chip is-block-token" : "template-token-chip";
  span.dataset.templateToken = token;
  span.contentEditable = "false";
  span.textContent = token === "lane_table" ? "Dynamic lane table {{lane_table}}" : `{{${token}}}`;
  return span;
}

function tokenizedHtmlForVisualEditor(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  sanitizeEditableTemplate(template.content);
  const textNodes = [];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const source = node.nodeValue || "";
    if (!/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(source)) return;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token, index) => {
      if (index > lastIndex) fragment.appendChild(document.createTextNode(source.slice(lastIndex, index)));
      fragment.appendChild(tokenChip(token));
      lastIndex = index + match.length;
      return match;
    });
    if (lastIndex < source.length) fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
    node.replaceWith(fragment);
  });
  const container = document.createElement("div");
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML;
}

function htmlFromVisualEditor(element) {
  const template = document.createElement("template");
  template.innerHTML = element?.innerHTML || "";
  template.content.querySelectorAll("[data-template-token]").forEach((item) => {
    const token = item.dataset.templateToken || "";
    item.replaceWith(document.createTextNode(token ? `{{${token}}}` : ""));
  });
  sanitizeEditableTemplate(template.content);
  const container = document.createElement("div");
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML.trim();
}

function templatePlaceholders(template) {
  if (Array.isArray(template?.placeholders) && template.placeholders.length) return template.placeholders;
  const source = [template?.subject, template?.html_body, template?.whatsapp_body].filter(Boolean).join(" ");
  return [...new Set([...source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))];
}

function renderTemplateText(value, context = {}) {
  return String(value || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(context[key] ?? ""));
}

function sameVendorInvitation(left = {}, right = {}) {
  const leftVendor = left.vendors || {};
  const rightVendor = right.vendors || {};
  const leftKey = left.vendor_id || leftVendor.id || leftVendor.domain || leftVendor.primary_email;
  const rightKey = right.vendor_id || rightVendor.id || rightVendor.domain || rightVendor.primary_email;
  return Boolean(leftKey && rightKey && String(leftKey).toLowerCase() === String(rightKey).toLowerCase());
}

function outreachTargetsForCarrier(target) {
  if (!target?.invitation) return [];
  return outreachTargetInvitations().filter((item) => sameVendorInvitation(item.invitation, target.invitation));
}

function laneRowsText(targets = []) {
  return targets.map(({ lane }, index) => [
    `Route ${lane.lane_number || index + 1}: ${lane.origin || "-"} -> ${lane.destination || "-"}`,
    `Equipment: ${[lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-"}`,
    `Operation/Service: ${[lane.operation, lane.service].filter(Boolean).join(" / ") || "-"}`,
    `Volume: ${lane.weekly_volume || "-"} per week`,
    `Target: ${lane.target_rate ? formatMoney(lane.target_rate, lane.currency) : "-"}`
  ].join(" | ")).join("\n");
}

function laneTableHtml(targets = []) {
  if (!targets.length) return "";
  const headerStyle = "background:rgb(31,78,121);color:rgb(255,255,255);border:1px solid rgb(183,201,217);padding:6px 8px;text-align:left;vertical-align:top;line-height:1.15;white-space:nowrap";
  const headerCenterStyle = `${headerStyle};text-align:center`;
  const cellStyle = "border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22";
  const centerCellStyle = `${cellStyle};white-space:nowrap;text-align:center`;
  const quoteCellStyle = `${centerCellStyle};background:rgb(234,243,248);font-weight:700`;
  const bidCellStyle = `${centerCellStyle};background:rgb(255,247,237)`;
  const equipmentLabel = (lane) => [lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-";
  const hazmatTempLabel = (lane) => [
    lane.hazmat ? "Hazmat" : null,
    lane.temperature_controlled ? "Temp Ctrl" : null
  ].filter(Boolean).join(" / ") || "-";
  const rows = targets.map(({ lane }, index) => `
    <tr>
      <td style="${cellStyle};white-space:nowrap">${escapeHtml(lane.lane_number || index + 1)}</td>
      <td style="${cellStyle};white-space:nowrap">${escapeHtml(lane.origin || "-")}<br>${escapeHtml(lane.origin_notes || lane.origin_site || "")}</td>
      <td style="${cellStyle}">${escapeHtml(lane.destination || "-")}<br>${escapeHtml(lane.destination_notes || lane.destination_site || "")}</td>
      <td style="${cellStyle}">${escapeHtml(equipmentLabel(lane))}</td>
      <td style="${cellStyle}">${escapeHtml(hazmatTempLabel(lane))}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.estimated_miles || lane.miles || "-")}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.weekly_volume || "-")}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.load_weight || lane.weight || "-")}</td>
      <td style="${quoteCellStyle}">${escapeHtml(lane.target_rate ? formatMoney(lane.target_rate, lane.currency) : "-")}</td>
      <td style="${bidCellStyle}">Por ofertar</td>
      <td style="${bidCellStyle}">Por estimar</td>
      <td style="${cellStyle}">${escapeHtml(lane.notes || "")}</td>
    </tr>
  `).join("");
  return `
    <table style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;border-collapse:collapse;width:auto;max-width:100%;table-layout:auto;font-size:12px;margin-bottom:14px">
      <thead>
        <tr>
          <th style="${headerStyle}">Route ID</th>
          <th style="${headerStyle}">Origen</th>
          <th style="${headerStyle}">Destino</th>
          <th style="${headerStyle}">Equipment / Trailer / Config</th>
          <th style="${headerStyle}">Hazmat / Temp Ctrl</th>
          <th style="${headerCenterStyle}">Millas<br>estimadas</th>
          <th style="${headerCenterStyle}">Volumen<br>semanal</th>
          <th style="${headerCenterStyle}">Peso<br>por carga</th>
          <th style="${headerCenterStyle}">Rango objetivo<br>inicial</th>
          <th style="${headerCenterStyle}">Tu tarifa</th>
          <th style="${headerCenterStyle}">Tu capacidad<br>semanal</th>
          <th style="${headerStyle}">Notas / Supuestos</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function firstOutreachTarget() {
  return outreachTargetInvitations().find((target) => targetHasChannel(target, rfxOutreachChannel?.value || "multi"))
    || outreachTargetInvitations()[0]
    || null;
}

function sampleOutreachContext(target) {
  const invitation = target?.invitation || {};
  const lane = target?.lane || {};
  const vendor = invitation.vendors || {};
  const carrierTargets = outreachTargetsForCarrier(target);
  return {
    vendor_name: vendor.vendor_name || vendor.domain || "Carrier",
    contact_name: vendor.contact_name || vendor.vendor_name || "team",
    vendor_domain: vendor.domain || "",
    vendor_email: vendor.primary_email || "",
    rfx_id: selectedEvent?.rfx_id || "",
    event_name: selectedEvent?.name || selectedEvent?.rfx_id || "",
    rfx_type: selectedEvent?.event_type || "",
    customer: selectedEvent?.customer || "",
    due_date: selectedEvent?.due_date || "",
    lane_origin: lane.origin || lane.origin_city || "",
    lane_destination: lane.destination || lane.destination_city || "",
    origin_market: lane.origin_market || "",
    destination_market: lane.destination_market || "",
    equipment: lane.equipment || "",
    trailer: lane.trailer || "",
    config: lane.config || "",
    operation: lane.operation || "",
    service: lane.service || "",
    weekly_volume: lane.weekly_volume || "",
    target_rate: lane.target_rate || "",
    currency: lane.currency || "USD",
    lane_count: carrierTargets.length || (target ? 1 : 0),
    lane_table: laneTableHtml(carrierTargets.length ? carrierTargets : target ? [target] : []),
    lane_rows_text: laneRowsText(carrierTargets.length ? carrierTargets : target ? [target] : []),
    bid_link: invitation.invitation_token ? portalUrl(invitation.invitation_token) : `${window.location.origin}/rfx-bid.html?token=preview`
  };
}

function outreachTargetInvitations() {
  const selectedIds = selectedInvitationIds.size ? selectedInvitationIds : null;
  const selectedLaneSet = !selectedIds && selectedLaneIds.size ? selectedLaneIds : null;
  return currentLanes
    .flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })))
    .filter(({ lane, invitation }) => {
      if (selectedIds) return selectedIds.has(invitation.id);
      if (selectedLaneSet) return selectedLaneSet.has(lane.id);
      return true;
    });
}

function targetHasChannel(target, channel) {
  const vendor = target.invitation?.vendors || {};
  if (channel === "email") return Boolean(vendor.primary_email);
  if (channel === "whatsapp") return Boolean(vendor.whatsapp_phone);
  return Boolean(vendor.primary_email || vendor.whatsapp_phone);
}

function renderOutreachTemplateSelect() {
  if (!rfxOutreachTemplate) return;
  const currentValue = rfxOutreachTemplate.value;
  rfxOutreachTemplate.innerHTML = outreachTemplates.length
    ? outreachTemplates.map((template) => `
      <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${template.owner_email ? "" : " (default)"}</option>
    `).join("")
    : "<option value=\"\">No templates available</option>";
  if (currentValue && outreachTemplates.some((template) => template.id === currentValue)) {
    rfxOutreachTemplate.value = currentValue;
  }
}

function renderOutreachPreview() {
  if (!rfxOutreachPreview) return;
  renderRfxTemplateEditor();
  const template = selectedOutreachTemplateDraft();
  const channel = rfxOutreachChannel?.value || "multi";
  const senderEmail = rfxOutreachSender?.value || APPROVED_GMAIL_SENDER;
  const targets = outreachTargetInvitations();
  const ready = targets.filter((target) => targetHasChannel(target, channel)).length;
  const targetScope = selectedInvitationIds.size
    ? `${formatNumber(selectedInvitationIds.size)} selected vendor rows`
    : selectedLaneIds.size
      ? `${formatNumber(selectedLaneIds.size)} selected lanes`
      : "All active shortlist";
  const placeholders = templatePlaceholders(template);
  const previewTarget = firstOutreachTarget();
  const previewContext = sampleOutreachContext(previewTarget);
  if (!template) {
    rfxOutreachPreview.innerHTML = `
      <strong>No template selected.</strong>
      <span>Create an invitation template before launching carrier invitations.</span>
    `;
  } else {
    const renderedSubject = renderTemplateText(template.subject || `${previewContext.rfx_id} invitation`, previewContext);
    const renderedHtml = renderTemplateText(template.html_body || template.whatsapp_body || "", previewContext);
    const renderedWhatsapp = renderTemplateText(template.whatsapp_body || renderedHtml.replace(/<[^>]*>/g, " "), previewContext);
    const visualEditorHtml = tokenizedHtmlForVisualEditor(template.html_body || template.whatsapp_body || "");
    rfxOutreachPreview.innerHTML = `
      <div>
        <span class="status-pill">${escapeHtml(template.channel || "multi")}</span>
        <strong>${escapeHtml(template.name || "Template")}</strong>
        <small>${escapeHtml(renderedSubject || "No email subject")}</small>
      </div>
      <div class="outreach-template-preview-grid">
        <article>
          <span>Draft target</span>
          <strong>${formatNumber(ready)} / ${formatNumber(targets.length)}</strong>
          <small>${escapeHtml(targetScope)}</small>
        </article>
        <article>
          <span>Channel</span>
          <strong>${escapeHtml(channel)}</strong>
        </article>
        <article>
          <span>Send from</span>
          <strong>${escapeHtml(senderEmail)}</strong>
          <small>Draft-only until Gmail is connected</small>
        </article>
      </div>
      <article class="outreach-html-preview">
        <div>
          <span>Email preview</span>
          <strong>${rfxTemplateVisualEditing ? "Editing email preview" : `${escapeHtml(previewContext.vendor_name || "Carrier")} | ${formatNumber(previewContext.lane_count || 0)} lane(s)`}</strong>
          <div class="outreach-preview-actions">
            ${rfxTemplateVisualEditing
              ? `<button class="small-button" type="button" data-rfx-template-save-visual>Save changes</button>
                 <button class="secondary small-button" type="button" data-rfx-template-cancel-visual>Cancel</button>`
              : `<button class="secondary small-button" type="button" data-rfx-template-edit-visual>Edit email</button>`}
          </div>
        </div>
        ${rfxTemplateVisualEditing
          ? `<div id="rfx-email-visual-editor" class="outreach-html-editor-surface" contenteditable="true" spellcheck="true">${visualEditorHtml || "<p>Edit your template here.</p>"}</div>`
          : renderedHtml ? `<iframe sandbox="" srcdoc="${escapeHtml(renderedHtml)}"></iframe>` : `<p>No HTML body configured for this template.</p>`}
      </article>
      <article class="outreach-text-preview">
        <span>WhatsApp / text preview</span>
        <p>${escapeHtml(renderedWhatsapp || "No WhatsApp body configured.")}</p>
      </article>
      <div class="template-token-row">
        ${placeholders.length ? placeholders.slice(0, 12).map((item) => `<span>{{${escapeHtml(item)}}}</span>`).join("") : "<span>No placeholders detected</span>"}
      </div>
    `;
  }
  if (createRfxOutreachCampaignButton) {
    createRfxOutreachCampaignButton.disabled = !selectedEventId || !template || !targets.length || Boolean(launchPreflightIssues().length) || rfxTemplateEditorDirty || rfxTemplateVisualEditing;
  }
  renderWizard();
}

function rfxWizardStats() {
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const targets = outreachTargetInvitations();
  const channel = rfxOutreachChannel?.value || "multi";
  const readyTargets = targets.filter((target) => targetHasChannel(target, channel));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  return {
    lanes: currentLanes.length,
    invitations,
    targets,
    readyTargets,
    bids,
    lanesWithShortlist: currentLanes.filter((lane) => activeInvitations(lane).length).length,
    lanesWithBids: currentLanes.filter((lane) => bidInvitations(lane).length).length
  };
}

function rfxWizardStepState() {
  const stats = rfxWizardStats();
  return [
    { key: "event", label: "Event", complete: Boolean(selectedEvent) },
    { key: "lanes", label: "Book", complete: stats.lanes > 0 },
    { key: "carriers", label: "Participants", complete: stats.invitations.length > 0 },
    { key: "launch", label: "Outreach", complete: stats.invitations.some(hasInvitationStarted) },
    { key: "offers", label: "Auction", complete: stats.bids.length > 0 },
    { key: "award", label: "Award", complete: selectedEvent?.status === "awarded" }
  ];
}

function currentWizardStage() {
  return rfxWizardStepState().find((step) => !step.complete)?.key || "award";
}

function bidRoomWorkflowProgress() {
  const steps = rfxWizardStepState();
  const completeCount = steps.filter((step) => step.complete).length;
  const activeStage = currentWizardStage();
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeStage));
  const percent = steps.length ? Math.round((completeCount / steps.length) * 100) : 0;
  const stats = processStats();
  return {
    steps,
    completeCount,
    activeStage,
    activeIndex,
    percent,
    statusLine: `${formatNumber(completeCount)} / ${formatNumber(steps.length)} workflow step(s) ready`,
    commercialLine: `${formatNumber(stats.lanes)} lane(s) | ${formatNumber(stats.invitations.length)} participant row(s) | ${formatNumber(stats.bids.length)} live bid(s)`
  };
}

function wizardStageView(stage) {
  return {
    event: "setup",
    lanes: "lanes",
    carriers: "carriers",
    preview: "outreach",
    launch: "outreach",
    offers: "responses",
    award: "award"
  }[stage] || "setup";
}

function wizardStageCopy(stage) {
  return {
    event: {
      title: "Create or select the bid room",
      detail: "Define the commercial room once: RFx ID, customer, due date, and visibility. Every lane, invite, chat, bid, and award stays attached here.",
      cta: "Create bid event",
      note: "Room"
    },
    lanes: {
      title: "Import the business book",
      detail: "Upload the lane template so Rateware can build the book, benchmarks, participant coverage, and auction context.",
      cta: "Import book",
      note: "Lanes"
    },
    carriers: {
      title: "Choose the carriers that will participate",
      detail: "Select carriers directly from Carrier CRM or upload the TRUE/FALSE participant catalog. This is the only source for the bid invitation list.",
      cta: "Select participants",
      note: "CRM"
    },
    preview: {
      title: "Review the invitation experience",
      detail: "Preview the carrier email, placeholders, sender, and channel before generating individualized drafts.",
      cta: "Review invites",
      note: "Preview"
    },
    launch: {
      title: "Generate the outreach queue",
      detail: "Create one personalized invitation per selected carrier, then send Gmail messages from the draft queue.",
      cta: "Generate draft queue",
      note: "Invites"
    },
    offers: {
      title: "Run the live auction room",
      detail: "Monitor bids, alternatives, capacity, ETA, chat signals, and leaderboard position in one operating view.",
      cta: "Open auction room",
      note: "Live"
    },
    award: {
      title: "Award and close out",
      detail: "Compare price, capacity, ETA, validation, margin, and risk before moving approved awards back to Rateware.",
      cta: "Open award board",
      note: "Closeout"
    }
  }[stage] || {
    title: "Open Bid Room",
    detail: "Continue the procurement workflow.",
    cta: "Open",
    note: "Bid Room"
  };
}

function wizardActionButton(stage) {
  const actions = {
    event: '<button type="button" data-rfx-focus-create>Create bid room</button>',
    lanes: '<button type="button" data-rfx-wizard-go="lanes">Import business book</button>',
    carriers: '<button type="button" data-rfx-wizard-go="carriers">Select participants</button>',
    preview: '<button type="button" data-rfx-wizard-go="outreach">Review invitations</button>',
    launch: '<button type="button" data-rfx-wizard-create-drafts>Generate draft queue</button>',
    offers: '<button type="button" data-rfx-wizard-go="responses">Open auction room</button>',
    award: '<button type="button" data-rfx-wizard-go="award">Open award board</button>'
  };
  return actions[stage] || actions.event;
}

function renderOpsStageRail() {
  if (!rfxOpsStageRail) return;
  const stage = currentWizardStage();
  const buttons = [...rfxOpsStageRail.querySelectorAll("[data-stage-key]")];
  if (buttons.length) {
    rfxWizardStepState().forEach((step, index) => {
      const button = rfxOpsStageRail.querySelector(`[data-stage-key="${step.key}"]`);
      if (!button) return;
      const copy = wizardStageCopy(step.key);
      const view = wizardStageView(step.key);
      const stateLabel = step.complete ? "Ready" : step.key === stage ? "Next" : "Pending";
      button.classList.toggle("is-complete", step.complete);
      button.classList.toggle("is-next", step.key === stage);
      button.classList.toggle("is-pending", !step.complete && step.key !== stage);
      button.setAttribute("aria-current", step.key === stage ? "step" : "false");
      button.setAttribute("aria-label", `${step.label}: ${stateLabel}. ${copy.title}`);
      button.setAttribute("title", `${copy.title}. ${copy.detail}`);
      button.dataset.rfxWizardGo = view;
      button.querySelector(".stage-index").textContent = String(index + 1);
      button.querySelector(".stage-copy strong").textContent = step.label;
      button.querySelector(".stage-copy small").textContent = `${copy.note} | ${stateLabel}`;
    });
    return;
  }
  rfxOpsStageRail.innerHTML = rfxWizardStepState().map((step, index) => {
    const copy = wizardStageCopy(step.key);
    return `
      <button
        type="button"
        class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-next" : ""}"
        data-rfx-wizard-go="${escapeHtml(wizardStageView(step.key))}"
        aria-current="${step.key === stage ? "step" : "false"}"
      >
        <span class="stage-index">${index + 1}</span>
        <span class="stage-copy"><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(copy.note)}</small></span>
      </button>
    `;
  }).join("");
}

function renderOpsNextAction() {
  if (!rfxOpsNextAction) return;
  const stage = currentWizardStage();
  const copy = wizardStageCopy(stage);
  const progress = bidRoomWorkflowProgress();
  const nextStepNumber = progress.activeIndex + 1;
  rfxOpsNextAction.dataset.stage = stage;
  rfxOpsNextAction.dataset.ready = progress.percent >= 100 ? "true" : "false";
  rfxOpsNextAction.innerHTML = `
    <div class="bid-room-next-head">
      <span>Command center</span>
      <b>${formatNumber(progress.percent)}%</b>
    </div>
    <div class="bid-room-workflow-meter" aria-label="${escapeHtml(progress.statusLine)}">
      <i style="width: ${progress.percent}%"></i>
    </div>
    <strong>Step ${formatNumber(nextStepNumber)}: ${escapeHtml(copy.title)}</strong>
    <small>${escapeHtml(copy.detail)}</small>
    <div class="bid-room-next-meta">
      <span>${escapeHtml(progress.statusLine)}</span>
      <span>${escapeHtml(progress.commercialLine)}</span>
    </div>
    <div class="bid-room-next-actions">
      ${wizardActionButton(stage)}
    </div>
  `;
}

function processStats() {
  const stats = rfxWizardStats();
  const startedInvitations = stats.invitations.filter(hasInvitationStarted);
  const lanesWithInvites = currentLanes.filter((lane) => activeInvitations(lane).some(hasInvitationStarted)).length;
  return {
    ...stats,
    startedInvitations,
    lanesWithInvites,
    shortlistCoverage: currentLanes.length ? Math.round((stats.lanesWithShortlist / currentLanes.length) * 100) : 0,
    inviteCoverage: currentLanes.length ? Math.round((lanesWithInvites / currentLanes.length) * 100) : 0,
    bidCoverage: currentLanes.length ? Math.round((stats.lanesWithBids / currentLanes.length) * 100) : 0,
    responseRate: stats.invitations.length ? Math.round((stats.bids.length / stats.invitations.length) * 100) : 0
  };
}

function readinessLabel(status) {
  return {
    ready: "Ready",
    attention: "Needs review",
    blocker: "Blocked"
  }[status] || "Needs review";
}

function readinessActionButton(action, label = "Open") {
  if (!action) return "";
  return `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function bidRoomReadinessSnapshot() {
  const stats = processStats();
  const channel = rfxOutreachChannel?.value || "multi";
  const template = selectedOutreachTemplateDraft();
  const drafts = draftRowsForEvent();
  const sendableDrafts = selectableEmailDrafts(drafts);
  const lanesMissingShortlist = currentLanes.filter((lane) => !activeInvitations(lane).length).length;
  const lanesMissingInvite = currentLanes.filter((lane) => activeInvitations(lane).length && !activeInvitations(lane).some(hasInvitationStarted)).length;
  const targetsMissingChannel = Math.max(0, stats.targets.length - stats.readyTargets.length);
  const awardSnapshot = awardReadinessSnapshot();
  const primaryAwards = awardSnapshot.lanes.reduce((sum, { bids }) => sum + bids.filter((row) => row.invitation.award_role === "primary").length, 0);
  const checks = [
    {
      key: "event",
      label: "Event",
      status: selectedEvent ? "ready" : "blocker",
      metric: selectedEvent?.rfx_id || "-",
      detail: selectedEvent ? `${selectedEvent.status || "draft"} | ${selectedEvent.due_date || "No due date"}` : "Create or select a bid event.",
      action: "setup"
    },
    {
      key: "lanes",
      label: "Business book",
      status: stats.lanes > 0 ? "ready" : "blocker",
      metric: formatNumber(stats.lanes),
      detail: stats.lanes ? `${formatNumber(stats.lanes)} lane(s) loaded.` : "Upload the RFx lane template.",
      action: "lanes"
    },
    {
      key: "participants",
      label: "Participants",
      status: stats.invitations.length ? lanesMissingShortlist ? "attention" : "ready" : "blocker",
      metric: formatNumber(stats.invitations.length),
      detail: stats.invitations.length
        ? lanesMissingShortlist ? `${formatNumber(lanesMissingShortlist)} lane(s) still need carriers.` : "All lanes have at least one carrier."
        : "Select carriers from CRM or participant template.",
      action: "carriers"
    },
    {
      key: "contacts",
      label: "Contactability",
      status: stats.targets.length ? targetsMissingChannel === stats.targets.length ? "blocker" : targetsMissingChannel ? "attention" : "ready" : "blocker",
      metric: `${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)}`,
      detail: stats.targets.length
        ? targetsMissingChannel === stats.targets.length
          ? `No targets have usable ${channel} contact data.`
          : targetsMissingChannel ? `${formatNumber(targetsMissingChannel)} target(s) missing ${channel} contact data.` : "Targets have usable contact channel."
        : "Add participants before invite QA.",
      action: "carriers"
    },
    {
      key: "template",
      label: "Invite template",
      status: template ? "ready" : "blocker",
      metric: template ? "Selected" : "-",
      detail: template ? template.name || "Template ready." : "Select an invitation template.",
      action: "outreach"
    },
    {
      key: "drafts",
      label: "Draft queue",
      status: drafts.length ? sendableDrafts.length ? "ready" : "attention" : "attention",
      metric: formatNumber(drafts.length),
      detail: drafts.length
        ? `${formatNumber(sendableDrafts.length)} email draft(s) sendable.`
        : "Generate individualized invitation drafts.",
      action: "outreach"
    },
    {
      key: "launch",
      label: "Invite launch",
      status: stats.startedInvitations.length ? lanesMissingInvite ? "attention" : "ready" : "attention",
      metric: formatNumber(stats.startedInvitations.length),
      detail: stats.startedInvitations.length
        ? lanesMissingInvite ? `${formatNumber(lanesMissingInvite)} shortlisted lane(s) still need invite launch.` : "Invitations have started."
        : "Send or mark invitations before waiting for bids.",
      action: "outreach"
    },
    {
      key: "bids",
      label: "Live bids",
      status: stats.bids.length ? "ready" : "attention",
      metric: formatNumber(stats.bids.length),
      detail: stats.bids.length ? `${formatNumber(stats.lanesWithBids)} lane(s) have bids.` : "No carrier bids received yet.",
      action: "responses"
    },
    {
      key: "award",
      label: "Award closeout",
      status: primaryAwards ? awardSnapshot.missingPrimary.length ? "attention" : "ready" : "attention",
      metric: `${formatNumber(primaryAwards)} / ${formatNumber(awardSnapshot.lanes.length)}`,
      detail: awardSnapshot.lanes.length
        ? primaryAwards ? `${formatNumber(awardSnapshot.missingPrimary.length)} lane(s) still missing primary award.` : "Review live bids before award."
        : "Awards unlock after bids are received.",
      action: "award"
    }
  ];
  return {
    checks,
    blockers: checks.filter((check) => check.status === "blocker"),
    warnings: checks.filter((check) => check.status === "attention"),
    ready: checks.filter((check) => check.status === "ready")
  };
}

function readinessReportLines(snapshot = bidRoomReadinessSnapshot()) {
  const header = selectedEvent
    ? `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || "Bid Room"}`
    : "Bid Room | No event selected";
  const stats = processStats();
  return [
    header,
    `Status: ${selectedEvent?.status || "-"} | Customer: ${selectedEvent?.customer || "-"} | Due: ${selectedEvent?.due_date || "-"}`,
    `Lanes: ${formatNumber(stats.lanes)} | Participants: ${formatNumber(stats.invitations.length)} | Invite targets: ${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)} | Bids: ${formatNumber(stats.bids.length)}`,
    `QA: ${formatNumber(snapshot.ready.length)} ready | ${formatNumber(snapshot.warnings.length)} warning(s) | ${formatNumber(snapshot.blockers.length)} blocker(s)`,
    "",
    ...snapshot.checks.map((check) => `${readinessLabel(check.status)} | ${check.label}: ${check.metric} | ${check.detail}`)
  ];
}

async function copyReadinessReport() {
  const lines = readinessReportLines();
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    setStatus(actionStatus, "Bid Room QA report copied.", "success");
  } catch (_error) {
    setStatus(actionStatus, lines.join(" | "), "neutral");
  }
}

function launchPreflightIssues() {
  const launchRequiredKeys = new Set(["event", "lanes", "participants", "contacts", "template"]);
  const snapshot = bidRoomReadinessSnapshot();
  return snapshot.checks.filter((check) => launchRequiredKeys.has(check.key) && check.status === "blocker");
}

function blockIfLaunchPreflightFails(statusElement = rfxOutreachStatus) {
  const issues = launchPreflightIssues();
  if (!issues.length) return false;
  const firstIssue = issues[0];
  activateWorkbenchView(firstIssue.action || "setup", {
    setup: "#rfx-id",
    lanes: "#rfx-lane-template-file",
    carriers: "#manual-shortlist-search",
    outreach: "#rfx-outreach-template"
  }[firstIssue.action] || null);
  setStatus(statusElement, `Launch blocked: ${firstIssue.label}. ${firstIssue.detail}`, "error");
  renderBidRoomLaunchReadiness();
  return true;
}

function openFirstReadinessIssue() {
  const snapshot = bidRoomReadinessSnapshot();
  const issue = snapshot.blockers[0] || snapshot.warnings[0];
  if (!issue) {
    setStatus(actionStatus, "No launch blockers detected.", "success");
    return;
  }
  activateWorkbenchView(issue.action || "setup", {
    setup: "#rfx-id",
    lanes: "#rfx-lane-template-file",
    carriers: "#manual-shortlist-search",
    outreach: "#rfx-outreach-template",
    responses: "#rfx-response-body",
    award: "#rfx-award-board"
  }[issue.action] || null);
  setStatus(actionStatus, `${issue.label}: ${issue.detail}`, issue.status === "blocker" ? "error" : "neutral");
}

function renderBidRoomLaunchReadiness() {
  if (!rfxLaunchReadiness) return;
  const snapshot = bidRoomReadinessSnapshot();
  const launchReady = Boolean(selectedEvent) && !snapshot.blockers.length;
  const nextIssue = snapshot.blockers[0] || snapshot.warnings[0];
  rfxLaunchReadiness.innerHTML = `
    <div class="bid-room-readiness-header">
      <div>
        <p class="eyebrow">Operating checklist</p>
        <h3>${launchReady ? "Bid Room can operate" : "Bid Room needs setup"}</h3>
        <small>${launchReady
          ? `${formatNumber(snapshot.warnings.length)} item(s) need monitoring, but no launch blockers remain.`
          : nextIssue ? nextIssue.detail : "Select a bid event to inspect readiness."}</small>
      </div>
      <div class="bid-room-readiness-actions">
        <span class="status-pill" data-tone="${launchReady ? "success" : snapshot.blockers.length ? "danger" : "warning"}">
          ${launchReady ? "Operational" : snapshot.blockers.length ? `${formatNumber(snapshot.blockers.length)} blocker(s)` : `${formatNumber(snapshot.warnings.length)} warning(s)`}
        </span>
        <button class="secondary small-button" type="button" data-rfx-readiness-first-issue ${nextIssue ? "" : "disabled"}>Open first issue</button>
        <button class="secondary small-button" type="button" data-rfx-copy-readiness>Copy QA report</button>
      </div>
    </div>
    <div class="bid-room-readiness-grid">
      ${snapshot.checks.map((check) => `
        <article data-readiness="${escapeHtml(check.status)}">
          <span>${escapeHtml(check.label)}</span>
          <strong>${escapeHtml(check.metric)}</strong>
          <small>${escapeHtml(check.detail)}</small>
          <div>
            <b>${escapeHtml(readinessLabel(check.status))}</b>
            ${readinessActionButton(check.action)}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function managerStageAction(stepKey) {
  if (stepKey === "carriers") {
    return `<button class="secondary small-button" type="button" data-rfx-wizard-go="carriers" ${selectedEventId ? "" : "disabled"}>Select participants</button>`;
  }
  if (stepKey === "launch") {
    return `<button class="small-button" type="button" data-rfx-wizard-create-drafts ${selectedEventId ? "" : "disabled"}>Generate invitations</button>`;
  }
  return `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(wizardStageView(stepKey))}">${escapeHtml(wizardStageCopy(stepKey).cta)}</button>`;
}

function renderProcessFlow() {
  if (!rfxManagerFlow) return;
  const stage = currentWizardStage();
  const stats = processStats();
  const stageMeta = {
    event: selectedEvent ? `${selectedEvent.status || "draft"} | ${selectedEvent.due_date || "No due date"}` : "No event selected",
    lanes: `${formatNumber(stats.lanes)} lane(s)`,
    carriers: `${formatNumber(stats.lanesWithShortlist)} / ${formatNumber(stats.lanes)} lane(s) covered`,
    preview: `${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)} contact-ready`,
    launch: `${formatNumber(stats.startedInvitations.length)} sent/started`,
    offers: `${formatNumber(stats.bids.length)} bid(s)`
  };
  rfxManagerFlow.innerHTML = rfxWizardStepState().map((step, index) => {
    const copy = wizardStageCopy(step.key);
    return `
      <article class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-active" : ""}">
        <div>
          <span>${index + 1}</span>
          <strong>${escapeHtml(step.label)}</strong>
        </div>
        <p>${escapeHtml(copy.title)}</p>
        <small>${escapeHtml(stageMeta[step.key] || copy.note)}</small>
        ${managerStageAction(step.key)}
      </article>
    `;
  }).join("");
}

function renderProcessFocus() {
  if (!rfxManagerFocus) return;
  const stats = processStats();
  const stage = currentWizardStage();
  const copy = wizardStageCopy(stage);
  if (!selectedEvent) {
    rfxManagerFocus.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Bid Room process",
      title: "Select or create a bid event",
      detail: "The event list stays on the left. Once an event is selected, this board shows the process, next action, lane coverage, invitations, and bids.",
      actionButton: '<button type="button" data-rfx-focus-create>Create bid event</button>'
    });
    return;
  }
  rfxManagerFocus.innerHTML = `
    <article class="rfx-manager-next">
      <div>
        <p class="eyebrow">Current priority</p>
        <h3>${escapeHtml(copy.title)}</h3>
        <p>${escapeHtml(copy.detail)}</p>
      </div>
      <div class="action-row">
        ${wizardActionButton(stage)}
        <button class="secondary small-button" type="button" data-rfx-wizard-go="lanes">Book</button>
        <button class="secondary small-button" type="button" data-rfx-wizard-go="outreach">Invites</button>
        <button class="secondary small-button" type="button" data-rfx-wizard-go="responses">Bids</button>
      </div>
    </article>
    <div class="rfx-manager-kpis">
      <article><span>Shortlist</span><strong>${formatNumber(stats.shortlistCoverage)}%</strong><small>${formatNumber(stats.lanesWithShortlist)} of ${formatNumber(stats.lanes)} lanes</small></article>
      <article><span>Invite ready</span><strong>${formatNumber(stats.readyTargets.length)}</strong><small>${formatNumber(stats.targets.length)} active targets</small></article>
      <article><span>Invited</span><strong>${formatNumber(stats.startedInvitations.length)}</strong><small>${formatNumber(stats.inviteCoverage)}% lane invite coverage</small></article>
      <article><span>Bids</span><strong>${formatNumber(stats.bids.length)}</strong><small>${formatNumber(stats.responseRate)}% response rate</small></article>
    </div>
  `;
}

function processQueueItems() {
  const stats = processStats();
  return [
    {
      done: Boolean(selectedEvent),
      title: "Event setup",
      detail: selectedEvent ? `${selectedEvent.rfx_id || "RFx"} is selected.` : "Create or select the bid event.",
      action: "manager"
    },
    {
      done: stats.lanes > 0,
      title: "Business book",
      detail: stats.lanes ? `${formatNumber(stats.lanes)} lane(s) loaded.` : "Load lanes before selecting carriers.",
      action: "lanes"
    },
    {
      done: stats.invitations.length > 0,
      title: "Bid participants",
      detail: stats.invitations.length ? `${formatNumber(stats.invitations.length)} carrier participant row(s) selected.` : "Select carriers from CRM or upload the participant catalog.",
      action: "carriers"
    },
    {
      done: stats.readyTargets.length > 0,
      title: "Invitation readiness",
      detail: `${formatNumber(stats.readyTargets.length)} of ${formatNumber(stats.targets.length)} target(s) have a usable channel.`,
      action: "outreach"
    },
    {
      done: stats.startedInvitations.length > 0,
      title: "Invitation launch",
      detail: stats.startedInvitations.length ? `${formatNumber(stats.startedInvitations.length)} invite(s) started.` : "Generate drafts and mark invites as sent.",
      action: "outreach",
      special: "drafts"
    },
    {
      done: stats.bids.length > 0,
      title: "Live bid monitoring",
      detail: stats.bids.length ? `${formatNumber(stats.bids.length)} live bid(s) received.` : "Monitor responses and compare bids against Rateware.",
      action: "responses"
    }
  ];
}

function renderProcessQueue() {
  if (!rfxManagerQueue) return;
  const items = processQueueItems();
  const openItems = items.filter((item) => !item.done);
  rfxManagerQueue.innerHTML = `
    <div class="section-heading compact">
      <p class="eyebrow">Work queue</p>
      <h3>${openItems.length ? `${formatNumber(openItems.length)} action(s) pending` : "Process ready for bids"}</h3>
    </div>
    <div class="rfx-manager-task-list">
      ${items.map((item) => `
        <article class="${item.done ? "is-done" : ""}">
          <span>${item.done ? "Done" : "Next"}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.detail)}</small>
          ${item.special === "shortlist"
            ? `<button class="secondary small-button" type="button" data-rfx-wizard-auto-shortlist ${currentLanes.length ? "" : "disabled"}>Build shortlist</button>`
            : item.special === "drafts"
              ? `<button class="small-button" type="button" data-rfx-wizard-create-drafts ${selectedEventId ? "" : "disabled"}>Generate invitations</button>`
              : `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(item.action)}">Open</button>`}
        </article>
      `).join("")}
    </div>
  `;
}

function renderProcessManager() {
  renderProcessFlow();
  renderProcessFocus();
  renderProcessQueue();
}

function renderWizardSteps() {
  if (!wizardSteps) return;
  const stage = currentWizardStage();
  wizardSteps.innerHTML = rfxWizardStepState().map((step, index) => `
    <article class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-active" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(step.label)}</strong>
    </article>
  `).join("");
}

function renderWizardPreview() {
  if (!wizardPreview) return;
  const template = selectedOutreachTemplateDraft();
  const target = firstOutreachTarget();
  const context = sampleOutreachContext(target);
  const subject = template ? renderTemplateText(template.subject || `${context.rfx_id} invitation`, context) : "No template selected";
  const htmlBody = template ? renderTemplateText(template.html_body || template.whatsapp_body || "", context) : "";
  const whatsappText = template ? renderTemplateText(template.whatsapp_body || htmlBody.replace(/<[^>]*>/g, " "), context) : "";
  const channel = rfxOutreachChannel?.value || "multi";
  wizardPreview.innerHTML = `
    <div class="split-heading compact">
      <div>
        <p class="eyebrow">Invite preview</p>
        <h3>${escapeHtml(template?.name || "No template selected")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(channel)}</span>
    </div>
    <div class="rfx-preview-meta">
      <span>To: ${escapeHtml(context.vendor_name)}</span>
      <span>Lane: ${escapeHtml(context.lane_origin || "-")} -> ${escapeHtml(context.lane_destination || "-")}</span>
      <span>Link: ${escapeHtml(context.bid_link)}</span>
    </div>
    <article class="rfx-email-preview-card">
      <span>Subject</span>
      <strong>${escapeHtml(subject)}</strong>
      ${htmlBody ? `<iframe sandbox="" srcdoc="${escapeHtml(htmlBody)}"></iframe>` : `<p>${escapeHtml(whatsappText || "Select a template and shortlist at least one vendor to preview the invitation.")}</p>`}
    </article>
    <article class="rfx-email-preview-card">
      <span>WhatsApp</span>
      <p>${escapeHtml(whatsappText || "No WhatsApp draft configured.")}</p>
    </article>
  `;
}

function renderWizard() {
  renderWizardSteps();
  renderWizardPreview();
  renderOpsStageRail();
  renderOpsNextAction();
  renderProcessManager();
  if (!wizardPrimary) return;
  const stats = rfxWizardStats();
  const stage = currentWizardStage();
  const nextCopy = wizardStageCopy(stage);
  wizardPrimary.innerHTML = `
    <article class="rfx-wizard-next">
      <p class="eyebrow">Next best action</p>
      <h3>${escapeHtml(nextCopy.title)}</h3>
      <p>${escapeHtml(nextCopy.detail)}</p>
      <div class="action-row">
        ${wizardActionButton(stage)}
        <button class="secondary" type="button" data-rfx-wizard-go="manager">Open process</button>
      </div>
    </article>
    <div class="rfx-wizard-scoreboard">
      <article><span>Selected event</span><strong>${escapeHtml(selectedEvent?.rfx_id || "-")}</strong><small>${escapeHtml(selectedEvent?.name || "No event selected")}</small></article>
      <article><span>Lanes</span><strong>${formatNumber(stats.lanes)}</strong><small>${formatNumber(stats.lanesWithShortlist)} with shortlist</small></article>
      <article><span>Invite targets</span><strong>${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)}</strong><small>ready by selected channel</small></article>
      <article><span>Live bids</span><strong>${formatNumber(stats.bids.length)}</strong><small>${formatNumber(stats.lanesWithBids)} lane(s) with bids</small></article>
    </div>
    <section class="rfx-wizard-offer-strip">
      ${liveOfferCards(5) || "<article>No bids yet. Once carriers submit through the Private Bid Room, offers appear here.</article>"}
    </section>
  `;
}

function liveOfferRows() {
  return currentLanes.flatMap((lane) => bidInvitations(lane)
    .map((invitation) => ({
      lane,
      invitation,
      amount: Number(invitation.bid_rate),
      currency: invitation.currency || lane.currency || "USD"
    }))
    .filter((row) => Number.isFinite(row.amount)));
}

function liveOfferCards(limit = 12) {
  return liveOfferRows()
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit)
    .map((row, index) => `
      <article>
        <span>#${index + 1} ${escapeHtml(row.lane.lane_number || "")}</span>
        <strong>${formatMoney(row.amount, row.currency)}</strong>
        <small>${escapeHtml(vendorLabel(row.invitation))} | ${escapeHtml(laneRoute(row.lane))}</small>
      </article>
    `).join("");
}

function renderLiveOfferManager() {
  if (!liveOfferManager) return;
  const rows = liveOfferRows();
  if (!rows.length) {
    liveOfferManager.innerHTML = "<article>No live bids yet. Carrier portal submissions will appear here as ranked offers.</article>";
    return;
  }
  const byLane = new Map();
  rows.forEach((row) => {
    const bucket = byLane.get(row.lane.id) || [];
    bucket.push(row);
    byLane.set(row.lane.id, bucket);
  });
  liveOfferManager.innerHTML = [...byLane.values()].map((laneRows) => {
    const scoredRows = laneRows.map((row) => ({
      ...row,
      decision: procurementDecisionForBid(row, laneRows),
      decision_badges: decisionBadgesForBid(row, laneRows)
    }));
    const sorted = scoredRows.sort((a, b) => b.decision.score - a.decision.score || a.amount - b.amount);
    const best = sorted[0];
    const cheapest = [...scoredRows].sort((a, b) => a.amount - b.amount)[0];
    const amounts = scoredRows.map((row) => row.amount);
    const spread = amounts.length > 1 ? Math.max(...amounts) - Math.min(...amounts) : 0;
    return `
      <section class="live-offer-lane">
        <div>
          <span class="status-pill success">${formatNumber(sorted.length)} bid(s)</span>
          <strong>${escapeHtml(laneRoute(best.lane))}</strong>
          <small>Best overall ${escapeHtml(vendorLabel(best.invitation))} (${best.decision.score}/100) | Lowest ${formatMoney(cheapest.amount, cheapest.currency)} | Spread ${formatMoney(spread, best.currency)}</small>
        </div>
        <table>
          <thead><tr><th>Rank</th><th>Carrier</th><th>Score</th><th>Bid</th><th>Commercial</th><th>Availability</th><th>Capacity</th><th>Transit</th><th>Status</th></tr></thead>
          <tbody>
            ${sorted.map((row, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>${escapeHtml(vendorLabel(row.invitation))}</td>
                <td><span class="rfx-decision-score">${escapeHtml(row.decision.score)}</span></td>
                <td>${formatMoney(row.amount, row.currency)}</td>
                <td>${escapeHtml(offerCommercialSummary(row.invitation))}</td>
                <td>${escapeHtml(offerAvailabilitySummary(row.invitation))}</td>
                <td>${escapeHtml(row.invitation.weekly_capacity ?? "-")}</td>
                <td>${escapeHtml(row.invitation.transit_days ?? "-")}</td>
                <td>${statusChip(row.invitation.invitation_status || "quoted")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }).join("");
}

function awardRoleLabel(role) {
  return {
    primary: "Primary",
    backup: "Backup"
  }[String(role || "").toLowerCase()] || "";
}

function awardRoleChip(invitation) {
  const role = String(invitation.award_role || "").toLowerCase();
  if (!role) return '<span class="status-pill muted">Open</span>';
  return `<span class="status-pill ${role === "primary" ? "success" : "neutral"}">${escapeHtml(awardRoleLabel(role))}</span>`;
}

function awardReasonDefault(row, rank) {
  const parts = [];
  if (rank === 1) parts.push("Best all-in");
  if (Number.isFinite(Number(row.invitation.bid_delta))) {
    const delta = Number(row.invitation.bid_delta);
    parts.push(delta <= 0 ? "Below Rateware benchmark" : "Accepted vs benchmark");
  }
  if (row.invitation.commercial_model) parts.push(commercialModelLabel(row.invitation.commercial_model));
  if (row.invitation.equipment_available === true) parts.push("Equipment available");
  if (row.invitation.best_alternative_offered) parts.push("Best alternative available");
  if (row.invitation.weekly_capacity) parts.push(`Capacity ${row.invitation.weekly_capacity}/wk`);
  if (row.invitation.transit_days) parts.push(`Transit ${row.invitation.transit_days} day(s)`);
  return parts.join("; ") || "Procurement decision";
}

function awardLaneRows() {
  return currentLanes
    .map((lane) => {
      const rawBids = bidInvitations(lane)
        .map((invitation) => ({
          lane,
          invitation,
          amount: Number(invitation.bid_rate),
          currency: invitation.currency || lane.currency || "USD"
        }))
        .filter((row) => Number.isFinite(row.amount));
      const bids = rawBids
        .map((row) => ({
          ...row,
          decision: procurementDecisionForBid(row, rawBids),
          decision_badges: decisionBadgesForBid(row, rawBids)
        }))
        .sort((a, b) => b.decision.score - a.decision.score || a.amount - b.amount);
      return { lane, bids };
    })
    .filter((row) => row.bids.length);
}

function awardNoticeDraftRows() {
  if (!selectedEventId) return [];
  return outreachMessages.filter((message) => {
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    return message.rfx_event_id === selectedEventId && metadata.notice_type === "rfx_award_closeout";
  });
}

function sendableAwardNoticeIds(rows = awardNoticeDraftRows()) {
  return rows
    .filter((message) => {
      const status = String(message.status || "").toLowerCase();
      return message.channel === "email" && Boolean(message.recipient_email) && ["drafted", "queued", "failed"].includes(status);
    })
    .map((message) => String(message.id));
}

function awardNoticeOutcome(message) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const summary = metadata.award_summary && typeof metadata.award_summary === "object" ? metadata.award_summary : {};
  if (Number(summary.awarded || 0) > 0) return "Award";
  if (Number(summary.backup || 0) > 0) return "Backup";
  if (Number(summary.not_awarded || 0) > 0) return "Not awarded";
  return "Closeout";
}

function awardNoticeOutcomeTone(outcome, status) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "failed") return "danger";
  if (normalizedStatus === "sent") return "success";
  if (outcome === "Award") return "success";
  if (outcome === "Backup") return "neutral";
  if (outcome === "Not awarded") return "muted";
  return "neutral";
}

function renderAwardNoticeQueue(rows = awardNoticeDraftRows()) {
  if (!rfxAwardNoticeQueue) return;
  if (!selectedEventId) {
    rfxAwardNoticeQueue.innerHTML = "Select a bid event to review closeout notices.";
    return;
  }
  if (!rows.length) {
    rfxAwardNoticeQueue.innerHTML = "Generate notices to review carrier closeout messages.";
    return;
  }
  const visibleRows = rows.slice(0, 8);
  rfxAwardNoticeQueue.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Carrier</th>
          <th>Outcome</th>
          <th>Status</th>
          <th>Recipient</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${visibleRows.map((message) => {
          const outcome = awardNoticeOutcome(message);
          const status = String(message.status || "drafted").toLowerCase();
          const openUrl = message.channel === "email" ? message.gmail_compose_url : message.whatsapp_url;
          return `
            <tr>
              <td>
                <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
                <small>${escapeHtml(message.subject || message.outreach_campaigns?.name || "Award notice")}</small>
              </td>
              <td><span class="status-pill ${awardNoticeOutcomeTone(outcome, status)}">${escapeHtml(outcome)}</span></td>
              <td><span class="status-pill ${status === "sent" ? "success" : status === "failed" ? "danger" : status === "archived" ? "muted" : "neutral"}">${escapeHtml(status)}</span></td>
              <td>${escapeHtml(messageRecipient(message) || "-")}</td>
              <td>
                <div class="compact-actions">
                  <button class="secondary small-button" type="button" data-rfx-open-award-notice="${escapeHtml(openUrl || "")}" ${openUrl ? "" : "disabled"}>Open</button>
                  <button class="secondary small-button" type="button" data-rfx-mark-award-notice="${escapeHtml(message.id)}" data-rfx-award-notice-status="queued" ${status === "queued" || status === "sent" || status === "archived" ? "disabled" : ""}>Queue</button>
                  <button class="secondary small-button" type="button" data-rfx-mark-award-notice="${escapeHtml(message.id)}" data-rfx-award-notice-status="archived" ${status === "archived" ? "disabled" : ""}>Archive</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    ${rows.length > visibleRows.length ? `<p>Showing ${formatNumber(visibleRows.length)} of ${formatNumber(rows.length)} closeout notice(s).</p>` : ""}
  `;
}

function recommendedAwardCandidates() {
  return awardLaneRows()
    .map(({ lane, bids }) => {
      const hasPrimary = bids.some((row) => row.invitation.award_role === "primary");
      return {
        lane,
        bids,
        recommended: bids[0],
        hasPrimary
      };
    })
    .filter((row) => !row.hasPrimary && row.recommended?.invitation?.id);
}

function awardReadinessSnapshot() {
  const lanes = awardLaneRows();
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const primary = invitations.filter((item) => item.award_role === "primary");
  const pendingCloseout = primary.filter((item) => !item.rate_staging_id);
  const noticeRows = awardNoticeDraftRows();
  const sendable = sendableAwardNoticeIds(noticeRows);
  const missingPrimary = lanes.filter(({ bids }) => !bids.some((row) => row.invitation.award_role === "primary"));
  const riskFlags = lanes.reduce((sum, { bids }) => sum + (bids[0]?.decision?.risk_flags?.length || 0), 0);
  const weakRecommended = lanes.filter(({ bids }) => Number(bids[0]?.decision?.score || 0) < 55);
  return {
    lanes,
    primary,
    pendingCloseout,
    noticeRows,
    sendable,
    missingPrimary,
    riskFlags,
    weakRecommended,
    recommendations: recommendedAwardCandidates()
  };
}

function awardPreflightIssues(action = "closeout") {
  const snapshot = awardReadinessSnapshot();
  const issues = [];
  if (!selectedEventId) {
    issues.push({ key: "event", label: "No bid event selected", detail: "Select a bid event before award closeout." });
    return issues;
  }
  if ((action === "closeout" || action === "generate_notices") && !snapshot.lanes.length) {
    issues.push({ key: "bids", label: "No carrier bids", detail: "Capture carrier bids before making award decisions." });
  }
  if ((action === "closeout" || action === "generate_notices") && !snapshot.primary.length) {
    issues.push({ key: "primary", label: "No primary awards", detail: "Award at least one carrier as primary before closeout." });
  }
  if ((action === "closeout" || action === "generate_notices") && snapshot.missingPrimary.length) {
    issues.push({
      key: "incomplete_awards",
      label: "Incomplete lane awards",
      detail: `${formatNumber(snapshot.missingPrimary.length)} lane(s) with bids still need a primary award.`
    });
  }
  if (action === "closeout" && !snapshot.pendingCloseout.length) {
    issues.push({ key: "closeout", label: "No Rateware closeout pending", detail: "Primary awards already have Rateware rows or no primary awards are available." });
  }
  if (action === "send_notices" && !snapshot.sendable.length) {
    issues.push({ key: "notices", label: "No sendable notices", detail: "Generate award notice drafts before sending Gmail messages." });
  }
  return issues;
}

function blockIfAwardPreflightFails(action = "closeout", statusElement = rfxAwardStatus) {
  const issues = awardPreflightIssues(action);
  if (!issues.length) return false;
  const firstIssue = issues[0];
  activateWorkbenchView("award");
  setStatus(statusElement, `Award action blocked: ${firstIssue.label}. ${firstIssue.detail}`, "error");
  renderAwardReadiness();
  updateAwardNoticeControls();
  return true;
}

function renderAwardReadiness() {
  if (!rfxAwardReadiness) return;
  if (!selectedEventId) {
    rfxAwardReadiness.innerHTML = "Select a bid event to inspect closeout readiness.";
    if (rfxApplyRecommendedAwardsButton) rfxApplyRecommendedAwardsButton.disabled = true;
    return;
  }
  const snapshot = awardReadinessSnapshot();
  const lanesCount = snapshot.lanes.length;
  const awardedCount = snapshot.primary.length;
  const decisionTone = lanesCount && !snapshot.missingPrimary.length ? "success" : lanesCount ? "warning" : "neutral";
  const riskTone = snapshot.weakRecommended.length || snapshot.riskFlags ? "warning" : "success";
  const closeoutTone = snapshot.pendingCloseout.length ? "warning" : snapshot.primary.length ? "success" : "neutral";
  const noticesTone = snapshot.sendable.length ? "warning" : snapshot.noticeRows.length ? "success" : "neutral";
  if (rfxApplyRecommendedAwardsButton) {
    rfxApplyRecommendedAwardsButton.disabled = !snapshot.recommendations.length;
    rfxApplyRecommendedAwardsButton.textContent = snapshot.recommendations.length
      ? `Award ${formatNumber(snapshot.recommendations.length)} recommended`
      : "Award recommended";
  }
  rfxAwardReadiness.innerHTML = `
    <div class="rfx-award-readiness-grid">
      <span data-tone="${decisionTone}"><b>${formatNumber(awardedCount)} / ${formatNumber(lanesCount)}</b> lanes awarded</span>
      <span data-tone="${riskTone}"><b>${formatNumber(snapshot.riskFlags)}</b> top-choice risk flag(s)</span>
      <span data-tone="${closeoutTone}"><b>${formatNumber(snapshot.pendingCloseout.length)}</b> Rateware closeout pending</span>
      <span data-tone="${noticesTone}"><b>${formatNumber(snapshot.sendable.length)}</b> notice email(s) ready</span>
    </div>
    ${snapshot.weakRecommended.length ? `<p>${formatNumber(snapshot.weakRecommended.length)} lane(s) have weak recommended scores. Review before applying awards in bulk.</p>` : ""}
  `;
}

function updateAwardNoticeControls() {
  const rows = awardNoticeDraftRows();
  const sendableIds = sendableAwardNoticeIds(rows);
  const sent = rows.filter((message) => String(message.status || "").toLowerCase() === "sent").length;
  const failed = rows.filter((message) => String(message.status || "").toLowerCase() === "failed").length;
  const primary = currentLanes.flatMap((lane) => activeInvitations(lane)).filter((item) => item.award_role === "primary").length;
  const bidRows = awardLaneRows().reduce((sum, row) => sum + row.bids.length, 0);
  if (rfxGenerateAwardNoticesButton) {
    rfxGenerateAwardNoticesButton.disabled = !selectedEventId || !bidRows || Boolean(awardPreflightIssues("generate_notices").length);
  }
  if (rfxSendAwardNoticesButton) {
    rfxSendAwardNoticesButton.disabled = !sendableIds.length || Boolean(awardPreflightIssues("send_notices").length);
    rfxSendAwardNoticesButton.textContent = sendableIds.length
      ? `Send ${formatNumber(sendableIds.length)} notice${sendableIds.length === 1 ? "" : "s"}`
      : "Send notices";
  }
  if (rfxAwardNoticeSummary) {
    rfxAwardNoticeSummary.textContent = rows.length
      ? `${formatNumber(rows.length)} notice draft(s). ${formatNumber(sendableIds.length)} ready, ${formatNumber(sent)} sent${failed ? `, ${formatNumber(failed)} failed` : ""}.`
      : primary
        ? "Generate notices when award decisions are ready."
        : "Award at least one lane before sending closeout notices.";
    rfxAwardNoticeSummary.dataset.tone = failed ? "warning" : rows.length ? "success" : "neutral";
  }
  renderAwardNoticeQueue(rows);
}

function updateAwardMetrics() {
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const awardable = awardLaneRows();
  const primary = invitations.filter((item) => item.award_role === "primary");
  const backup = invitations.filter((item) => item.award_role === "backup");
  const ratewareRows = invitations.filter((item) => item.rate_staging_id);
  if (rfxAwardLanes) rfxAwardLanes.textContent = formatNumber(awardable.length);
  if (rfxAwardPrimary) rfxAwardPrimary.textContent = formatNumber(primary.length);
  if (rfxAwardBackup) rfxAwardBackup.textContent = formatNumber(backup.length);
  if (rfxAwardRateware) rfxAwardRateware.textContent = formatNumber(ratewareRows.length);
  if (rfxAwardStatusPill) {
    rfxAwardStatusPill.textContent = primary.length ? `${formatNumber(primary.length)} primary` : "Decision room";
    rfxAwardStatusPill.className = `status-pill ${primary.length ? "success" : "muted"}`;
  }
  if (rfxCloseoutAwardsButton) {
    const pendingCloseout = primary.filter((item) => !item.rate_staging_id).length;
    rfxCloseoutAwardsButton.disabled = !pendingCloseout || Boolean(awardPreflightIssues("closeout").length);
    rfxCloseoutAwardsButton.textContent = pendingCloseout
      ? `Create ${formatNumber(pendingCloseout)} Rateware row${pendingCloseout === 1 ? "" : "s"}`
      : "Create Rateware rows";
  }
  renderAwardReadiness();
  updateAwardNoticeControls();
}

function renderDecisionScorecard(row, index, laneRows = []) {
  const decision = row.decision || procurementDecisionForBid(row, laneRows);
  const badges = row.decision_badges || decisionBadgesForBid(row, laneRows);
  const riskCopy = decision.risk_flags.length
    ? decision.risk_flags.slice(0, 3).join(" | ")
    : "No major validation gaps";
  const recommendation = decisionRecommendation(row, index + 1, laneRows);
  return `
    <article class="rfx-decision-card" data-score-tone="${decision.score >= 75 ? "strong" : decision.score >= 55 ? "medium" : "weak"}">
      <header>
        <span>${index === 0 ? "Recommended" : `Option #${index + 1}`}</span>
        <strong>${escapeHtml(decision.score)}/100</strong>
      </header>
      <h4>${escapeHtml(vendorLabel(row.invitation))}</h4>
      <p>${formatMoney(row.amount, row.currency)} | ${escapeHtml(offerAvailabilitySummary(row.invitation))}</p>
      <div class="rfx-decision-badges">
        ${badges.map(decisionBadgeHtml).join("") || '<span class="rfx-decision-badge" data-tone="neutral">Needs review</span>'}
      </div>
      <div class="rfx-decision-breakdown">
        <span>Price <b>${escapeHtml(decision.price_score)}</b></span>
        <span>Capacity <b>${escapeHtml(decision.capacity_score)}</b></span>
        <span>Speed <b>${escapeHtml(decision.speed_score)}</b></span>
        <span>Validation <b>${escapeHtml(decision.validation_score)}</b></span>
      </div>
      <small>${escapeHtml(recommendation)}</small>
      <em>${escapeHtml(riskCopy)}</em>
    </article>
  `;
}

function renderAwardBoard() {
  updateAwardMetrics();
  if (!rfxAwardBoard) return;
  if (!selectedEventId) {
    rfxAwardBoard.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Award",
      title: "Select a bid event",
      detail: "Create or select a Bid Room event before awarding carrier bids."
    });
    return;
  }
  const lanes = awardLaneRows();
  if (!lanes.length) {
    rfxAwardBoard.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Award",
      title: "No live bids to award",
      detail: "Carrier bids submitted through the Private Bid Room will appear here by lane."
    });
    return;
  }

  rfxAwardBoard.innerHTML = lanes.map(({ lane, bids }) => {
    const primary = bids.find((row) => row.invitation.award_role === "primary");
    const backups = bids.filter((row) => row.invitation.award_role === "backup");
    const cheapest = [...bids].sort((a, b) => a.amount - b.amount)[0];
    const recommended = bids[0];
    return `
      <section class="rfx-award-lane" data-rfx-award-lane-id="${escapeHtml(lane.id)}">
        <header>
          <div>
            <span class="status-pill ${primary ? "success" : "warning"}">${primary ? "Awarded" : "Needs decision"}</span>
            <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
            <small>${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</small>
          </div>
          <div class="rfx-award-lane-summary">
            <span>Recommended ${escapeHtml(vendorLabel(recommended.invitation))} (${recommended.decision.score}/100)</span>
            <span>Lowest ${formatMoney(cheapest.amount, cheapest.currency)}</span>
            <span>Rateware ${lane.benchmark ? formatMoney(lane.benchmark.all_in_rate, lane.benchmark.currency) : "-"}</span>
            <span>${formatNumber(bids.length)} bid(s)</span>
            <span>${formatNumber(backups.length)} backup(s)</span>
          </div>
        </header>
        <div class="rfx-decision-scorecards">
          ${bids.slice(0, 3).map((row, index) => renderDecisionScorecard(row, index, bids)).join("")}
        </div>
        <div class="table-wrap">
          <table class="rfx-award-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Carrier</th>
                <th>Score</th>
                <th>Badges</th>
                <th>All-in</th>
                <th>Delta</th>
                <th>Commercial</th>
                <th>Availability</th>
                <th>Capacity</th>
                <th>Transit</th>
                <th>Role</th>
                <th>Reason</th>
                <th>Rateware</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${bids.map((row, index) => {
                const delta = Number(row.invitation.bid_delta);
                const deltaTone = Number.isFinite(delta) && delta <= 0 ? "success" : Number.isFinite(delta) ? "danger" : "neutral";
                const recommendedReason = decisionRecommendation(row, index + 1, bids);
                return `
                  <tr data-rfx-award-invitation-id="${escapeHtml(row.invitation.id)}">
                    <td>#${index + 1}</td>
                    <td><strong>${escapeHtml(vendorLabel(row.invitation))}</strong><small>${escapeHtml(row.invitation.vendors?.domain || row.invitation.vendors?.primary_email || "")}</small></td>
                    <td>
                      <span class="rfx-decision-score" data-score-tone="${row.decision.score >= 75 ? "strong" : row.decision.score >= 55 ? "medium" : "weak"}">${escapeHtml(row.decision.score)}</span>
                      <small>${escapeHtml(row.decision.risk_flags.length ? `${row.decision.risk_flags.length} risk flag(s)` : "clean")}</small>
                    </td>
                    <td><div class="rfx-decision-badges">${row.decision_badges.map(decisionBadgeHtml).join("")}</div></td>
                    <td>${formatMoney(row.amount, row.currency)}</td>
                    <td><span class="rfx-bid-delta" data-tone="${deltaTone}">${Number.isFinite(delta) ? formatMoney(delta, row.currency) : "-"}</span></td>
                    <td><small>${escapeHtml(offerCommercialSummary(row.invitation))}</small></td>
                    <td><small>${escapeHtml(offerAvailabilitySummary(row.invitation))}</small></td>
                    <td>${escapeHtml(row.invitation.weekly_capacity ?? "-")}</td>
                    <td>${escapeHtml(row.invitation.transit_days ?? "-")}</td>
                    <td>${awardRoleChip(row.invitation)}</td>
                    <td><small>${escapeHtml(row.invitation.award_reason || recommendedReason || row.invitation.notes || awardReasonDefault(row, index + 1))}</small></td>
                    <td>${row.invitation.rate_staging_id ? '<span class="status-pill success">Created</span>' : '<span class="status-pill muted">Pending</span>'}</td>
                    <td>
                      <div class="compact-actions">
                        <button type="button" class="small-button" data-rfx-award-primary="${escapeHtml(row.invitation.id)}" data-award-default="${escapeHtml(recommendedReason)}" ${row.invitation.award_role === "primary" ? "disabled" : ""}>Award</button>
                        <button type="button" class="secondary small-button" data-rfx-award-backup="${escapeHtml(row.invitation.id)}" data-award-default="${escapeHtml(recommendedReason)}" ${row.invitation.award_role === "backup" ? "disabled" : ""}>Backup</button>
                        <button type="button" class="secondary small-button" data-rfx-clear-award="${escapeHtml(row.invitation.id)}" ${row.invitation.award_role ? "" : "disabled"}>Clear</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");
}

function laneRoute(lane) {
  return `${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function invitationStatusCounts(lanes = currentLanes) {
  const counts = {};
  lanes.forEach((lane) => {
    (lane.invitations || []).forEach((invitation) => {
      const status = commercialStatus(invitation.invitation_status);
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
  const bids = invitations.filter(hasBid).length;
  return Math.round((bids / invitations.length) * 100);
}

function activeInvitations(lane) {
  return (lane.invitations || []).filter((item) => item.invitation_status !== "archived");
}

function bidInvitations(lane) {
  return activeInvitations(lane).filter(hasBid);
}

function bestBidForLane(lane) {
  return bidInvitations(lane)
    .map((item) => ({ ...item, numeric_bid: Number(item.bid_rate) }))
    .filter((item) => Number.isFinite(item.numeric_bid))
    .sort((a, b) => a.numeric_bid - b.numeric_bid)[0] || null;
}

function laneDecisionStatus(lane) {
  const invitations = activeInvitations(lane);
  const bids = bidInvitations(lane);
  if (!invitations.length) return "needs_shortlist";
  if (!invitations.some(hasInvitationStarted)) return "needs_invite";
  if (!bids.length) return "needs_response";
  return "has_bids";
}

function laneDecisionLabel(status) {
  const labels = {
    needs_shortlist: "Needs shortlist",
    needs_invite: "Needs invite",
    needs_response: "Needs response",
    has_bids: "Has bids",
    above_benchmark: "Above Rateware"
  };
  return labels[status] || "All";
}

function laneSearchText(lane) {
  return [
    lane.lane_number,
    lane.origin,
    lane.origin_city,
    lane.origin_state,
    lane.origin_market,
    lane.origin_region,
    lane.destination,
    lane.destination_city,
    lane.destination_state,
    lane.destination_market,
    lane.destination_region,
    lane.equipment,
    lane.trailer,
    lane.config,
    lane.operation,
    lane.service,
    lane.incumbent_vendor,
    ...(lane.invitations || []).map((invitation) => vendorLabel(invitation))
  ].filter(Boolean).join(" ").toLowerCase();
}

function laneMatchesFilter(lane) {
  const term = String(laneSearch?.value || "").trim().toLowerCase();
  if (term && !laneSearchText(lane).includes(term)) return false;
  const decision = laneDecisionStatus(lane);
  if (activeLaneFilter === "all") return true;
  if (activeLaneFilter === "above_benchmark") {
    const bid = bestBidForLane(lane);
    return Number.isFinite(Number(bid?.bid_delta)) && Number(bid.bid_delta) > 0;
  }
  return decision === activeLaneFilter;
}

function visibleLanes() {
  return currentLanes.filter(laneMatchesFilter);
}

function eventStepState() {
  const activeLanes = currentLanes;
  const invitations = activeLanes.flatMap((lane) => activeInvitations(lane));
  const bids = activeLanes.flatMap((lane) => bidInvitations(lane));
  return {
    setup: Boolean(selectedEvent),
    lanes: activeLanes.length > 0,
    shortlist: activeLanes.some((lane) => activeInvitations(lane).length > 0),
    invite: invitations.some(hasInvitationStarted),
    responses: bids.length > 0,
    award: invitations.some((item) => item.invitation_status === "awarded") || selectedEvent?.status === "awarded"
  };
}

function renderEventFlow() {
  if (!eventFlow) return;
  const state = eventStepState();
  const steps = [
    ["setup", "Setup"],
    ["lanes", "Book"],
    ["shortlist", "Shortlist"],
    ["invite", "Invitations"],
    ["responses", "Live bids"],
    ["award", "Award"]
  ];
  eventFlow.innerHTML = steps.map(([key, label], index) => `
    <article class="${state[key] ? "is-complete" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(label)}</strong>
    </article>
  `).join("");
}

function renderRfxOpsStrip() {
  if (!rfxOpsSubtitle || !rfxOpsHealth) return;
  renderOpsStageRail();
  renderOpsNextAction();
  renderBidRoomLaunchReadiness();
  if (!selectedEvent) {
    if (rfxOpsTitle) rfxOpsTitle.textContent = "Select or create a bid event";
    rfxOpsSubtitle.textContent = "One workflow: event setup, lane book, participants, outreach, auction, award.";
    rfxOpsHealth.innerHTML = `
      <article><span>Event</span><strong>-</strong><small>No bid event selected.</small></article>
      <article><span>Lanes</span><strong>0</strong><small>Paste or import the spot book.</small></article>
      <article><span>Invitations</span><strong>0</strong><small>No carrier targets yet.</small></article>
      <article><span>Live bids</span><strong>0</strong><small>No live bids yet.</small></article>
    `;
    return;
  }

  const activeInviteRows = currentLanes.flatMap((lane) => activeInvitations(lane));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  const targets = outreachTargetInvitations();
  const readyTargets = targets.filter((target) => targetHasChannel(target, rfxOutreachChannel?.value || "multi"));
  const lanesWithShortlist = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  const lanesWithBids = currentLanes.filter((lane) => bidInvitations(lane).length).length;
  const due = selectedEvent.due_date ? `Due ${selectedEvent.due_date}` : "No due date";

  if (rfxOpsTitle) rfxOpsTitle.textContent = `${selectedEvent.rfx_id || "RFx"} procurement flow`;
  rfxOpsSubtitle.textContent = `${selectedEvent.name || "Selected event"} | ${selectedEvent.customer || "No customer"} | ${due}`;
  rfxOpsHealth.innerHTML = `
    <article data-tone="${selectedEvent.status === "open" ? "success" : "neutral"}">
      <span>Event</span>
      <strong>${escapeHtml(selectedEvent.status || "draft")}</strong>
      <small>${escapeHtml(due)}</small>
    </article>
    <article data-tone="${currentLanes.length ? "success" : "warning"}">
      <span>Lanes</span>
      <strong>${formatNumber(currentLanes.length)}</strong>
      <small>${formatNumber(lanesWithShortlist)} lane(s) with shortlist.</small>
    </article>
    <article data-tone="${readyTargets.length ? "success" : activeInviteRows.length ? "warning" : "neutral"}">
      <span>Invitations ready</span>
      <strong>${formatNumber(readyTargets.length)} / ${formatNumber(targets.length)}</strong>
      <small>${formatNumber(activeInviteRows.length)} active carrier target(s).</small>
    </article>
    <article data-tone="${bids.length ? "success" : "neutral"}">
      <span>Live bids</span>
      <strong>${formatNumber(bids.length)}</strong>
      <small>${formatNumber(lanesWithBids)} lane(s) with live bids.</small>
    </article>
  `;
}

function focusLane(laneId) {
  focusedLaneId = laneId || currentLanes[0]?.id || null;
  renderLanes();
}

function renderEventDashboard() {
  renderEventFlow();
  renderRfxOpsStrip();
  renderProcessManager();
  if (!dashboardTitle && !eventDashboard && !inviteStatusMix) return;
  if (!selectedEvent) {
    if (dashboardTitle) dashboardTitle.textContent = "No event selected";
    if (copyRfxSummaryButton) copyRfxSummaryButton.disabled = true;
    if (eventDashboard) {
      eventDashboard.innerHTML = `
        <article>
          <span>Status</span>
          <strong>-</strong>
          <small>Select a bid event to see lane coverage, invitation status, and bid progress.</small>
        </article>
      `;
    }
    if (inviteStatusMix) inviteStatusMix.innerHTML = "";
    return;
  }

  const invitations = currentLanes.flatMap((lane) => lane.invitations || []);
  const activeInvitations = invitations.filter((item) => item.invitation_status !== "archived");
  const bids = activeInvitations.filter(hasBid);
  const lanesWithShortlist = currentLanes.filter((lane) => (lane.invitations || []).some((item) => item.invitation_status !== "archived")).length;
  const lanesWithBids = currentLanes.filter((lane) => (lane.invitations || []).some(hasBid)).length;
  const shortlistCoverage = currentLanes.length ? Math.round((lanesWithShortlist / currentLanes.length) * 100) : 0;
  const bidCoverage = currentLanes.length ? Math.round((lanesWithBids / currentLanes.length) * 100) : 0;
  const responseRate = activeInvitations.length ? Math.round((bids.length / activeInvitations.length) * 100) : 0;

  if (dashboardTitle) dashboardTitle.textContent = `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || "Selected event"}`;
  if (copyRfxSummaryButton) copyRfxSummaryButton.disabled = false;
  if (eventDashboard) {
    eventDashboard.innerHTML = `
      <article>
        <span>Status</span>
        <strong>${escapeHtml(selectedEvent.status || "draft")}</strong>
        <small>${escapeHtml([selectedEvent.customer, selectedEvent.due_date ? `Due ${selectedEvent.due_date}` : ""].filter(Boolean).join(" | ") || "No customer or due date")}</small>
        <a class="secondary-link small-button" href="${escapeHtml(marketplaceUrlForEvent(selectedEvent.id))}" target="_blank" rel="noreferrer">Event marketplace</a>
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
      <article>
        <span>Bid visibility</span>
        <strong>${escapeHtml(bidVisibilityLabel(selectedEvent.bid_visibility_mode))}</strong>
        <small>${selectedEvent.bid_visibility_mode === "open_leaderboard"
          ? "Carriers see named competitors and submitted rates."
          : selectedEvent.bid_visibility_mode === "private"
            ? "Carriers only see their own submitted offer."
            : "Carriers see anonymous rank and pricing signals."}</small>
      </article>
    `;
  }

  const counts = invitationStatusCounts();
  if (inviteStatusMix) {
    inviteStatusMix.innerHTML = Object.keys(counts).length
      ? Object.entries(counts).map(([status, count]) => `
        <span data-tone="${statusTone(status)}">${escapeHtml(statusLabel(status))} <strong>${formatNumber(count)}</strong></span>
      `).join("")
      : "<span>No vendors shortlisted yet.</span>";
  }
}

function chatVendorOptions() {
  const map = new Map();
  currentLanes.forEach((lane) => {
    (lane.invitations || []).forEach((invitation) => {
      const vendor = invitation.vendors || {};
      if (!invitation.vendor_id || map.has(invitation.vendor_id)) return;
      map.set(invitation.vendor_id, {
        id: invitation.vendor_id,
        label: vendor.vendor_name || vendor.domain || invitation.vendor_id
      });
    });
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function chatMessages(thread = {}) {
  return Array.isArray(thread.messages) ? thread.messages : [];
}

function chatMessageTime(message = {}) {
  const time = new Date(String(message.created_at || ""));
  return Number.isNaN(time.getTime()) ? 0 : time.getTime();
}

function latestChatMessage(thread = {}) {
  const messages = chatMessages(thread);
  return messages.length ? messages[messages.length - 1] : null;
}

function messageFromGoogleChat(message = {}) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return metadata.source === "google_chat_inbound" || Boolean(message.google_chat_sender_name);
}

function messageText(message = {}) {
  return String(message.body || "").trim();
}

function threadText(thread = {}) {
  return chatMessages(thread).map(messageText).filter(Boolean).join("\n");
}

function extractFirstNumber(text = "") {
  const match = String(text).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractRateSignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:\$|usd|mxn|cad|us\$|mx\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:usd|mxn|cad|dlls?|dollars?)/i);
  if (!match) return null;
  const raw = match[0];
  const amount = extractFirstNumber(raw);
  const currency = /mxn|mx\$|pesos?/i.test(raw) ? "MXN" : /cad|can\$/i.test(raw) ? "CAD" : "USD";
  return amount ? { amount, currency, raw } : null;
}

function extractCapacitySignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:capacidad|capacity|available|disponible|tengo|puedo)\D{0,24}(\d{1,3})\s*(?:unidades|units|trucks|camiones|cajas|trailers|loads|viajes)?|(\d{1,3})\s*(?:unidades|units|trucks|camiones|cajas|trailers|loads|viajes)/i);
  const amount = match ? Number(match[1] || match[2]) : null;
  return Number.isFinite(amount) ? amount : null;
}

function extractTransitSignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:transit|transito|tr[aá]nsito|delivery|entrega)\D{0,24}(\d{1,2})\s*(?:days|d[ií]as)|(\d{1,2})\s*(?:days|d[ií]as)\s*(?:transit|transito|tr[aá]nsito)?/i);
  const days = match ? Number(match[1] || match[2]) : null;
  return Number.isFinite(days) ? days : null;
}

function detectMessageIntent(message = {}) {
  const text = messageText(message);
  const lower = text.toLowerCase();
  const signals = [];
  const rate = extractRateSignal(text);
  const capacity = extractCapacitySignal(text);
  const transitDays = extractTransitSignal(text);
  if (/[?¿]/.test(text) || /\b(can you|could you|puedes|podrias|podr[ií]as|favor|confirm|confirma|duda|pregunta|question)\b/i.test(text)) {
    signals.push({ code: "question", label: "Question", tone: "warning", detail: "Carrier is asking for clarification." });
  }
  if (rate) {
    signals.push({ code: "price", label: "Price mentioned", tone: "success", detail: `${formatMoney(rate.amount, rate.currency)} detected.` });
  }
  if (capacity !== null) {
    signals.push({ code: "capacity", label: "Capacity", tone: "success", detail: `${capacity} unit(s) mentioned.` });
  }
  if (transitDays !== null || /\b(eta|pickup|pick up|recolecci[oó]n|delivery|entrega|disponible|available)\b/i.test(text)) {
    signals.push({ code: "eta", label: "ETA / availability", tone: "neutral", detail: transitDays !== null ? `${transitDays} transit day(s) detected.` : "ETA or availability language detected." });
  }
  if (/\b(no puedo|no contamos|not available|no availability|delay|retraso|problema|target|too low|insurance|seguro|cannot|can't|decline|declinar)\b/i.test(lower)) {
    signals.push({ code: "risk", label: "Risk", tone: "danger", detail: "Potential exception, rejection, or escalation language." });
  }
  return { signals, rate, capacity, transit_days: transitDays };
}

function analyzeCommunicationThread(thread = {}) {
  const messages = chatMessages(thread);
  const signalMap = new Map();
  let latestActionableMessage = null;
  let extracted = { rate: null, capacity: null, transit_days: null };
  for (const message of messages) {
    const analysis = detectMessageIntent(message);
    if (analysis.signals.length) latestActionableMessage = message;
    analysis.signals.forEach((signal) => {
      if (!signalMap.has(signal.code)) signalMap.set(signal.code, signal);
    });
    if (analysis.rate) extracted.rate = analysis.rate;
    if (analysis.capacity !== null) extracted.capacity = analysis.capacity;
    if (analysis.transit_days !== null) extracted.transit_days = analysis.transit_days;
  }
  const signals = [...signalMap.values()];
  return {
    signals,
    latest_actionable_message: latestActionableMessage,
    extracted,
    has_signals: signals.length > 0
  };
}

function signalToneClass(signal = {}) {
  if (signal.tone === "danger") return "danger";
  if (signal.tone === "warning") return "warning";
  if (signal.tone === "success") return "success";
  return "neutral";
}

function suggestedReplyForThread(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  const vendor = thread.vendors?.vendor_name || thread.vendors?.domain || "team";
  const latest = latestChatMessage(thread);
  const body = latest?.body || "";
  const hasPrice = analysis.signals.some((signal) => signal.code === "price");
  const hasCapacity = analysis.signals.some((signal) => signal.code === "capacity");
  const hasRisk = analysis.signals.some((signal) => signal.code === "risk");
  if (hasRisk) {
    return `Hi ${vendor}, thanks for the update. Can you confirm the main constraint and whether there is any alternative option we should consider for this lane?`;
  }
  if (hasPrice || hasCapacity) {
    const parts = [];
    if (analysis.extracted.rate) parts.push(`rate ${formatMoney(analysis.extracted.rate.amount, analysis.extracted.rate.currency)}`);
    if (analysis.extracted.capacity !== null) parts.push(`capacity ${analysis.extracted.capacity}`);
    if (analysis.extracted.transit_days !== null) parts.push(`transit ${analysis.extracted.transit_days} day(s)`);
    return `Hi ${vendor}, thanks. We captured ${parts.join(", ") || "your update"}. Please confirm if this is all-in, the equipment is available, and the pickup/delivery ETA.`;
  }
  if (body.includes("?") || body.includes("¿")) {
    return `Hi ${vendor}, thanks for the question. We are reviewing it now and will confirm the lane requirement, service expectation, and next step shortly.`;
  }
  return `Hi ${vendor}, thanks for the update. We will review it against the bid room requirements and follow up with next steps.`;
}

function extractedBidUpdateText(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  const lines = [`Bid update candidate - ${thread.title || thread.thread_type || "Bid Room thread"}`];
  if (analysis.extracted.rate) lines.push(`All-in candidate: ${formatMoney(analysis.extracted.rate.amount, analysis.extracted.rate.currency)}`);
  if (analysis.extracted.capacity !== null) lines.push(`Capacity candidate: ${analysis.extracted.capacity}`);
  if (analysis.extracted.transit_days !== null) lines.push(`Transit candidate: ${analysis.extracted.transit_days} day(s)`);
  lines.push(`Source message: ${messageText(analysis.latest_actionable_message || latestChatMessage(thread) || {}) || "-"}`);
  lines.push("Review before updating the bid. AI proposes, user confirms.");
  return lines.join("\n");
}

function hasBidUpdateSignal(analysis = {}) {
  const extracted = analysis.extracted || {};
  return Boolean(extracted.rate || extracted.capacity !== null || extracted.transit_days !== null);
}

function chatBidUpdateSourceMessage(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  return analysis.latest_actionable_message || latestChatMessage(thread) || null;
}

function chatBidUpdateCandidates(thread = {}) {
  const laneId = String(thread.rfx_lane_id || "");
  const vendorId = String(thread.vendor_id || "");
  const rows = currentLanes.flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })));
  const scoped = rows.filter(({ lane, invitation }) => {
    const laneMatches = !laneId || String(lane.id) === laneId;
    const vendorMatches = !vendorId || String(invitation.vendor_id) === vendorId;
    return laneMatches && vendorMatches;
  });
  return scoped.length ? scoped : rows;
}

function chatBidUpdateCandidateLabel(candidate) {
  if (!candidate) return "Select lane-carrier";
  const laneLabel = `#${candidate.lane.lane_number || ""} ${laneRoute(candidate.lane)}`.trim();
  return `${vendorLabel(candidate.invitation)} | ${laneLabel}`;
}

function selectedChatBidUpdateCandidate() {
  if (!pendingChatBidUpdate || !rfxChatBidUpdateInvitation) return null;
  return pendingChatBidUpdate.candidates.find((candidate) => String(candidate.invitation.id) === String(rfxChatBidUpdateInvitation.value)) || null;
}

function closeChatBidUpdateDrawer() {
  pendingChatBidUpdate = null;
  if (rfxChatBidUpdateDrawer) rfxChatBidUpdateDrawer.hidden = true;
  if (rfxChatBidUpdateStatus) rfxChatBidUpdateStatus.textContent = "";
}

function openChatBidUpdateDrawer(thread = {}) {
  if (!rfxChatBidUpdateDrawer || !rfxChatBidUpdateForm) return;
  const analysis = analyzeCommunicationThread(thread);
  const sourceMessage = chatBidUpdateSourceMessage(thread);
  const candidates = chatBidUpdateCandidates(thread);
  pendingChatBidUpdate = {
    thread,
    sourceMessage,
    candidates
  };
  if (rfxChatBidUpdateTitle) rfxChatBidUpdateTitle.textContent = thread.title || "Review bid update";
  if (rfxChatBidUpdateInvitation) {
    rfxChatBidUpdateInvitation.innerHTML = candidates.length
      ? candidates.map((candidate) => `
          <option value="${escapeHtml(candidate.invitation.id)}">${escapeHtml(chatBidUpdateCandidateLabel(candidate))}</option>
        `).join("")
      : '<option value="">No lane-carrier rows available</option>';
    const exactCandidate = candidates.find((candidate) => (
      (!thread.rfx_lane_id || String(candidate.lane.id) === String(thread.rfx_lane_id))
      && (!thread.vendor_id || String(candidate.invitation.vendor_id) === String(thread.vendor_id))
    )) || candidates[0];
    rfxChatBidUpdateInvitation.value = exactCandidate?.invitation?.id || "";
  }
  const selectedCandidate = selectedChatBidUpdateCandidate() || candidates[0];
  if (rfxChatBidUpdateRate) rfxChatBidUpdateRate.value = analysis.extracted.rate?.amount ?? "";
  if (rfxChatBidUpdateCurrency) rfxChatBidUpdateCurrency.value = analysis.extracted.rate?.currency || selectedCandidate?.invitation?.currency || selectedCandidate?.lane?.currency || "USD";
  if (rfxChatBidUpdateCapacity) rfxChatBidUpdateCapacity.value = analysis.extracted.capacity ?? "";
  if (rfxChatBidUpdateTransit) rfxChatBidUpdateTransit.value = analysis.extracted.transit_days ?? "";
  if (rfxChatBidUpdateNotes) {
    const currentNotes = selectedCandidate?.invitation?.notes || "";
    rfxChatBidUpdateNotes.value = currentNotes
      ? `${currentNotes}\nChat update: ${messageText(sourceMessage || {})}`.slice(0, 1200)
      : messageText(sourceMessage || "");
  }
  if (rfxChatBidUpdateSource) {
    rfxChatBidUpdateSource.textContent = messageText(sourceMessage || {}) || "No source message found.";
  }
  if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = !candidates.length;
  rfxChatBidUpdateDrawer.hidden = false;
  setStatus(rfxChatBidUpdateStatus, "Review extracted values before applying. AI proposes, user confirms.", "neutral");
  rfxChatBidUpdateRate?.focus();
}

function communicationActionQueue(rows = []) {
  return sortedChatThreads(rows)
    .map((thread) => ({ thread, analysis: analyzeCommunicationThread(thread) }))
    .filter((item) => item.analysis.has_signals || threadNeedsReply(item.thread) || threadIsUnread(item.thread))
    .slice(0, 8);
}

function threadHasGoogleChatActivity(thread = {}) {
  return chatMessages(thread).some((message) => messageFromGoogleChat(message) || message.google_chat_sync_status === "synced");
}

function threadNeedsReply(thread = {}) {
  if (thread.needs_reply === true || thread.communication_status === "needs_reply") return true;
  if (thread.communication_status === "resolved") return false;
  const latest = latestChatMessage(thread);
  return latest?.sender_role === "carrier";
}

function threadIsUnread(thread = {}) {
  return thread.read_status === "unread";
}

function threadIsResolved(thread = {}) {
  return thread.communication_status === "resolved";
}

function threadHasCarrierMessage(thread = {}) {
  return chatMessages(thread).some((message) => message.sender_role === "carrier");
}

function threadLastActivityLabel(thread = {}) {
  const latest = latestChatMessage(thread);
  if (!latest?.created_at) return "No activity";
  return new Date(latest.created_at).toLocaleString();
}

function chatThreadPriority(thread = {}) {
  if (threadIsUnread(thread)) return 0;
  if (threadNeedsReply(thread)) return 0;
  if (threadIsResolved(thread)) return 5;
  return 3;
}

function eventGroupChatThreads(rows = []) {
  return rows.filter((thread) => (thread.thread_type || BID_ROOM_EVENT_THREAD_TYPE) === BID_ROOM_EVENT_THREAD_TYPE);
}

function sortedChatThreads(rows = []) {
  return [...rows].sort((a, b) => {
    const priorityDelta = chatThreadPriority(a) - chatThreadPriority(b);
    if (priorityDelta) return priorityDelta;
    return chatMessageTime(latestChatMessage(b) || {}) - chatMessageTime(latestChatMessage(a) || {});
  });
}

function chatThreadMatchesFilter(thread = {}) {
  if (bidRoomChatFilter === "needs_reply") return threadNeedsReply(thread);
  if (bidRoomChatFilter === "carrier") return threadHasCarrierMessage(thread);
  if (bidRoomChatFilter === "google") return threadHasGoogleChatActivity(thread);
  if (bidRoomChatFilter === "unread") return threadIsUnread(thread);
  if (bidRoomChatFilter === "signals") return analyzeCommunicationThread(thread).has_signals;
  return true;
}

function chatStats(rows = []) {
  const messages = rows.flatMap((thread) => chatMessages(thread));
  const signalThreads = rows.filter((thread) => analyzeCommunicationThread(thread).has_signals).length;
  const priceSignals = rows.filter((thread) => analyzeCommunicationThread(thread).signals.some((signal) => signal.code === "price")).length;
  const riskSignals = rows.filter((thread) => analyzeCommunicationThread(thread).signals.some((signal) => signal.code === "risk")).length;
  const needsReply = rows.filter(threadNeedsReply).length;
  const unread = rows.filter(threadIsUnread).length;
  const resolved = rows.filter(threadIsResolved).length;
  const carrierMessages = messages.filter((message) => message.sender_role === "carrier").length;
  const googleMessages = messages.filter(messageFromGoogleChat).length;
  const syncErrors = messages.filter((message) => message.google_chat_sync_status === "error").length;
  return {
    threads: rows.length,
    needsReply,
    unread,
    resolved,
    signalThreads,
    priceSignals,
    riskSignals,
    carrierMessages,
    googleMessages,
    syncErrors,
    messages: messages.length
  };
}

function chatOpsSummary(rows = []) {
  const stats = chatStats(rows);
  const inbound = bidRoomChatThreads.google_chat_inbound || {};
  if (!selectedEventId) return "Select a bid event to load the communication queue.";
  if (!rows.length) return "No event group messages yet. Start the event thread so all Bid Room communication stays in one shared place.";
  if (inbound.status === "needs_reconnect") return "Google Chat is linked for outbound messages, but inbound replies require reconnecting Google Chat in Settings.";
  if (stats.syncErrors) return `${stats.syncErrors} Google Chat message(s) need retry. Refresh or use Settings > Retry Chat sync.`;
  if (stats.unread) return `${stats.unread} unread thread(s). Review new activity before awarding or sending follow-up invitations.`;
  if (stats.needsReply) return `${stats.needsReply} event thread(s) need a procurement reply.`;
  if (stats.signalThreads) return `${stats.signalThreads} thread(s) have detected commercial signals. Review price, capacity, ETA, and risk before awarding.`;
  if (stats.carrierMessages) return `${stats.carrierMessages} carrier message(s) captured. No open reply blocker detected.`;
  return "Communication queue is clean. Keep the event thread synced and monitor new carrier replies.";
}

function chatSummaryText(rows = []) {
  const stats = chatStats(rows);
  const urgent = sortedChatThreads(rows).filter(threadNeedsReply).slice(0, 5);
  return [
    `Bid Room communication summary${selectedEvent?.name ? ` - ${selectedEvent.name}` : ""}`,
    `Threads: ${stats.threads}`,
    `Unread: ${stats.unread}`,
    `Needs reply: ${stats.needsReply}`,
    `Resolved: ${stats.resolved}`,
    `Signal threads: ${stats.signalThreads}`,
    `Price signals: ${stats.priceSignals}`,
    `Risk signals: ${stats.riskSignals}`,
    `Carrier messages: ${stats.carrierMessages}`,
    `Google Chat inbound: ${stats.googleMessages}`,
    urgent.length ? "Priority threads:" : "Priority threads: none",
    ...urgent.map((thread) => `- ${thread.title || thread.thread_type}: ${latestChatMessage(thread)?.body || ""}`)
  ].join("\n");
}

function renderBidRoomChatControls() {
  if (rfxChatThreadType) rfxChatThreadType.value = BID_ROOM_EVENT_THREAD_TYPE;
  if (rfxChatSend) rfxChatSend.disabled = !selectedEventId;
  if (rfxChatStartEventThread) rfxChatStartEventThread.disabled = !selectedEventId;
}

function renderBidRoomChat() {
  renderBidRoomChatControls();
  const rows = eventGroupChatThreads(Array.isArray(bidRoomChatThreads.rows) ? bidRoomChatThreads.rows : []);
  const stats = chatStats(rows);
  if (rfxChatSyncStatus) {
    const inboundStatus = bidRoomChatThreads.google_chat_inbound?.status || "";
    rfxChatSyncStatus.textContent = inboundStatus === "needs_reconnect"
      ? "Reconnect Google Chat"
      : bidRoomChatThreads.google_chat_configured
        ? "Google Chat linked"
        : "Google Chat not linked";
    rfxChatSyncStatus.className = `status-pill ${inboundStatus === "needs_reconnect" ? "warning" : bidRoomChatThreads.google_chat_configured ? "success" : "muted"}`;
  }
  if (rfxChatMetricThreads) rfxChatMetricThreads.textContent = formatNumber(stats.threads);
  if (rfxChatMetricNeedsReply) rfxChatMetricNeedsReply.textContent = formatNumber(stats.needsReply);
  if (rfxChatMetricCarrier) rfxChatMetricCarrier.textContent = formatNumber(stats.carrierMessages);
  if (rfxChatMetricGoogle) rfxChatMetricGoogle.textContent = formatNumber(stats.googleMessages);
  if (rfxChatAiSummary) {
    rfxChatAiSummary.textContent = chatOpsSummary(rows);
    rfxChatAiSummary.dataset.tone = stats.riskSignals ? "danger" : stats.needsReply || stats.signalThreads ? "warning" : bidRoomChatThreads.google_chat_inbound?.status === "needs_reconnect" ? "warning" : "neutral";
  }
  if (rfxChatSignalQueue) {
    const actionQueue = communicationActionQueue(rows);
    rfxChatSignalQueue.innerHTML = actionQueue.length ? actionQueue.map(({ thread, analysis }) => `
      <article>
        <div>
          <strong>${escapeHtml(thread.title || thread.thread_type || "Communication thread")}</strong>
          <span>${escapeHtml(analysis.signals.map((signal) => signal.label).join(" | ") || (threadNeedsReply(thread) ? "Needs reply" : "Unread"))}</span>
        </div>
        <div class="action-row compact-actions">
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="suggest_reply" data-thread-id="${escapeHtml(thread.id)}">Suggest reply</button>
          <button type="button" class="small-button" data-rfx-chat-thread-action="review_bid_update" data-thread-id="${escapeHtml(thread.id)}" ${hasBidUpdateSignal(analysis) ? "" : "disabled"}>Review update</button>
        </div>
      </article>
    `).join("") : "No communication signals detected yet.";
  }
  if (rfxChatInboxFilters) {
    rfxChatInboxFilters.querySelectorAll("[data-rfx-chat-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rfxChatFilter === bidRoomChatFilter);
    });
  }
  if (rfxChatCopySummary) rfxChatCopySummary.disabled = !selectedEventId || !rows.length;
  if (!rfxChatThreadList) return;
  if (!selectedEventId) {
    rfxChatThreadList.innerHTML = "Select a bid event to load chat threads.";
    return;
  }
  const visibleRows = sortedChatThreads(rows).filter(chatThreadMatchesFilter);
  if (!visibleRows.length) {
    rfxChatThreadList.innerHTML = `
      <div class="bid-room-empty">
        <strong>${rows.length ? "No threads match this filter." : "No chat messages yet."}</strong>
        <span>${rows.length ? "Change the inbox filter or refresh Google Chat sync." : "Start the event group thread to keep communication in one place."}</span>
      </div>
    `;
    return;
  }
  rfxChatThreadList.innerHTML = visibleRows.map((thread) => {
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    const latest = latestChatMessage(thread);
    const needsReply = threadNeedsReply(thread);
    const hasGoogleActivity = threadHasGoogleChatActivity(thread);
    const unread = threadIsUnread(thread);
    const resolved = threadIsResolved(thread);
    const intelligence = analyzeCommunicationThread(thread);
    return `
      <article class="bid-room-chat-thread${needsReply ? " needs-reply" : ""}${unread ? " is-unread" : ""}${resolved ? " is-resolved" : ""}" data-rfx-chat-thread-id="${escapeHtml(thread.id)}">
        <header>
          <div>
            <strong>${escapeHtml(thread.title || thread.thread_type)}</strong>
            <span>${escapeHtml(thread.thread_type || "thread")} | ${escapeHtml(threadLastActivityLabel(thread))}</span>
          </div>
          <div class="bid-room-chat-thread-badges">
            ${unread ? '<span class="status-pill neutral">Unread</span>' : ""}
            ${needsReply ? '<span class="status-pill warning">Needs reply</span>' : ""}
            ${resolved ? '<span class="status-pill success">Resolved</span>' : ""}
            ${hasGoogleActivity ? '<span class="status-pill success">Google</span>' : ""}
            <small>${messages.length} message(s)</small>
          </div>
        </header>
        ${intelligence.signals.length ? `
          <div class="bid-room-chat-signals">
            ${intelligence.signals.map((signal) => `
              <span class="status-pill ${signalToneClass(signal)}" title="${escapeHtml(signal.detail)}">${escapeHtml(signal.label)}</span>
            `).join("")}
          </div>
        ` : ""}
        ${(thread.assigned_to || thread.internal_note) ? `
          <div class="bid-room-chat-meta">
            ${thread.assigned_to ? `<span>Owner: ${escapeHtml(thread.assigned_to)}</span>` : ""}
            ${thread.internal_note ? `<span title="${escapeHtml(thread.internal_note)}">Note: ${escapeHtml(thread.internal_note)}</span>` : ""}
          </div>
        ` : ""}
        ${latest ? `<p class="bid-room-chat-latest">${escapeHtml(latest.body || "")}</p>` : ""}
        <div class="bid-room-chat-thread-actions">
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="${unread ? "mark_read" : "mark_unread"}" data-thread-id="${escapeHtml(thread.id)}">${unread ? "Mark read" : "Mark unread"}</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="mark_needs_reply" data-thread-id="${escapeHtml(thread.id)}">Needs reply</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="${resolved ? "reopen" : "resolve"}" data-thread-id="${escapeHtml(thread.id)}">${resolved ? "Reopen" : "Resolve"}</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="assign" data-thread-id="${escapeHtml(thread.id)}">Assign</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="note" data-thread-id="${escapeHtml(thread.id)}">Note</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="suggest_reply" data-thread-id="${escapeHtml(thread.id)}">Suggest reply</button>
          <button type="button" class="small-button" data-rfx-chat-thread-action="review_bid_update" data-thread-id="${escapeHtml(thread.id)}" ${hasBidUpdateSignal(intelligence) ? "" : "disabled"}>Review bid update</button>
        </div>
        <div class="bid-room-chat-messages">
          ${messages.slice(-8).map((message) => `
            <div class="bid-room-chat-message" data-role="${escapeHtml(message.sender_role || "procurement")}">
              <b>${escapeHtml(message.sender_name || message.sender_email || message.sender_role || "User")}</b>
              <p>${escapeHtml(message.body)}</p>
              <span>${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString() : "")}</span>
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
}

async function loadBidRoomChat() {
  if (!selectedEventId) {
    bidRoomChatThreads = emptyBidRoomChatThreads();
    renderBidRoomChat();
    return;
  }
  try {
    bidRoomChatThreads = await fetchBidRoomChat(selectedEventId) || emptyBidRoomChatThreads();
    renderBidRoomChat();
  } catch (error) {
    bidRoomChatThreads = emptyBidRoomChatThreads();
    renderBidRoomChat();
    setStatus(rfxChatStatus, error.message, "error");
  }
}

async function ensureSelectedEventChatThread(eventId, options = {}) {
  if (!eventId) return null;
  try {
    const result = await syncBidRoomEventThread(eventId, { force: options.force === true });
    if (selectedEventId === eventId) {
      await loadBidRoomChat();
      if (!options.silent) {
        setStatus(
          rfxChatStatus,
          result.google_chat_configured
            ? "Event thread is ready in Google Chat."
            : "Event thread is ready in Rateware. Connect Google Chat and save a Space to mirror it.",
          result.google_chat_configured ? "success" : "warning"
        );
      }
    }
    return result;
  } catch (error) {
    if (!options.silent) setStatus(rfxChatStatus, error.message, "error");
    return null;
  }
}

function renderLaneCoverage() {
  if (!laneCoverage && !coverageSummary) return;
  if (!selectedEventId) {
    if (coverageSummary) coverageSummary.textContent = "No event selected";
    if (laneCoverage) {
      laneCoverage.innerHTML = stateBlock({
        tone: "neutral",
        eyebrow: "Lane coverage",
        title: "Select a bid event",
        detail: "Choose or create an event to inspect lane coverage, shortlist depth, and bid response progress."
      });
    }
    return;
  }
  if (!currentLanes.length) {
    if (coverageSummary) coverageSummary.textContent = "No lanes";
    if (laneCoverage) {
      laneCoverage.innerHTML = stateBlock({
        tone: "neutral",
        eyebrow: "Lane coverage",
        title: "No lanes in this RFx yet",
        detail: "Paste the spot/RFx book above to create lanes, then shortlist carriers by lane."
      });
    }
    return;
  }

  const lanes = visibleLanes();
  const covered = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  if (coverageSummary) coverageSummary.textContent = `${formatNumber(covered)} / ${formatNumber(currentLanes.length)} lanes covered`;
  if (!laneCoverage) return;
  if (!lanes.length) {
    laneCoverage.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Filtered coverage",
      title: "No lanes match this filter",
      detail: `No lanes currently match ${laneDecisionLabel(activeLaneFilter).toLowerCase()}. Change the lane filter to continue.`
    });
    return;
  }
  laneCoverage.innerHTML = lanes.map((lane) => {
    const invitations = activeInvitations(lane);
    const bids = bidInvitations(lane);
    const bestBid = bestBidForLane(lane);
    const coverage = coverageRatio(lane);
    const responses = responseRatio(lane);
    const tone = bids.length ? "success" : invitations.length ? "neutral" : "danger";
    return `
      <article class="rfx-coverage-card ${lane.id === focusedLaneId ? "is-active" : ""}" data-tone="${tone}">
        <button type="button" data-rfx-focus-lane="${escapeHtml(lane.id)}">
          <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
          <span>${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</span>
        </button>
        <div class="coverage-meter" aria-label="Shortlist coverage">
          <span style="width: ${coverage}%"></span>
        </div>
        <small>${formatNumber(invitations.length)} vendors | ${formatNumber(bids.length)} bids | ${formatNumber(responses)}% response${bestBid ? ` | best ${formatMoney(bestBid.bid_rate, bestBid.currency || lane.currency)}` : ""}</small>
      </article>
    `;
  }).join("");
}

function renderLaneDecision() {
  if (!laneDecisionBody || !laneDecisionTitle || !laneDecisionStatusPill) return;
  const lane = currentLanes.find((item) => item.id === focusedLaneId) || visibleLanes()[0] || currentLanes[0];
  focusedLaneId = lane?.id || null;
  if (!lane) {
    laneDecisionTitle.textContent = "Select a lane";
    laneDecisionStatusPill.textContent = "No lane";
    laneDecisionStatusPill.className = "status-pill muted";
    laneDecisionBody.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Lane decision",
      title: "Select a lane",
      detail: "Pick a lane card or table row to compare Rateware benchmark, bids, spread, and shortlist status."
    });
    return;
  }

  const invitations = activeInvitations(lane);
  const bids = bidInvitations(lane);
  const bestBid = bestBidForLane(lane);
  const benchmark = lane.benchmark;
  const benchmarkAmount = Number(benchmark?.all_in_rate);
  const bestBidAmount = Number(bestBid?.bid_rate);
  const spread = bids.length
    ? Math.max(...bids.map((item) => Number(item.bid_rate)).filter(Number.isFinite)) - Math.min(...bids.map((item) => Number(item.bid_rate)).filter(Number.isFinite))
    : null;
  const decision = laneDecisionStatus(lane);
  laneDecisionTitle.textContent = `#${lane.lane_number || ""} ${laneRoute(lane)}`;
  laneDecisionStatusPill.textContent = laneDecisionLabel(decision);
  laneDecisionStatusPill.className = `status-pill ${decision === "has_bids" ? "success" : decision === "needs_shortlist" ? "danger" : "neutral"}`;
  laneDecisionBody.innerHTML = `
    <div class="rfx-decision-metrics">
      <article>
        <span>Rateware</span>
        <strong>${benchmark ? formatMoney(benchmark.all_in_rate, benchmark.currency) : "-"}</strong>
        <small>${escapeHtml(benchmark ? `${benchmark.vendor || "Benchmark"} | ${benchmark.score}% match` : "No benchmark")}</small>
      </article>
      <article>
        <span>Best bid</span>
        <strong>${bestBid ? formatMoney(bestBid.bid_rate, bestBid.currency || lane.currency) : "-"}</strong>
        <small>${escapeHtml(bestBid ? vendorLabel(bestBid) : "No response")}</small>
      </article>
      <article>
        <span>Bid vs Rateware</span>
        <strong>${Number.isFinite(bestBidAmount) && Number.isFinite(benchmarkAmount) ? formatMoney(bestBidAmount - benchmarkAmount, bestBid.currency || lane.currency) : "-"}</strong>
        <small>${Number.isFinite(bestBidAmount) && Number.isFinite(benchmarkAmount) && benchmarkAmount ? `${formatNumber(((bestBidAmount - benchmarkAmount) / benchmarkAmount) * 100, 1)}%` : "Pending"}</small>
      </article>
      <article>
        <span>Spread</span>
        <strong>${Number.isFinite(spread) ? formatMoney(spread, lane.currency) : "-"}</strong>
        <small>${formatNumber(bids.length)} bid(s)</small>
      </article>
    </div>
    <div class="rfx-lane-context">
      <span>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "Equipment pending")}</span>
      <span>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "Service pending")}</span>
      <span>${escapeHtml([lane.origin_market, lane.destination_market].filter(Boolean).join(" -> ") || "Market pending")}</span>
      <span>${escapeHtml([lane.weekly_volume ? `${lane.weekly_volume} / wk` : "", lane.target_rate ? `Target ${formatMoney(lane.target_rate, lane.currency)}` : ""].filter(Boolean).join(" | ") || "Volume pending")}</span>
    </div>
    <div class="rfx-lane-shortlist">
      ${invitations.length ? invitations.map((invitation) => `
        <article>
          <strong>${escapeHtml(vendorLabel(invitation))}</strong>
          ${statusChip(invitation.invitation_status || "drafted")}
          <span>${escapeHtml([invitation.vendors?.base_stage, invitation.vendors?.primary_email || invitation.vendors?.whatsapp_phone].filter(Boolean).join(" | ") || "No contact")}</span>
          <small>${escapeHtml(invitation.notes || "No fit note")}</small>
        </article>
      `).join("") : "<article>No vendors shortlisted.</article>"}
    </div>
  `;
}

function renderResponseBoard() {
  if (!responseBody || !responseSummary) return;
  const rows = visibleLanes()
    .flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })))
    .filter(({ invitation }) => commercialStatus(invitation.invitation_status) !== "drafted" || hasBid(invitation));
  const bidRows = rows.filter(({ invitation }) => hasBid(invitation));
  responseSummary.textContent = `${formatNumber(bidRows.length)} bids / ${formatNumber(rows.length)} active rows`;
  if (!rows.length) {
    responseBody.innerHTML = `<tr><td colspan="11">No carrier bids yet.</td></tr>`;
    return;
  }
  responseBody.innerHTML = rows.map(({ lane, invitation }) => {
    const laneRows = bidInvitations(lane)
      .map((bidInvitation) => ({
        lane,
        invitation: bidInvitation,
        amount: Number(bidInvitation.bid_rate),
        currency: bidInvitation.currency || lane.currency || "USD"
      }))
      .filter((row) => Number.isFinite(row.amount));
    const currentRow = laneRows.find((row) => row.invitation.id === invitation.id);
    const decision = currentRow ? procurementDecisionForBid(currentRow, laneRows) : null;
    const badges = currentRow ? decisionBadgesForBid(currentRow, laneRows) : [];
    const benchmark = lane.benchmark;
    const delta = Number(invitation.bid_delta);
    const deltaTone = Number.isFinite(delta) && delta <= 0 ? "success" : Number.isFinite(delta) ? "danger" : "neutral";
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}">
        <td><strong>${escapeHtml(vendorLabel(invitation))}</strong><small>${escapeHtml(invitation.vendors?.primary_email || invitation.vendors?.domain || "")}</small></td>
        <td>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</td>
        <td>${statusChip(invitation.invitation_status || "drafted")}</td>
        <td>
          ${decision ? `<span class="rfx-decision-score" data-score-tone="${decision.score >= 75 ? "strong" : decision.score >= 55 ? "medium" : "weak"}">${escapeHtml(decision.score)}</span>` : "-"}
          <small>${badges.slice(0, 2).map((badge) => badge.label).join(" | ")}</small>
        </td>
        <td>${invitation.bid_rate !== null ? formatMoney(invitation.bid_rate, invitation.currency || lane.currency) : "-"}</td>
        <td>${benchmark ? formatMoney(benchmark.all_in_rate, benchmark.currency) : "-"}</td>
        <td><span class="rfx-bid-delta" data-tone="${deltaTone}">${Number.isFinite(delta) ? formatMoney(delta, invitation.currency || lane.currency) : "-"}</span></td>
        <td><small>${escapeHtml(offerCommercialSummary(invitation))}</small></td>
        <td><small>${escapeHtml(offerAvailabilitySummary(invitation))}</small></td>
        <td>${escapeHtml(invitation.weekly_capacity ?? "-")}</td>
        <td>${escapeHtml(invitation.transit_days ?? "-")}</td>
      </tr>
    `;
  }).join("");
}

function renderTouchpoints() {
  if (!touchpointSummary || !touchpointList) return;
  const eventRows = selectedEventId
    ? contactHistoryRows.filter((row) => row.rfx_event_id === selectedEventId)
    : [];
  const sentOrReplied = eventRows.filter((row) => ["sent", "replied"].includes(row.status)).length;
  touchpointSummary.textContent = eventRows.length
    ? `${formatNumber(eventRows.length)} touchpoints | ${formatNumber(sentOrReplied)} sent/replied`
    : "No campaign activity loaded.";
  if (!selectedEventId) {
    touchpointList.innerHTML = "<article>Select a bid event to track invitation activity.</article>";
    return;
  }
  if (!eventRows.length) {
    touchpointList.innerHTML = "<article>No Gmail or WhatsApp activity for this event yet.</article>";
    return;
  }
  touchpointList.innerHTML = eventRows.slice(0, 8).map((row) => `
    <article>
      <span>${escapeHtml([row.channel, row.status, new Date(row.occurred_at || row.created_at).toLocaleString()].filter(Boolean).join(" | "))}</span>
      <strong>${escapeHtml(row.vendors?.vendor_name || row.vendors?.domain || "Vendor")}</strong>
      <small>${escapeHtml(row.outreach_campaigns?.name || row.rfx_events?.rfx_id || "")}</small>
      <p>${escapeHtml(row.body_preview || row.subject || "")}</p>
    </article>
  `).join("");
}

function messageRecipient(message) {
  return message.channel === "email"
    ? message.recipient_email || message.vendors?.primary_email || ""
    : message.recipient_phone || message.vendors?.whatsapp_phone || "";
}

function selectableEmailDrafts(rows = []) {
  return rows.filter((message) => {
    const status = String(message.status || "").toLowerCase();
    return message.channel === "email" && Boolean(message.recipient_email) && ["drafted", "queued", "failed"].includes(status);
  });
}

function draftRowsForEvent() {
  return selectedEventId
    ? outreachMessages.filter((message) => message.rfx_event_id === selectedEventId)
    : [];
}

function selectedDraftRows(rows = draftRowsForEvent()) {
  return rows.filter((message) => selectedDraftMessageIds.has(String(message.id)));
}

function selectedSendableDraftIds(rows = draftRowsForEvent()) {
  return selectableEmailDrafts(selectedDraftRows(rows)).map((message) => String(message.id));
}

function confirmBidRoomBulkAction(action, ids = []) {
  const count = formatNumber(ids.length);
  if (action === "auto_shortlist") {
    return window.confirm(`Auto-shortlist carriers for ${count} selected lane(s)? Rateware will add recommended CRM carriers to the Bid Room shortlist.`);
  }
  if (action === "mark_invited") {
    return window.confirm(`Mark ${count} selected participant row(s) as invited? Use this only after the invitation touchpoint is ready or already sent.`);
  }
  if (action === "archive_participants") {
    return window.confirm(`Archive ${count} selected participant row(s)? This removes them from the active Bid Room shortlist but keeps CRM vendors and lane history.`);
  }
  return true;
}

function confirmDraftQueueAction(action, ids = []) {
  const count = formatNumber(ids.length);
  if (action === "send") {
    return window.confirm(`Send ${count} individual email(s) from ${APPROVED_GMAIL_SENDER}? Each selected carrier will receive its own message.`);
  }
  if (action === "archive") {
    return window.confirm(`Archive ${count} selected draft row(s)? Drafts will be hidden from the active queue, but vendors and RFx lanes stay unchanged.`);
  }
  return true;
}

function updateDraftSendControls(rows = []) {
  const visibleIds = new Set(rows.map((message) => String(message.id)));
  selectedDraftMessageIds = new Set([...selectedDraftMessageIds].filter((id) => visibleIds.has(id)));
  const selectable = selectableEmailDrafts(rows);
  const selectedRows = selectedDraftRows(rows);
  const sendableSelectedIds = selectedSendableDraftIds(rows);
  if (draftSelectionLabel) {
    draftSelectionLabel.textContent = `${formatNumber(selectedRows.length)} selected`;
    draftSelectionLabel.className = `status-pill ${selectedRows.length ? "success" : "muted"}`;
  }
  if (draftToggleVisible) {
    draftToggleVisible.checked = rows.length > 0 && rows.every((message) => selectedDraftMessageIds.has(String(message.id)));
    draftToggleVisible.indeterminate = selectedRows.length > 0 && selectedRows.length < rows.length;
    draftToggleVisible.disabled = !rows.length;
  }
  if (draftSelectAllEmailsButton) draftSelectAllEmailsButton.disabled = !selectable.length;
  if (draftClearSelectionButton) draftClearSelectionButton.disabled = !selectedDraftMessageIds.size;
  if (draftSendSelectedButton) {
    draftSendSelectedButton.disabled = !sendableSelectedIds.length;
    draftSendSelectedButton.textContent = sendableSelectedIds.length
      ? `Send ${formatNumber(sendableSelectedIds.length)} email${sendableSelectedIds.length === 1 ? "" : "s"}`
      : "Send selected emails";
  }
  if (draftArchiveSelectedButton) draftArchiveSelectedButton.disabled = !selectedRows.length;
  if (draftDeleteSelectedButton) draftDeleteSelectedButton.disabled = !selectedRows.length;
}

function renderDraftQueue() {
  if (!draftSummary || !draftList) return;
  const rows = draftRowsForEvent();
  const actionable = rows.filter((message) => ["drafted", "queued", "failed"].includes(String(message.status || "").toLowerCase()));
  const emailSelectable = selectableEmailDrafts(rows);
  updateDraftSendControls(rows);
  draftSummary.textContent = rows.length
    ? `${formatNumber(rows.length)} draft rows | ${formatNumber(actionable.length)} need action | ${formatNumber(selectedDraftMessageIds.size)} selected`
    : "No drafts generated for this bid event.";
  if (!selectedEventId) {
    updateDraftSendControls([]);
    draftList.innerHTML = `<tr><td colspan="8">Select a bid event to review invitation drafts.</td></tr>`;
    return;
  }
  if (!rows.length) {
    updateDraftSendControls([]);
    draftList.innerHTML = `<tr><td colspan="8">Create invite drafts to review Gmail and WhatsApp messages inside this Bid Room.</td></tr>`;
    return;
  }
  if (!emailSelectable.length && rows.length) {
    updateDraftSendControls(rows);
  }
  const visibleRows = rows.slice(0, 200);
  draftList.innerHTML = visibleRows.map((message) => {
    const isEmail = message.channel === "email";
    const openUrl = isEmail ? message.gmail_compose_url : message.whatsapp_url;
    const checked = selectedDraftMessageIds.has(String(message.id));
    const preview = String(message.text_body || message.whatsapp_text || message.subject || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const status = String(message.status || "-").toLowerCase();
    const recipient = messageRecipient(message) || "-";
    const updated = message.updated_at || message.sent_at || message.created_at;
    return `
      <tr class="${checked ? "is-selected-row" : ""}" data-rfx-draft-id="${escapeHtml(message.id)}">
        <td><input type="checkbox" data-rfx-draft-select="${escapeHtml(message.id)}" ${checked ? "checked" : ""} /></td>
        <td>
          <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
          <small>${escapeHtml(message.rfx_lanes ? `${message.rfx_lanes.origin || "-"} -> ${message.rfx_lanes.destination || "-"}` : message.rfx_events?.rfx_id || "")}</small>
        </td>
        <td>${escapeHtml(recipient)}</td>
        <td>${escapeHtml(message.channel || "-")}</td>
        <td><span class="status-pill ${status === "sent" ? "success" : status === "failed" ? "danger" : status === "archived" ? "muted" : "neutral"}">${escapeHtml(status)}</span></td>
        <td>
          <strong>${escapeHtml(message.subject || "No subject")}</strong>
          <small>${escapeHtml(message.delivery_error || preview || "No preview")}</small>
        </td>
        <td>${escapeHtml(updated ? new Date(updated).toLocaleString() : "-")}</td>
        <td>
          <div class="rfx-draft-row-actions">
            <button class="secondary small-button" type="button" data-rfx-open-draft="${escapeHtml(openUrl || "")}" ${openUrl ? "" : "disabled"}>${isEmail ? "Open Gmail" : "Open WhatsApp"}</button>
            <button class="secondary small-button" type="button" data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="queued" ${status === "queued" || status === "sent" || status === "archived" ? "disabled" : ""}>Queue</button>
            <button class="secondary small-button" type="button" data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="archived" ${status === "archived" ? "disabled" : ""}>Archive</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") + (rows.length > visibleRows.length
    ? `<tr><td colspan="8">Showing first ${formatNumber(visibleRows.length)} of ${formatNumber(rows.length)} draft rows.</td></tr>`
    : "");
}

function renderOutreachLaunchpad() {
  if (rfxOutreachCampaignName && selectedEvent) {
    const defaultName = `${selectedEvent.rfx_id || "RFx"} invitation wave`;
    if (!rfxOutreachCampaignName.value || rfxOutreachCampaignName.dataset.autoName === "true") {
      rfxOutreachCampaignName.value = defaultName;
      rfxOutreachCampaignName.dataset.autoName = "true";
    }
  }
  renderOutreachTemplateSelect();
  renderOutreachPreview();
  renderTouchpoints();
  renderDraftQueue();
}

function updateMetrics() {
  const laneCount = events.reduce((sum, event) => sum + Number(event.lane_count || 0), 0);
  const inviteCount = events.reduce((sum, event) => sum + Number(event.invitation_count || 0), 0);
  const bidCount = events.reduce((sum, event) => sum + Number(event.bid_count || 0), 0);
  if (metricEvents) metricEvents.textContent = formatNumber(events.length);
  if (metricLanes) metricLanes.textContent = formatNumber(laneCount);
  if (metricInvites) metricInvites.textContent = formatNumber(inviteCount);
  if (metricBids) metricBids.textContent = formatNumber(bidCount);
}

function renderEvents() {
  updateMetrics();
  if (!events.length) {
    eventList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Bid events",
      title: "No bid events yet",
      detail: "Create a bid event, upload or paste lanes, then shortlist target carriers.",
      actionButton: '<button class="secondary small-button" type="button" data-rfx-focus-create>Create bid event</button>'
    });
    return;
  }
  eventList.innerHTML = events.map((event) => `
    <article class="rfx-event-card ${event.id === selectedEventId ? "is-active" : ""}" data-rfx-event-id="${escapeHtml(event.id)}">
      <button class="rfx-event-select" type="button" data-rfx-event-select="${escapeHtml(event.id)}">
        <span>${escapeHtml(event.status || "draft")}</span>
        <strong>${escapeHtml(event.name || event.rfx_id)}</strong>
        <small>${escapeHtml(event.rfx_id || "")}${event.customer ? ` | ${escapeHtml(event.customer)}` : ""}</small>
        <b>${formatNumber(event.lane_count)} lanes / ${formatNumber(event.bid_count)} bids</b>
        <small>${escapeHtml(bidVisibilityLabel(event.bid_visibility_mode))}</small>
      </button>
      <a class="secondary-link small-button rfx-marketplace-link" href="${escapeHtml(marketplaceUrlForEvent(event.id))}" target="_blank" rel="noreferrer" data-rfx-marketplace-link>
        Event marketplace
      </a>
    </article>
  `).join("");
}

function updateSelectionControls() {
  const laneCount = selectedLaneIds.size;
  const inviteCount = selectedInvitationIds.size;
  if (selectionCount) selectionCount.textContent = `${laneCount} lanes / ${inviteCount} vendors selected`;
  if (autoShortlistButton) autoShortlistButton.disabled = !laneCount;
  if (inviteSelectedButton) inviteSelectedButton.disabled = !inviteCount;
  if (archiveSelectedButton) archiveSelectedButton.disabled = !inviteCount;
}

function splitTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function selectedSegmentId() {
  return manualShortlistSegment?.value || "all";
}

function selectedSavedVendorSegment() {
  const segmentId = selectedSegmentId();
  if (!segmentId || segmentId === "all" || segmentId === "procurement") return null;
  return savedVendorSegments.find((item) => item.id === segmentId) || null;
}

function segmentVendorIds(segment) {
  if (!segment) return [];
  if (Array.isArray(segment.vendor_ids)) return segment.vendor_ids.map((id) => String(id)).filter(Boolean);
  return String(segment.vendor_ids || "")
    .split(/[,\s;|]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function segmentMatchesVendor(segment, vendor) {
  const vendorIds = segmentVendorIds(segment);
  if (vendorIds.length) return vendorIds.includes(String(vendor.id || ""));
  const vendorTags = splitTags(vendor.tags);
  const requiredTags = splitTags(segment.tags);
  const hasTags = requiredTags.every((tag) => vendorTags.includes(tag));
  const hasStatus = !segment.status || vendor.status === segment.status;
  const hasChannel = !segment.preferred_channel || vendor.preferred_channel === segment.preferred_channel;
  return hasTags && hasStatus && hasChannel;
}

function vendorSearchText(row) {
  return [
    row.vendor_name,
    row.name,
    row.legal_name,
    row.contact_name,
    row.domain,
    row.primary_email,
    row.whatsapp_phone,
    row.preferred_channel,
    row.base_stage,
    row.funnel_stage,
    row.status,
    row.coverage_notes,
    row.notes,
    ...(Array.isArray(row.secondary_emails) ? row.secondary_emails : []),
    ...(Array.isArray(row.tags) ? row.tags : [])
  ]
    .filter(Boolean)
    .map(normalizeLookupText)
    .join(" ");
}

function vendorDisplayName(row) {
  return row.vendor_name || row.domain || row.primary_email || "Unnamed carrier";
}

function vendorStageRank(row) {
  const stage = String(row.base_stage || "").toLowerCase();
  const funnel = String(row.funnel_stage || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();
  if (stage === "procurement") return 0;
  if (["targeted", "nested", "drafted", "invited", "onboarded", "trained", "activated", "completed"].includes(funnel)) return 1;
  if (status === "active") return 2;
  if (stage === "sourcing") return 3;
  if (stage === "archived" || status === "archived") return 9;
  return 4;
}

function isProcurementCarrier(row) {
  return vendorStageRank(row) <= 1;
}

function sortedVendorOptions(rows) {
  return [...rows].sort((a, b) => {
    const stageDelta = vendorStageRank(a) - vendorStageRank(b);
    if (stageDelta) return stageDelta;
    return vendorDisplayName(a).localeCompare(vendorDisplayName(b));
  });
}

function mergeVendorOptionRows(rows = []) {
  const byId = new Map(vendorOptions.map((vendor) => [String(vendor.id || ""), vendor]));
  rows.forEach((row) => {
    const id = String(row.id || "");
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...row });
  });
  vendorOptions = sortedVendorOptions([...byId.values()]);
}

async function loadVendorSearchOptions() {
  const rawTerm = String(manualShortlistSearch?.value || "").trim();
  const term = rawTerm.replace(/\s+/g, " ");
  vendorSearchSequence += 1;
  const sequence = vendorSearchSequence;
  if (term.length < 2) {
    vendorSearchLoading = false;
    renderManualShortlistControls();
    return;
  }
  vendorSearchLoading = true;
  renderManualShortlistControls();
  try {
    const result = await fetchVendors({ limit: 100, offset: 0, view: "all", lightweight: true, search: term });
    if (sequence !== vendorSearchSequence) return;
    const rows = result.rows || [];
    mergeVendorOptionRows(rows);
    vendorSearchLoading = false;
    renderManualShortlistControls();
    if (rows.length) {
      setStatus(manualShortlistStatus, `${formatNumber(rows.length)} CRM match(es) loaded for "${term}".`, "success");
    }
  } catch (error) {
    if (sequence !== vendorSearchSequence) return;
    vendorSearchLoading = false;
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `CRM search failed: ${humanizeError(error.message)}`, "error");
  }
}

function queueVendorSearchLoad() {
  if (vendorSearchTimer) window.clearTimeout(vendorSearchTimer);
  vendorSearchTimer = window.setTimeout(loadVendorSearchOptions, 280);
}

function renderManualSegmentOptions() {
  if (!manualShortlistSegment) return;
  const currentValue = manualShortlistSegment.value || "all";
  const segmentOptions = savedVendorSegments.map((segment) => {
    const matchCount = vendorOptions.filter((vendor) => vendorStageRank(vendor) < 9 && segmentMatchesVendor(segment, vendor)).length;
    const isParticipantTemplate = segment.segment_type === "participant_template" || segmentVendorIds(segment).length;
    const suffix = matchCount ? ` (${formatNumber(matchCount)})` : "";
    const labelSuffix = isParticipantTemplate ? " · template" : "";
    return `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.segment_name || "Saved segment")}${labelSuffix}${suffix}</option>`;
  }).join("");
  manualShortlistSegment.innerHTML = `
    <option value="all">All active CRM carriers</option>
    <option value="procurement">Procurement / Pipeline (${formatNumber(vendorOptions.filter(isProcurementCarrier).length)})</option>
    ${segmentOptions}
  `;
  if ([...manualShortlistSegment.options].some((option) => option.value === currentValue)) {
    manualShortlistSegment.value = currentValue;
  }
}

function segmentCandidateRows(segmentId = selectedSegmentId()) {
  const activeRows = vendorOptions.filter((vendor) => vendorStageRank(vendor) < 9);
  const segment = savedVendorSegments.find((item) => item.id === segmentId);
  return segmentId === "procurement"
    ? activeRows.filter(isProcurementCarrier)
    : segment
      ? activeRows.filter((vendor) => segmentMatchesVendor(segment, vendor))
      : activeRows;
}

function shortlistCandidateRows() {
  const term = normalizeLookupText(manualShortlistSearch?.value || "");
  const segmentRows = segmentCandidateRows();
  const filtered = segmentRows.filter((vendor) => !term || vendorSearchText(vendor).includes(term));
  return sortedVendorOptions(filtered);
}

function vendorLookupMaps() {
  const byId = new Map();
  const byDomain = new Map();
  const byEmail = new Map();
  const byName = new Map();
  vendorOptions.forEach((vendor) => {
    if (vendor.id && !byId.has(String(vendor.id))) byId.set(String(vendor.id), vendor);
    const domain = normalizeDomain(vendor.domain || vendor.primary_email);
    const email = String(vendor.primary_email || "").trim().toLowerCase();
    const name = normalizeLookupText(vendor.vendor_name);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, vendor);
    if (email && !byEmail.has(email)) byEmail.set(email, vendor);
    if (name && !byName.has(name)) byName.set(name, vendor);
  });
  return { byId, byDomain, byEmail, byName };
}

function matchCarrierTemplateVendor(row, maps = vendorLookupMaps()) {
  const id = String(row.vendor_id || "").trim();
  if (id && maps.byId.has(id)) {
    return { vendor: maps.byId.get(id), method: "crm id" };
  }
  const domain = normalizeDomain(row.vendor_domain || row.vendor_email);
  if (domain && maps.byDomain.has(domain)) {
    return { vendor: maps.byDomain.get(domain), method: "domain" };
  }
  const email = String(row.vendor_email || "").trim().toLowerCase();
  if (email && maps.byEmail.has(email)) {
    return { vendor: maps.byEmail.get(email), method: "email" };
  }
  const name = normalizeLookupText(row.vendor_name);
  if (name && maps.byName.has(name)) {
    return { vendor: maps.byName.get(name), method: "name" };
  }
  return { vendor: null, method: "" };
}

function evaluateCarrierTemplateRows(rows = pendingCarrierTemplateRows) {
  const maps = vendorLookupMaps();
  return rows.map((row, index) => {
    const issues = [];
    const vendorMatch = matchCarrierTemplateVendor(row, maps);
    if (row.participate && !currentLanes.length) issues.push("no lanes in bid event");
    if (row.participate && !vendorMatch.vendor) issues.push("carrier not found in CRM");
    if (row.participate && !row.vendor_id && !row.vendor_domain && !row.vendor_email && !row.vendor_name) issues.push("carrier identifier missing");
    return {
      index,
      row,
      lanes: row.participate ? currentLanes : [],
      laneLabel: row.participate ? "All event lanes" : "Not selected",
      laneMethod: row.participate ? "event" : "not_selected",
      vendor: vendorMatch.vendor,
      vendorMethod: vendorMatch.method,
      issues
    };
  });
}

function readyCarrierTemplateMatches() {
  return pendingCarrierTemplateMatches.filter((item) => item.row.participate && !item.issues.length);
}

function updateCarrierTemplateButton() {
  if (!importCarrierTemplateButton) return;
  importCarrierTemplateButton.disabled = !selectedEventId || !readyCarrierTemplateMatches().length;
}

function renderCarrierTemplatePreview() {
  if (!carrierTemplatePreview || !carrierTemplatePreviewBody) return;
  pendingCarrierTemplateMatches = evaluateCarrierTemplateRows();
  const readyRows = readyCarrierTemplateMatches();
  const selectedRows = pendingCarrierTemplateMatches.filter((item) => item.row.participate);
  const skippedRows = pendingCarrierTemplateMatches.length - selectedRows.length;
  carrierTemplatePreview.hidden = !pendingCarrierTemplateMatches.length;
  const previewRows = [
    ...selectedRows,
    ...pendingCarrierTemplateMatches.filter((item) => !item.row.participate)
  ].slice(0, 18);
  carrierTemplatePreviewBody.innerHTML = previewRows.map((item) => {
    const input = item.row.vendor_domain || item.row.vendor_email || item.row.vendor_name || "-";
    const match = item.vendor ? `${vendorDisplayName(item.vendor)} (${item.vendorMethod})` : "-";
    const status = !item.row.participate ? "not selected" : item.issues.length ? item.issues.join(", ") : "ready";
    return `
      <tr class="${item.issues.length ? "is-muted-row" : ""}">
        <td>${item.row.participate ? "TRUE" : "FALSE"}</td>
        <td>${escapeHtml(input)}</td>
        <td>${escapeHtml(match)}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  }).join("");
  const blocked = selectedRows.length - readyRows.length;
  const suffix = selectedEventId ? "" : " Select or create a bid event before import.";
  const message = `${readyRows.length} selected carrier(s) ready. ${blocked} selected row(s) need CRM cleanup. ${skippedRows} catalog row(s) not selected.${suffix}`;
  setStatus(carrierTemplateStatus, message, readyRows.length ? "success" : "error");
  updateCarrierTemplateButton();
}

function clearCarrierTemplateImport({ preserveStatus = false } = {}) {
  pendingCarrierTemplateRows = [];
  pendingCarrierTemplateMatches = [];
  if (carrierTemplateFileInput) carrierTemplateFileInput.value = "";
  if (carrierTemplatePreview) carrierTemplatePreview.hidden = true;
  if (carrierTemplatePreviewBody) carrierTemplatePreviewBody.innerHTML = "";
  if (!preserveStatus) setStatus(carrierTemplateStatus, "Upload the edited CRM catalog to import TRUE participant carriers.");
  updateCarrierTemplateButton();
}

function renderCrmVendorCandidate(row) {
  const isSelected = selectedManualVendorIdsState.has(row.id);
  return `
    <article class="bid-room-crm-vendor-option ${isSelected ? "is-selected" : ""}">
      <span class="crm-vendor-main">
        <strong>${escapeHtml(vendorDisplayName(row))}</strong>
      </span>
      <button class="secondary small-button" type="button" data-add-manual-vendor="${escapeHtml(row.id)}" ${isSelected ? "disabled" : ""}>
        ${isSelected ? "Selected" : "Add"}
      </button>
    </article>
  `;
}

function selectedManualVendorIds() {
  selectedManualVendorIdsState = new Set([...selectedManualVendorIdsState].filter((id) => vendorOptions.some((vendor) => vendor.id === id)));
  return [...selectedManualVendorIdsState];
}

function visibleManualVendorIds() {
  return shortlistCandidateRows().slice(0, 80).map((vendor) => vendor.id).filter(Boolean);
}

function selectManualVendorIds(ids = []) {
  ids.forEach((id) => {
    if (id) selectedManualVendorIdsState.add(id);
  });
  renderManualShortlistControls();
}

function participantTemplatePayload(segment, vendorIds, name) {
  return {
    segment_name: name || segment?.segment_name || "Bid participant template",
    segment_type: "participant_template",
    vendor_ids: vendorIds,
    tags: Array.isArray(segment?.tags) && segment.tags.length ? segment.tags : ["bid-room-template"],
    description: segment?.description || `Bid Room participant template with ${vendorIds.length} carrier(s).`,
    notes: segment?.notes || "Saved from Bid Room selected participants.",
    status: segment?.status || null,
    preferred_channel: segment?.preferred_channel || null
  };
}

function selectedManualVendorRows() {
  const selectedIds = selectedManualVendorIds();
  const rows = selectedIds
    .map((id) => vendorOptions.find((vendor) => vendor.id === id))
    .filter(Boolean);
  return sortedVendorOptions(rows);
}

function renderSelectedManualVendors() {
  if (!manualShortlistSelectedList || !manualShortlistSelectedCount) return;
  const rows = selectedManualVendorRows();
  manualShortlistSelectedCount.textContent = `${formatNumber(rows.length)} selected`;
  if (!rows.length) {
    manualShortlistSelectedList.innerHTML = `
      <article class="bid-room-selected-empty">
        <strong>No carriers selected</strong>
        <span>Select carriers from the left list or use a saved segment.</span>
      </article>
    `;
    return;
  }
  manualShortlistSelectedList.innerHTML = rows.map((vendor) => `
    <article class="bid-room-selected-row">
      <strong>${escapeHtml(vendorDisplayName(vendor))}</strong>
      <button class="secondary small-button" type="button" data-remove-manual-vendor="${escapeHtml(vendor.id)}">Move back</button>
    </article>
  `).join("");
}

function updateManualShortlistButtonState() {
  if (!manualShortlistButton) return;
  const selectedCount = selectedManualVendorIds().length;
  manualShortlistButton.disabled = !selectedEventId || !currentLanes.length || !selectedCount;
  if (!selectedEventId) {
    manualShortlistButton.textContent = selectedCount ? "Create event to add selected" : "Add selected to bid";
    return;
  }
  if (!currentLanes.length) {
    manualShortlistButton.textContent = selectedCount ? "Import lane book to add selected" : "Add selected to bid";
    return;
  }
  manualShortlistButton.textContent = selectedCount ? `Add ${formatNumber(selectedCount)} selected to bid` : "Add selected to bid";
}

function updateParticipantTemplateControls() {
  const selectedCount = selectedManualVendorIds().length;
  const selectedSegment = selectedSavedVendorSegment();
  if (saveManualShortlistTemplateButton) {
    saveManualShortlistTemplateButton.disabled = !selectedCount || vendorSegmentsLoading;
  }
  if (loadManualShortlistTemplateButton) {
    const segmentId = selectedSegmentId();
    const rows = segmentId === "all" ? [] : segmentCandidateRows(segmentId);
    loadManualShortlistTemplateButton.disabled = vendorOptionsLoading || vendorSegmentsLoading || !rows.length;
    loadManualShortlistTemplateButton.textContent = rows.length
      ? `Load ${formatNumber(rows.length)} from saved list`
      : "Load saved list";
  }
  if (updateManualShortlistTemplateButton) {
    updateManualShortlistTemplateButton.disabled = !selectedSegment || !selectedCount || vendorSegmentsLoading;
  }
  if (deleteManualShortlistTemplateButton) {
    deleteManualShortlistTemplateButton.disabled = !selectedSegment || vendorSegmentsLoading;
  }
}

function renderManualShortlistControls() {
  if (!manualShortlistLane || !manualShortlistVendors) return;
  renderSelectedManualVendors();
  renderManualSegmentOptions();
  manualShortlistLane.innerHTML = currentLanes.map((lane) => `
    <option value="${escapeHtml(lane.id)}">#${escapeHtml(lane.lane_number || "")} ${escapeHtml(lane.origin || "-")} -> ${escapeHtml(lane.destination || "-")}</option>
  `).join("");
  const procurementCount = vendorOptions.filter(isProcurementCarrier).length;
  if (manualShortlistSourceSummary) {
    manualShortlistSourceSummary.textContent = vendorOptionsLoading
      ? `Loading Carrier CRM${vendorOptions.length ? `... ${formatNumber(vendorOptions.length)} carrier(s) ready so far` : "..."}`
      : vendorSearchLoading
        ? `Searching Carrier CRM... ${formatNumber(vendorOptions.length)} carrier(s) loaded`
      : `${vendorOptions.length} CRM carrier(s) loaded | ${procurementCount} in Procurement/Pipeline | ${vendorSegmentsLoading ? "loading segments" : `${savedVendorSegments.length} saved segment(s)`}`;
  }
  if (vendorOptionsLoading && !vendorOptions.length) {
    if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = true;
    if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = true;
    if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = true;
    updateParticipantTemplateControls();
    manualShortlistVendors.innerHTML = "";
    if (manualShortlistVendorList) {
      manualShortlistVendorList.innerHTML = `
        <article class="bid-room-crm-vendor-empty">
          <strong>Loading Carrier CRM...</strong>
          <span>Fetching carriers, procurement vendors, and saved segments.</span>
        </article>
      `;
    }
    updateManualShortlistButtonState();
    return;
  }
  if (!vendorOptions.length) {
    if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = true;
    if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = true;
    if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = true;
    updateParticipantTemplateControls();
    manualShortlistVendors.innerHTML = "";
    if (manualShortlistVendorList) {
      manualShortlistVendorList.innerHTML = `
        <article class="bid-room-crm-vendor-empty">
          <strong>No CRM carriers loaded.</strong>
          <span>Refresh the page or check Carrier CRM. You can still upload a participant catalog after CRM is available.</span>
        </article>
      `;
    }
    updateManualShortlistButtonState();
    return;
  }
  const rows = shortlistCandidateRows();
  if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = !rows.length;
  if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = !rows.length;
  if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = !selectedManualVendorIdsState.size;
  manualShortlistVendors.innerHTML = rows.map((vendor) => `
    <option value="${escapeHtml(vendor.id)}">${escapeHtml(vendorDisplayName(vendor))} | ${escapeHtml(vendor.base_stage || "crm")} | ${escapeHtml(vendor.primary_email || vendor.domain || "")}</option>
  `).join("");
  if (manualShortlistVendorList) {
    const visibleRows = rows.slice(0, 80);
    const listSummary = `
      <div class="bid-room-crm-list-summary">
        <strong>Carrier CRM candidates</strong>
        <span>${vendorSearchLoading ? "Searching CRM..." : `Showing ${Math.min(visibleRows.length, rows.length)} of ${rows.length}.`} Select carriers now, save them as a template, then add them after the event and lane book are ready.</span>
      </div>
    `;
    manualShortlistVendorList.innerHTML = visibleRows.length ? `${listSummary}${visibleRows.map(renderCrmVendorCandidate).join("")}` : vendorSearchLoading ? `
      ${listSummary}
      <article class="bid-room-crm-vendor-empty">
        <strong>Searching Carrier CRM...</strong>
        <span>Looking across vendor name, domain, contact, email, tags, notes and coverage.</span>
      </article>
    ` : `
      <article class="bid-room-crm-vendor-empty">
        <strong>No CRM carriers match this search.</strong>
        <span>Clear the search or add/update carriers in Carrier CRM.</span>
      </article>
    `;
    manualShortlistVendorList.dataset.totalMatches = String(rows.length);
  }
  updateManualShortlistButtonState();
  updateParticipantTemplateControls();
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
        ${statusChip(invitation.invitation_status || "drafted")}
        <small>${escapeHtml([invitation.vendors?.primary_email, invitation.vendors?.whatsapp_phone].filter(Boolean).join(" | ") || "No contact channel")}</small>
      </div>
      <input data-rfx-bid-field="bid_rate" value="${escapeHtml(invitation.bid_rate ?? "")}" placeholder="Rate" inputmode="decimal" />
      <input data-rfx-bid-field="weekly_capacity" value="${escapeHtml(invitation.weekly_capacity ?? "")}" placeholder="Cap" inputmode="decimal" />
      <input data-rfx-bid-field="transit_days" value="${escapeHtml(invitation.transit_days ?? "")}" placeholder="Days" inputmode="decimal" />
      <input data-rfx-bid-field="currency" value="${escapeHtml(invitation.currency || lane.currency || "USD")}" class="short-input" />
      <button class="small-button" type="button" data-rfx-save-bid="${escapeHtml(invitation.id)}">Save bid</button>
      <button class="secondary small-button" type="button" data-rfx-copy-link="${escapeHtml(invitation.invitation_token)}">Copy link</button>
      <button class="secondary small-button" type="button" data-rfx-open-link="${escapeHtml(invitation.invitation_token)}">Open link</button>
      <span class="rfx-bid-delta" data-tone="${deltaTone}">${hasDelta ? `${bidDelta >= 0 ? "+" : ""}${formatMoney(bidDelta, invitation.currency)}` : "-"}</span>
    </article>
  `;
}

function renderLanes() {
  selectedLaneIds = new Set([...selectedLaneIds].filter((id) => currentLanes.some((lane) => lane.id === id)));
  selectedInvitationIds = new Set([...selectedInvitationIds].filter((id) => currentLanes.some((lane) => (lane.invitations || []).some((invite) => invite.id === id))));
  updateSelectionControls();
  renderManualShortlistControls();
  if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
  renderEventDashboard();
  renderLaneCoverage();
  renderLaneDecision();
  renderResponseBoard();
  renderOutreachLaunchpad();
  renderLiveOfferManager();
  renderAwardBoard();
  renderWizard();

  if (!selectedEventId) {
    lanesBody.innerHTML = tableState(9, {
      tone: "neutral",
      eyebrow: "Business book",
      title: "Select an event to load lanes",
      detail: "Choose a bid event from the left panel or create a new event."
    });
    return;
  }
  if (!currentLanes.length) {
    lanesBody.innerHTML = tableState(9, {
      tone: "neutral",
      eyebrow: "Business book",
      title: "No lanes in this RFx yet",
      detail: "Paste lane rows above to build this spot/RFx book before inviting vendors."
    });
    return;
  }
  const lanes = visibleLanes();
  if (!lanes.length) {
    lanesBody.innerHTML = tableState(9, {
      tone: "neutral",
      eyebrow: "Filtered lanes",
      title: "No lanes match current filters",
      detail: "Change the decision filter or search criteria to review more lanes."
    });
    return;
  }
  lanesBody.innerHTML = lanes.map((lane) => {
    const benchmark = lane.benchmark;
    const invitations = lane.invitations || [];
    const bestBid = bestBidForLane(lane);
    const decision = laneDecisionStatus(lane);
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}" class="${lane.id === focusedLaneId ? "is-selected-lane" : ""}">
        <td>
          <label class="table-checkbox">
            <input type="checkbox" data-rfx-lane-select="${escapeHtml(lane.id)}" ${selectedLaneIds.has(lane.id) ? "checked" : ""} />
          </label>
        </td>
        <td>
          <strong>#${escapeHtml(lane.lane_number || "")}</strong>
          <span>${escapeHtml(lane.service || "")}</span>
          <small>${escapeHtml(laneDecisionLabel(decision))}</small>
        </td>
        <td>${escapeHtml(lane.origin || "-")}<small>${escapeHtml([lane.origin_market, lane.origin_region].filter(Boolean).join(" | "))}</small></td>
        <td>${escapeHtml(lane.destination || "-")}<small>${escapeHtml([lane.destination_market, lane.destination_region].filter(Boolean).join(" | "))}</small></td>
        <td>${escapeHtml([lane.equipment, lane.trailer, lane.config, lane.operation].filter(Boolean).join(" / ") || "-")}</td>
        <td>${formatNumber(lane.weekly_volume)} / wk<small>Target ${formatMoney(lane.target_rate, lane.currency)}</small></td>
        <td>
          ${benchmark ? `${formatMoney(benchmark.all_in_rate, benchmark.currency)}<small>${escapeHtml(benchmark.vendor || "Rateware")} | ${benchmark.score}%</small>` : "-"}
          ${bestBid ? `<small>Best bid ${formatMoney(bestBid.bid_rate, bestBid.currency || lane.currency)}</small>` : ""}
        </td>
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
    if (!selectedEventId && requestedRfxEventId && events.some((event) => event.id === requestedRfxEventId)) {
      selectedEventId = requestedRfxEventId;
    }
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      selectedEventId = null;
    }
    if (!selectedEventId && events[0]) selectedEventId = events[0].id;
    renderEvents();
    if (selectedEventId) await loadDetail(selectedEventId);
    else {
      selectedEvent = null;
      currentLanes = [];
      contactHistoryRows = [];
      outreachMessages = [];
      focusedLaneId = null;
      updateEventActionState();
      renderEventDashboard();
      renderLaneCoverage();
      renderLaneDecision();
      renderResponseBoard();
      renderOutreachLaunchpad();
      renderLiveOfferManager();
      renderAwardBoard();
      renderWizard();
    }
  } catch (error) {
    eventList.innerHTML = errorState(error, {
      title: "Bid events could not load",
      retryAction: "load-rfx-events",
      meta: "No Bid Room data was changed."
    });
    lanesBody.innerHTML = tableErrorState(9, error, {
      title: "Business book lanes could not load",
      retryAction: "load-rfx-events"
    });
    renderWizard();
  }
}

async function loadVendorOptions() {
  vendorOptionsLoading = true;
  vendorOptions = [];
  renderManualShortlistControls();
  const pageSize = 250;
  const rows = [];
  const seenIds = new Set();
  let total = 0;
  try {
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const result = await fetchVendors({ limit: pageSize, offset, view: "all", lightweight: true });
      const pageRows = result.rows || [];
      total = Number(result.total || 0);
      for (const row of pageRows) {
        const id = String(row.id || "");
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        rows.push(row);
      }
      mergeVendorOptionRows(pageRows);
      renderManualShortlistControls();
      if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
      if (!pageRows.length) break;
      if (total && rows.length >= total) break;
      if (pageRows.length < pageSize) break;
    }
    mergeVendorOptionRows(rows);
    vendorOptionsLoading = false;
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
  } catch (error) {
    mergeVendorOptionRows(rows);
    vendorOptionsLoading = false;
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
    setStatus(
      manualShortlistStatus,
      rows.length
        ? `Carrier CRM partially loaded with ${formatNumber(rows.length)} carrier(s). ${humanizeError(error.message)}`
        : `Carrier CRM could not load. ${humanizeError(error.message)}`,
      rows.length ? "warning" : "error"
    );
  }
}

async function loadVendorSegments() {
  vendorSegmentsLoading = true;
  renderManualShortlistControls();
  try {
    savedVendorSegments = await fetchVendorSegments();
  } catch (error) {
    savedVendorSegments = [];
    setStatus(manualShortlistStatus, `Carrier segments could not load: ${humanizeError(error.message)}`, "error");
  } finally {
    vendorSegmentsLoading = false;
    renderManualShortlistControls();
  }
}

async function loadOutreachAssets() {
  try {
    outreachTemplates = await fetchOutreachTemplates();
    renderOutreachLaunchpad();
  } catch (error) {
    outreachTemplates = [];
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, error.message, "error");
  }
}

async function loadDetail(eventId) {
  if (selectedEventId !== eventId) selectedDraftMessageIds.clear();
  selectedEventId = eventId;
  if (bidRoomChatRefreshTimer) window.clearInterval(bidRoomChatRefreshTimer);
  setStatus(actionStatus, "Loading RFx detail...");
  try {
    const detail = await fetchRfxDetail(eventId);
    selectedEvent = detail.event;
    currentLanes = detail.lanes || [];
    contactHistoryRows = [];
    outreachMessages = [];
    bidRoomChatThreads = emptyBidRoomChatThreads();
    if (!currentLanes.some((lane) => lane.id === focusedLaneId)) focusedLaneId = currentLanes[0]?.id || null;
    detailTitle.textContent = `${selectedEvent.name || selectedEvent.rfx_id} (${selectedEvent.status})`;
    updateLaneImportButton();
    updateEventActionState();
    renderEvents();
    renderLanes();
    renderEventDashboard();
    renderLaneCoverage();
    renderBidRoomChat();
    renderOutreachLaunchpad();
    setStatus(actionStatus, "Bid Room core loaded. Loading outreach and chat context...");

    const [historyResult, messagesResult, chatResult] = await Promise.allSettled([
      fetchContactHistory({ rfx_event_id: eventId }),
      fetchOutreachMessages({ rfx_event_id: eventId }),
      fetchBidRoomChat(eventId)
    ]);
    contactHistoryRows = getSettledValue(historyResult, []) || [];
    outreachMessages = getSettledValue(messagesResult, []) || [];
    bidRoomChatThreads = getSettledValue(chatResult, emptyBidRoomChatThreads()) || emptyBidRoomChatThreads();
    renderEventDashboard();
    renderLanes();
    renderBidRoomChat();
    renderOutreachLaunchpad();

    bidRoomChatRefreshTimer = window.setInterval(() => {
      if (selectedEventId === eventId) loadBidRoomChat();
    }, 15000);
    const warnings = [
      getSettledWarning(historyResult, "Contact history"),
      getSettledWarning(messagesResult, "Outreach queue"),
      getSettledWarning(chatResult, "Bid Room chat")
    ].filter(Boolean);
    setStatus(
      actionStatus,
      warnings.length
        ? `Bid Room loaded. ${warnings.join(" ")} Core event, lanes and participants are still available.`
        : "Bid Room loaded.",
      warnings.length ? "warning" : "success"
    );
    ensureSelectedEventChatThread(eventId, { silent: true });
  } catch (error) {
    setStatus(actionStatus, humanizeError(error.message), "error");
    updateEventActionState();
  }
}

function activateWorkbenchView(view, focusTarget = null) {
  const activeView = rfxWorkbench?.activate(view, focusTarget ? { focusTarget } : {}) || view;
  const url = new URL(window.location.href);
  url.searchParams.set("view", activeView);
  window.history.replaceState({}, "", url);
}

async function autoShortlistLane(laneId) {
  setStatus(actionStatus, "Building shortlist...");
  const result = await autoShortlistRfxLane(laneId, 10);
  setStatus(actionStatus, `${result.inserted || 0} vendor(s) shortlisted.`, "success");
}

async function autoShortlistLaneIds(ids, statusElement = actionStatus) {
  const laneIds = ids.filter(Boolean);
  if (!laneIds.length) return 0;
  setStatus(statusElement, "Building shortlists...");
  let inserted = 0;
  for (const id of laneIds) {
    const result = await autoShortlistRfxLane(id, 10);
    inserted += Number(result.inserted || 0);
  }
  setStatus(statusElement, `${inserted} vendor shortlist row(s) created.`, "success");
  selectedLaneIds.clear();
  await loadDetail(selectedEventId);
  return inserted;
}

async function createCurrentOutreachDrafts(statusElement = rfxOutreachStatus) {
  if (!selectedEventId) {
    blockIfLaunchPreflightFails(statusElement);
    return null;
  }
  if (blockIfLaunchPreflightFails(statusElement)) return null;
  const template = selectedOutreachTemplate();
  const targets = outreachTargetInvitations();
  if (!template) {
    setStatus(statusElement, "Select an outreach template before creating drafts.", "error");
    return null;
  }
  if (!targets.length) {
    setStatus(statusElement, "Shortlist at least one vendor before creating campaign drafts.", "error");
    return null;
  }
  if (rfxTemplateEditorDirty || rfxTemplateVisualEditing) {
    setStatus(statusElement, "Save the edited email preview before generating draft queue.", "error");
    return null;
  }
  const invitationIds = selectedInvitationIds.size
    ? [...selectedInvitationIds]
    : targets.map(({ invitation }) => invitation.id);
  if (createRfxOutreachCampaignButton) createRfxOutreachCampaignButton.disabled = true;
  setStatus(statusElement, "Creating campaign and generating drafts...");
  const campaign = await createOutreachCampaign({
    name: rfxOutreachCampaignName?.value || `${selectedEvent?.rfx_id || "RFx"} invitation wave`,
    rfx_event_id: selectedEventId,
    template_id: template.id,
    channel: rfxOutreachChannel?.value || "multi",
    sender_email: rfxOutreachSender?.value || APPROVED_GMAIL_SENDER,
    sender_label: rfxOutreachSender?.selectedOptions?.[0]?.textContent || rfxOutreachSender?.value || APPROVED_GMAIL_SENDER,
    sender_connection_status: "draft_only"
  });
  const result = await generateOutreachDrafts(campaign.id, {
    invitationIds,
    senderEmail: campaign.sender_email,
    senderLabel: campaign.sender_label,
    senderConnectionStatus: campaign.sender_connection_status
  });
  [contactHistoryRows, outreachMessages] = await Promise.all([
    fetchContactHistory({ rfx_event_id: selectedEventId }),
    fetchOutreachMessages({ rfx_event_id: selectedEventId })
  ]);
  renderOutreachLaunchpad();
  setStatus(
    statusElement,
    `${result.generated || 0} draft(s) created. ${result.skipped?.length || 0} skipped for missing contact data.`,
    "success"
  );
  await loadDetail(selectedEventId);
  return result;
}

async function applyRfxAwardDecision(invitationId, role, defaultReason = "") {
  if (!selectedEventId || !invitationId) return;
  const label = role === "primary" ? "primary award" : "backup";
  const reason = window.prompt(`Reason for ${label}:`, defaultReason || "Procurement decision");
  if (reason === null) return;
  setStatus(rfxAwardStatus, role === "primary" ? "Saving primary award..." : "Saving backup carrier...");
  try {
    await awardRfxLaneVendor(invitationId, {
      award_role: role,
      award_reason: reason || defaultReason || "Procurement decision"
    });
    setStatus(rfxAwardStatus, role === "primary" ? "Primary award saved." : "Backup carrier saved.", "success");
    await loadDetail(selectedEventId);
    activateWorkbenchView("award");
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
  }
}

async function clearRfxAwardDecision(invitationId) {
  if (!selectedEventId || !invitationId) return;
  if (!window.confirm("Clear this award or backup role? The carrier bid stays in the Bid Room.")) return;
  setStatus(rfxAwardStatus, "Clearing award role...");
  try {
    await clearRfxAward(invitationId);
    setStatus(rfxAwardStatus, "Award role cleared.", "success");
    await loadDetail(selectedEventId);
    activateWorkbenchView("award");
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
  }
}

async function applyRecommendedAwardDecisions() {
  if (!selectedEventId) return;
  const candidates = recommendedAwardCandidates();
  if (!candidates.length) {
    setStatus(rfxAwardStatus, "Every lane with bids already has a primary award.", "neutral");
    return;
  }
  const weak = candidates.filter((row) => Number(row.recommended?.decision?.score || 0) < 55).length;
  const copy = weak
    ? `Award ${candidates.length} recommended carrier(s)? ${weak} have weak scores and should be reviewed.`
    : `Award ${candidates.length} recommended carrier(s) as primary awards?`;
  if (!window.confirm(copy)) return;
  if (rfxApplyRecommendedAwardsButton) rfxApplyRecommendedAwardsButton.disabled = true;
  setStatus(rfxAwardStatus, `Applying ${formatNumber(candidates.length)} recommended award(s)...`);
  let saved = 0;
  const failed = [];
  for (const candidate of candidates) {
    const row = candidate.recommended;
    const reason = decisionRecommendation(row, 1, candidate.bids) || awardReasonDefault(row, 1);
    try {
      await awardRfxLaneVendor(row.invitation.id, {
        award_role: "primary",
        award_reason: reason || "Recommended procurement award"
      });
      saved += 1;
    } catch (error) {
      failed.push(`${laneRoute(candidate.lane)}: ${error.message}`);
    }
  }
  await loadDetail(selectedEventId);
  activateWorkbenchView("award");
  setStatus(
    rfxAwardStatus,
    failed.length
      ? `${formatNumber(saved)} award(s) saved. ${formatNumber(failed.length)} failed: ${failed.slice(0, 2).join(" | ")}`
      : `${formatNumber(saved)} recommended award(s) saved.`,
    failed.length ? "warning" : "success"
  );
}

async function closeoutSelectedAwardsToRateware() {
  if (!selectedEventId) return;
  if (blockIfAwardPreflightFails("closeout")) return;
  const pending = currentLanes
    .flatMap((lane) => activeInvitations(lane))
    .filter((invitation) => invitation.award_role === "primary" && !invitation.rate_staging_id);
  if (!pending.length) {
    setStatus(rfxAwardStatus, "There are no primary awards pending Rateware closeout.", "neutral");
    return;
  }
  if (!window.confirm(`Create ${pending.length} approved Rateware row(s) from primary awards?`)) return;
  if (rfxCloseoutAwardsButton) rfxCloseoutAwardsButton.disabled = true;
  setStatus(rfxAwardStatus, "Creating Rateware rows from awards...");
  try {
    const result = await closeoutAwardedRfxToRateware(selectedEventId, { target_status: "approved" });
    await loadEvents();
    activateWorkbenchView("award");
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.inserted || 0)} Rateware row(s) created. ${formatNumber(result.skipped || 0)} skipped.`,
      result.inserted ? "success" : "neutral"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
    renderAwardBoard();
  }
}

async function generateAwardNoticeDrafts() {
  if (!selectedEventId) {
    setStatus(rfxAwardStatus, "Select a bid event before generating award notices.", "error");
    return;
  }
  if (blockIfAwardPreflightFails("generate_notices")) return;
  const bids = awardLaneRows().reduce((sum, row) => sum + row.bids.length, 0);
  if (!bids) {
    setStatus(rfxAwardStatus, "There are no carrier bids to close out yet.", "error");
    return;
  }
  if (rfxGenerateAwardNoticesButton) rfxGenerateAwardNoticesButton.disabled = true;
  setStatus(rfxAwardStatus, "Generating award, backup, and not-awarded email drafts...");
  try {
    const result = await generateRfxAwardNotices(selectedEventId, {
      senderEmail: APPROVED_GMAIL_SENDER,
      senderLabel: APPROVED_GMAIL_SENDER
    });
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.generated || 0)} award notice draft(s) ready. ${formatNumber(result.skipped?.length || 0)} skipped.`,
      "success"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
    updateAwardNoticeControls();
  }
}

async function sendAwardNoticeDrafts() {
  if (!selectedEventId) return;
  if (blockIfAwardPreflightFails("send_notices")) return;
  const ids = sendableAwardNoticeIds();
  if (!ids.length) {
    setStatus(rfxAwardStatus, "There are no unsent award notice emails ready.", "error");
    return;
  }
  if (!window.confirm(`Send ${ids.length} individual award notice email(s) from ${APPROVED_GMAIL_SENDER}?`)) return;
  if (rfxSendAwardNoticesButton) rfxSendAwardNoticesButton.disabled = true;
  setStatus(rfxAwardStatus, `Sending ${formatNumber(ids.length)} award notice email(s)...`);
  try {
    const result = await sendOutreachMessages(ids, { senderEmail: APPROVED_GMAIL_SENDER });
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.sent || 0)} award notice email(s) sent. ${formatNumber(result.failed || 0)} failed.`,
      result.failed ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
    updateAwardNoticeControls();
  }
}

async function sendSelectedDraftEmails() {
  const ids = selectedSendableDraftIds();
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more email drafts before sending.", "error");
    return;
  }
  if (!confirmDraftQueueAction("send", ids)) return;
  if (draftSendSelectedButton) draftSendSelectedButton.disabled = true;
  setStatus(rfxOutreachStatus, `Sending ${formatNumber(ids.length)} individual email(s) from ${APPROVED_GMAIL_SENDER}...`);
  try {
    const result = await sendOutreachMessages(ids, { senderEmail: APPROVED_GMAIL_SENDER });
    selectedDraftMessageIds.clear();
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      `${formatNumber(result.sent || 0)} email(s) sent individually. ${formatNumber(result.failed || 0)} failed.`,
      result.failed ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, error.message, "error");
    renderDraftQueue();
  }
}

async function archiveSelectedDrafts() {
  const ids = [...selectedDraftMessageIds];
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more draft rows before archiving.", "error");
    return;
  }
  if (!confirmDraftQueueAction("archive", ids)) return;
  if (draftArchiveSelectedButton) draftArchiveSelectedButton.disabled = true;
  setStatus(rfxOutreachStatus, `Archiving ${formatNumber(ids.length)} draft row(s)...`);
  try {
    await markOutreachMessages(ids, "archived");
    selectedDraftMessageIds.clear();
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, `${formatNumber(ids.length)} draft row(s) archived.`, "success");
  } catch (error) {
    setStatus(rfxOutreachStatus, error.message, "error");
    renderDraftQueue();
  }
}

async function deleteSelectedDrafts() {
  const ids = [...selectedDraftMessageIds];
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more draft rows before deleting.", "error");
    return;
  }
  const confirmed = window.confirm(`Delete ${ids.length} selected draft row(s)? This only removes the queue rows, not vendors or RFx lanes.`);
  if (!confirmed) return;
  if (draftDeleteSelectedButton) draftDeleteSelectedButton.disabled = true;
  setStatus(rfxOutreachStatus, `Deleting ${formatNumber(ids.length)} draft row(s)...`);
  try {
    const result = await deleteOutreachMessages(ids);
    selectedDraftMessageIds.clear();
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, `${formatNumber(result.removed || 0)} draft row(s) deleted.`, "success");
  } catch (error) {
    setStatus(rfxOutreachStatus, error.message, "error");
    renderDraftQueue();
  }
}

async function saveSelectedRfxTemplate() {
  const template = selectedOutreachTemplate();
  if (!template || !rfxTemplateHtml) {
    setStatus(rfxTemplateEditorStatus, "Select a template before saving HTML.", "error");
    return;
  }
  const isDefaultTemplate = !template.owner_email;
  const payload = templateSavePayload({
    ...template,
    name: isDefaultTemplate ? `${template.name || "RFx invitation template"} - custom` : template.name
  });
  if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = true;
  setStatus(rfxTemplateEditorStatus, isDefaultTemplate ? "Saving editable copy..." : "Saving template...");
  try {
    const row = isDefaultTemplate
      ? await createOutreachTemplate(payload)
      : await updateOutreachTemplate(template.id, payload);
    outreachTemplates = await fetchOutreachTemplates();
    if (rfxOutreachTemplate && row?.id) rfxOutreachTemplate.value = row.id;
    rfxTemplateEditorTemplateId = row?.id || template.id;
    rfxTemplateEditorDirty = false;
    renderOutreachTemplateSelect();
    if (rfxOutreachTemplate && row?.id) rfxOutreachTemplate.value = row.id;
    renderRfxTemplateEditor({ force: true });
    renderOutreachPreview();
    setStatus(rfxTemplateEditorStatus, isDefaultTemplate ? "Editable copy saved and selected." : "Template saved.", "success");
    setStatus(rfxOutreachStatus, "Email template changes saved. Draft queue is ready to generate.", "success");
  } catch (error) {
    setStatus(rfxTemplateEditorStatus, error.message, "error");
    setStatus(rfxOutreachStatus, error.message, "error");
  } finally {
    if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = false;
  }
}

initAuthControls();
requirePrivatePage().then((session) => {
  if (session?.token) {
    loadVendorOptions();
    loadVendorSegments();
    loadOutreachAssets();
    loadEvents();
  }
});

eventForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingEventId);
  setStatus(eventStatus, isEditing ? "Saving bid event..." : "Creating bid event...");
  try {
    const row = isEditing
      ? await updateRfxEvent(editingEventId, rfxEventPayload())
      : await createRfxEvent(rfxEventPayload());
    selectedEventId = row.id;
    resetRfxEventForm();
    setStatus(eventStatus, isEditing ? "Bid event updated." : "Bid event created.", "success");
    await loadEvents();
  } catch (error) {
    setStatus(eventStatus, error.message, "error");
  }
});

refreshButton?.addEventListener("click", loadEvents);
wizardRefreshButton?.addEventListener("click", loadEvents);
wizardLiveOffersButton?.addEventListener("click", () => activateWorkbenchView("responses", "#rfx-response-body"));

document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-action]");
  if (retryButton?.dataset.retryAction === "load-rfx-events") {
    loadEvents();
    return;
  }

  const editVisualTemplateButton = event.target.closest("[data-rfx-template-edit-visual]");
  if (editVisualTemplateButton) {
    event.preventDefault();
    rfxTemplateVisualEditing = true;
    renderOutreachPreview();
    document.querySelector("#rfx-email-visual-editor")?.focus();
    return;
  }

  const cancelVisualTemplateButton = event.target.closest("[data-rfx-template-cancel-visual]");
  if (cancelVisualTemplateButton) {
    event.preventDefault();
    rfxTemplateVisualEditing = false;
    renderOutreachPreview();
    return;
  }

  const saveVisualTemplateButton = event.target.closest("[data-rfx-template-save-visual]");
  if (saveVisualTemplateButton) {
    event.preventDefault();
    const surface = document.querySelector("#rfx-email-visual-editor");
    if (!surface || !rfxTemplateHtml) return;
    rfxTemplateHtml.value = htmlFromVisualEditor(surface);
    rfxTemplateEditorDirty = true;
    rfxTemplateVisualEditing = false;
    saveSelectedRfxTemplate().catch((error) => setStatus(rfxTemplateEditorStatus, error.message, "error"));
    return;
  }

  const copyReadinessButton = event.target.closest("[data-rfx-copy-readiness]");
  if (copyReadinessButton) {
    event.preventDefault();
    copyReadinessReport();
    return;
  }

  const firstReadinessIssueButton = event.target.closest("[data-rfx-readiness-first-issue]");
  if (firstReadinessIssueButton) {
    event.preventDefault();
    openFirstReadinessIssue();
    return;
  }

  const wizardGoButton = event.target.closest("[data-rfx-wizard-go]");
  if (wizardGoButton) {
    event.preventDefault();
    const requestedView = wizardGoButton.dataset.rfxWizardGo || "manager";
    const view = requestedView === "wizard" || requestedView === "manager" ? "setup" : requestedView;
    const focusTargets = {
      setup: "#rfx-id",
      lanes: "#rfx-lane-paste",
      carriers: "#manual-shortlist-search",
      outreach: "#rfx-outreach-template",
      responses: "#rfx-response-body",
      award: null
    };
    activateWorkbenchView(view, focusTargets[view] || null);
    return;
  }

  const wizardAutoShortlistButton = event.target.closest("[data-rfx-wizard-auto-shortlist]");
  if (wizardAutoShortlistButton) {
    if (!selectedEventId || !currentLanes.length) return;
    wizardAutoShortlistButton.disabled = true;
    autoShortlistLaneIds(currentLanes.map((lane) => lane.id), actionStatus)
      .catch((error) => setStatus(actionStatus, error.message, "error"))
      .finally(() => {
        wizardAutoShortlistButton.disabled = false;
        renderWizard();
      });
    return;
  }

  const wizardDraftButton = event.target.closest("[data-rfx-wizard-create-drafts]");
  if (wizardDraftButton) {
    wizardDraftButton.disabled = true;
    createCurrentOutreachDrafts(actionStatus)
      .catch((error) => setStatus(actionStatus, error.message, "error"))
      .finally(() => {
        wizardDraftButton.disabled = false;
        renderWizard();
      });
    return;
  }

  const createButton = event.target.closest("[data-rfx-focus-create]");
  if (createButton) {
    resetRfxEventForm();
    activateWorkbenchView("setup", "#rfx-id");
    rfxIdInput?.focus();
    eventForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

draftList?.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-rfx-open-draft]");
  if (openButton) {
    const url = openButton.dataset.rfxOpenDraft;
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  const statusButton = event.target.closest("[data-rfx-mark-draft]");
  if (!statusButton) return;
  const id = statusButton.dataset.rfxMarkDraft;
  const status = statusButton.dataset.rfxDraftStatus;
  if (!id || !status) return;
  statusButton.disabled = true;
  setStatus(rfxOutreachStatus, `Marking draft ${status}...`);
  try {
    await markOutreachMessages([id], status);
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, "Draft updated.", "success");
  } catch (error) {
    setStatus(rfxOutreachStatus, error.message, "error");
  } finally {
    statusButton.disabled = false;
  }
});

draftList?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-rfx-draft-select]");
  if (!checkbox) return;
  const id = checkbox.dataset.rfxDraftSelect;
  if (!id) return;
  if (checkbox.checked) {
    selectedDraftMessageIds.add(id);
  } else {
    selectedDraftMessageIds.delete(id);
  }
  renderDraftQueue();
});

draftToggleVisible?.addEventListener("change", () => {
  const rows = draftRowsForEvent().slice(0, 200);
  if (draftToggleVisible.checked) {
    rows.forEach((message) => selectedDraftMessageIds.add(String(message.id)));
  } else {
    rows.forEach((message) => selectedDraftMessageIds.delete(String(message.id)));
  }
  renderDraftQueue();
});

draftSelectAllEmailsButton?.addEventListener("click", () => {
  const rows = draftRowsForEvent();
  selectedDraftMessageIds = new Set(selectableEmailDrafts(rows).map((message) => String(message.id)));
  renderDraftQueue();
});

draftClearSelectionButton?.addEventListener("click", () => {
  selectedDraftMessageIds.clear();
  renderDraftQueue();
});

draftSendSelectedButton?.addEventListener("click", () => {
  sendSelectedDraftEmails();
});

draftArchiveSelectedButton?.addEventListener("click", () => {
  archiveSelectedDrafts();
});

draftDeleteSelectedButton?.addEventListener("click", () => {
  deleteSelectedDrafts();
});

eventList?.addEventListener("click", async (event) => {
  if (event.target.closest("[data-rfx-marketplace-link]")) return;
  const card = event.target.closest("[data-rfx-event-id]");
  if (!card) return;
  await loadDetail(card.dataset.rfxEventId);
});

laneCoverage?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-focus-lane]");
  if (!button) return;
  focusLane(button.dataset.rfxFocusLane);
  const row = [...(lanesBody?.querySelectorAll("[data-rfx-lane-id]") || [])]
    .find((item) => item.dataset.rfxLaneId === button.dataset.rfxFocusLane);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("is-focused-row");
  window.setTimeout(() => row.classList.remove("is-focused-row"), 1400);
});

document.querySelectorAll("[data-rfx-lane-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeLaneFilter = button.dataset.rfxLaneFilter || "all";
    document.querySelectorAll("[data-rfx-lane-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    if (!visibleLanes().some((lane) => lane.id === focusedLaneId)) focusedLaneId = visibleLanes()[0]?.id || null;
    renderLanes();
  });
});

laneSearch?.addEventListener("input", () => {
  if (!visibleLanes().some((lane) => lane.id === focusedLaneId)) focusedLaneId = visibleLanes()[0]?.id || null;
  renderLanes();
});

downloadLaneTemplateButton?.addEventListener("click", downloadRfxLaneTemplate);

laneTemplateFileInput?.addEventListener("change", async () => {
  const file = laneTemplateFileInput.files?.[0];
  if (!file) {
    clearLaneTemplateImport();
    return;
  }
  setStatus(laneImportStatus, `Reading ${file.name}...`);
  importLanesButton.disabled = true;
  try {
    pendingLaneTemplateRows = await parseLaneTemplateFile(file);
    pendingLaneTemplateIssues = validateLaneTemplateRows(pendingLaneTemplateRows);
    if (!pendingLaneTemplateRows.length) {
      setStatus(laneImportStatus, "No lane rows found. Use the template and keep origin/destination populated.", "error");
    }
    renderLaneTemplatePreview();
  } catch (error) {
    pendingLaneTemplateRows = [];
    pendingLaneTemplateIssues = [];
    renderLaneTemplatePreview();
    setStatus(laneImportStatus, error.message, "error");
  } finally {
    updateLaneImportButton();
  }
});

lanePaste?.addEventListener("input", () => {
  if (lanePaste.value.trim()) {
    pendingLaneTemplateRows = [];
    pendingLaneTemplateIssues = [];
    if (laneTemplatePreview) laneTemplatePreview.hidden = true;
  }
  updateLaneImportButton();
});

importLanesButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  const templateRows = readyLaneTemplateRows();
  const rows = templateRows.length ? templateRows : parseLanePaste(lanePaste?.value || "");
  if (!rows.length) {
    setStatus(laneImportStatus, "Upload a completed RFx lane template before importing.", "error");
    return;
  }
  importLanesButton.disabled = true;
  setStatus(laneImportStatus, `Importing ${rows.length} lane(s)...`);
  try {
    const result = await importRfxLanes(selectedEventId, rows);
    setStatus(laneImportStatus, `${result.inserted || 0} lane(s) imported.`, "success");
    clearLaneTemplateImport({ preserveStatus: true });
    await loadDetail(selectedEventId);
    await loadEvents();
  } catch (error) {
    setStatus(laneImportStatus, error.message, "error");
  } finally {
    importLanesButton.disabled = false;
  }
});

clearLanesInputButton?.addEventListener("click", () => {
  clearLaneTemplateImport();
});

openRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!confirmEventLifecycleAction("open")) return;
  await updateRfxEvent(selectedEventId, { status: "open" });
  await loadEvents();
});

closeRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!confirmEventLifecycleAction("close")) return;
  await updateRfxEvent(selectedEventId, { status: "closed" });
  await loadEvents();
});

editRfxButton?.addEventListener("click", () => {
  if (!selectedEvent) return;
  fillRfxEventForm(selectedEvent);
});

duplicateRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!confirmEventLifecycleAction("duplicate")) return;
  duplicateRfxButton.disabled = true;
  setStatus(actionStatus, "Duplicating bid event...");
  try {
    const result = await duplicateRfxEvent(selectedEventId);
    selectedEventId = result.row?.id || selectedEventId;
    resetRfxEventForm();
    setStatus(actionStatus, `RFx duplicated with ${result.lanes || 0} lane(s).`, "success");
    await loadEvents();
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    updateEventActionState();
  }
});

archiveRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!confirmEventLifecycleAction("archive")) return;
  archiveRfxButton.disabled = true;
  setStatus(actionStatus, "Archiving bid event...");
  try {
    await archiveRfxEvent(selectedEventId);
    selectedEventId = null;
    selectedEvent = null;
    resetRfxEventForm();
    setStatus(actionStatus, "Bid event archived.", "success");
    await loadEvents();
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    updateEventActionState();
  }
});

deleteRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!confirmEventLifecycleAction("delete")) return;
  deleteRfxButton.disabled = true;
  setStatus(actionStatus, "Deleting bid event...");
  try {
    await deleteRfxEvent(selectedEventId);
    selectedEventId = null;
    selectedEvent = null;
    resetRfxEventForm();
    setStatus(actionStatus, "Bid event deleted.", "success");
    await loadEvents();
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    updateEventActionState();
  }
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
  renderOutreachPreview();
});

lanesBody?.addEventListener("click", async (event) => {
  const laneRow = event.target.closest("[data-rfx-lane-id]");
  if (laneRow && !event.target.closest("button") && !event.target.closest("input")) {
    focusLane(laneRow.dataset.rfxLaneId);
    return;
  }

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
    const validation = validateRfxBidPatch(patch);
    if (!validation.ok) {
      setStatus(actionStatus, validation.error, "error");
      invitation.querySelector(`[data-rfx-bid-field="${validation.field}"]`)?.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      await updateRfxBid(saveButton.dataset.rfxSaveBid, validation.patch);
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
    return;
  }

  const openLinkButton = event.target.closest("[data-rfx-open-link]");
  if (openLinkButton) {
    const url = portalUrl(openLinkButton.dataset.rfxOpenLink);
    window.open(url, "_blank", "noopener");
  }
});

responseBody?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-rfx-lane-id]");
  if (!row) return;
  focusLane(row.dataset.rfxLaneId);
});

rfxAwardBoard?.addEventListener("click", async (event) => {
  const primaryButton = event.target.closest("[data-rfx-award-primary]");
  if (primaryButton) {
    primaryButton.disabled = true;
    try {
      await applyRfxAwardDecision(primaryButton.dataset.rfxAwardPrimary, "primary", primaryButton.dataset.awardDefault || "");
    } finally {
      renderAwardBoard();
    }
    return;
  }

  const backupButton = event.target.closest("[data-rfx-award-backup]");
  if (backupButton) {
    backupButton.disabled = true;
    try {
      await applyRfxAwardDecision(backupButton.dataset.rfxAwardBackup, "backup", backupButton.dataset.awardDefault || "");
    } finally {
      renderAwardBoard();
    }
    return;
  }

  const clearButton = event.target.closest("[data-rfx-clear-award]");
  if (clearButton) {
    clearButton.disabled = true;
    try {
      await clearRfxAwardDecision(clearButton.dataset.rfxClearAward);
    } finally {
      renderAwardBoard();
    }
  }
});

rfxRefreshAwardsButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  await loadDetail(selectedEventId);
  activateWorkbenchView("award");
});

rfxCloseoutAwardsButton?.addEventListener("click", closeoutSelectedAwardsToRateware);
rfxApplyRecommendedAwardsButton?.addEventListener("click", applyRecommendedAwardDecisions);
rfxGenerateAwardNoticesButton?.addEventListener("click", generateAwardNoticeDrafts);
rfxSendAwardNoticesButton?.addEventListener("click", sendAwardNoticeDrafts);

rfxAwardNoticeQueue?.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-rfx-open-award-notice]");
  if (openButton) {
    const url = openButton.dataset.rfxOpenAwardNotice;
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  const statusButton = event.target.closest("[data-rfx-mark-award-notice]");
  if (!statusButton) return;
  const id = statusButton.dataset.rfxMarkAwardNotice;
  const status = statusButton.dataset.rfxAwardNoticeStatus;
  if (!id || !status) return;
  statusButton.disabled = true;
  setStatus(rfxAwardStatus, `Marking award notice ${status}...`);
  try {
    await markOutreachMessages([id], status);
    [contactHistoryRows, outreachMessages] = await Promise.all([
      fetchContactHistory({ rfx_event_id: selectedEventId }),
      fetchOutreachMessages({ rfx_event_id: selectedEventId })
    ]);
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(rfxAwardStatus, "Award notice updated.", "success");
  } catch (error) {
    setStatus(rfxAwardStatus, error.message, "error");
  } finally {
    statusButton.disabled = false;
  }
});

copyRfxSummaryButton?.addEventListener("click", async () => {
  if (!selectedEvent) return;
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  const lines = [
    `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || ""}`,
    `Status: ${selectedEvent.status || "draft"} | Customer: ${selectedEvent.customer || "-"} | Due: ${selectedEvent.due_date || "-"}`,
    `Lanes: ${currentLanes.length} | Invitations: ${invitations.length} | Bids: ${bids.length}`,
    `Lane gaps: ${currentLanes.filter((lane) => laneDecisionStatus(lane) !== "has_bids").length}`,
    "",
    ...currentLanes.slice(0, 30).map((lane) => {
      const bestBid = bestBidForLane(lane);
      return `#${lane.lane_number || ""} ${laneRoute(lane)} | ${laneDecisionLabel(laneDecisionStatus(lane))} | Rateware ${lane.benchmark ? formatMoney(lane.benchmark.all_in_rate, lane.benchmark.currency) : "-"} | Best ${bestBid ? formatMoney(bestBid.bid_rate, bestBid.currency || lane.currency) : "-"}`;
    })
  ];
  await navigator.clipboard.writeText(lines.join("\n"));
  setStatus(actionStatus, "Bid Room summary copied.", "success");
});

autoShortlistButton?.addEventListener("click", async () => {
  const ids = [...selectedLaneIds];
  if (!ids.length) return;
  if (!confirmBidRoomBulkAction("auto_shortlist", ids)) return;
  autoShortlistButton.disabled = true;
  try {
    await autoShortlistLaneIds(ids, actionStatus);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    updateSelectionControls();
  }
});

inviteSelectedButton?.addEventListener("click", async () => {
  const ids = [...selectedInvitationIds];
  if (!ids.length) return;
  if (!confirmBidRoomBulkAction("mark_invited", ids)) return;
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
  if (!confirmBidRoomBulkAction("archive_participants", ids)) return;
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

manualShortlistSearch?.addEventListener("input", () => {
  renderManualShortlistControls();
  queueVendorSearchLoad();
});
manualShortlistSegment?.addEventListener("change", () => {
  renderManualShortlistControls();
});
selectVisibleCarriersButton?.addEventListener("click", () => {
  const ids = visibleManualVendorIds();
  selectManualVendorIds(ids);
  setStatus(manualShortlistStatus, ids.length ? `${formatNumber(ids.length)} visible carrier(s) selected.` : "No visible carriers to select.", ids.length ? "success" : "neutral");
});
selectSegmentCarriersButton?.addEventListener("click", () => {
  const rows = shortlistCandidateRows();
  selectManualVendorIds(rows.map((vendor) => vendor.id));
  setStatus(manualShortlistStatus, rows.length ? `${formatNumber(rows.length)} carrier(s) selected from current list.` : "No carriers match this list.", rows.length ? "success" : "neutral");
});
clearCarrierSelectionButton?.addEventListener("click", () => {
  selectedManualVendorIdsState.clear();
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier selection cleared.", "neutral");
});
saveManualShortlistTemplateButton?.addEventListener("click", async () => {
  const vendorIds = selectedManualVendorIds();
  const name = String(manualShortlistTemplateName?.value || "").trim();
  if (!vendorIds.length) {
    setStatus(manualShortlistStatus, "Select at least one carrier before saving a participant template.", "error");
    return;
  }
  if (!name) {
    setStatus(manualShortlistStatus, "Add a template name before saving this participant list.", "error");
    manualShortlistTemplateName?.focus();
    return;
  }
  saveManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `Saving participant template "${name}"...`);
  try {
    const row = await createVendorSegment(participantTemplatePayload(null, vendorIds, name));
    savedVendorSegments = [row, ...savedVendorSegments.filter((segment) => segment.id !== row.id)];
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    if (manualShortlistTemplateName) manualShortlistTemplateName.value = "";
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${row.segment_name || name}" saved with ${formatNumber(vendorIds.length)} carrier(s).`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error.message), "error");
  } finally {
    renderManualShortlistControls();
  }
});
loadManualShortlistTemplateButton?.addEventListener("click", () => {
  const segmentId = selectedSegmentId();
  if (segmentId === "all") {
    setStatus(manualShortlistStatus, "Choose a saved list or procurement segment before loading participants.", "error");
    return;
  }
  const rows = sortedVendorOptions(segmentCandidateRows(segmentId));
  if (!rows.length) {
    setStatus(manualShortlistStatus, "No carriers were found for the selected saved list.", "error");
    return;
  }
  selectedManualVendorIdsState = new Set(rows.map((vendor) => vendor.id).filter(Boolean));
  renderManualShortlistControls();
  const segment = savedVendorSegments.find((item) => item.id === segmentId);
  const label = segment?.segment_name || (segmentId === "procurement" ? "Procurement / Pipeline" : "saved list");
  if (manualShortlistTemplateName && segment?.segment_name) manualShortlistTemplateName.value = segment.segment_name;
  setStatus(manualShortlistStatus, `${formatNumber(rows.length)} carrier(s) loaded from ${label}.`, "success");
});
updateManualShortlistTemplateButton?.addEventListener("click", async () => {
  const segment = selectedSavedVendorSegment();
  const vendorIds = selectedManualVendorIds();
  if (!segment) {
    setStatus(manualShortlistStatus, "Choose a saved participant template before updating.", "error");
    return;
  }
  if (!vendorIds.length) {
    setStatus(manualShortlistStatus, "Keep at least one carrier selected before updating this template.", "error");
    return;
  }
  const name = String(manualShortlistTemplateName?.value || segment.segment_name || "").trim();
  if (!name) {
    setStatus(manualShortlistStatus, "Template name is required before updating.", "error");
    manualShortlistTemplateName?.focus();
    return;
  }
  updateManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `Updating participant template "${name}"...`);
  try {
    const row = await updateVendorSegment(segment.id, participantTemplatePayload(segment, vendorIds, name));
    savedVendorSegments = [row, ...savedVendorSegments.filter((item) => item.id !== row.id)];
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${row.segment_name || name}" updated with ${formatNumber(vendorIds.length)} carrier(s).`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error.message), "error");
  } finally {
    renderManualShortlistControls();
  }
});
deleteManualShortlistTemplateButton?.addEventListener("click", async () => {
  const segment = selectedSavedVendorSegment();
  if (!segment) {
    setStatus(manualShortlistStatus, "Choose a saved participant template before deleting.", "error");
    return;
  }
  const label = segment.segment_name || "this participant template";
  if (!window.confirm(`Delete "${label}"? This will not remove carriers from CRM or existing bid invitations.`)) return;
  deleteManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `Deleting participant template "${label}"...`);
  try {
    await deleteVendorSegment(segment.id);
    savedVendorSegments = savedVendorSegments.filter((item) => item.id !== segment.id);
    if (manualShortlistSegment) manualShortlistSegment.value = "all";
    if (manualShortlistTemplateName) manualShortlistTemplateName.value = "";
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${label}" deleted. Carriers and bid history were not changed.`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error.message), "error");
  } finally {
    renderManualShortlistControls();
  }
});
manualShortlistLane?.addEventListener("change", () => {
  updateManualShortlistButtonState();
  if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
});
manualShortlistVendorList?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-manual-vendor-select]");
  if (input) {
    if (input.checked) selectedManualVendorIdsState.add(input.value);
    else selectedManualVendorIdsState.delete(input.value);
  }
  renderManualShortlistControls();
});
manualShortlistVendorList?.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-manual-vendor]");
  if (!addButton) return;
  const vendorId = addButton.dataset.addManualVendor;
  if (!vendorId) return;
  selectedManualVendorIdsState.add(vendorId);
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier moved to selected participants.", "success");
});
manualShortlistSelectedList?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-manual-vendor]");
  if (!removeButton) return;
  selectedManualVendorIdsState.delete(removeButton.dataset.removeManualVendor);
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier moved back to CRM candidates.", "neutral");
});

manualShortlistButton?.addEventListener("click", async () => {
  const vendorIds = selectedManualVendorIds();
  if (!vendorIds.length) {
    setStatus(manualShortlistStatus, "Select at least one carrier from Carrier CRM before adding participants.", "error");
    return;
  }
  if (!selectedEventId) {
    setStatus(manualShortlistStatus, "Create or select a bid event before adding participants. You can still save this carrier selection as a template.", "error");
    return;
  }
  if (!currentLanes.length) {
    setStatus(manualShortlistStatus, "Import the lane book before creating bid invitations. Your selected carriers stay selected and can be saved as a template.", "error");
    return;
  }
  manualShortlistButton.disabled = true;
  setStatus(manualShortlistStatus, `Adding ${vendorIds.length} participant carrier(s) to this bid...`);
  try {
    let inserted = 0;
    for (const lane of currentLanes) {
      const result = await shortlistRfxLaneVendors(lane.id, vendorIds);
      inserted += Number(result.inserted || 0);
    }
    selectedManualVendorIdsState.clear();
    setStatus(manualShortlistStatus, `${inserted} invitation row(s) created for this bid.`, "success");
    await loadDetail(selectedEventId);
  } catch (error) {
    setStatus(manualShortlistStatus, error.message, "error");
  } finally {
    renderManualShortlistControls();
  }
});

downloadCarrierTemplateButton?.addEventListener("click", downloadRfxCarrierTemplate);

carrierTemplateFileInput?.addEventListener("change", async () => {
  const file = carrierTemplateFileInput.files?.[0];
  if (!file) {
    clearCarrierTemplateImport();
    return;
  }
  if (!vendorOptions.length) {
    setStatus(carrierTemplateStatus, "Carrier CRM is still loading. Try again in a moment.", "error");
    return;
  }
  setStatus(carrierTemplateStatus, `Reading ${file.name}...`);
  if (importCarrierTemplateButton) importCarrierTemplateButton.disabled = true;
  try {
    pendingCarrierTemplateRows = await parseCarrierTemplateFile(file);
    if (!pendingCarrierTemplateRows.length) {
      setStatus(carrierTemplateStatus, "No CRM catalog rows found. Download the catalog, mark participate TRUE, then upload it.", "error");
    }
    renderCarrierTemplatePreview();
  } catch (error) {
    pendingCarrierTemplateRows = [];
    pendingCarrierTemplateMatches = [];
    renderCarrierTemplatePreview();
    setStatus(carrierTemplateStatus, error.message, "error");
  } finally {
    updateCarrierTemplateButton();
  }
});

importCarrierTemplateButton?.addEventListener("click", async () => {
  const readyRows = readyCarrierTemplateMatches();
  if (!selectedEventId || !readyRows.length) {
    setStatus(carrierTemplateStatus, "Upload the edited CRM catalog with at least one TRUE carrier before importing.", "error");
    return;
  }
  const laneGroups = new Map();
  readyRows.forEach((item) => {
    item.lanes.forEach((lane) => {
      if (!laneGroups.has(lane.id)) laneGroups.set(lane.id, new Set());
      laneGroups.get(lane.id).add(item.vendor.id);
    });
  });
  importCarrierTemplateButton.disabled = true;
  setStatus(carrierTemplateStatus, `Adding ${readyRows.length} selected CRM carrier(s) to this bid...`);
  try {
    let inserted = 0;
    for (const [laneId, vendorIds] of laneGroups.entries()) {
      const result = await shortlistRfxLaneVendors(laneId, [...vendorIds]);
      inserted += Number(result.inserted || 0);
    }
    setStatus(carrierTemplateStatus, `${inserted} invitation row(s) created from the CRM participant catalog.`, "success");
    clearCarrierTemplateImport({ preserveStatus: true });
    await loadDetail(selectedEventId);
    await loadEvents();
  } catch (error) {
    setStatus(carrierTemplateStatus, error.message, "error");
  } finally {
    updateCarrierTemplateButton();
  }
});

rfxOutreachTemplate?.addEventListener("change", () => {
  rfxTemplateEditorDirty = false;
  rfxTemplateVisualEditing = false;
  renderRfxTemplateEditor({ force: true });
  renderOutreachPreview();
});
rfxOutreachChannel?.addEventListener("change", renderOutreachPreview);
rfxOutreachSender && (rfxOutreachSender.value = APPROVED_GMAIL_SENDER);
rfxOutreachSender?.addEventListener("change", renderOutreachPreview);
rfxOutreachCampaignName?.addEventListener("input", () => {
  rfxOutreachCampaignName.dataset.autoName = "false";
});

rfxChatThreadType?.addEventListener("change", renderBidRoomChatControls);
rfxChatRefresh?.addEventListener("click", loadBidRoomChat);
rfxChatInboxFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-chat-filter]");
  if (!button) return;
  bidRoomChatFilter = button.dataset.rfxChatFilter || "all";
  renderBidRoomChat();
});
async function handleBidRoomChatThreadAction(event) {
  const button = event.target.closest("[data-rfx-chat-thread-action]");
  if (!button) return;
  const threadId = button.dataset.threadId;
  const action = button.dataset.rfxChatThreadAction;
  if (!threadId || !action) return;
  const currentThread = (bidRoomChatThreads.rows || []).find((thread) => String(thread.id) === String(threadId));
  if (!currentThread) return;
  if (action === "suggest_reply") {
    if (rfxChatThreadType) rfxChatThreadType.value = BID_ROOM_EVENT_THREAD_TYPE;
    renderBidRoomChatControls();
    if (rfxChatMessage) {
      rfxChatMessage.value = suggestedReplyForThread(currentThread);
      rfxChatMessage.focus();
    }
    setStatus(rfxChatStatus, "Suggested reply drafted. Review before sending.", "success");
    return;
  }
  if (action === "review_bid_update") {
    openChatBidUpdateDrawer(currentThread);
    setStatus(rfxChatStatus, "Bid update opened for review. Confirm before applying.", "success");
    return;
  }
  const payload = { thread_action: action };
  if (action === "assign") {
    const assignedTo = window.prompt("Assign this communication thread to:", "sales@heymarksman.com");
    if (assignedTo === null) return;
    payload.assigned_to = assignedTo;
  }
  if (action === "note") {
    const note = window.prompt("Internal note for this thread:", currentThread?.internal_note || "");
    if (note === null) return;
    payload.internal_note = note;
  }
  button.disabled = true;
  setStatus(rfxChatStatus, "Updating communication thread...");
  try {
    await updateBidRoomChatThread(threadId, payload);
    await loadBidRoomChat();
    setStatus(rfxChatStatus, "Communication thread updated.", "success");
  } catch (error) {
    setStatus(rfxChatStatus, error.message, "error");
    button.disabled = false;
  }
}
rfxChatThreadList?.addEventListener("click", handleBidRoomChatThreadAction);
rfxChatSignalQueue?.addEventListener("click", handleBidRoomChatThreadAction);
rfxChatCopySummary?.addEventListener("click", async () => {
  const rows = eventGroupChatThreads(Array.isArray(bidRoomChatThreads.rows) ? bidRoomChatThreads.rows : []);
  try {
    await navigator.clipboard.writeText(chatSummaryText(rows));
    setStatus(rfxChatStatus, "Communication summary copied.", "success");
  } catch (_error) {
    setStatus(rfxChatStatus, chatSummaryText(rows), "neutral");
  }
});
rfxChatBidUpdateClose?.addEventListener("click", closeChatBidUpdateDrawer);
rfxChatBidUpdateCloseSecondary?.addEventListener("click", closeChatBidUpdateDrawer);
rfxChatBidUpdateInvitation?.addEventListener("change", () => {
  const candidate = selectedChatBidUpdateCandidate();
  if (!candidate) return;
  if (rfxChatBidUpdateCurrency && !rfxChatBidUpdateCurrency.value) {
    rfxChatBidUpdateCurrency.value = candidate.invitation.currency || candidate.lane.currency || "USD";
  }
  if (rfxChatBidUpdateNotes && !rfxChatBidUpdateNotes.value) {
    rfxChatBidUpdateNotes.value = candidate.invitation.notes || "";
  }
});
rfxChatBidUpdateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const candidate = selectedChatBidUpdateCandidate();
  if (!pendingChatBidUpdate || !candidate) {
    setStatus(rfxChatBidUpdateStatus, "Choose a lane-carrier row before applying the update.", "error");
    return;
  }
  const amount = Number(String(rfxChatBidUpdateRate?.value || "").replace(/,/g, ""));
  if (!Number.isFinite(amount)) {
    setStatus(rfxChatBidUpdateStatus, "All-in rate must be numeric before applying.", "error");
    rfxChatBidUpdateRate?.focus();
    return;
  }
  if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = true;
  setStatus(rfxChatBidUpdateStatus, "Applying chat update to bid...");
  try {
    await applyBidUpdateFromChat({
      thread_id: pendingChatBidUpdate.thread.id,
      message_id: pendingChatBidUpdate.sourceMessage?.id || null,
      rfx_lane_vendor_id: candidate.invitation.id,
      rfx_lane_id: candidate.lane.id,
      vendor_id: candidate.invitation.vendor_id,
      bid_rate: amount,
      currency: rfxChatBidUpdateCurrency?.value || candidate.invitation.currency || candidate.lane.currency || "USD",
      weekly_capacity: rfxChatBidUpdateCapacity?.value || null,
      transit_days: rfxChatBidUpdateTransit?.value || null,
      notes: rfxChatBidUpdateNotes?.value || "",
      source_note: rfxChatBidUpdateSource?.textContent || "",
      resolve_thread: true
    });
    closeChatBidUpdateDrawer();
    await loadDetail(selectedEventId);
    activateWorkbenchView("responses", "#rfx-response-body");
    setStatus(rfxChatStatus, "Bid updated from chat and communication thread resolved.", "success");
  } catch (error) {
    setStatus(rfxChatBidUpdateStatus, error.message, "error");
  } finally {
    if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = false;
  }
});
rfxChatStartEventThread?.addEventListener("click", async () => {
  if (!selectedEventId) {
    setStatus(rfxChatStatus, "Select a bid event before creating the Google Chat thread.", "error");
    return;
  }
  rfxChatStartEventThread.disabled = true;
  setStatus(rfxChatStatus, "Creating event thread in Google Chat...");
  try {
    const result = await ensureSelectedEventChatThread(selectedEventId, { force: true, silent: true });
    setStatus(
      rfxChatStatus,
      result?.google_chat_configured
        ? "Event thread created and mirrored to Google Chat."
        : "Event thread created in Rateware. Connect Google Chat and save a Space to mirror it.",
      result?.google_chat_configured ? "success" : "warning"
    );
  } catch (error) {
    setStatus(rfxChatStatus, error.message, "error");
  } finally {
    renderBidRoomChatControls();
  }
});
rfxChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedEventId) {
    setStatus(rfxChatStatus, "Select a bid event before sending a chat message.", "error");
    return;
  }
  const body = String(rfxChatMessage?.value || "").trim();
  if (!body) {
    setStatus(rfxChatStatus, "Write a message first.", "error");
    rfxChatMessage?.focus();
    return;
  }
  const payload = {
    thread_type: BID_ROOM_EVENT_THREAD_TYPE,
    body
  };
  if (rfxChatSend) rfxChatSend.disabled = true;
  setStatus(rfxChatStatus, "Sending message...");
  try {
    const result = await postBidRoomChatMessage(selectedEventId, payload);
    if (rfxChatMessage) rfxChatMessage.value = "";
    setStatus(
      rfxChatStatus,
      result.google_chat_configured ? "Message sent and mirrored to Google Chat." : "Message sent. Google Chat mirror is not configured yet.",
      "success"
    );
    await loadBidRoomChat();
  } catch (error) {
    setStatus(rfxChatStatus, error.message, "error");
  } finally {
    renderBidRoomChatControls();
  }
});

[rfxTemplateSubject, rfxTemplateHtml, rfxTemplateWhatsapp].forEach((field) => {
  field?.addEventListener("input", () => {
    rfxTemplateEditorDirty = true;
    setStatus(rfxTemplateEditorStatus, "Unsaved template changes. Save before generating invitations.", "neutral");
    renderOutreachPreview();
  });
});

saveRfxTemplateHtmlButton?.addEventListener("click", saveSelectedRfxTemplate);

resetRfxTemplateHtmlButton?.addEventListener("click", () => {
  rfxTemplateEditorDirty = false;
  rfxTemplateVisualEditing = false;
  renderRfxTemplateEditor({ force: true });
  renderOutreachPreview();
});

rfxOutreachForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createCurrentOutreachDrafts(rfxOutreachStatus);
  } catch (error) {
    setStatus(rfxOutreachStatus, `Draft queue could not be generated. ${humanizeError(error)}`, "error");
  } finally {
    renderOutreachPreview();
  }
});
