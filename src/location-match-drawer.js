import { humanizeError } from "./error-copy.js";

const MX_STATE_CODES = new Set([
  "AG", "BC", "BS", "CH", "CL", "CM", "CO", "CS", "CU", "DF", "DG", "EM", "GT", "GR", "HG", "JA", "MI", "MO", "MX", "NA", "NL", "OA", "PU", "QE", "QR", "SI", "SL", "SO", "TB", "TL", "TM", "VE", "YU", "ZA"
]);

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"
]);

const CA_PROVINCE_CODES = new Set(["AB", "BC", "MB", "NB", "NL", "NF", "NS", "NT", "NU", "ON", "PE", "PQ", "QC", "SK", "YT"]);
const MX_CITY_HINTS = [
  "ACAPULCO",
  "ACUNA",
  "AGUASCALIENTES",
  "APODACA",
  "ARTEAGA",
  "CELAYA",
  "CHIHUAHUA",
  "CIUDAD JUAREZ",
  "CD JUAREZ",
  "COATZACOALCOS",
  "CUAUTITLAN",
  "CULIACAN",
  "ESCOBEDO",
  "GUADALAJARA",
  "HERMOSILLO",
  "IRAPUATO",
  "JUAREZ",
  "EL MARQUES",
  "LEON",
  "LERMA",
  "MANZANILLO",
  "MATAMOROS",
  "MEXICALI",
  "MEXICO CITY",
  "MONTERREY",
  "MORELIA",
  "NOGALES",
  "NUEVO LAREDO",
  "PUEBLA",
  "QUERETARO",
  "RAMOS ARIZPE",
  "REYNOSA",
  "SALTILLO",
  "SAN LUIS POTOSI",
  "SILAO",
  "TAMPICO",
  "TIJUANA",
  "TOLUCA",
  "TORREON",
  "VERACRUZ"
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionValue(option) {
  return typeof option === "string" ? option : option?.value || option?.raw_value || option?.label || "";
}

function optionLabel(option) {
  return typeof option === "string" ? option : option?.label || option?.raw_value || option?.value || "";
}

function optionTextValues(option) {
  if (typeof option === "string") return [option];
  return [
    option.value,
    option.label,
    option.raw_value,
    option.city,
    option.metro_city,
    option.market,
    option.region,
    [option.city, option.state_code].filter(Boolean).join(", "),
    [option.metro_city, option.state_code].filter(Boolean).join(", "),
    [option.city, option.state_name].filter(Boolean).join(", "),
    option.zip_prefix
  ].filter(Boolean);
}

function textTokens(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function zipPrefixMatchesText(value, zipPrefix) {
  const zip = lookupKey(zipPrefix).toUpperCase();
  if (!zip) return false;
  return textTokens(value).some((token) => token === zip || (token.length > zip.length && token.startsWith(zip)));
}

function inferState(value) {
  const tokens = textTokens(value);
  return tokens.find((token) => MX_STATE_CODES.has(token) || US_STATE_CODES.has(token) || CA_PROVINCE_CODES.has(token)) || "";
}

function normalizedStateCode(value) {
  if (value === "CU") return "CO";
  return value === "EM" ? "MX" : value;
}

function inferCountry(value, row, prefix) {
  const explicit = String(row?.[`${prefix}_country`] || "").toUpperCase();
  const tokens = textTokens(value);
  const tokenSet = new Set(tokens);
  const lookup = lookupKey(value).toUpperCase();
  const hasMxState = tokens.some((token) => MX_STATE_CODES.has(token));
  const hasUsState = tokens.some((token) => US_STATE_CODES.has(token));
  const hasCaProvince = tokens.some((token) => CA_PROVINCE_CODES.has(token));
  const hasMxCityHint = MX_CITY_HINTS.some((city) => lookup.includes(city));
  const hasFiveDigitPostal = /\b\d{4,5}\b/.test(lookup);
  const hasCanadianPostalCode = /\b[A-Z]\d[A-Z]\b/.test(lookup);
  const strongUsText = tokenSet.has("US") || tokenSet.has("USA") || tokenSet.has("UNITED") || tokenSet.has("STATES");
  const strongCaText = tokenSet.has("CAN") || tokenSet.has("CANADA");
  const strongMxText = tokenSet.has("MX") || tokenSet.has("MEX") || (tokenSet.has("MEXICO") && !tokenSet.has("NEW") && !hasUsState);
  if (strongMxText) return "MX";
  if (hasMxState && (hasMxCityHint || (!hasUsState && !hasCaProvince) || (hasFiveDigitPostal && !strongUsText && !strongCaText))) return "MX";
  if (strongUsText) return "US";
  if (strongCaText || hasCanadianPostalCode) return "CA";
  if (explicit) return explicit;

  const state = inferState(value);
  if (state && MX_STATE_CODES.has(state) && !US_STATE_CODES.has(state)) return "MX";
  if (state && US_STATE_CODES.has(state) && !MX_STATE_CODES.has(state)) return "US";
  if (state && CA_PROVINCE_CODES.has(state) && !MX_STATE_CODES.has(state) && !US_STATE_CODES.has(state)) return "CA";
  if (/^[A-Z]\d[A-Z]/i.test(String(value || "").trim()) && !hasMxCityHint) return "CA";
  return "";
}

function scoreCandidate(option, query, row, prefix) {
  const lookup = lookupKey(query);
  const values = optionTextValues(option);
  const optionLookups = values.map(lookupKey).filter(Boolean);
  if (!lookup || !optionLookups.length) return null;

  let score = 0;
  let reason = "catalog candidate";
  if (optionLookups.some((candidate) => candidate === lookup)) {
    score += 100;
    reason = "exact text match";
  } else if (optionLookups.some((candidate) => candidate.startsWith(lookup) || lookup.startsWith(candidate))) {
    score += 82;
    reason = "starts with same city or ZIP";
  } else if (optionLookups.some((candidate) => candidate.includes(lookup) || lookup.includes(candidate))) {
    score += 64;
    reason = "partial city, market, or ZIP match";
  } else {
    return null;
  }

  const country = inferCountry(query, row, prefix);
  const optionCountry = String(option?.country || "").toUpperCase();
  if (country && optionCountry === country) score += 18;
  if (country && optionCountry && optionCountry !== country) return null;

  const state = inferState(query);
  const optionState = String(option?.state_code || option?.state_name || "").toUpperCase();
  if (state && normalizedStateCode(optionState) === normalizedStateCode(state)) score += 16;
  if (state && optionState && normalizedStateCode(optionState) !== normalizedStateCode(state)) score -= 16;

  const existingMarket = lookupKey(row?.[`${prefix}_market`]);
  if (existingMarket && lookupKey(option?.market) === existingMarket) score += 8;
  if (option?.zip_prefix && zipPrefixMatchesText(query, option.zip_prefix)) score += 10;
  if (["US", "CA"].includes(optionCountry) && !option?.zip_prefix) score -= 8;
  if (optionCountry === "MX" && option?.market) score += 6;

  return { option, score, reason };
}

function locationSummary(row, prefix) {
  const zipState = [row?.[`${prefix}_zip_prefix`], row?.[`${prefix}_state`]].filter(Boolean).join(" / ");
  const confidence = row?.[`${prefix}_match_confidence`] ? `${row[`${prefix}_match_confidence`]}%` : "";
  return [
    row?.[`${prefix}_match_reason`] || "No match explanation yet",
    row?.[`${prefix}_match_source`] ? `Source: ${row[`${prefix}_match_source`]}` : "",
    confidence ? `Confidence: ${confidence}` : "",
    zipState ? `ZIP/ST: ${zipState}` : "",
    row?.[`${prefix}_market`] ? `Market: ${row[`${prefix}_market`]}` : "",
    row?.[`${prefix}_region`] ? `Region: ${row[`${prefix}_region`]}` : "",
    row?.[`${prefix}_country`] ? `Country: ${row[`${prefix}_country`]}` : ""
  ].filter(Boolean);
}

function zipGuide(row, prefix) {
  const raw = row?.[prefix] || row?.[`normalized_${prefix}`] || "";
  const country = inferCountry(raw, row, prefix) || String(row?.[`${prefix}_country`] || "").toUpperCase();
  const missingZip = !row?.[`${prefix}_zip_prefix`];
  if (country === "MX") {
    return missingZip
      ? "Mexico: normalize by metro city, state, market, and region first. ZIP is useful but not required for the MX catalog."
      : "Mexico: ZIP is present, but market/region should still drive the commercial normalization.";
  }
  if (country === "US" || country === "CA") {
    return missingZip
      ? "US/CA: choose a catalog candidate with ZIP prefix, or run Find missing ZIP before approving the row."
      : "US/CA: ZIP prefix should map the lane into its key market area and region.";
  }
  return "Unknown country: pick the closest candidate or run Find missing ZIP to guide the match.";
}

function renderCandidate(candidate, index) {
  const option = candidate.option;
  const geography = [
    option?.country,
    [option?.zip_prefix, option?.state_code].filter(Boolean).join(" / "),
    option?.market,
    option?.region
  ].filter(Boolean).join(" | ");
  return `
    <article class="location-candidate-card ${index === 0 ? "best" : ""}">
      <div>
        <strong>${escapeHtml(option?.raw_value || optionValue(option))}</strong>
        <span>${escapeHtml([option?.metro_city || option?.city, geography].filter(Boolean).join(" | "))}</span>
      </div>
      <p>${escapeHtml(candidate.reason)} - score ${Math.max(0, Math.round(candidate.score))}</p>
      <div class="location-candidate-actions">
        <button type="button" class="small-button" data-location-apply-candidate="${index}">Apply</button>
        <button type="button" class="small-button secondary" data-location-save-alias="${index}" ${option?.id ? "" : "disabled"}>Save alias</button>
      </div>
    </article>
  `;
}

export function createLocationMatchDrawer(config) {
  let drawer = null;
  let state = { tableRow: null, prefix: "", row: {}, candidates: [] };

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement("aside");
    drawer.className = "profile-drawer location-match-drawer hidden";
    drawer.setAttribute("aria-label", "Location normalization");
    document.body.appendChild(drawer);
    drawer.addEventListener("click", handleDrawerClick);
    return drawer;
  }

  function getRowSnapshot(tableRow, prefix) {
    const rowId = config.getRowId(tableRow);
    const base = config.getRows().find((row) => String(row.id) === String(rowId)) || {};
    const patch = config.readPatch(tableRow) || {};
    return { ...base, ...patch, _prefix: prefix };
  }

  function open(tableRow, prefix) {
    if (!tableRow || !prefix) return;
    const row = getRowSnapshot(tableRow, prefix);
    const query = row[prefix] || row[`normalized_${prefix}`] || "";
    const candidates = (config.getLocations() || [])
      .map((option) => scoreCandidate(option, query, row, prefix))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    state = { tableRow, prefix, row, candidates };
    const summary = locationSummary(row, prefix);
    ensureDrawer().innerHTML = `
      <div class="drawer-header">
        <div>
          <p class="section-kicker">CATALOG / LANE NORMALIZATION</p>
          <h2>${escapeHtml(prefix === "origin" ? "Origin match" : "Destination match")}</h2>
          <span class="drawer-subtitle">${escapeHtml(config.modeLabel || "Rateware")} - ${escapeHtml(query || "No location text")}</span>
        </div>
        <button type="button" class="icon-button" data-location-drawer-close aria-label="Close">&times;</button>
      </div>
      <section class="location-match-summary">
        <h3>Current match</h3>
        <dl>
          <div><dt>Raw</dt><dd>${escapeHtml(row[prefix] || "-")}</dd></div>
          <div><dt>Normalized</dt><dd>${escapeHtml(row[`normalized_${prefix}`] || "-")}</dd></div>
          <div><dt>ZIP / State</dt><dd>${escapeHtml([row[`${prefix}_zip_prefix`], row[`${prefix}_state`]].filter(Boolean).join(" / ") || "-")}</dd></div>
          <div><dt>Market</dt><dd>${escapeHtml(row[`${prefix}_market`] || "-")}</dd></div>
          <div><dt>Region</dt><dd>${escapeHtml(row[`${prefix}_region`] || "-")}</dd></div>
        </dl>
        <ul>${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
      <section class="location-zip-guide">
        <h3>ZIP / country guide</h3>
        <p>${escapeHtml(zipGuide(row, prefix))}</p>
        <div class="drawer-quick-actions">
          <button type="button" class="small-button secondary" data-location-find-zip>Find missing ZIP</button>
          <button type="button" class="small-button secondary" data-location-renormalize>Re-normalize row</button>
        </div>
      </section>
      <section class="location-candidates">
        <h3>Catalog candidates</h3>
        ${candidates.length ? candidates.map(renderCandidate).join("") : `<p class="muted-text">No catalog candidates found. Try Find missing ZIP or edit the location text.</p>`}
      </section>
      <p class="drawer-footnote">Save alias maps the current text to the selected catalog candidate for future quotes.</p>
    `;
    drawer.classList.remove("hidden");
  }

  function close() {
    drawer?.classList.add("hidden");
  }

  async function handleDrawerClick(event) {
    if (event.target.closest("[data-location-drawer-close]")) {
      close();
      return;
    }

    const applyButton = event.target.closest("[data-location-apply-candidate]");
    if (applyButton) {
      const candidate = state.candidates[Number(applyButton.dataset.locationApplyCandidate)];
      if (!candidate) return;
      const applied = config.applyCandidate(state.tableRow, state.prefix, candidate.option);
      if (applied) {
        config.markRowDirty(state.tableRow);
        config.scheduleSave(state.tableRow, 700);
        config.setMessage?.("Catalog candidate applied. Autosave is running.", "success");
        open(state.tableRow, state.prefix);
      }
      return;
    }

    const aliasButton = event.target.closest("[data-location-save-alias]");
    if (aliasButton) {
      const candidate = state.candidates[Number(aliasButton.dataset.locationSaveAlias)];
      const alias = state.row[state.prefix] || "";
      if (!candidate?.option?.id || !alias.trim()) return;
      aliasButton.disabled = true;
      try {
        const applied = config.applyCandidate(state.tableRow, state.prefix, candidate.option);
        if (applied) {
          config.markRowDirty(state.tableRow);
          config.scheduleSave(state.tableRow, 700);
        }
        const result = await config.saveAlias({
          alias,
          target_location_id: candidate.option.id
        });
        config.onAliasSaved?.(result.location);
        config.setMessage?.("Alias saved to the Rateware location catalog.", "success");
      } catch (error) {
        config.setMessage?.(humanizeError(error), "error");
      } finally {
        aliasButton.disabled = false;
      }
      return;
    }

    if (event.target.closest("[data-location-find-zip]")) {
      close();
      await config.onFindZip(state.tableRow, state.prefix);
      return;
    }

    if (event.target.closest("[data-location-renormalize]")) {
      close();
      await config.onRenormalize(state.tableRow);
    }
  }

  return { open, close };
}
