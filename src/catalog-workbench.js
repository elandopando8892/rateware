import { initAuthControls, requirePrivatePage } from "./auth.js";
import { syncRatewareCatalog } from "./catalog-service.js";
import { fetchApprovedRateware, updateApprovedRatewareRow } from "./rateware-service.js";
import { fetchStagingOptions, fetchStagingRows, saveLocationAlias, updateStagingRow } from "./staging-service.js";

const rowsChecked = document.querySelector("#catalog-rows-checked");
const gapCount = document.querySelector("#catalog-gap-count");
const pendingCount = document.querySelector("#catalog-pending-count");
const approvedCount = document.querySelector("#catalog-approved-count");
const body = document.querySelector("#catalog-workbench-body");
const statusMessage = document.querySelector("#catalog-workbench-status");
const sideFilter = document.querySelector("#catalog-side-filter");
const statusFilter = document.querySelector("#catalog-status-filter");
const viewModeSelect = document.querySelector("#catalog-view-mode");
const searchInput = document.querySelector("#catalog-search");
const refreshButton = document.querySelector("#refresh-catalog-workbench");
const syncButton = document.querySelector("#sync-catalog-button");

const MX_STATE_CODES = new Set([
  "AG", "BC", "BS", "CH", "CL", "CM", "CO", "CS", "CU", "DF", "DG", "EM", "GT", "GR", "HG", "JA", "MI", "MO", "MX", "NA", "NL", "OA", "PU", "QE", "QR", "SI", "SL", "SO", "TB", "TL", "TM", "VE", "YU", "ZA"
]);
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"
]);
const CA_PROVINCE_CODES = new Set(["AB", "BC", "MB", "NB", "NL", "NF", "NS", "NT", "NU", "ON", "PE", "PQ", "QC", "SK", "YT"]);
const MX_CITY_HINTS = [
  "ACAPULCO", "ACUNA", "AGUASCALIENTES", "APODACA", "ARTEAGA", "CELAYA", "CHIHUAHUA", "CIUDAD JUAREZ", "CD JUAREZ", "COATZACOALCOS", "CUAUTITLAN", "CULIACAN", "ESCOBEDO", "GUADALAJARA", "HERMOSILLO", "IRAPUATO", "JUAREZ", "EL MARQUES", "LEON", "LERMA", "MANZANILLO", "MATAMOROS", "MEXICALI", "MEXICO CITY", "MONTERREY", "MORELIA", "NOGALES", "NUEVO LAREDO", "PUEBLA", "QUERETARO", "RAMOS ARIZPE", "REYNOSA", "SALTILLO", "SAN LUIS POTOSI", "SILAO", "TAMPICO", "TIJUANA", "TOLUCA", "TORREON", "VERACRUZ"
];

let loadedRows = [];
let locationOptions = [];
let currentEntries = [];

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

function textTokens(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
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

function inferState(value) {
  return textTokens(value).find((token) => MX_STATE_CODES.has(token) || US_STATE_CODES.has(token) || CA_PROVINCE_CODES.has(token)) || "";
}

function normalizedStateCode(value) {
  if (value === "EM") return "MX";
  if (value === "CU") return "CO";
  return value;
}

function rawLocationLabel(row, side) {
  return row[side] || row[`normalized_${side}`] || row[`${side}_city`] || "";
}

function inferCountryFromText(value, row = {}, side = "") {
  const explicit = String(row?.[`${side}_country`] || "").toUpperCase();
  const tokens = textTokens(value);
  const tokenSet = new Set(tokens);
  const lookup = textTokens(value).join(" ");
  const hasMxState = tokens.some((token) => MX_STATE_CODES.has(token));
  const hasUsState = tokens.some((token) => US_STATE_CODES.has(token));
  const hasCaProvince = tokens.some((token) => CA_PROVINCE_CODES.has(token));
  const hasMxCityHint = MX_CITY_HINTS.some((city) => lookup.includes(city));
  const hasCanadianPostalCode = /\b[A-Z]\d[A-Z]\b/.test(lookup);
  const strongMxText = tokenSet.has("MX") || tokenSet.has("MEX") || (tokenSet.has("MEXICO") && !tokenSet.has("NEW"));
  const strongUsText = tokenSet.has("US") || tokenSet.has("USA") || tokenSet.has("UNITED") || tokenSet.has("STATES");
  const strongCaText = tokenSet.has("CAN") || tokenSet.has("CANADA");

  if (strongMxText || (hasMxState && (hasMxCityHint || !hasUsState || !hasCaProvince))) return "MX";
  if (strongCaText || hasCanadianPostalCode) return "CA";
  if (strongUsText) return "US";
  if (explicit) return explicit;

  const state = inferState(value);
  if (state && MX_STATE_CODES.has(state) && !US_STATE_CODES.has(state)) return "MX";
  if (state && US_STATE_CODES.has(state) && !MX_STATE_CODES.has(state)) return "US";
  if (state && CA_PROVINCE_CODES.has(state)) return "CA";
  return "";
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
  return String(row[`${side}_country`] || inferCountryFromText(rawLocationLabel(row, side), row, side)).toUpperCase();
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
    option.zip_prefix ? `ZIP ${option.zip_prefix}` : "",
    option.state_code ? `ST ${option.state_code}` : "",
    option.market,
    option.region,
    option.country,
    option.source
  ].filter(Boolean).join(" | ");
}

function optionTextValues(option) {
  return [
    locationValue(option),
    locationLabel(option),
    option.raw_value,
    option.value,
    option.label,
    option.metro_city,
    option.city,
    option.zip_prefix,
    option.market,
    option.region,
    [option.city, option.state_code].filter(Boolean).join(", "),
    [option.metro_city, option.state_code].filter(Boolean).join(", "),
    [option.city, option.state_name].filter(Boolean).join(", ")
  ].filter(Boolean);
}

function scoreLocationCandidate(row, side, option) {
  const query = [
    rawLocationLabel(row, side),
    row[`${side}_state`],
    row[`${side}_zip_prefix`],
    row[`${side}_market`]
  ].filter(Boolean).join(" ");
  const lookup = locationSearchKey(query);
  const candidates = optionTextValues(option).map(locationSearchKey).filter(Boolean);
  if (!lookup || !candidates.length) return null;

  let score = 0;
  let reason = "catalog candidate";
  if (candidates.some((candidate) => candidate === lookup)) {
    score += 100;
    reason = "exact text match";
  } else if (candidates.some((candidate) => candidate.startsWith(lookup) || lookup.startsWith(candidate))) {
    score += 82;
    reason = "starts with same city or ZIP";
  } else if (candidates.some((candidate) => candidate.includes(lookup) || lookup.includes(candidate))) {
    score += 64;
    reason = "partial city, market, or ZIP match";
  } else {
    return null;
  }

  const inferredCountry = country(row, side);
  const optionCountry = String(option.country || "").toUpperCase();
  if (inferredCountry && optionCountry === inferredCountry) score += 22;
  if (inferredCountry && optionCountry && optionCountry !== inferredCountry) score -= 70;

  const state = inferState(query);
  const optionState = String(option.state_code || option.state_name || "").toUpperCase();
  if (state && optionState && normalizedStateCode(optionState) === normalizedStateCode(state)) score += 18;
  if (state && optionState && normalizedStateCode(optionState) !== normalizedStateCode(state)) score -= 18;

  const queryTokens = new Set(textTokens(query));
  const optionCityTokens = textTokens([option.city, option.metro_city].filter(Boolean).join(" "));
  if (optionCityTokens.some((token) => queryTokens.has(token))) score += 10;
  if (option.zip_prefix && queryTokens.has(String(option.zip_prefix).toUpperCase())) score += optionCountry === "MX" ? 4 : 12;
  if (optionCountry === "MX" && option.market) score += 8;
  if ((optionCountry === "US" || optionCountry === "CA") && !option.zip_prefix) score -= 8;

  return { option, score, reason };
}

function bestLocationCandidate(row, side) {
  const scored = locationOptions
    .map((option) => scoreLocationCandidate(row, side, option))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function gapItems() {
  return loadedRows.flatMap((row) => ["origin", "destination"]
    .filter((side) => !locationResolved(row, side))
    .map((side) => ({ type: "row", key: `${row.id}:${side}`, row, rows: [row], side, raw: rawLocationLabel(row, side) })));
}

function filteredGapItems() {
  const side = sideFilter?.value || "";
  const status = statusFilter?.value || "";
  const search = locationSearchKey(searchInput?.value || "");
  return gapItems().filter((item) => {
    if (side && item.side !== side) return false;
    if (status && rowStatus(item.row) !== status) return false;
    if (!search) return true;
    return locationSearchKey([vendorLabel(item.row), laneLabel(item.row), currentMatchLabel(item.row, item.side), item.row.rfx_id, item.raw].filter(Boolean).join(" ")).includes(search);
  });
}

function groupGapItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const groupKey = [item.side, locationSearchKey(item.raw || currentMatchLabel(item.row, item.side)) || item.key].join(":");
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        type: "group",
        key: groupKey,
        side: item.side,
        raw: item.raw,
        row: item.row,
        rows: [],
        items: []
      });
    }
    const group = groups.get(groupKey);
    group.rows.push(item.row);
    group.items.push(item);
  });
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || String(a.raw).localeCompare(String(b.raw)));
}

function visibleEntries() {
  const items = filteredGapItems();
  return viewModeSelect?.value === "rows" ? items : groupGapItems(items);
}

function updateMetrics() {
  const gaps = gapItems();
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

function statusMixLabel(rows) {
  const pending = rows.filter((row) => rowStatus(row) === "pending_review").length;
  const approved = rows.length - pending;
  return [pending ? `${pending} pending` : "", approved ? `${approved} approved` : ""].filter(Boolean).join(" / ") || "-";
}

function examplesLabel(rows, side) {
  return rows.slice(0, 3).map((row) => `${vendorLabel(row)}: ${laneLabel(row)}`).join(" | ");
}

function renderSuggestion(candidate) {
  if (!candidate) {
    return '<small>No strong automatic suggestion</small>';
  }
  return `
    <small>${escapeHtml(locationLabel(candidate.option))}</small>
    <span class="catalog-candidate-reason">${escapeHtml(candidate.reason)} | score ${Math.max(0, Math.round(candidate.score))}</span>
  `;
}

function renderRows() {
  updateMetrics();
  currentEntries = visibleEntries();
  if (!currentEntries.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><strong>No catalog gaps in this view</strong><span>Change filters or refresh after new uploads are interpreted.</span></div></td></tr>';
    return;
  }

  body.innerHTML = currentEntries.map((entry, index) => {
    const candidate = bestLocationCandidate(entry.row, entry.side);
    const isGroup = entry.type === "group";
    const countryLabel = country(entry.row, entry.side) || "unknown";
    return `
      <tr data-catalog-entry-index="${index}">
        <td><span class="review-chip ${escapeHtml(entry.rows.some((row) => rowStatus(row) === "approved") ? "neutral" : "warning")}">${escapeHtml(statusMixLabel(entry.rows))}</span></td>
        <td><span class="review-chip neutral">${escapeHtml(entry.side)}</span></td>
        <td>
          <strong>${escapeHtml(isGroup ? `${entry.rows.length} row${entry.rows.length === 1 ? "" : "s"}` : vendorLabel(entry.row))}</strong>
          <small>${escapeHtml(isGroup ? `Country: ${countryLabel}` : rowStatus(entry.row))}</small>
        </td>
        <td>
          <strong>${escapeHtml(isGroup ? entry.raw || "Repeated blank location" : laneLabel(entry.row))}</strong>
          <small>${escapeHtml(isGroup ? examplesLabel(entry.rows, entry.side) : entry.row.rfx_id || "")}</small>
        </td>
        <td>
          <strong>${escapeHtml(currentMatchLabel(entry.row, entry.side))}</strong>
          <small>${escapeHtml(gapReason(entry.row, entry.side))}</small>
        </td>
        <td>
          <input class="catalog-suggestion-input" data-catalog-suggestion list="catalog-location-options" value="${escapeHtml(candidate ? locationValue(candidate.option) : "")}" placeholder="Search catalog location..." />
          ${renderSuggestion(candidate)}
        </td>
        <td class="history-actions catalog-actions">
          <button type="button" class="small-button" data-apply-catalog-match>Apply${isGroup ? " group" : ""}</button>
          <button type="button" class="small-button secondary" data-apply-catalog-alias>Apply + alias</button>
          <span class="row-save-status" data-catalog-status-message></span>
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

async function updateRowLocation(row, side, patch) {
  if (rowStatus(row) === "approved") return await updateApprovedRatewareRow(row.id, patch);
  return await updateStagingRow(row.id, patch);
}

async function applyCatalogMatch(tableRow, { saveAlias = false } = {}) {
  const index = Number(tableRow?.dataset.catalogEntryIndex);
  const entry = currentEntries[index];
  const message = tableRow?.querySelector("[data-catalog-status-message]");
  const input = tableRow?.querySelector("[data-catalog-suggestion]");
  const option = selectedLocation(input?.value);
  if (!entry || !option) {
    setStatus("Choose a catalog location before applying.", "error");
    return;
  }
  if (saveAlias && !option.id) {
    setStatus("This suggestion cannot be saved as an alias because it is missing a catalog ID.", "error");
    return;
  }
  if (saveAlias && !String(entry.raw || "").trim()) {
    setStatus("This gap has no original location text to save as an alias.", "error");
    return;
  }

  const patch = locationPatch(entry.side, option);
  const rows = entry.rows || [];
  if (message) {
    message.textContent = `Saving ${rows.length}...`;
    message.dataset.tone = "warning";
  }

  try {
    if (saveAlias) {
      await saveLocationAlias({ alias: entry.raw, target_location_id: option.id });
    }

    let updated = 0;
    for (const row of rows) {
      await updateRowLocation(row, entry.side, patch);
      updated += 1;
      if (message) message.textContent = `Saved ${updated}/${rows.length}`;
    }

    const ids = new Set(rows.map((row) => row.id));
    loadedRows = loadedRows.map((row) => ids.has(row.id) ? { ...row, ...patch } : row);
    renderRows();
    setStatus(`${updated} row${updated === 1 ? "" : "s"} updated${saveAlias ? " and alias saved" : ""}.`, "success");
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
      fetchStagingRows({ status: "pending_review", limit: 1000 }),
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
viewModeSelect?.addEventListener("change", renderRows);
searchInput?.addEventListener("input", renderRows);
body?.addEventListener("click", (event) => {
  const applyButton = event.target.closest("[data-apply-catalog-match]");
  const aliasButton = event.target.closest("[data-apply-catalog-alias]");
  if (!applyButton && !aliasButton) return;
  applyCatalogMatch((applyButton || aliasButton).closest("[data-catalog-entry-index]"), { saveAlias: Boolean(aliasButton) });
});
