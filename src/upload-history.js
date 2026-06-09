import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { archiveUpload, fetchUploadHistory, interpretUpload, removeUpload } from "./upload-service.js";

const historyBody = document.querySelector("#history-body");
const refreshButton = document.querySelector("#refresh-button");
const statusFilter = document.querySelector("#status-filter");

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

function renderRows(rows) {
  if (!rows.length) {
    historyBody.innerHTML =
      '<tr><td colspan="8"><div class="empty-state"><strong>No uploads yet</strong><span>Upload carrier source files before running interpretation.</span><a href="./upload-center.html">Upload source files</a></div></td></tr>';
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
          </td>
          <td>${escapeHtml(row.rfx_hint || "")}</td>
          <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
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
    renderRows(rows);
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
statusFilter.addEventListener("change", loadHistory);
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
