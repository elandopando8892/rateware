import { initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchApprovedRateware, returnApprovedRatesToStaging } from "./rateware-service.js";

const body = document.querySelector("#rateware-body");
const searchInput = document.querySelector("#rateware-search");
const operationFilter = document.querySelector("#rateware-operation-filter");
const serviceFilter = document.querySelector("#rateware-service-filter");
const refreshButton = document.querySelector("#refresh-rateware-button");
const selectAllCheckbox = document.querySelector("#select-all-rateware");
const selectionCount = document.querySelector("#rateware-selection-count");
const returnSelectedButton = document.querySelector("#return-selected-button");
const actionStatus = document.querySelector("#rateware-action-status");

let currentRows = [];
const selectedRowIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function compactLocation(row, prefix) {
  const market = row[`${prefix}_market`];
  const zip = row[`${prefix}_zip_prefix`];
  const state = row[`${prefix}_state`];
  const normalized = row[`normalized_${prefix}`];
  const raw = row[prefix];
  return `
    <strong>${escapeHtml(normalized || raw || "-")}</strong>
    <span>${escapeHtml([market, zip, state].filter(Boolean).join(" | "))}</span>
  `;
}

function borderValue(row) {
  return [row.mx_border_crossing_point, row.us_border_crossing_point].filter(Boolean).join(" / ") || "-";
}

function populateFilter(select, rows, field) {
  const selected = select.value;
  const values = Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">All</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(selected)) select.value = selected;
}

function renderRows(rows) {
  currentRows = rows;
  populateFilter(operationFilter, rows, "operation");
  populateFilter(serviceFilter, rows, "service");

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="14"><div class="empty-state"><strong>No approved rates yet</strong><span>Approve staging rows to build the Rateware.</span><a href="./staging-review.html">Open staging review</a></div></td></tr>';
    updateBulkControls();
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr data-rateware-id="${escapeHtml(row.id)}">
      <td class="select-column">
        <input data-select-rateware="${escapeHtml(row.id)}" type="checkbox" aria-label="Select approved rate" ${selectedRowIds.has(row.id) ? "checked" : ""} />
      </td>
      <td>
        <strong>${escapeHtml(row.vendors?.vendor_name || row.vendor_domain || "-")}</strong>
        <span>${escapeHtml(row.vendor_domain || row.vendors?.domain || "")}</span>
      </td>
      <td>${escapeHtml(dateValue(row.quote_date))}</td>
      <td>${escapeHtml(row.rfx_id || "-")}</td>
      <td class="rateware-location-cell">${compactLocation(row, "origin")}</td>
      <td class="rateware-location-cell">${compactLocation(row, "destination")}</td>
      <td>${escapeHtml(row.operation || "-")}</td>
      <td>${escapeHtml(row.service || "-")}</td>
      <td>${escapeHtml([row.equipment, row.trailer, row.config].filter(Boolean).join(" / ") || "-")}</td>
      <td><strong>${escapeHtml(moneyValue(row.all_in_rate))}</strong></td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td>${escapeHtml(row.weekly_capacity || "-")}</td>
      <td>${escapeHtml(borderValue(row))}</td>
      <td>
        <a class="link-button" href="./staging-review.html">Staging row</a>
      </td>
    </tr>
  `).join("");
  updateBulkControls();
}

function selectedVisibleIds() {
  return [...body.querySelectorAll("[data-select-rateware]:checked")].map((input) => input.dataset.selectRateware);
}

function setActionStatus(message, tone = "neutral") {
  actionStatus.textContent = message;
  actionStatus.dataset.tone = tone;
}

function updateBulkControls() {
  const selectedCount = selectedVisibleIds().length;
  const totalRows = body.querySelectorAll("[data-rateware-id]").length;
  selectionCount.textContent = `${selectedCount} selected`;
  returnSelectedButton.disabled = selectedCount === 0;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalRows;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
}

async function loadRateware() {
  body.innerHTML = '<tr><td colspan="14">Loading approved rates...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchApprovedRateware({
      search: searchInput.value,
      operation: operationFilter.value,
      service: serviceFilter.value
    });
    renderRows(rows);
  } catch (error) {
    body.innerHTML = `<tr><td colspan="14">Could not load Rateware. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function returnSelectedToStaging() {
  const ids = selectedVisibleIds();
  if (!ids.length) return;

  returnSelectedButton.disabled = true;
  setActionStatus(`Returning ${ids.length} rates...`);

  try {
    await requirePrivatePage();
    const result = await returnApprovedRatesToStaging(ids);
    ids.forEach((id) => selectedRowIds.delete(id));
    setActionStatus(`${result.updated || ids.length} rates returned to staging.`, "success");
    await loadRateware();
  } catch (error) {
    setActionStatus(error.message, "error");
    updateBulkControls();
  }
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

initAuthControls();
requirePrivatePage().catch(() => {});
loadRateware();

refreshButton.addEventListener("click", loadRateware);
searchInput.addEventListener("input", debounce(loadRateware));
operationFilter.addEventListener("change", loadRateware);
serviceFilter.addEventListener("change", loadRateware);
returnSelectedButton.addEventListener("click", returnSelectedToStaging);
selectAllCheckbox?.addEventListener("change", () => {
  body.querySelectorAll("[data-select-rateware]").forEach((checkbox) => {
    checkbox.checked = selectAllCheckbox.checked;
    if (checkbox.checked) selectedRowIds.add(checkbox.dataset.selectRateware);
    else selectedRowIds.delete(checkbox.dataset.selectRateware);
  });
  setActionStatus("");
  updateBulkControls();
});
body.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-rateware]");
  if (!checkbox) return;
  if (checkbox.checked) selectedRowIds.add(checkbox.dataset.selectRateware);
  else selectedRowIds.delete(checkbox.dataset.selectRateware);
  setActionStatus("");
  updateBulkControls();
});
