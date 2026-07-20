import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import {
  applyShipperActionPlaybook,
  archiveShippers,
  createShipper,
  createShipperProfileRequest,
  deleteShipperRecord,
  fetchShipper,
  fetchShipperAccountActivity,
  fetchShipperCommercialWork,
  fetchShipperActionQueue,
  fetchShipperDuplicates,
  fetchShipperIntelligence,
  fetchShipperRelationshipPipeline,
  fetchShipperSummary,
  fetchShippers,
  importShippers,
  importShipperCrmWorkbook,
  launchShipperOpportunityRfx,
  mergeShipperAccounts,
  moveShipperRelationshipStage,
  moveShipperOpportunityStage,
  promoteShipperRfiToOpportunity,
  saveShipperRecord,
  updateShipper,
  updateShipperAccountActionStatus,
  revokeShipperProfileRequest
} from "./shipper-service.js";

const state = {
  rows: [],
  total: 0,
  offset: 0,
  limit: 100,
  search: "",
  status: "all",
  relationshipStage: "all",
  activeView: "directory",
  pipelineRows: [],
  pipelineLoaded: 0,
  pipelineTotal: 0,
  pipelineReady: false,
  pipelineSearch: "",
  pipelineStatus: "all",
  pipelineTimer: null,
  commercialRfis: [],
  commercialOpportunities: [],
  commercialCounts: {},
  commercialReady: false,
  commercialSearch: "",
  commercialFocus: "all",
  commercialTimer: null,
  cadenceRows: [],
  cadenceCounts: {},
  cadenceReady: false,
  cadenceLoading: false,
  cadenceSearch: "",
  cadenceFocus: "open",
  cadenceTimer: null,
  intelligenceRows: [],
  intelligenceCounts: {},
  intelligenceScanned: 0,
  intelligenceTotal: 0,
  intelligenceTruncated: false,
  intelligenceReady: false,
  intelligenceLoading: false,
  intelligenceSearch: "",
  intelligenceFocus: "all",
  intelligenceTimer: null,
  draggingShipperId: null,
  selected: new Set(),
  activeShipperId: null,
  detail: null,
  accountActivity: [],
  accountActivityReady: false,
  accountActivityLoading: false,
  activeTab: "overview",
  editingRecordId: null,
  searchTimer: null,
  importRows: [],
  importWorkbook: null,
  importBusy: false,
  duplicateGroups: [],
  duplicatesScanned: 0,
  duplicatesReady: false,
  duplicatesLoading: false
};

const SHIPPER_XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
let shipperXlsxModulePromise = null;

const elements = {
  total: document.querySelector("#shipper-total"),
  active: document.querySelector("#shipper-active"),
  prospects: document.querySelector("#shipper-prospects"),
  missingContact: document.querySelector("#shipper-missing-contact"),
  openOpportunities: document.querySelector("#shipper-open-opportunities"),
  viewSwitcher: document.querySelector(".shipper-view-switcher"),
  directory: document.querySelector("#shipper-directory"),
  pipeline: document.querySelector("#shipper-pipeline"),
  commercial: document.querySelector("#shipper-commercial"),
  intelligencePanel: document.querySelector("#shipper-intelligence"),
  importPanel: document.querySelector("#shipper-import"),
  duplicatesPanel: document.querySelector("#shipper-duplicates"),
  duplicatesRefresh: document.querySelector("#refresh-shipper-duplicates"),
  duplicatesStatus: document.querySelector("#shipper-duplicates-status"),
  duplicatesScanned: document.querySelector("#shipper-duplicates-scanned"),
  duplicatesCount: document.querySelector("#shipper-duplicates-count"),
  duplicatesList: document.querySelector("#shipper-duplicates-list"),
  pipelineSearch: document.querySelector("#shipper-pipeline-search"),
  pipelineStatusFilter: document.querySelector("#shipper-pipeline-status-filter"),
  pipelineRefresh: document.querySelector("#refresh-shipper-pipeline"),
  pipelineStatus: document.querySelector("#shipper-pipeline-status"),
  pipelineBoard: document.querySelector("#shipper-pipeline-board"),
  commercialSearch: document.querySelector("#shipper-commercial-search"),
  commercialFilter: document.querySelector("#shipper-commercial-filter"),
  commercialRefresh: document.querySelector("#refresh-shipper-commercial"),
  commercialStatus: document.querySelector("#shipper-commercial-status"),
  commercialRfis: document.querySelector("#shipper-commercial-rfis"),
  commercialUnlinked: document.querySelector("#shipper-commercial-unlinked"),
  commercialOpportunities: document.querySelector("#shipper-commercial-opportunities"),
  commercialWon: document.querySelector("#shipper-commercial-won"),
  commercialDue: document.querySelector("#shipper-commercial-due"),
  commercialRfiCount: document.querySelector("#shipper-commercial-rfi-count"),
  commercialOpportunityCount: document.querySelector("#shipper-commercial-opportunity-count"),
  commercialOpportunityTitle: document.querySelector("#shipper-commercial-opportunity-title"),
  commercialOpportunityKicker: document.querySelector("#shipper-commercial-opportunity-kicker"),
  commercialRfiBody: document.querySelector("#shipper-commercial-rfi-body"),
  commercialOpportunityBody: document.querySelector("#shipper-commercial-opportunity-body"),
  cadence: document.querySelector("#shipper-cadence"),
  cadenceSearch: document.querySelector("#shipper-cadence-search"),
  cadenceFocus: document.querySelector("#shipper-cadence-focus"),
  cadenceRefresh: document.querySelector("#refresh-shipper-cadence"),
  cadenceStatus: document.querySelector("#shipper-cadence-status"),
  cadenceOpen: document.querySelector("#shipper-cadence-open"),
  cadenceToday: document.querySelector("#shipper-cadence-today"),
  cadenceOverdue: document.querySelector("#shipper-cadence-overdue"),
  cadenceDone: document.querySelector("#shipper-cadence-done"),
  cadenceBody: document.querySelector("#shipper-cadence-body"),
  intelligenceSearch: document.querySelector("#shipper-intelligence-search"),
  intelligenceFocus: document.querySelector("#shipper-intelligence-focus"),
  intelligenceRefresh: document.querySelector("#refresh-shipper-intelligence"),
  intelligenceStatus: document.querySelector("#shipper-intelligence-status"),
  intelligenceScanned: document.querySelector("#shipper-intelligence-scanned"),
  intelligenceReady: document.querySelector("#shipper-intelligence-ready"),
  intelligenceNeedsData: document.querySelector("#shipper-intelligence-needs-data"),
  intelligenceDue: document.querySelector("#shipper-intelligence-due"),
  intelligenceValue: document.querySelector("#shipper-intelligence-value"),
  intelligenceBody: document.querySelector("#shipper-intelligence-body"),
  importFile: document.querySelector("#shipper-import-file"),
  importStatus: document.querySelector("#shipper-import-status"),
  importPreview: document.querySelector("#shipper-import-preview"),
  importPreviewBody: document.querySelector("#shipper-import-preview-body"),
  importTotal: document.querySelector("#shipper-import-total"),
  importReady: document.querySelector("#shipper-import-ready"),
  importMatches: document.querySelector("#shipper-import-matches"),
  importIssues: document.querySelector("#shipper-import-issues"),
  importConfirmStatus: document.querySelector("#shipper-import-confirm-status"),
  importConfirm: document.querySelector("#confirm-shipper-import"),
  importCancel: document.querySelector("#cancel-shipper-import"),
  importTemplate: document.querySelector("#download-shipper-template"),
  search: document.querySelector("#shipper-search"),
  statusFilter: document.querySelector("#shipper-status-filter"),
  stageFilter: document.querySelector("#shipper-stage-filter"),
  refresh: document.querySelector("#refresh-shippers"),
  tableBody: document.querySelector("#shipper-table-body"),
  empty: document.querySelector("#shipper-empty-state"),
  directoryStatus: document.querySelector("#shipper-directory-status"),
  selectAll: document.querySelector("#select-all-shippers"),
  bulkBar: document.querySelector("#shipper-bulk-bar"),
  selectedCount: document.querySelector("#shipper-selected-count"),
  archiveSelected: document.querySelector("#archive-shippers"),
  clearSelection: document.querySelector("#clear-shipper-selection"),
  previous: document.querySelector("#shipper-prev-page"),
  next: document.querySelector("#shipper-next-page"),
  pageNumber: document.querySelector("#shipper-page-number"),
  pageSummary: document.querySelector("#shipper-page-summary"),
  pageSize: document.querySelector("#shipper-page-size"),
  overlay: document.querySelector("#shipper-modal-backdrop"),
  createModal: document.querySelector("#create-shipper-modal"),
  createForm: document.querySelector("#create-shipper-form"),
  createStatus: document.querySelector("#create-shipper-status"),
  drawer: document.querySelector("#shipper-drawer"),
  drawerTitle: document.querySelector("#shipper-drawer-title"),
  drawerSubtitle: document.querySelector("#shipper-drawer-subtitle"),
  drawerTabs: document.querySelector("#shipper-drawer-tabs"),
  drawerContent: document.querySelector("#shipper-drawer-content")
};

const CHILD_CONFIG = {
  contacts: {
    title: "Contacts",
    noun: "contact",
    fields: [
      ["contact_name", "Contact name", "text", true],
      ["title", "Title", "text"],
      ["department", "Department", "text"],
      ["email", "Email", "email"],
      ["phone", "Phone", "tel"],
      ["whatsapp_phone", "WhatsApp", "tel"],
      ["preferred_channel", "Preferred channel", "select", false, ["email", "phone", "whatsapp"]],
      ["is_primary", "Primary contact", "checkbox"],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["contact_name", "Contact"], ["department", "Department"], ["email", "Email"], ["phone", "Phone"]]
  },
  locations: {
    title: "Locations",
    noun: "location",
    fields: [
      ["location_name", "Location name", "text", true],
      ["location_type", "Type", "select", false, ["plant", "warehouse", "distribution_center", "office", "other"]],
      ["address_line_1", "Address", "text"],
      ["city", "City", "text"],
      ["state_code", "State", "text"],
      ["country_code", "Country", "select", false, ["MX", "US", "CA"]],
      ["postal_code", "ZIP / postal", "text"],
      ["market", "Market", "text"],
      ["region", "Region", "text"],
      ["appointment_required", "Appointment required", "checkbox"],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["location_name", "Location"], ["location_type", "Type"], ["city", "City"], ["state_code", "State"], ["country_code", "Country"]]
  },
  lanes: {
    title: "Lanes",
    noun: "lane",
    fields: [
      ["lane_name", "Lane name", "text"],
      ["origin", "Origin", "text", true],
      ["origin_postal_code", "Origin ZIP", "text"],
      ["destination", "Destination", "text", true],
      ["destination_postal_code", "Destination ZIP", "text"],
      ["equipment", "Equipment", "text"],
      ["trailer", "Trailer", "text"],
      ["operation", "Operation", "text"],
      ["service", "Service", "text"],
      ["weekly_volume", "Weekly volume", "number"],
      ["current_rate", "Current rate", "number"],
      ["currency", "Currency", "select", false, ["USD", "MXN", "CAD"]],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["origin", "Origin"], ["destination", "Destination"], ["equipment", "Equipment"], ["weekly_volume", "Weekly"], ["current_rate", "Rate"]]
  },
  rfis: {
    title: "RFIs",
    noun: "RFI",
    fields: [
      ["rfi_name", "RFI name", "text", true],
      ["external_reference", "Reference", "text"],
      ["status", "Status", "select", false, ["draft", "sent", "in_progress", "submitted", "approved", "archived"]],
      ["due_date", "Due date", "date"],
      ["source_url", "Source URL", "url"],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["rfi_name", "RFI"], ["external_reference", "Reference"], ["status", "Status"], ["due_date", "Due"]]
  },
  opportunities: {
    title: "Opportunities",
    noun: "opportunity",
    fields: [
      ["opportunity_name", "Opportunity name", "text", true],
      ["stage", "Stage", "select", false, ["identified", "discovery", "rfi", "rfx", "proposal", "negotiation", "won", "lost", "archived"]],
      ["probability", "Probability %", "number"],
      ["estimated_value", "Estimated value", "number"],
      ["currency", "Currency", "select", false, ["USD", "MXN", "CAD"]],
      ["estimated_weekly_volume", "Weekly volume", "number"],
      ["due_date", "Due date", "date"],
      ["next_action", "Next action", "text"],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["opportunity_name", "Opportunity"], ["stage", "Stage"], ["probability", "Probability"], ["estimated_value", "Value"], ["due_date", "Due"]]
  },
  actions: {
    title: "Next actions",
    noun: "account action",
    fields: [
      ["title", "Action", "text", true],
      ["action_type", "Type", "select", false, ["follow_up", "call", "email", "meeting", "rfi_follow_up", "rate_review", "data_cleanup", "other"]],
      ["status", "Status", "select", false, ["open", "in_progress", "done", "cancelled"]],
      ["priority", "Priority", "select", false, ["low", "normal", "high", "urgent"]],
      ["due_date", "Due date", "date"],
      ["owner_email_assignee", "Owner", "email"],
      ["notes", "Notes", "textarea"]
    ],
    columns: [["title", "Action"], ["action_type", "Type"], ["status", "Status"], ["priority", "Priority"], ["due_date", "Due"], ["owner_email_assignee", "Owner"]]
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function humanLabel(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function setStatus(element, message, tone = "") {
  element.textContent = message;
  element.dataset.tone = tone;
}

const SHIPPER_IMPORT_HEADERS = [
  "shipper_name", "legal_name", "domain", "website", "industry", "status", "relationship_stage",
  "segment", "revenue_tier", "account_owner_email", "primary_contact_name", "primary_contact_email",
  "primary_contact_phone", "headquarters_city", "headquarters_state", "headquarters_country", "tags", "notes"
];

const SHIPPER_IMPORT_EXAMPLE = [
  "Example Shipper", "Example Shipper LLC", "example-shipper.com", "https://example-shipper.com", "Manufacturing",
  "prospect", "target", "automotive", "mid_market", "owner@company.com", "Jane Doe", "jane@example-shipper.com",
  "+52 81 0000 0000", "Monterrey", "NL", "MX", "automotive; crossborder", "Imported from the Shipper Base"
];

const SHIPPER_CRM_WORKBOOK_TEMPLATE = {
  Accounts: {
    headers: [
      "external_account_id", "account_name", "legal_name", "domain", "website", "linkedin_url", "industry", "account_owner",
      "status", "relationship_stage", "labels", "headquarters_city", "headquarters_state", "headquarters_region", "headquarters_country",
      "headquarters_postal_code", "annual_revenue", "employee_count", "tax_id", "scope_of_service", "source_created_at", "source_updated_at"
    ],
    example: [
      "org_001", "Example Manufacturing", "Example Manufacturing LLC", "example.com", "https://example.com", "", "Manufacturing", "owner@example.com",
      "prospect", "target", "automotive, strategic", "Monterrey", "NL", "Northeast Mexico", "MX", "64000", "", "", "", "Crossborder, domestic MX", "", ""
    ]
  },
  Contacts: {
    headers: [
      "external_contact_id", "external_account_id", "contact_name", "first_name", "last_name", "title", "work_email", "mobile_phone",
      "work_phone", "preferred_channel", "labels", "city", "state", "country", "notes", "source_created_at", "source_updated_at"
    ],
    example: [
      "person_001", "org_001", "Jane Doe", "Jane", "Doe", "Logistics Manager", "jane@example.com", "+528100000000",
      "", "email", "primary_contact", "Monterrey", "NL", "MX", "", "", ""
    ]
  },
  Opportunities: {
    headers: [
      "external_opportunity_id", "external_account_id", "external_contact_id", "opportunity_name", "pipeline", "source_stage", "stage", "status",
      "owner", "labels", "value", "currency", "probability", "expected_close_date", "next_action_date", "operational_pain", "frequency",
      "monthly_economic_impact", "execution_capacity", "urgency", "fit", "risk_score", "source_created_at", "source_updated_at"
    ],
    example: [
      "deal_001", "org_001", "person_001", "2026 crossborder program", "Sales", "Qualified", "qualified", "open",
      "owner@example.com", "crossborder, rfq", "150000", "USD", "50", "2026-12-31", "2026-08-01", "Capacity coverage", "weekly",
      "", "", "high", "strong", "", "", ""
    ]
  }
};

function canonicalImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeImportedDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function importValue(values, aliases) {
  for (const alias of aliases) {
    const value = String(values[alias] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function normalizeShipperImportRow(source, index) {
  const values = Object.fromEntries(Object.entries(source || {}).map(([key, value]) => [canonicalImportHeader(key), value]));
  const row = {
    shipper_name: importValue(values, ["shipper_name", "shipper", "customer", "company", "company_name", "account_name", "name"]),
    legal_name: importValue(values, ["legal_name", "legal_entity"]),
    domain: normalizeImportedDomain(importValue(values, ["domain", "company_domain"])),
    website: importValue(values, ["website", "web_site", "url"]),
    industry: importValue(values, ["industry", "vertical"]),
    status: importValue(values, ["status"]).toLowerCase(),
    relationship_stage: importValue(values, ["relationship_stage", "relationship", "account_stage"]).toLowerCase(),
    segment: importValue(values, ["segment"]),
    revenue_tier: importValue(values, ["revenue_tier", "tier"]),
    account_owner_email: importValue(values, ["account_owner_email", "account_owner", "owner_email"]),
    primary_contact_name: importValue(values, ["primary_contact_name", "primary_contact", "contact_name"]),
    primary_contact_email: importValue(values, ["primary_contact_email", "primary_email", "contact_email", "email"]),
    primary_contact_phone: importValue(values, ["primary_contact_phone", "primary_phone", "contact_phone", "phone"]),
    headquarters_city: importValue(values, ["headquarters_city", "city", "hq_city"]),
    headquarters_state: importValue(values, ["headquarters_state", "state", "state_code", "hq_state"]),
    headquarters_country: importValue(values, ["headquarters_country", "country", "country_code", "hq_country"]),
    tags: importValue(values, ["tags", "tag"]),
    notes: importValue(values, ["notes", "note"])
  };
  const issues = [];
  if (!row.shipper_name) issues.push("Missing shipper name");
  if (row.domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(row.domain)) issues.push("Invalid domain");
  if (row.primary_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.primary_contact_email)) issues.push("Invalid contact email");
  if (row.status && !["prospect", "active", "inactive", "archived"].includes(row.status)) issues.push("Unknown status");
  if (row.relationship_stage && !["target", "qualified", "customer", "at_risk", "inactive"].includes(row.relationship_stage)) issues.push("Unknown relationship stage");
  return { index, row, issues };
}

function parseCsvRows(text) {
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
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function loadShipperXlsxModule() {
  if (!shipperXlsxModulePromise) shipperXlsxModulePromise = import(SHIPPER_XLSX_MODULE_URL);
  return await shipperXlsxModulePromise;
}

async function parseShipperImportFile(file) {
  if (/\.csv$/i.test(file.name)) return { kind: "accounts", accounts: parseCsvRows(await file.text()), contacts: [], opportunities: [] };
  const XLSX = await loadShipperXlsxModule();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetRows = (sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const headerRow = grid.findIndex((row) => row.some((cell) => ["external_account_id", "external_contact_id", "external_opportunity_id", "shipper_name", "account_name"].includes(canonicalImportHeader(cell))));
    return XLSX.utils.sheet_to_json(sheet, { range: Math.max(0, headerRow), defval: "", raw: false });
  };
  const sheets = Object.fromEntries(workbook.SheetNames.map((name) => [canonicalImportHeader(name), name]));
  const accountsSheet = sheets.accounts || sheets.account || sheets.shippers;
  const contactsSheet = sheets.contacts || sheets.contact || sheets.people;
  const opportunitiesSheet = sheets.opportunities || sheets.opportunity || sheets.deals;
  if (accountsSheet && (contactsSheet || opportunitiesSheet)) {
    return {
      kind: "relational",
      accounts: sheetRows(accountsSheet),
      contacts: contactsSheet ? sheetRows(contactsSheet) : [],
      opportunities: opportunitiesSheet ? sheetRows(opportunitiesSheet) : []
    };
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return { kind: "accounts", accounts: XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false }), contacts: [], opportunities: [] };
}

function validShipperImportRows() {
  return state.importRows.filter((item) => !item.issues.length).map((item) => item.row);
}

function renderShipperImportPreview() {
  const rows = state.importRows;
  const ready = validShipperImportRows().length;
  const workbook = state.importWorkbook;
  const relatedRows = workbook ? workbook.contacts.length + workbook.opportunities.length : 0;
  const externalKeys = workbook
    ? workbook.accounts.filter((row) => importValue(Object.fromEntries(Object.entries(row).map(([key, value]) => [canonicalImportHeader(key), value])), ["external_account_id", "account_id", "organization_id", "org_id", "id"])).length
    : rows.filter((item) => item.row.domain).length;
  const issues = rows.length - ready;
  elements.importTotal.textContent = (rows.length + relatedRows).toLocaleString();
  elements.importReady.textContent = (ready + relatedRows).toLocaleString();
  elements.importMatches.textContent = externalKeys.toLocaleString();
  elements.importIssues.textContent = issues.toLocaleString();
  elements.importConfirm.disabled = !ready || state.importBusy;
  elements.importPreviewBody.innerHTML = rows.slice(0, 100).map((item) => {
    const location = [item.row.headquarters_city, item.row.headquarters_state, item.row.headquarters_country].filter(Boolean).join(", ") || "-";
    const contact = [item.row.primary_contact_name, item.row.primary_contact_email].filter(Boolean).join(" | ") || "-";
    const result = item.issues.length ? item.issues.join("; ") : workbook ? "Ready - external ID relationship" : item.row.domain ? "Ready - domain merge key" : "Ready - no merge key";
    return `<tr class="${item.issues.length ? "has-issues" : ""}"><td>${item.index}</td><td><strong>${escapeHtml(item.row.shipper_name || "-")}</strong><small>${escapeHtml(item.row.legal_name || "")}</small></td><td>${escapeHtml(item.row.domain || "-")}</td><td>${escapeHtml(contact)}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(item.row.tags || "-")}</td><td>${escapeHtml(result)}</td></tr>`;
  }).join("") || `<tr><td class="shipper-commercial-empty" colspan="7">No usable Shipper Base rows found.</td></tr>`;
  if (workbook) {
    elements.importConfirmStatus.textContent = `${workbook.contacts.length.toLocaleString()} contact(s) and ${workbook.opportunities.length.toLocaleString()} opportunity record(s) will be linked by external account ID after the Accounts sheet is saved.`;
  }
  elements.importPreview.classList.toggle("hidden", !rows.length);
}

async function downloadShipperTemplate() {
  const XLSX = await loadShipperXlsxModule();
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, definition] of Object.entries(SHIPPER_CRM_WORKBOOK_TEMPLATE)) {
    const sheet = XLSX.utils.aoa_to_sheet([definition.headers, definition.example]);
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    sheet["!cols"] = definition.headers.map((header) => ({ wch: Math.min(Math.max(header.length + 2, 16), 30) }));
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  const guide = XLSX.utils.aoa_to_sheet([
    ["Rateware Shipper CRM relational import"],
    ["1. Keep external_account_id stable across Accounts, Contacts, and Opportunities."],
    ["2. Contacts and Opportunities require an external_account_id that exists in Accounts or was imported before."],
    ["3. Re-importing the same external IDs updates linked CRM records instead of creating duplicates."],
    ["4. Do not rename the Accounts, Contacts, or Opportunities worksheets."],
    ["5. Save the workbook as XLSX before uploading it in Shipper CRM > Import."]
  ]);
  guide["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, guide, "Guide");
  XLSX.writeFile(workbook, "rateware-shipper-crm-template.xlsx");
}

async function handleShipperImport(file) {
  if (!file) return;
  setStatus(elements.importStatus, "Reading Shipper Base...");
  setStatus(elements.importConfirmStatus, "");
  try {
    const workbook = await parseShipperImportFile(file);
    if (workbook.accounts.length > 1000 || workbook.contacts.length > 1000 || workbook.opportunities.length > 1000 || workbook.accounts.length + workbook.contacts.length + workbook.opportunities.length > 3000) {
      throw new Error("Import up to 1,000 Accounts, Contacts, and Opportunities per workbook (3,000 total rows).");
    }
    state.importWorkbook = workbook.kind === "relational" ? workbook : null;
    state.importRows = workbook.accounts.map((row, index) => normalizeShipperImportRow(row, index + 2));
    renderShipperImportPreview();
    const ready = validShipperImportRows().length;
    const related = workbook.contacts.length + workbook.opportunities.length;
    const label = workbook.kind === "relational" ? `Relational workbook detected: ${workbook.accounts.length.toLocaleString()} Accounts, ${workbook.contacts.length.toLocaleString()} Contacts, ${workbook.opportunities.length.toLocaleString()} Opportunities.` : `${workbook.accounts.length.toLocaleString()} account row(s) read.`;
    setStatus(elements.importStatus, `${label} ${ready.toLocaleString()} account(s) ready${related ? `; ${related.toLocaleString()} related record(s) will link by external account ID` : ""}.`, ready ? "success" : "error");
  } catch (error) {
    state.importRows = [];
    state.importWorkbook = null;
    renderShipperImportPreview();
    setStatus(elements.importStatus, humanizeError(error), "error");
  } finally {
    elements.importFile.value = "";
  }
}

async function confirmShipperImport() {
  const rows = validShipperImportRows();
  if (!rows.length || state.importBusy) return;
  state.importBusy = true;
  renderShipperImportPreview();
  setStatus(elements.importConfirmStatus, "Saving Shipper Base rows...");
  try {
    const result = state.importWorkbook
      ? await importShipperCrmWorkbook({
        accounts: state.importWorkbook.accounts,
        contacts: state.importWorkbook.contacts,
        opportunities: state.importWorkbook.opportunities,
        source_system: "pipedrive"
      })
      : await importShippers(rows);
    const skipped = Number(result.skipped || 0);
    const skippedDetail = Array.isArray(result.skipped_rows) && result.skipped_rows.length
      ? ` ${result.skipped_rows.slice(0, 3).map((item) => `Row ${item.row}: ${item.reason}`).join(" | ")}`
      : "";
    const accountResult = result.accounts || { inserted: result.inserted || 0, updated: result.updated || 0 };
    const contactResult = result.contacts || { inserted: 0, updated: 0 };
    const opportunityResult = result.opportunities || { inserted: 0, updated: 0 };
    setStatus(elements.importStatus, `${Number(accountResult.inserted || 0)} account(s), ${Number(contactResult.inserted || 0)} contact(s), and ${Number(opportunityResult.inserted || 0)} opportunity record(s) added. ${Number(accountResult.updated || 0) + Number(contactResult.updated || 0) + Number(opportunityResult.updated || 0)} existing record(s) updated.${skipped ? ` ${skipped} row(s) skipped.` : ""}${skippedDetail}`, skipped ? "warning" : "success");
    state.importRows = [];
    state.importWorkbook = null;
    elements.importPreview.classList.add("hidden");
    await refreshAccountWorkspace({ directory: true, pipeline: state.pipelineReady, commercial: state.commercialReady });
  } catch (error) {
    setStatus(elements.importConfirmStatus, humanizeError(error), "error");
  } finally {
    state.importBusy = false;
    renderShipperImportPreview();
  }
}

function showOverlay() {
  elements.overlay.classList.remove("hidden");
}

function syncOverlay() {
  const open = !elements.createModal.classList.contains("hidden") || !elements.drawer.classList.contains("hidden");
  elements.overlay.classList.toggle("hidden", !open);
  document.body.classList.toggle("shipper-dialog-open", open);
}

function openCreateModal() {
  elements.createForm.reset();
  setStatus(elements.createStatus, "");
  elements.createModal.classList.remove("hidden");
  showOverlay();
  elements.createForm.elements.shipper_name.focus();
}

function closeCreateModal() {
  elements.createModal.classList.add("hidden");
  syncOverlay();
}

function closeDrawer() {
  elements.drawer.classList.add("hidden");
  state.activeShipperId = null;
  state.detail = null;
  state.editingRecordId = null;
  syncOverlay();
}

function renderSummary(summary = {}) {
  elements.total.textContent = Number(summary.total || 0).toLocaleString();
  elements.active.textContent = Number(summary.active || 0).toLocaleString();
  elements.prospects.textContent = Number(summary.prospects || 0).toLocaleString();
  elements.missingContact.textContent = Number(summary.missing_contact || 0).toLocaleString();
  elements.openOpportunities.textContent = Number(summary.open_opportunities || 0).toLocaleString();
}

async function loadSummary() {
  try {
    renderSummary(await fetchShipperSummary());
  } catch (error) {
    [elements.total, elements.active, elements.prospects, elements.missingContact, elements.openOpportunities]
      .forEach((element) => { element.textContent = "-"; });
  }
}

function renderSelection() {
  const count = state.selected.size;
  elements.selectedCount.textContent = String(count);
  elements.bulkBar.classList.toggle("hidden", count === 0);
  const pageIds = state.rows.map((row) => row.id);
  const selectedOnPage = pageIds.filter((id) => state.selected.has(id)).length;
  elements.selectAll.checked = pageIds.length > 0 && selectedOnPage === pageIds.length;
  elements.selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
}

function shipperRow(row) {
  const headquarters = [row.headquarters_city, row.headquarters_state, row.headquarters_country].filter(Boolean).join(", ") || "-";
  const contact = row.primary_contact_name || row.primary_contact_email || "Missing contact";
  const nextAction = String(row.next_action || "").trim();
  const actionDue = cadenceDueState(row.next_due_date);
  const openActionCount = Number(row.open_action_count || 0);
  const dueActionCount = Number(row.due_action_count || 0);
  const actionMeta = dueActionCount > 0
    ? `${dueActionCount} due · ${openActionCount} open`
    : openActionCount > 0
      ? `${openActionCount} open`
      : "No open actions";
  const actionCell = nextAction
    ? `<button type="button" class="shipper-directory-action" data-open-shipper="${escapeHtml(row.id)}" data-open-shipper-tab="actions" title="Open account actions">${escapeHtml(nextAction)}</button><small><span class="shipper-cadence-due" data-tone="${escapeHtml(actionDue.tone)}">${escapeHtml(actionDue.label)}</span> ${escapeHtml(actionMeta)}</small>`
    : `<button type="button" class="shipper-directory-action is-empty" data-open-shipper="${escapeHtml(row.id)}" data-open-shipper-tab="actions">Set next action</button><small>${escapeHtml(actionMeta)}</small>`;
  return `
    <tr data-shipper-id="${escapeHtml(row.id)}">
      <td class="select-column"><input type="checkbox" data-select-shipper="${escapeHtml(row.id)}" ${state.selected.has(row.id) ? "checked" : ""} aria-label="Select ${escapeHtml(row.shipper_name)}" /></td>
      <td class="shipper-name-cell">
        <button type="button" data-open-shipper="${escapeHtml(row.id)}">${escapeHtml(row.shipper_name)}</button>
        <small>${escapeHtml(row.domain || row.legal_name || "No domain")}</small>
      </td>
      <td><span class="shipper-status shipper-status-${escapeHtml(row.status)}">${escapeHtml(humanLabel(row.status))}</span></td>
      <td>${escapeHtml(humanLabel(row.relationship_stage))}</td>
      <td>${escapeHtml(row.industry || "-")}</td>
      <td><span>${escapeHtml(contact)}</span>${row.primary_contact_email && row.primary_contact_name ? `<small>${escapeHtml(row.primary_contact_email)}</small>` : ""}</td>
      <td class="shipper-directory-action-cell">${actionCell}</td>
      <td>${escapeHtml(headquarters)}</td>
      <td>${escapeHtml(row.account_owner_email || "-")}</td>
      <td>${formatDate(row.updated_at)}</td>
    </tr>`;
}

function renderDirectory() {
  elements.tableBody.innerHTML = state.rows.map(shipperRow).join("");
  elements.empty.classList.toggle("hidden", state.rows.length > 0);
  const first = state.total ? state.offset + 1 : 0;
  const last = Math.min(state.offset + state.rows.length, state.total);
  const page = Math.floor(state.offset / state.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  elements.pageSummary.textContent = `${first.toLocaleString()}-${last.toLocaleString()} of ${state.total.toLocaleString()}`;
  elements.pageNumber.textContent = `Page ${page} of ${pages}`;
  elements.previous.disabled = state.offset === 0;
  elements.next.disabled = state.offset + state.limit >= state.total;
  renderSelection();
}

function renderLoadingRows() {
  elements.tableBody.innerHTML = Array.from({ length: 7 }, () => `
    <tr class="shipper-loading-row"><td></td><td colspan="9"><span></span></td></tr>`).join("");
  elements.empty.classList.add("hidden");
}

async function loadRows({ reset = false } = {}) {
  if (reset) state.offset = 0;
  setStatus(elements.directoryStatus, "Loading shippers...");
  renderLoadingRows();
  try {
    const result = await fetchShippers({
      search: state.search,
      status: state.status,
      relationship_stage: state.relationshipStage,
      offset: state.offset,
      limit: state.limit
    });
    state.rows = result.rows || [];
    state.total = Number(result.total || 0);
    renderDirectory();
    setStatus(elements.directoryStatus, `${state.total.toLocaleString()} shipper account(s).`, "success");
  } catch (error) {
    state.rows = [];
    state.total = 0;
    renderDirectory();
    setStatus(elements.directoryStatus, humanizeError(error), "error");
  }
}

const RELATIONSHIP_STAGES = ["target", "qualified", "customer", "at_risk", "inactive"];

function formatPipelineValue(value, currency) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${escapeHtml(currency || "")}`.trim();
}

function pipelineCard(row) {
  const location = [row.headquarters_city, row.headquarters_state, row.headquarters_country].filter(Boolean).join(", ");
  const contact = row.primary_contact_name || row.primary_contact_email || "Contact not assigned";
  const signals = [
    row.open_opportunity_count ? `${row.open_opportunity_count} open opp${Number(row.open_opportunity_count) === 1 ? "" : "s"}` : "No open opportunities",
    row.active_rfi_count ? `${row.active_rfi_count} active RFI${Number(row.active_rfi_count) === 1 ? "" : "s"}` : "No active RFI",
    row.open_action_count ? `${row.open_action_count} action${Number(row.open_action_count) === 1 ? "" : "s"}` : "No open actions"
  ];
  const pipelineValue = formatPipelineValue(row.pipeline_value, row.pipeline_currency);
  const pipelineValueLabel = row.pipeline_currency === "mixed" ? "Mixed currencies" : pipelineValue;
  return `
    <article class="shipper-pipeline-card" draggable="true" data-pipeline-shipper="${escapeHtml(row.id)}">
      <button type="button" class="shipper-pipeline-card-title" data-open-shipper="${escapeHtml(row.id)}">${escapeHtml(row.shipper_name)}</button>
      <p>${escapeHtml(row.domain || row.industry || location || "Account profile incomplete")}</p>
      <dl>
        <div><dt>Contact</dt><dd>${escapeHtml(contact)}</dd></div>
        <div><dt>Work</dt><dd>${escapeHtml(signals.join(" / "))}</dd></div>
        ${pipelineValueLabel ? `<div><dt>Open value</dt><dd>${pipelineValueLabel}</dd></div>` : ""}
        ${row.next_action ? `<div class="shipper-pipeline-next ${Number(row.due_action_count) ? "is-due" : ""}"><dt>${Number(row.due_action_count) ? "Due" : "Next"}</dt><dd><button type="button" data-open-shipper-tab="actions" data-open-shipper="${escapeHtml(row.id)}">${escapeHtml(row.next_action)}</button>${row.next_due_date ? `<small>${Number(row.due_action_count) ? "Due" : "Target"} ${formatDate(row.next_due_date)}${row.next_action_priority ? ` · ${humanLabel(row.next_action_priority)}` : ""}</small>` : ""}</dd></div>` : ""}
      </dl>
      <label class="shipper-pipeline-move"><span>Move to</span><select data-pipeline-stage="${escapeHtml(row.id)}">${RELATIONSHIP_STAGES.map((stage) => `<option value="${stage}" ${stage === row.relationship_stage ? "selected" : ""}>${escapeHtml(humanLabel(stage))}</option>`).join("")}</select></label>
    </article>`;
}

function renderPipeline() {
  const grouped = Object.fromEntries(RELATIONSHIP_STAGES.map((stage) => [stage, []]));
  state.pipelineRows.forEach((row) => {
    const stage = RELATIONSHIP_STAGES.includes(row.relationship_stage) ? row.relationship_stage : "target";
    grouped[stage].push(row);
  });
  elements.pipelineBoard.innerHTML = RELATIONSHIP_STAGES.map((stage) => {
    const rows = grouped[stage];
    return `
      <section class="shipper-pipeline-column" data-pipeline-drop-stage="${stage}">
        <header><div><span>${escapeHtml(humanLabel(stage))}</span><strong>${rows.length}</strong></div><small>${rows.length === 1 ? "account" : "accounts"}</small></header>
        <div class="shipper-pipeline-cards">${rows.length ? rows.map(pipelineCard).join("") : `<div class="shipper-pipeline-empty">Drop an account here</div>`}</div>
      </section>`;
  }).join("");
}

async function loadPipeline() {
  setStatus(elements.pipelineStatus, "Loading account pipeline...");
  elements.pipelineBoard.innerHTML = `<div class="shipper-pipeline-loading">Loading account stages...</div>`;
  try {
    const result = await fetchShipperRelationshipPipeline({
      search: state.pipelineSearch,
      status: state.pipelineStatus,
      limit: 750
    });
    state.pipelineRows = result.rows || [];
    state.pipelineLoaded = Number(result.loaded || state.pipelineRows.length);
    state.pipelineTotal = Number(result.total || state.pipelineRows.length);
    state.pipelineReady = true;
    renderPipeline();
    const suffix = state.pipelineTotal > state.pipelineLoaded ? ` Showing the most recently updated ${state.pipelineLoaded.toLocaleString()}.` : "";
    setStatus(elements.pipelineStatus, `${state.pipelineTotal.toLocaleString()} account(s) in the current pipeline.${suffix}`, "success");
  } catch (error) {
    state.pipelineRows = [];
    state.pipelineReady = false;
    elements.pipelineBoard.innerHTML = `<div class="shipper-pipeline-loading shipper-pipeline-error"><strong>Pipeline could not load</strong><span>${escapeHtml(humanizeError(error))}</span></div>`;
    setStatus(elements.pipelineStatus, humanizeError(error), "error");
  }
}

const OPEN_OPPORTUNITY_STAGES = ["identified", "discovery", "rfi", "rfx", "proposal", "negotiation"];
const OPPORTUNITY_STAGES = [...OPEN_OPPORTUNITY_STAGES, "won", "lost", "archived"];

function formatCommercialValue(value, currency) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${escapeHtml(currency || "")}`.trim();
}

function renderCommercial() {
  const counts = state.commercialCounts || {};
  elements.commercialRfis.textContent = Number(counts.open_rfis || 0).toLocaleString();
  elements.commercialUnlinked.textContent = Number(counts.unlinked_rfis || 0).toLocaleString();
  elements.commercialOpportunities.textContent = Number(counts.open_opportunities || 0).toLocaleString();
  elements.commercialWon.textContent = Number(counts.won_opportunities || 0).toLocaleString();
  elements.commercialDue.textContent = Number(counts.due_soon || 0).toLocaleString();
  elements.commercialRfiCount.textContent = String(state.commercialRfis.length);
  elements.commercialOpportunityCount.textContent = String(state.commercialOpportunities.length);
  const closedFocus = state.commercialFocus === "won" || state.commercialFocus === "lost";
  elements.commercialOpportunityKicker.textContent = closedFocus ? "Commercial outcome" : "Pipeline";
  elements.commercialOpportunityTitle.textContent = state.commercialFocus === "won"
    ? "Won / implementation"
    : state.commercialFocus === "lost"
      ? "Closed lost"
      : "Open deals";

  elements.commercialRfiBody.innerHTML = state.commercialRfis.length
    ? state.commercialRfis.map((row) => {
      const linked = row.linked_opportunity;
      return `<tr>
        <td><button class="shipper-inline-link" type="button" data-open-shipper-tab="rfis" data-open-shipper="${escapeHtml(row.shipper_id)}">${escapeHtml(row.shipper_name || "Shipper")}</button><small>${escapeHtml(row.shipper_domain || "No domain")}</small></td>
        <td><strong>${escapeHtml(row.rfi_name || "RFI")}</strong><small>${escapeHtml(row.external_reference || "No reference")}</small></td>
        <td>${formatDate(row.due_date)}</td>
        <td><span class="shipper-status">${escapeHtml(humanLabel(row.status))}</span></td>
        <td>${linked ? `<button class="shipper-inline-link" type="button" data-open-shipper-tab="opportunities" data-open-shipper="${escapeHtml(row.shipper_id)}">${escapeHtml(linked.opportunity_name || "Open deal")}</button>` : "Not created"}</td>
        <td>${linked ? "" : `<button class="secondary" type="button" data-promote-shipper-rfi="${escapeHtml(row.id)}">Create deal</button>`}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="shipper-commercial-empty">No RFIs match the current focus.</td></tr>`;

  elements.commercialOpportunityBody.innerHTML = state.commercialOpportunities.length
    ? state.commercialOpportunities.map((row) => {
      const project = row.rfx_project;
      const projectId = project?.id || row.rfx_project_id;
      const eventId = project?.linked_rfx_event_id;
      const closed = ["won", "lost"].includes(String(row.stage || "").toLowerCase());
      const workspaceLabel = eventId ? "Open Bid Room" : projectId ? "Open RFx" : closed ? "No RFx linked" : "Create RFx";
      const stageControl = closed
        ? `<span class="shipper-status">${escapeHtml(humanLabel(row.stage))}</span>`
        : `<select data-commercial-opportunity-stage="${escapeHtml(row.id)}">${OPPORTUNITY_STAGES.map((stage) => `<option value="${stage}" ${stage === row.stage ? "selected" : ""}>${escapeHtml(humanLabel(stage))}</option>`).join("")}</select>`;
      return `<tr>
      <td><button class="shipper-inline-link" type="button" data-open-shipper-tab="opportunities" data-open-shipper="${escapeHtml(row.shipper_id)}">${escapeHtml(row.shipper_name || "Shipper")}</button><small>${escapeHtml(row.shipper_domain || "No domain")}</small></td>
      <td><strong>${escapeHtml(row.opportunity_name || "Opportunity")}</strong><small>${escapeHtml(row.next_action || "No next action")}</small></td>
      <td>${stageControl}</td>
      <td>${formatCommercialValue(row.estimated_value, row.currency)}</td>
      <td>${formatDate(row.due_date)}</td>
      <td>${projectId ? `<button class="secondary" type="button" data-launch-shipper-rfx="${escapeHtml(row.id)}" data-rfx-project="${escapeHtml(projectId || "")}" data-rfx-event="${escapeHtml(eventId || "")}">${workspaceLabel}</button>` : `<span class="shipper-table-muted">${workspaceLabel}</span>`}</td>
    </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="shipper-commercial-empty">No open deals match the current focus.</td></tr>`;
}

function cadenceDueState(value) {
  if (!value) return { label: "No due date", tone: "neutral" };
  const today = new Date().toISOString().slice(0, 10);
  if (value < today) return { label: `Overdue ${formatDate(value)}`, tone: "overdue" };
  if (value === today) return { label: "Due today", tone: "today" };
  return { label: formatDate(value), tone: "upcoming" };
}

function renderCadence() {
  const counts = state.cadenceCounts || {};
  elements.cadenceOpen.textContent = Number(counts.open || 0).toLocaleString();
  elements.cadenceToday.textContent = Number(counts.today || 0).toLocaleString();
  elements.cadenceOverdue.textContent = Number(counts.overdue || 0).toLocaleString();
  elements.cadenceDone.textContent = Number(counts.done || 0).toLocaleString();
  elements.cadenceBody.innerHTML = state.cadenceRows.length
    ? state.cadenceRows.map((row) => {
      const due = cadenceDueState(row.due_date);
      const isDone = String(row.status || "").toLowerCase() === "done";
      const isInProgress = String(row.status || "").toLowerCase() === "in_progress";
      const statusAction = isDone
        ? `<button class="secondary" type="button" data-shipper-action-status="open" data-shipper-action-id="${escapeHtml(row.id)}">Reopen</button>`
        : isInProgress
          ? `<button type="button" data-shipper-action-status="done" data-shipper-action-id="${escapeHtml(row.id)}">Complete</button>`
          : `<button class="secondary" type="button" data-shipper-action-status="in_progress" data-shipper-action-id="${escapeHtml(row.id)}">Start</button>`;
      return `<tr>
        <td><button class="shipper-inline-link" type="button" data-open-shipper="${escapeHtml(row.shipper_id)}" data-open-shipper-tab="actions">${escapeHtml(row.shipper_name || "Shipper")}</button><small>${escapeHtml(row.shipper_domain || row.primary_contact_email || "No domain or primary contact")}</small></td>
        <td><strong>${escapeHtml(row.title || "Account action")}</strong><small>${escapeHtml(humanLabel(row.action_type || "follow_up"))}${row.notes ? ` | ${escapeHtml(row.notes)}` : ""}</small></td>
        <td><span class="shipper-cadence-due" data-tone="${due.tone}">${escapeHtml(due.label)}</span></td>
        <td>${escapeHtml(row.owner_email_assignee || "Unassigned")}</td>
        <td><span class="shipper-priority" data-priority="${escapeHtml(row.priority || "normal")}">${escapeHtml(humanLabel(row.priority || "normal"))}</span></td>
        <td><span class="shipper-status">${escapeHtml(humanLabel(row.status || "open"))}</span></td>
        <td class="shipper-row-actions">${statusAction}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="7" class="shipper-commercial-empty">No account actions match the current queue.</td></tr>`;
}

async function loadCadence() {
  if (state.cadenceLoading) return;
  state.cadenceLoading = true;
  setStatus(elements.cadenceStatus, "Loading account actions...");
  elements.cadenceBody.innerHTML = `<tr><td colspan="7" class="shipper-commercial-empty">Loading actions...</td></tr>`;
  try {
    const result = await fetchShipperActionQueue({
      search: state.cadenceSearch,
      focus: state.cadenceFocus,
      limit: 1000
    });
    state.cadenceRows = result.rows || [];
    state.cadenceCounts = result.counts || {};
    state.cadenceReady = true;
    renderCadence();
    setStatus(elements.cadenceStatus, `${state.cadenceRows.length.toLocaleString()} action(s) loaded for this queue.`, "success");
  } catch (error) {
    state.cadenceRows = [];
    state.cadenceCounts = {};
    state.cadenceReady = false;
    renderCadence();
    setStatus(elements.cadenceStatus, humanizeError(error), "error");
  } finally {
    state.cadenceLoading = false;
  }
}

async function updateCadenceActionStatus(id, status, button) {
  const row = state.cadenceRows.find((item) => item.id === id);
  if (!row) return;
  button.disabled = true;
  const actionMessage = status === "done"
    ? "Completing account action..."
    : status === "in_progress"
      ? "Starting account action..."
      : "Reopening account action...";
  setStatus(elements.cadenceStatus, actionMessage);
  try {
    const updated = await updateShipperAccountActionStatus(id, status);
    state.cadenceRows = state.cadenceRows.map((item) => item.id === id ? { ...item, ...updated } : item);
    if (state.detail?.row?.id === updated.shipper_id) {
      state.detail.actions = (state.detail.actions || []).map((item) => item.id === id ? { ...item, ...updated } : item);
      syncActiveShipperLocally();
    }
    await Promise.all([loadSummary(), state.intelligenceReady ? loadShipperIntelligence() : Promise.resolve()]);
    await loadCadence();
    const successMessage = status === "done"
      ? "Account action completed."
      : status === "in_progress"
        ? "Account action started."
        : "Account action reopened.";
    setStatus(elements.cadenceStatus, successMessage, "success");
  } catch (error) {
    setStatus(elements.cadenceStatus, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function loadCommercialWork() {
  setStatus(elements.commercialStatus, "Loading RFIs and deals...");
  elements.commercialRfiBody.innerHTML = `<tr><td colspan="6" class="shipper-commercial-empty">Loading RFIs...</td></tr>`;
  elements.commercialOpportunityBody.innerHTML = `<tr><td colspan="5" class="shipper-commercial-empty">Loading deals...</td></tr>`;
  try {
    const result = await fetchShipperCommercialWork({
      search: state.commercialSearch,
      focus: state.commercialFocus,
      limit: 1000
    });
    state.commercialRfis = result.rfis || [];
    state.commercialOpportunities = result.opportunities || [];
    state.commercialCounts = result.counts || {};
    state.commercialReady = true;
    renderCommercial();
    const resultLabel = state.commercialFocus === "won" ? "won deal(s)" : state.commercialFocus === "lost" ? "closed-lost deal(s)" : "open deal(s)";
    setStatus(elements.commercialStatus, `${state.commercialRfis.length.toLocaleString()} RFI(s) and ${state.commercialOpportunities.length.toLocaleString()} ${resultLabel} in the current focus.`, "success");
  } catch (error) {
    state.commercialRfis = [];
    state.commercialOpportunities = [];
    state.commercialCounts = {};
    state.commercialReady = false;
    renderCommercial();
    setStatus(elements.commercialStatus, humanizeError(error), "error");
  }
}

function intelligencePriorityLabel(row) {
  const labels = {
    ready: "Ready to engage",
    needs_contact: "Needs contact",
    needs_lane: "Needs lane coverage",
    due_action: "Due action",
    at_risk: "At risk",
    complete: "Complete account"
  };
  return labels[row?.priority] || "Review account";
}

function intelligencePriorityTone(row) {
  if (row?.priority === "due_action" || row?.priority === "at_risk") return "urgent";
  if (row?.priority === "needs_contact" || row?.priority === "needs_lane") return "warning";
  if (row?.priority === "ready") return "success";
  return "neutral";
}

function formatIntelligenceValue(value, currency) {
  if (currency === "mixed") return "Mixed currencies";
  return formatCommercialValue(value, currency);
}

function renderShipperIntelligence() {
  const counts = state.intelligenceCounts || {};
  elements.intelligenceScanned.textContent = Number(state.intelligenceScanned || 0).toLocaleString();
  elements.intelligenceReady.textContent = Number(counts.ready || 0).toLocaleString();
  elements.intelligenceNeedsData.textContent = Number(counts.needs_data || 0).toLocaleString();
  elements.intelligenceDue.textContent = Number(counts.due_action || 0).toLocaleString();
  elements.intelligenceValue.textContent = formatIntelligenceValue(counts.open_pipeline_value, counts.open_pipeline_currency);

  elements.intelligenceBody.innerHTML = state.intelligenceRows.length
    ? state.intelligenceRows.map((row) => {
      const locations = Number(row.location_count || 0);
      const lanes = Number(row.lane_count || 0);
      const contacts = Number(row.contact_count || 0);
      const markets = Number(row.market_count || 0);
      const openRfis = Number(row.active_rfi_count || 0);
      const openDeals = Number(row.open_opportunity_count || 0);
      const score = Math.max(0, Math.min(100, Number(row.health_score || 0)));
      const commercialValue = formatIntelligenceValue(row.pipeline_value, row.pipeline_currency);
      const priorityDetail = row.next_action || row.priority_detail || "Review this account record.";
      return `<tr>
        <td><button class="shipper-inline-link" type="button" data-open-shipper="${escapeHtml(row.id)}">${escapeHtml(row.shipper_name || row.legal_name || "Unnamed account")}</button><small>${escapeHtml(row.domain || [row.headquarters_city, row.headquarters_state].filter(Boolean).join(", ") || "No domain or headquarters")}</small></td>
        <td><div class="shipper-intelligence-health"><strong>${score}</strong><span><i style="width:${score}%"></i></span></div><small>${escapeHtml(row.health_label || "Profile review")}</small></td>
        <td><strong>${contacts} contact${contacts === 1 ? "" : "s"} &middot; ${locations} site${locations === 1 ? "" : "s"}</strong><small>${lanes} lane${lanes === 1 ? "" : "s"} &middot; ${markets} market${markets === 1 ? "" : "s"}</small></td>
        <td><strong>${openRfis} RFI &middot; ${openDeals} deal${openDeals === 1 ? "" : "s"}</strong><small>${escapeHtml(commercialValue)}</small></td>
        <td><span class="shipper-intelligence-priority" data-tone="${escapeHtml(intelligencePriorityTone(row))}">${escapeHtml(intelligencePriorityLabel(row))}</span><small>${escapeHtml(priorityDetail)}</small><button class="shipper-inline-link" type="button" data-open-shipper-tab="actions" data-open-shipper="${escapeHtml(row.id)}">Plan action</button></td>
        <td>${formatDate(row.last_activity_at || row.updated_at)}<small>${escapeHtml(row.relationship_stage ? humanLabel(row.relationship_stage) : "No relationship stage")}</small></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="shipper-commercial-empty">No account signals match the current focus.</td></tr>`;
}

async function loadShipperIntelligence() {
  if (state.intelligenceLoading) return;
  state.intelligenceLoading = true;
  elements.intelligenceRefresh.disabled = true;
  setStatus(elements.intelligenceStatus, "Reading account health, coverage, RFIs, and open deals...");
  elements.intelligenceBody.innerHTML = `<tr><td colspan="6" class="shipper-commercial-empty">Loading account signals...</td></tr>`;
  try {
    const result = await fetchShipperIntelligence({
      search: state.intelligenceSearch,
      focus: state.intelligenceFocus,
      limit: 1000
    });
    state.intelligenceRows = Array.isArray(result.rows) ? result.rows : [];
    state.intelligenceCounts = result.counts || {};
    state.intelligenceScanned = Number(result.loaded || state.intelligenceRows.length);
    state.intelligenceTotal = Number(result.total || state.intelligenceRows.length);
    state.intelligenceTruncated = Boolean(result.truncated);
    state.intelligenceReady = true;
    renderShipperIntelligence();
    const suffix = state.intelligenceTruncated ? ` Showing ${state.intelligenceScanned.toLocaleString()} most recently updated accounts.` : "";
    setStatus(elements.intelligenceStatus, `${state.intelligenceRows.length.toLocaleString()} account signal(s) in the current focus.${suffix}`, "success");
  } catch (error) {
    state.intelligenceRows = [];
    state.intelligenceCounts = {};
    state.intelligenceScanned = 0;
    state.intelligenceReady = false;
    renderShipperIntelligence();
    setStatus(elements.intelligenceStatus, humanizeError(error), "error");
  } finally {
    state.intelligenceLoading = false;
    elements.intelligenceRefresh.disabled = false;
  }
}

async function promoteCommercialRfi(rfiId) {
  setStatus(elements.commercialStatus, "Creating commercial deal from the RFI...");
  try {
    const result = await promoteShipperRfiToOpportunity(rfiId);
    await Promise.all([
      loadCommercialWork(),
      loadSummary(),
      state.pipelineReady ? loadPipeline() : Promise.resolve()
    ]);
    setStatus(elements.commercialStatus, result.created ? "Commercial deal created from the RFI." : "This RFI already has a commercial deal.", "success");
  } catch (error) {
    setStatus(elements.commercialStatus, humanizeError(error), "error");
  }
}

async function moveCommercialOpportunity(opportunityId, stage) {
  const row = state.commercialOpportunities.find((item) => item.id === opportunityId);
  const previousStage = row?.stage;
  if (!row || previousStage === stage) return;
  setStatus(elements.commercialStatus, `Moving ${row.opportunity_name} to ${humanLabel(stage)}...`);
  try {
    const updated = await moveShipperOpportunityStage(opportunityId, stage);
    row.stage = updated.stage;
    renderCommercial();
    setStatus(elements.commercialStatus, `${row.opportunity_name} moved to ${humanLabel(updated.stage)}.`, "success");
    await Promise.all([loadSummary(), state.pipelineReady ? loadPipeline() : Promise.resolve()]);
  } catch (error) {
    row.stage = previousStage;
    renderCommercial();
    setStatus(elements.commercialStatus, humanizeError(error), "error");
  }
}

function openRfxWorkspace(projectId, eventId = "") {
  const path = eventId
    ? `./rfx-events.html?rfx_event_id=${encodeURIComponent(eventId)}`
    : `./rfx-process.html?project=${encodeURIComponent(projectId)}`;
  window.location.assign(path);
}

function openRatebookWorkspace(ratebookId = "", projectId = "") {
  const query = new URLSearchParams();
  if (ratebookId) query.set("ratebook", ratebookId);
  else if (projectId) query.set("project", projectId);
  const suffix = query.toString();
  window.location.assign(`./ratebook.html${suffix ? `?${suffix}` : ""}`);
}

async function launchCommercialRfx(opportunityId, projectId = "", eventId = "") {
  if (projectId) return openRfxWorkspace(projectId, eventId);
  const row = state.commercialOpportunities.find((item) => item.id === opportunityId);
  if (!row) return;
  setStatus(elements.commercialStatus, `Creating an RFx workspace for ${row.opportunity_name}...`);
  try {
    const result = await launchShipperOpportunityRfx(opportunityId);
    const project = result.project || {};
    setStatus(elements.commercialStatus, result.created ? "RFx workspace created. Opening the demand workspace..." : "Opening the existing RFx workspace...", "success");
    openRfxWorkspace(project.id, project.linked_rfx_event_id);
  } catch (error) {
    setStatus(elements.commercialStatus, humanizeError(error), "error");
  }
}

async function startCommercialRatebook(opportunityId, projectId = "") {
  if (projectId) return openRatebookWorkspace("", projectId);
  const row = state.commercialOpportunities.find((item) => item.id === opportunityId)
    || (state.detail?.opportunities || []).find((item) => item.id === opportunityId);
  if (!row) return;
  setStatus(elements.commercialStatus, `Creating a Ratebook from ${row.opportunity_name || "this opportunity"}...`);
  try {
    const result = await launchShipperOpportunityRfx(opportunityId);
    const project = result.project || {};
    if (!project.id) throw new Error("The RFx project was created without a Ratebook source.");
    setStatus(elements.commercialStatus, "Ratebook source created. Opening the route book...", "success");
    openRatebookWorkspace("", project.id);
  } catch (error) {
    setStatus(elements.commercialStatus, humanizeError(error), "error");
  }
}

function duplicateReasonLabel(value) {
  const labels = {
    domain: "Exact domain",
    email: "Exact contact email",
    legal_name: "Same legal or account name"
  };
  return labels[value] || humanLabel(value);
}

function renderDuplicateAccount(row, position) {
  const fields = [
    row.domain,
    row.primary_contact_email,
    [row.headquarters_city, row.headquarters_state].filter(Boolean).join(", ")
  ].filter(Boolean);
  return `<article class="shipper-duplicate-account">
    <span class="shipper-duplicate-position">${escapeHtml(position)}</span>
    <button class="shipper-name-link" type="button" data-open-shipper="${escapeHtml(row.id)}">${escapeHtml(row.shipper_name || row.legal_name || "Unnamed account")}</button>
    <small>${escapeHtml(row.legal_name || "No legal name")}</small>
    <p>${fields.length ? fields.map((field) => escapeHtml(field)).join("<br />") : "No domain, contact email, or headquarters recorded."}</p>
    <span class="shipper-status-chip">${escapeHtml(humanLabel(row.status || "prospect"))}</span>
  </article>`;
}

function renderShipperDuplicates() {
  const groups = state.duplicateGroups;
  elements.duplicatesScanned.textContent = String(state.duplicatesScanned || 0);
  elements.duplicatesCount.textContent = String(groups.length);
  if (!groups.length) {
    elements.duplicatesList.innerHTML = `<div class="shipper-duplicates-empty"><strong>No duplicate candidates found</strong><span>The scan only flags exact domain, contact email, or normalized legal-name matches. It does not merge anything automatically.</span></div>`;
    return;
  }
  elements.duplicatesList.innerHTML = groups.map((group, index) => {
    const [left = {}, right = {}] = Array.isArray(group.shippers) ? group.shippers : [];
    const reasons = (group.reasons || []).map(duplicateReasonLabel).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("");
    return `<section class="shipper-duplicate-candidate">
      <header><div><p class="eyebrow">Candidate ${index + 1}</p><h3>Review before consolidation</h3></div><div class="shipper-duplicate-reasons">${reasons}</div></header>
      <div class="shipper-duplicate-comparison">
        ${renderDuplicateAccount(left, "Account A")}
        <div class="shipper-duplicate-actions"><span>Choose the account of record</span><button type="button" data-merge-shipper-primary="${escapeHtml(left.id)}" data-merge-shipper-duplicate="${escapeHtml(right.id)}">Keep A</button><button class="secondary" type="button" data-merge-shipper-primary="${escapeHtml(right.id)}" data-merge-shipper-duplicate="${escapeHtml(left.id)}">Keep B</button></div>
        ${renderDuplicateAccount(right, "Account B")}
      </div>
    </section>`;
  }).join("");
}

async function loadShipperDuplicates() {
  if (state.duplicatesLoading) return;
  state.duplicatesLoading = true;
  elements.duplicatesRefresh.disabled = true;
  setStatus(elements.duplicatesStatus, "Scanning active Shipper Base accounts for exact matches...");
  try {
    const data = await fetchShipperDuplicates();
    state.duplicateGroups = Array.isArray(data.groups) ? data.groups : [];
    state.duplicatesScanned = Number(data.scanned) || 0;
    state.duplicatesReady = true;
    renderShipperDuplicates();
    const detail = data.truncated
      ? `Scanned ${state.duplicatesScanned} active accounts. Review candidates shown from the current safety scan.`
      : `Scanned ${state.duplicatesScanned} active accounts. Review candidates before consolidating any account.`;
    setStatus(elements.duplicatesStatus, detail, state.duplicateGroups.length ? "warning" : "success");
  } catch (error) {
    state.duplicatesReady = false;
    elements.duplicatesList.innerHTML = `<div class="shipper-duplicates-empty"><strong>Duplicate review could not load</strong><span>${escapeHtml(humanizeError(error))}</span></div>`;
    setStatus(elements.duplicatesStatus, humanizeError(error), "error");
  } finally {
    state.duplicatesLoading = false;
    elements.duplicatesRefresh.disabled = false;
  }
}

async function mergeDuplicateShippers(primaryId, duplicateId) {
  const group = state.duplicateGroups.find((item) => item.shippers?.some((row) => row.id === primaryId) && item.shippers?.some((row) => row.id === duplicateId));
  const primary = group?.shippers?.find((row) => row.id === primaryId) || {};
  const duplicate = group?.shippers?.find((row) => row.id === duplicateId) || {};
  const primaryName = primary.shipper_name || primary.legal_name || "this account";
  const duplicateName = duplicate.shipper_name || duplicate.legal_name || "the duplicate account";
  if (!window.confirm(`Keep ${primaryName} as the account of record? ${duplicateName} will be archived after its contacts, locations, lanes, RFIs, and opportunities are moved.`)) return;
  setStatus(elements.duplicatesStatus, `Consolidating ${duplicateName} into ${primaryName}...`);
  try {
    const result = await mergeShipperAccounts(primaryId, duplicateId);
    state.selected.delete(duplicateId);
    await refreshAccountWorkspace({ duplicates: true });
    if (state.activeShipperId === primaryId || state.activeShipperId === duplicateId) await openDrawer(result.target?.id || primaryId);
    setStatus(elements.duplicatesStatus, `${duplicateName} was consolidated into ${primaryName}. The duplicate account is archived.`, "success");
  } catch (error) {
    setStatus(elements.duplicatesStatus, humanizeError(error), "error");
  }
}

function setActiveView(view) {
  state.activeView = ["directory", "pipeline", "commercial", "cadence", "intelligence", "import", "duplicates"].includes(view) ? view : "directory";
  elements.directory.classList.toggle("hidden", state.activeView !== "directory");
  elements.pipeline.classList.toggle("hidden", state.activeView !== "pipeline");
  elements.commercial.classList.toggle("hidden", state.activeView !== "commercial");
  elements.cadence.classList.toggle("hidden", state.activeView !== "cadence");
  elements.intelligencePanel.classList.toggle("hidden", state.activeView !== "intelligence");
  elements.importPanel.classList.toggle("hidden", state.activeView !== "import");
  elements.duplicatesPanel.classList.toggle("hidden", state.activeView !== "duplicates");
  elements.viewSwitcher.querySelectorAll("[data-shipper-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.shipperView === state.activeView);
  });
  if (state.activeView === "pipeline") {
    if (state.pipelineReady) renderPipeline();
    else loadPipeline();
  }
  if (state.activeView === "commercial") {
    if (state.commercialReady) renderCommercial();
    else loadCommercialWork();
  }
  if (state.activeView === "cadence") {
    if (state.cadenceReady) renderCadence();
    else loadCadence();
  }
  if (state.activeView === "intelligence") {
    if (state.intelligenceReady) renderShipperIntelligence();
    else loadShipperIntelligence();
  }
  if (state.activeView === "duplicates") {
    if (state.duplicatesReady) renderShipperDuplicates();
    else loadShipperDuplicates();
  }
}

async function refreshAccountWorkspace({ directory = true, pipeline = true, commercial = true, intelligence = true, duplicates = true } = {}) {
  const tasks = [loadSummary()];
  if (directory) tasks.push(loadRows());
  if (pipeline && (state.activeView === "pipeline" || state.pipelineReady)) tasks.push(loadPipeline());
  if (commercial && (state.activeView === "commercial" || state.commercialReady)) tasks.push(loadCommercialWork());
  if (state.activeView === "cadence" || state.cadenceReady) tasks.push(loadCadence());
  if (intelligence && (state.activeView === "intelligence" || state.intelligenceReady)) tasks.push(loadShipperIntelligence());
  if (duplicates && (state.activeView === "duplicates" || state.duplicatesReady)) tasks.push(loadShipperDuplicates());
  await Promise.all(tasks);
}

function syncActiveShipperLocally() {
  const account = state.detail?.row;
  if (!account?.id) return;
  const mergeAccount = (row) => row.id === account.id ? { ...row, ...account } : row;
  state.rows = state.rows.map(mergeAccount);
  if (state.activeView === "directory") renderRows();

  if (!state.pipelineReady) return;
  const openActions = (state.detail?.actions || [])
    .filter((row) => ["open", "in_progress"].includes(String(row.status || "").toLowerCase()))
    .slice()
    .sort((left, right) => String(left.due_date || "9999-12-31").localeCompare(String(right.due_date || "9999-12-31")));
  const today = new Date().toISOString().slice(0, 10);
  const dueActions = openActions.filter((row) => row.due_date && row.due_date <= today);
  const nextAction = openActions[0] || null;
  state.pipelineRows = state.pipelineRows.map((row) => row.id === account.id ? {
    ...row,
    ...account,
    open_action_count: openActions.length,
    due_action_count: dueActions.length,
    next_action: nextAction?.title || row.next_action,
    next_due_date: nextAction?.due_date || row.next_due_date,
    next_action_priority: nextAction?.priority || row.next_action_priority
  } : row);
  if (state.activeView === "pipeline") renderPipeline();
}

async function movePipelineShipper(shipperId, relationshipStage) {
  const row = state.pipelineRows.find((item) => item.id === shipperId);
  if (!row || row.relationship_stage === relationshipStage) return;
  const previousStage = row.relationship_stage;
  setStatus(elements.pipelineStatus, `Moving ${row.shipper_name} to ${humanLabel(relationshipStage)}...`);
  try {
    const updated = await moveShipperRelationshipStage(shipperId, relationshipStage);
    row.relationship_stage = updated.relationship_stage;
    renderPipeline();
    setStatus(elements.pipelineStatus, `${row.shipper_name} moved to ${humanLabel(updated.relationship_stage)}.`, "success");
    await Promise.all([loadSummary(), loadRows()]);
  } catch (error) {
    row.relationship_stage = previousStage;
    renderPipeline();
    setStatus(elements.pipelineStatus, humanizeError(error), "error");
  }
}

function overviewField(name, label, value, options = {}) {
  const span = options.wide ? " span-2" : "";
  if (options.type === "textarea") {
    return `<label class="${span.trim()}"><span>${label}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
  }
  if (options.values) {
    return `<label class="${span.trim()}"><span>${label}</span><select name="${name}">${options.values.map((item) => `<option value="${escapeHtml(item)}" ${item === value ? "selected" : ""}>${escapeHtml(humanLabel(item))}</option>`).join("")}</select></label>`;
  }
  return `<label class="${span.trim()}"><span>${label}</span><input name="${name}" type="${options.type || "text"}" value="${escapeHtml(value || "")}" ${options.required ? "required" : ""} /></label>`;
}

function renderOverview() {
  const row = state.detail?.row || {};
  const rfis = state.detail?.rfis || [];
  const opportunities = state.detail?.opportunities || [];
  const accountActions = state.detail?.actions || [];
  const openStages = new Set(["identified", "discovery", "rfi", "rfx", "proposal", "negotiation"]);
  const openDeals = opportunities.filter((item) => openStages.has(String(item.stage || "").toLowerCase()));
  const wonDeals = opportunities.filter((item) => String(item.stage || "").toLowerCase() === "won");
  const lostDeals = opportunities.filter((item) => String(item.stage || "").toLowerCase() === "lost");
  const activeRfis = rfis.filter((item) => !["approved", "archived"].includes(String(item.status || "").toLowerCase()));
  const openActions = accountActions
    .filter((item) => ["open", "in_progress"].includes(String(item.status || "").toLowerCase()))
    .sort((left, right) => String(left.due_date || "9999-12-31").localeCompare(String(right.due_date || "9999-12-31")));
  const nextAction = openActions[0];
  const nextActionDue = cadenceDueState(nextAction?.due_date);
  const readinessChecks = [
    Boolean(row.primary_contact_email || (state.detail?.contacts || []).some((item) => item.email)),
    Boolean((state.detail?.lanes || []).length),
    Boolean(activeRfis.length || openDeals.length)
  ];
  const readinessScore = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);
  const readinessLabel = readinessScore === 100
    ? "Ready for commercial execution"
    : readinessScore >= 67
      ? "Partially prepared"
      : "Needs account setup";
  const linkedProject = [...openDeals, ...wonDeals, ...lostDeals].find((item) => item.rfx_project_id);
  const rfxAction = linkedProject
    ? `<button class="secondary" type="button" data-open-shipper-rfx-project="${escapeHtml(linkedProject.rfx_project_id)}">Open linked RFx</button>`
    : `<button class="secondary" type="button" data-open-shipper-tab="opportunities">Open commercial work</button>`;
  const profileRequest = (state.detail?.profile_requests || []).find((item) => ["active", "viewed", "submitted"].includes(String(item.status || "").toLowerCase()));
  const profileLink = profileRequest
    ? `<section class="shipper-profile-link-panel"><div><p class="eyebrow">Customer self-service</p><h3>Secure profile link</h3><p>Active until ${escapeHtml(String(profileRequest.expires_at || "").slice(0, 10))}. It updates this account, contacts and onboarding record without creating a duplicate profile.</p></div><div class="shipper-profile-link-actions"><button type="button" class="secondary" data-apply-shipper-playbook="profile_refresh">Plan profile follow-up</button><button type="button" class="secondary" data-create-shipper-profile-link>Renew and copy link</button><button type="button" class="danger" data-revoke-shipper-profile-link="${escapeHtml(profileRequest.id)}">Revoke</button></div></section>`
    : `<section class="shipper-profile-link-panel"><div><p class="eyebrow">Customer self-service</p><h3>Invite the shipper to complete its profile</h3><p>Creates a 30-day magic link for legal identity, billing, contacts, service scope and TMS onboarding. RFIs, lanes and opportunities remain internal.</p></div><button type="button" data-create-shipper-profile-link>Create secure link</button></section>`;
  const actionSummary = nextAction
    ? `<button type="button" class="shipper-account-next-action" data-open-shipper-tab="actions"><span>Next action</span><strong>${escapeHtml(nextAction.title || "Account follow-up")}</strong><small><span class="shipper-cadence-due" data-tone="${escapeHtml(nextActionDue.tone)}">${escapeHtml(nextActionDue.label)}</span>${nextAction.priority ? ` ${escapeHtml(humanLabel(nextAction.priority))}` : ""}</small></button>`
    : `<button type="button" class="shipper-account-next-action is-empty" data-open-shipper-tab="actions"><span>Next action</span><strong>Plan a follow-up</strong><small>No open account action</small></button>`;
  elements.drawerContent.innerHTML = `
    <section class="shipper-account-command" aria-label="Commercial account summary">
      <div class="shipper-account-command-heading">
        <div><p class="eyebrow">Account 360</p><h3>Commercial readiness</h3></div>
        ${rfxAction}
      </div>
      <div class="shipper-account-command-stats">
        <div><span>Readiness</span><strong>${readinessScore}%</strong><small>${readinessLabel}</small></div>
        <div><span>Active RFIs</span><strong>${activeRfis.length}</strong></div>
        <div><span>Open deals</span><strong>${openDeals.length}</strong></div>
        <div><span>Won / lost</span><strong>${wonDeals.length} / ${lostDeals.length}</strong></div>
      </div>
      ${actionSummary}
      <p class="shipper-account-command-note">${linkedProject ? "A linked RFx workspace is available for this account." : "Create a deal from an RFI when this account is ready to enter procurement."}</p>
    </section>
    ${profileLink}
    <form id="shipper-overview-form" class="shipper-form-grid shipper-drawer-form">
      ${overviewField("shipper_name", "Shipper name", row.shipper_name, { required: true, wide: true })}
      ${overviewField("legal_name", "Legal name", row.legal_name)}
      ${overviewField("domain", "Domain", row.domain)}
      ${overviewField("website", "Website", row.website, { type: "url" })}
      ${overviewField("logo_url", "Logo URL", row.logo_url, { type: "url" })}
      ${overviewField("industry", "Industry", row.industry)}
      ${overviewField("segment", "Segment", row.segment)}
      ${overviewField("status", "Status", row.status, { values: ["prospect", "active", "inactive", "archived"] })}
      ${overviewField("relationship_stage", "Relationship", row.relationship_stage, { values: ["target", "qualified", "customer", "at_risk", "inactive"] })}
      ${overviewField("revenue_tier", "Revenue tier", row.revenue_tier)}
      ${overviewField("account_owner_email", "Account owner", row.account_owner_email, { type: "email" })}
      ${overviewField("primary_contact_name", "Primary contact", row.primary_contact_name)}
      ${overviewField("primary_contact_email", "Primary email", row.primary_contact_email, { type: "email" })}
      ${overviewField("primary_contact_phone", "Primary phone", row.primary_contact_phone, { type: "tel" })}
      ${overviewField("headquarters_city", "HQ city", row.headquarters_city)}
      ${overviewField("headquarters_state", "HQ state", row.headquarters_state)}
      ${overviewField("headquarters_country", "HQ country", row.headquarters_country)}
      ${overviewField("tags", "Tags", (row.tags || []).join(", "), { wide: true })}
      ${overviewField("notes", "Account notes", row.notes, { type: "textarea", wide: true })}
      <div class="span-2 shipper-form-actions">
        <p id="shipper-drawer-status" role="status"></p>
        <button type="submit">Save account</button>
      </div>
    </form>`;
}

const CHILD_FIELD_DEFAULTS = {
  rfis: { status: "draft" },
  opportunities: { stage: "identified" },
  actions: { action_type: "follow_up", status: "open", priority: "normal" }
};

const ACTION_PLAYBOOKS = [
  { key: "discovery", label: "Qualify account", detail: "Contacts, discovery, lane scope" },
  { key: "rfi_follow_up", label: "Advance RFI", detail: "Scope, deadline, commercial deal" },
  { key: "proposal", label: "Follow up proposal", detail: "Receipt, feedback, decision" },
  { key: "implementation", label: "Prepare implementation", detail: "Owners, data, launch readiness" },
  { key: "reengagement", label: "Re-engage account", detail: "Reconnect with a clear outcome" },
  { key: "profile_refresh", label: "Refresh profile", detail: "Link, review, and resolve account data" }
];

function childField(field, row = {}, entity = "") {
  const [name, label, type, required, values] = field;
  const value = row[name] ?? CHILD_FIELD_DEFAULTS[entity]?.[name] ?? "";
  if (type === "checkbox") {
    return `<label class="shipper-checkbox-field"><input name="${name}" type="checkbox" ${value ? "checked" : ""} /><span>${label}</span></label>`;
  }
  if (type === "textarea") return overviewField(name, label, value, { type, wide: true });
  if (type === "select") return overviewField(name, label, value, { values: ["", ...values] });
  return overviewField(name, label, value, { type, required });
}

function childCell(row, field) {
  const value = row[field];
  if (value === null || value === undefined || value === "") return "-";
  if (field === "probability") return `${escapeHtml(value)}%`;
  if (field === "estimated_value" || field === "current_rate") {
    return `${Number(value).toLocaleString()} ${escapeHtml(row.currency || "")}`.trim();
  }
  return escapeHtml(humanLabel(value));
}

function renderChildTab(entity) {
  const config = CHILD_CONFIG[entity];
  const rows = state.detail?.[entity] || [];
  const editing = rows.find((row) => row.id === state.editingRecordId) || {};
  const actionCell = (row) => {
    const controls = [
      `<button class="secondary" type="button" data-edit-shipper-record="${escapeHtml(row.id)}">Edit</button>`
    ];
    if (entity === "rfis") {
      const linked = (state.detail?.opportunities || []).find((opportunity) => opportunity.rfi_id === row.id);
      if (linked?.rfx_project_id) {
        controls.push(`<button class="secondary" type="button" data-open-shipper-ratebook="${escapeHtml(linked.rfx_project_id)}">Open Ratebook</button>`);
      } else if (linked) {
        controls.push(`<button class="secondary" type="button" data-start-shipper-ratebook="${escapeHtml(linked.id)}">Create Ratebook</button>`);
      } else {
        controls.push(`<button class="secondary" type="button" data-start-rfi-ratebook="${escapeHtml(row.id)}">Start Ratebook</button>`);
        controls.push(`<button class="secondary" type="button" data-promote-shipper-rfi="${escapeHtml(row.id)}">Create deal</button>`);
      }
    }
    if (entity === "opportunities") {
      const closed = ["won", "lost", "archived"].includes(String(row.stage || "").toLowerCase());
      controls.push(row.rfx_project_id
        ? `<button class="secondary" type="button" data-open-shipper-ratebook="${escapeHtml(row.rfx_project_id)}">Open Ratebook</button>`
        : closed
          ? `<span class="shipper-table-muted">Closed outcome</span>`
          : `<button class="secondary" type="button" data-start-shipper-ratebook="${escapeHtml(row.id)}">Create Ratebook</button>`);
    }
    controls.push(`<button class="secondary" type="button" data-delete-shipper-record="${escapeHtml(row.id)}">Delete</button>`);
    return controls.join("");
  };
  const playbookControls = entity === "actions" ? `
      <section class="shipper-action-playbooks">
        <div class="shipper-action-playbooks-heading">
          <div><p class="eyebrow">Playbooks</p><strong>Generate next actions</strong></div>
          <span>Only missing open tasks are created</span>
        </div>
        <div class="shipper-action-playbooks-list">
          ${ACTION_PLAYBOOKS.map((playbook) => `<button class="secondary shipper-action-playbook" type="button" data-apply-shipper-playbook="${playbook.key}" title="${playbook.label}: ${playbook.detail}"><strong>${playbook.label}</strong><span>${playbook.detail}</span></button>`).join("")}
        </div>
        <p id="shipper-playbook-status" class="shipper-inline-status" role="status"></p>
      </section>` : "";
  elements.drawerContent.innerHTML = `
    <section class="shipper-child-workspace">
      <div class="shipper-child-heading"><div><p class="eyebrow">Account detail</p><h3>${config.title}</h3></div><span>${rows.length} record(s)</span></div>
      ${playbookControls}
      <div class="shipper-child-table-wrap">
        <table class="shipper-child-table">
          <thead><tr>${config.columns.map(([, label]) => `<th>${label}</th>`).join("")}<th>Action</th></tr></thead>
          <tbody>${rows.length ? rows.map((row) => `<tr>${config.columns.map(([field]) => `<td>${childCell(row, field)}</td>`).join("")}<td class="shipper-row-actions">${actionCell(row)}</td></tr>`).join("") : `<tr><td colspan="${config.columns.length + 1}">No ${config.title.toLowerCase()} yet.</td></tr>`}</tbody>
        </table>
      </div>
      <form id="shipper-child-form" data-shipper-entity="${entity}" class="shipper-form-grid shipper-child-form">
        <div class="span-2 shipper-child-form-title"><strong>${state.editingRecordId ? `Edit ${config.noun}` : `Add ${config.noun}`}</strong>${state.editingRecordId ? `<button class="secondary" type="button" data-cancel-record-edit>Cancel edit</button>` : ""}</div>
        ${config.fields.map((field) => childField(field, editing, entity)).join("")}
        <div class="span-2 shipper-form-actions"><p id="shipper-drawer-status" role="status"></p><button type="submit">${state.editingRecordId ? "Save changes" : `Add ${config.noun}`}</button></div>
      </form>
    </section>`;
}

function renderRatebookTab() {
  const rows = state.detail?.ratebooks || [];
  const sourceLabel = (row) => [row.project?.customer_name, row.project?.title].filter(Boolean).join(" | ") || "RFx route book";
  elements.drawerContent.innerHTML = `
    <section class="shipper-ratebook-workspace">
      <div class="shipper-child-heading">
        <div><p class="eyebrow">RFx route books</p><h3>Ratebooks</h3></div>
        <span>${rows.length} book(s)</span>
      </div>
      <p class="shipper-ratebook-intro">Each book is derived from an RFx package. Open a route to review RFI requirements, then share the book through carrier-specific Bid Room invitations.</p>
      <div class="shipper-ratebook-list">
        ${rows.length ? rows.map((row) => `
          <article class="shipper-ratebook-card">
            <div>
              <strong>${escapeHtml(row.name || row.package?.name || "Untitled Ratebook")}</strong>
              <span>${escapeHtml(sourceLabel(row))}</span>
              <small>${escapeHtml(humanLabel(row.status || "draft"))} | ${Number(row.lane_count || 0)} route(s) | ${Number(row.shared_carrier_count || 0)} carrier share(s)</small>
            </div>
            <button type="button" data-open-ratebook-id="${escapeHtml(row.id)}">Open Ratebook</button>
          </article>`).join("") : `
          <div class="shipper-empty-activity"><strong>No Ratebook yet</strong><span>Start an RFx from an open commercial opportunity to create the first route book for this shipper.</span></div>`}
      </div>
    </section>`;
}

function renderActivityTab() {
  const rows = state.accountActivity || [];
  const content = state.accountActivityLoading
    ? `<div class="shipper-drawer-loading">Loading account activity...</div>`
    : rows.length
      ? `<ol class="shipper-activity-list">${rows.map((row) => `
        <li>
          <div><strong>${escapeHtml(row.summary || humanLabel(row.action))}</strong><span>${escapeHtml(humanLabel(row.action))}${row.actor_email ? ` | ${escapeHtml(row.actor_email)}` : ""}</span></div>
          <time datetime="${escapeHtml(row.created_at || "")}">${formatDate(row.created_at)}</time>
        </li>`).join("")}</ol>`
      : `<div class="shipper-empty-activity"><strong>No account activity yet</strong><span>RFIs, deals, RFx workspaces, and award handoff will appear here as the account progresses.</span></div>`;
  elements.drawerContent.innerHTML = `
    <section class="shipper-activity-workspace">
      <div class="shipper-child-heading"><div><p class="eyebrow">Account history</p><h3>Commercial activity</h3></div><span>${state.accountActivityLoading ? "Loading" : `${rows.length} event(s)`}</span></div>
      ${content}
    </section>`;
}

async function loadAccountActivity() {
  if (!state.activeShipperId || state.accountActivityLoading || state.accountActivityReady) return;
  const shipperId = state.activeShipperId;
  state.accountActivityLoading = true;
  renderActivityTab();
  try {
    const result = await fetchShipperAccountActivity(shipperId);
    if (state.activeShipperId !== shipperId) return;
    state.accountActivity = result.rows || [];
    state.accountActivityReady = true;
  } catch (error) {
    state.accountActivity = [{ summary: humanizeError(error), action: "activity_unavailable", created_at: "" }];
    state.accountActivityReady = true;
  } finally {
    if (state.activeShipperId === shipperId) {
      state.accountActivityLoading = false;
      if (state.activeTab === "activity") renderActivityTab();
    }
  }
}

function renderDrawer() {
  if (!state.detail) return;
  const row = state.detail.row;
  elements.drawerTitle.textContent = row.shipper_name || "Shipper";
  elements.drawerSubtitle.textContent = [row.domain, humanLabel(row.relationship_stage)].filter(Boolean).join(" | ");
  elements.drawerTabs.querySelectorAll("[data-shipper-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.shipperTab === state.activeTab);
  });
  if (state.activeTab === "overview") renderOverview();
  else if (state.activeTab === "ratebook") renderRatebookTab();
  else if (state.activeTab === "activity") {
    renderActivityTab();
    void loadAccountActivity();
  } else renderChildTab(state.activeTab);
}

async function openDrawer(id, tab = "overview") {
  state.activeShipperId = id;
  state.activeTab = tab === "overview" || tab === "ratebook" || tab === "activity" || CHILD_CONFIG[tab] ? tab : "overview";
  state.editingRecordId = null;
  state.accountActivity = [];
  state.accountActivityReady = false;
  state.accountActivityLoading = false;
  elements.drawer.classList.remove("hidden");
  showOverlay();
  elements.drawerContent.innerHTML = `<div class="shipper-drawer-loading">Loading shipper profile...</div>`;
  try {
    state.detail = await fetchShipper(id);
    renderDrawer();
  } catch (error) {
    elements.drawerContent.innerHTML = `<div class="shipper-drawer-error"><strong>Profile could not load</strong><span>${escapeHtml(humanizeError(error))}</span><button type="button" data-retry-shipper>Retry</button></div>`;
  }
}

function formObject(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => { values[input.name] = input.checked; });
  return values;
}

async function saveOverview(form) {
  const status = form.querySelector("#shipper-drawer-status");
  const button = form.querySelector('button[type="submit"]');
  const patch = formObject(form);
  patch.tags = String(patch.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  button.disabled = true;
  setStatus(status, "Saving...");
  try {
    const row = await updateShipper(state.activeShipperId, patch);
    state.detail.row = row;
    setStatus(status, "Account saved.", "success");
    syncActiveShipperLocally();
    await loadSummary();
    renderDrawer();
  } catch (error) {
    setStatus(status, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function saveChild(form) {
  const entity = form.dataset.shipperEntity;
  const status = form.querySelector("#shipper-drawer-status");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(status, "Saving...");
  try {
    await saveShipperRecord(entity, state.activeShipperId, formObject(form), state.editingRecordId);
    state.detail = await fetchShipper(state.activeShipperId);
    state.editingRecordId = null;
    renderDrawer();
    syncActiveShipperLocally();
    await loadSummary();
  } catch (error) {
    setStatus(status, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function applyActionPlaybook(playbookKey, button) {
  const status = elements.drawerContent.querySelector("#shipper-playbook-status");
  button.disabled = true;
  if (status) setStatus(status, "Creating missing account actions...");
  try {
    const result = await applyShipperActionPlaybook(state.activeShipperId, playbookKey);
    state.detail = await fetchShipper(state.activeShipperId);
    state.editingRecordId = null;
    renderDrawer();
    syncActiveShipperLocally();
    await loadSummary();
    const nextStatus = elements.drawerContent.querySelector("#shipper-playbook-status");
    if (nextStatus) {
      setStatus(nextStatus, `${result.playbook?.label || "Playbook"}: ${result.created || 0} action(s) created; ${result.skipped || 0} already open.`, "success");
    }
  } catch (error) {
    if (status) setStatus(status, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function promoteRfiFromDrawer(rfiId) {
  const status = elements.drawerContent.querySelector("#shipper-drawer-status");
  if (status) setStatus(status, "Creating commercial deal from the RFI...");
  try {
    const result = await promoteShipperRfiToOpportunity(rfiId);
    state.detail = await fetchShipper(state.activeShipperId);
    state.activeTab = "opportunities";
    state.editingRecordId = null;
    renderDrawer();
    await refreshAccountWorkspace({ directory: false });
    setStatus(elements.commercialStatus, result.created ? "Commercial deal created from the RFI." : "This RFI already has a commercial deal.", "success");
  } catch (error) {
    if (status) setStatus(status, humanizeError(error), "error");
  }
}

async function startRfiRatebookFromDrawer(rfiId) {
  const status = elements.drawerContent.querySelector("#shipper-drawer-status");
  if (status) setStatus(status, "Preparing the RFx source for this Ratebook...");
  try {
    let opportunity = (state.detail?.opportunities || []).find((row) => row.rfi_id === rfiId) || null;
    if (!opportunity) {
      const result = await promoteShipperRfiToOpportunity(rfiId);
      opportunity = result.row || result.opportunity || null;
    }
    if (!opportunity?.id) throw new Error("The commercial deal could not be created from this RFI.");
    await startCommercialRatebook(opportunity.id, opportunity.rfx_project_id || "");
  } catch (error) {
    if (status) setStatus(status, humanizeError(error), "error");
  }
}

document.querySelector("#add-shipper-button").addEventListener("click", openCreateModal);
document.querySelector("#empty-add-shipper").addEventListener("click", openCreateModal);
document.querySelector("#close-create-shipper").addEventListener("click", closeCreateModal);
document.querySelector("#close-shipper-drawer").addEventListener("click", closeDrawer);
elements.overlay.addEventListener("click", () => {
  closeCreateModal();
  closeDrawer();
});

elements.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.createForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(elements.createStatus, "Creating shipper...");
  try {
    const row = await createShipper(formObject(elements.createForm));
    closeCreateModal();
    await Promise.all([
      loadRows({ reset: true }),
      loadSummary(),
      state.pipelineReady ? loadPipeline() : Promise.resolve(),
      state.duplicatesReady ? loadShipperDuplicates() : Promise.resolve()
    ]);
    await openDrawer(row.id);
  } catch (error) {
    setStatus(elements.createStatus, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
});

elements.tableBody.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) openDrawer(open.dataset.openShipper);
});

elements.tableBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-shipper]");
  if (!checkbox) return;
  if (checkbox.checked) state.selected.add(checkbox.dataset.selectShipper);
  else state.selected.delete(checkbox.dataset.selectShipper);
  renderSelection();
});

elements.selectAll.addEventListener("change", () => {
  state.rows.forEach((row) => {
    if (elements.selectAll.checked) state.selected.add(row.id);
    else state.selected.delete(row.id);
  });
  renderDirectory();
});

elements.clearSelection.addEventListener("click", () => {
  state.selected.clear();
  renderDirectory();
});

elements.archiveSelected.addEventListener("click", async () => {
  const ids = [...state.selected];
  if (!ids.length || !window.confirm(`Archive ${ids.length} selected shipper account(s)?`)) return;
  elements.archiveSelected.disabled = true;
  try {
    await archiveShippers(ids);
    state.selected.clear();
    await refreshAccountWorkspace();
  } catch (error) {
    setStatus(elements.directoryStatus, humanizeError(error), "error");
  } finally {
    elements.archiveSelected.disabled = false;
  }
});

elements.search.addEventListener("input", () => {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => {
    state.search = elements.search.value.trim();
    loadRows({ reset: true });
  }, 280);
});

elements.statusFilter.addEventListener("change", () => {
  state.status = elements.statusFilter.value;
  loadRows({ reset: true });
});

elements.stageFilter.addEventListener("change", () => {
  state.relationshipStage = elements.stageFilter.value;
  loadRows({ reset: true });
});

elements.refresh.addEventListener("click", () => Promise.all([loadRows(), loadSummary()]));
elements.previous.addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadRows();
});
elements.next.addEventListener("click", () => {
  state.offset += state.limit;
  loadRows();
});
elements.pageSize.addEventListener("change", () => {
  state.limit = Number(elements.pageSize.value) || 100;
  loadRows({ reset: true });
});

elements.viewSwitcher.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shipper-view]");
  if (button) setActiveView(button.dataset.shipperView);
});

elements.importFile.addEventListener("change", () => handleShipperImport(elements.importFile.files?.[0]));
elements.importTemplate.addEventListener("click", downloadShipperTemplate);
elements.importCancel.addEventListener("click", () => {
  state.importRows = [];
  state.importWorkbook = null;
  renderShipperImportPreview();
  setStatus(elements.importStatus, "Import cleared.");
  setStatus(elements.importConfirmStatus, "");
});
elements.importConfirm.addEventListener("click", confirmShipperImport);

elements.duplicatesRefresh.addEventListener("click", () => loadShipperDuplicates());
elements.duplicatesList.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) return openDrawer(open.dataset.openShipper);
  const merge = event.target.closest("[data-merge-shipper-primary]");
  if (merge) mergeDuplicateShippers(merge.dataset.mergeShipperPrimary, merge.dataset.mergeShipperDuplicate);
});

elements.pipelineSearch.addEventListener("input", () => {
  window.clearTimeout(state.pipelineTimer);
  state.pipelineTimer = window.setTimeout(() => {
    state.pipelineSearch = elements.pipelineSearch.value.trim();
    loadPipeline();
  }, 280);
});

elements.pipelineStatusFilter.addEventListener("change", () => {
  state.pipelineStatus = elements.pipelineStatusFilter.value;
  loadPipeline();
});

elements.pipelineRefresh.addEventListener("click", () => loadPipeline());

elements.pipelineBoard.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) openDrawer(open.dataset.openShipper, open.dataset.openShipperTab || "overview");
});

elements.pipelineBoard.addEventListener("change", (event) => {
  const move = event.target.closest("[data-pipeline-stage]");
  if (move) movePipelineShipper(move.dataset.pipelineStage, move.value);
});

elements.pipelineBoard.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-pipeline-shipper]");
  if (!card) return;
  state.draggingShipperId = card.dataset.pipelineShipper;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggingShipperId);
});

elements.pipelineBoard.addEventListener("dragover", (event) => {
  const column = event.target.closest("[data-pipeline-drop-stage]");
  if (!column || !state.draggingShipperId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  column.classList.add("is-drop-target");
});

elements.pipelineBoard.addEventListener("dragleave", (event) => {
  event.target.closest("[data-pipeline-drop-stage]")?.classList.remove("is-drop-target");
});

elements.pipelineBoard.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-pipeline-drop-stage]");
  if (!column || !state.draggingShipperId) return;
  event.preventDefault();
  column.classList.remove("is-drop-target");
  const shipperId = state.draggingShipperId;
  state.draggingShipperId = null;
  movePipelineShipper(shipperId, column.dataset.pipelineDropStage);
});

elements.pipelineBoard.addEventListener("dragend", () => {
  state.draggingShipperId = null;
  elements.pipelineBoard.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
});

elements.commercialSearch.addEventListener("input", () => {
  window.clearTimeout(state.commercialTimer);
  state.commercialTimer = window.setTimeout(() => {
    state.commercialSearch = elements.commercialSearch.value.trim();
    loadCommercialWork();
  }, 280);
});

elements.commercialFilter.addEventListener("change", () => {
  state.commercialFocus = elements.commercialFilter.value;
  loadCommercialWork();
});

elements.commercialRefresh.addEventListener("click", () => loadCommercialWork());

elements.commercial.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) {
    openDrawer(open.dataset.openShipper, open.dataset.openShipperTab || "overview");
    return;
  }
  const promote = event.target.closest("[data-promote-shipper-rfi]");
  if (promote) promoteCommercialRfi(promote.dataset.promoteShipperRfi);
  const launch = event.target.closest("[data-launch-shipper-rfx]");
  if (launch) launchCommercialRfx(launch.dataset.launchShipperRfx, launch.dataset.rfxProject, launch.dataset.rfxEvent);
  const ratebook = event.target.closest("[data-start-shipper-ratebook]");
  if (ratebook) startCommercialRatebook(ratebook.dataset.startShipperRatebook, ratebook.dataset.rfxProject);
});

elements.commercial.addEventListener("change", (event) => {
  const move = event.target.closest("[data-commercial-opportunity-stage]");
  if (move) moveCommercialOpportunity(move.dataset.commercialOpportunityStage, move.value);
});

elements.cadenceSearch.addEventListener("input", () => {
  window.clearTimeout(state.cadenceTimer);
  state.cadenceTimer = window.setTimeout(() => {
    state.cadenceSearch = elements.cadenceSearch.value.trim();
    loadCadence();
  }, 280);
});

elements.cadenceFocus.addEventListener("change", () => {
  state.cadenceFocus = elements.cadenceFocus.value;
  loadCadence();
});

elements.cadenceRefresh.addEventListener("click", () => loadCadence());

elements.cadence.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) {
    openDrawer(open.dataset.openShipper, open.dataset.openShipperTab || "actions");
    return;
  }
  const action = event.target.closest("[data-shipper-action-status]");
  if (action) updateCadenceActionStatus(action.dataset.shipperActionId, action.dataset.shipperActionStatus, action);
});

elements.intelligenceSearch.addEventListener("input", () => {
  window.clearTimeout(state.intelligenceTimer);
  state.intelligenceTimer = window.setTimeout(() => {
    state.intelligenceSearch = elements.intelligenceSearch.value.trim();
    loadShipperIntelligence();
  }, 280);
});

elements.intelligenceFocus.addEventListener("change", () => {
  state.intelligenceFocus = elements.intelligenceFocus.value;
  loadShipperIntelligence();
});

elements.intelligenceRefresh.addEventListener("click", () => loadShipperIntelligence());

elements.intelligencePanel.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-shipper]");
  if (open) openDrawer(open.dataset.openShipper, open.dataset.openShipperTab || "overview");
});

elements.drawerTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shipper-tab]");
  if (!button) return;
  state.activeTab = button.dataset.shipperTab;
  state.editingRecordId = null;
  renderDrawer();
});

elements.drawerContent.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "shipper-overview-form") saveOverview(event.target);
  if (event.target.id === "shipper-child-form") saveChild(event.target);
});

elements.drawerContent.addEventListener("click", async (event) => {
  const createProfileLink = event.target.closest("[data-create-shipper-profile-link]");
  if (createProfileLink) {
    const status = elements.drawerContent.querySelector("#shipper-drawer-status");
    createProfileLink.disabled = true;
    try {
      const result = await createShipperProfileRequest(state.activeShipperId, { expires_in_days: 30, origin: window.location.origin });
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(result.url);
      state.detail = await fetchShipper(state.activeShipperId);
      renderDrawer();
      window.prompt("Secure shipper profile link. It was copied when your browser permits it:", result.url);
    } catch (error) {
      if (status) setStatus(status, humanizeError(error), "error");
    } finally {
      createProfileLink.disabled = false;
    }
    return;
  }
  const revokeProfileLink = event.target.closest("[data-revoke-shipper-profile-link]");
  if (revokeProfileLink) {
    if (!window.confirm("Revoke this customer profile link?")) return;
    try {
      await revokeShipperProfileRequest(revokeProfileLink.dataset.revokeShipperProfileLink);
      state.detail = await fetchShipper(state.activeShipperId);
      renderDrawer();
    } catch (error) {
      const status = elements.drawerContent.querySelector("#shipper-drawer-status");
      if (status) setStatus(status, humanizeError(error), "error");
    }
    return;
  }
  const playbook = event.target.closest("[data-apply-shipper-playbook]");
  if (playbook) return applyActionPlaybook(playbook.dataset.applyShipperPlaybook, playbook);
  const retry = event.target.closest("[data-retry-shipper]");
  if (retry) return openDrawer(state.activeShipperId);
  const promote = event.target.closest("[data-promote-shipper-rfi]");
  if (promote) return promoteRfiFromDrawer(promote.dataset.promoteShipperRfi);
  const startRfiRatebook = event.target.closest("[data-start-rfi-ratebook]");
  if (startRfiRatebook) return startRfiRatebookFromDrawer(startRfiRatebook.dataset.startRfiRatebook);
  const startRatebook = event.target.closest("[data-start-shipper-ratebook]");
  if (startRatebook) return startCommercialRatebook(startRatebook.dataset.startShipperRatebook, startRatebook.dataset.rfxProject);
  const openRatebook = event.target.closest("[data-open-shipper-ratebook]");
  if (openRatebook) return openRatebookWorkspace("", openRatebook.dataset.openShipperRatebook);
  const openRatebookId = event.target.closest("[data-open-ratebook-id]");
  if (openRatebookId) return openRatebookWorkspace(openRatebookId.dataset.openRatebookId);
  const launch = event.target.closest("[data-launch-shipper-rfx]");
  if (launch) return launchCommercialRfx(launch.dataset.launchShipperRfx, launch.dataset.rfxProject);
  const openRfx = event.target.closest("[data-open-shipper-rfx-project]");
  if (openRfx) return openRfxWorkspace(openRfx.dataset.openShipperRfxProject);
  const openTab = event.target.closest("[data-open-shipper-tab]");
  if (openTab) {
    state.activeTab = openTab.dataset.openShipperTab;
    state.editingRecordId = null;
    renderDrawer();
    return;
  }
  const openOpportunity = event.target.closest("[data-open-opportunity-from-rfi]");
  if (openOpportunity) {
    state.activeTab = "opportunities";
    renderDrawer();
    return;
  }
  const edit = event.target.closest("[data-edit-shipper-record]");
  if (edit) {
    state.editingRecordId = edit.dataset.editShipperRecord;
    renderChildTab(state.activeTab);
    elements.drawerContent.querySelector("#shipper-child-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (event.target.closest("[data-cancel-record-edit]")) {
    state.editingRecordId = null;
    renderChildTab(state.activeTab);
    return;
  }
  const remove = event.target.closest("[data-delete-shipper-record]");
  if (!remove || !window.confirm(`Delete this ${CHILD_CONFIG[state.activeTab].noun}?`)) return;
  remove.disabled = true;
  try {
    await deleteShipperRecord(state.activeTab, state.activeShipperId, remove.dataset.deleteShipperRecord);
    state.detail = await fetchShipper(state.activeShipperId);
    renderDrawer();
    syncActiveShipperLocally();
    await loadSummary();
  } catch (error) {
    const status = elements.drawerContent.querySelector("#shipper-drawer-status");
    if (status) setStatus(status, humanizeError(error), "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeCreateModal();
  closeDrawer();
});

initAuthControls();
requirePrivatePage()
  .then(() => Promise.all([loadRows({ reset: true }), loadSummary()]))
  .catch((error) => setStatus(elements.directoryStatus, humanizeError(error), "error"));
