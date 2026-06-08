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
const STAGING_COLSPAN = 25;

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

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function inputCell(row, field, options = {}) {
  const widthClass = options.wide ? "wide-input" : options.money ? "money-input" : options.short ? "short-input" : "";
  const value = field === "confidence"
    ? Math.round(Number(row[field] || 0) * 100)
    : field === "quote_date"
      ? dateValue(row[field])
      : row[field] || "";
  return `<input class="staging-input ${widthClass}" data-field="${field}" type="${options.type || "text"}" value="${escapeHtml(value)}" ${options.min ? `min="${escapeHtml(options.min)}"` : ""} ${options.max ? `max="${escapeHtml(options.max)}"` : ""} ${options.step ? `step="${escapeHtml(options.step)}"` : ""} />`;
}

function statusSelect(row) {
  const status = row.status || "pending_review";
  return `
    <select class="staging-input short-input" data-field="status">
      <option value="pending_review" ${status === "pending_review" ? "selected" : ""}>pending</option>
      <option value="approved" ${status === "approved" ? "selected" : ""}>approved</option>
      <option value="rejected" ${status === "rejected" ? "selected" : ""}>rejected</option>
    </select>
  `;
}

function renderRows(rows) {
  currentRows = rows;

  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="${STAGING_COLSPAN}"><div class="empty-state"><strong>No staging rows found</strong><span>Interpret uploaded quotes to create rows for review.</span><a href="./upload-history.html">Open upload history</a></div></td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr data-row-id="${escapeHtml(row.id)}">
          <td class="vendor-review-cell">
            ${row.vendors?.vendor_name ? `<strong>${escapeHtml(row.vendors.vendor_name)}</strong>` : ""}
            ${inputCell(row, "vendor_domain", { wide: true })}
            ${row.vendors?.vendor_name ? '<span class="match-pill">Matched</span>' : ""}
          </td>
          <td>${inputCell(row, "quote_date", { type: "date", short: true })}</td>
          <td>${inputCell(row, "rfx_id", { short: true })}</td>
          <td>${inputCell(row, "origin", { wide: true })}</td>
          <td>${inputCell(row, "destination", { wide: true })}</td>
          <td>${inputCell(row, "equipment", { short: true })}</td>
          <td>${inputCell(row, "trailer", { short: true })}</td>
          <td>${inputCell(row, "config", { short: true })}</td>
          <td>${inputCell(row, "operation", { short: true })}</td>
          <td>${inputCell(row, "service", { short: true })}</td>
          <td>${inputCell(row, "driver", { short: true })}</td>
          <td>${inputCell(row, "mx_border_crossing_point", { short: true })}</td>
          <td>${inputCell(row, "us_border_crossing_point", { short: true })}</td>
          <td>${inputCell(row, "mx_linehaul", { money: true })}</td>
          <td>${inputCell(row, "us_linehaul", { money: true })}</td>
          <td>${inputCell(row, "us_miles", { money: true })}</td>
          <td>${inputCell(row, "fsc", { money: true })}</td>
          <td>${inputCell(row, "fuel", { money: true })}</td>
          <td>${inputCell(row, "border_crossing_fee", { money: true })}</td>
          <td>${inputCell(row, "flat_rate", { money: true })}</td>
          <td>${inputCell(row, "all_in_rate", { money: true })}</td>
          <td>${inputCell(row, "currency", { short: true })}</td>
          <td>${inputCell(row, "weekly_capacity", { short: true })}</td>
          <td>${inputCell(row, "confidence", { type: "number", min: "0", max: "100", step: "1", short: true })}</td>
          <td>${statusSelect(row)}</td>
          <td class="review-actions">
            <button type="button" class="small-button secondary" data-save-id="${escapeHtml(row.id)}">Save</button>
            <button type="button" class="small-button" data-approve-id="${escapeHtml(row.id)}">Approve</button>
            <button type="button" class="small-button danger" data-reject-id="${escapeHtml(row.id)}">Reject</button>
            <span class="row-save-status" data-row-status="${escapeHtml(row.id)}"></span>
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
  document.querySelector("#edit-quote-date").value = dateValue(row.quote_date);
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

function readInlinePatch(tableRow, status = null) {
  const patch = {};
  tableRow.querySelectorAll("[data-field]").forEach((input) => {
    patch[input.dataset.field] = input.value;
  });
  patch.confidence = Number(patch.confidence || 0) / 100;
  if (status) patch.status = status;
  return patch;
}

function setRowStatus(id, message, tone = "neutral") {
  const status = body.querySelector(`[data-row-status="${CSS.escape(id)}"]`);
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function readPatch(status = null) {
  const trailerConfig = document.querySelector("#edit-trailer-config").value.split("/");
  const patch = {
    vendor_domain: document.querySelector("#edit-vendor-domain").value,
    rfx_id: document.querySelector("#edit-rfx-id").value,
    quote_date: document.querySelector("#edit-quote-date").value,
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
  body.innerHTML = `<tr><td colspan="${STAGING_COLSPAN}">Loading staging rows...</td></tr>`;
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    renderRows(await fetchStagingRows({ status: statusFilter.value }));
    await applyPermissionState("[data-save-id], [data-approve-id], [data-reject-id], #save-staging-button, #approve-staging-button, #reject-staging-button", "staging:approve");
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${STAGING_COLSPAN}">Could not load staging rows. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

body.addEventListener("click", async (event) => {
  const save = event.target.closest("[data-save-id]");
  const approve = event.target.closest("[data-approve-id]");
  const reject = event.target.closest("[data-reject-id]");

  if (save) {
    const id = save.dataset.saveId;
    const tableRow = save.closest("[data-row-id]");
    if (!tableRow) return;
    save.disabled = true;
    setRowStatus(id, "Saving...");

    try {
      await ensureSignedIn();
      await updateStagingRow(id, readInlinePatch(tableRow));
      setRowStatus(id, "Saved", "success");
    } catch (error) {
      setRowStatus(id, error.message, "error");
    } finally {
      save.disabled = false;
    }
    return;
  }

  const id = approve?.dataset.approveId || reject?.dataset.rejectId;
  if (!id) return;

  const button = approve || reject;
  const tableRow = button.closest("[data-row-id]");
  button.disabled = true;
  setRowStatus(id, approve ? "Approving..." : "Rejecting...");

  try {
    await ensureSignedIn();
    if (!(await applyPermissionState("[data-approve-id], [data-reject-id]", "staging:approve"))) {
      throw new Error("Your role does not allow staging approval.");
    }
    await updateStagingRow(id, tableRow ? readInlinePatch(tableRow, approve ? "approved" : "rejected") : { status: approve ? "approved" : "rejected" });
    await loadRows();
  } catch (error) {
    button.disabled = false;
    setRowStatus(id, error.message, "error");
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
