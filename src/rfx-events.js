import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  archiveRfxEvent,
  archiveRfxLaneVendors,
  autoShortlistRfxLane,
  createRfxEvent,
  deleteRfxEvent,
  duplicateRfxEvent,
  fetchRfxDetail,
  fetchRfxEvents,
  importRfxLanes,
  inviteRfxLaneVendors,
  shortlistRfxLaneVendors,
  updateRfxBid,
  updateRfxEvent
} from "./rfx-service.js";
import {
  createOutreachCampaign,
  fetchContactHistory,
  fetchOutreachMessages,
  fetchOutreachTemplates,
  generateOutreachDrafts,
  markOutreachMessages
} from "./outreach-service.js";
import { fetchVendors } from "./vendor-service.js";
import { humanizeError } from "./error-copy.js";
import { errorState, stateBlock, tableErrorState, tableState } from "./ui-state.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const eventForm = document.querySelector("#rfx-event-form");
const rfxIdInput = document.querySelector("#rfx-id");
const rfxNameInput = document.querySelector("#rfx-name");
const rfxCustomerInput = document.querySelector("#rfx-customer");
const rfxTypeInput = document.querySelector("#rfx-type");
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
const createRfxOutreachCampaignButton = document.querySelector("#create-rfx-outreach-campaign");
const rfxOutreachStatus = document.querySelector("#rfx-outreach-status");
const rfxOutreachPreview = document.querySelector("#rfx-outreach-preview");
const touchpointSummary = document.querySelector("#rfx-touchpoint-summary");
const touchpointList = document.querySelector("#rfx-touchpoint-list");
const draftSummary = document.querySelector("#rfx-draft-summary");
const draftList = document.querySelector("#rfx-draft-list");
const wizardRefreshButton = document.querySelector("#rfx-wizard-refresh");
const wizardLiveOffersButton = document.querySelector("#rfx-wizard-live-offers");
const wizardSteps = document.querySelector("#rfx-wizard-steps");
const wizardPrimary = document.querySelector("#rfx-wizard-primary");
const wizardPreview = document.querySelector("#rfx-wizard-preview");
const liveOfferManager = document.querySelector("#rfx-live-offer-manager");
const rfxOpsTitle = document.querySelector("#rfx-ops-title");
const rfxOpsSubtitle = document.querySelector("#rfx-ops-subtitle");
const rfxOpsHealth = document.querySelector("#rfx-ops-health");
const rfxOpsOutreachLink = document.querySelector("#rfx-ops-outreach-link");
const rfxOpsStageRail = document.querySelector("#rfx-ops-stage-rail");
const rfxOpsNextAction = document.querySelector("#rfx-ops-next-action");
const rfxManagerFlow = document.querySelector("#rfx-manager-flow");
const rfxManagerFocus = document.querySelector("#rfx-manager-focus");
const rfxManagerQueue = document.querySelector("#rfx-manager-queue");

let events = [];
let selectedEventId = null;
let selectedEvent = null;
let editingEventId = null;
let currentLanes = [];
let vendorOptions = [];
let outreachTemplates = [];
let contactHistoryRows = [];
let outreachMessages = [];
let selectedLaneIds = new Set();
let selectedInvitationIds = new Set();
let focusedLaneId = null;
let activeLaneFilter = "all";
let pendingLaneTemplateRows = [];
let pendingLaneTemplateIssues = [];
let pendingCarrierTemplateRows = [];
let pendingCarrierTemplateMatches = [];
const rfxPageParams = new URLSearchParams(window.location.search);
const requestedRfxEventId = rfxPageParams.get("rfx_event_id");
const rfxWorkbench = initWorkbenchTabs({ defaultView: "setup" });

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
  const rows = sortedVendorOptions(vendorOptions).map((vendor) => ({
    participate: "FALSE",
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
  XLSX.writeFile(workbook, `rateware-bid-carrier-crm-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  const rows = targets.map(({ lane }, index) => `
    <tr>
      <td>${escapeHtml(lane.lane_number || index + 1)}</td>
      <td>${escapeHtml(lane.origin || "-")}</td>
      <td>${escapeHtml(lane.destination || "-")}</td>
      <td>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(lane.weekly_volume || "-")}</td>
      <td>${escapeHtml(lane.target_rate ? formatMoney(lane.target_rate, lane.currency) : "-")}</td>
      <td>Por ofertar</td>
      <td>Por estimar</td>
    </tr>
  `).join("");
  return `
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px">
      <thead>
        <tr style="background:#f3f6f8">
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Route ID</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Origen</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Destino</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Equipment / Trailer / Config</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Operacion / Servicio</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Volumen semanal</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Rango objetivo inicial</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Tu tarifa</th>
          <th style="border:1px solid #d8e0e7;padding:6px;text-align:left">Tu capacidad semanal</th>
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
  const template = selectedOutreachTemplate();
  const channel = rfxOutreachChannel?.value || "multi";
  const targets = outreachTargetInvitations();
  const ready = targets.filter((target) => targetHasChannel(target, channel)).length;
  const targetScope = selectedInvitationIds.size
    ? `${formatNumber(selectedInvitationIds.size)} selected vendor rows`
    : selectedLaneIds.size
      ? `${formatNumber(selectedLaneIds.size)} selected lanes`
      : "All active shortlist";
  const placeholders = templatePlaceholders(template);
  if (!template) {
    rfxOutreachPreview.innerHTML = `
      <strong>No template selected.</strong>
      <span>Create an invitation template before launching carrier invitations.</span>
    `;
  } else {
    rfxOutreachPreview.innerHTML = `
      <div>
        <span class="status-pill">${escapeHtml(template.channel || "multi")}</span>
        <strong>${escapeHtml(template.name || "Template")}</strong>
        <small>${escapeHtml(template.subject || "No email subject")}</small>
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
      </div>
      <p>${escapeHtml((template.whatsapp_body || template.html_body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 180) || "No body preview"}</p>
      <div class="template-token-row">
        ${placeholders.length ? placeholders.slice(0, 12).map((item) => `<span>{{${escapeHtml(item)}}}</span>`).join("") : "<span>No placeholders detected</span>"}
      </div>
    `;
  }
  if (createRfxOutreachCampaignButton) {
    createRfxOutreachCampaignButton.disabled = !selectedEventId || !template || !targets.length;
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
    { key: "event", label: "Setup", complete: Boolean(selectedEvent) },
    { key: "lanes", label: "Book", complete: stats.lanes > 0 },
    { key: "carriers", label: "Shortlist", complete: stats.invitations.length > 0 },
    { key: "launch", label: "Invite", complete: stats.invitations.some(hasInvitationStarted) },
    { key: "offers", label: "Bids", complete: stats.bids.length > 0 },
    { key: "award", label: "Award", complete: selectedEvent?.status === "awarded" }
  ];
}

function currentWizardStage() {
  return rfxWizardStepState().find((step) => !step.complete)?.key || "offers";
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
      title: "Create or select a bid event",
      detail: "Start with customer, due date, and event ID. The rest of the workflow attaches to this room.",
      cta: "Create bid event",
      note: "Event"
    },
    lanes: {
      title: "Load the business book",
      detail: "Paste or import lanes from Excel/CSV so Rateware can build coverage and shortlist carriers.",
      cta: "Load lanes",
      note: "Lanes"
    },
    carriers: {
      title: "Build the carrier shortlist",
      detail: "Use procurement vendors and Rateware evidence to create target carriers for every lane.",
      cta: "Build shortlist",
      note: "Targets"
    },
    preview: {
      title: "Review invitation copy",
      detail: "Confirm template, channel, placeholders, and contact readiness before generating drafts.",
      cta: "Review invites",
      note: "Preview"
    },
    launch: {
      title: "Preview and launch invitations",
      detail: "Confirm template, channel, contact readiness, and private bid links before generating drafts.",
      cta: "Generate invitations",
      note: "Drafts"
    },
    offers: {
      title: "Monitor live bids",
      detail: "Track carrier offers, spread, capacity, and response coverage from the private bid room.",
      cta: "Open live bids",
      note: "Offers"
    },
    award: {
      title: "Prepare the award decision",
      detail: "Compare bids against Rateware, capacity, and coverage before awarding lanes.",
      cta: "Open award room",
      note: "Decision"
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
    event: "",
    lanes: '<button type="button" data-rfx-wizard-go="lanes">Load business book</button>',
    carriers: '<button type="button" data-rfx-wizard-auto-shortlist>Build shortlist</button>',
    preview: '<button type="button" data-rfx-wizard-go="outreach">Review invitation preview</button>',
    launch: '<button type="button" data-rfx-wizard-create-drafts>Generate invitations</button>',
    offers: '<button type="button" data-rfx-wizard-go="responses">Open live bids</button>',
    award: '<button type="button" data-rfx-wizard-go="award">Open award room</button>'
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
      button.classList.toggle("is-complete", step.complete);
      button.classList.toggle("is-next", step.key === stage);
      button.setAttribute("aria-current", step.key === stage ? "step" : "false");
      button.querySelector(".stage-index").textContent = String(index + 1);
      button.querySelector(".stage-copy strong").textContent = step.label;
      button.querySelector(".stage-copy small").textContent = copy.note;
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
  rfxOpsNextAction.innerHTML = `
    <span>Next action</span>
    <strong>${escapeHtml(copy.title)}</strong>
    <small>${escapeHtml(copy.detail)}</small>
    ${wizardActionButton(stage)}
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

function managerStageAction(stepKey) {
  if (stepKey === "carriers") {
    return `<button class="secondary small-button" type="button" data-rfx-wizard-auto-shortlist ${currentLanes.length ? "" : "disabled"}>Build shortlist</button>`;
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
      title: "Carrier shortlist",
      detail: stats.invitations.length ? `${formatNumber(stats.invitations.length)} carrier target(s) shortlisted.` : "Build or add vendors to lanes.",
      action: "lanes",
      special: "shortlist"
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
  const template = selectedOutreachTemplate();
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
    const sorted = laneRows.sort((a, b) => a.amount - b.amount);
    const best = sorted[0];
    const spread = sorted.length > 1 ? sorted[sorted.length - 1].amount - sorted[0].amount : 0;
    return `
      <section class="live-offer-lane">
        <div>
          <span class="status-pill success">${formatNumber(sorted.length)} bid(s)</span>
          <strong>${escapeHtml(laneRoute(best.lane))}</strong>
          <small>Best ${formatMoney(best.amount, best.currency)} | Spread ${formatMoney(spread, best.currency)}</small>
        </div>
        <table>
          <thead><tr><th>Rank</th><th>Carrier</th><th>Bid</th><th>Capacity</th><th>Transit</th><th>Status</th></tr></thead>
          <tbody>
            ${sorted.map((row, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>${escapeHtml(vendorLabel(row.invitation))}</td>
                <td>${formatMoney(row.amount, row.currency)}</td>
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
  if (!selectedEvent) {
    if (rfxOpsTitle) rfxOpsTitle.textContent = "Select or create a bid event";
    rfxOpsSubtitle.textContent = "Start with setup, import lanes, shortlist carriers, then launch invitations and monitor bids.";
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
        <span data-tone="${statusTone(status)}">${escapeHtml(statusLabel(status))} <strong>${formatNumber(count)}</strong></span>
      `).join("")
      : "<span>No vendors shortlisted yet.</span>";
  }
}

function renderLaneCoverage() {
  if (!laneCoverage || !coverageSummary) return;
  if (!selectedEventId) {
    coverageSummary.textContent = "No event selected";
    laneCoverage.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Lane coverage",
      title: "Select a bid event",
      detail: "Choose or create an event to inspect lane coverage, shortlist depth, and bid response progress."
    });
    return;
  }
  if (!currentLanes.length) {
    coverageSummary.textContent = "No lanes";
    laneCoverage.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Lane coverage",
      title: "No lanes in this RFx yet",
      detail: "Paste the spot/RFx book above to create lanes, then shortlist carriers by lane."
    });
    return;
  }

  const lanes = visibleLanes();
  const covered = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  coverageSummary.textContent = `${formatNumber(covered)} / ${formatNumber(currentLanes.length)} lanes covered`;
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
    responseBody.innerHTML = `<tr><td colspan="8">No carrier bids yet.</td></tr>`;
    return;
  }
  responseBody.innerHTML = rows.map(({ lane, invitation }) => {
    const benchmark = lane.benchmark;
    const delta = Number(invitation.bid_delta);
    const deltaTone = Number.isFinite(delta) && delta <= 0 ? "success" : Number.isFinite(delta) ? "danger" : "neutral";
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}">
        <td><strong>${escapeHtml(vendorLabel(invitation))}</strong><small>${escapeHtml(invitation.vendors?.primary_email || invitation.vendors?.domain || "")}</small></td>
        <td>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</td>
        <td>${statusChip(invitation.invitation_status || "drafted")}</td>
        <td>${invitation.bid_rate !== null ? formatMoney(invitation.bid_rate, invitation.currency || lane.currency) : "-"}</td>
        <td>${benchmark ? formatMoney(benchmark.all_in_rate, benchmark.currency) : "-"}</td>
        <td><span class="rfx-bid-delta" data-tone="${deltaTone}">${Number.isFinite(delta) ? formatMoney(delta, invitation.currency || lane.currency) : "-"}</span></td>
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

function renderDraftQueue() {
  if (!draftSummary || !draftList) return;
  const rows = selectedEventId
    ? outreachMessages.filter((message) => message.rfx_event_id === selectedEventId)
    : [];
  const actionable = rows.filter((message) => ["drafted", "queued", "failed"].includes(String(message.status || "").toLowerCase()));
  draftSummary.textContent = rows.length
    ? `${formatNumber(rows.length)} draft rows | ${formatNumber(actionable.length)} need action`
    : "No drafts generated for this bid event.";
  if (!selectedEventId) {
    draftList.innerHTML = "<article>Select a bid event to review invitation drafts.</article>";
    return;
  }
  if (!rows.length) {
    draftList.innerHTML = "<article>Create invite drafts to review Gmail and WhatsApp messages inside this Bid Room.</article>";
    return;
  }
  draftList.innerHTML = rows.slice(0, 12).map((message) => {
    const isEmail = message.channel === "email";
    const openUrl = isEmail ? message.gmail_compose_url : message.whatsapp_url;
    const preview = String(message.text_body || message.whatsapp_text || message.subject || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return `
      <article data-rfx-draft-id="${escapeHtml(message.id)}">
        <span>${escapeHtml([message.channel, message.status, messageRecipient(message)].filter(Boolean).join(" | "))}</span>
        <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
        <small>${escapeHtml(message.rfx_lanes ? `${message.rfx_lanes.origin || "-"} -> ${message.rfx_lanes.destination || "-"}` : message.rfx_events?.rfx_id || "")}</small>
        <p>${escapeHtml(preview || "No draft preview")}</p>
        <div class="action-row">
          <button class="secondary small-button" type="button" data-rfx-open-draft="${escapeHtml(openUrl || "")}" ${openUrl ? "" : "disabled"}>Open ${isEmail ? "Gmail" : "WhatsApp"}</button>
          <button class="secondary small-button" type="button" data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="queued">Queue</button>
          <button class="small-button" type="button" data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="sent">Mark sent</button>
        </div>
      </article>
    `;
  }).join("");
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

function shortlistCandidateRows() {
  const term = String(manualShortlistSearch?.value || "").trim().toLowerCase();
  const activeRows = vendorOptions.filter((vendor) => vendorStageRank(vendor) < 9);
  const filtered = activeRows.filter((vendor) => !term || vendorSearchText(vendor).includes(term));
  return sortedVendorOptions(filtered);
}

function vendorMetaLine(row) {
  return [
    row.domain,
    row.primary_email,
    row.preferred_channel,
    row.status
  ].filter(Boolean).join(" | ");
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
  const stageLabel = row.base_stage || (isProcurementCarrier(row) ? "procurement" : "crm");
  const coverage = row.coverage_notes || row.notes || "No coverage notes captured";
  return `
    <label class="bid-room-crm-vendor-option">
      <input type="checkbox" data-manual-vendor-select="${escapeHtml(row.id)}" />
      <span class="crm-vendor-main">
        <strong>${escapeHtml(vendorDisplayName(row))}</strong>
        <small>${escapeHtml(vendorMetaLine(row) || "Missing contact data")}</small>
      </span>
      <span class="crm-vendor-stage" data-stage="${escapeHtml(String(stageLabel).toLowerCase())}">${escapeHtml(stageLabel)}</span>
      <span class="crm-vendor-coverage" title="${escapeHtml(coverage)}">${escapeHtml(coverage)}</span>
    </label>
  `;
}

function selectedManualVendorIds() {
  const checked = manualShortlistVendorList
    ? [...manualShortlistVendorList.querySelectorAll("[data-manual-vendor-select]:checked")].map((input) => input.value).filter(Boolean)
    : [];
  if (checked.length) return checked;
  return manualShortlistVendors ? [...manualShortlistVendors.selectedOptions].map((option) => option.value).filter(Boolean) : [];
}

function updateManualShortlistButtonState() {
  if (!manualShortlistButton) return;
  manualShortlistButton.disabled = !currentLanes.length || !selectedManualVendorIds().length;
}

function renderManualShortlistControls() {
  if (!manualShortlistLane || !manualShortlistVendors) return;
  manualShortlistLane.innerHTML = currentLanes.map((lane) => `
    <option value="${escapeHtml(lane.id)}">#${escapeHtml(lane.lane_number || "")} ${escapeHtml(lane.origin || "-")} -> ${escapeHtml(lane.destination || "-")}</option>
  `).join("");
  const procurementCount = vendorOptions.filter(isProcurementCarrier).length;
  if (manualShortlistSourceSummary) {
    manualShortlistSourceSummary.textContent = `${vendorOptions.length} CRM carrier(s) loaded | ${procurementCount} in Procurement/Pipeline`;
  }
  if (!currentLanes.length) {
    manualShortlistVendors.innerHTML = "";
    if (manualShortlistVendorList) {
      manualShortlistVendorList.innerHTML = `
        <article class="bid-room-crm-vendor-empty">
          <strong>Select a bid event and import lanes first.</strong>
          <span>Then choose participants directly from Carrier CRM / Procurement Base.</span>
        </article>
      `;
    }
    updateManualShortlistButtonState();
    return;
  }
  const rows = shortlistCandidateRows();
  manualShortlistVendors.innerHTML = rows.map((vendor) => `
    <option value="${escapeHtml(vendor.id)}">${escapeHtml(vendorDisplayName(vendor))} | ${escapeHtml(vendor.base_stage || "crm")} | ${escapeHtml(vendor.primary_email || vendor.domain || "")}</option>
  `).join("");
  if (manualShortlistVendorList) {
    const visibleRows = rows.slice(0, 80);
    const listSummary = `
      <div class="bid-room-crm-list-summary">
        <strong>Carrier CRM candidates</strong>
        <span>Showing ${Math.min(visibleRows.length, rows.length)} of ${rows.length}. Selected carriers apply to all lanes in this bid.</span>
      </div>
    `;
    manualShortlistVendorList.innerHTML = visibleRows.length ? `${listSummary}${visibleRows.map(renderCrmVendorCandidate).join("")}` : `
      <article class="bid-room-crm-vendor-empty">
        <strong>No CRM carriers match this search.</strong>
        <span>Clear the search or add/update carriers in Carrier CRM.</span>
      </article>
    `;
    manualShortlistVendorList.dataset.totalMatches = String(rows.length);
  }
  updateManualShortlistButtonState();
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
  try {
    const pageSize = 250;
    const rows = [];
    let total = 0;
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const result = await fetchVendors({ limit: pageSize, offset, view: "all" });
      const pageRows = result.rows || [];
      total = Number(result.total || 0);
      rows.push(...pageRows);
      if (!pageRows.length) break;
      if (total && rows.length >= total) break;
      if (pageRows.length < pageSize) break;
    }
    vendorOptions = sortedVendorOptions(rows);
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
  } catch (error) {
    vendorOptions = [];
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
    setStatus(manualShortlistStatus, error.message, "error");
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
  selectedEventId = eventId;
  setStatus(actionStatus, "Loading RFx detail...");
  try {
    const [detail, history, messages] = await Promise.all([
      fetchRfxDetail(eventId),
      fetchContactHistory({ rfx_event_id: eventId }),
      fetchOutreachMessages({ rfx_event_id: eventId })
    ]);
    selectedEvent = detail.event;
    currentLanes = detail.lanes || [];
    contactHistoryRows = history || [];
    outreachMessages = messages || [];
    if (!currentLanes.some((lane) => lane.id === focusedLaneId)) focusedLaneId = currentLanes[0]?.id || null;
    detailTitle.textContent = `${selectedEvent.name || selectedEvent.rfx_id} (${selectedEvent.status})`;
    updateLaneImportButton();
    updateEventActionState();
    renderEvents();
    renderLanes();
    renderEventDashboard();
    renderLaneCoverage();
    renderOutreachLaunchpad();
    setStatus(actionStatus, "Bid Room loaded.", "success");
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
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
  if (!selectedEventId) return null;
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
  const invitationIds = selectedInvitationIds.size
    ? [...selectedInvitationIds]
    : targets.map(({ invitation }) => invitation.id);
  if (createRfxOutreachCampaignButton) createRfxOutreachCampaignButton.disabled = true;
  setStatus(statusElement, "Creating campaign and generating drafts...");
  const campaign = await createOutreachCampaign({
    name: rfxOutreachCampaignName?.value || `${selectedEvent?.rfx_id || "RFx"} invitation wave`,
    rfx_event_id: selectedEventId,
    template_id: template.id,
    channel: rfxOutreachChannel?.value || "multi"
  });
  const result = await generateOutreachDrafts(campaign.id, { invitationIds });
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

initAuthControls();
requirePrivatePage().then((session) => {
  if (session?.token) {
    loadVendorOptions();
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

eventList?.addEventListener("click", async (event) => {
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
  await updateRfxEvent(selectedEventId, { status: "open" });
  await loadEvents();
});

closeRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  await updateRfxEvent(selectedEventId, { status: "closed" });
  await loadEvents();
});

editRfxButton?.addEventListener("click", () => {
  if (!selectedEvent) return;
  fillRfxEventForm(selectedEvent);
});

duplicateRfxButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  if (!window.confirm("Duplicate this bid event with its lanes and shortlisted vendors?")) return;
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
  if (!window.confirm("Archive this bid event? It will be hidden from active Bid Room lists.")) return;
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
  const label = selectedEvent?.rfx_id || selectedEvent?.name || "this bid event";
  if (!window.confirm(`Delete ${label}? This removes the event and related RFx rows.`)) return;
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
manualShortlistLane?.addEventListener("change", () => {
  updateManualShortlistButtonState();
  if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
});
manualShortlistVendorList?.addEventListener("change", updateManualShortlistButtonState);

manualShortlistButton?.addEventListener("click", async () => {
  const vendorIds = selectedManualVendorIds();
  if (!currentLanes.length || !vendorIds.length) {
    setStatus(manualShortlistStatus, "Import bid lanes and select at least one carrier from Carrier CRM.", "error");
    return;
  }
  manualShortlistButton.disabled = true;
  setStatus(manualShortlistStatus, `Adding ${vendorIds.length} participant carrier(s) to ${currentLanes.length} lane(s)...`);
  try {
    let inserted = 0;
    for (const lane of currentLanes) {
      const result = await shortlistRfxLaneVendors(lane.id, vendorIds);
      inserted += Number(result.inserted || 0);
    }
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

rfxOutreachTemplate?.addEventListener("change", renderOutreachPreview);
rfxOutreachChannel?.addEventListener("change", renderOutreachPreview);
rfxOutreachCampaignName?.addEventListener("input", () => {
  rfxOutreachCampaignName.dataset.autoName = "false";
});

rfxOutreachForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createCurrentOutreachDrafts(rfxOutreachStatus);
  } catch (error) {
    setStatus(rfxOutreachStatus, error.message, "error");
  } finally {
    renderOutreachPreview();
  }
});
