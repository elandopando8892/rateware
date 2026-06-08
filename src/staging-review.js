import { applyPermissionState, ensureSignedIn, initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchStagingRows, updateStagingRow } from "./staging-service.js";

const body = document.querySelector("#staging-body");
const refreshButton = document.querySelector("#refresh-staging-button");
const statusFilter = document.querySelector("#staging-status-filter");
const drawer = document.querySelector("#staging-drawer");
const closeDrawerButton = document.querySelector("#close-staging-drawer");
const editForm = document.querySelector("#staging-edit-form");
const editStatus = document.querySelector("#staging-edit-status");
const approveDrawerButton = document.querySelector("#approve-staging-button");
const rejectDrawerButton = document.querySelector("#reject-staging-button");
let currentRows = [];
let activeRowId = null;

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
  currentRows = rows;

  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="11"><div class="empty-state"><strong>No staging rows found</strong><span>Interpret uploaded quotes to create rows for review.</span><a href="./upload-history.html">Open upload history</a></div></td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>
            ${escapeHtml(row.vendors?.vendor_name || row.vendor_domain)}
            ${row.vendors?.vendor_name ? '<span class="match-pill">Matched</span>' : ""}
          </td>
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
            <button type="button" class="small-button secondary" data-edit-id="${escapeHtml(row.id)}">Edit</button>
            <button type="button" class="small-button" data-approve-id="${escapeHtml(row.id)}">Approve staging</button>
            <button type="button" class="small-button danger" data-reject-id="${escapeHtml(row.id)}">Reject</button>
          </td>
        </tr>
      `
    )
    .join("");
}

function setStatus(message, tone = "neutral") {
  editStatus.textContent = message;
  editStatus.dataset.tone = tone;
}

function rowById(id) {
  return currentRows.find((row) => row.id === id);
}

function openEditDrawer(id) {
  const row = rowById(id);
  if (!row) return;

  activeRowId = id;
  document.querySelector("#staging-drawer-title").textContent = lane(row) || row.rfx_id || "Rate row";
  document.querySelector("#edit-vendor-domain").value = row.vendor_domain || row.vendors?.domain || "";
  document.querySelector("#edit-rfx-id").value = row.rfx_id || "";
  document.querySelector("#edit-origin").value = row.origin || "";
  document.querySelector("#edit-destination").value = row.destination || "";
  document.querySelector("#edit-equipment").value = row.equipment || "";
  document.querySelector("#edit-trailer-config").value = [row.trailer, row.config].filter(Boolean).join(" / ");
  document.querySelector("#edit-operation").value = row.operation || "";
  document.querySelector("#edit-service").value = row.service || "";
  document.querySelector("#edit-all-in-rate").value = row.all_in_rate || "";
  document.querySelector("#edit-currency").value = row.currency || "";
  document.querySelector("#edit-weekly-capacity").value = row.weekly_capacity || "";
  document.querySelector("#edit-confidence").value = Math.round(Number(row.confidence || 0) * 100);
  document.querySelector("#edit-notes").value = row.notes || "";
  setStatus("");
  drawer.classList.remove("hidden");
}

function readPatch(status = null) {
  const trailerConfig = document.querySelector("#edit-trailer-config").value.split("/");
  const patch = {
    vendor_domain: document.querySelector("#edit-vendor-domain").value,
    rfx_id: document.querySelector("#edit-rfx-id").value,
    origin: document.querySelector("#edit-origin").value,
    destination: document.querySelector("#edit-destination").value,
    equipment: document.querySelector("#edit-equipment").value,
    trailer: trailerConfig[0]?.trim() || "",
    config: trailerConfig.slice(1).join("/").trim(),
    operation: document.querySelector("#edit-operation").value,
    service: document.querySelector("#edit-service").value,
    all_in_rate: document.querySelector("#edit-all-in-rate").value,
    currency: document.querySelector("#edit-currency").value,
    weekly_capacity: document.querySelector("#edit-weekly-capacity").value,
    confidence: Number(document.querySelector("#edit-confidence").value || 0) / 100,
    notes: document.querySelector("#edit-notes").value
  };

  if (status) patch.status = status;
  return patch;
}

async function saveActiveRow(status = null) {
  if (!activeRowId) return;
  setStatus(status ? `Saving and marking ${status}...` : "Saving changes...");

  try {
    await ensureSignedIn();
    await updateStagingRow(activeRowId, readPatch(status));
    setStatus(status ? `Row marked ${status}.` : "Changes saved.", "success");
    await loadRows();
    if (status) drawer.classList.add("hidden");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadRows() {
  body.innerHTML = '<tr><td colspan="11">Loading staging rows...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    renderRows(await fetchStagingRows({ status: statusFilter.value }));
    await applyPermissionState("[data-edit-id], [data-approve-id], [data-reject-id], #save-staging-button, #approve-staging-button, #reject-staging-button", "staging:approve");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="11">Could not load staging rows. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

body.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-id]");
  const approve = event.target.closest("[data-approve-id]");
  const reject = event.target.closest("[data-reject-id]");

  if (edit) {
    openEditDrawer(edit.dataset.editId);
    return;
  }

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
closeDrawerButton.addEventListener("click", () => drawer.classList.add("hidden"));
editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveActiveRow();
});
approveDrawerButton.addEventListener("click", () => saveActiveRow("approved"));
rejectDrawerButton.addEventListener("click", () => saveActiveRow("rejected"));

initAuthControls();
requirePrivatePage().catch(() => {});
loadRows();
