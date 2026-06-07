import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchStagingRows, updateStagingRow } from "./staging-service.js";

const body = document.querySelector("#staging-body");
const refreshButton = document.querySelector("#refresh-staging-button");
const statusFilter = document.querySelector("#staging-status-filter");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lane(row) {
  return `${row.origin || ""} -> ${row.destination || ""}`.trim();
}

function renderRows(rows) {
  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="11"><div class="empty-state"><strong>No staging rows found</strong><span>Interpret uploaded quotes to create rows for review.</span><a href="./upload-history.html">Open upload history</a></div></td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.vendor_domain)}</td>
          <td>${escapeHtml(row.rfx_id)}</td>
          <td>${escapeHtml(lane(row))}</td>
          <td>${escapeHtml([row.equipment, row.trailer, row.config].filter(Boolean).join(" / "))}</td>
          <td>${escapeHtml([row.operation, row.service, row.driver].filter(Boolean).join(" / "))}</td>
          <td>${escapeHtml(row.all_in_rate)}</td>
          <td>${escapeHtml(row.currency)}</td>
          <td>${escapeHtml(row.weekly_capacity)}</td>
          <td>${Math.round(Number(row.confidence || 0) * 100)}%</td>
          <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
          <td class="review-actions">
            <button type="button" class="small-button" data-approve-id="${escapeHtml(row.id)}">Approve staging</button>
            <button type="button" class="small-button danger" data-reject-id="${escapeHtml(row.id)}">Reject</button>
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadRows() {
  body.innerHTML = '<tr><td colspan="11">Loading staging rows...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    renderRows(await fetchStagingRows({ status: statusFilter.value }));
    await applyPermissionState("[data-approve-id], [data-reject-id]", "staging:approve");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="11">Could not load staging rows. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

body.addEventListener("click", async (event) => {
  const approve = event.target.closest("[data-approve-id]");
  const reject = event.target.closest("[data-reject-id]");
  const id = approve?.dataset.approveId || reject?.dataset.rejectId;
  if (!id) return;

  const button = approve || reject;
  button.disabled = true;

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-approve-id], [data-reject-id]", "staging:approve"))) {
      throw new Error("Your role does not allow staging approval.");
    }
    await updateStagingRow(id, { status: approve ? "approved" : "rejected" });
    await loadRows();
  } catch (error) {
    button.disabled = false;
    button.title = error.message;
  }
});

refreshButton.addEventListener("click", loadRows);
statusFilter.addEventListener("change", loadRows);

initAuthControls();
requirePrivatePage().catch(() => {});
loadRows();
