import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { archiveUpload, fetchUploadHistory, interpretUpload, removeUpload } from "./upload-service.js";

const historyBody = document.querySelector("#history-body");
const refreshButton = document.querySelector("#refresh-button");
const clearFiltersButton = document.querySelector("#clear-upload-filters");
const statusFilter = document.querySelector("#status-filter");
const uploadMetricVisible = document.querySelector("#upload-metric-visible");
const uploadMetricStaged = document.querySelector("#upload-metric-staged");
const uploadMetricFailed = document.querySelector("#upload-metric-failed");
const uploadMetricNeedsAudit = document.querySelector("#upload-metric-needs-audit");
const quickFilterButtons = document.querySelectorAll("[data-upload-filter]");
const selectAllUploads = document.querySelector("#select-all-uploads");
const uploadSelectionCount = document.querySelector("#upload-selection-count");
const reprocessSelectedButton = document.querySelector("#reprocess-selected-uploads");
const archiveSelectedButton = document.querySelector("#archive-selected-uploads");
const removeSelectedButton = document.querySelector("#remove-selected-uploads");
const uploadBulkStatus = document.querySelector("#upload-bulk-status");
const uploadDrawer = document.querySelector("#upload-drawer");
const closeUploadDrawerButton = document.querySelector("#close-upload-drawer");
const uploadDrawerTitle = document.querySelector("#upload-drawer-title");
const uploadDetail = document.querySelector("#upload-detail");
let loadedRows = [];
let currentRows = [];
let activeQuickFilter = "all";
const selectedUploadIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function applyQuickFilter(rows = loadedRows) {
  if (activeQuickFilter === "needs-interpretation") return rows.filter((row) => row.status === "uploaded");
  if (activeQuickFilter === "needs-audit") return rows.filter((row) => auditStatus(row) === "needs_review" || auditStatus(row) === "repaired");
  if (activeQuickFilter === "failed") return rows.filter((row) => row.status === "failed");
  if (activeQuickFilter === "pdf") return rows.filter((row) => documentType(row) === "pdf");
  if (activeQuickFilter === "spreadsheet") return rows.filter((row) => ["xlsx", "xls", "csv", "spreadsheet"].includes(documentType(row)));
  if (activeQuickFilter === "image") return rows.filter((row) => ["image", "png", "jpg", "jpeg", "webp"].includes(documentType(row)));
  return rows;
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
  uploadMetricNeedsAudit.textContent = String(rows.filter((row) => auditStatus(row) === "needs_review" || auditStatus(row) === "repaired").length);
}

function selectedVisibleIds() {
  return [...historyBody.querySelectorAll("[data-select-upload]:checked")].map((input) => input.dataset.selectUpload);
}

function setBulkStatus(message, tone = "neutral") {
  uploadBulkStatus.textContent = message;
  uploadBulkStatus.dataset.tone = tone;
}

function updateBulkControls() {
  const selectedCount = selectedVisibleIds().length;
  const totalRows = historyBody.querySelectorAll("[data-upload-id]").length;
  uploadSelectionCount.textContent = `${selectedCount} selected`;
  reprocessSelectedButton.disabled = selectedCount === 0;
  archiveSelectedButton.disabled = selectedCount === 0;
  removeSelectedButton.disabled = selectedCount === 0;
  if (selectAllUploads) {
    selectAllUploads.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllUploads.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
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
  const expected = row.expected_rate_rows ?? auditPayload(row).expected_rate_rows ?? "";
  const interpreted = row.interpreted_rate_rows ?? auditPayload(row).interpreted_rate_rows ?? "";
  if (!expected && !interpreted) return "";
  return `${interpreted || 0}/${expected || interpreted || 0} rows`;
}

function renderAuditSummary(row) {
  const status = auditStatus(row);
  const rowsLabel = auditRowsLabel(row);
  const warnings = auditWarnings(row);
  return `
    <div class="audit-summary">
      <span class="review-chip ${escapeHtml(auditTone(status))}">${escapeHtml(auditLabel(status))}</span>
      ${rowsLabel ? `<small>${escapeHtml(rowsLabel)}</small>` : ""}
      ${warnings.length ? `<small>${escapeHtml(warnings.length)} warning${warnings.length === 1 ? "" : "s"}</small>` : ""}
    </div>
  `;
}

function uploadQualityChips(row) {
  const chips = [];
  chips.push({ tone: statusTone(row.status), label: row.status || "unknown" });
  if (auditStatus(row) === "needs_review") chips.push({ tone: "danger", label: "Audit needed" });
  if (auditStatus(row) === "repaired") chips.push({ tone: "warning", label: "Repaired" });
  if (!row.vendors?.vendor_name && !row.vendor_hint) chips.push({ tone: "warning", label: "No vendor hint" });
  if (!row.rfx_hint) chips.push({ tone: "muted", label: "No RFx" });
  if (row.error_message) chips.push({ tone: "danger", label: "Needs attention" });
  return `<div class="row-review-chips">${chips
    .map((chip) => `<span class="review-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`)
    .join("")}</div>`;
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
      <dl>
        ${detailItem("First pass rows", auditPayload(row).first_pass_rows)}
        ${detailItem("Audit pass", auditPayload(row).audit_pass_used ? "yes" : "no")}
        ${detailItem("Audit pass rows", auditPayload(row).audit_pass_rows)}
        ${detailItem("Deterministic repair", auditPayload(row).deterministic_repair_used ? "yes" : "no")}
        ${detailItem("Sparse table risk", auditPayload(row).sparse_table_risk ? "yes" : "no")}
      </dl>
      ${warningList(auditWarnings(row).slice(0, 12))}
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
            <p>${escapeHtml(row.error_message)}</p>
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
      <a class="small-button" href="./staging-review.html">Open staging</a>
    </section>
  `;
  uploadDrawer.classList.remove("hidden");
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
      `<tr><td colspan="10"><div class="empty-state"><strong>${escapeHtml(empty.title)}</strong><span>${escapeHtml(empty.detail)}</span><a href="./upload-center.html">Upload source files</a></div></td></tr>`;
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
          <td>${escapeHtml(row.original_filename)}</td>
          <td>${escapeHtml(row.document_type)}</td>
          <td>
            ${escapeHtml(row.vendors?.vendor_name || row.vendor_hint || "")}
            ${row.vendors?.vendor_name ? matchLabel(row) : ""}
            ${uploadQualityChips(row)}
          </td>
          <td>${escapeHtml(row.rfx_hint || "")}</td>
          <td><span class="status-pill ${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status)}</span></td>
          <td>${renderAuditSummary(row)}</td>
          <td>${escapeHtml(row.storage_path)}</td>
          <td class="history-actions">
            <button type="button" class="small-button secondary" data-upload-detail="${escapeHtml(row.id)}">Details</button>
            ${row.status === "archived" ? "" : `<button type="button" class="small-button" data-interpret-id="${escapeHtml(row.id)}">${row.status === "uploaded" ? "Interpret" : "Reprocess"}</button>`}
            ${row.status === "archived" ? "" : `<button type="button" class="small-button secondary" data-archive-id="${escapeHtml(row.id)}">Archive</button>`}
            <button type="button" class="small-button danger" data-remove-id="${escapeHtml(row.id)}">Remove</button>
            ${row.error_message ? `<small class="error-detail">${escapeHtml(row.error_message)}</small>` : ""}
            <small class="row-save-status" data-upload-status="${escapeHtml(row.id)}"></small>
          </td>
        </tr>
      `
    )
    .join("");
  updateBulkControls();
}

async function loadHistory() {
  historyBody.innerHTML = '<tr><td colspan="10">Loading uploads...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchUploadHistory({ status: statusFilter.value });
    loadedRows = rows;
    renderRows(applyQuickFilter(rows));
    await applyPermissionState("[data-interpret-id], [data-archive-id], [data-remove-id], #reprocess-selected-uploads, #archive-selected-uploads, #remove-selected-uploads", "uploads:interpret");
  } catch (error) {
    historyBody.innerHTML = `<tr><td colspan="10">Could not load upload history. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function runBulkUploadAction(action) {
  const ids = selectedVisibleIds();
  if (!ids.length) return;
  if (action === "remove") {
    const confirmed = window.confirm(`Remove ${ids.length} upload version(s) and their staged rows? This cannot be undone.`);
    if (!confirmed) return;
  }

  archiveSelectedButton.disabled = true;
  reprocessSelectedButton.disabled = true;
  removeSelectedButton.disabled = true;
  setBulkStatus(`${action === "archive" ? "Archiving" : action === "reprocess" ? "Reprocessing" : "Removing"} ${ids.length} upload(s)...`);

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-interpret-id], [data-archive-id], [data-remove-id], #reprocess-selected-uploads, #archive-selected-uploads, #remove-selected-uploads", "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }
    if (action === "reprocess") {
      for (let index = 0; index < ids.length; index += 1) {
        setBulkStatus(`Reprocessing ${index + 1}/${ids.length}...`);
        await interpretUpload(ids[index]);
      }
    } else {
      const fn = action === "archive" ? archiveUpload : removeUpload;
      await Promise.all(ids.map((id) => fn(id)));
    }
    ids.forEach((id) => selectedUploadIds.delete(id));
    setBulkStatus(`${ids.length} upload(s) ${action === "archive" ? "archived" : action === "reprocess" ? "reprocessed" : "removed"}.`, "success");
    await loadHistory();
  } catch (error) {
    setBulkStatus(error.message, "error");
    updateBulkControls();
  }
}

async function clearUploadFilters() {
  statusFilter.value = "current";
  activeQuickFilter = "all";
  selectedUploadIds.clear();
  uploadDrawer?.classList.add("hidden");
  setBulkStatus("");
  await loadHistory();
}

initAuthControls();
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
    renderRows(applyQuickFilter());
  });
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
removeSelectedButton?.addEventListener("click", () => runBulkUploadAction("remove"));
closeUploadDrawerButton?.addEventListener("click", () => uploadDrawer?.classList.add("hidden"));
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

  const interpretButton = event.target.closest("[data-interpret-id]");
  const archiveButton = event.target.closest("[data-archive-id]");
  const removeButton = event.target.closest("[data-remove-id]");
  const button = interpretButton || archiveButton || removeButton;
  if (!button) return;

  button.disabled = true;
  const rowId = interpretButton?.dataset.interpretId || archiveButton?.dataset.archiveId || removeButton?.dataset.removeId;
  const status = historyBody.querySelector(`[data-upload-status="${CSS.escape(rowId)}"]`);

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-interpret-id], [data-archive-id], [data-remove-id]", "uploads:interpret"))) {
      throw new Error("Your role does not allow upload actions.");
    }

    if (interpretButton) {
      button.textContent = "Interpreting...";
      const result = await interpretUpload(rowId);
      button.textContent = `${result.staged_rows} staged`;
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
    button.title = error.message;
    button.insertAdjacentHTML("afterend", `<small class="error-detail">${escapeHtml(error.message)}</small>`);
  }
});

loadHistory();
