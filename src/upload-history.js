import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { archiveUpload, fetchUploadHistory, interpretUpload, removeUpload } from "./upload-service.js";

const historyBody = document.querySelector("#history-body");
const refreshButton = document.querySelector("#refresh-button");
const statusFilter = document.querySelector("#status-filter");
const uploadMetricVisible = document.querySelector("#upload-metric-visible");
const uploadMetricStaged = document.querySelector("#upload-metric-staged");
const uploadMetricFailed = document.querySelector("#upload-metric-failed");
const uploadMetricArchived = document.querySelector("#upload-metric-archived");
const quickFilterButtons = document.querySelectorAll("[data-upload-filter]");
let loadedRows = [];
let activeQuickFilter = "all";

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
  uploadMetricArchived.textContent = String(rows.filter((row) => row.status === "archived").length);
}

function statusTone(status) {
  if (status === "failed") return "danger";
  if (status === "staged") return "success";
  if (status === "archived") return "muted";
  return "neutral";
}

function uploadQualityChips(row) {
  const chips = [];
  chips.push({ tone: statusTone(row.status), label: row.status || "unknown" });
  if (!row.vendors?.vendor_name && !row.vendor_hint) chips.push({ tone: "warning", label: "No vendor hint" });
  if (!row.rfx_hint) chips.push({ tone: "muted", label: "No RFx" });
  if (row.error_message) chips.push({ tone: "danger", label: "Needs attention" });
  return `<div class="row-review-chips">${chips
    .map((chip) => `<span class="review-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`)
    .join("")}</div>`;
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
  updateQuickFilters();
  updateUploadMetrics(rows);

  if (!rows.length) {
    const empty = emptyUploadMessage();
    historyBody.innerHTML =
      `<tr><td colspan="8"><div class="empty-state"><strong>${escapeHtml(empty.title)}</strong><span>${escapeHtml(empty.detail)}</span><a href="./upload-center.html">Upload source files</a></div></td></tr>`;
    return;
  }

  historyBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
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
          <td>${escapeHtml(row.storage_path)}</td>
          <td class="history-actions">
            ${row.status === "archived" ? "" : `<button type="button" class="small-button" data-interpret-id="${escapeHtml(row.id)}">Interpret</button>`}
            ${row.status === "archived" ? "" : `<button type="button" class="small-button secondary" data-archive-id="${escapeHtml(row.id)}">Archive</button>`}
            <button type="button" class="small-button danger" data-remove-id="${escapeHtml(row.id)}">Remove</button>
            ${row.error_message ? `<small class="error-detail">${escapeHtml(row.error_message)}</small>` : ""}
            <small class="row-save-status" data-upload-status="${escapeHtml(row.id)}"></small>
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadHistory() {
  historyBody.innerHTML = '<tr><td colspan="8">Loading uploads...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchUploadHistory({ status: statusFilter.value });
    loadedRows = rows;
    renderRows(applyQuickFilter(rows));
    await applyPermissionState("[data-interpret-id], [data-archive-id], [data-remove-id]", "uploads:interpret");
  } catch (error) {
    historyBody.innerHTML = `<tr><td colspan="8">Could not load upload history. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

initAuthControls();
requirePrivatePage().catch(() => {});
refreshButton.addEventListener("click", loadHistory);
statusFilter.addEventListener("change", () => {
  activeQuickFilter = "all";
  loadHistory();
});
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeQuickFilter = button.dataset.uploadFilter || "all";
    renderRows(applyQuickFilter());
  });
});
historyBody.addEventListener("click", async (event) => {
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
