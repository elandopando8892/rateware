import { initAuthControls, requirePrivatePage } from "./auth.js";
import { syncRatewareCatalog } from "./catalog-service.js";
import { fetchApprovedRateware, updateApprovedRatewareRow } from "./rateware-service.js";
import { fetchStagingOptions, fetchStagingRows, updateStagingRow } from "./staging-service.js";

const rowsChecked = document.querySelector("#catalog-rows-checked");
const gapCount = document.querySelector("#catalog-gap-count");
const pendingCount = document.querySelector("#catalog-pending-count");
const approvedCount = document.querySelector("#catalog-approved-count");
const body = document.querySelector("#catalog-workbench-body");
const statusMessage = document.querySelector("#catalog-workbench-status");
const sideFilter = document.querySelector("#catalog-side-filter");
const statusFilter = document.querySelector("#catalog-status-filter");
const searchInput = document.querySelector("#catalog-search");
const refreshButton = document.querySelector("#refresh-catalog-workbench");
const syncButton = document.querySelector("#sync-catalog-button");

let loadedRows = [];
let locationOptions = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function rowStatus(row) {
  return row.status === "approved" ? "approved" : "pending_review";
}

function vendorLabel(row) {
  return row.vendors?.vendor_name || row.vendor_domain || row.vendors?.domain || "-";
}

function laneLabel(row) {
  return `${row.normalized_origin || row.origin || "-"} -> ${row.normalized_destination || row.destination || "-"}`;
}

function country(row, side) {
  return String(row[`${side}_country`] || "").toUpperCase();
}

function locationResolved(row, side) {
  const countryCode = country(row, side);
  if (countryCode === "MX") {
    return Boolean(row[`${side}_state`] && (row[`${side}_market`] || row[`${side}_region`]) && (row[`${side}_city`] || row[`normalized_${side}`] || row[side]));
  }
  if (countryCode === "US" || countryCode === "CA") {
    return Boolean(row[`${side}_zip_prefix`] && row[`${side}_state`] && row[`${side}_market`] && row[`${side}_region`]);
  }
  return Boolean(row[`${side}_market`] && row[`${side}_state`]);
}

function gapReason(row, side) {
  const countryCode = country(row, side) || "unknown";
  const missing = [];
  if (!row[`${side}_state`]) missing.push("state");
  if (!row[`${side}_market`]) missing.push("market");
  if (!row[`${side}_region`]) missing.push("region");
  if ((countryCode === "US" || countryCode === "CA") && !row[`${side}_zip_prefix`]) missing.push("ZIP prefix");
  if (countryCode === "MX" && !row[`${side}_city`] && !row[`normalized_${side}`]) missing.push("metro/city");
  return missing.length ? `Missing ${missing.join(", ")}` : row[`${side}_match_reason`] || "Needs stronger match";
}

function currentMatchLabel(row, side) {
  return [
    row[`normalized_${side}`] || row[side],
    row[`${side}_zip_prefix`],
    row[`${side}_state`],
    row[`${side}_market`],
    row[`${side}_region`]
  ].filter(Boolean).join(" | ") || "-";
}

function locationValue(option) {
  if (option.value) return option.value;
  return [
    option.metro_city || option.city || option.raw_value,
    option.state_code || option.state_name,
    option.country
  ].filter(Boolean).join(", ");
}

function locationLabel(option) {
  if (option.label) return option.label;
  return [
    option.zip_prefix,
    option.market,
    option.region,
    option.source
  ].filter(Boolean).join(" | ");
}

function locationSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestLocationCandidate(row, side) {
  const raw = locationSearchKey([row[side], row[`normalized_${side}`], row[`${side}_city`], row[`${side}_state`], row[`${side}_zip_prefix`]].filter(Boolean).join(" "));
  if (!raw) return null;
  const countryCode = country(row, side);
  const scored = locationOptions
    .filter((option) => !countryCode || String(option.country || "").toUpperCase() === countryCode)
    .map((option) => {
      const candidates = [
        locationValue(option),
        locationLabel(option),
        option.raw_value,
        option.value,
        option.label,
        option.metro_city,
        option.city,
        option.zip_prefix,
        option.market
      ].map(locationSearchKey).filter(Boolean);
      const exact = candidates.some((candidate) => candidate === raw);
      const partial = candidates.some((candidate) => candidate.includes(raw) || raw.includes(candidate));
      return { option, score: exact ? 100 : partial ? 75 : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.option || null;
}

function gapRows() {
  return loadedRows.flatMap((row) => ["origin", "destination"]
    .filter((side) => !locationResolved(row, side))
    .map((side) => ({ row, side })));
}

function filteredGapRows() {
  const side = sideFilter?.value || "";
  const status = statusFilter?.value || "";
  const search = locationSearchKey(searchInput?.value || "");
  return gapRows().filter((item) => {
    if (side && item.side !== side) return false;
    if (status && rowStatus(item.row) !== status) return false;
    if (!search) return true;
    return locationSearchKey([vendorLabel(item.row), laneLabel(item.row), currentMatchLabel(item.row, item.side), item.row.rfx_id].filter(Boolean).join(" ")).includes(search);
  });
}

function updateMetrics() {
  const gaps = gapRows();
  rowsChecked.textContent = String(loadedRows.length);
  gapCount.textContent = String(gaps.length);
  pendingCount.textContent = String(loadedRows.filter((row) => rowStatus(row) === "pending_review").length);
  approvedCount.textContent = String(loadedRows.filter((row) => rowStatus(row) === "approved").length);
}

function renderDatalist() {
  document.querySelector("#catalog-location-options")?.remove();
  const datalist = document.createElement("datalist");
  datalist.id = "catalog-location-options";
  datalist.innerHTML = locationOptions.map((option) => `<option value="${escapeHtml(locationValue(option))}" label="${escapeHtml(locationLabel(option))}"></option>`).join("");
  document.body.appendChild(datalist);
}

function renderRows() {
  updateMetrics();
  const rows = filteredGapRows();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><strong>No catalog gaps in this view</strong><span>Change filters or refresh after new uploads are interpreted.</span></div></td></tr>';
    return;
  }
  body.innerHTML = rows.map(({ row, side }) => {
    const candidate = bestLocationCandidate(row, side);
    return `
      <tr data-catalog-row="${escapeHtml(row.id)}" data-catalog-status="${escapeHtml(rowStatus(row))}" data-catalog-side="${escapeHtml(side)}">
        <td><span class="review-chip ${escapeHtml(rowStatus(row) === "approved" ? "success" : "warning")}">${escapeHtml(rowStatus(row))}</span></td>
        <td><span class="review-chip neutral">${escapeHtml(side)}</span></td>
        <td>${escapeHtml(vendorLabel(row))}</td>
        <td>
          <strong>${escapeHtml(laneLabel(row))}</strong>
          <small>${escapeHtml(row.rfx_id || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml(currentMatchLabel(row, side))}</strong>
          <small>${escapeHtml(gapReason(row, side))}</small>
        </td>
        <td>
          <input class="catalog-suggestion-input" data-catalog-suggestion list="catalog-location-options" value="${escapeHtml(candidate ? locationValue(candidate) : "")}" placeholder="Search catalog location..." />
          <small>${escapeHtml(candidate ? locationLabel(candidate) : "No strong automatic suggestion")}</small>
        </td>
        <td class="history-actions">
          <button type="button" class="small-button" data-apply-catalog-match="${escapeHtml(row.id)}">Apply match</button>
          <span class="row-save-status" data-catalog-status-message="${escapeHtml(row.id)}-${escapeHtml(side)}"></span>
        </td>
      </tr>
    `;
  }).join("");
}

function selectedLocation(value) {
  const key = locationSearchKey(value);
  return locationOptions.find((option) => locationSearchKey(locationValue(option)) === key)
    || locationOptions.find((option) => locationSearchKey(option.value) === key)
    || locationOptions.find((option) => locationSearchKey(option.raw_value) === key)
    || null;
}

function locationPatch(side, option) {
  return {
    [side]: locationValue(option),
    [`normalized_${side}`]: option.metro_city || option.city || option.value || option.raw_value || "",
    [`${side}_city`]: option.city || option.metro_city || "",
    [`${side}_country`]: option.country || "",
    [`${side}_zip_prefix`]: option.zip_prefix || "",
    [`${side}_state`]: option.state_code || option.state_name || "",
    [`${side}_market`]: option.market || "",
    [`${side}_region`]: option.region || "",
    [`${side}_match_reason`]: "manual catalog workbench match",
    [`${side}_match_source`]: "manual_workbench",
    [`${side}_match_confidence`]: 100,
    [`${side}_match_manual`]: true
  };
}

async function applyCatalogMatch(tableRow) {
  const id = tableRow?.dataset.catalogRow;
  const side = tableRow?.dataset.catalogSide;
  const status = tableRow?.dataset.catalogStatus;
  const message = tableRow?.querySelector("[data-catalog-status-message]");
  const input = tableRow?.querySelector("[data-catalog-suggestion]");
  const option = selectedLocation(input?.value);
  if (!id || !side || !option) {
    setStatus("Choose a catalog location before applying.", "error");
    return;
  }
  const patch = locationPatch(side, option);
  if (message) message.textContent = "Saving...";
  try {
    if (status === "approved") await updateApprovedRatewareRow(id, patch);
    else await updateStagingRow(id, patch);
    if (message) {
      message.textContent = "Saved";
      message.dataset.tone = "success";
    }
    loadedRows = loadedRows.map((row) => row.id === id ? { ...row, ...patch } : row);
    renderRows();
    setStatus("Catalog match saved.", "success");
  } catch (error) {
    if (message) {
      message.textContent = "Failed";
      message.dataset.tone = "error";
    }
    setStatus(error.message, "error");
  }
}

async function loadWorkbench() {
  body.innerHTML = '<tr><td colspan="7">Loading catalog gaps...</td></tr>';
  setStatus("");
  refreshButton.disabled = true;
  try {
    await requirePrivatePage();
    const [options, pendingRows, approvedRows] = await Promise.all([
      fetchStagingOptions(),
      fetchStagingRows({ status: "pending_review" }),
      fetchApprovedRateware()
    ]);
    locationOptions = options.locations || [];
    loadedRows = [...pendingRows, ...approvedRows];
    renderDatalist();
    renderRows();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function syncCatalog() {
  syncButton.disabled = true;
  setStatus("Syncing catalog...");
  try {
    const result = await syncRatewareCatalog("core");
    setStatus(`Catalog synced. ${result.inserted || 0} inserted, ${result.updated || 0} updated.`, "success");
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    syncButton.disabled = false;
  }
}

initAuthControls();
loadWorkbench();

refreshButton?.addEventListener("click", loadWorkbench);
syncButton?.addEventListener("click", syncCatalog);
sideFilter?.addEventListener("change", renderRows);
statusFilter?.addEventListener("change", renderRows);
searchInput?.addEventListener("input", renderRows);
body?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-apply-catalog-match]");
  if (!button) return;
  applyCatalogMatch(button.closest("[data-catalog-row]"));
});
