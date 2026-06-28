import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import { tableErrorState, tableLoadingState, tableState } from "./ui-state.js";
import {
  archiveUpload,
  bulkImportUploadTemplate,
  createInterpretationMemory,
  fetchUploadHistory,
  fetchUploadStagedRows,
  getUploadSourceUrl,
  interpretUpload,
  listInterpretationMemory,
  removeUpload
} from "./upload-service.js";

const historyBody = document.querySelector("#history-body");
const refreshButton = document.querySelector("#refresh-button");
const clearFiltersButton = document.querySelector("#clear-upload-filters");
const statusFilter = document.querySelector("#status-filter");
const uploadSearchInput = document.querySelector("#upload-search");
const uploadMetricVisible = document.querySelector("#upload-metric-visible");
const uploadMetricStaged = document.querySelector("#upload-metric-staged");
const uploadMetricFailed = document.querySelector("#upload-metric-failed");
const uploadMetricNeedsAudit = document.querySelector("#upload-metric-needs-audit");
const quickFilterButtons = document.querySelectorAll("[data-upload-filter]");
const selectAllUploads = document.querySelector("#select-all-uploads");
const uploadBulkBar = document.querySelector(".bulk-action-bar");
const uploadSelectionCount = document.querySelector("#upload-selection-count");
const reprocessSelectedButton = document.querySelector("#reprocess-selected-uploads");
const bulkImportSelectedButton = document.querySelector("#bulk-import-selected-uploads");
const archiveSelectedButton = document.querySelector("#archive-selected-uploads");
const removeSelectedButton = document.querySelector("#remove-selected-uploads");
const uploadBulkStatus = document.querySelector("#upload-bulk-status");
const uploadDrawer = document.querySelector("#upload-drawer");
const closeUploadDrawerButton = document.querySelector("#close-upload-drawer");
const uploadDrawerTitle = document.querySelector("#upload-drawer-title");
const uploadDetail = document.querySelector("#upload-detail");
const reprocessDrawer = document.querySelector("#reprocess-drawer");
const closeReprocessDrawerButton = document.querySelector("#close-reprocess-drawer");
const reprocessForm = document.querySelector("#reprocess-form");
const reprocessNoteInput = document.querySelector("#reprocess-note");
const reprocessStatus = document.querySelector("#reprocess-status");
const confirmReprocessButton = document.querySelector("#confirm-reprocess-button");
const applicableMemoryCount = document.querySelector("#applicable-memory-count");
const applicableMemoryList = document.querySelector("#applicable-memory-list");
const saveMemoryRuleInput = document.querySelector("#save-memory-rule");
const memoryRuleScopeInput = document.querySelector("#memory-rule-scope");
const reprocessImpactPreview = document.querySelector("#reprocess-impact-preview");
const HISTORY_COLSPAN = 9;
const UPLOAD_ACTION_SELECTOR = "[data-interpret-id], [data-bulk-import-id], [data-archive-id], [data-remove-id], #reprocess-selected-uploads, #bulk-import-selected-uploads, #archive-selected-uploads, #remove-selected-uploads";
const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
const BULK_IMPORT_BATCH_SIZE = 250;
const MISSING_ROWS_REPROCESS_NOTE = [
  "Re-read every visible table row and priced cell. Do not summarize by state, lane group, destination group, or carrier note.",
  "Return one staged row per carrier quoted lane, including one-way and roundtrip rows only when explicitly priced.",
  "Compare detected source rows against staged rows and explain any row that cannot be staged."
].join(" ");
const TEMPLATE_FIELD_ALIASES = {
  vendor_name: ["vendor", "carrier", "supplier", "transportista", "proveedor"],
  vendor_domain: ["vendor domain", "carrier domain", "domain", "email", "vendor email", "carrier email", "correo", "correo proveedor"],
  rfx_id: ["rfx", "rfx id", "rfq", "rfq id", "event", "event id", "quote no", "quote #", "quote number"],
  row_id: ["shipment #", "shipment id", "shipment", "load id", "lane id", "lane", "id", "folio"],
  quote_date: ["period", "date", "quote date", "fecha", "fecha cotizacion", "fecha de cotizacion"],
  origin: ["origin", "origen", "from", "orig", "pickup", "shipper", "origin city", "orig city"],
  destination: ["destination", "destino", "to", "dest", "delivery", "consignee", "destination city", "dest city"],
  distance: ["distance", "total distance", "loaded miles", "miles", "mi", "loaded km", "kms", "km", "kilometers", "kilometros"],
  distance_type: ["distance type", "distance unit", "unit", "uom", "unidad"],
  equipment: ["equipment", "equipo", "vehicle", "unit type"],
  trailer: ["trailer", "remolque", "box", "caja", "trailer type"],
  config: ["config", "configuration", "configuracion", "type of driver"],
  operation: ["operation", "operacion", "movement", "move type"],
  service: ["service", "servicio", "trip type", "ow rt", "one way roundtrip"],
  driver: ["driver", "chofer", "driver type"],
  hazmat: ["hazmat", "haz mat", "hazardous", "hazardous material", "material peligroso"],
  temperature_controlled: ["temp ctrl", "temperature controlled", "temp controlled", "reefer", "refrigerated", "refrigerado"],
  mx_border_crossing_point: ["mx crossing", "mex crossing", "mx border", "mex border", "mexican border", "border mx"],
  us_border_crossing_point: ["us crossing", "usa crossing", "us border", "american border", "border us"],
  mx_linehaul: ["mx linehaul", "mex linehaul", "mex haul", "mx haul", "mexico linehaul"],
  us_linehaul: ["us linehaul", "usa linehaul", "us haul", "usa haul"],
  us_miles: ["us miles", "usa miles", "american miles"],
  fsc: ["fsc", "fuel surcharge", "fuel surcharge cost"],
  fuel: ["fuel", "diesel", "fuel index"],
  border_crossing_fee: ["border fee", "border crossing", "border crossing fee", "crossing fee", "cruce"],
  all_in_rate: ["rate", "incumbent cost", "cost", "all in", "all-in", "all in rate", "total", "total usd", "total cost", "amount", "price", "tarifa"],
  currency: ["currency", "incumbent currency", "moneda"],
  weekly_capacity: ["weekly capacity", "capacity", "capacidad", "loads per week", "volumen semanal"],
  notes: ["notes", "note", "comments", "comentarios", "notas"]
};
let loadedRows = [];
let currentRows = [];
let activeQuickFilter = "all";
const selectedUploadIds = new Set();
let pendingReprocessIds = [];

function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const quickFilter = params.get("filter");

  if (status && [...statusFilter.options].some((option) => option.value === status)) {
    statusFilter.value = status;
  }

  if (quickFilter && [...quickFilterButtons].some((button) => button.dataset.uploadFilter === quickFilter)) {
    activeQuickFilter = quickFilter;
    return;
  }

  if (status === "failed") {
    activeQuickFilter = "failed";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHeaderKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[#%()[\]{}:;.,/\\|_+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function templateAliasLookup() {
  const lookup = new Map();
  Object.entries(TEMPLATE_FIELD_ALIASES).forEach(([field, aliases]) => {
    aliases.forEach((alias) => lookup.set(normalizeHeaderKey(alias), field));
  });
  return lookup;
}

function templateHeaderScore(cells, aliasLookup) {
  const fields = new Set();
  cells.forEach((cell) => {
    const field = aliasLookup.get(normalizeHeaderKey(cell));
    if (field) fields.add(field);
  });
  let score = fields.size;
  if (fields.has("origin")) score += 4;
  if (fields.has("destination")) score += 4;
  if (fields.has("all_in_rate") || fields.has("mx_linehaul") || fields.has("us_linehaul")) score += 3;
  if (fields.has("vendor_domain") || fields.has("vendor_name")) score += 2;
  return score;
}

function cellHasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function chunkRows(rows, size = BULK_IMPORT_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function matchLabel(row) {
  if (row.vendor_match_source === "manual") return '<span class="match-pill">Manual</span>';
  if (row.vendor_match_source === "auto") return '<span class="match-pill">Auto-matched</span>';
  return "";
}

function documentType(row) {
  return String(row.document_type || "").toLowerCase();
}

function isSpreadsheetUpload(row) {
  return ["xlsx", "xls", "csv", "spreadsheet"].includes(documentType(row));
}

async function parseStructuredWorkbookFromUpload(rowId) {
  const source = await getUploadSourceUrl(rowId);
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Could not download XLSX source (${response.status}).`);
  const buffer = await response.arrayBuffer();
  const XLSX = await import(XLSX_MODULE_URL);
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const aliasLookup = templateAliasLookup();
  const rows = [];
  const warnings = [];

  (workbook.SheetNames || []).forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false
    });
    if (!matrix.length) return;

    let headerIndex = -1;
    let bestScore = 0;
    matrix.slice(0, 15).forEach((sourceRow, index) => {
      const score = templateHeaderScore(sourceRow || [], aliasLookup);
      if (score > bestScore) {
        bestScore = score;
        headerIndex = index;
      }
    });

    if (headerIndex < 0 || bestScore < 6) {
      warnings.push(`${sheetName}: no recognizable Rateware template header found.`);
      return;
    }

    const headers = (matrix[headerIndex] || []).map((cell) => String(cell ?? "").trim());
    for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] || [];
      if (!sourceRow.some(cellHasValue)) continue;

      const mapped = {};
      const raw = {};
      headers.forEach((header, columnIndex) => {
        if (!header) return;
        const value = sourceRow[columnIndex];
        if (!cellHasValue(value)) return;
        raw[header] = value;
        const field = aliasLookup.get(normalizeHeaderKey(header));
        if (field && mapped[field] === undefined) mapped[field] = value;
      });

      if (Object.keys(mapped).length) {
        rows.push({
          sheet_name: sheetName,
          source_row_number: rowIndex + 1,
          mapped,
          raw
        });
      }
    }
  });

  if (!rows.length) throw new Error(warnings[0] || "No structured template rows were found in this workbook.");
  return { rows, warnings };
}

function sourceRowsUrl(row) {
  const params = new URLSearchParams();
  params.set("raw_upload_id", row.id);
  if (row.status !== "approved") params.set("status", "");
  return `./staging-review.html?${params.toString()}`;
}

function stagedRows(row) {
  return Number(row.interpreted_rate_rows ?? auditPayload(row).interpreted_rate_rows ?? 0) || 0;
}

function detectedRows(row) {
  return Number(row.expected_rate_rows ?? auditPayload(row).expected_rate_rows ?? stagedRows(row) ?? 0) || 0;
}

function rowGap(row) {
  const detected = detectedRows(row);
  const staged = stagedRows(row);
  if (!detected || detected <= staged) return 0;
  return detected - staged;
}

function uploadNeedsAudit(row) {
  const status = auditStatus(row);
  return Boolean(
    row.status === "failed" ||
      row.error_message ||
      rowGap(row) > 0 ||
      auditWarnings(row).length > 0 ||
      ["needs_review", "repaired", "failed"].includes(status)
  );
}

function auditDisplay(row) {
  const gap = rowGap(row);
  if (row.status === "failed" || auditStatus(row) === "failed") return { label: "failed", tone: "danger" };
  if (gap > 0) return { label: `${gap} missing`, tone: "danger" };
  if (auditWarnings(row).length > 0) return { label: "warnings", tone: "warning" };
  if (auditStatus(row) === "repaired") return { label: "repaired", tone: "warning" };
  return { label: auditLabel(auditStatus(row)), tone: auditTone(auditStatus(row)) };
}

function uploadStepState(row, step) {
  const staged = stagedRows(row) > 0 || row.status === "staged";
  if (row.status === "failed" && step === "interpret") return "error";
  if (step === "upload") return row.status === "archived" ? "muted" : "done";
  if (step === "interpret") return staged ? "done" : row.status === "uploaded" ? "active" : "muted";
  if (step === "review") return staged ? "active" : "muted";
  if (step === "approve") return "muted";
  return "muted";
}

function renderUploadFlow(row) {
  const steps = [
    ["upload", "Upload"],
    ["interpret", "Interpret"],
    ["review", "Review"],
    ["approve", "Approve"]
  ];
  return `
    <div class="upload-row-flow" aria-label="Upload progress">
      ${steps.map(([key, label]) => `<span class="${escapeHtml(uploadStepState(row, key))}">${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function applyQuickFilter(rows = loadedRows) {
  if (activeQuickFilter === "needs-interpretation") return rows.filter((row) => row.status === "uploaded");
  if (activeQuickFilter === "needs-audit") return rows.filter(uploadNeedsAudit);
  if (activeQuickFilter === "failed") return rows.filter((row) => row.status === "failed");
  if (activeQuickFilter === "pdf") return rows.filter((row) => documentType(row) === "pdf");
  if (activeQuickFilter === "spreadsheet") return rows.filter(isSpreadsheetUpload);
  if (activeQuickFilter === "image") return rows.filter((row) => ["image", "png", "jpg", "jpeg", "webp"].includes(documentType(row)));
  return rows;
}

function uploadSearchHaystack(row) {
  return [
    row.original_filename,
    row.document_type,
    row.storage_path,
    row.vendors?.vendor_name,
    row.vendor_hint,
    row.rfx_hint,
    row.status,
    auditLabel(auditStatus(row))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applyUploadFilters(rows = loadedRows) {
  let filtered = applyQuickFilter(rows);
  const query = String(uploadSearchInput?.value || "").trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((row) => uploadSearchHaystack(row).includes(query));
  }
  return filtered;
}

function updateQuickFilters() {
  quickFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.uploadFilter === activeQuickFilter);
  });
}

function updateUploadMetrics(rows) {
  uploadMetricVisible.textContent = String(rows.length);
  uploadMetricStaged.textContent = String(rows.filter((row) => row.status === "staged").length);
  uploadMetricFailed.textContent = String(rows.filter((row) => row.status === "failed").length);
  uploadMetricNeedsAudit.textContent = String(rows.filter(uploadNeedsAudit).length);
}

function selectedVisibleIds() {
  return [...historyBody.querySelectorAll("[data-select-upload]:checked")].map((input) => input.dataset.selectUpload);
}

function selectedVisibleRows() {
  const ids = new Set(selectedVisibleIds());
  return currentRows.filter((row) => ids.has(row.id));
}

function setBulkStatus(message, tone = "neutral") {
  uploadBulkStatus.textContent = message;
  uploadBulkStatus.dataset.tone = tone;
  uploadBulkBar?.classList.toggle("is-empty", selectedVisibleIds().length === 0 && !message);
}

function updateBulkControls() {
  const selectedCount = selectedVisibleIds().length;
  const spreadsheetCount = selectedVisibleRows().filter(isSpreadsheetUpload).length;
  const totalRows = historyBody.querySelectorAll("[data-upload-id]").length;
  uploadSelectionCount.textContent = `${selectedCount} selected`;
  reprocessSelectedButton.disabled = selectedCount === 0;
  if (bulkImportSelectedButton) bulkImportSelectedButton.disabled = spreadsheetCount === 0;
  archiveSelectedButton.disabled = selectedCount === 0;
  removeSelectedButton.disabled = selectedCount === 0;
  if (selectAllUploads) {
    selectAllUploads.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllUploads.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
  uploadBulkBar?.classList.toggle("is-empty", selectedCount === 0 && !uploadBulkStatus.textContent);
}

function statusTone(status) {
  if (status === "failed") return "danger";
  if (status === "staged") return "success";
  if (status === "archived") return "muted";
  return "neutral";
}

function auditPayload(row) {
  return row.interpretation_audit && typeof row.interpretation_audit === "object" ? row.interpretation_audit : {};
}

function auditWarnings(row) {
  if (Array.isArray(row.audit_warnings)) return row.audit_warnings.map(String).filter(Boolean);
  const audit = auditPayload(row);
  return Array.isArray(audit.warnings) ? audit.warnings.map(String).filter(Boolean) : [];
}

function auditStatus(row) {
  return row.audit_status || auditPayload(row).status || "not_audited";
}

function auditTone(status) {
  if (status === "ok") return "success";
  if (status === "repaired") return "warning";
  if (status === "failed") return "danger";
  if (status === "needs_review") return "danger";
  return "muted";
}

function auditLabel(status) {
  return String(status || "not_audited").replace(/_/g, " ");
}

function auditRowsLabel(row) {
  const detected = detectedRows(row);
  const staged = stagedRows(row);
  if (!detected && !staged) return "";
  return `${staged || 0}/${detected || staged || 0} staged`;
}

function renderRowAuditMeter(row) {
  const detected = detectedRows(row);
  const staged = stagedRows(row);
  const pct = detected > 0 ? Math.max(0, Math.min(100, Math.round((staged / detected) * 100))) : staged > 0 ? 100 : 0;
  const tone = row.status === "failed" ? "danger" : detected && staged < detected ? "warning" : staged ? "success" : "muted";
  return `
    <div class="upload-audit-meter ${escapeHtml(tone)}">
      <div><span style="width:${pct}%"></span></div>
      <small>${escapeHtml(staged || 0)} staged / ${escapeHtml(detected || staged || 0)} detected</small>
    </div>
  `;
}

function renderAuditSummary(row) {
  const display = auditDisplay(row);
  const rowsLabel = auditRowsLabel(row);
  const warnings = auditWarnings(row);
  const gap = rowGap(row);
  return `
    <div class="audit-summary">
      <span class="review-chip ${escapeHtml(display.tone)}">${escapeHtml(display.label)}</span>
      ${rowsLabel ? `<small>${escapeHtml(rowsLabel)}</small>` : ""}
      ${gap ? `<small class="audit-gap-label">${escapeHtml(gap)} missing row${gap === 1 ? "" : "s"}</small>` : ""}
      ${warnings.length ? `<small>${escapeHtml(warnings.length)} warning${warnings.length === 1 ? "" : "s"}</small>` : ""}
      ${renderRowAuditMeter(row)}
    </div>
  `;
}

function uploadQualityChips(row) {
  const chips = [];
  chips.push({ tone: statusTone(row.status), label: row.status || "unknown" });
  if (rowGap(row) > 0) chips.push({ tone: "danger", label: `${rowGap(row)} missing rows` });
  if (uploadNeedsAudit(row)) chips.push({ tone: "danger", label: "Audit needed" });
  if (auditStatus(row) === "repaired") chips.push({ tone: "warning", label: "Repaired" });
  if (!row.vendors?.vendor_name && !row.vendor_hint) chips.push({ tone: "warning", label: "No vendor hint" });
  if (!row.rfx_hint) chips.push({ tone: "muted", label: "No RFx" });
  if (latestCorrection(row)) chips.push({ tone: correctionTone(latestCorrection(row)), label: correctionDeltaLabel(latestCorrection(row)) });
  if (row.error_message) chips.push({ tone: "danger", label: "Needs attention" });
  return `<div class="row-review-chips">${chips
    .map((chip) => `<span class="review-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`)
    .join("")}</div>`;
}

function uploadQualitySummary(row) {
  const labels = [];
  if (row.status) labels.push(`Status: ${row.status}`);
  if (auditStatus(row)) labels.push(`Audit: ${auditLabel(auditStatus(row))}`);
  if (auditRowsLabel(row)) labels.push(`Rows: ${auditRowsLabel(row)}`);
  if (rowGap(row) > 0) labels.push(`${rowGap(row)} missing staged row(s)`);
  if (!row.vendors?.vendor_name && !row.vendor_hint) labels.push("No vendor hint");
  if (!row.rfx_hint) labels.push("No RFx");
  if (row.error_message) labels.push(`Issue: ${humanizeError(row.error_message)}`);
  return labels.join(" | ");
}

function nextUploadStep(row) {
  if (row.status === "failed") {
    return {
      label: "Fix interpretation",
      detail: "Review the issue, then reprocess.",
      tone: "danger"
    };
  }
  if (row.status === "uploaded") {
    return {
      label: isSpreadsheetUpload(row) ? "Bulk import or interpret" : "Interpret source",
      detail: isSpreadsheetUpload(row) ? "Use the template importer when columns already match." : "Run AI extraction into staging.",
      tone: "warning"
    };
  }
  if (rowGap(row) > 0) {
    return {
      label: "Audit missing rows",
      detail: `${rowGap(row)} detected row(s) did not land in staging.`,
      tone: "danger"
    };
  }
  if (stagedRows(row) > 0 || row.status === "staged") {
    return {
      label: "Review staged rows",
      detail: `${stagedRows(row)} row(s) ready for validation.`,
      tone: auditStatus(row) === "needs_review" ? "warning" : "success"
    };
  }
  if (row.status === "archived") {
    return {
      label: "Archived",
      detail: "No active action.",
      tone: "muted"
    };
  }
  return {
    label: "Inspect source",
    detail: "Open details to decide the next action.",
    tone: "neutral"
  };
}

function renderNextUploadStep(row) {
  const step = nextUploadStep(row);
  return `
    <div class="upload-next-step ${escapeHtml(step.tone)}">
      <strong>${escapeHtml(step.label)}</strong>
      <small>${escapeHtml(step.detail)}</small>
    </div>
  `;
}

function renderPrimaryUploadAction(row) {
  if (row.status === "uploaded" && isSpreadsheetUpload(row)) {
    return `<button type="button" class="small-button" data-bulk-import-id="${escapeHtml(row.id)}">Bulk import</button>`;
  }
  if (row.status === "uploaded" || row.status === "failed") {
    return `<button type="button" class="small-button" data-interpret-id="${escapeHtml(row.id)}">${row.status === "failed" ? "Reprocess" : "Interpret"}</button>`;
  }
  if (stagedRows(row) > 0 || row.status === "staged") {
    return `<a class="small-button" href="${escapeHtml(sourceRowsUrl(row))}">View rows</a>`;
  }
  return `<button type="button" class="small-button secondary" data-upload-detail="${escapeHtml(row.id)}">Details</button>`;
}

function renderUploadActions(row) {
  const archived = row.status === "archived";
  return `
    <div class="history-actions">
      ${renderPrimaryUploadAction(row)}
      <details class="row-more-menu">
        <summary>More</summary>
        <div>
          <button type="button" class="small-button secondary" data-upload-detail="${escapeHtml(row.id)}">Details</button>
          <button type="button" class="small-button secondary" data-source-id="${escapeHtml(row.id)}">View source</button>
          <a class="small-button secondary" href="${escapeHtml(sourceRowsUrl(row))}">View rows</a>
          ${isSpreadsheetUpload(row) && !archived ? `<button type="button" class="small-button secondary" data-bulk-import-id="${escapeHtml(row.id)}">Bulk import</button>` : ""}
          ${archived ? "" : `<button type="button" class="small-button secondary" data-interpret-id="${escapeHtml(row.id)}">${row.status === "uploaded" ? "Interpret" : "Reprocess"}</button>`}
          ${archived ? "" : `<button type="button" class="small-button secondary" data-archive-id="${escapeHtml(row.id)}">Archive</button>`}
          <button type="button" class="small-button danger" data-remove-id="${escapeHtml(row.id)}">Remove</button>
        </div>
      </details>
      ${row.error_message ? `<small class="error-detail">${escapeHtml(humanizeError(row.error_message))}</small>` : ""}
      <small class="row-save-status" data-upload-status="${escapeHtml(row.id)}"></small>
    </div>
  `;
}

function detailItem(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "-")}</dd>
    </div>
  `;
}

function warningList(warnings) {
  if (!warnings.length) return '<p class="detail-note">No audit warnings recorded.</p>';
  return `<ul class="compact-warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`;
}

function memoryRulesUsed(row) {
  const audit = auditPayload(row);
  return Array.isArray(audit.memory_rules_used) ? audit.memory_rules_used.filter(Boolean) : [];
}

function auditCompleteness(row) {
  const detected = detectedRows(row);
  const staged = stagedRows(row);
  if (!detected && !staged) return 0;
  return detected > 0 ? Math.max(0, Math.min(100, Math.round((staged / detected) * 100))) : 100;
}

function renderAuditMetric(label, value, tone = "neutral") {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "-")}</strong>
      <i class="${escapeHtml(tone)}"></i>
    </article>
  `;
}

function renderAuditQuality(row) {
  const audit = auditPayload(row);
  const quality = audit.row_quality && typeof audit.row_quality === "object" ? audit.row_quality : {};
  const total = Number(quality.total ?? stagedRows(row) ?? 0);
  const metrics = [
    ["Rows needing review", quality.needs_review ?? 0, Number(quality.needs_review || 0) ? "warning" : "success"],
    ["Missing rates", quality.missing_rate ?? 0, Number(quality.missing_rate || 0) ? "danger" : "success"],
    ["Missing location match", quality.missing_location_match ?? 0, Number(quality.missing_location_match || 0) ? "warning" : "success"],
    ["Split no total", quality.split_without_total ?? 0, Number(quality.split_without_total || 0) ? "warning" : "success"],
    ["RT no marker", quality.roundtrip_without_marker ?? 0, Number(quality.roundtrip_without_marker || 0) ? "danger" : "success"],
    ["Low confidence", quality.low_confidence ?? 0, Number(quality.low_confidence || 0) ? "warning" : "success"]
  ];
  return `
    <div class="audit-viewer-grid">
      ${renderAuditMetric("Completeness", `${auditCompleteness(row)}%`, auditCompleteness(row) >= 95 ? "success" : auditCompleteness(row) >= 75 ? "warning" : "danger")}
      ${renderAuditMetric("Final staged rows", stagedRows(row), stagedRows(row) ? "success" : "danger")}
      ${renderAuditMetric("Expected rows", detectedRows(row) || stagedRows(row), "neutral")}
      ${renderAuditMetric("Rows audited", total, "neutral")}
      ${metrics.map(([label, value, tone]) => renderAuditMetric(label, value, tone)).join("")}
    </div>
  `;
}

function renderAppliedMemoryRules(row) {
  const rules = memoryRulesUsed(row);
  if (!rules.length) {
    return '<p class="detail-note">No interpretation memory rules were applied to this run.</p>';
  }
  return `
    <div class="audit-memory-list">
      ${rules.map((rule) => `
        <article>
          <span class="review-chip neutral">${escapeHtml(memoryScopeLabel(rule.scope))}</span>
          <strong>${escapeHtml(rule.title || "Memory rule")}</strong>
          ${rule.id ? `<small>${escapeHtml(rule.id)}</small>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderInterpretationAuditViewer(row) {
  const audit = auditPayload(row);
  return `
    <div class="interpretation-audit-viewer">
      <div class="audit-viewer-header">
        <div>
          <strong>Audit viewer</strong>
          <span>${escapeHtml(audit.warning_count || auditWarnings(row).length || 0)} warning(s) / ${escapeHtml(memoryRulesUsed(row).length)} memory rule(s)</span>
        </div>
        <span class="review-chip ${escapeHtml(auditTone(auditStatus(row)))}">${escapeHtml(auditLabel(auditStatus(row)))}</span>
      </div>
      ${renderAuditQuality(row)}
      ${renderMissingRowsExplanation(row)}
      <div class="audit-viewer-split">
        <section>
          <h4>Memory used</h4>
          ${renderAppliedMemoryRules(row)}
        </section>
        <section>
          <h4>Warnings</h4>
          ${warningList(auditWarnings(row).slice(0, 8))}
        </section>
      </div>
    </div>
  `;
}

function rowEvidence(row) {
  return row.source_evidence && typeof row.source_evidence === "object" ? row.source_evidence : {};
}

function rateDisplay(row) {
  const split = [row.mx_linehaul, row.us_linehaul, row.fsc, row.fuel, row.border_crossing_fee].filter(Boolean);
  if (row.all_in_rate) return [row.all_in_rate, row.currency].filter(Boolean).join(" ");
  if (split.length) return `split ${split.join(" + ")}`;
  return "-";
}

function renderMissingRowsExplanation(row) {
  const audit = auditPayload(row);
  const gap = rowGap(row);
  const warnings = auditWarnings(row);
  const explanation = cleanAuditText(audit.missing_row_explanation || audit.row_gap_explanation || audit.explanation);
  const sourceSignals = [
    audit.source_table_count ? `${audit.source_table_count} source table(s)` : "",
    audit.first_pass_rows ? `${audit.first_pass_rows} first-pass row(s)` : "",
    audit.audit_pass_rows ? `${audit.audit_pass_rows} audit-pass row(s)` : "",
    audit.deterministic_repair_used ? "deterministic repair used" : ""
  ].filter(Boolean);

  let message = explanation;
  if (!message && gap > 0) {
    message = `The source appears to contain ${detectedRows(row)} rate row(s), but only ${stagedRows(row)} reached staging. Open the source, compare the table, then reprocess with the missing-row instruction.`;
  } else if (!message && warnings.length) {
    message = "The interpreter reported warning(s). Review source evidence before approving the staged rows.";
  } else if (!message) {
    message = "No row-count mismatch is currently detected. Spot-check the source before approval when the file is critical.";
  }

  return `
    <div class="audit-explanation-panel ${gap || warnings.length ? "warning" : "success"}">
      <div>
        <strong>${escapeHtml(gap ? "Missing-row explanation" : "Audit explanation")}</strong>
        ${gap ? `<span class="review-chip danger">${escapeHtml(gap)} missing</span>` : '<span class="review-chip success">no row gap</span>'}
      </div>
      <p>${escapeHtml(message)}</p>
      ${sourceSignals.length ? `<small>${escapeHtml(sourceSignals.join(" | "))}</small>` : ""}
      ${gap ? `<button type="button" class="secondary small-button" data-reprocess-note-id="${escapeHtml(row.id)}" data-reprocess-note="${escapeHtml(MISSING_ROWS_REPROCESS_NOTE)}">Reprocess for missing rows</button>` : ""}
    </div>
  `;
}

function cleanAuditText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderMissingRowDetector(row) {
  const audit = auditPayload(row);
  const missing = Number(audit.missing_row_count || rowGap(row) || 0);
  const ids = Array.isArray(audit.missing_row_ids) ? audit.missing_row_ids : [];
  const signals = Array.isArray(audit.missing_row_signals) ? audit.missing_row_signals : [];
  return `
    <div class="missing-row-detector ${missing ? "danger" : "success"}">
      <div>
        <span>${escapeHtml(missing ? "Missing rows suspected" : "No missing row gap detected")}</span>
        <strong>${escapeHtml(missing)}</strong>
      </div>
      ${renderMissingRowsExplanation(row)}
      ${ids.length ? `<small>Missing row IDs: ${escapeHtml(ids.slice(0, 16).join(", "))}</small>` : ""}
      ${signals.length ? `<ul>${signals.slice(0, 5).map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderStagedComparisonTable(rows = []) {
  if (!rows.length) {
    return '<p class="detail-note">No current staged rows found for this upload.</p>';
  }
  return `
    <div class="source-compare-table">
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Lane</th>
            <th>Service</th>
            <th>Rate</th>
            <th>Audit</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((stagedRow) => {
            const evidence = rowEvidence(stagedRow);
            const flags = Array.isArray(stagedRow.audit_flags) ? stagedRow.audit_flags : [];
            return `
              <tr>
                <td>${escapeHtml(stagedRow.row_id || evidence.row_id || "-")}</td>
                <td>
                  <strong>${escapeHtml([stagedRow.origin, stagedRow.destination].filter(Boolean).join(" -> ") || evidence.lane || "-")}</strong>
                  <small>${escapeHtml([stagedRow.operation, stagedRow.equipment, stagedRow.trailer].filter(Boolean).join(" / "))}</small>
                </td>
                <td>
                  ${escapeHtml(stagedRow.service || "-")}
                  ${evidence.service_marker ? `<small>marker: ${escapeHtml(evidence.service_marker)}</small>` : ""}
                </td>
                <td>
                  ${escapeHtml(rateDisplay(stagedRow))}
                  ${evidence.rate_mode ? `<small>${escapeHtml(evidence.rate_mode)}</small>` : ""}
                </td>
                <td>
                  ${flags.length ? flags.slice(0, 4).map((flag) => `<span class="review-chip warning">${escapeHtml(String(flag).replace(/_/g, " "))}</span>`).join("") : '<span class="review-chip success">clean</span>'}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadSourceComparison(row) {
  const target = document.querySelector("#upload-source-comparison");
  if (!target) return;
  target.innerHTML = '<p class="detail-note">Loading staged rows for source comparison...</p>';
  try {
    const rows = await fetchUploadStagedRows(row.id);
    target.innerHTML = `
      <div class="source-compare-layout">
        <section>
          <div class="source-compare-heading">
            <strong>Source/PDF</strong>
            <button class="secondary small-button" type="button" data-source-id="${escapeHtml(row.id)}">View source</button>
          </div>
          ${renderMissingRowDetector(row)}
          <dl>
            ${detailItem("Detected rows", detectedRows(row) || stagedRows(row))}
            ${detailItem("Staged rows", rows.length || stagedRows(row))}
            ${detailItem("Audit status", auditLabel(auditStatus(row)))}
          </dl>
        </section>
        <section>
          <div class="source-compare-heading">
            <strong>Rows staged</strong>
            <a class="small-button secondary" href="${escapeHtml(sourceRowsUrl(row))}">Open Staging</a>
          </div>
          ${renderStagedComparisonTable(rows)}
        </section>
      </div>
    `;
  } catch (error) {
    target.innerHTML = `<p class="detail-note">${escapeHtml(humanizeError(error))}</p>`;
  }
}

function correctionHistory(row) {
  return Array.isArray(row.correction_history) ? row.correction_history : [];
}

function latestCorrection(row) {
  return correctionHistory(row).at(-1) || null;
}

function correctionDelta(item) {
  if (!item) return null;
  const before = Number(item.rows_before || 0);
  const after = Number(item.rows_after || 0);
  return after - before;
}

function correctionTone(item) {
  const delta = correctionDelta(item);
  if (delta === null) return "muted";
  if (delta > 0) return "success";
  if (delta < 0) return "danger";
  return "neutral";
}

function correctionDeltaLabel(item) {
  const delta = correctionDelta(item);
  if (delta === null) return "No comparison";
  if (delta > 0) return `+${delta} row${delta === 1 ? "" : "s"}`;
  if (delta < 0) return `${delta} row${Math.abs(delta) === 1 ? "" : "s"}`;
  return "No row change";
}

function warningDeltaLabel(item) {
  if (!item || item.warnings_before === undefined || item.warnings_after === undefined) return "";
  const delta = Number(item.warnings_after || 0) - Number(item.warnings_before || 0);
  if (delta < 0) return `${Math.abs(delta)} fewer warning${Math.abs(delta) === 1 ? "" : "s"}`;
  if (delta > 0) return `${delta} more warning${delta === 1 ? "" : "s"}`;
  return "same warnings";
}

function renderReprocessImpact(row) {
  const latest = latestCorrection(row);
  const before = latest ? Number(latest.rows_before || 0) : stagedRows(row);
  const after = latest ? Number(latest.rows_after || 0) : stagedRows(row);
  const expectedBefore = latest ? Number(latest.expected_before || before) : detectedRows(row);
  const expectedAfter = latest ? Number(latest.expected_after || after) : detectedRows(row);
  const warningsBefore = latest?.warnings_before ?? auditWarnings(row).length;
  const warningsAfter = latest?.warnings_after ?? auditWarnings(row).length;
  return `
    <div class="reprocess-impact-card">
      <span class="review-chip ${escapeHtml(correctionTone(latest))}">${escapeHtml(latest ? correctionDeltaLabel(latest) : "No reprocess yet")}</span>
      <dl>
        ${detailItem("Before", before)}
        ${detailItem("After", after)}
        ${detailItem("Expected before", expectedBefore || before)}
        ${detailItem("Expected after", expectedAfter || after)}
        ${detailItem("Audit before", latest?.audit_status_before || auditStatus(row))}
        ${detailItem("Audit after", latest?.audit_status_after || auditStatus(row))}
        ${detailItem("Warnings before", warningsBefore)}
        ${detailItem("Warnings after", warningsAfter)}
      </dl>
      <p>${escapeHtml(latest?.note || "Run reprocess with a correction note to create an interpretation diff.")}</p>
    </div>
  `;
}

function renderCorrectionHistory(row) {
  const history = correctionHistory(row).slice(-5).reverse();
  if (!row.correction_note && !history.length) {
    return '<p class="detail-note">No correction notes used yet.</p>';
  }
  return `
    <div class="correction-history">
      ${row.correction_note ? `<article><strong>Last note</strong><span>${escapeHtml(row.correction_note)}</span></article>` : ""}
      ${history.map((item) => `
        <article class="${escapeHtml(correctionTone(item))}">
          <div>
            <strong>${escapeHtml(formatDate(item.created_at) || "Reprocess")}</strong>
            <span class="review-chip ${escapeHtml(correctionTone(item))}">${escapeHtml(correctionDeltaLabel(item))}</span>
          </div>
          <span>${escapeHtml(item.note || "")}</span>
          <small>${escapeHtml([
            item.rows_before !== undefined ? `${item.rows_before} before` : "",
            item.rows_after !== undefined ? `${item.rows_after} after` : "",
            item.audit_status_before || item.audit_status_after ? `${item.audit_status_before || "-"} -> ${item.audit_status_after || "-"}` : "",
            warningDeltaLabel(item)
          ].filter(Boolean).join(" | "))}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSelectedReprocessPreview(rows = []) {
  if (!reprocessImpactPreview) return;
  if (!rows.length) {
    reprocessImpactPreview.innerHTML = '<p class="detail-note">Select uploads to see their current interpretation baseline.</p>';
    return;
  }
  reprocessImpactPreview.innerHTML = rows.slice(0, 8).map((row) => `
    <article>
      <div>
        <strong>${escapeHtml(row.original_filename || "Upload")}</strong>
        <small>${escapeHtml([vendorDisplay(row), row.rfx_hint].filter(Boolean).join(" / ") || "-")}</small>
      </div>
      <div>
        <span class="review-chip neutral">${escapeHtml(`${stagedRows(row)} staged`)}</span>
        <span class="review-chip muted">${escapeHtml(`${detectedRows(row) || stagedRows(row)} detected`)}</span>
        <span class="review-chip ${escapeHtml(auditTone(auditStatus(row)))}">${escapeHtml(auditLabel(auditStatus(row)))}</span>
        ${latestCorrection(row) ? `<span class="review-chip ${escapeHtml(correctionTone(latestCorrection(row)))}">${escapeHtml(correctionDeltaLabel(latestCorrection(row)))}</span>` : ""}
      </div>
    </article>
  `).join("") + (rows.length > 8 ? `<p class="detail-note">${escapeHtml(rows.length - 8)} more upload(s) selected.</p>` : "");
}

function renderReprocessRunResults(results = [], total = 0) {
  if (!reprocessImpactPreview) return;
  if (!results.length) {
    reprocessImpactPreview.innerHTML = `<p class="detail-note">Reprocessing 0/${escapeHtml(total)} upload(s)...</p>`;
    return;
  }
  reprocessImpactPreview.innerHTML = results.map((item) => {
    const row = loadedRows.find((candidate) => candidate.id === item.id) || {};
    const diff = item.result?.diff || {};
    const audit = item.result?.audit || {};
    const rowDelta = Number(diff.rows_after || 0) - Number(diff.rows_before || 0);
    const warningDelta = Number(diff.warnings_after || 0) - Number(diff.warnings_before || 0);
    return `
      <article class="${item.error ? "danger" : rowDelta > 0 ? "success" : audit.status === "needs_review" ? "warning" : "neutral"}">
        <div>
          <strong>${escapeHtml(row.original_filename || item.id)}</strong>
          <span class="review-chip ${item.error ? "danger" : rowDelta > 0 ? "success" : "neutral"}">${escapeHtml(item.error ? "failed" : rowDelta > 0 ? `+${rowDelta} rows` : "no row change")}</span>
        </div>
        ${item.error ? `<span>${escapeHtml(humanizeError(item.error))}</span>` : `
          <small>${escapeHtml([
            `${diff.rows_before ?? 0} -> ${diff.rows_after ?? 0} staged`,
            `${diff.expected_before ?? 0} -> ${diff.expected_after ?? 0} expected`,
            `${diff.audit_status_before || "-"} -> ${diff.audit_status_after || audit.status || "-"}`,
            warningDelta < 0 ? `${Math.abs(warningDelta)} fewer warnings` : warningDelta > 0 ? `${warningDelta} more warnings` : "same warnings"
          ].join(" | "))}</small>
        `}
      </article>
    `;
  }).join("") + (results.length < total ? `<p class="detail-note">Reprocessing ${escapeHtml(results.length)}/${escapeHtml(total)}...</p>` : "");
}

function vendorDisplay(row) {
  return row.vendors?.vendor_name || row.vendor_hint || "No vendor detected";
}

function openUploadDrawer(rowId) {
  const row = currentRows.find((candidate) => candidate.id === rowId) || loadedRows.find((candidate) => candidate.id === rowId);
  if (!row || !uploadDrawer || !uploadDetail) return;

  uploadDrawerTitle.textContent = row.original_filename || "Upload detail";
  uploadDetail.innerHTML = `
    <section class="upload-detail-section">
      <h3>Source summary</h3>
      <div class="drawer-badges">
        <span class="status-pill ${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status || "unknown")}</span>
        <span class="review-chip neutral">${escapeHtml(row.document_type || "unknown type")}</span>
        ${matchLabel(row)}
      </div>
      <div class="drawer-quick-actions">
        <button class="secondary small-button" type="button" data-source-id="${escapeHtml(row.id)}">View source</button>
        <a class="small-button" href="${escapeHtml(sourceRowsUrl(row))}">View extracted rows</a>
        ${isSpreadsheetUpload(row) && row.status !== "archived" ? `<button class="secondary small-button" type="button" data-bulk-import-id="${escapeHtml(row.id)}">Bulk import</button>` : ""}
        ${row.status === "archived" ? "" : `<button class="secondary small-button" type="button" data-interpret-id="${escapeHtml(row.id)}">${row.status === "uploaded" ? "Interpret" : "Reprocess"}</button>`}
      </div>
      <dl>
        ${detailItem("Vendor", vendorDisplay(row))}
        ${detailItem("RFx", row.rfx_hint)}
        ${detailItem("Uploaded", formatDate(row.created_at))}
        ${detailItem("Match source", row.vendor_match_source)}
        ${detailItem("Reprocess count", row.reprocess_count)}
        ${detailItem("Last reprocess", formatDate(row.last_reprocessed_at))}
      </dl>
    </section>

    <section class="upload-detail-section">
      <h3>Interpretation audit</h3>
      <div class="drawer-badges">
        <span class="review-chip ${escapeHtml(auditTone(auditStatus(row)))}">${escapeHtml(auditLabel(auditStatus(row)))}</span>
        ${auditRowsLabel(row) ? `<span class="review-chip neutral">${escapeHtml(auditRowsLabel(row))}</span>` : ""}
      </div>
      ${renderRowAuditMeter(row)}
      <dl>
        ${detailItem("First pass rows", auditPayload(row).first_pass_rows)}
        ${detailItem("Audit pass", auditPayload(row).audit_pass_used ? "yes" : "no")}
        ${detailItem("Audit pass rows", auditPayload(row).audit_pass_rows)}
        ${detailItem("Deterministic repair", auditPayload(row).deterministic_repair_used ? "yes" : "no")}
        ${detailItem("Sparse table risk", auditPayload(row).sparse_table_risk ? "yes" : "no")}
      </dl>
      ${renderInterpretationAuditViewer(row)}
    </section>

    <section class="upload-detail-section">
      <h3>Source vs staged rows</h3>
      <div id="upload-source-comparison" class="source-comparison-panel">
        <p class="detail-note">Loading comparison...</p>
      </div>
    </section>

    <section class="upload-detail-section">
      <h3>Correction notes</h3>
      ${renderReprocessImpact(row)}
      ${renderCorrectionHistory(row)}
    </section>

    <section class="upload-detail-section">
      <h3>Storage and traceability</h3>
      <dl>
        ${detailItem("File", row.original_filename)}
        ${detailItem("Storage path", row.storage_path)}
        ${detailItem("Upload ID", row.id)}
      </dl>
    </section>

    ${
      row.error_message
        ? `<section class="upload-detail-section upload-error-panel">
            <h3>Processing issue</h3>
            <p>${escapeHtml(humanizeError(row.error_message))}</p>
            <small>${escapeHtml(row.error_message)}</small>
          </section>`
        : ""
    }

    <section class="upload-detail-section">
      <h3>Next action</h3>
      <p class="detail-note">${escapeHtml(
        row.status === "staged"
          ? "Open Staging Review to validate the interpreted rows before approval."
          : row.status === "uploaded"
            ? "Run interpretation from the table action to create staging rows."
            : row.status === "failed"
              ? "Review the processing issue, then retry interpretation after the source or API issue is corrected."
              : "This upload is archived or already processed."
      )}</p>
      <a class="small-button" href="${escapeHtml(sourceRowsUrl(row))}">Open extracted rows</a>
    </section>
  `;
  uploadDrawer.classList.remove("hidden");
  loadSourceComparison(row);
}

function emptyUploadMessage() {
  if (activeQuickFilter === "all") {
    return {
      title: "No uploads yet",
      detail: "Upload carrier source files before running interpretation."
    };
  }
  return {
    title: "No uploads match this view",
    detail: "Change the quick filter or status filter to review other source files."
  };
}

function renderRows(rows) {
  currentRows = rows;
  updateQuickFilters();
  updateUploadMetrics(rows);

  if (!rows.length) {
    const empty = emptyUploadMessage();
    historyBody.innerHTML =
      tableState(HISTORY_COLSPAN, {
        tone: "neutral",
        eyebrow: activeQuickFilter === "all" ? "Source archive" : "Filtered view",
        title: empty.title,
        detail: empty.detail,
        actionHref: activeQuickFilter === "all" ? "./upload-center.html" : "",
        actionLabel: "Upload source files",
        actionButton: activeQuickFilter === "all"
          ? ""
          : '<button class="secondary small-button" type="button" data-retry-action="clear-upload-filters">Clear filters</button>'
      });
    updateBulkControls();
    return;
  }

  historyBody.innerHTML = rows
    .map(
      (row) => `
        <tr data-upload-id="${escapeHtml(row.id)}">
          <td class="select-column">
            <input data-select-upload="${escapeHtml(row.id)}" type="checkbox" aria-label="Select upload" ${selectedUploadIds.has(row.id) ? "checked" : ""} />
          </td>
          <td>${escapeHtml(formatDate(row.created_at))}</td>
          <td class="source-file-cell">
            <strong>${escapeHtml(row.original_filename)}</strong>
            <small>${escapeHtml(row.document_type || "file")}</small>
          </td>
          <td class="source-owner-cell">
            <strong>${escapeHtml(row.vendors?.vendor_name || row.vendor_hint || "No vendor hint")}</strong>
            ${row.vendors?.vendor_name ? matchLabel(row) : ""}
            <small>${escapeHtml(row.rfx_hint || "No RFx")}</small>
          </td>
          <td title="${escapeHtml(uploadQualitySummary(row))}">
            <span class="status-pill ${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status)}</span>
          </td>
          <td>${renderAuditSummary(row)}</td>
          <td>${renderNextUploadStep(row)}</td>
          <td class="storage-cell" title="${escapeHtml(row.storage_path)}">${escapeHtml(row.storage_path)}</td>
          <td>${renderUploadActions(row)}</td>
        </tr>
      `
    )
    .join("");
  updateBulkControls();
}

async function loadHistory() {
  historyBody.innerHTML = tableLoadingState(HISTORY_COLSPAN, {
    title: "Loading source files",
    detail: "Reading preserved uploads, staged row counts, and audit signals."
  });
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchUploadHistory({ status: statusFilter.value });
    loadedRows = rows;
    renderRows(applyUploadFilters(rows));
    await applyPermissionState(UPLOAD_ACTION_SELECTOR, "uploads:interpret");
  } catch (error) {
    historyBody.innerHTML = tableErrorState(HISTORY_COLSPAN, error, {
      title: "Upload History could not load",
      retryAction: "load-upload-history",
      meta: "Your files are preserved in storage. This only affects the current view."
    });
  } finally {
    refreshButton.disabled = false;
  }
}

async function runBulkUploadAction(action) {
  const ids = selectedVisibleIds();
  if (!ids.length) return;
  if (action === "reprocess") {
    openReprocessDrawer(ids);
    return;
  }
  if (action === "remove") {
    const confirmed = window.confirm(`Remove ${ids.length} upload version(s) and their staged rows? This cannot be undone.`);
    if (!confirmed) return;
  }

  archiveSelectedButton.disabled = true;
  reprocessSelectedButton.disabled = true;
  if (bulkImportSelectedButton) bulkImportSelectedButton.disabled = true;
  removeSelectedButton.disabled = true;
  setBulkStatus(`${action === "archive" ? "Archiving" : action === "reprocess" ? "Reprocessing" : "Removing"} ${ids.length} upload(s)...`);

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState(UPLOAD_ACTION_SELECTOR, "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }
    const fn = action === "archive" ? archiveUpload : removeUpload;
    await Promise.all(ids.map((id) => fn(id)));
    ids.forEach((id) => selectedUploadIds.delete(id));
    setBulkStatus(`${ids.length} upload(s) ${action === "archive" ? "archived" : action === "reprocess" ? "reprocessed" : "removed"}.`, "success");
    await loadHistory();
  } catch (error) {
    setBulkStatus(humanizeError(error), "error");
    updateBulkControls();
  }
}

function bulkImportSummary(result) {
  const imported = Number(result?.imported_rows || 0);
  const expected = Number(result?.expected_rows || imported || 0);
  const skipped = Number(result?.skipped_rows || 0);
  const skippedLabel = skipped ? `, ${skipped} skipped` : "";
  return `${imported}/${expected} row(s) imported${skippedLabel}.`;
}

async function runBulkTemplateImport(ids = selectedVisibleIds(), sourceButton = null) {
  const spreadsheetIds = ids
    .map((id) => currentRows.find((row) => row.id === id) || loadedRows.find((row) => row.id === id))
    .filter((row) => row && isSpreadsheetUpload(row) && row.status !== "archived")
    .map((row) => row.id);

  if (!spreadsheetIds.length) {
    setBulkStatus("Select at least one XLSX upload for structured bulk import.", "error");
    updateBulkControls();
    return;
  }

  const confirmed = window.confirm(
    `Bulk import ${spreadsheetIds.length} spreadsheet upload(s) without AI? Existing pending/rejected staged rows for those uploads will be archived first. Large files will be imported in batches.`
  );
  if (!confirmed) return;

  const originalText = sourceButton?.textContent || "";
  if (sourceButton) {
    sourceButton.disabled = true;
    sourceButton.textContent = "Importing...";
  }
  if (bulkImportSelectedButton) bulkImportSelectedButton.disabled = true;
  reprocessSelectedButton.disabled = true;
  archiveSelectedButton.disabled = true;
  removeSelectedButton.disabled = true;

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState(UPLOAD_ACTION_SELECTOR, "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }

    const results = [];
    for (let index = 0; index < spreadsheetIds.length; index += 1) {
      const id = spreadsheetIds[index];
      setBulkStatus(`Reading spreadsheet ${index + 1}/${spreadsheetIds.length}...`);
      const parsedWorkbook = await parseStructuredWorkbookFromUpload(id);
      const batches = chunkRows(parsedWorkbook.rows);
      const uploadResult = {
        imported_rows: 0,
        expected_rows: parsedWorkbook.rows.length,
        skipped_rows: 0
      };

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batchRows = batches[batchIndex];
        setBulkStatus(
          `Bulk importing spreadsheet ${index + 1}/${spreadsheetIds.length}: batch ${batchIndex + 1}/${batches.length} (${batchRows.length} row(s))...`
        );
        const result = await bulkImportUploadTemplate(id, {
          rows: batchRows,
          warnings: batchIndex === 0 ? parsedWorkbook.warnings : [],
          replaceExisting: batchIndex === 0,
          expectedRows: parsedWorkbook.rows.length,
          batchIndex,
          batchCount: batches.length,
          importedBefore: uploadResult.imported_rows,
          skippedBefore: uploadResult.skipped_rows
        });
        uploadResult.imported_rows += Number(result.imported_rows || 0);
        uploadResult.skipped_rows += Number(result.skipped_rows || 0);
      }

      results.push({ id, result: uploadResult });
      const rowStatus = historyBody.querySelector(`[data-upload-status="${CSS.escape(id)}"]`);
      if (rowStatus) {
        rowStatus.textContent = bulkImportSummary(uploadResult);
        rowStatus.dataset.tone = "success";
      }
    }

    spreadsheetIds.forEach((id) => selectedUploadIds.delete(id));
    const imported = results.reduce((sum, item) => sum + Number(item.result?.imported_rows || 0), 0);
    const expected = results.reduce((sum, item) => sum + Number(item.result?.expected_rows || 0), 0);
    const skipped = results.reduce((sum, item) => sum + Number(item.result?.skipped_rows || 0), 0);
    setBulkStatus(`${imported}/${expected || imported} structured row(s) imported to staging${skipped ? `, ${skipped} skipped` : ""}.`, "success");
    await loadHistory();
  } catch (error) {
    setBulkStatus(humanizeError(error), "error");
    if (sourceButton) sourceButton.title = humanizeError(error);
  } finally {
    if (sourceButton) {
      sourceButton.disabled = false;
      sourceButton.textContent = originalText;
    }
    updateBulkControls();
  }
}

function setReprocessStatus(message, tone = "neutral") {
  if (!reprocessStatus) return;
  reprocessStatus.textContent = message;
  reprocessStatus.dataset.tone = tone;
}

function memoryScopeLabel(scope) {
  if (scope === "vendor") return "Vendor";
  if (scope === "rfx") return "RFx";
  if (scope === "upload") return "Upload";
  return "Global";
}

function renderApplicableMemory(rules = []) {
  if (!applicableMemoryCount || !applicableMemoryList) return;
  applicableMemoryCount.textContent = rules.length ? `${rules.length} rule(s) will guide this interpretation.` : "No saved rules yet.";
  applicableMemoryList.innerHTML = rules.length
    ? rules.slice(0, 8).map((rule) => `
        <article>
          <span>${escapeHtml(memoryScopeLabel(rule.scope))}</span>
          <strong>${escapeHtml(rule.title || "Interpretation rule")}</strong>
          <small>${escapeHtml(rule.instruction || "")}</small>
        </article>
      `).join("")
    : '<p class="detail-note">Use the correction note below, then save it as memory if it should apply again.</p>';
}

async function loadApplicableMemory(rawUploadId) {
  if (!applicableMemoryCount || !applicableMemoryList) return;
  applicableMemoryCount.textContent = "Loading rules...";
  applicableMemoryList.innerHTML = "";
  try {
    const rules = await listInterpretationMemory(rawUploadId);
    renderApplicableMemory(rules);
  } catch (error) {
    applicableMemoryCount.textContent = "Could not load memory rules.";
    applicableMemoryList.innerHTML = `<p class="detail-note">${escapeHtml(humanizeError(error))}</p>`;
  }
}

function openReprocessDrawer(ids = [], { note = "" } = {}) {
  pendingReprocessIds = ids.filter(Boolean);
  if (!pendingReprocessIds.length || !reprocessDrawer) return;
  const rows = pendingReprocessIds.map((id) => loadedRows.find((row) => row.id === id)).filter(Boolean);
  const lastNote = rows.find((row) => row.correction_note)?.correction_note || "";
  if (reprocessNoteInput) reprocessNoteInput.value = note || lastNote;
  if (saveMemoryRuleInput) saveMemoryRuleInput.checked = false;
  if (memoryRuleScopeInput) memoryRuleScopeInput.value = rows.length === 1 && rows[0]?.rfx_hint ? "rfx" : "vendor";
  renderApplicableMemory([]);
  renderSelectedReprocessPreview(rows);
  setReprocessStatus(`${pendingReprocessIds.length} upload(s) selected. Add a correction note or leave blank to reprocess normally.`);
  reprocessDrawer.classList.remove("hidden");
  loadApplicableMemory(pendingReprocessIds[0]);
}

async function runReprocessWithNote(event) {
  event.preventDefault();
  const ids = pendingReprocessIds.slice();
  if (!ids.length) return;
  const correctionNote = reprocessNoteInput?.value || "";
  if (confirmReprocessButton) confirmReprocessButton.disabled = true;
  setReprocessStatus(`Reprocessing ${ids.length} upload(s)...`);

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState(UPLOAD_ACTION_SELECTOR, "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }
    const runResults = [];
    for (let index = 0; index < ids.length; index += 1) {
      setReprocessStatus(`Reprocessing ${index + 1}/${ids.length}...`);
      try {
        const result = await interpretUpload(ids[index], { correctionNote });
        runResults.push({ id: ids[index], result });
      } catch (error) {
        runResults.push({ id: ids[index], error });
      }
      renderReprocessRunResults(runResults, ids.length);
    }
    const failed = runResults.filter((item) => item.error).length;
    if (saveMemoryRuleInput?.checked && correctionNote.trim()) {
      await createInterpretationMemory({
        rawUploadId: ids[0],
        scope: memoryRuleScopeInput?.value || "vendor",
        instruction: correctionNote,
        title: correctionNote.split("\n")[0].slice(0, 80) || "Interpretation correction"
      });
    }
    ids.forEach((id) => selectedUploadIds.delete(id));
    setReprocessStatus(`${ids.length - failed}/${ids.length} upload(s) reprocessed.`, failed ? "error" : "success");
    setBulkStatus(`${ids.length - failed}/${ids.length} upload(s) reprocessed with diff.`, failed ? "error" : "success");
    pendingReprocessIds = [];
    uploadDrawer?.classList.add("hidden");
    await loadHistory();
  } catch (error) {
    setReprocessStatus(humanizeError(error), "error");
    setBulkStatus(humanizeError(error), "error");
  } finally {
    if (confirmReprocessButton) confirmReprocessButton.disabled = false;
    updateBulkControls();
  }
}

async function openUploadSource(rowId, sourceButton = null) {
  if (!rowId) return;
  const originalText = sourceButton?.textContent || "";
  const sourceWindow = window.open("", "_blank");
  if (sourceWindow) sourceWindow.opener = null;
  if (sourceButton) {
    sourceButton.disabled = true;
    sourceButton.textContent = "Opening...";
  }

  try {
    await ensureSignedIn();
    const source = await getUploadSourceUrl(rowId);
    if (sourceWindow) {
      sourceWindow.location.href = source.url;
    } else {
      window.open(source.url, "_blank", "noopener,noreferrer");
    }
    setBulkStatus(`Source link opened. It expires in ${Math.round((source.expires_in_seconds || 600) / 60)} minutes.`, "success");
  } catch (error) {
    if (sourceWindow && !sourceWindow.closed) sourceWindow.close();
    setBulkStatus(humanizeError(error), "error");
  } finally {
    if (sourceButton) {
      sourceButton.disabled = false;
      sourceButton.textContent = originalText;
    }
  }
}

async function clearUploadFilters() {
  statusFilter.value = "current";
  if (uploadSearchInput) uploadSearchInput.value = "";
  activeQuickFilter = "all";
  selectedUploadIds.clear();
  uploadDrawer?.classList.add("hidden");
  setBulkStatus("");
  await loadHistory();
}

initAuthControls();
applyUrlFilters();
requirePrivatePage().catch(() => {});
refreshButton.addEventListener("click", loadHistory);
clearFiltersButton?.addEventListener("click", clearUploadFilters);
statusFilter.addEventListener("change", () => {
  activeQuickFilter = "all";
  selectedUploadIds.clear();
  setBulkStatus("");
  loadHistory();
});
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeQuickFilter = button.dataset.uploadFilter || "all";
    selectedUploadIds.clear();
    setBulkStatus("");
    renderRows(applyUploadFilters());
  });
});
uploadSearchInput?.addEventListener("input", () => {
  selectedUploadIds.clear();
  setBulkStatus("");
  renderRows(applyUploadFilters());
});
selectAllUploads?.addEventListener("change", () => {
  historyBody.querySelectorAll("[data-select-upload]").forEach((checkbox) => {
    checkbox.checked = selectAllUploads.checked;
    if (checkbox.checked) selectedUploadIds.add(checkbox.dataset.selectUpload);
    else selectedUploadIds.delete(checkbox.dataset.selectUpload);
  });
  setBulkStatus("");
  updateBulkControls();
});
archiveSelectedButton?.addEventListener("click", () => runBulkUploadAction("archive"));
reprocessSelectedButton?.addEventListener("click", () => runBulkUploadAction("reprocess"));
bulkImportSelectedButton?.addEventListener("click", () => runBulkTemplateImport());
removeSelectedButton?.addEventListener("click", () => runBulkUploadAction("remove"));
closeUploadDrawerButton?.addEventListener("click", () => uploadDrawer?.classList.add("hidden"));
closeReprocessDrawerButton?.addEventListener("click", () => reprocessDrawer?.classList.add("hidden"));
reprocessForm?.addEventListener("submit", runReprocessWithNote);
document.addEventListener("click", async (event) => {
  const retryButton = event.target.closest("[data-retry-action]");
  if (!retryButton) return;
  if (retryButton.dataset.retryAction === "load-upload-history") await loadHistory();
  if (retryButton.dataset.retryAction === "clear-upload-filters") await clearUploadFilters();
});
reprocessDrawer?.addEventListener("click", (event) => {
  const templateButton = event.target.closest("[data-correction-template]");
  if (!templateButton || !reprocessNoteInput) return;
  const template = templateButton.dataset.correctionTemplate || "";
  reprocessNoteInput.value = [reprocessNoteInput.value.trim(), template].filter(Boolean).join("\n");
  reprocessNoteInput.focus();
});
uploadDetail?.addEventListener("click", async (event) => {
  const reprocessNoteButton = event.target.closest("[data-reprocess-note-id]");
  if (reprocessNoteButton) {
    openReprocessDrawer([reprocessNoteButton.dataset.reprocessNoteId], {
      note: reprocessNoteButton.dataset.reprocessNote || ""
    });
    return;
  }

  const sourceButton = event.target.closest("[data-source-id]");
  if (sourceButton) {
    await openUploadSource(sourceButton.dataset.sourceId, sourceButton);
    return;
  }

  const bulkImportButton = event.target.closest("[data-bulk-import-id]");
  if (bulkImportButton) {
    await runBulkTemplateImport([bulkImportButton.dataset.bulkImportId], bulkImportButton);
    return;
  }

  const interpretButton = event.target.closest("[data-interpret-id]");
  if (!interpretButton) return;
  openReprocessDrawer([interpretButton.dataset.interpretId]);
});
historyBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-upload]");
  if (!checkbox) return;
  if (checkbox.checked) selectedUploadIds.add(checkbox.dataset.selectUpload);
  else selectedUploadIds.delete(checkbox.dataset.selectUpload);
  setBulkStatus("");
  updateBulkControls();
});
historyBody.addEventListener("click", async (event) => {
  const detailButton = event.target.closest("[data-upload-detail]");
  if (detailButton) {
    openUploadDrawer(detailButton.dataset.uploadDetail);
    return;
  }

  const sourceButton = event.target.closest("[data-source-id]");
  if (sourceButton) {
    await openUploadSource(sourceButton.dataset.sourceId, sourceButton);
    return;
  }

  const interpretButton = event.target.closest("[data-interpret-id]");
  const bulkImportButton = event.target.closest("[data-bulk-import-id]");
  const archiveButton = event.target.closest("[data-archive-id]");
  const removeButton = event.target.closest("[data-remove-id]");
  const button = interpretButton || bulkImportButton || archiveButton || removeButton;
  if (!button) return;

  button.disabled = true;
  const rowId = interpretButton?.dataset.interpretId || bulkImportButton?.dataset.bulkImportId || archiveButton?.dataset.archiveId || removeButton?.dataset.removeId;
  const status = historyBody.querySelector(`[data-upload-status="${CSS.escape(rowId)}"]`);

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState(UPLOAD_ACTION_SELECTOR, "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }

    if (interpretButton) {
      button.disabled = false;
      openReprocessDrawer([rowId]);
      return;
    }

    if (bulkImportButton) {
      button.disabled = false;
      await runBulkTemplateImport([rowId], button);
      return;
    }

    if (archiveButton) {
      button.textContent = "Archiving...";
      await archiveUpload(rowId);
      if (status) {
        status.textContent = "Archived";
        status.dataset.tone = "success";
      }
      await loadHistory();
      return;
    }

    if (removeButton) {
      const confirmed = window.confirm("Remove this upload version and its staged rows? This cannot be undone.");
      if (!confirmed) {
        button.disabled = false;
        return;
      }
      button.textContent = "Removing...";
      await removeUpload(rowId);
      await loadHistory();
    }
  } catch (error) {
    button.textContent = "Failed";
    button.title = humanizeError(error);
    button.insertAdjacentHTML("afterend", `<small class="error-detail">${escapeHtml(humanizeError(error))}</small>`);
  }
});

loadHistory();
