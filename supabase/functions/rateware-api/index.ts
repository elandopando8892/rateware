import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireKindeUser } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const CARRIER_INTELLIGENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "filters", "recommendations", "next_actions"],
  properties: {
    answer: { type: "string" },
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["limit", "focus", "data_scope"],
      properties: {
        limit: { type: "number" },
        focus: { type: "array", items: { type: "string" } },
        data_scope: { type: "string" }
      }
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vendor_id", "rank", "vendor_name", "domain", "primary_email", "base_stage", "status", "fit_score", "why", "evidence", "gaps", "recommended_action"],
        properties: {
          vendor_id: { type: ["string", "null"] },
          rank: { type: "number" },
          vendor_name: { type: "string" },
          domain: { type: ["string", "null"] },
          primary_email: { type: ["string", "null"] },
          base_stage: { type: ["string", "null"] },
          status: { type: ["string", "null"] },
          fit_score: { type: "number" },
          why: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          recommended_action: { type: "string" }
        }
      }
    },
    next_actions: { type: "array", items: { type: "string" } }
  }
};

function userContext(payload: Record<string, unknown>) {
  const email = cleanText(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase();
  const id = cleanText(payload.sub || payload.id || email);
  if (!id && !email) throw new Error("Authenticated user is missing an id or email.");
  return {
    owner_user_id: id || email,
    owner_email: email || id
  };
}

function withOwner(row: Record<string, unknown>, user: { owner_user_id: string | null; owner_email: string | null }) {
  return {
    ...row,
    owner_user_id: user.owner_user_id,
    owner_email: user.owner_email
  };
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function cleanRateText(value: unknown) {
  const text = cleanText(value);
  if (!text || /^x$/i.test(text) || /^n\/?a$/i.test(text) || /^please estimate$/i.test(text) || /^tier\s*[123]$/i.test(text)) return null;
  const cleaned = text
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function sourceRank(source: unknown) {
  const text = String(source || "");
  if (text === "rateware_manual_catalog") return 0;
  if (text === "rateware_reference_catalog" || text.startsWith("rateware_reference_")) return 0;
  if (text === "rateware_google_catalog" || text === "cusCatalog") return 1;
  if (text === "rateware_seed") return 3;
  return 2;
}

function optionQuality(location: Record<string, unknown>) {
  let score = 0;
  if (location.country && location.country !== "UNKNOWN") score += 30;
  if (location.zip_prefix) score += 20;
  if (location.market) score += 15;
  if (location.region) score += 10;
  if (location.state_code || location.state_name) score += 8;
  score += Math.max(0, 10 - sourceRank(location.source));
  return score;
}

function catalogKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCatalogIndex(items: Record<string, unknown>[]) {
  const index = new Map<string, Map<string, Record<string, unknown>>>();
  for (const item of items) {
    const category = String(item.category || "");
    if (!category) continue;
    if (!index.has(category)) index.set(category, new Map());
    const bucket = index.get(category)!;
    [item.raw_value, item.normalized_value, item.code].forEach((value) => {
      const lookup = catalogKey(value);
      if (!lookup) return;
      const existing = bucket.get(lookup);
      if (!existing || sourceRank(item.source) < sourceRank(existing.source)) bucket.set(lookup, item);
    });
  }
  return index;
}

function catalogMatch(index: Map<string, Map<string, Record<string, unknown>>>, categories: string[], value: unknown) {
  const lookup = catalogKey(value);
  if (!lookup) return null;

  for (const category of categories) {
    const direct = index.get(category)?.get(lookup);
    if (direct) return direct;
  }

  for (const category of categories) {
    for (const [candidateKey, item] of index.get(category) || []) {
      if (candidateKey && (lookup.includes(candidateKey) || candidateKey.includes(lookup))) return item;
    }
  }

  return null;
}

function buildLocationIndex(locations: Record<string, unknown>[]) {
  const index = new Map<string, Record<string, unknown>>();
  for (const location of locations) {
    const keys = [
      location.location_key,
      location.raw_value,
      location.zip_prefix,
      location.city,
      location.metro_city,
      location.market,
      location.region,
      [location.city, location.state_code].filter(Boolean).join(", "),
      [location.city, location.state_name].filter(Boolean).join(", ")
    ].map(catalogKey).filter(Boolean);

    for (const lookup of keys) {
      const existing = index.get(lookup);
      if (!existing || optionQuality(location) > optionQuality(existing)) index.set(lookup, location);
    }
  }
  return index;
}

function locationCandidate(location: Record<string, unknown>, score: number, reason: string) {
  return {
    score,
    reason,
    country: location.country || null,
    zip_prefix: location.zip_prefix || null,
    city: location.city || null,
    state: location.state_code || location.state_name || null,
    metro_city: location.metro_city || null,
    market: location.market || null,
    region: location.region || null,
    raw_value: location.raw_value || null
  };
}

function locationMatch(index: Map<string, Record<string, unknown>>, value: unknown) {
  const lookup = catalogKey(value);
  if (!lookup) return null;

  const direct = index.get(lookup);
  if (direct) {
    return {
      location: direct,
      score: 100,
      reason: "exact catalog match",
      candidates: [locationCandidate(direct, 100, "exact catalog match")]
    };
  }

  const zipToken = lookup.match(/\b[A-Z]\d[A-Z]|\b\d{3,5}\b/)?.[0] || null;
  const zip = zipToken && /^\d/.test(zipToken) ? zipToken.slice(0, 3) : zipToken;
  if (zip && index.get(catalogKey(zip))) {
    const zipMatch = index.get(catalogKey(zip))!;
    return {
      location: zipMatch,
      score: 92,
      reason: `zip prefix ${zip} match`,
      candidates: [locationCandidate(zipMatch, 92, `zip prefix ${zip} match`)]
    };
  }

  const candidates: Array<{ location: Record<string, unknown>; score: number; reason: string }> = [];
  const seen = new Set<Record<string, unknown>>();
  for (const [, location] of index) {
    if (seen.has(location)) continue;
    seen.add(location);
    let score = 0;
    const reasons: string[] = [];
    const zipPrefix = catalogKey(location.zip_prefix);
    if (zipPrefix && lookup.includes(zipPrefix)) {
      score += 45;
      reasons.push("zip prefix");
    }
    const state = catalogKey(location.state_code);
    if (state && lookup.includes(state)) {
      score += 25;
      reasons.push("state match");
    }
    const city = catalogKey(location.city);
    if (city && lookup.includes(city)) {
      score += 35;
      reasons.push("city match");
    }
    const metro = catalogKey(location.metro_city);
    if (metro && (lookup.includes(metro) || metro.includes(lookup))) {
      score += 30;
      reasons.push("metro match");
    }
    const market = catalogKey(location.market);
    if (market && (lookup.includes(market) || market.includes(lookup))) {
      score += 18;
      reasons.push("market match");
    }
    if (score >= 25) candidates.push({ location, score, reason: reasons.join(", ") || "catalog match" });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5).map((candidate) => locationCandidate(candidate.location, candidate.score, candidate.reason));
  const best = candidates[0] || null;
  if (!best || best.score < 35) {
    return {
      location: null,
      score: best?.score || 0,
      reason: best ? "below auto-match threshold" : "no catalog candidate",
      candidates: top
    };
  }

  return {
    location: best.location,
    score: best.score,
    reason: best.reason,
    candidates: top
  };
}

function applyLocation(row: Record<string, unknown>, prefix: "origin" | "destination", location: Record<string, unknown> | null) {
  if (!location) {
    return {
      [`normalized_${prefix}`]: null,
      [`${prefix}_country`]: null,
      [`${prefix}_zip_prefix`]: null,
      [`${prefix}_city`]: null,
      [`${prefix}_state`]: null,
      [`${prefix}_market`]: null,
      [`${prefix}_region`]: null
    };
  }
  return {
    [`normalized_${prefix}`]: location.metro_city || location.city || row[prefix],
    [`${prefix}_country`]: location.country || null,
    [`${prefix}_zip_prefix`]: location.zip_prefix || null,
    [`${prefix}_city`]: location.city || null,
    [`${prefix}_state`]: location.state_code || location.state_name || null,
    [`${prefix}_market`]: location.market || null,
    [`${prefix}_region`]: location.region || null
  };
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function normalizeEmail(value: unknown) {
  const text = String(value || "").toLowerCase();
  return text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] || null;
}

function domainFromVendorReference(value: unknown) {
  const email = normalizeEmail(value);
  if (email) return normalizeDomain(email.split("@").pop());
  const text = cleanText(value);
  if (!text) return null;
  return normalizeDomain(text.replace(/^@/, ""));
}

function vendorEmails(vendor: Record<string, unknown>) {
  const secondary = Array.isArray(vendor.secondary_emails) ? vendor.secondary_emails : [];
  return [vendor.primary_email, ...secondary]
    .map(normalizeEmail)
    .filter(Boolean) as string[];
}

function scoreVendorReference(vendor: Record<string, unknown>, reference: unknown) {
  const email = normalizeEmail(reference);
  const domain = domainFromVendorReference(reference);
  if (!email && !domain) return { score: 0, source: null as string | null, domain: null as string | null, email: null as string | null };

  const vendorDomain = normalizeDomain(vendor.domain);
  const emails = vendorEmails(vendor);
  let score = 0;
  let source: string | null = null;

  if (email && emails.includes(email)) {
    score = 120;
    source = "email";
  } else if (domain && vendorDomain && vendorDomain === domain) {
    score = 105;
    source = "domain";
  } else if (email && domain && vendorDomain === domain) {
    score = 100;
    source = "email_domain";
  } else if (domain && emails.some((candidate) => candidate.endsWith(`@${domain}`))) {
    score = 92;
    source = "contact_email_domain";
  } else if (domain && vendorDomain && (domain.endsWith(`.${vendorDomain}`) || vendorDomain.endsWith(`.${domain}`))) {
    score = 78;
    source = "domain_alias";
  }

  if (!score) return { score: 0, source: null, domain, email };

  const status = cleanText(vendor.status)?.toLowerCase();
  const baseStage = cleanText(vendor.base_stage)?.toLowerCase();
  if (status === "active") score += 8;
  if (status === "invited") score += 4;
  if (status === "inactive") score -= 10;
  if (status === "blocked") score -= 80;
  if (baseStage === "procurement") score += 5;
  if (baseStage === "sourcing") score += 3;
  if (baseStage === "archived") score -= 20;

  return { score, source, domain, email };
}

async function resolveVendorReference(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, reference: unknown) {
  const domain = domainFromVendorReference(reference);
  const email = normalizeEmail(reference);
  if (!domain && !email) return null;

  const result = await supabase
    .from("vendors")
    .select("id,vendor_name,domain,primary_email,secondary_emails,status,base_stage")
    .eq("owner_email", user.owner_email)
    .limit(1000);
  if (result.error) throw result.error;

  const ranked = (result.data || [])
    .map((vendor) => ({ vendor, ...scoreVendorReference(vendor, reference) }))
    .filter((match) => match.score >= 75)
    .sort((a, b) => b.score - a.score);

  return ranked[0] || null;
}

async function vendorLinkPatch(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, input: Record<string, unknown>, current: Record<string, unknown>) {
  const explicitVendorUpdate = input.vendor_domain !== undefined;
  const reference = explicitVendorUpdate ? input.vendor_domain : current.vendor_domain;
  const hasExistingLink = Boolean(current.vendor_id);

  if (!cleanText(reference)) {
    return explicitVendorUpdate ? { vendor_id: null, vendor_domain: null } : {};
  }
  if (!explicitVendorUpdate && hasExistingLink) return {};

  const match = await resolveVendorReference(supabase, user, reference);
  const fallbackDomain = domainFromVendorReference(reference);
  if (!match) {
    return explicitVendorUpdate ? { vendor_id: null, vendor_domain: fallbackDomain || cleanText(reference) } : {};
  }

  return {
    vendor_id: match.vendor.id,
    vendor_domain: normalizeDomain(match.vendor.domain) || match.domain || fallbackDomain || cleanText(reference)
  };
}

function textIncludesAny(value: unknown, terms: string[]) {
  const source = catalogKey(value);
  return terms.some((term) => source.includes(catalogKey(term)));
}

function arrayValues(value: unknown) {
  return Array.isArray(value) ? value.map((item) => cleanText(item)).filter(Boolean) as string[] : [];
}

function extractRecommendationLimit(prompt: string) {
  const withoutPercentages = prompt.replace(/\b\d{1,3}\s*%/g, "");
  const explicit = withoutPercentages.match(/\b(\d{1,3})\b/)?.[1];
  if (!explicit) return 30;
  return Math.min(Math.max(Number(explicit) || 30, 1), 100);
}

function carrierIntelligenceIntent(prompt: string) {
  const text = prompt.toLowerCase();
  const focus: string[] = [];
  const crossborder = /\b(cross.?border|crossborder|frontera|border|laredo|usa|us|u\.s\.|canada|canadian|ca)\b/i.test(text);
  const d2d = /\b(d2d|door.?to.?door|puerta.?a.?puerta|import|export|importacion|exportacion)\b/i.test(text);
  const pareto = /\b(80\/20|20\/80|pareto|80%|20%)\b/i.test(text) || /\b20\s*%.*80\s*%|\b80\s*%.*20\s*%/i.test(text);
  const mexico = /\b(mexican|mexicano|mexicana|mexico|mx|nacional|domestico|domestic|monterrey|nuevo leon|nl|bajio|norte|centro)\b/i.test(text);
  const addTargets = /\b(alta|dar de alta|onboard|registrar|prospect|target|objetivo|procurement)\b/i.test(text);
  const hazmat = /\b(hazmat|hazard|hazardous|peligroso|quimico)\b/i.test(text);
  const reefer = /\b(reefer|refrigerado|temperature|temperatura|temp)\b/i.test(text);
  const flatbed = /\b(flatbed|plana|plataforma)\b/i.test(text);
  const costPerMile = /\b(cost|costo|rate|tarifa).{0,18}(mile|milla)|\b(per mile|por milla|\/mi)\b/i.test(text);
  const costPerKm = /\b(cost|costo|rate|tarifa).{0,18}(km|kilometro|kilómetro)|\b(per km|por km|\/km)\b/i.test(text);
  const border = /\b(frontera|border|crossing|cruce|laredo|nuevo laredo|reynosa|mcallen|juarez|el paso|nogales)\b/i.test(text);
  if (pareto) focus.push("pareto");
  if (crossborder) focus.push("cross-border");
  if (d2d) focus.push("d2d-import-export");
  if (mexico) focus.push("mexico");
  if (border) focus.push("border-crossing");
  if (addTargets) focus.push("procurement-targets");
  if (hazmat) focus.push("hazmat");
  if (reefer) focus.push("reefer");
  if (flatbed) focus.push("flatbed");
  if (costPerMile) focus.push("cost-per-mile");
  if (costPerKm) focus.push("cost-per-km");
  return { crossborder, d2d, pareto, mexico, addTargets, hazmat, reefer, flatbed, costPerMile, costPerKm, border, focus: focus.length ? focus : ["general carrier fit"] };
}

function rateText(row: Record<string, unknown>) {
  return [
    row.origin,
    row.destination,
    row.normalized_origin,
    row.normalized_destination,
    row.origin_market,
    row.destination_market,
    row.origin_country,
    row.destination_country,
    row.origin_state,
    row.destination_state,
    row.operation,
    row.service,
    row.equipment,
    row.trailer
  ].filter(Boolean).join(" ");
}

function isCrossBorderRate(row: Record<string, unknown>) {
  const text = rateText(row);
  const countries = [catalogKey(row.origin_country), catalogKey(row.destination_country)].filter(Boolean);
  return textIncludesAny(text, ["cross-border", "crossborder", "d2d import", "d2d export", "laredo", "nuevo laredo"]) ||
    (countries.includes("MX") && (countries.includes("US") || countries.includes("USA") || countries.includes("CA") || countries.includes("CANADA")));
}

function isD2dImportExportRate(row: Record<string, unknown>) {
  const operation = catalogKey(row.operation);
  const text = catalogKey(rateText(row));
  return isCrossBorderRate(row) &&
    (operation.includes("D2D EXPORT") || operation.includes("D2D IMPORT") || text.includes("D2D EXPORT") || text.includes("D2D IMPORT"));
}

function isMexicoRate(row: Record<string, unknown>) {
  return textIncludesAny(rateText(row), ["mexico", "mx", "monterrey", "nuevo leon", "apodaca", "queretaro", "bajio", "laredo", "lerma", "toluca"]) ||
    [row.origin_country, row.destination_country].some((value) => catalogKey(value) === "MX");
}

function numericAmount(value: unknown) {
  const cleaned = cleanRateText(value);
  return cleaned ? Number(cleaned) : null;
}

function vendorSearchText(vendor: Record<string, unknown>) {
  return [
    vendor.vendor_name,
    vendor.legal_name,
    vendor.domain,
    vendor.primary_email,
    vendor.coverage_notes,
    vendor.notes,
    ...arrayValues(vendor.tags)
  ].filter(Boolean).join(" ");
}

function createVendorMetrics(vendor: Record<string, unknown>, rates: Record<string, unknown>[]) {
  const vendorDomain = normalizeDomain(vendor.domain);
  const emails = vendorEmails(vendor);
  const linkedRates = rates.filter((row) => {
    if (row.vendor_id && vendor.id && row.vendor_id === vendor.id) return true;
    const rowDomain = normalizeDomain(row.vendor_domain);
    return Boolean(rowDomain && (rowDomain === vendorDomain || emails.some((email) => email.endsWith(`@${rowDomain}`))));
  });
  const approvedRates = linkedRates.filter((row) => row.status === "approved");
  const crossborderRates = linkedRates.filter(isCrossBorderRate);
  const d2dImportExportRates = linkedRates.filter(isD2dImportExportRate);
  const mexicoRates = linkedRates.filter(isMexicoRate);
  const rateAmounts = linkedRates.map((row) => numericAmount(row.all_in_rate)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const costPerMileValues = linkedRates.map((row) => biNumber(row, "cost_per_mile")).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const costPerKmValues = linkedRates.map((row) => biNumber(row, "cost_per_km")).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const marketSet = new Set<string>();
  const laneSet = new Set<string>();
  const equipmentSet = new Set<string>();
  const borderSet = new Set<string>();
  let lastQuoteDate: string | null = null;

  for (const row of linkedRates) {
    [row.origin_market, row.destination_market].map(cleanText).filter(Boolean).forEach((value) => marketSet.add(value as string));
    [row.equipment, row.trailer].map(cleanText).filter(Boolean).forEach((value) => equipmentSet.add(value as string));
    [row.mx_border_crossing_point && row.us_border_crossing_point ? `${row.mx_border_crossing_point} / ${row.us_border_crossing_point}` : null]
      .map(cleanText)
      .filter(Boolean)
      .forEach((value) => borderSet.add(value as string));
    const lane = [row.origin || row.normalized_origin, row.destination || row.normalized_destination].map(cleanText).filter(Boolean).join(" -> ");
    if (lane) laneSet.add(lane);
    const quoteDate = cleanText(row.quote_date);
    if (quoteDate && (!lastQuoteDate || quoteDate > lastQuoteDate)) lastQuoteDate = quoteDate;
  }

  return {
    linked_rates: linkedRates.length,
    approved_rates: approvedRates.length,
    pending_rates: linkedRates.filter((row) => row.status === "pending_review").length,
    crossborder_rates: crossborderRates.length,
    d2d_import_export_rates: d2dImportExportRates.length,
    mexico_rates: mexicoRates.length,
    avg_all_in_rate: rateAmounts.length ? Math.round(rateAmounts.reduce((sum, value) => sum + value, 0) / rateAmounts.length) : null,
    avg_cost_per_mile: costPerMileValues.length ? Math.round((costPerMileValues.reduce((sum, value) => sum + value, 0) / costPerMileValues.length) * 100) / 100 : null,
    avg_cost_per_km: costPerKmValues.length ? Math.round((costPerKmValues.reduce((sum, value) => sum + value, 0) / costPerKmValues.length) * 100) / 100 : null,
    markets: [...marketSet].slice(0, 8),
    lanes: [...laneSet].slice(0, 6),
    equipment: [...equipmentSet].slice(0, 6),
    border_pairs: [...borderSet].slice(0, 6),
    last_quote_date: lastQuoteDate
  };
}

function scoreCarrierFit(vendor: Record<string, unknown>, metrics: Record<string, unknown>, intent: ReturnType<typeof carrierIntelligenceIntent>) {
  const text = vendorSearchText(vendor);
  const tags = arrayValues(vendor.tags).map((tag) => tag.toLowerCase());
  const status = cleanText(vendor.status)?.toLowerCase();
  const baseStage = cleanText(vendor.base_stage)?.toLowerCase();
  let score = 35;
  const evidence: string[] = [];
  const gaps: string[] = [];

  if (status === "active") score += 15;
  if (status === "invited") score += 9;
  if (status === "inactive") {
    score -= 12;
    gaps.push("Inactive vendor record");
  }
  if (status === "blocked") {
    score -= 70;
    gaps.push("Blocked vendor record");
  }
  if (baseStage === "procurement") {
    score += 12;
    evidence.push("Already in Procurement Base");
  } else if (baseStage === "sourcing") {
    score += intent.addTargets ? 14 : 8;
    evidence.push("Available in Sourcing Base");
  } else if (baseStage === "archived") {
    score -= 20;
    gaps.push("Archived vendor");
  }

  if (vendor.primary_email) score += 8;
  else gaps.push("Missing email");
  if (vendor.whatsapp_phone) score += 5;
  if (vendor.domain) score += 5;
  else gaps.push("Missing domain");
  if (vendor.coverage_notes) score += 6;
  if (tags.includes("alta") || tags.includes("high-confidence") || tags.includes("verified")) {
    score += 10;
    evidence.push("High-confidence vendor tag");
  }

  const linkedRates = Number(metrics.linked_rates || 0);
  const approvedRates = Number(metrics.approved_rates || 0);
  const crossborderRates = Number(metrics.crossborder_rates || 0);
  const d2dImportExportRates = Number(metrics.d2d_import_export_rates || 0);
  const mexicoRates = Number(metrics.mexico_rates || 0);
  if (approvedRates) {
    score += Math.min(24, approvedRates * 4);
    evidence.push(`${approvedRates} approved Rateware row(s)`);
  } else if (linkedRates) {
    score += Math.min(12, linkedRates * 2);
    evidence.push(`${linkedRates} linked staging/rate row(s)`);
  }
  if (metrics.last_quote_date) evidence.push(`Last quote ${metrics.last_quote_date}`);
  if (Array.isArray(metrics.markets) && metrics.markets.length) evidence.push(`Markets: ${metrics.markets.slice(0, 3).join(", ")}`);
  if (Array.isArray(metrics.equipment) && metrics.equipment.length) evidence.push(`Equipment: ${metrics.equipment.slice(0, 3).join(", ")}`);
  if (intent.border && Array.isArray(metrics.border_pairs) && metrics.border_pairs.length) {
    evidence.push(`Border pairs: ${metrics.border_pairs.slice(0, 3).join(", ")}`);
    score += 8;
  }
  if (intent.costPerMile) {
    if (metrics.avg_cost_per_mile) evidence.push(`Avg cost per mile: ${metrics.avg_cost_per_mile}`);
    else gaps.push("Missing miles or all-in rate for cost per mile");
  }
  if (intent.costPerKm) {
    if (metrics.avg_cost_per_km) evidence.push(`Avg cost per km: ${metrics.avg_cost_per_km}`);
    else gaps.push("Missing km or all-in rate for cost per km");
  }

  if (intent.crossborder) {
    if (textIncludesAny(text, ["cross-border", "crossborder", "usa", "united states", "laredo", "border", "internacional"]) || crossborderRates) {
      score += 30 + Math.min(18, crossborderRates * 5);
      evidence.push(crossborderRates ? `${crossborderRates} cross-border rate signal(s)` : "Cross-border coverage signal");
    } else {
      score -= 18;
      gaps.push("No clear cross-border coverage signal");
    }
  }

  if (intent.d2d) {
    if (d2dImportExportRates) {
      score += Math.min(25, d2dImportExportRates * 6);
      evidence.push(`${d2dImportExportRates} D2D Import/Export quote transaction(s)`);
    } else {
      score -= 16;
      gaps.push("No D2D Import/Export quote transactions");
    }
  }

  if (intent.mexico) {
    if (textIncludesAny(text, ["mexico", "mexicano", "mx", "monterrey", "nuevo leon", "bajio", "norte", "centro"]) || mexicoRates) {
      score += 22 + Math.min(12, mexicoRates * 4);
      evidence.push(mexicoRates ? `${mexicoRates} Mexico lane signal(s)` : "Mexico coverage signal");
    } else {
      score -= 8;
    }
  }

  if (intent.hazmat) {
    if (textIncludesAny(text, ["hazmat", "hazard", "peligroso", "quimico"])) score += 18;
    else gaps.push("No hazmat signal");
  }
  if (intent.reefer) {
    if (textIncludesAny(text, ["reefer", "refrigerado", "temperature", "temperatura"])) score += 18;
    else gaps.push("No reefer signal");
  }
  if (intent.flatbed) {
    if (textIncludesAny(text, ["flatbed", "plana", "plataforma"])) score += 18;
    else gaps.push("No flatbed signal");
  }

  if (!evidence.length) evidence.push("Vendor exists in the user's carrier base");
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    evidence: [...new Set(evidence)].slice(0, 6),
    gaps: [...new Set(gaps)].slice(0, 4)
  };
}

function paretoCoverageTarget(prompt: string) {
  const explicit = prompt.match(/\b(\d{1,3})\s*%/g)?.map((value) => Number(value.replace(/\D/g, ""))) || [];
  const highPercent = explicit.find((value) => value >= 50 && value <= 100);
  return (highPercent || 80) / 100;
}

function paretoCarrierShare(prompt: string) {
  const explicit = prompt.match(/\b(\d{1,3})\s*%/g)?.map((value) => Number(value.replace(/\D/g, ""))) || [];
  const lowPercent = explicit.find((value) => value > 0 && value < 50);
  return (lowPercent || 20) / 100;
}

function deterministicCarrierRecommendations(prompt: string, vendors: Record<string, unknown>[], rates: Record<string, unknown>[]) {
  const intent = carrierIntelligenceIntent(prompt);
  const limit = intent.pareto ? 100 : extractRecommendationLimit(prompt);
  const scoredRecommendations = vendors
    .map((vendor) => {
      const metrics = createVendorMetrics(vendor, rates);
      const fit = scoreCarrierFit(vendor, metrics, intent);
      const baseStage = cleanText(vendor.base_stage);
      const recommendedAction = baseStage === "procurement"
        ? "Keep in Procurement Base and invite to the next RFx."
        : baseStage === "archived"
          ? "Review before reactivating; archived vendors need validation."
          : "Promote to Procurement Base after validating contact and coverage.";
      return {
        vendor_id: cleanText(vendor.id),
        vendor_name: cleanText(vendor.vendor_name) || "Unnamed vendor",
        domain: normalizeDomain(vendor.domain),
        primary_email: normalizeEmail(vendor.primary_email),
        base_stage: baseStage,
        status: cleanText(vendor.status),
        fit_score: fit.score,
        why: fit.evidence.slice(0, 3).join("; "),
        evidence: fit.evidence,
        gaps: fit.gaps,
        recommended_action: recommendedAction,
        metrics
      };
    })
    .filter((item) => item.fit_score > 0);

  let scopedRecommendations = scoredRecommendations;
  let dataScope = "User-scoped vendors, sourcing/procurement stages, linked staging rows, and approved Rateware rows.";
  let answerPrefix = `I found carrier recommendation(s) from your vendor and Rateware data.`;

  if (intent.pareto) {
    const transactionMetric = intent.crossborder || intent.d2d ? "d2d_import_export_rates" : "linked_rates";
    const paretoCandidates = scoredRecommendations
      .filter((item) => Number(item.metrics?.[transactionMetric] || 0) > 0)
      .sort((a, b) => Number(b.metrics?.[transactionMetric] || 0) - Number(a.metrics?.[transactionMetric] || 0) || b.fit_score - a.fit_score);
    const totalTransactions = paretoCandidates.reduce((sum, item) => sum + Number(item.metrics?.[transactionMetric] || 0), 0);
    const coverageTarget = paretoCoverageTarget(prompt);
    const carrierShare = paretoCarrierShare(prompt);
    const carrierLimit = Math.max(1, Math.ceil(paretoCandidates.length * carrierShare));
    let accumulated = 0;
    const selected: typeof paretoCandidates = [];

    for (const item of paretoCandidates) {
      if (selected.length >= Math.max(carrierLimit, limit)) break;
      const transactions = Number(item.metrics?.[transactionMetric] || 0);
      accumulated += transactions;
      const transactionShare = totalTransactions ? transactions / totalTransactions : 0;
      const cumulativeShare = totalTransactions ? accumulated / totalTransactions : 0;
      selected.push({
        ...item,
        fit_score: Math.max(item.fit_score, Math.round(transactionShare * 100)),
        why: `${transactions} quoted transaction(s); ${(cumulativeShare * 100).toFixed(1)}% cumulative coverage`,
        evidence: [
          `${transactions} ${intent.crossborder || intent.d2d ? "D2D Import/Export" : "linked"} quoted transaction(s)`,
          `${(transactionShare * 100).toFixed(1)}% individual transaction share`,
          `${(cumulativeShare * 100).toFixed(1)}% cumulative transaction coverage`,
          ...(item.evidence || [])
        ].slice(0, 6),
        recommended_action: cumulativeShare <= coverageTarget
          ? "Core Pareto carrier. Prioritize for Procurement Base and RFx invitations."
          : item.recommended_action
      });
      if (cumulativeShare >= coverageTarget && selected.length >= carrierLimit) break;
    }

    scopedRecommendations = selected;
    dataScope = `Pareto analysis on ${intent.crossborder || intent.d2d ? "D2D Import/Export cross-border" : "linked"} quote transactions. Transaction means one linked staging or approved Rateware row.`;
    answerPrefix = selected.length
      ? `Pareto cut found ${selected.length} carrier(s) covering approximately ${Math.min(100, (accumulated / Math.max(totalTransactions, 1)) * 100).toFixed(1)}% of quoted transactions.`
      : "No carriers have enough linked D2D Import/Export quote transactions for Pareto analysis yet.";
  }

  const recommendations = scopedRecommendations
    .sort((a, b) => {
      if (intent.pareto) {
        return Number(b.metrics?.d2d_import_export_rates || b.metrics?.linked_rates || 0) - Number(a.metrics?.d2d_import_export_rates || a.metrics?.linked_rates || 0);
      }
      if (intent.costPerMile) {
        const aCost = Number(a.metrics?.avg_cost_per_mile || Number.POSITIVE_INFINITY);
        const bCost = Number(b.metrics?.avg_cost_per_mile || Number.POSITIVE_INFINITY);
        return aCost - bCost || b.fit_score - a.fit_score;
      }
      if (intent.costPerKm) {
        const aCost = Number(a.metrics?.avg_cost_per_km || Number.POSITIVE_INFINITY);
        const bCost = Number(b.metrics?.avg_cost_per_km || Number.POSITIVE_INFINITY);
        return aCost - bCost || b.fit_score - a.fit_score;
      }
      return b.fit_score - a.fit_score || String(a.vendor_name).localeCompare(String(b.vendor_name));
    })
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    answer: recommendations.length
      ? answerPrefix
      : "I could not find matching carriers in your vendor base yet.",
    filters: {
      limit,
      focus: intent.focus,
      data_scope: dataScope
    },
    recommendations,
    next_actions: [
      intent.pareto ? "Use this as a transaction concentration view, not a generic carrier quality list." : "Validate missing contacts before sending RFx invitations.",
      intent.pareto ? "Review carriers outside the Pareto cut for niche lane coverage before excluding them." : "Promote high-fit sourcing carriers to Procurement Base.",
      "Keep uploading carrier quotes so Rateware can learn lane-level coverage from actual submissions."
    ],
    model_status: "deterministic",
    candidate_count: vendors.length,
    rate_signal_count: rates.length
  };
}

function compactCarrierFact(item: Record<string, unknown>) {
  return {
    vendor_id: item.vendor_id,
    vendor_name: item.vendor_name,
    domain: item.domain,
    primary_email: item.primary_email,
    base_stage: item.base_stage,
    status: item.status,
    fit_score: item.fit_score,
    evidence: item.evidence,
    gaps: item.gaps,
    metrics: item.metrics
  };
}

async function requestCarrierIntelligence(prompt: string, fallback: Record<string, unknown>) {
  if (!OPENAI_API_KEY || !OPENAI_MODEL) {
    return {
      ...fallback,
      model_status: "fallback",
      model_error: "OPENAI_API_KEY or OPENAI_MODEL is not configured."
    };
  }

  const candidates = Array.isArray(fallback.recommendations) ? fallback.recommendations.slice(0, 140).map(compactCarrierFact) : [];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: [
              "You are Rateware Carrier Intelligence, a senior freight procurement analyst.",
              "Recommend carriers only from the provided user-scoped vendor facts.",
              "Do not invent carriers, emails, domains, certifications, lanes, or rates.",
              "Rank carriers by operational fit, coverage evidence, contact readiness, and Rateware lane signals.",
              "When deterministic_result.filters.focus includes pareto, preserve the Pareto ordering and explain the result as transaction concentration.",
              "For Pareto, do not replace transaction-share ranking with generic quality scoring.",
              "For D2D Import/Export cross-border questions, use d2d_import_export_rates as the primary transaction signal.",
              "For route, corridor, market, state, equipment, operation, service, border crossing, cost per mile, or cost per km questions, explain which available facts support the answer and which facts are missing.",
              "If the provided facts are not enough for the requested slice, say that the slice needs more linked quotes or normalized mileage before recommending carriers.",
              "If the user asks for carriers to onboard or dar de alta, prioritize strong Sourcing Base candidates, but include Procurement Base carriers when they are clearly relevant.",
              "Use concise Spanish unless the user writes in English."
            ].join("\n")
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              instruction: prompt,
              deterministic_result: {
                filters: fallback.filters,
                candidate_count: fallback.candidate_count,
                rate_signal_count: fallback.rate_signal_count
              },
              candidates
            })
          }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "carrier_intelligence",
          strict: true,
          schema: CARRIER_INTELLIGENCE_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      ...fallback,
      model_status: "fallback",
      model_error: message
    };
  }

  const payload = await response.json();
  const outputText = payload.output_text ?? payload.output?.flatMap((item: Record<string, unknown>) => item.content ?? [])
    .find((content: Record<string, unknown>) => content.type === "output_text")?.text;

  if (!outputText) {
    return {
      ...fallback,
      model_status: "fallback",
      model_error: "OpenAI returned no carrier intelligence output."
    };
  }

  const parsed = JSON.parse(outputText);
  return {
    ...parsed,
    model_status: "ai",
    candidate_count: fallback.candidate_count,
    rate_signal_count: fallback.rate_signal_count
  };
}

async function buildCarrierIntelligence(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, prompt: string) {
  const instruction = cleanText(prompt) || "Recommend the best carriers to add to Procurement Base.";
  const [vendorsResult, ratesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails,whatsapp_phone,status,base_stage,tags,coverage_notes,notes,preferred_channel,created_at")
      .eq("owner_email", user.owner_email)
      .limit(1000),
    supabase
      .from("rate_staging")
      .select("id,vendor_id,vendor_domain,status,origin,destination,normalized_origin,normalized_destination,origin_country,destination_country,origin_state,destination_state,origin_market,destination_market,equipment,trailer,operation,service,mx_border_crossing_point,us_border_crossing_point,mx_linehaul,us_linehaul,us_miles,fsc,border_crossing_fee,all_in_rate,currency,weekly_capacity,quote_date,hazmat,temperature_controlled,calculated_miles,calculated_km")
      .in("status", ["pending_review", "approved"])
      .limit(1500)
  ]);

  if (vendorsResult.error) throw vendorsResult.error;
  if (ratesResult.error) throw ratesResult.error;

  const fallback = deterministicCarrierRecommendations(instruction, vendorsResult.data || [], ratesResult.data || []);
  return await requestCarrierIntelligence(instruction, fallback);
}

function recommendationIntentFromConfig(config: Record<string, unknown>) {
  const filters = typeof config.filters === "object" && config.filters ? config.filters as Record<string, unknown> : {};
  const rankingMode = cleanText(config.ranking_mode) || "fit";
  const focus = ["structured-recommendation", rankingMode];
  const crossborder = Boolean(filters.crossborder);
  const d2d = Boolean(filters.d2d);
  const hazmat = Boolean(filters.hazmat);
  const reefer = Boolean(filters.temperature_controlled);
  const flatbed = textIncludesAny([filters.trailer, filters.equipment].filter(Boolean).join(" "), ["flatbed", "plana", "plataforma"]);
  const border = Boolean(filters.mx_crossing || filters.us_crossing || filters.border_pair);
  const costPerMile = rankingMode === "cost_per_mile";
  const costPerKm = rankingMode === "cost_per_km";
  const pareto = rankingMode === "pareto";
  const mexico = textIncludesAny(Object.values(filters).join(" "), ["mexico", "mx", "monterrey", "nuevo leon", "bajio", "norte", "centro"]);
  if (crossborder) focus.push("cross-border");
  if (d2d) focus.push("d2d-import-export");
  if (border) focus.push("border-crossing");
  if (hazmat) focus.push("hazmat");
  if (reefer) focus.push("reefer");
  if (costPerMile) focus.push("cost-per-mile");
  if (costPerKm) focus.push("cost-per-km");
  if (pareto) focus.push("pareto");
  return { crossborder, d2d, pareto, mexico, addTargets: true, hazmat, reefer, flatbed, costPerMile, costPerKm, border, focus };
}

function carrierScoreBreakdown(vendor: Record<string, unknown>, metrics: Record<string, unknown>, intent: ReturnType<typeof carrierIntelligenceIntent>, filters: Record<string, unknown>) {
  const breakdown: Array<{ label: string; value: number; detail: string }> = [];
  const status = cleanText(vendor.status)?.toLowerCase();
  const baseStage = cleanText(vendor.base_stage)?.toLowerCase();
  const linkedRates = Number(metrics.linked_rates || 0);
  const approvedRates = Number(metrics.approved_rates || 0);
  const crossborderRates = Number(metrics.crossborder_rates || 0);
  const d2dRates = Number(metrics.d2d_import_export_rates || 0);
  const contactReady = Boolean(vendor.primary_email || vendor.whatsapp_phone);
  const sliceTerms = Object.entries(filters || {})
    .filter(([, value]) => value !== true && value !== false && cleanText(value))
    .map(([keyName, value]) => `${keyName}: ${value}`);

  breakdown.push({
    label: "Base",
    value: baseStage === "procurement" ? 14 : baseStage === "sourcing" ? 10 : baseStage === "archived" ? -15 : 0,
    detail: baseStage || "missing base stage"
  });
  breakdown.push({
    label: "Status",
    value: status === "active" ? 14 : status === "invited" ? 8 : status === "blocked" ? -60 : status === "inactive" ? -10 : 0,
    detail: status || "missing status"
  });
  breakdown.push({
    label: "Contact",
    value: contactReady ? 10 : -8,
    detail: contactReady ? "email or WhatsApp available" : "missing contact channel"
  });
  breakdown.push({
    label: "Rate history",
    value: Math.min(26, approvedRates * 5 + Math.max(0, linkedRates - approvedRates) * 2),
    detail: `${approvedRates} approved / ${linkedRates} linked transaction(s)`
  });
  if (intent.crossborder || intent.d2d) {
    breakdown.push({
      label: "Crossborder fit",
      value: Math.min(24, (intent.d2d ? d2dRates : crossborderRates) * 6),
      detail: intent.d2d ? `${d2dRates} D2D Import/Export transaction(s)` : `${crossborderRates} crossborder transaction(s)`
    });
  }
  if (intent.costPerMile) {
    breakdown.push({
      label: "Cost/mile readiness",
      value: metrics.avg_cost_per_mile ? 10 : -12,
      detail: metrics.avg_cost_per_mile ? `avg ${metrics.avg_cost_per_mile}` : "missing all-in or miles"
    });
  }
  if (intent.costPerKm) {
    breakdown.push({
      label: "Cost/km readiness",
      value: metrics.avg_cost_per_km ? 10 : -12,
      detail: metrics.avg_cost_per_km ? `avg ${metrics.avg_cost_per_km}` : "missing all-in or km"
    });
  }
  if (sliceTerms.length) {
    breakdown.push({
      label: "Requested slice",
      value: linkedRates > 0 ? 12 : -18,
      detail: linkedRates > 0 ? sliceTerms.slice(0, 3).join(" | ") : "no transactions in selected slice"
    });
  }
  return breakdown;
}

function recommendationSortValue(row: Record<string, unknown>, rankingMode: string) {
  const metrics = typeof row.metrics === "object" && row.metrics ? row.metrics as Record<string, unknown> : {};
  if (rankingMode === "transactions") return -Number(metrics.linked_rates || 0);
  if (rankingMode === "approved") return -Number(metrics.approved_rates || 0);
  if (rankingMode === "pareto") return -Number(metrics.d2d_import_export_rates || metrics.crossborder_rates || metrics.linked_rates || 0);
  if (rankingMode === "cost_per_mile") return Number(metrics.avg_cost_per_mile || Number.POSITIVE_INFINITY);
  if (rankingMode === "cost_per_km") return Number(metrics.avg_cost_per_km || Number.POSITIVE_INFINITY);
  return -Number(row.fit_score || 0);
}

async function buildCarrierRecommendations(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, config: Record<string, unknown>) {
  const filters = typeof config.filters === "object" && config.filters ? config.filters as Record<string, unknown> : {};
  const rankingMode = cleanText(config.ranking_mode) || "fit";
  const limit = Math.min(Math.max(Number(config.limit) || 30, 1), 100);
  const minTransactions = Math.max(Number(config.min_transactions) || 0, 0);
  const intent = recommendationIntentFromConfig(config);
  const [vendorsResult, rates] = await Promise.all([
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails,whatsapp_phone,status,base_stage,tags,coverage_notes,notes,preferred_channel,created_at")
      .eq("owner_email", user.owner_email)
      .limit(1000),
    fetchBusinessIntelligenceRows(supabase, user)
  ]);
  if (vendorsResult.error) throw vendorsResult.error;

  const filteredRates = filterBiRows(rates, filters);
  const vendorTerm = cleanText(filters.vendor);
  const candidates = (vendorsResult.data || [])
    .filter((vendor) => !vendorTerm || catalogKey(vendorSearchText(vendor)).includes(catalogKey(vendorTerm)))
    .map((vendor) => {
      const metrics = createVendorMetrics(vendor, filteredRates);
      const fit = scoreCarrierFit(vendor, metrics, intent);
      const breakdown = carrierScoreBreakdown(vendor, metrics, intent, filters);
      const score = Math.max(0, Math.min(100, fit.score + Math.round(breakdown.reduce((sum, item) => sum + item.value, 0) / 8)));
      const linkedRates = Number(metrics.linked_rates || 0);
      return {
        vendor_id: cleanText(vendor.id),
        vendor_name: cleanText(vendor.vendor_name) || "Unnamed vendor",
        domain: normalizeDomain(vendor.domain),
        primary_email: normalizeEmail(vendor.primary_email),
        base_stage: cleanText(vendor.base_stage),
        status: cleanText(vendor.status),
        fit_score: score,
        why: fit.evidence.slice(0, 3).join("; "),
        evidence: fit.evidence,
        gaps: fit.gaps,
        score_breakdown: breakdown,
        recommended_action: cleanText(vendor.base_stage) === "procurement"
          ? "Keep in Procurement Base and include in the next matching RFx."
          : "Promote to Procurement Base if contact and coverage are valid.",
        metrics,
        _linked_rates: linkedRates
      };
    })
    .filter((row) => Number(row._linked_rates || 0) >= minTransactions)
    .filter((row) => rankingMode === "cost_per_mile" ? row.metrics.avg_cost_per_mile : true)
    .filter((row) => rankingMode === "cost_per_km" ? row.metrics.avg_cost_per_km : true);

  let ranked = candidates.sort((a, b) => recommendationSortValue(a, rankingMode) - recommendationSortValue(b, rankingMode) || b.fit_score - a.fit_score);
  if (rankingMode === "pareto") {
    const total = ranked.reduce((sum, row) => sum + Number(row.metrics.d2d_import_export_rates || row.metrics.crossborder_rates || row.metrics.linked_rates || 0), 0);
    let cumulative = 0;
    ranked = ranked.map((row) => {
      const transactions = Number(row.metrics.d2d_import_export_rates || row.metrics.crossborder_rates || row.metrics.linked_rates || 0);
      cumulative += transactions;
      return {
        ...row,
        why: `${transactions} transaction(s); ${total ? ((cumulative / total) * 100).toFixed(1) : "0.0"}% cumulative`,
        evidence: [
          `${transactions} transaction(s) in selected slice`,
          `${total ? ((transactions / total) * 100).toFixed(1) : "0.0"}% individual share`,
          `${total ? ((cumulative / total) * 100).toFixed(1) : "0.0"}% cumulative share`,
          ...(row.evidence || [])
        ].slice(0, 6)
      };
    });
  }

  const recommendations = ranked.slice(0, limit).map((row, index) => {
    const { _linked_rates, ...publicRow } = row;
    return { ...publicRow, rank: index + 1 };
  });

  return {
    answer: `${recommendations.length} carrier recommendation(s) ranked by ${rankingMode}.`,
    filters: {
      limit,
      focus: intent.focus,
      ranking_mode: rankingMode,
      min_transactions: minTransactions,
      data_scope: "Structured recommendation engine over user vendors and filtered staging/Rateware transactions."
    },
    recommendations,
    next_actions: [
      "Review score breakdown before promoting a carrier.",
      "Use min transactions to avoid over-ranking carriers with one-off quotes.",
      "Use the pivot drilldown to validate the underlying lanes before RFx outreach."
    ],
    candidate_count: vendorsResult.data?.length || 0,
    rate_signal_count: filteredRates.length,
    model_status: "deterministic"
  };
}

const BI_DIMENSIONS = [
  { key: "vendor", label: "Carrier" },
  { key: "vendor_domain", label: "Carrier domain" },
  { key: "vendor_stage", label: "Vendor base" },
  { key: "vendor_status", label: "Vendor status" },
  { key: "route", label: "Route" },
  { key: "corridor", label: "Corridor" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "origin_market", label: "Origin market" },
  { key: "destination_market", label: "Destination market" },
  { key: "origin_state", label: "Origin state" },
  { key: "destination_state", label: "Destination state" },
  { key: "origin_country", label: "Origin country" },
  { key: "destination_country", label: "Destination country" },
  { key: "equipment", label: "Equipment" },
  { key: "trailer", label: "Trailer" },
  { key: "hazmat", label: "Hazmat" },
  { key: "temperature_controlled", label: "Temperature controlled" },
  { key: "operation", label: "Operation" },
  { key: "service", label: "Service" },
  { key: "mx_crossing", label: "MX crossing" },
  { key: "us_crossing", label: "US crossing" },
  { key: "border_pair", label: "Border pair" },
  { key: "quote_month", label: "Quote month" },
  { key: "currency", label: "Currency" },
  { key: "rate_status", label: "Rate status" }
];

const BI_METRICS = [
  { key: "transaction_count", label: "Transactions", default_aggregation: "count" },
  { key: "distinct_carriers", label: "Distinct carriers", default_aggregation: "distinct" },
  { key: "all_in_rate", label: "All-in rate", default_aggregation: "avg" },
  { key: "cost_per_mile", label: "Cost per mile", default_aggregation: "avg" },
  { key: "cost_per_km", label: "Cost per km", default_aggregation: "avg" },
  { key: "calculated_miles", label: "Calculated miles", default_aggregation: "avg" },
  { key: "calculated_km", label: "Calculated km", default_aggregation: "avg" },
  { key: "us_miles", label: "US miles", default_aggregation: "avg" },
  { key: "mx_linehaul", label: "MX linehaul", default_aggregation: "avg" },
  { key: "us_linehaul", label: "US linehaul", default_aggregation: "avg" },
  { key: "fsc", label: "FSC", default_aggregation: "avg" },
  { key: "border_crossing_fee", label: "Border fee", default_aggregation: "avg" }
];

function biText(row: Record<string, unknown>) {
  const vendor = typeof row.vendors === "object" && row.vendors ? row.vendors as Record<string, unknown> : {};
  return [
    vendor.vendor_name,
    vendor.domain,
    row.vendor_domain,
    row.origin,
    row.destination,
    row.normalized_origin,
    row.normalized_destination,
    row.origin_market,
    row.destination_market,
    row.origin_state,
    row.destination_state,
    row.origin_country,
    row.destination_country,
    row.operation,
    row.service,
    row.equipment,
    row.trailer,
    row.mx_border_crossing_point,
    row.us_border_crossing_point,
    row.rfx_id
  ].filter(Boolean).join(" ");
}

function biDimensionValue(row: Record<string, unknown>, keyName: string) {
  const vendor = typeof row.vendors === "object" && row.vendors ? row.vendors as Record<string, unknown> : {};
  const origin = cleanText(row.normalized_origin || row.origin) || "-";
  const destination = cleanText(row.normalized_destination || row.destination) || "-";
  const originMarket = cleanText(row.origin_market) || "-";
  const destinationMarket = cleanText(row.destination_market) || "-";
  const mxCrossing = cleanText(row.mx_border_crossing_point) || "-";
  const usCrossing = cleanText(row.us_border_crossing_point) || "-";

  const values: Record<string, unknown> = {
    vendor: vendor.vendor_name || row.vendor_domain || "Unmatched carrier",
    vendor_domain: row.vendor_domain || vendor.domain || "-",
    vendor_stage: vendor.base_stage || "-",
    vendor_status: vendor.status || "-",
    route: `${origin} -> ${destination}`,
    corridor: `${originMarket} -> ${destinationMarket}`,
    origin,
    destination,
    origin_market: originMarket,
    destination_market: destinationMarket,
    origin_state: row.origin_state || "-",
    destination_state: row.destination_state || "-",
    origin_country: row.origin_country || "-",
    destination_country: row.destination_country || "-",
    equipment: row.equipment || "-",
    trailer: row.trailer || "-",
    hazmat: row.hazmat ? "Hazmat" : "Non-hazmat",
    temperature_controlled: row.temperature_controlled ? "Temp controlled" : "Ambient",
    operation: row.operation || "-",
    service: row.service || "-",
    mx_crossing: mxCrossing,
    us_crossing: usCrossing,
    border_pair: `${mxCrossing} / ${usCrossing}`,
    quote_month: cleanText(row.quote_date)?.slice(0, 7) || "-",
    currency: row.currency || "-",
    rate_status: row.status || "-"
  };
  return cleanText(values[keyName]) || "-";
}

function biNumber(row: Record<string, unknown>, metric: string) {
  if (metric === "all_in_rate") return numericAmount(row.all_in_rate);
  if (metric === "us_miles") return numericAmount(row.us_miles);
  if (["calculated_miles", "calculated_km"].includes(metric)) {
    const value = Number(row[metric]);
    return Number.isFinite(value) ? value : null;
  }
  if (["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].includes(metric)) return numericAmount(row[metric]);
  if (metric === "cost_per_mile") {
    const rate = numericAmount(row.all_in_rate);
    const miles = Number(row.calculated_miles) || Number(numericAmount(row.us_miles));
    return rate && miles ? rate / miles : null;
  }
  if (metric === "cost_per_km") {
    const rate = numericAmount(row.all_in_rate);
    const km = Number(row.calculated_km) || ((Number(row.calculated_miles) || Number(numericAmount(row.us_miles))) * 1.60934);
    return rate && km ? rate / km : null;
  }
  return null;
}

function biMatchesFilter(row: Record<string, unknown>, keyName: string, value: unknown) {
  const text = cleanText(value);
  if (!text) return true;
  if (keyName === "search") return catalogKey(biText(row)).includes(catalogKey(text));
  if (keyName === "crossborder") return !value || isCrossBorderRate(row);
  if (keyName === "d2d") return !value || isD2dImportExportRate(row);
  const rowValue = biDimensionValue(row, keyName);
  return catalogKey(rowValue).includes(catalogKey(text));
}

function filterBiRows(rows: Record<string, unknown>[], filters: Record<string, unknown>) {
  return rows.filter((row) => Object.entries(filters || {}).every(([keyName, value]) => {
    if (Array.isArray(value)) return value.length === 0 || value.some((item) => biMatchesFilter(row, keyName, item));
    return biMatchesFilter(row, keyName, value);
  }));
}

function aggregateBiRows(rows: Record<string, unknown>[], metric: string, aggregation: string) {
  if (metric === "transaction_count" || aggregation === "count") return rows.length;
  if (metric === "distinct_carriers" || aggregation === "distinct") {
    return new Set(rows.map((row) => biDimensionValue(row, "vendor")).filter(Boolean)).size;
  }

  const values = rows
    .map((row) => biNumber(row, metric))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  if (aggregation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatBiValue(value: unknown, metric: string) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (metric === "cost_per_mile" || metric === "cost_per_km") return Math.round(number * 100) / 100;
  if (metric === "transaction_count" || metric === "distinct_carriers") return Math.round(number);
  return Math.round(number * 100) / 100;
}

function buildBusinessIntelligencePivot(rows: Record<string, unknown>[], config: Record<string, unknown>) {
  const rowDimensions = (Array.isArray(config.rows) ? config.rows : ["vendor"]).map(String).filter(Boolean).slice(0, 3);
  const columnDimensions = (Array.isArray(config.columns) ? config.columns : ["operation"]).map(String).filter(Boolean).slice(0, 2);
  const metric = cleanText(config.metric) || "transaction_count";
  const defaultAggregation = BI_METRICS.find((item) => item.key === metric)?.default_aggregation || "avg";
  const aggregation = cleanText(config.aggregation) || defaultAggregation;
  const filters = typeof config.filters === "object" && config.filters ? config.filters as Record<string, unknown> : {};
  const filteredRows = filterBiRows(rows, filters);
  const columnLabels = new Set<string>();
  const groups = new Map<string, { row_values: string[]; cells: Map<string, Record<string, unknown>[]>; source_rows: Record<string, unknown>[] }>();
  const totalColumn = "Total";

  for (const row of filteredRows) {
    const rowValues = rowDimensions.map((dimension) => biDimensionValue(row, dimension));
    const rowKey = rowValues.join(" | ") || totalColumn;
    const columnValues = columnDimensions.length ? columnDimensions.map((dimension) => biDimensionValue(row, dimension)) : [totalColumn];
    const columnKey = columnValues.join(" | ") || totalColumn;
    columnLabels.add(columnKey);
    if (!groups.has(rowKey)) groups.set(rowKey, { row_values: rowValues, cells: new Map(), source_rows: [] });
    const group = groups.get(rowKey)!;
    group.source_rows.push(row);
    if (!group.cells.has(columnKey)) group.cells.set(columnKey, []);
    group.cells.get(columnKey)!.push(row);
  }

  const columns = [...columnLabels].sort((a, b) => a.localeCompare(b)).slice(0, 80);
  const matrixRows = [...groups.entries()]
    .map(([rowKey, group]) => {
      const cells: Record<string, unknown> = {};
      for (const column of columns) {
        cells[column] = formatBiValue(aggregateBiRows(group.cells.get(column) || [], metric, aggregation), metric);
      }
      return {
        row_key: rowKey,
        row_values: group.row_values,
        cells,
        total: formatBiValue(aggregateBiRows(group.source_rows, metric, aggregation), metric),
        transactions: group.source_rows.length
      };
    })
    .sort((a, b) => Number(b.transactions || 0) - Number(a.transactions || 0))
    .slice(0, 300);

  const carrierSet = new Set(filteredRows.map((row) => biDimensionValue(row, "vendor")).filter(Boolean));
  const rateValues = filteredRows.map((row) => numericAmount(row.all_in_rate)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    rows: matrixRows,
    columns,
    row_dimensions: rowDimensions,
    column_dimensions: columnDimensions,
    metric,
    aggregation,
    summary: {
      transactions: filteredRows.length,
      carriers: carrierSet.size,
      avg_all_in_rate: formatBiValue(rateValues.length ? rateValues.reduce((sum, value) => sum + value, 0) / rateValues.length : null, "all_in_rate"),
      min_all_in_rate: formatBiValue(rateValues.length ? Math.min(...rateValues) : null, "all_in_rate"),
      max_all_in_rate: formatBiValue(rateValues.length ? Math.max(...rateValues) : null, "all_in_rate")
    },
    fields: {
      dimensions: BI_DIMENSIONS,
      metrics: BI_METRICS,
      aggregations: ["count", "distinct", "avg", "sum", "min", "max"]
    }
  };
}

async function fetchBusinessIntelligenceRows(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }) {
  const result = await supabase
    .from("rate_staging")
    .select("*, vendors(vendor_name, domain, primary_email, base_stage, status, owner_email)")
    .in("status", ["pending_review", "approved"])
    .limit(5000);
  if (result.error) throw result.error;
  return (result.data || []).filter((row) => {
    const vendor = typeof row.vendors === "object" && row.vendors ? row.vendors as Record<string, unknown> : null;
    return !row.vendor_id || !vendor?.owner_email || vendor.owner_email === user.owner_email;
  });
}

async function buildBusinessIntelligencePivotFromDb(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, config: Record<string, unknown>) {
  const scopedRows = await fetchBusinessIntelligenceRows(supabase, user);
  return buildBusinessIntelligencePivot(scopedRows, config);
}

function drilldownRow(row: Record<string, unknown>) {
  const vendor = typeof row.vendors === "object" && row.vendors ? row.vendors as Record<string, unknown> : {};
  return {
    id: row.id,
    vendor: vendor.vendor_name || row.vendor_domain || "Unmatched carrier",
    vendor_domain: row.vendor_domain || vendor.domain || null,
    quote_date: row.quote_date || null,
    rfx_id: row.rfx_id || null,
    origin: row.normalized_origin || row.origin || null,
    origin_market: row.origin_market || null,
    origin_state: row.origin_state || null,
    destination: row.normalized_destination || row.destination || null,
    destination_market: row.destination_market || null,
    destination_state: row.destination_state || null,
    equipment: row.equipment || null,
    trailer: row.trailer || null,
    operation: row.operation || null,
    service: row.service || null,
    mx_crossing: row.mx_border_crossing_point || null,
    us_crossing: row.us_border_crossing_point || null,
    all_in_rate: numericAmount(row.all_in_rate),
    currency: row.currency || null,
    calculated_miles: row.calculated_miles || null,
    calculated_km: row.calculated_km || null,
    cost_per_mile: formatBiValue(biNumber(row, "cost_per_mile"), "cost_per_mile"),
    cost_per_km: formatBiValue(biNumber(row, "cost_per_km"), "cost_per_km"),
    status: row.status || null
  };
}

async function buildBusinessIntelligenceDrilldown(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, config: Record<string, unknown>, cell: Record<string, unknown>) {
  const rows = await fetchBusinessIntelligenceRows(supabase, user);
  const rowDimensions = (Array.isArray(config.rows) ? config.rows : ["vendor"]).map(String).filter(Boolean).slice(0, 3);
  const columnDimensions = (Array.isArray(config.columns) ? config.columns : []).map(String).filter(Boolean).slice(0, 2);
  const filters = typeof config.filters === "object" && config.filters ? config.filters as Record<string, unknown> : {};
  const rowValues = Array.isArray(cell.row_values) ? cell.row_values.map(String) : [];
  const columnValue = cleanText(cell.column_value);
  const filteredRows = filterBiRows(rows, filters).filter((row) => {
    const rowMatch = rowDimensions.every((dimension, index) => biDimensionValue(row, dimension) === rowValues[index]);
    if (!rowMatch) return false;
    if (!columnValue || columnValue === "Total" || !columnDimensions.length) return true;
    const rowColumnValue = columnDimensions.map((dimension) => biDimensionValue(row, dimension)).join(" | ") || "Total";
    return rowColumnValue === columnValue;
  });

  return {
    rows: filteredRows.slice(0, 250).map(drilldownRow),
    total: filteredRows.length,
    cell: {
      row_values: rowValues,
      column_value: columnValue || "Total"
    }
  };
}

function normalizeTags(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  return source
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function key(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function sheetInfoFromUrl(url: string) {
  const id = url.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1] || null;
  const gid = url.match(/[?&#]gid=(\d+)/)?.[1] || "0";
  if (!id) throw new Error("Google Sheet URL must include a spreadsheet id.");
  return { id, gid };
}

async function fetchGoogleSheetRows(url: string) {
  const { id, gid } = sheetInfoFromUrl(url);
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Could not read Google Sheet (${response.status}). Share it as Anyone with the link can view.`);
  }
  const rows = parseCsv(await response.text());
  if (!rows.length) return { id, gid, rows: [] as Record<string, unknown>[] };
  const [headers, ...data] = rows;
  return {
    id,
    gid,
    rows: data.map((row, index) => {
      const record: Record<string, unknown> = { source_row_number: index + 2 };
      headers.forEach((header, position) => {
        record[header || `Column ${position + 1}`] = row[position] || "";
      });
      return record;
    })
  };
}

function firstValue(row: Record<string, unknown>, names: string[]) {
  const lookup = new Map(Object.keys(row).map((name) => [key(name), row[name]]));
  for (const name of names) {
    const value = cleanText(lookup.get(key(name)));
    if (value) return value;
  }
  return null;
}

function normalizeImportedVendor(row: Record<string, unknown>, source = "google_sheet") {
  return {
    vendor_name: firstValue(row, ["vendor_name", "vendor", "carrier", "carrier name", "company", "company name", "nombre", "transportista", "proveedor", "name"]),
    legal_name: firstValue(row, ["legal_name", "legal name", "razon social", "legal entity"]),
    domain: firstValue(row, ["domain", "website", "web", "site", "vendor_domain"]),
    contact_name: firstValue(row, ["contact_name", "contact", "contacto", "pricing contact", "sales rep", "representative"]),
    primary_email: firstValue(row, ["primary_email", "email", "mail", "correo", "e-mail", "pricing email"]),
    whatsapp_phone: firstValue(row, ["whatsapp_phone", "whatsapp", "phone", "telefono", "mobile", "cell"]),
    preferred_channel: firstValue(row, ["preferred_channel", "channel", "canal"]) || "email",
    tags: firstValue(row, ["tags", "tag", "services", "service", "equipment", "equipos", "coverage type", "tipo"]),
    coverage_notes: firstValue(row, ["coverage_notes", "coverage", "lanes", "rutas", "regions", "region", "markets", "mercados", "notes coverage"]),
    notes: firstValue(row, ["notes", "notas", "comments", "comentarios", "observations", "observaciones"]),
    base_stage: firstValue(row, ["base_stage", "base", "stage"]) || "sourcing",
    source
  };
}

function normalizeVendor(input: Record<string, unknown>, source = "manual") {
  const vendorName = cleanText(input.vendor_name || input.name || input.carrier || input.vendor);
  if (!vendorName) throw new Error("Vendor name is required.");

  const preferred = cleanText(input.preferred_channel)?.toLowerCase() || "email";
  const status = cleanText(input.status)?.toLowerCase() || "active";
  const baseStage = cleanText(input.base_stage)?.toLowerCase() || "sourcing";

  return {
    vendor_name: vendorName,
    legal_name: cleanText(input.legal_name),
    domain: normalizeDomain(input.domain || input.vendor_domain),
    contact_name: cleanText(input.contact_name || input.contact),
    primary_email: cleanText(input.primary_email || input.email),
    whatsapp_phone: cleanText(input.whatsapp_phone || input.phone || input.whatsapp),
    preferred_channel: ["email", "whatsapp", "portal"].includes(preferred) ? preferred : "email",
    status: ["active", "invited", "blocked", "inactive"].includes(status) ? status : "active",
    tags: normalizeTags(input.tags || input.tag || input.services || input.equipment || input.coverage),
    coverage_notes: cleanText(input.coverage_notes || input.coverage || input.lanes),
    notes: cleanText(input.notes),
    base_stage: ["sourcing", "procurement", "archived"].includes(baseStage) ? baseStage : "sourcing",
    source_spreadsheet_url: cleanText(input.source_spreadsheet_url),
    source_spreadsheet_id: cleanText(input.source_spreadsheet_id),
    source_sheet_gid: cleanText(input.source_sheet_gid),
    source_sheet_name: cleanText(input.source_sheet_name),
    source_row_number: input.source_row_number ? Number(input.source_row_number) : null,
    source_row_hash: cleanText(input.source_row_hash),
    last_synced_at: input.last_synced_at || null,
    sync_notes: cleanText(input.sync_notes),
    source
  };
}

function normalizeVendorPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (input.vendor_name !== undefined) patch.vendor_name = cleanText(input.vendor_name);
  if (input.legal_name !== undefined) patch.legal_name = cleanText(input.legal_name);
  if (input.domain !== undefined) patch.domain = normalizeDomain(input.domain);
  if (input.contact_name !== undefined) patch.contact_name = cleanText(input.contact_name);
  if (input.primary_email !== undefined) patch.primary_email = cleanText(input.primary_email);
  if (input.whatsapp_phone !== undefined) patch.whatsapp_phone = cleanText(input.whatsapp_phone);
  if (input.coverage_notes !== undefined) patch.coverage_notes = cleanText(input.coverage_notes);
  if (input.notes !== undefined) patch.notes = cleanText(input.notes);
  const status = cleanText(input.status)?.toLowerCase();
  if (status && ["active", "invited", "blocked", "inactive"].includes(status)) patch.status = status;
  const baseStage = cleanText(input.base_stage)?.toLowerCase();
  if (baseStage && ["sourcing", "procurement", "archived"].includes(baseStage)) {
    patch.base_stage = baseStage;
    patch.archived_at = baseStage === "archived" ? new Date().toISOString() : null;
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.preferred_channel !== undefined) {
    const preferred = cleanText(input.preferred_channel)?.toLowerCase();
    if (preferred && ["email", "whatsapp", "portal"].includes(preferred)) patch.preferred_channel = preferred;
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

function normalizeSegment(input: Record<string, unknown>) {
  const segmentName = cleanText(input.segment_name || input.name);
  if (!segmentName) throw new Error("Segment name is required.");

  const status = cleanText(input.status)?.toLowerCase() || null;
  const preferredChannel = cleanText(input.preferred_channel)?.toLowerCase() || null;

  return {
    segment_name: segmentName,
    description: cleanText(input.description),
    tags: normalizeTags(input.tags),
    status: status && ["active", "invited", "blocked", "inactive"].includes(status) ? status : null,
    preferred_channel: preferredChannel && ["email", "whatsapp", "portal"].includes(preferredChannel) ? preferredChannel : null,
    notes: cleanText(input.notes),
    updated_at: new Date().toISOString()
  };
}

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "on", "checked"].includes(text);
}

function baseTrailerName(value: unknown) {
  const text = cleanText(value) || "Dry Van";
  const cleaned = text
    .replace(/\s*-\s*hazmat\s*reefer\s*$/i, "")
    .replace(/\s*-\s*hazmat\s*$/i, "")
    .replace(/\s*-\s*reefer\s*$/i, "")
    .replace(/\s+hazmat\s+reefer\s*$/i, "")
    .replace(/\s+hazmat\s*$/i, "")
    .replace(/\s+reefer\s*$/i, "")
    .trim();
  return cleaned || "Dry Van";
}

function trailerWithFlags(trailer: unknown, hazmat: unknown, temperatureControlled: unknown) {
  const suffix = [
    cleanBoolean(hazmat) ? "Hazmat" : null,
    cleanBoolean(temperatureControlled) ? "Reefer" : null
  ].filter(Boolean).join(" ");
  const base = baseTrailerName(trailer);
  return suffix ? `${base} - ${suffix}` : base;
}

function normalizeStagingPatch(input: Record<string, unknown>, current: Record<string, unknown> = {}) {
  const patch: Record<string, unknown> = {};
  const textFields = [
    "vendor_domain",
    "rfx_id",
    "row_id",
    "origin",
    "destination",
    "equipment",
    "trailer",
    "config",
    "operation",
    "service",
    "driver",
    "mx_border_crossing_point",
    "us_border_crossing_point",
    "mx_linehaul",
    "us_linehaul",
    "us_miles",
    "fsc",
    "fuel",
    "border_crossing_fee",
    "flat_rate",
    "all_in_rate",
    "currency",
    "weekly_capacity",
    "notes",
    "accessorials",
    "normalized_origin",
    "normalized_destination",
    "origin_market",
    "origin_country",
    "origin_zip_prefix",
    "origin_city",
    "origin_state",
    "origin_region",
    "origin_match_reason",
    "destination_market",
    "destination_country",
    "destination_zip_prefix",
    "destination_city",
    "destination_state",
    "destination_region",
    "destination_match_reason",
    "normalized_equipment",
    "normalized_trailer",
    "normalized_config",
    "normalized_operation",
    "normalized_service",
    "normalized_driver",
    "catalog_match_status",
    "location_match_status",
    "mileage_source",
    "lane_type",
    "leg_status",
    "leg_summary",
    "fuel_region",
    "fuel_source",
    "mx_fuel_source",
    "fx_source"
  ];

  for (const field of textFields) {
    if (input[field] !== undefined) patch[field] = cleanText(input[field]);
  }

  for (const field of ["mx_linehaul", "us_linehaul", "us_miles", "fsc", "fuel", "border_crossing_fee", "flat_rate", "all_in_rate"]) {
    if (input[field] !== undefined) patch[field] = cleanRateText(input[field]);
  }

  if (input.quote_date !== undefined) patch.quote_date = cleanDate(input.quote_date);
  if (input.hazmat !== undefined) patch.hazmat = cleanBoolean(input.hazmat);
  if (input.temperature_controlled !== undefined) patch.temperature_controlled = cleanBoolean(input.temperature_controlled);

  if (input.trailer !== undefined || input.hazmat !== undefined || input.temperature_controlled !== undefined) {
    const nextHazmat = input.hazmat !== undefined ? input.hazmat : current.hazmat;
    const nextTemperatureControlled = input.temperature_controlled !== undefined ? input.temperature_controlled : current.temperature_controlled;
    patch.trailer = trailerWithFlags(
      input.trailer !== undefined ? input.trailer : current.trailer,
      nextHazmat,
      nextTemperatureControlled
    );
    patch.normalized_trailer = patch.trailer;
    patch.hazmat = cleanBoolean(nextHazmat);
    patch.temperature_controlled = cleanBoolean(nextTemperatureControlled);
  }

  const status = cleanText(input.status)?.toLowerCase();
  if (status && ["pending_review", "approved", "rejected", "archived"].includes(status)) patch.status = status;

  if (input.confidence !== undefined) {
    patch.confidence = Math.max(0, Math.min(1, Number(input.confidence) || 0));
  }

  if (input.calculated_miles !== undefined) patch.calculated_miles = Number(input.calculated_miles) || null;
  if (input.calculated_km !== undefined) patch.calculated_km = Number(input.calculated_km) || null;
  if (input.carrier_fsc_per_mile !== undefined) patch.carrier_fsc_per_mile = Number(input.carrier_fsc_per_mile) || null;
  if (input.normalized_fsc_per_mile !== undefined) patch.normalized_fsc_per_mile = Number(input.normalized_fsc_per_mile) || null;
  if (input.normalized_fsc_total !== undefined) patch.normalized_fsc_total = Number(input.normalized_fsc_total) || null;
  if (input.fuel_diesel_per_gallon !== undefined) patch.fuel_diesel_per_gallon = Number(input.fuel_diesel_per_gallon) || null;
  if (input.fuel_delta !== undefined) patch.fuel_delta = Number(input.fuel_delta) || null;
  if (input.normalized_all_in_rate !== undefined) patch.normalized_all_in_rate = Number(input.normalized_all_in_rate) || null;
  if (input.mx_diesel_mxn_per_liter !== undefined) patch.mx_diesel_mxn_per_liter = Number(input.mx_diesel_mxn_per_liter) || null;
  if (input.mx_diesel_usd_per_liter !== undefined) patch.mx_diesel_usd_per_liter = Number(input.mx_diesel_usd_per_liter) || null;
  if (input.fx_rate_mxn_usd !== undefined) patch.fx_rate_mxn_usd = Number(input.fx_rate_mxn_usd) || null;
  if (input.mx_fuel_efficiency_km_per_liter !== undefined) patch.mx_fuel_efficiency_km_per_liter = Number(input.mx_fuel_efficiency_km_per_liter) || null;
  if (input.mx_fuel_factor !== undefined) patch.mx_fuel_factor = Number(input.mx_fuel_factor) || null;
  if (input.mx_fuel_cost_usd !== undefined) patch.mx_fuel_cost_usd = Number(input.mx_fuel_cost_usd) || null;
  if (input.fuel_index_date !== undefined) patch.fuel_index_date = cleanDate(input.fuel_index_date);
  if (input.origin_location_candidates !== undefined) patch.origin_location_candidates = Array.isArray(input.origin_location_candidates) ? input.origin_location_candidates : [];
  if (input.destination_location_candidates !== undefined) patch.destination_location_candidates = Array.isArray(input.destination_location_candidates) ? input.destination_location_candidates : [];

  const routeParts = [
    patch.origin,
    patch.destination,
    patch.equipment,
    patch.trailer,
    patch.config,
    patch.operation,
    patch.service,
    patch.driver,
    patch.mx_border_crossing_point && patch.us_border_crossing_point
      ? `${patch.mx_border_crossing_point}/${patch.us_border_crossing_point}`
      : patch.mx_border_crossing_point || patch.us_border_crossing_point
  ].filter(Boolean);
  const rfxKey = [patch.rfx_id, patch.row_id].filter(Boolean).join("-");

  if (routeParts.length) patch.route_key = routeParts.join(" ");
  if (rfxKey) patch.rfx_key = rfxKey;
  if (routeParts.length || rfxKey) patch.business_key = [rfxKey, routeParts.join(" ")].filter(Boolean).join(" ");

  return patch;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function buildRowKeys(row: Record<string, unknown>) {
  const routeParts = [
    row.origin,
    row.destination,
    row.equipment,
    row.trailer,
    row.config,
    row.operation,
    row.service,
    row.driver,
    row.mx_border_crossing_point && row.us_border_crossing_point
      ? `${row.mx_border_crossing_point}/${row.us_border_crossing_point}`
      : row.mx_border_crossing_point || row.us_border_crossing_point
  ].filter(Boolean);
  const routeKey = routeParts.join(" ");
  const rfxKey = [row.rfx_id, row.row_id].filter(Boolean).join("-");

  return {
    route_key: routeKey || null,
    rfx_key: rfxKey || null,
    business_key: [rfxKey, routeKey].filter(Boolean).join(" ") || null
  };
}

function normalizeCatalogValues(row: Record<string, unknown>, catalog: Map<string, Map<string, Record<string, unknown>>>) {
  const patch: Record<string, unknown> = {};
  const fields: Array<[string, string, string[]]> = [
    ["equipment", "normalized_equipment", ["equipment"]],
    ["config", "normalized_config", ["config"]],
    ["operation", "normalized_operation", ["operation"]],
    ["service", "normalized_service", ["service"]],
    ["driver", "normalized_driver", ["driver"]]
  ];

  let matchCount = 0;
  for (const [field, normalizedField, categories] of fields) {
    const match = catalogMatch(catalog, categories, row[field]);
    if (!match?.normalized_value) {
      patch[normalizedField] = null;
      continue;
    }
    patch[normalizedField] = cleanText(match.normalized_value);
    patch[field] = cleanText(match.normalized_value);
    matchCount += 1;
  }

  const trailerMatch = catalogMatch(catalog, ["trailer"], row.trailer);
  if (trailerMatch?.normalized_value) {
    patch.normalized_trailer = trailerWithFlags(trailerMatch.normalized_value, row.hazmat, row.temperature_controlled);
    patch.trailer = patch.normalized_trailer;
    matchCount += 1;
  } else if (row.trailer || row.hazmat || row.temperature_controlled) {
    patch.trailer = trailerWithFlags(row.trailer, row.hazmat, row.temperature_controlled);
    patch.normalized_trailer = patch.trailer;
  }

  return { patch, matchCount };
}

function normalizeLocations(row: Record<string, unknown>, locationIndex: Map<string, Record<string, unknown>>) {
  const originResolution = locationMatch(locationIndex, row.origin || row.normalized_origin);
  const destinationResolution = locationMatch(locationIndex, row.destination || row.normalized_destination);
  const originLocation = originResolution?.location || null;
  const destinationLocation = destinationResolution?.location || null;

  return {
    patch: {
      ...applyLocation(row, "origin", originLocation),
      ...applyLocation(row, "destination", destinationLocation),
      origin_match_reason: originResolution?.reason || null,
      destination_match_reason: destinationResolution?.reason || null,
      origin_location_candidates: originResolution?.candidates || [],
      destination_location_candidates: destinationResolution?.candidates || [],
      location_match_status: originLocation && destinationLocation ? "matched" : originLocation || destinationLocation ? "partial" : "unmatched"
    },
    originLocation,
    destinationLocation
  };
}

function applyMileage(row: Record<string, unknown>, patch: Record<string, unknown>, mileage: Map<string, Record<string, unknown>>) {
  const normalized = { ...row, ...patch };
  const routeCandidates = [
    [normalized.normalized_origin || normalized.origin, normalized.normalized_destination || normalized.destination, normalized.normalized_equipment || normalized.equipment, normalized.normalized_trailer || normalized.trailer, normalized.normalized_config || normalized.config, normalized.normalized_operation || normalized.operation, normalized.normalized_service || normalized.service, normalized.normalized_driver || normalized.driver],
    [normalized.normalized_origin || normalized.origin, normalized.normalized_destination || normalized.destination, normalized.normalized_equipment || normalized.equipment],
    [normalized.normalized_origin || normalized.origin, normalized.normalized_destination || normalized.destination],
    [normalized.origin_market, normalized.destination_market, normalized.normalized_equipment || normalized.equipment],
    [normalized.origin_market, normalized.destination_market],
    [row.route_key]
  ].map((parts) => catalogKey(Array.isArray(parts) ? parts.filter(Boolean).join(" ") : parts));

  const lane = routeCandidates.map((candidate) => mileage.get(candidate)).find(Boolean);
  if (!lane) return {};

  const mileagePatch: Record<string, unknown> = {
    calculated_miles: lane.miles ? Number(lane.miles) : null,
    calculated_km: lane.km ? Number(lane.km) : null,
    mileage_source: cleanText(lane.source || "catalog")
  };
  if (!row.us_miles && lane.miles) mileagePatch.us_miles = String(lane.miles);
  return mileagePatch;
}

function normalizeRowWithCurrentCatalog(row: Record<string, unknown>, catalog: Map<string, Map<string, Record<string, unknown>>>, locationIndex: Map<string, Record<string, unknown>>, mileage: Map<string, Record<string, unknown>>) {
  const categoryResult = normalizeCatalogValues(row, catalog);
  const locationResult = normalizeLocations({ ...row, ...categoryResult.patch }, locationIndex);
  const patch: Record<string, unknown> = {
    ...categoryResult.patch,
    ...locationResult.patch
  };

  Object.assign(patch, applyMileage(row, patch, mileage));
  Object.assign(patch, buildRowKeys({ ...row, ...patch }));

  const locationMatchCount = [locationResult.originLocation, locationResult.destinationLocation].filter(Boolean).length;
  const matchCount = categoryResult.matchCount + locationMatchCount;
  patch.catalog_match_status = matchCount >= 5 ? "matched" : matchCount >= 2 ? "partial" : "unmatched";
  return patch;
}

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY", "DC"
]);

function stateToken(value: unknown) {
  const text = String(value || "").toUpperCase();
  const direct = text.match(/\b[A-Z]{2}\b/)?.[0] || null;
  return direct || null;
}

function locationParts(value: unknown, fallbackState: unknown = null, fallbackCountry: unknown = null) {
  const text = cleanText(value);
  if (!text) return null;
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const state = stateToken(fallbackState) || stateToken(parts.slice(1).join(" "));
  const city = parts[0]?.replace(/\b[A-Z]{2}\b/g, "").trim();
  const country = cleanText(fallbackCountry) || (state && US_STATE_CODES.has(state) ? "US" : null);
  if (!city || !state || !country) return null;
  return { city, state, country: country === "USA" ? "US" : country };
}

async function lookupPostalPrefix(value: unknown, fallbackState: unknown = null, fallbackCountry: unknown = null) {
  const parsed = locationParts(value, fallbackState, fallbackCountry);
  if (!parsed || !["US", "CA"].includes(parsed.country)) return null;

  const countryPath = parsed.country.toLowerCase();
  const url = `https://api.zippopotam.us/${countryPath}/${encodeURIComponent(parsed.state)}/${encodeURIComponent(parsed.city)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const place = Array.isArray(payload.places) ? payload.places[0] : null;
    const postalCode = cleanText(place?.["post code"]);
    if (!postalCode) return null;
    return {
      zip_prefix: postalCode.slice(0, parsed.country === "US" ? 3 : 3).toUpperCase(),
      city: cleanText(place?.["place name"]) || parsed.city,
      state: cleanText(place?.["state abbreviation"]) || parsed.state,
      country: parsed.country,
      source: "zippopotam.us"
    };
  } catch {
    return null;
  }
}

function patchLookupLocation(prefix: "origin" | "destination", lookup: Record<string, unknown> | null, locationIndex: Map<string, Record<string, unknown>>) {
  if (!lookup) return {};
  const catalogResolution = locationMatch(locationIndex, lookup.zip_prefix);
  const catalogLocation = catalogResolution?.location || null;
  const patch: Record<string, unknown> = {
    [`${prefix}_zip_prefix`]: lookup.zip_prefix,
    [`${prefix}_city`]: lookup.city,
    [`${prefix}_state`]: lookup.state,
    [`${prefix}_country`]: lookup.country,
    [`${prefix}_match_reason`]: `external ZIP lookup via ${lookup.source}`,
    [`${prefix}_location_candidates`]: catalogResolution?.candidates || []
  };

  if (catalogLocation) {
    Object.assign(patch, applyLocation({}, prefix, catalogLocation));
    patch[`${prefix}_match_reason`] = `external ZIP lookup, then ${catalogResolution?.reason || "catalog match"}`;
  }
  return patch;
}

async function enrichMissingLocationZips(supabase: ReturnType<typeof createClient>, ids: string[], status: string | null = null) {
  if (!ids.length) throw new Error("At least one rate row id is required.");

  let rowQuery = supabase.from("rate_staging").select("*").in("id", ids).limit(250);
  if (status) rowQuery = rowQuery.eq("status", status);

  const [rowsResult, locationsResult] = await Promise.all([
    rowQuery,
    supabase
      .from("rateware_locations")
      .select("source,location_key,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region")
      .eq("active", true)
      .limit(20000)
  ]);

  for (const result of [rowsResult, locationsResult]) {
    if (result.error) throw result.error;
  }

  const locationIndex = buildLocationIndex(locationsResult.data || []);
  const updatedRows = [];
  let enriched = 0;

  for (const row of rowsResult.data || []) {
    const patch: Record<string, unknown> = {};
    if (!row.origin_zip_prefix) {
      const lookup = await lookupPostalPrefix(row.origin || row.normalized_origin, row.origin_state, row.origin_country);
      const lookupPatch = patchLookupLocation("origin", lookup, locationIndex);
      if (Object.keys(lookupPatch).length) enriched += 1;
      Object.assign(patch, lookupPatch);
    }
    if (!row.destination_zip_prefix) {
      const lookup = await lookupPostalPrefix(row.destination || row.normalized_destination, row.destination_state, row.destination_country);
      const lookupPatch = patchLookupLocation("destination", lookup, locationIndex);
      if (Object.keys(lookupPatch).length) enriched += 1;
      Object.assign(patch, lookupPatch);
    }

    if (!Object.keys(patch).length) continue;
    patch.location_match_status = [
      patch.origin_zip_prefix || row.origin_zip_prefix,
      patch.destination_zip_prefix || row.destination_zip_prefix
    ].every(Boolean) ? "matched" : "partial";
    Object.assign(patch, buildRowKeys({ ...row, ...patch }));

    const result = await supabase
      .from("rate_staging")
      .update(patch)
      .eq("id", row.id)
      .select("*, vendors(vendor_name, domain)")
      .single();
    if (result.error) throw result.error;
    updatedRows.push(result.data);
  }

  return { rows: updatedRows, enriched };
}

async function matchRateVendorRows(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, ids: string[], status: string | null = null) {
  if (!ids.length) throw new Error("At least one rate row id is required.");

  let rowQuery = supabase
    .from("rate_staging")
    .select("id,vendor_id,vendor_domain,status")
    .in("id", ids)
    .limit(500);
  if (status) rowQuery = rowQuery.eq("status", status);

  const rowsResult = await rowQuery;
  if (rowsResult.error) throw rowsResult.error;

  const updatedRows = [];
  for (const row of rowsResult.data || []) {
    if (!cleanText(row.vendor_domain)) continue;
    const match = await resolveVendorReference(supabase, user, row.vendor_domain);
    if (!match) continue;
    const patch = {
      vendor_id: match.vendor.id,
      vendor_domain: normalizeDomain(match.vendor.domain) || match.domain || domainFromVendorReference(row.vendor_domain) || cleanText(row.vendor_domain)
    };
    const result = await supabase
      .from("rate_staging")
      .update(patch)
      .eq("id", row.id)
      .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
      .single();
    if (result.error) throw result.error;
    updatedRows.push(result.data);
  }

  return updatedRows;
}

async function renormalizeRateRows(supabase: ReturnType<typeof createClient>, ids: string[], status: string | null = null) {
  if (!ids.length) throw new Error("At least one rate row id is required.");

  let rowQuery = supabase.from("rate_staging").select("*").in("id", ids).limit(500);
  if (status) rowQuery = rowQuery.eq("status", status);

  const [rowsResult, catalogResult, locationsResult, mileageResult] = await Promise.all([
    rowQuery,
    supabase
      .from("rateware_catalog_items")
      .select("source,category,raw_value,normalized_value,code")
      .eq("active", true)
      .limit(10000),
    supabase
      .from("rateware_locations")
      .select("source,location_key,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region")
      .eq("active", true)
      .limit(20000),
    supabase
      .from("rateware_lane_mileage")
      .select("source,route_key,miles,km")
      .eq("active", true)
      .limit(20000)
  ]);

  for (const result of [rowsResult, catalogResult, locationsResult, mileageResult]) {
    if (result.error) throw result.error;
  }

  const catalog = buildCatalogIndex(catalogResult.data || []);
  const locationIndex = buildLocationIndex(locationsResult.data || []);
  const mileage = new Map((mileageResult.data || []).map((lane) => [catalogKey(lane.route_key), lane]));

  const updatedRows = [];
  for (const row of rowsResult.data || []) {
    const patch = normalizeRowWithCurrentCatalog(row, catalog, locationIndex, mileage);
    const result = await supabase
      .from("rate_staging")
      .update(patch)
      .eq("id", row.id)
      .select("*, vendors(vendor_name, domain)")
      .single();
    if (result.error) throw result.error;
    updatedRows.push(result.data);
  }

  return updatedRows;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const user = userContext(await requireKindeUser(request));
    const supabase = getClient();
    const body = await request.json();

    if (body.action === "list_vendors") {
      const limit = Math.min(Math.max(Number(body.limit) || 75, 1), 250);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const view = cleanText(body.view)?.toLowerCase() || "all";
      let query = supabase
        .from("vendors")
        .select("*", { count: "exact" })
        .eq("owner_email", user.owner_email)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (body.status) query = query.eq("status", body.status);
      if (view === "archived") {
        query = query.eq("base_stage", "archived");
      } else if (body.base_stage) {
        query = query.eq("base_stage", body.base_stage);
      }
      if (view === "missing-contact") {
        query = query.is("primary_email", null).is("whatsapp_phone", null);
      }
      if (view === "cross-border") {
        query = query.or("coverage_notes.ilike.%Cross-border%,notes.ilike.%Cross-border%");
      }
      if (view === "high-confidence") {
        query = query.contains("tags", ["alta"]);
      }
      if (view === "procurement-ready") {
        query = query.not("primary_email", "is", null).not("domain", "is", null).not("coverage_notes", "is", null);
      }
      if (body.channel) {
        query = query.eq("preferred_channel", String(body.channel).trim().toLowerCase());
      }
      if (body.tag) {
        const tag = String(body.tag).trim().toLowerCase();
        if (tag) query = query.contains("tags", [tag]);
      }
      if (body.coverage) {
        const coverage = String(body.coverage).trim();
        if (coverage) query = query.or(`coverage_notes.ilike.%${coverage}%,notes.ilike.%${coverage}%`);
      }
      if (body.search) {
        const term = String(body.search).trim();
        query = query.or(`vendor_name.ilike.%${term}%,domain.ilike.%${term}%,primary_email.ilike.%${term}%`);
      }

      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data, total: result.count || 0, limit, offset });
    }

    if (body.action === "carrier_intelligence_chat") {
      const result = await buildCarrierIntelligence(supabase, user, String(body.message || body.prompt || ""));
      return jsonResponse(result);
    }

    if (body.action === "carrier_recommendations") {
      const result = await buildCarrierRecommendations(supabase, user, body.config || {});
      return jsonResponse(result);
    }

    if (body.action === "business_intelligence_pivot") {
      const result = await buildBusinessIntelligencePivotFromDb(supabase, user, body.config || {});
      return jsonResponse(result);
    }

    if (body.action === "business_intelligence_drilldown") {
      const result = await buildBusinessIntelligenceDrilldown(supabase, user, body.config || {}, body.cell || {});
      return jsonResponse(result);
    }

    if (body.action === "create_vendor") {
      const row = withOwner(normalizeVendor(body.vendor || {}, "manual"), user);
      const result = await supabase.from("vendors").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "import_vendors") {
      const vendors = Array.isArray(body.vendors) ? body.vendors : [];
      const rows = vendors.map((vendor: Record<string, unknown>) => withOwner(normalizeVendor(vendor, "import"), user));
      if (!rows.length) return jsonResponse({ inserted: 0, rows: [] });

      const result = await supabase.from("vendors").insert(rows).select();

      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data.length, rows: result.data });
    }

    if (body.action === "import_vendors_google_sheet") {
      const url = cleanText(body.url);
      if (!url) return jsonResponse({ error: "Google Sheet URL is required." }, 400);
      const sheet = await fetchGoogleSheetRows(url);
      const rows = sheet.rows.map((raw: Record<string, unknown>) => {
        const normalized = normalizeImportedVendor(raw, "google_sheet");
        return withOwner(normalizeVendor({
          ...normalized,
          source_spreadsheet_url: url,
          source_spreadsheet_id: sheet.id,
          source_sheet_gid: sheet.gid,
          source_row_number: raw.source_row_number,
          source_row_hash: JSON.stringify(raw),
          last_synced_at: new Date().toISOString()
        }, "google_sheet"), user);
      });
      const validRows = rows.filter((row) => row.vendor_name);
      if (!validRows.length) return jsonResponse({ inserted: 0, rows: [], total_rows: sheet.rows.length });

      const previous = await supabase
        .from("vendors")
        .delete()
        .eq("owner_email", user.owner_email)
        .eq("source_spreadsheet_id", sheet.id)
        .eq("source_sheet_gid", sheet.gid);
      if (previous.error) throw previous.error;

      const result = await supabase.from("vendors").insert(validRows).select();
      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data.length, rows: result.data, total_rows: sheet.rows.length });
    }

    if (body.action === "bulk_update_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });

      const patch = normalizeVendorPatch(body.patch || {});
      const addTags = normalizeTags(body.patch?.add_tags);

      if (addTags.length) {
        const current = await supabase.from("vendors").select("id,tags").eq("owner_email", user.owner_email).in("id", ids);
        if (current.error) throw current.error;

        const updates = await Promise.all(
          current.data.map((vendor) => {
            const mergedTags = Array.from(new Set([...normalizeTags(vendor.tags), ...addTags]));
            return supabase.from("vendors").update({ ...patch, tags: mergedTags }).eq("owner_email", user.owner_email).eq("id", vendor.id).select().single();
          })
        );

        for (const update of updates) {
          if (update.error) throw update.error;
        }

        return jsonResponse({ updated: updates.length, rows: updates.map((update) => update.data) });
      }

      const result = await supabase.from("vendors").update(patch).eq("owner_email", user.owner_email).in("id", ids).select();
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data.length, rows: result.data });
    }

    if (body.action === "remove_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (!ids.length) return jsonResponse({ removed: 0, rows: [] });
      const result = await supabase.from("vendors").delete().eq("owner_email", user.owner_email).in("id", ids).select("id");
      if (result.error) throw result.error;
      return jsonResponse({ removed: result.data.length, rows: result.data });
    }

    if (body.action === "update_vendor") {
      if (!body.id) return jsonResponse({ error: "Vendor id is required." }, 400);
      const patch = normalizeVendorPatch(body.patch || {});
      if (patch.vendor_name === null) return jsonResponse({ error: "Vendor name is required." }, 400);
      const result = await supabase.from("vendors").update(patch).eq("owner_email", user.owner_email).eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "list_vendor_segments") {
      const result = await supabase.from("vendor_segments").select("*").order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "create_vendor_segment") {
      const row = normalizeSegment(body.segment || {});
      const result = await supabase.from("vendor_segments").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "delete_vendor_segment") {
      if (!body.id) return jsonResponse({ error: "Segment id is required." }, 400);
      const result = await supabase.from("vendor_segments").delete().eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "dashboard_summary") {
      const [uploads, vendors, sourcingVendors, procurementVendors, archivedVendors, pending, approved, failed] = await Promise.all([
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }).neq("status", "archived"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "sourcing"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "procurement"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "archived"),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }).eq("status", "failed")
      ]);

      for (const result of [uploads, vendors, sourcingVendors, procurementVendors, archivedVendors, pending, approved, failed]) {
        if (result.error) throw result.error;
      }

      return jsonResponse({
        raw_uploads: uploads.count || 0,
        vendors: vendors.count || 0,
        sourcing_vendors: sourcingVendors.count || 0,
        procurement_vendors: procurementVendors.count || 0,
        archived_vendors: archivedVendors.count || 0,
        pending_review: pending.count || 0,
        approved_rows: approved.count || 0,
        failed_uploads: failed.count || 0
      });
    }

    if (body.action === "list_uploads") {
      let query = supabase.from("raw_uploads").select("*, vendors(vendor_name, domain, primary_email, base_stage, status)").order("created_at", { ascending: false }).limit(100);
      if (body.status === "current" || body.status === undefined) query = query.neq("status", "archived");
      else if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "archive_upload") {
      if (!body.id) return jsonResponse({ error: "Upload id is required." }, 400);
      const result = await supabase
        .from("raw_uploads")
        .update({ status: "archived" })
        .eq("id", body.id)
        .select("*, vendors(vendor_name, domain)")
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "remove_upload") {
      if (!body.id) return jsonResponse({ error: "Upload id is required." }, 400);
      const upload = await supabase
        .from("raw_uploads")
        .select("id,storage_bucket,storage_path")
        .eq("id", body.id)
        .single();
      if (upload.error) throw upload.error;

      if (upload.data?.storage_bucket && upload.data?.storage_path) {
        const storage = await supabase.storage.from(upload.data.storage_bucket).remove([upload.data.storage_path]);
        if (storage.error) throw storage.error;
      }

      const result = await supabase.from("raw_uploads").delete().eq("id", body.id).select("id").single();
      if (result.error) throw result.error;
      return jsonResponse({ removed: result.data });
    }

    if (body.action === "list_staging") {
      let query = supabase.from("rate_staging").select("*, vendors(vendor_name, domain, primary_email, base_stage, status), rateware_lane_legs(*)").order("created_at", { ascending: false }).limit(200);
      if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "list_rateware") {
      let query = supabase
        .from("rate_staging")
        .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
        .eq("status", "approved")
        .order("quote_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (body.operation) query = query.eq("operation", body.operation);
      if (body.service) query = query.eq("service", body.service);
      if (body.search) {
        const term = String(body.search).trim();
        if (term) {
          query = query.or([
            `vendor_domain.ilike.%${term}%`,
            `rfx_id.ilike.%${term}%`,
            `origin.ilike.%${term}%`,
            `destination.ilike.%${term}%`,
            `normalized_origin.ilike.%${term}%`,
            `normalized_destination.ilike.%${term}%`,
            `origin_market.ilike.%${term}%`,
            `destination_market.ilike.%${term}%`
          ].join(","));
        }
      }

      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "renormalize_rate_rows") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      const status = cleanText(body.status);
      const rows = await renormalizeRateRows(supabase, ids, status);
      return jsonResponse({ updated: rows.length, rows });
    }

    if (body.action === "match_rate_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      const status = cleanText(body.status);
      const rows = await matchRateVendorRows(supabase, user, ids, status);
      return jsonResponse({ updated: rows.length, rows });
    }

    if (body.action === "enrich_missing_location_zips") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 250) : [];
      const status = cleanText(body.status);
      const result = await enrichMissingLocationZips(supabase, ids, status);
      return jsonResponse({ updated: result.rows.length, enriched: result.enriched, rows: result.rows });
    }

    if (body.action === "update_rateware") {
      if (!body.id) return jsonResponse({ error: "Approved rate id is required." }, 400);
      const currentResult = await supabase
        .from("rate_staging")
        .select("trailer,hazmat,temperature_controlled,status,vendor_id,vendor_domain")
        .eq("id", body.id)
        .eq("status", "approved")
        .single();
      if (currentResult.error) throw currentResult.error;

      const patch = normalizeStagingPatch(body.patch || {}, currentResult.data || {});
      Object.assign(patch, await vendorLinkPatch(supabase, user, body.patch || {}, currentResult.data || {}));
      delete patch.status;
      if (!Object.keys(patch).length) return jsonResponse({ error: "No approved rate updates provided." }, 400);

      const result = await supabase
        .from("rate_staging")
        .update(patch)
        .eq("id", body.id)
        .eq("status", "approved")
        .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "return_rateware_to_staging") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ error: "At least one approved rate id is required." }, 400);

      const result = await supabase
        .from("rate_staging")
        .update({ status: "pending_review" })
        .in("id", ids)
        .eq("status", "approved")
        .select("id");
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "archive_staging") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ error: "At least one staging row id is required." }, 400);

      const result = await supabase
        .from("rate_staging")
        .update({ status: "archived" })
        .in("id", ids)
        .select("id");
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "remove_staging") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ error: "At least one staging row id is required." }, 400);

      const result = await supabase
        .from("rate_staging")
        .delete()
        .in("id", ids)
        .select("id");
      if (result.error) throw result.error;
      return jsonResponse({ removed: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "list_staging_options") {
      const [catalog, locations, borderPairs, vendors] = await Promise.all([
        supabase
          .from("rateware_catalog_items")
          .select("source,category,normalized_value,raw_value,code")
          .in("category", ["equipment", "trailer", "config", "operation", "service", "driver", "border_crossing"])
          .eq("active", true)
          .limit(5000),
        supabase
          .from("rateware_locations")
          .select("source,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region")
          .eq("active", true)
          .order("country", { ascending: false })
          .order("market", { ascending: true })
          .limit(20000),
        supabase
          .from("border_crossing_pairs")
          .select("mx_city,mx_state,us_city,us_state,crossing_name")
          .eq("active", true)
          .order("default_rank", { ascending: true })
          .limit(200),
        supabase
          .from("vendors")
          .select("vendor_name,domain,primary_email,base_stage,status")
          .eq("owner_email", user.owner_email)
          .limit(1000)
      ]);

      for (const result of [catalog, locations, borderPairs, vendors]) {
        if (result.error) throw result.error;
      }

      const categoryMaps: Record<string, Map<string, { value: string; source: string }>> = {};
      for (const item of catalog.data || []) {
        const category = String(item.category);
        const value = cleanText(item.normalized_value || item.raw_value || item.code);
        if (!value) continue;
        if (!categoryMaps[category]) categoryMaps[category] = new Map();
        const existing = categoryMaps[category].get(value);
        if (!existing || sourceRank(item.source) < sourceRank(existing.source)) {
          categoryMaps[category].set(value, { value, source: String(item.source || "") });
        }
      }

      const categories: Record<string, string[]> = {};
      for (const category of Object.keys(categoryMaps)) {
        categories[category] = [...categoryMaps[category].values()]
          .map((item) => item.value)
          .sort((a, b) => a.localeCompare(b));
      }

      const locationMap = new Map<string, Record<string, unknown>>();
      for (const location of locations.data || []) {
        const value = cleanText(location.raw_value || location.metro_city || [location.city, location.state_code].filter(Boolean).join(", "));
        if (!value) continue;
        const cityKey = String(location.city || location.metro_city || value).trim().toUpperCase();
        const stateKey = String(location.state_code || location.state_name || "").trim().toUpperCase();
        const key = `${cityKey}|${stateKey}|${location.market || ""}`;
        const existing = locationMap.get(key);
        if (!existing || optionQuality(location) > optionQuality(existing)) {
          const geography = [location.zip_prefix, location.market, location.region, location.country]
            .filter(Boolean)
            .join(" | ");
          locationMap.set(key, {
            source: location.source,
            value,
            label: [location.metro_city || value, geography].filter(Boolean).join(" | "),
            zip_prefix: location.zip_prefix,
            city: location.city,
            state_code: location.state_code,
            state_name: location.state_name,
            country: location.country,
            market: location.market,
            region: location.region
          });
        }
      }

      const locationOptions = [...locationMap.values()]
        .sort((a, b) => String(a.label || a.value).localeCompare(String(b.label || b.value)))
        .slice(0, 5000);

      const mxCrossings = Array.from(new Set([
        ...(borderPairs.data || []).map((pair) => [pair.mx_city, pair.mx_state].filter(Boolean).join(", "))
      ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

      const usCrossings = Array.from(new Set((borderPairs.data || [])
        .map((pair) => [pair.us_city, pair.us_state].filter(Boolean).join(", "))
        .filter(Boolean))).sort((a, b) => a.localeCompare(b));

      const vendorOptions = (vendors.data || []).flatMap((vendor) => {
        const label = [vendor.vendor_name, vendor.primary_email, vendor.base_stage, vendor.status].filter(Boolean).join(" | ");
        return [
          vendor.domain ? { value: vendor.domain, label } : null,
          vendor.primary_email ? { value: vendor.primary_email, label } : null
        ].filter(Boolean);
      });

      return jsonResponse({
        categories,
        locations: locationOptions,
        vendors: vendorOptions,
        mx_crossings: mxCrossings,
        us_crossings: usCrossings,
        currencies: ["USD", "MXN", "CAD"]
      });
    }

    if (body.action === "update_staging") {
      const currentResult = await supabase
        .from("rate_staging")
        .select("trailer,hazmat,temperature_controlled,vendor_id,vendor_domain")
        .eq("id", body.id)
        .single();
      if (currentResult.error) throw currentResult.error;

      const patch = normalizeStagingPatch(body.patch || {}, currentResult.data || {});
      Object.assign(patch, await vendorLinkPatch(supabase, user, body.patch || {}, currentResult.data || {}));
      if (!Object.keys(patch).length) return jsonResponse({ error: "No staging updates provided." }, 400);

      const result = await supabase
        .from("rate_staging")
        .update(patch)
        .eq("id", body.id)
        .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }
});
