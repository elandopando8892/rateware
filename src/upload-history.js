import { ensureSignedIn, initAuthControls } from "./auth.js";
import { fetchUploadHistory, interpretUpload } from "./upload-service.js";

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

function renderRows(rows) {
  if (!rows.length) {
    historyBody.innerHTML = '<tr><td colspan="8">No uploads found.</td></tr>';
    return;
  }

  historyBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(formatDate(row.created_at))}</td>
          <td>${escapeHtml(row.original_filename)}</td>
          <td>${escapeHtml(row.document_type)}</td>
          <td>${escapeHtml(row.vendor_hint || "")}</td>
          <td>${escapeHtml(row.rfx_hint || "")}</td>
          <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
          <td>${escapeHtml(row.storage_path)}</td>
          <td><button type="button" class="small-button" data-interpret-id="${escapeHtml(row.id)}">Interpret</button></td>
        </tr>
      `
    )
    .join("");
}

async function loadHistory() {
  historyBody.innerHTML = '<tr><td colspan="8">Loading uploads...</td></tr>';
  refreshButton.disabled = true;

  try {
    await ensureSignedIn();
    const rows = await fetchUploadHistory({ status: statusFilter.value });
    renderRows(rows);
  } catch (error) {
    historyBody.innerHTML = `<tr><td colspan="8">Could not load upload history. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

initAuthControls();
refreshButton.addEventListener("click", loadHistory);
statusFilter.addEventListener("change", loadHistory);
historyBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-interpret-id]");
  if (!button) return;

  button.disabled = true;
  button.textContent = "Interpreting...";

  try {
    await ensureSignedIn();
    const result = await interpretUpload(button.dataset.interpretId);
    button.textContent = `${result.staged_rows} staged`;
  } catch (error) {
    button.textContent = "Failed";
    button.title = error.message;
  }
});

loadHistory();
