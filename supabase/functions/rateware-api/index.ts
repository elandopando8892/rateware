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
  required: ["answer", "filters", "analyst_summary", "suggested_pivots", "data_gaps", "rfx_shortlist", "proposed_actions", "recommendations", "next_actions"],
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
    analyst_summary: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "confidence_label", "data_scope", "reasoning"],
      properties: {
        headline: { type: "string" },
        confidence_label: { type: "string" },
        data_scope: { type: "string" },
        reasoning: { type: "array", items: { type: "string" } }
      }
    },
    suggested_pivots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "purpose", "rows", "columns", "metric", "aggregation", "filters"],
        properties: {
          title: { type: "string" },
          purpose: { type: "string" },
          rows: { type: "array", items: { type: "string" } },
          columns: { type: "array", items: { type: "string" } },
          metric: { type: "string" },
          aggregation: { type: "string" },
          filters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value"],
              properties: {
                key: { type: "string" },
                value: { type: "string" }
              }
            }
          }
        }
      }
    },
    data_gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "impact", "suggested_fix"],
        properties: {
          title: { type: "string" },
          impact: { type: "string" },
          suggested_fix: { type: "string" }
        }
      }
    },
    rfx_shortlist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vendor_id", "vendor_name", "reason", "suggested_role", "risk"],
        properties: {
          vendor_id: { type: ["string", "null"] },
          vendor_name: { type: "string" },
          reason: { type: "string" },
          suggested_role: { type: "string" },
          risk: { type: "string" }
        }
      }
    },
    proposed_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "action", "rationale", "requires_confirmation"],
        properties: {
          priority: { type: "string" },
          action: { type: "string" },
          rationale: { type: "string" },
          requires_confirmation: { type: "boolean" }
        }
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

async function resolveCanonicalUser(supabase: ReturnType<typeof createClient>, user: { owner_user_id: string | null; owner_email: string | null }) {
  if (user.owner_email?.includes("@")) return user;
  if (!user.owner_user_id) return user;

  const result = await supabase
    .from("user_profiles")
    .select("owner_user_id,owner_email")
    .eq("owner_user_id", user.owner_user_id)
    .limit(1);
  if (result.error) throw result.error;
  const email = cleanText(result.data?.[0]?.owner_email)?.toLowerCase();
  if (!email?.includes("@")) return user;
  return {
    ...user,
    owner_email: email
  };
}

async function writeAuditLog(
  supabase: ReturnType<typeof createClient>,
  user: { owner_user_id: string | null; owner_email: string | null },
  action: string,
  entityType: string,
  entityId: unknown,
  summary: string,
  metadata: Record<string, unknown> = {}
) {
  const result = await supabase.from("saas_audit_log").insert(withOwner({
    actor_email: user.owner_email,
    action,
    entity_type: entityType,
    entity_id: cleanText(entityId),
    summary,
    metadata
  }, user));
  if (result.error) throw result.error;
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

const MANAGED_CATALOG_CATEGORIES = new Set([
  "equipment",
  "trailer",
  "config",
  "operation",
  "service",
  "driver",
  "mx_border_crossing",
  "us_border_crossing",
  "border_crossing"
]);

function catalogCode(value: unknown) {
  return catalogKey(value).replace(/\s+/g, "_").slice(0, 64);
}

function isManualCatalogOwnedBy(item: Record<string, unknown>, user: { owner_email: string | null }) {
  const source = cleanText(item.source);
  if (source !== "rateware_manual_catalog") return true;
  const metadata = typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : {};
  const ownerEmail = cleanText(metadata.owner_email);
  return !ownerEmail || !user.owner_email || ownerEmail === user.owner_email;
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

function locationOptionPayload(location: Record<string, unknown>) {
  const value = cleanText(location.raw_value || location.metro_city || [location.city, location.state_code].filter(Boolean).join(", ")) || "";
  const geography = [location.zip_prefix, location.market, location.region, location.country]
    .filter(Boolean)
    .join(" | ");
  return {
    id: location.id,
    source: location.source,
    raw_value: location.raw_value,
    value,
    label: [location.metro_city || value, geography].filter(Boolean).join(" | "),
    zip_prefix: location.zip_prefix,
    city: location.city,
    state_code: location.state_code,
    state_name: location.state_name,
    country: location.country,
    market: location.market,
    region: location.region
  };
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

const LOCATION_US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY", "DC"
]);

const LOCATION_CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NF", "NS", "NT", "NU", "ON", "PE", "PQ", "QC", "SK", "YT"]);
const LOCATION_MX_STATES = new Set(["AG", "BC", "BN", "BS", "CH", "CI", "CL", "CM", "CO", "CS", "CU", "DF", "DG", "EM", "GR", "GT", "HG", "JA", "MI", "MO", "MX", "NA", "NL", "OA", "PU", "QE", "QR", "SI", "SL", "SO", "TB", "TL", "TM", "VE", "YU", "ZA"]);
const LOCATION_MX_STATE_NAME_HINTS = [
  "AGUASCALIENTES",
  "BAJA CALIFORNIA",
  "BAJA CALIFORNIA SUR",
  "CAMPECHE",
  "CHIAPAS",
  "CHIHUAHUA",
  "CIUDAD DE MEXICO",
  "COAHUILA",
  "COLIMA",
  "DISTRITO FEDERAL",
  "DURANGO",
  "ESTADO DE MEXICO",
  "GUANAJUATO",
  "GUERRERO",
  "HIDALGO",
  "JALISCO",
  "MICHOACAN",
  "MORELOS",
  "NAYARIT",
  "NUEVO LEON",
  "OAXACA",
  "PUEBLA",
  "QUERETARO",
  "QUINTANA ROO",
  "SAN LUIS POTOSI",
  "SINALOA",
  "SONORA",
  "TABASCO",
  "TAMAULIPAS",
  "TLAXCALA",
  "VERACRUZ",
  "YUCATAN",
  "ZACATECAS"
];
const LOCATION_MX_CITY_HINTS = [
  "ACAPULCO",
  "ACUNA",
  "AGUASCALIENTES",
  "ALLENDE",
  "APODACA",
  "ARTEAGA",
  "CELAYA",
  "CELAYA",
  "CHIHUAHUA",
  "CIUDAD JUAREZ",
  "CD JUAREZ",
  "COLOMBIA",
  "COATZACOALCOS",
  "CUAUTITLAN",
  "CULIACAN",
  "ESCOBEDO",
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
  "MONTEMORELOS",
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

function locationCountry(location: Record<string, unknown>) {
  return String(location.country || "").toUpperCase();
}

function locationTokens(value: unknown) {
  return catalogKey(value).split(" ").filter(Boolean);
}

function normalizedLocationStateCode(value: unknown) {
  const state = catalogKey(value);
  return state === "EM" ? "MX" : state;
}

function locationTextProfile(value: unknown) {
  const lookup = catalogKey(value);
  const tokens = locationTokens(value);
  const tokenSet = new Set(tokens);
  const hasUsState = tokens.some((token) => LOCATION_US_STATES.has(token));
  const hasCaProvince = tokens.some((token) => LOCATION_CA_PROVINCES.has(token));
  const hasMxStateName = LOCATION_MX_STATE_NAME_HINTS.some((state) => lookup.includes(state));
  const hasMxState = hasMxStateName || tokens.some((token) => LOCATION_MX_STATES.has(token));
  const hasFiveDigitPostal = /\b\d{4,5}\b/.test(lookup);
  const hasCanadianPostalCode = /\b[A-Z]\d[A-Z]\b/.test(lookup);
  const hasMxCityHint = LOCATION_MX_CITY_HINTS.some((city) => lookup.includes(city));
  const strongMxText = tokenSet.has("MEX") || tokenSet.has("MX") || (tokenSet.has("MEXICO") && !tokenSet.has("NEW") && !hasUsState);
  const strongUsText = tokenSet.has("USA") || tokenSet.has("US") || tokenSet.has("UNITED");
  const strongCaText = tokenSet.has("CANADA");
  const hasMxEvidence = strongMxText || hasMxState || hasMxStateName || hasMxCityHint;
  const mxStateOnly = hasMxState && !hasUsState && !hasCaProvince;
  const mxPostalHint = hasFiveDigitPostal && hasMxState && !strongUsText && !strongCaText;
  const explicitMx = strongMxText || mxStateOnly || mxPostalHint || ((hasMxCityHint || hasMxStateName) && hasMxState && !strongUsText && !strongCaText);
  const explicitUs = strongUsText || (hasUsState && !explicitMx && !strongCaText && !hasCanadianPostalCode);
  const explicitCa = strongCaText || (hasCanadianPostalCode && !explicitMx) || (hasCaProvince && !hasMxState && !strongUsText);
  return { lookup, tokens, explicitMx, explicitUs, explicitCa, hasMxState, hasMxStateName, hasFiveDigitPostal, hasMxCityHint, hasMxEvidence };
}

function locationMatchesProfile(location: Record<string, unknown>, profile: ReturnType<typeof locationTextProfile>) {
  const country = locationCountry(location);
  if (profile.explicitMx && country && country !== "MX") return false;
  if (profile.explicitUs && country && country !== "US") return false;
  if (profile.explicitCa && country && country !== "CA") return false;
  return true;
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
      location.city,
      location.metro_city,
      location.market,
      location.region,
      [location.city, location.state_code].filter(Boolean).join(", "),
      [location.city, location.state_name].filter(Boolean).join(", ")
    ];
    if (locationCountry(location) !== "MX") keys.push(location.zip_prefix);

    for (const lookup of keys.map(catalogKey).filter(Boolean)) {
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
  const profile = locationTextProfile(value);

  const direct = index.get(lookup);
  if (direct && locationMatchesProfile(direct, profile)) {
    return {
      location: direct,
      score: 100,
      reason: "exact catalog match",
      candidates: [locationCandidate(direct, 100, "exact catalog match")]
    };
  }

  const zipToken = lookup.match(/\b[A-Z]\d[A-Z]|\b\d{3,5}\b/)?.[0] || null;
  const zip = zipToken && /^\d/.test(zipToken) ? zipToken.slice(0, 3) : zipToken;
  const allowZipShortcut = zip
    && !profile.explicitMx
    && (profile.explicitUs || profile.explicitCa || (!profile.hasMxEvidence && !profile.hasFiveDigitPostal));
  if (allowZipShortcut && index.get(catalogKey(zip))) {
    const zipMatch = index.get(catalogKey(zip))!;
    if (locationCountry(zipMatch) !== "MX") {
      return {
        location: zipMatch,
        score: 92,
        reason: `zip prefix ${zip} match`,
        candidates: [locationCandidate(zipMatch, 92, `zip prefix ${zip} match`)]
      };
    }
  }

  const candidates: Array<{ location: Record<string, unknown>; score: number; reason: string }> = [];
  const seen = new Set<Record<string, unknown>>();
  for (const [, location] of index) {
    if (seen.has(location)) continue;
    seen.add(location);
    if (!locationMatchesProfile(location, profile)) continue;
    let score = 0;
    const reasons: string[] = [];
    const country = locationCountry(location);
    if ((profile.explicitMx && country === "MX") || (profile.explicitUs && country === "US") || (profile.explicitCa && country === "CA")) {
      score += 12;
      reasons.push("country hint");
    }
    const zipPrefix = catalogKey(location.zip_prefix);
    if (zipPrefix && lookup.includes(zipPrefix)) {
      const zipCompatible = country === "MX"
        || profile.explicitUs
        || profile.explicitCa
        || (!profile.hasMxEvidence && !profile.hasFiveDigitPostal);
      if (zipCompatible) {
        score += country === "MX" ? 12 : 55;
        reasons.push(country === "MX" ? "mx postal auxiliary" : "zip prefix");
      }
    }
    const state = catalogKey(location.state_code);
    const stateMatches = state && profile.tokens.some((token) => normalizedLocationStateCode(token) === normalizedLocationStateCode(state));
    if (state && (lookup.includes(state) || stateMatches)) {
      score += country === "MX" ? 38 : 30;
      reasons.push("state match");
    }
    const stateName = catalogKey(location.state_name);
    if (stateName && lookup.includes(stateName)) {
      score += country === "MX" ? 32 : 20;
      reasons.push("state name");
    }
    const city = catalogKey(location.city);
    if (city && lookup.includes(city)) {
      score += country === "MX" ? 48 : 38;
      reasons.push("city match");
    }
    const metro = catalogKey(location.metro_city);
    if (metro && (lookup.includes(metro) || metro.includes(lookup))) {
      score += country === "MX" ? 42 : 30;
      reasons.push("metro match");
    }
    const market = catalogKey(location.market);
    if (market && (lookup.includes(market) || market.includes(lookup))) {
      score += country === "MX" ? 30 : 20;
      reasons.push("market match");
    }
    const region = catalogKey(location.region);
    if (region && (lookup.includes(region) || region.includes(lookup))) {
      score += country === "MX" ? 18 : 10;
      reasons.push("region match");
    }
    score += Math.max(0, 6 - sourceRank(location.source));
    if (score >= 25) candidates.push({ location, score, reason: reasons.join(", ") || "catalog match" });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5).map((candidate) => locationCandidate(candidate.location, candidate.score, candidate.reason));
  const best = candidates[0] || null;
  const threshold = locationCountry(best?.location || {}) === "MX" ? 45 : 35;
  if (!best || best.score < threshold) {
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

function locationMatchMeta(prefix: "origin" | "destination", resolution: ReturnType<typeof locationMatch>, source = "auto_catalog") {
  return {
    [`${prefix}_match_source`]: resolution?.location ? source : "unmatched",
    [`${prefix}_match_confidence`]: Math.max(0, Math.min(100, Number(resolution?.score || 0))),
    [`${prefix}_match_manual`]: false
  };
}

function isLocationResolved(row: Record<string, unknown>, prefix: "origin" | "destination") {
  const country = String(row[`${prefix}_country`] || "").toUpperCase();
  if (country === "MX") {
    return Boolean(row[`${prefix}_city`] && row[`${prefix}_state`] && (row[`${prefix}_market`] || row[`${prefix}_region`]));
  }
  if (country === "US" || country === "CA") {
    return Boolean((row[`${prefix}_zip_prefix`] || row[`${prefix}_market`]) && row[`${prefix}_state`]);
  }
  return Boolean(row[`${prefix}_market`] || row[`${prefix}_zip_prefix`] || row[`${prefix}_state`] || row[`${prefix}_country`]);
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^@/, "")
    .split(/[\/\s,;]+/)[0]
    .replace(/^.*@/, "")
    .replace(/[^a-z0-9.-]+$/g, "")
    .replace(/\.+$/g, "");
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(cleaned) ? cleaned : null;
}

function normalizeEmail(value: unknown) {
  const text = String(value || "").toLowerCase();
  return text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] || null;
}

function memoryRuleIdsFromAudit(upload: Record<string, unknown>) {
  const audit = typeof upload.interpretation_audit === "object" && upload.interpretation_audit
    ? upload.interpretation_audit as Record<string, unknown>
    : {};
  const rules = Array.isArray(audit.memory_rules_used) ? audit.memory_rules_used : [];
  return rules
    .map((rule) => typeof rule === "object" && rule ? cleanText((rule as Record<string, unknown>).id) : null)
    .filter(Boolean) as string[];
}

function memoryEffectivenessSummary(rule: Record<string, unknown>, uploads: Record<string, unknown>[]) {
  const ruleId = cleanText(rule.id);
  const matchedUploads = uploads.filter((upload) => memoryRuleIdsFromAudit(upload).includes(ruleId || ""));
  if (!matchedUploads.length) {
    return {
      upload_count: 0,
      staged_rows: 0,
      expected_rows: 0,
      completion_rate: null,
      failed_count: 0,
      warning_count: 0,
      health: Number(rule.usage_count || 0) > 0 ? "unmeasured" : "unused",
      quality_score: Number(rule.usage_count || 0) > 0 ? 45 : 0,
      quality_label: Number(rule.usage_count || 0) > 0 ? "Needs evidence" : "No evidence",
      last_upload_at: null
    };
  }

  const stagedRows = matchedUploads.reduce((sum, upload) => sum + (Number(upload.interpreted_rate_rows || 0) || 0), 0);
  const expectedRows = matchedUploads.reduce((sum, upload) => sum + (Number(upload.expected_rate_rows || upload.interpreted_rate_rows || 0) || 0), 0);
  const failedCount = matchedUploads.filter((upload) => upload.status === "failed" || upload.audit_status === "failed").length;
  const warningCount = matchedUploads.reduce((sum, upload) => {
    const warnings = Array.isArray(upload.audit_warnings) ? upload.audit_warnings : [];
    return sum + warnings.length;
  }, 0);
  const completionRate = expectedRows > 0 ? Math.round((stagedRows / expectedRows) * 100) : null;
  const health = failedCount > 0 || (completionRate !== null && completionRate < 75)
    ? "suspect"
    : warningCount > matchedUploads.length * 2 || (completionRate !== null && completionRate < 95)
      ? "watch"
      : "healthy";
  const warningPenalty = Math.min(25, warningCount * 4);
  const failurePenalty = Math.min(35, failedCount * 15);
  const completionScore = completionRate === null ? 55 : Math.max(0, Math.min(100, completionRate));
  const evidenceBonus = Math.min(10, matchedUploads.length * 2);
  const qualityScore = Math.max(0, Math.min(100, Math.round(completionScore - warningPenalty - failurePenalty + evidenceBonus)));
  const qualityLabel = qualityScore >= 90
    ? "Strong"
    : qualityScore >= 75
      ? "Good"
      : qualityScore >= 55
        ? "Needs review"
        : "Risky";
  return {
    upload_count: matchedUploads.length,
    staged_rows: stagedRows,
    expected_rows: expectedRows,
    completion_rate: completionRate,
    failed_count: failedCount,
    warning_count: warningCount,
    health,
    quality_score: qualityScore,
    quality_label: qualityLabel,
    last_upload_at: matchedUploads.map((upload) => cleanText(upload.interpreted_at || upload.created_at)).filter(Boolean).sort().at(-1) || null
  };
}

function memoryConflictSignals(rule: Record<string, unknown>, rules: Record<string, unknown>[]) {
  const instruction = String(rule.instruction || "").toLowerCase();
  const scope = cleanText(rule.scope) || "global";
  const target = [normalizeDomain(rule.vendor_domain), cleanText(rule.rfx_hint), cleanText(rule.raw_upload_id)].filter(Boolean).join(":") || "global";
  const issues: string[] = [];
  const addIssue = (message: string) => {
    if (!issues.includes(message)) issues.push(message);
  };
  const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));
  const deniesRoundtrip = hasAny(instruction, ["only classify roundtrip", "only use roundtrip", "explicitly stated", "do not infer roundtrip", "no roundtrip"]);
  const forcesRoundtrip = hasAny(instruction, ["default roundtrip", "force roundtrip", "assume roundtrip", "classify as roundtrip"]);
  const forcesOneWay = hasAny(instruction, ["default one way", "force one way", "assume one way", "classify as one way"]);
  const hasAllInRule = hasAny(instruction, ["all-in", "all in", "includes fsc", "includes border", "do not split"]);
  const hasSplitRule = hasAny(instruction, ["split fsc", "separate fsc", "separate border", "linehaul", "border fee"]);
  if (forcesRoundtrip && deniesRoundtrip) addIssue("Roundtrip wording conflicts inside this rule.");
  if (forcesRoundtrip && forcesOneWay) addIssue("Service wording conflicts inside this rule.");
  if (hasAllInRule && hasSplitRule) addIssue("All-in and split-cost wording both appear in this rule.");

  for (const other of rules) {
    if (other.id === rule.id || !other.active) continue;
    const otherScope = cleanText(other.scope) || "global";
    const otherTarget = [normalizeDomain(other.vendor_domain), cleanText(other.rfx_hint), cleanText(other.raw_upload_id)].filter(Boolean).join(":") || "global";
    const comparable = scope === "global" || otherScope === "global" || (scope === otherScope && target === otherTarget);
    if (!comparable) continue;
    const otherInstruction = String(other.instruction || "").toLowerCase();
    const otherDeniesRoundtrip = hasAny(otherInstruction, ["only classify roundtrip", "only use roundtrip", "explicitly stated", "do not infer roundtrip", "no roundtrip"]);
    const otherForcesRoundtrip = hasAny(otherInstruction, ["default roundtrip", "force roundtrip", "assume roundtrip", "classify as roundtrip"]);
    const otherForcesOneWay = hasAny(otherInstruction, ["default one way", "force one way", "assume one way", "classify as one way"]);
    const otherAllInRule = hasAny(otherInstruction, ["all-in", "all in", "includes fsc", "includes border", "do not split"]);
    const otherSplitRule = hasAny(otherInstruction, ["split fsc", "separate fsc", "separate border", "linehaul", "border fee"]);
    if ((forcesRoundtrip && (otherDeniesRoundtrip || otherForcesOneWay)) || (deniesRoundtrip && otherForcesRoundtrip) || (forcesOneWay && otherForcesRoundtrip)) {
      addIssue(`Potential service conflict with "${cleanText(other.title) || "another rule"}".`);
    }
    if ((hasAllInRule && otherSplitRule) || (hasSplitRule && otherAllInRule)) {
      addIssue(`Potential cost breakout conflict with "${cleanText(other.title) || "another rule"}".`);
    }
  }

  return {
    count: issues.length,
    severity: issues.length > 1 ? "danger" : issues.length === 1 ? "warning" : "none",
    issues: issues.slice(0, 4)
  };
}

function memoryRecommendation(rule: Record<string, unknown>, effectiveness: Record<string, unknown>, conflicts: Record<string, unknown> = {}) {
  const health = cleanText(effectiveness.health) || "unused";
  const scope = cleanText(rule.scope) || "global";
  const ownerEmail = cleanText(rule.owner_email);
  const uploadCount = Number(effectiveness.upload_count || 0);
  const usageCount = Number(rule.usage_count || 0);
  const warningCount = Number(effectiveness.warning_count || 0);
  const failedCount = Number(effectiveness.failed_count || 0);
  const conflictCount = Number(conflicts.count || 0);
  const completionRate = effectiveness.completion_rate === null || effectiveness.completion_rate === undefined
    ? null
    : Number(effectiveness.completion_rate);

  if (conflictCount > 0) {
    return {
      code: "resolve_conflict",
      label: "Resolve conflict",
      tone: conflictCount > 1 ? "danger" : "warning",
      rationale: "This rule appears to overlap or contradict another active memory rule. Review before applying broadly."
    };
  }
  if (!ownerEmail) {
    return {
      code: "system_rule",
      label: "Monitor",
      tone: "neutral",
      rationale: "System rule. Keep it active unless repeated evidence shows it creates bad interpretations."
    };
  }
  if (health === "suspect") {
    return {
      code: "review_or_archive",
      label: "Review or archive",
      tone: "danger",
      rationale: `This rule is linked to ${failedCount} failed upload(s) or low row completion${completionRate !== null ? ` (${completionRate}%)` : ""}.`
    };
  }
  if (health === "watch") {
    return {
      code: "tighten_rule",
      label: "Tighten wording",
      tone: "warning",
      rationale: `This rule is working with warnings. Review the wording and make it more specific before it spreads.`
    };
  }
  if (health === "unused" && usageCount === 0) {
    return {
      code: "archive_candidate",
      label: "Archive candidate",
      tone: "muted",
      rationale: "This rule has not been used yet. Archive it if it was experimental or too narrow."
    };
  }
  if (health === "healthy" && scope !== "global" && uploadCount >= 3 && warningCount === 0) {
    return {
      code: "promote_candidate",
      label: "Promote candidate",
      tone: "success",
      rationale: "This targeted rule has worked cleanly across multiple uploads. Consider making it global if it is broadly true."
    };
  }
  if (health === "healthy") {
    return {
      code: "keep",
      label: "Keep",
      tone: "success",
      rationale: "This rule has recent evidence and no major audit issues."
    };
  }
  return {
    code: "collect_more_data",
    label: "Collect data",
    tone: "warning",
    rationale: "The rule has been used but does not have enough matched audit evidence yet."
  };
}

function memoryRuleMatchesUpload(rule: Record<string, unknown>, upload: Record<string, unknown>) {
  const scope = cleanText(rule.scope) || "global";
  if (scope === "global") return true;
  if (scope === "upload") return cleanText(rule.raw_upload_id) === cleanText(upload.id);
  if (scope === "rfx") return Boolean(cleanText(rule.rfx_hint) && cleanText(rule.rfx_hint) === cleanText(upload.rfx_hint));
  if (scope === "vendor") {
    if (rule.vendor_id && upload.vendor_id && rule.vendor_id === upload.vendor_id) return true;
    const ruleDomain = normalizeDomain(rule.vendor_domain);
    const vendor = typeof upload.vendors === "object" && upload.vendors ? upload.vendors as Record<string, unknown> : {};
    const uploadDomain = normalizeDomain(vendor.domain || upload.vendor_hint);
    return Boolean(ruleDomain && uploadDomain && ruleDomain === uploadDomain);
  }
  return false;
}

function domainFromVendorReference(value: unknown) {
  const email = normalizeEmail(value);
  if (email) return normalizeDomain(email.split("@").pop());
  const text = cleanText(value);
  if (!text) return null;
  const domainText = text.replace(/^@/, "");
  if (!/[a-z0-9-]+\.[a-z]{2,}/i.test(domainText)) return null;
  return normalizeDomain(domainText);
}

function vendorReferenceCandidatesFromText(value: unknown) {
  const text = cleanText(value);
  if (!text) return [];
  const source = text.replace(/\.(pdf|xlsx|xls|csv|eml|png|jpe?g|webp)\b/gi, " ");
  const candidates = new Set<string>();
  const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  const atDomains = source.match(/@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/gi) || [];
  const bareDomains = source.match(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z]{2,}\b/gi) || [];

  if (normalizeEmail(text) || domainFromVendorReference(text)) candidates.add(text);
  emails.forEach((candidate) => candidates.add(candidate));
  atDomains.forEach((candidate) => candidates.add(candidate.replace(/^@/, "")));
  bareDomains.forEach((candidate) => candidates.add(candidate));
  const businessName = vendorBusinessNameCandidateFromText(source);
  if (businessName) candidates.add(businessName);

  return [...candidates]
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .filter((candidate) => !isInternalRatewareDomain(candidate));
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.mx",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

const INTERNAL_RATEWARE_DOMAINS = new Set([
  "heymarksman.com",
  "marksmanxbf.com",
  "marksmanxbfllc.com",
  "rateware.app",
  "rateware.vercel.app"
]);

function isGenericEmailDomain(domain: unknown) {
  const value = normalizeDomain(domain);
  if (!value) return false;
  return GENERIC_EMAIL_DOMAINS.has(value);
}

function isInternalRatewareDomain(value: unknown) {
  const domain = domainFromVendorReference(value);
  return Boolean(domain && INTERNAL_RATEWARE_DOMAINS.has(domain));
}

function vendorEmails(vendor: Record<string, unknown>) {
  const secondary = Array.isArray(vendor.secondary_emails) ? vendor.secondary_emails : [];
  return [vendor.primary_email, ...secondary]
    .map(normalizeEmail)
    .filter(Boolean) as string[];
}

function vendorBusinessNameCandidateFromText(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const withoutContacts = text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " ")
    .replace(/@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/gi, " ")
    .replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z]{2,}\b/gi, " ")
    .replace(/\bRFx?[-_\s]*[A-Z0-9-]+\b/gi, " ")
    .replace(/\b(mail|email|quote|quotation|cotizacion|rate|rates|tarifa|tarifas)\b/gi, " ")
    .replace(/[_|()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = businessNameKey(withoutContacts);
  if (!key || key.length < 4) return null;
  return withoutContacts;
}

function businessNameKey(value: unknown) {
  const withoutContact = String(value ?? "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " ")
    .replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z]{2,}\b/gi, " ");
  return catalogKey(withoutContact)
    .replace(/\b(SA DE CV|S A DE C V|S DE RL DE CV|S DE RL|SAPI DE CV|SAPI|SC|S C|SRL|S R L|LLC|INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED)\b/g, " ")
    .replace(/\b(TRANSPORTES|TRANSPORTE|TRANSPORT|LOGISTICS|LOGISTICA|LOGISTICOS|FREIGHT|CARGO|EXPRESS|SERVICES|SERVICIOS)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchScore(vendor: Record<string, unknown>, reference: unknown) {
  const referenceKey = businessNameKey(reference);
  if (!referenceKey || referenceKey.length < 4) return { score: 0, source: null as string | null };

  const vendorKeys = [
    { value: vendor.vendor_name, source: "vendor_name" },
    { value: vendor.legal_name, source: "legal_name" }
  ]
    .map((item) => ({ ...item, key: businessNameKey(item.value) }))
    .filter((item) => item.key && item.key.length >= 4);

  for (const item of vendorKeys) {
    if (item.key === referenceKey) return { score: 88, source: item.source };
  }

  for (const item of vendorKeys) {
    const shorter = item.key.length <= referenceKey.length ? item.key : referenceKey;
    const longer = item.key.length > referenceKey.length ? item.key : referenceKey;
    if (shorter.length >= 8 && longer.includes(shorter)) return { score: 80, source: `${item.source}_contains` };
  }

  const referenceTokens = new Set(referenceKey.split(" ").filter((token) => token.length >= 3));
  if (referenceTokens.size < 2) return { score: 0, source: null };
  for (const item of vendorKeys) {
    const vendorTokens = new Set(item.key.split(" ").filter((token) => token.length >= 3));
    const overlap = [...referenceTokens].filter((token) => vendorTokens.has(token)).length;
    const coverage = overlap / Math.max(1, Math.min(referenceTokens.size, vendorTokens.size));
    if (overlap >= 2 && coverage >= 0.8) return { score: 76, source: `${item.source}_tokens` };
  }

  return { score: 0, source: null };
}

function scoreVendorReference(vendor: Record<string, unknown>, reference: unknown) {
  const email = normalizeEmail(reference);
  const domain = domainFromVendorReference(reference);
  const nameScore = nameMatchScore(vendor, reference);
  if (!email && !domain && !nameScore.score) return { score: 0, source: null as string | null, domain: null as string | null, email: null as string | null };
  const genericDomain = isGenericEmailDomain(domain);
  if (!email && genericDomain && !nameScore.score) return { score: 0, source: null, domain, email };

  const vendorDomain = normalizeDomain(vendor.domain);
  const emails = vendorEmails(vendor);
  let score = 0;
  let source: string | null = null;

  if (email && emails.includes(email)) {
    score = 120;
    source = "email";
  } else if (!genericDomain && domain && vendorDomain && vendorDomain === domain) {
    score = 105;
    source = "domain";
  } else if (!genericDomain && email && domain && vendorDomain === domain) {
    score = 100;
    source = "email_domain";
  } else if (!genericDomain && domain && emails.some((candidate) => candidate.endsWith(`@${domain}`))) {
    score = 92;
    source = "contact_email_domain";
  } else if (!genericDomain && domain && vendorDomain && (domain.endsWith(`.${vendorDomain}`) || vendorDomain.endsWith(`.${domain}`))) {
    score = 78;
    source = "domain_alias";
  } else if (nameScore.score) {
    score = nameScore.score;
    source = nameScore.source;
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

const VENDOR_REFERENCE_SELECT = "id,vendor_name,legal_name,domain,primary_email,secondary_emails,status,base_stage";

async function fetchVendorReferenceRows(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  maxRows = 50000
) {
  if (!user.owner_email) return [];
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const result = await supabase
      .from("vendors")
      .select(VENDOR_REFERENCE_SELECT)
      .eq("owner_email", user.owner_email)
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as Record<string, unknown>[]));
    if ((result.data || []).length < pageSize) break;
  }
  return rows;
}

async function resolveVendorReference(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, reference: unknown) {
  const domain = domainFromVendorReference(reference);
  const email = normalizeEmail(reference);
  if (!domain && !email && !businessNameKey(reference)) return null;

  return resolveVendorReferenceFromRows(await fetchVendorReferenceRows(supabase, user), reference);
}

async function vendorLinkPatch(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  input: Record<string, unknown>,
  current: Record<string, unknown>,
  vendors?: Record<string, unknown>[]
) {
  const explicitVendorUpdate = input.vendor_domain !== undefined;
  const reference = explicitVendorUpdate ? input.vendor_domain : current.vendor_domain;
  const hasExistingLink = Boolean(current.vendor_id);

  if (!cleanText(reference)) {
    return explicitVendorUpdate ? { vendor_id: null, vendor_domain: null } : {};
  }
  if (!explicitVendorUpdate && hasExistingLink) return {};

  const match = vendors
    ? resolveVendorReferenceFromRows(vendors, reference)
    : await resolveVendorReference(supabase, user, reference);
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

const BULK_RATE_ROW_SELECT = [
  "id",
  "status",
  "raw_upload_id",
  "vendor_id",
  "vendor_domain",
  "vendors(vendor_name,domain)",
  "rfx_id",
  "row_id",
  "origin",
  "destination",
  "normalized_origin",
  "normalized_destination",
  "origin_city",
  "origin_state",
  "origin_zip_prefix",
  "origin_market",
  "origin_region",
  "origin_country",
  "destination_city",
  "destination_state",
  "destination_zip_prefix",
  "destination_market",
  "destination_region",
  "destination_country",
  "equipment",
  "trailer",
  "hazmat",
  "temperature_controlled",
  "config",
  "driver",
  "operation",
  "service",
  "all_in_rate",
  "currency",
  "mx_linehaul",
  "us_linehaul",
  "fsc",
  "border_crossing_fee",
  "weekly_capacity",
  "mx_border_crossing_point",
  "us_border_crossing_point",
  "quote_date",
  "audit_flags",
  "extraction_warnings",
  "field_confidence",
  "source_evidence",
  "created_at"
].join(",");

const RATE_ROW_RESPONSE_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "raw_upload_id",
  "interpretation_job_id",
  "status",
  "vendor_id",
  "vendor_domain",
  "rfx_id",
  "row_id",
  "rfx_key",
  "route_key",
  "business_key",
  "origin",
  "destination",
  "normalized_origin",
  "normalized_destination",
  "origin_country",
  "origin_zip_prefix",
  "origin_city",
  "origin_state",
  "origin_region",
  "origin_market",
  "destination_country",
  "destination_zip_prefix",
  "destination_city",
  "destination_state",
  "destination_region",
  "destination_market",
  "equipment",
  "trailer",
  "hazmat",
  "temperature_controlled",
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
  "confidence",
  "quote_date",
  "calculated_miles",
  "calculated_km",
  "carrier_fsc_per_mile",
  "normalized_fsc_per_mile",
  "normalized_fsc_total",
  "fuel_region",
  "fuel_index_date",
  "fuel_diesel_per_gallon",
  "fuel_delta",
  "fuel_source",
  "normalized_all_in_rate",
  "lane_type",
  "leg_status",
  "leg_summary",
  "mx_diesel_mxn_per_liter",
  "mx_diesel_usd_per_liter",
  "mx_fuel_efficiency_km_per_liter",
  "mx_fuel_factor",
  "mx_fuel_cost_usd",
  "mx_fuel_source",
  "fx_rate_mxn_usd",
  "fx_source",
  "catalog_match_status",
  "location_match_status",
  "origin_match_reason",
  "destination_match_reason",
  "origin_match_source",
  "destination_match_source",
  "origin_match_confidence",
  "destination_match_confidence",
  "origin_match_manual",
  "destination_match_manual",
  "origin_location_candidates",
  "destination_location_candidates",
  "extraction_warnings",
  "field_confidence",
  "source_evidence",
  "audit_flags"
];

const RATE_ROW_RESPONSE_SELECT = `${RATE_ROW_RESPONSE_COLUMNS.join(",")}, vendors(vendor_name, domain, primary_email, base_stage, status)`;
const RATE_ROW_RESPONSE_WITH_LEGS_SELECT = `${RATE_ROW_RESPONSE_SELECT}, rateware_lane_legs(*)`;
const RATE_ROW_LIST_COLUMNS = [
  "id",
  "created_at",
  "raw_upload_id",
  "status",
  "vendor_id",
  "vendor_domain",
  "rfx_id",
  "row_id",
  "origin",
  "destination",
  "normalized_origin",
  "normalized_destination",
  "origin_country",
  "origin_zip_prefix",
  "origin_city",
  "origin_state",
  "origin_region",
  "origin_market",
  "destination_country",
  "destination_zip_prefix",
  "destination_city",
  "destination_state",
  "destination_region",
  "destination_market",
  "equipment",
  "trailer",
  "hazmat",
  "temperature_controlled",
  "config",
  "operation",
  "service",
  "driver",
  "mx_border_crossing_point",
  "us_border_crossing_point",
  "mx_linehaul",
  "us_linehaul",
  "fsc",
  "border_crossing_fee",
  "all_in_rate",
  "currency",
  "weekly_capacity",
  "quote_date",
  "origin_match_reason",
  "destination_match_reason",
  "origin_match_source",
  "destination_match_source",
  "origin_match_confidence",
  "destination_match_confidence",
  "origin_match_manual",
  "destination_match_manual"
];
const RATE_ROW_LIST_SELECT = `${RATE_ROW_LIST_COLUMNS.join(",")}, vendors(vendor_name, domain, primary_email, base_stage, status)`;
const RATE_SIGNAL_SELECT = [
  "id",
  "status",
  "vendor_id",
  "vendor_domain",
  "rfx_id",
  "origin",
  "destination",
  "normalized_origin",
  "normalized_destination",
  "origin_country",
  "origin_zip_prefix",
  "origin_city",
  "origin_state",
  "origin_region",
  "origin_market",
  "destination_country",
  "destination_zip_prefix",
  "destination_city",
  "destination_state",
  "destination_region",
  "destination_market",
  "equipment",
  "trailer",
  "hazmat",
  "temperature_controlled",
  "config",
  "operation",
  "service",
  "driver",
  "mx_border_crossing_point",
  "us_border_crossing_point",
  "mx_linehaul",
  "us_linehaul",
  "fsc",
  "border_crossing_fee",
  "all_in_rate",
  "currency",
  "weekly_capacity",
  "quote_date",
  "calculated_miles",
  "calculated_km",
  "created_at",
  "vendors(vendor_name, domain, primary_email, base_stage, status, owner_email)"
].join(",");

const RATE_SEARCH_COLUMNS = [
  "vendor_domain",
  "rfx_id",
  "origin",
  "destination",
  "normalized_origin",
  "normalized_destination",
  "origin_city",
  "destination_city",
  "origin_state",
  "destination_state",
  "origin_zip_prefix",
  "destination_zip_prefix",
  "origin_market",
  "destination_market",
  "origin_region",
  "destination_region",
  "origin_country",
  "destination_country",
  "equipment",
  "trailer",
  "config",
  "driver",
  "operation",
  "service",
  "currency",
  "weekly_capacity",
  "mx_border_crossing_point",
  "us_border_crossing_point",
  "row_id"
];

function applyRateSearchFilter(query: any, search: string) {
  const term = cleanText(search);
  if (!term) return query;
  return query.or(RATE_SEARCH_COLUMNS.map((field) => `${field}.ilike.%${term}%`).join(","));
}

function bulkNumericValue(value: unknown) {
  const cleaned = cleanRateText(value);
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function bulkHasNumericValue(value: unknown) {
  const number = bulkNumericValue(value);
  return number !== null && number > 0;
}

function bulkHasSplitRate(row: Record<string, unknown>) {
  return ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].some((field) => bulkHasNumericValue(row[field]));
}

function bulkNeedsNumericRate(row: Record<string, unknown>) {
  return !bulkHasNumericValue(row.all_in_rate) && !bulkHasNumericValue(row.mx_linehaul) && !bulkHasNumericValue(row.us_linehaul);
}

function bulkNeedsLocationMatch(row: Record<string, unknown>) {
  const originMatched = Boolean(row.origin_market || row.origin_zip_prefix || row.origin_state || row.origin_country);
  const destinationMatched = Boolean(row.destination_market || row.destination_zip_prefix || row.destination_state || row.destination_country);
  return !originMatched || !destinationMatched;
}

function bulkHasVendorMatch(row: Record<string, unknown>) {
  return Boolean(cleanText(row.vendor_id));
}

function bulkHasAllInText(row: Record<string, unknown>) {
  return /[a-z]/i.test(String(row.all_in_rate || ""));
}

function bulkSplitRateTotal(row: Record<string, unknown>) {
  const values = ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"]
    .map((field) => bulkNumericValue(row[field]))
    .filter((value): value is number => value !== null && value > 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function bulkHasSplitAllInConflict(row: Record<string, unknown>) {
  const allIn = bulkNumericValue(row.all_in_rate);
  const splitTotal = bulkSplitRateTotal(row);
  if (allIn === null || splitTotal === null || allIn <= 0 || splitTotal <= 0) return false;
  return Math.abs(allIn - splitTotal) > Math.max(25, allIn * 0.05);
}

function bulkServiceModeKey(value: unknown) {
  const text = catalogKey(value).toLowerCase();
  if (/\b(rt|round trip|roundtrip|round)\b/.test(text)) return "roundtrip";
  if (/\b(ow|one way|oneway)\b/.test(text)) return "oneway";
  return "";
}

function bulkHasSourceServiceConflict(row: Record<string, unknown>) {
  const evidence = objectRecord(row.source_evidence);
  const sourceMode = bulkServiceModeKey([evidence.service, evidence.lane, evidence.source_service].filter(Boolean).join(" "));
  const stagedMode = bulkServiceModeKey(row.service);
  return Boolean(sourceMode && stagedMode && sourceMode !== stagedMode);
}

function bulkHasCurrencyGap(row: Record<string, unknown>) {
  return (bulkHasNumericValue(row.all_in_rate) || bulkHasSplitRate(row)) && !cleanText(row.currency);
}

function bulkHasReviewConflict(row: Record<string, unknown>) {
  return bulkHasAllInText(row) || bulkHasSplitAllInConflict(row) || bulkHasSourceServiceConflict(row) || bulkHasCurrencyGap(row) || !cleanText(row.operation) || !cleanText(row.service);
}

function bulkHasSourceAuditIssue(row: Record<string, unknown>) {
  const confidence = objectRecord(row.field_confidence);
  return (Array.isArray(row.audit_flags) && row.audit_flags.length > 0)
    || (Array.isArray(row.extraction_warnings) && row.extraction_warnings.length > 0)
    || Object.values(confidence).some((value) => Number(value) < 0.75);
}

function bulkIsReadyForApproval(row: Record<string, unknown>) {
  return !bulkNeedsNumericRate(row)
    && !bulkHasAllInText(row)
    && !bulkNeedsLocationMatch(row)
    && bulkHasVendorMatch(row)
    && Boolean(cleanText(row.quote_date))
    && Boolean(cleanText(row.operation))
    && Boolean(cleanText(row.service))
    && !bulkHasReviewConflict(row);
}

function bulkColumnText(row: Record<string, unknown>, field: string) {
  if (field === "vendor") return [row.vendor_domain].filter(Boolean).join(" ");
  if (field === "origin") {
    return [
      row.origin,
      row.normalized_origin,
      row.origin_city,
      row.origin_state,
      row.origin_zip_prefix,
      row.origin_market,
      row.origin_region,
      row.origin_country
    ].filter(Boolean).join(" ");
  }
  if (field === "destination") {
    return [
      row.destination,
      row.normalized_destination,
      row.destination_city,
      row.destination_state,
      row.destination_zip_prefix,
      row.destination_market,
      row.destination_region,
      row.destination_country
    ].filter(Boolean).join(" ");
  }
  return String(row[field] ?? "");
}

function bulkColumnValues(row: Record<string, unknown>, field: string) {
  const vendor = objectRecord(row.vendors);
  if (field === "vendor") return [vendor.vendor_name, row.vendor_domain, vendor.domain].filter(Boolean);
  if (field === "hazmat" || field === "temperature_controlled") return [row[field] ? "Yes" : "No"];
  if (field === "origin") {
    return [
      row.origin,
      row.normalized_origin,
      row.origin_city,
      row.origin_state,
      row.origin_zip_prefix,
      row.origin_market,
      row.origin_region,
      row.origin_country
    ].filter(Boolean);
  }
  if (field === "destination") {
    return [
      row.destination,
      row.normalized_destination,
      row.destination_city,
      row.destination_state,
      row.destination_zip_prefix,
      row.destination_market,
      row.destination_region,
      row.destination_country
    ].filter(Boolean);
  }
  return [row[field]].filter(Boolean);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bulkFilterKey(value: unknown) {
  const text = cleanText(value) || "(blank)";
  return text.toLowerCase();
}

function matchesBulkColumnFilters(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([field, value]) => {
    const rowValues = bulkColumnValues(row, field).map((item) => cleanText(item)).filter(Boolean) as string[];
    const candidates = rowValues.length ? rowValues : ["(blank)"];
    if (Array.isArray(value)) {
      const selected = new Set(value.map(bulkFilterKey));
      if (!selected.size) return true;
      return candidates.some((candidate) => selected.has(bulkFilterKey(candidate)));
    }
    const needle = cleanText(value)?.toLowerCase();
    if (!needle) return true;
    return candidates.join(" ").toLowerCase().includes(needle);
  });
}

function matchesBulkReviewFilter(row: Record<string, unknown>, filter: unknown) {
  const value = cleanText(filter);
  if (!value || value === "all") return true;
  if (value === "needs-location") return bulkNeedsLocationMatch(row);
  if (value === "needs-rate") return bulkNeedsNumericRate(row);
  if (value === "needs-vendor") return !bulkHasVendorMatch(row);
  if (value === "conflicts") return bulkHasReviewConflict(row);
  if (value === "source-audit") return bulkHasSourceAuditIssue(row);
  if (value === "ready") return bulkIsReadyForApproval(row);
  if (value === "all-in") return bulkHasNumericValue(row.all_in_rate);
  if (value === "split-rate") return bulkHasSplitRate(row);
  return true;
}

function matchesBulkRatewareQuickFilter(row: Record<string, unknown>, filter: unknown) {
  const value = cleanText(filter);
  if (!value || value === "all") return true;
  if (value === "cross-border") return isCrossBorderRate(row);
  if (value === "all-in") return bulkHasNumericValue(row.all_in_rate) && !bulkHasSplitRate(row);
  if (value === "split-rate") return bulkHasSplitRate(row);
  if (value === "with-capacity") return Boolean(cleanText(row.weekly_capacity));
  if (value === "conflicts") return bulkHasReviewConflict(row);
  return true;
}

const SQL_RATE_FILTER_FIELDS = new Set([
  "status",
  "raw_upload_id",
  "vendor_domain",
  "rfx_id",
  "row_id",
  "origin_zip_prefix",
  "origin_state",
  "origin_market",
  "origin_region",
  "origin_country",
  "destination_zip_prefix",
  "destination_state",
  "destination_market",
  "destination_region",
  "destination_country",
  "equipment",
  "trailer",
  "hazmat",
  "temperature_controlled",
  "config",
  "operation",
  "service",
  "mx_border_crossing_point",
  "us_border_crossing_point",
  "mx_linehaul",
  "us_linehaul",
  "fsc",
  "border_crossing_fee",
  "all_in_rate",
  "currency",
  "weekly_capacity",
  "quote_date"
]);

function sqlRateFilterField(field: unknown) {
  const value = cleanText(field);
  return value && SQL_RATE_FILTER_FIELDS.has(value) ? value : null;
}

function normalizeColumnFilterValues(value: unknown) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean) as string[];
  const text = cleanText(value);
  return text ? [text] : [];
}

function isBlankFilterValue(value: string) {
  return value === "(blank)";
}

function isSqlCompatibleColumnFilters(columnFilters: Record<string, unknown>) {
  return Object.entries(columnFilters).every(([field, value]) => {
    const column = sqlRateFilterField(field);
    if (!column) return false;
    const values = normalizeColumnFilterValues(value);
    const hasBlank = values.some(isBlankFilterValue);
    const hasRealValues = values.some((item) => !isBlankFilterValue(item));
    return !(hasBlank && hasRealValues);
  });
}

function isSqlCompatibleReviewFilter(filter: unknown) {
  const value = cleanText(filter) || "all";
  return ["all", "needs-vendor"].includes(value);
}

function isSqlCompatibleRatewareQuickFilter(filter: unknown) {
  const value = cleanText(filter) || "all";
  return ["all", "cross-border", "with-capacity"].includes(value);
}

function hasActiveRatewareFilters(filters: Record<string, unknown>) {
  const columnFilters = objectRecord(filters.column_filters);
  return Boolean(
    cleanText(filters.search) ||
    cleanText(filters.operation) ||
    cleanText(filters.service) ||
    (cleanText(filters.quick_filter) || "all") !== "all" ||
    Object.keys(columnFilters).length
  );
}

function canUseSqlRateFilters(filters: Record<string, unknown>) {
  const columnFilters = objectRecord(filters.column_filters);
  if (!isSqlCompatibleColumnFilters(columnFilters)) return false;
  const mode = cleanText(filters.mode);
  if (mode === "rateware") return isSqlCompatibleRatewareQuickFilter(filters.quick_filter);
  return isSqlCompatibleReviewFilter(filters.review_filter);
}

function applySqlColumnFilter(query: any, field: string, value: unknown) {
  const column = sqlRateFilterField(field);
  if (!column) return query;
  const values = normalizeColumnFilterValues(value);
  if (!values.length) return query;

  if (column === "hazmat" || column === "temperature_controlled") {
    const bools = new Set(values.map((item) => item.toLowerCase()).map((item) => item === "yes" || item === "true" ? "true" : item === "no" || item === "false" ? "false" : ""));
    bools.delete("");
    if (bools.size !== 1) return query;
    return query.eq(column, bools.has("true"));
  }

  if (values.length === 1 && isBlankFilterValue(values[0])) return query.is(column, null);
  if (Array.isArray(value)) return query.in(column, values.filter((item) => !isBlankFilterValue(item)));
  return query.ilike(column, `%${values[0]}%`);
}

function applySqlColumnFilters(query: any, columnFilters: Record<string, unknown>) {
  return Object.entries(columnFilters).reduce((current, [field, value]) => applySqlColumnFilter(current, field, value), query);
}

function applySqlDerivedRateFilters(query: any, filters: Record<string, unknown>) {
  const mode = cleanText(filters.mode);
  if (mode === "rateware") {
    const quickFilter = cleanText(filters.quick_filter) || "all";
    if (quickFilter === "cross-border") {
      return query.or("operation.ilike.%cross%,operation.ilike.%export%,operation.ilike.%import%,service.ilike.%cross%,mx_border_crossing_point.not.is.null,us_border_crossing_point.not.is.null");
    }
    if (quickFilter === "with-capacity") return query.not("weekly_capacity", "is", null);
    return query;
  }

  const reviewFilter = cleanText(filters.review_filter) || "all";
  if (reviewFilter === "needs-vendor") return query.is("vendor_id", null);
  return query;
}

function applyBulkRateBaseFilters(query: any, filters: Record<string, unknown>) {
  const mode = cleanText(filters.mode);
  if (mode === "rateware") {
    query = query.eq("status", "approved");
  } else {
    const status = cleanText(filters.status);
    if (status) query = query.eq("status", status);
  }
  if (filters.exclude_archived === true) query = query.neq("status", "archived");

  const rawUploadId = cleanText(filters.raw_upload_id);
  if (rawUploadId) query = query.eq("raw_upload_id", rawUploadId);

  const operation = cleanText(filters.operation);
  if (operation) query = query.ilike("operation", operation);

  const service = cleanText(filters.service);
  if (service) query = query.ilike("service", service);

  const search = cleanText(filters.search);
  if (search) query = applyRateSearchFilter(query, search);
  return query;
}

function applySqlRateFilters(query: any, filters: Record<string, unknown>) {
  query = applyBulkRateBaseFilters(query, filters);
  query = applySqlColumnFilters(query, objectRecord(filters.column_filters));
  query = applySqlDerivedRateFilters(query, filters);
  return query;
}

async function fetchSqlRateFilterValues(
  supabase: ReturnType<typeof createClient>,
  filters: Record<string, unknown>,
  field: string,
  valueSearch = "",
  limit = 1000
) {
  const column = sqlRateFilterField(field);
  if (!column || !canUseSqlRateFilters(filters)) return null;

  const values = new Map<string, string>();
  const pageSize = 1000;
  const hardLimit = 50000;
  let offset = 0;
  let databaseCount = 0;
  const needle = valueSearch.toLowerCase();

  while (offset < hardLimit && values.size < limit) {
    let query = supabase
      .from("rate_staging")
      .select(column, { count: offset === 0 ? "exact" : undefined })
      .order(column, { ascending: true, nullsFirst: true })
      .range(offset, offset + pageSize - 1);
    query = applySqlRateFilters(query, filters);

    const result = await query;
    if (result.error) throw result.error;
    if (offset === 0) databaseCount = result.count || 0;

    const page = (result.data || []) as Record<string, unknown>[];
    for (const row of page) {
      let label = cleanText(row[column]) || "(blank)";
      if (column === "hazmat" || column === "temperature_controlled") label = row[column] ? "Yes" : "No";
      if (needle && !label.toLowerCase().includes(needle)) continue;
      const key = bulkFilterKey(label);
      if (!values.has(key)) values.set(key, label);
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const sorted = [...values.values()].sort((a, b) => a.localeCompare(b));
  return {
    field,
    values: sorted.slice(0, limit),
    total: sorted.length,
    database_count: databaseCount,
    hard_limit_reached: offset >= hardLimit && databaseCount > offset
  };
}

function matchesBulkRateRow(row: Record<string, unknown>, filters: Record<string, unknown>) {
  const mode = cleanText(filters.mode);
  const columnFilters = objectRecord(filters.column_filters);
  if (!matchesBulkColumnFilters(row, columnFilters)) return false;
  if (mode === "rateware") return matchesBulkRatewareQuickFilter(row, filters.quick_filter);
  return matchesBulkReviewFilter(row, filters.review_filter);
}

async function fetchBulkRateRowsByFilter(supabase: ReturnType<typeof createClient>, filters: Record<string, unknown>, maxMatches = 50000) {
  const pageSize = 1000;
  const hardLimit = 50000;
  const rows: Record<string, unknown>[] = [];
  const matches: Record<string, unknown>[] = [];
  let offset = 0;
  let databaseCount = 0;

  while (rows.length < hardLimit && matches.length < maxMatches) {
    let query = supabase
      .from("rate_staging")
      .select(BULK_RATE_ROW_SELECT, { count: offset === 0 ? "exact" : undefined })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    query = applyBulkRateBaseFilters(query, filters);

    const result = await query;
    if (result.error) throw result.error;
    if (offset === 0) databaseCount = result.count || 0;

    const page = (result.data || []) as Record<string, unknown>[];
    rows.push(...page);
    matches.push(...page.filter((row) => matchesBulkRateRow(row, filters)));
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return {
    rows: matches.slice(0, maxMatches),
    database_count: databaseCount,
    hard_limit_reached: rows.length >= hardLimit && databaseCount > rows.length
  };
}

function mergeRpcColumnFilterValue(existing: unknown, value: string) {
  const next = cleanText(value);
  if (!next) return existing;
  const current = normalizeColumnFilterValues(existing);
  if (!current.length) return [next];
  if (current.some((item) => item.toLowerCase() === next.toLowerCase())) return current;
  return ["__rateware_no_match__"];
}

function normalizedRpcRateFilters(filters: Record<string, unknown>) {
  const columnFilters = { ...objectRecord(filters.column_filters) };
  const operation = cleanText(filters.operation);
  const service = cleanText(filters.service);
  if (operation) columnFilters.operation = mergeRpcColumnFilterValue(columnFilters.operation, operation);
  if (service) columnFilters.service = mergeRpcColumnFilterValue(columnFilters.service, service);
  return {
    mode: cleanText(filters.mode) || "staging",
    status: cleanText(filters.status),
    raw_upload_id: cleanText(filters.raw_upload_id),
    search: cleanText(filters.search),
    operation: null,
    service: null,
    quick_filter: cleanText(filters.quick_filter) || "all",
    review_filter: cleanText(filters.review_filter) || "all",
    column_filters: columnFilters,
    exclude_archived: filters.exclude_archived === true
  };
}

async function fetchRateRowIdsByFilter(
  supabase: ReturnType<typeof createClient>,
  filters: Record<string, unknown>,
  options: { limit?: number; offset?: number } = {}
) {
  const limit = Math.min(Math.max(Number(options.limit) || 50000, 1), 50000);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const rpcFilters = normalizedRpcRateFilters(filters);
  const result = await supabase.rpc("rateware_filtered_rate_ids", {
    p_mode: rpcFilters.mode,
    p_status: rpcFilters.status,
    p_raw_upload_id: rpcFilters.raw_upload_id,
    p_search: rpcFilters.search,
    p_operation: rpcFilters.operation,
    p_service: rpcFilters.service,
    p_quick_filter: rpcFilters.quick_filter,
    p_review_filter: rpcFilters.review_filter,
    p_column_filters: rpcFilters.column_filters,
    p_exclude_archived: rpcFilters.exclude_archived,
    p_limit: limit,
    p_offset: offset
  });
  if (result.error) throw result.error;

  const data = (result.data || []) as Record<string, unknown>[];
  const ids = data.map((row) => cleanText(row.row_id || row.id)).filter(Boolean) as string[];
  const databaseCount = Number(data[0]?.total_count || 0);
  return {
    ids,
    rows: ids.map((id) => ({ id })),
    database_count: databaseCount,
    hard_limit_reached: databaseCount > offset + ids.length && ids.length >= limit
  };
}

async function collectRateRowIdsByFilter(
  supabase: ReturnType<typeof createClient>,
  filters: Record<string, unknown>,
  options: { maxRows?: number; pageSize?: number } = {}
) {
  const maxRows = Math.min(Math.max(Number(options.maxRows) || 100000, 1), 100000);
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 5000, 1), 5000);
  const ids: string[] = [];
  let offset = 0;
  let databaseCount = 0;
  let hardLimitReached = false;

  while (ids.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - ids.length);
    const filtered = await fetchRateRowIdsByFilter(supabase, filters, { limit, offset });
    if (!databaseCount) databaseCount = filtered.database_count;
    hardLimitReached = hardLimitReached || filtered.hard_limit_reached;
    if (!filtered.ids.length) break;
    ids.push(...filtered.ids);
    offset += filtered.ids.length;
    if (filtered.ids.length < limit || offset >= filtered.database_count) break;
  }

  return {
    ids,
    database_count: databaseCount || ids.length,
    hard_limit_reached: hardLimitReached || ids.length >= maxRows && (databaseCount || 0) > ids.length,
    max_rows: maxRows
  };
}

async function fetchRateRowsForIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
  select = RATE_ROW_LIST_SELECT
) {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkValues(ids, 500)) {
    const result = await supabase
      .from("rate_staging")
      .select(select)
      .in("id", chunk);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  const byId = new Map(rows.map((row) => [cleanText(row.id), row]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
}

async function fetchRatewareRowsBySql(
  supabase: ReturnType<typeof createClient>,
  filterPayload: Record<string, unknown>,
  limit: number,
  offset: number
) {
  let query = supabase
    .from("rate_staging")
    .select(RATE_ROW_LIST_SELECT, { count: "exact" })
    .eq("status", "approved")
    .order("quote_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  query = applySqlRateFilters(query, filterPayload);

  const result = await query;
  if (result.error) throw result.error;
  const total = result.count || 0;
  const rows = result.data || [];
  return {
    rows,
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
    fallback: "sql"
  };
}

async function fetchRateFilterValuesByRpc(
  supabase: ReturnType<typeof createClient>,
  filters: Record<string, unknown>,
  field: string,
  valueSearch = "",
  limit = 1000
) {
  const rpcFilters = normalizedRpcRateFilters(filters);
  const result = await supabase.rpc("rateware_filtered_rate_values", {
    p_field: field,
    p_mode: rpcFilters.mode,
    p_status: rpcFilters.status,
    p_raw_upload_id: rpcFilters.raw_upload_id,
    p_search: rpcFilters.search,
    p_operation: rpcFilters.operation,
    p_service: rpcFilters.service,
    p_quick_filter: rpcFilters.quick_filter,
    p_review_filter: rpcFilters.review_filter,
    p_column_filters: rpcFilters.column_filters,
    p_exclude_archived: rpcFilters.exclude_archived,
    p_value_search: cleanText(valueSearch),
    p_limit: Math.min(Math.max(Number(limit) || 1000, 1), 5000)
  });
  if (result.error) throw result.error;

  const rows = (result.data || []) as Record<string, unknown>[];
  const values = rows.map((row) => cleanText(row.value)).filter(Boolean) as string[];
  const total = Number(rows[0]?.total_count || values.length);
  return {
    field,
    values: values.slice(0, limit),
    total,
    database_count: total,
    hard_limit_reached: total > values.length
  };
}

function chunkValues<T>(values: T[], size = 500) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
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

function createVendorMetricsFromLinkedRates(linkedRates: Record<string, unknown>[]) {
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

function createVendorMetrics(vendor: Record<string, unknown>, rates: Record<string, unknown>[]) {
  const vendorDomain = normalizeDomain(vendor.domain);
  const emails = vendorEmails(vendor);
  const linkedRates = rates.filter((row) => {
    if (row.vendor_id && vendor.id && row.vendor_id === vendor.id) return true;
    const rowDomain = normalizeDomain(row.vendor_domain);
    return Boolean(rowDomain && (rowDomain === vendorDomain || emails.some((email) => email.endsWith(`@${rowDomain}`))));
  });
  return createVendorMetricsFromLinkedRates(linkedRates);
}

function emptyVendorMetrics() {
  return {
    linked_rates: 0,
    approved_rates: 0,
    pending_rates: 0,
    crossborder_rates: 0,
    d2d_import_export_rates: 0,
    mexico_rates: 0,
    avg_all_in_rate: null,
    avg_cost_per_mile: null,
    avg_cost_per_km: null,
    markets: [],
    lanes: [],
    equipment: [],
    border_pairs: [],
    last_quote_date: null
  };
}

function normalizeVendorMetricRow(row: Record<string, unknown> | undefined) {
  if (!row) return emptyVendorMetrics();
  const numericValue = (value: unknown, decimals = 0) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    const factor = 10 ** decimals;
    return Math.round(numberValue * factor) / factor;
  };
  return {
    linked_rates: Number(row.linked_rates || 0),
    approved_rates: Number(row.approved_rates || 0),
    pending_rates: Number(row.pending_rates || 0),
    crossborder_rates: Number(row.crossborder_rates || 0),
    d2d_import_export_rates: Number(row.d2d_import_export_rates || 0),
    mexico_rates: Number(row.mexico_rates || 0),
    avg_all_in_rate: numericValue(row.avg_all_in_rate),
    avg_cost_per_mile: numericValue(row.avg_cost_per_mile, 2),
    avg_cost_per_km: numericValue(row.avg_cost_per_km, 2),
    markets: arrayValues(row.markets).slice(0, 8),
    lanes: arrayValues(row.lanes).slice(0, 6),
    equipment: arrayValues(row.equipment).slice(0, 6),
    border_pairs: arrayValues(row.border_pairs).slice(0, 6),
    last_quote_date: cleanText(row.last_quote_date)
  };
}

async function fetchVendorRateMetrics(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  options: { baseStage?: string | null } = {}
) {
  const result = await supabase.rpc("vendor_rate_metrics_for_owner", {
    p_owner_email: user.owner_email,
    p_base_stage: cleanText(options.baseStage) || null
  });
  if (result.error) throw result.error;
  const metrics = new Map<string, Record<string, unknown>>();
  for (const row of result.data || []) {
    const id = cleanText((row as Record<string, unknown>).vendor_id);
    if (id) metrics.set(id, normalizeVendorMetricRow(row as Record<string, unknown>));
  }
  return metrics;
}

async function fetchVendorRateMetricsSafe(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  options: { baseStage?: string | null } = {}
) {
  try {
    return {
      metrics: await fetchVendorRateMetrics(supabase, user, options),
      warnings: [] as string[]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown metric error");
    console.warn("Vendor rate metrics unavailable; continuing with vendor-only CRM data.", message);
    return {
      metrics: new Map<string, Record<string, unknown>>(),
      warnings: [
        "Quote metrics are temporarily unavailable. Showing vendor CRM data without linked-rate enrichment."
      ]
    };
  }
}

async function fetchBiVendorMetrics(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  filters: Record<string, unknown> = {}
) {
  const result = await supabase.rpc("rateware_bi_vendor_metrics_for_owner", {
    p_owner_email: user.owner_email,
    p_filters: filters
  });
  if (result.error) throw result.error;
  const metrics = new Map<string, Record<string, unknown>>();
  for (const row of result.data || []) {
    const id = cleanText((row as Record<string, unknown>).vendor_id);
    if (id) metrics.set(id, normalizeVendorMetricRow(row as Record<string, unknown>));
  }
  return metrics;
}

async function fetchBiSummary(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  filters: Record<string, unknown> = {}
) {
  const result = await supabase.rpc("rateware_bi_summary_for_owner", {
    p_owner_email: user.owner_email,
    p_filters: filters
  });
  if (result.error) throw result.error;
  return objectRecord(result.data);
}

function buildVendorRateGroups(vendors: Record<string, unknown>[], rates: Record<string, unknown>[]) {
  const vendorIds = new Set(vendors.map((vendor) => cleanText(vendor.id)).filter(Boolean) as string[]);
  const domainIndex = new Map<string, string[]>();
  const groups = new Map<string, Record<string, unknown>[]>();
  const addDomain = (domain: string | null | undefined, id: string) => {
    const key = normalizeDomain(domain);
    if (!key) return;
    const ids = domainIndex.get(key) || [];
    if (!ids.includes(id)) ids.push(id);
    domainIndex.set(key, ids);
  };

  for (const vendor of vendors) {
    const id = cleanText(vendor.id);
    if (!id) continue;
    groups.set(id, []);
    addDomain(normalizeDomain(vendor.domain), id);
    for (const email of vendorEmails(vendor)) addDomain(email.split("@").pop(), id);
  }

  for (const row of rates) {
    const linkedId = cleanText(row.vendor_id);
    if (linkedId && vendorIds.has(linkedId)) {
      groups.get(linkedId)?.push(row);
      continue;
    }

    const rowDomain = normalizeDomain(row.vendor_domain);
    const matchingIds = rowDomain ? domainIndex.get(rowDomain) || [] : [];
    for (const id of matchingIds) groups.get(id)?.push(row);
  }

  return groups;
}

function vendorDuplicateReasons(row: Record<string, unknown>, candidate: Record<string, unknown>) {
  const reasons: string[] = [];
  const domain = normalizeDomain(row.domain);
  const candidateDomain = normalizeDomain(candidate.domain);
  const email = normalizeEmail(row.primary_email);
  const candidateEmail = normalizeEmail(candidate.primary_email);
  const nameKey = catalogKey(row.vendor_name);
  const candidateNameKey = catalogKey(candidate.vendor_name);
  if (domain && candidateDomain && domain === candidateDomain) reasons.push("Same domain");
  if (email && candidateEmail && email === candidateEmail) reasons.push("Same email");
  if (nameKey && candidateNameKey && nameKey === candidateNameKey) reasons.push("Same name");
  else if (nameKey && candidateNameKey && (nameKey.includes(candidateNameKey) || candidateNameKey.includes(nameKey))) reasons.push("Similar name");
  return reasons;
}

function vendorDuplicateIndexKeys(vendor: Record<string, unknown>) {
  const keys = new Set<string>();
  const domain = normalizeDomain(vendor.domain);
  const email = normalizeEmail(vendor.primary_email);
  const name = catalogKey(vendor.vendor_name);
  if (domain && !isGenericEmailDomain(domain)) keys.add(`domain:${domain}`);
  if (email) keys.add(`email:${email}`);
  if (name && name.length >= 4) keys.add(`name:${name}`);
  return [...keys];
}

function vendorDuplicateMap(vendors: Record<string, unknown>[]) {
  const map = new Map<string, Array<{ vendor_id: string | null; vendor_name: string | null; reasons: string[] }>>();
  const indexes = new Map<string, Record<string, unknown>[]>();
  for (const vendor of vendors) {
    const id = cleanText(vendor.id);
    if (!id) continue;
    map.set(id, []);
    for (const key of vendorDuplicateIndexKeys(vendor)) {
      const bucket = indexes.get(key) || [];
      bucket.push(vendor);
      indexes.set(key, bucket);
    }
  }

  const seenPairs = new Set<string>();
  for (const bucket of indexes.values()) {
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
        const left = bucket[leftIndex];
        const right = bucket[rightIndex];
        const leftId = cleanText(left.id);
        const rightId = cleanText(right.id);
        if (!leftId || !rightId) continue;
        const pairKey = [leftId, rightId].sort().join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const leftReasons = vendorDuplicateReasons(left, right);
        const rightReasons = vendorDuplicateReasons(right, left);
        if (leftReasons.length) {
          map.get(leftId)?.push({
            vendor_id: rightId,
            vendor_name: cleanText(right.vendor_name),
            reasons: leftReasons
          });
        }
        if (rightReasons.length) {
          map.get(rightId)?.push({
            vendor_id: leftId,
            vendor_name: cleanText(left.vendor_name),
            reasons: rightReasons
          });
        }
      }
    }
  }

  for (const [id, matches] of map) {
    map.set(id, matches.slice(0, 5));
  }
  return map;
}

function vendorDeclaredSignals(vendor: Record<string, unknown>) {
  const text = vendorSearchText(vendor).toLowerCase();
  const tags = arrayValues(vendor.tags).map((tag) => tag.toLowerCase());
  const signals = new Set<string>();
  const addIf = (signal: string, terms: string[]) => {
    if (tags.includes(signal) || textIncludesAny(text, terms)) signals.add(signal);
  };

  addIf("cross-border", ["cross-border", "crossborder", "frontera", "usa", "laredo", "nuevo laredo", "impo", "expo"]);
  addIf("mexico", ["mexico", "mx", "monterrey", "nuevo leon", "bajio", "norte mx", "centro mx"]);
  addIf("usa", ["usa", "united states", "texas", "laredo tx", "dallas", "el paso"]);
  addIf("canada", ["canada", "canadian"]);
  addIf("dry-van", ["dry van", "caja seca", "53", "dv53"]);
  addIf("flatbed", ["flatbed", "plataforma", "plana"]);
  addIf("reefer", ["reefer", "refrigerado", "temperature", "temperatura"]);
  addIf("hazmat", ["hazmat", "hazard", "peligroso", "quimico"]);
  addIf("ftl", ["ftl", "truckload", "carga completa"]);
  addIf("ltl", ["ltl", "consolidado"]);
  addIf("expedited", ["expedited", "expedite", "dedicado", "hot shot"]);
  addIf("drayage", ["drayage", "intermodal", "puerto", "contenedor"]);
  addIf("laredo", ["laredo", "nuevo laredo"]);
  addIf("monterrey", ["monterrey", "apodaca", "nuevo leon", "nl"]);
  addIf("bajio", ["bajio", "queretaro", "guanajuato", "san luis potosi"]);
  return [...signals].sort();
}

function vendorQuotedSignals(metrics: Record<string, unknown>) {
  const signals = new Set<string>();
  if (Number(metrics.crossborder_rates || 0) > 0) signals.add("cross-border");
  if (Number(metrics.d2d_import_export_rates || 0) > 0) signals.add("d2d");
  if (Number(metrics.mexico_rates || 0) > 0) signals.add("mexico");
  for (const value of arrayValues(metrics.equipment).join(" ").toLowerCase().split(/\s*[|,/]\s*/)) {
    if (textIncludesAny(value, ["dry", "van", "caja", "dv53"])) signals.add("dry-van");
    if (textIncludesAny(value, ["flatbed", "plataforma", "plana"])) signals.add("flatbed");
    if (textIncludesAny(value, ["reefer", "refriger", "temperature"])) signals.add("reefer");
    if (textIncludesAny(value, ["hazmat", "hazard"])) signals.add("hazmat");
  }
  for (const market of arrayValues(metrics.markets)) {
    const text = String(market).toLowerCase();
    if (textIncludesAny(text, ["monterrey", "nuevo leon", "apodaca"])) signals.add("monterrey");
    if (textIncludesAny(text, ["laredo", "nuevo laredo"])) signals.add("laredo");
    if (textIncludesAny(text, ["bajio", "queretaro", "guanajuato", "san luis"])) signals.add("bajio");
    if (textIncludesAny(text, ["dallas", "texas", "tx"])) signals.add("usa");
  }
  return [...signals].sort();
}

function vendorCoverageAlignment(declared: string[], quoted: string[]) {
  const declaredSet = new Set(declared);
  const quotedSet = new Set(quoted);
  const matched = [...declaredSet].filter((signal) => quotedSet.has(signal)).sort();
  const declaredOnly = [...declaredSet].filter((signal) => !quotedSet.has(signal)).sort();
  const quotedOnly = [...quotedSet].filter((signal) => !declaredSet.has(signal)).sort();
  const summary = matched.length
    ? `${matched.length} aligned signal(s)`
    : quotedOnly.length
      ? "Quoted coverage not declared in CRM"
      : declaredOnly.length
        ? "Declared coverage without quote evidence"
        : "No coverage signal yet";
  return { matched, declared_only: declaredOnly, quoted_only: quotedOnly, summary };
}

function vendorReadinessScore(vendor: Record<string, unknown>) {
  const tags = arrayValues(vendor.tags);
  let score = 0;
  if (vendor.vendor_name) score += 15;
  if (vendor.domain) score += 15;
  if (vendor.primary_email || vendor.whatsapp_phone) score += 25;
  if (vendor.preferred_channel) score += 8;
  if (vendor.coverage_notes) score += 18;
  if (tags.length) score += 14;
  if (vendor.notes) score += 5;
  return Math.max(0, Math.min(100, score));
}

function vendorSuggestedTags(vendor: Record<string, unknown>, metrics: Record<string, unknown>, declared: string[], quoted: string[]) {
  const current = new Set(arrayValues(vendor.tags).map((tag) => tag.toLowerCase()));
  const suggestions = new Set<string>();
  const add = (tag: string, condition: boolean) => {
    if (condition && !current.has(tag)) suggestions.add(tag);
  };
  const combined = new Set([...declared, ...quoted]);
  add("cross-border", combined.has("cross-border"));
  add("d2d", combined.has("d2d") || Number(metrics.d2d_import_export_rates || 0) > 0);
  add("mexico", combined.has("mexico"));
  add("usa", combined.has("usa"));
  add("dry-van", combined.has("dry-van"));
  add("flatbed", combined.has("flatbed"));
  add("reefer", combined.has("reefer"));
  add("hazmat", combined.has("hazmat"));
  add("laredo", combined.has("laredo"));
  add("monterrey", combined.has("monterrey"));
  add("quoted", Number(metrics.linked_rates || 0) > 0);
  add("rateware-approved", Number(metrics.approved_rates || 0) > 0);
  return [...suggestions].slice(0, 8);
}

function vendorHealthLabel(score: number) {
  if (score >= 85) return { label: "Procurement ready", tone: "strong" };
  if (score >= 70) return { label: "Good target", tone: "medium" };
  if (score >= 50) return { label: "Needs cleanup", tone: "weak" };
  return { label: "Incomplete", tone: "weak" };
}

function buildVendorIntelligenceRows(
  vendors: Record<string, unknown>[],
  metricsSource: Map<string, Record<string, unknown>> | Record<string, unknown>[]
) {
  const duplicates = vendorDuplicateMap(vendors);
  const metricsByVendor = metricsSource instanceof Map ? metricsSource : null;
  const rateGroups = metricsByVendor ? null : buildVendorRateGroups(vendors, metricsSource);
  return vendors.map((vendor) => {
    const vendorId = cleanText(vendor.id) || "";
    const metrics = metricsByVendor
      ? normalizeVendorMetricRow(metricsByVendor.get(vendorId))
      : createVendorMetricsFromLinkedRates(rateGroups?.get(vendorId) || []);
    const declared = vendorDeclaredSignals(vendor);
    const quoted = vendorQuotedSignals(metrics);
    const alignment = vendorCoverageAlignment(declared, quoted);
    const duplicateMatches = duplicates.get(vendorId) || [];
    const readiness = vendorReadinessScore(vendor);
    const quoteScore = Math.min(22, Number(metrics.approved_rates || 0) * 6 + Number(metrics.linked_rates || 0) * 2);
    const alignmentScore = alignment.matched.length ? Math.min(14, alignment.matched.length * 5) : alignment.quoted_only.length ? 8 : 0;
    const duplicatePenalty = duplicateMatches.length ? 14 : 0;
    const blockedPenalty = cleanText(vendor.status)?.toLowerCase() === "blocked" ? 50 : cleanText(vendor.status)?.toLowerCase() === "inactive" ? 12 : 0;
    const healthScore = Math.max(0, Math.min(100, Math.round(readiness * 0.62 + quoteScore + alignmentScore - duplicatePenalty - blockedPenalty)));
    const health = vendorHealthLabel(healthScore);
    const suggestedTags = vendorSuggestedTags(vendor, metrics, declared, quoted);
    const recommendedAction = healthScore >= 85 && cleanText(vendor.base_stage) !== "procurement"
      ? "Promote to Procurement Base"
      : duplicateMatches.length
        ? "Review duplicate before RFx"
        : readiness < 70
          ? "Complete contact and coverage"
          : Number(metrics.linked_rates || 0) > 0
            ? "Keep active and include in matching RFx"
            : "Validate coverage with first quote";

    return {
      vendor_id: cleanText(vendor.id),
      vendor_name: cleanText(vendor.vendor_name),
      legal_name: cleanText(vendor.legal_name),
      domain: normalizeDomain(vendor.domain),
      contact_name: cleanText(vendor.contact_name),
      primary_email: normalizeEmail(vendor.primary_email),
      whatsapp_phone: cleanText(vendor.whatsapp_phone),
      preferred_channel: cleanText(vendor.preferred_channel),
      base_stage: cleanText(vendor.base_stage),
      funnel_stage: normalizeVendorFunnelStage(vendor.funnel_stage) || null,
      funnel_stage_updated_at: vendor.funnel_stage_updated_at || null,
      targeted_at: vendor.targeted_at || null,
      nested_at: vendor.nested_at || null,
      drafted_at: vendor.drafted_at || null,
      invited_at: vendor.invited_at || null,
      onboarded_at: vendor.onboarded_at || null,
      trained_at: vendor.trained_at || null,
      activated_at: vendor.activated_at || null,
      completed_at: vendor.completed_at || null,
      status: cleanText(vendor.status),
      tags: arrayValues(vendor.tags),
      coverage_notes: cleanText(vendor.coverage_notes),
      notes: cleanText(vendor.notes),
      source: cleanText(vendor.source),
      source_row_number: vendor.source_row_number || null,
      source_spreadsheet_url: cleanText(vendor.source_spreadsheet_url),
      last_synced_at: vendor.last_synced_at || null,
      health_score: healthScore,
      health_label: health.label,
      health_tone: health.tone,
      readiness_score: readiness,
      duplicate_count: duplicateMatches.length,
      duplicate_matches: duplicateMatches,
      declared_signals: declared,
      quoted_signals: quoted,
      coverage_alignment: alignment,
      suggested_tags: suggestedTags,
      rate_metrics: metrics,
      recommended_action: recommendedAction
    };
  }).sort((a, b) => Number(b.health_score || 0) - Number(a.health_score || 0) || String(a.vendor_name || "").localeCompare(String(b.vendor_name || "")));
}

async function fetchVendorIntelligenceVendors(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  options: Record<string, unknown> = {}
) {
  const ids = Array.isArray(options.ids) ? options.ids.map(String).filter(Boolean).slice(0, 500) : [];
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 1000);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = cleanText(options.search)?.replace(/[(),]/g, " ").trim();
  let query = supabase
    .from("vendors")
    .select("*", { count: "exact" })
    .eq("owner_email", user.owner_email)
    .order("created_at", { ascending: false });

  if (ids.length) {
    query = query.in("id", ids).limit(ids.length);
  } else {
    const baseStage = cleanText(options.base_stage)?.toLowerCase();
    if (baseStage && ["sourcing", "procurement", "archived"].includes(baseStage)) query = query.eq("base_stage", baseStage);
    if (search) query = query.or(`vendor_name.ilike.%${search}%,domain.ilike.%${search}%,primary_email.ilike.%${search}%,coverage_notes.ilike.%${search}%,notes.ilike.%${search}%`);
    query = query.range(offset, offset + limit - 1);
  }

  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data || []) as Record<string, unknown>[];
  return {
    rows,
    total: result.count || rows.length,
    limit: ids.length ? rows.length : limit,
    offset: ids.length ? 0 : offset,
    has_more: ids.length ? false : offset + rows.length < (result.count || rows.length)
  };
}

async function buildVendorIntelligence(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  options: Record<string, unknown> = {}
) {
  const [vendorPage, metricsResult] = await Promise.all([
    fetchVendorIntelligenceVendors(supabase, user, options),
    fetchVendorRateMetricsSafe(supabase, user)
  ]);
  const rows = buildVendorIntelligenceRows(vendorPage.rows, metricsResult.metrics);
  return {
    rows,
    warnings: metricsResult.warnings,
    total: vendorPage.total,
    limit: vendorPage.limit,
    offset: vendorPage.offset,
    has_more: vendorPage.has_more,
    summary: {
      vendors: rows.length,
      total_vendors: vendorPage.total,
      visible_vendors: rows.length,
      procurement_ready: rows.filter((row) => Number(row.health_score || 0) >= 85).length,
      duplicates: rows.filter((row) => Number(row.duplicate_count || 0) > 0).length,
      quoted: rows.filter((row) => Number((row.rate_metrics as Record<string, unknown>)?.linked_rates || 0) > 0).length,
      coverage_gaps: rows.filter((row) => {
        const alignment = row.coverage_alignment as Record<string, unknown>;
        return arrayValues(alignment.quoted_only).length || arrayValues(alignment.declared_only).length;
      }).length
    }
  };
}

function vendorEffectiveFunnelStage(row: Record<string, unknown>) {
  const savedStage = normalizeVendorFunnelStage(row.funnel_stage) || "targeted";
  const metrics = typeof row.rate_metrics === "object" && row.rate_metrics ? row.rate_metrics as Record<string, unknown> : {};
  const savedIndex = Math.max(0, VENDOR_FUNNEL_STAGES.indexOf(savedStage));
  const hasLinkedQuotes = Number(metrics.linked_rates || 0) > 0;
  if (hasLinkedQuotes && savedIndex < VENDOR_FUNNEL_STAGES.indexOf("nested")) return "nested";
  return savedStage;
}

function daysSince(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

async function buildVendorFunnel(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }) {
  const vendorsResult = await supabase
    .from("vendors")
    .select("*")
    .eq("owner_email", user.owner_email)
    .eq("base_stage", "procurement")
    .limit(5000);
  if (vendorsResult.error) throw vendorsResult.error;

  const procurementVendors = vendorsResult.data || [];
  const metricsResult = procurementVendors.length
    ? await fetchVendorRateMetricsSafe(supabase, user, { baseStage: "procurement" })
    : { metrics: new Map<string, Record<string, unknown>>(), warnings: [] as string[] };
  const procurementRows = buildVendorIntelligenceRows(procurementVendors, metricsResult.metrics)
    .map((row: Record<string, unknown>) => {
      const stage = vendorEffectiveFunnelStage(row);
      return {
        ...row,
        funnel_stage: normalizeVendorFunnelStage(row.funnel_stage) || "targeted",
        effective_funnel_stage: stage,
        funnel_stage_label: VENDOR_FUNNEL_STAGE_LABELS[stage],
        stage_days: daysSince(row.funnel_stage_updated_at || row.created_at)
      };
    });
  const counts = Object.fromEntries(VENDOR_FUNNEL_STAGES.map((stage) => [stage, procurementRows.filter((row) => row.effective_funnel_stage === stage).length]));
  const activated = Number(counts.activated || 0) + Number(counts.completed || 0);
  const targeted = procurementRows.length || 1;
  return {
    warnings: metricsResult.warnings,
    stages: VENDOR_FUNNEL_STAGES.map((stage, index) => ({
      key: stage,
      label: VENDOR_FUNNEL_STAGE_LABELS[stage],
      description: VENDOR_FUNNEL_STAGE_DESCRIPTIONS[stage],
      order: index,
      count: counts[stage] || 0
    })),
    rows: procurementRows,
    summary: {
      total: procurementRows.length,
      targeted: counts.targeted || 0,
      nested: counts.nested || 0,
      drafted: counts.drafted || 0,
      invited: counts.invited || 0,
      onboarded: counts.onboarded || 0,
      trained: counts.trained || 0,
      activated: counts.activated || 0,
      completed: counts.completed || 0,
      activation_rate: procurementRows.length ? Math.round((activated / targeted) * 100) : 0,
      stuck: procurementRows.filter((row) => Number(row.stage_days || 0) >= 14 && !["activated", "completed"].includes(String(row.effective_funnel_stage))).length,
      quoted: procurementRows.filter((row) => Number((row.rate_metrics as Record<string, unknown>)?.linked_rates || 0) > 0).length
    }
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

function filterPairs(filters: Record<string, unknown>) {
  return Object.entries(filters || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false)
    .map(([keyName, value]) => ({ key: keyName, value: String(value) }))
    .slice(0, 12);
}

function analystConfidenceLabel(recommendations: Record<string, unknown>[], rates: Record<string, unknown>[], vendors: Record<string, unknown>[]) {
  const linkedSignals = rates.filter((row) => row.vendor_id || row.vendor_domain).length;
  const approvedSignals = rates.filter((row) => cleanText(row.status) === "approved").length;
  if (recommendations.length >= 10 && linkedSignals >= 40 && approvedSignals >= 10) return "High";
  if (recommendations.length >= 5 && linkedSignals >= 10) return "Medium";
  if (vendors.length > 0 || rates.length > 0) return "Directional";
  return "Low";
}

function buildSuggestedPivots(prompt: string, intent: ReturnType<typeof carrierIntelligenceIntent>, filters: Record<string, unknown>) {
  const baseFilters = { ...filters };
  if (intent.crossborder) baseFilters.crossborder = true;
  if (intent.d2d) baseFilters.d2d = true;
  const pivots = [
    {
      title: intent.pareto ? "Pareto carriers by D2D transaction share" : "Carrier coverage by corridor",
      purpose: intent.pareto
        ? "Validate which carriers represent the transaction concentration before building an RFx shortlist."
        : "See where each carrier has actual quoted or approved Rateware evidence.",
      rows: intent.pareto ? ["vendor", "corridor", ""] : ["corridor", "vendor", ""],
      columns: ["operation", "service"],
      metric: "transaction_count",
      aggregation: "count",
      filters: filterPairs(baseFilters)
    },
    {
      title: intent.costPerMile ? "Cost per mile by carrier and corridor" : "Rate competitiveness by carrier",
      purpose: "Compare commercial cost signals across carriers, lanes, operations, and services.",
      rows: ["vendor", "corridor", ""],
      columns: ["operation", "service"],
      metric: intent.costPerKm ? "cost_per_km" : "cost_per_mile",
      aggregation: "avg",
      filters: filterPairs(baseFilters)
    },
    {
      title: "Data quality before outreach",
      purpose: "Identify whether missing vendor match, locations, rates, or mileage could weaken the recommendation.",
      rows: ["rate_status", "vendor_stage", "vendor"],
      columns: ["operation", "service"],
      metric: "transaction_count",
      aggregation: "count",
      filters: filterPairs(baseFilters)
    }
  ];

  if (textIncludesAny(prompt, ["border", "frontera", "laredo", "cruce"])) {
    pivots.unshift({
      title: "Border crossing mix",
      purpose: "Check which carriers are strongest by Mexican and US border city pair.",
      rows: ["border_pair", "vendor", ""],
      columns: ["operation", "service"],
      metric: "transaction_count",
      aggregation: "count",
      filters: filterPairs({ ...baseFilters, crossborder: true })
    });
  }

  return pivots.slice(0, 4);
}

function buildDataGaps(rates: Record<string, unknown>[], vendors: Record<string, unknown>[], recommendations: Record<string, unknown>[]) {
  const missingVendor = rates.filter((row) => !row.vendor_id && (row.vendor_domain || row.vendor)).length;
  const missingRate = rates.filter((row) => !numericAmount(row.all_in_rate)).length;
  const missingMiles = rates.filter((row) => numericAmount(row.all_in_rate) && !row.calculated_miles && !row.calculated_km && !numericAmount(row.us_miles)).length;
  const missingOrigin = rates.filter((row) => !row.origin_market && !row.origin_state && !row.origin_country).length;
  const missingDestination = rates.filter((row) => !row.destination_market && !row.destination_state && !row.destination_country).length;
  const missingContact = vendors.filter((vendor) => !vendor.primary_email && !vendor.whatsapp_phone).length;
  const lowEvidence = recommendations.filter((row) => Number((row.metrics as Record<string, unknown> | undefined)?.linked_rates || 0) === 0).length;
  const gaps = [
    missingVendor ? {
      title: "Unmatched carrier quotes",
      impact: `${missingVendor} rate row(s) have vendor evidence but are not linked to a vendor record.`,
      suggested_fix: "Match by domain/email in Sourcing or Procurement Base before using those rows for shortlist decisions."
    } : null,
    missingRate ? {
      title: "Missing all-in rates",
      impact: `${missingRate} row(s) cannot support cost comparison because all-in is missing.`,
      suggested_fix: "Correct all-in, linehaul, FSC, or border fee in Staging Review before ranking by price."
    } : null,
    missingMiles ? {
      title: "Missing mileage or kilometers",
      impact: `${missingMiles} priced row(s) cannot calculate cost per mile/km.`,
      suggested_fix: "Normalize locations and mileage before trusting cost per mile or cost per kilometer."
    } : null,
    missingOrigin || missingDestination ? {
      title: "Location normalization gaps",
      impact: `${missingOrigin + missingDestination} origin/destination side(s) are missing market, state, or country.`,
      suggested_fix: "Resolve US/CA zip prefixes and MX metro/state/region matches in staging."
    } : null,
    missingContact ? {
      title: "Vendor contact gaps",
      impact: `${missingContact} vendor(s) are missing email and WhatsApp contact data.`,
      suggested_fix: "Complete contacts before running RFx invitations or Gmail/WhatsApp outreach."
    } : null,
    lowEvidence ? {
      title: "CRM-only carrier recommendations",
      impact: `${lowEvidence} recommended carrier(s) have no linked quote evidence in the selected slice.`,
      suggested_fix: "Treat these as sourcing candidates, not proven Rateware carriers, until they quote lanes."
    } : null
  ].filter(Boolean) as Array<Record<string, string>>;

  if (!gaps.length) {
    gaps.push({
      title: "No critical gaps in selected slice",
      impact: "The selected data has enough vendor and rate evidence for directional analysis.",
      suggested_fix: "Use pivot drilldown to review lane-level evidence before acting."
    });
  }
  return gaps.slice(0, 6);
}

function buildRfxShortlist(recommendations: Record<string, unknown>[]) {
  return recommendations.slice(0, 12).map((row, index) => {
    const gaps = Array.isArray(row.gaps) ? row.gaps : [];
    const metrics = typeof row.metrics === "object" && row.metrics ? row.metrics as Record<string, unknown> : {};
    const linkedRates = Number(metrics.linked_rates || 0);
    const role = index < 5 ? "Core invite" : linkedRates > 0 ? "Lane proof invite" : "Sourcing challenger";
    return {
      vendor_id: cleanText(row.vendor_id),
      vendor_name: cleanText(row.vendor_name) || "Unnamed carrier",
      reason: cleanText(row.why) || (Array.isArray(row.evidence) ? row.evidence.slice(0, 2).join("; ") : "Ranked by Rateware fit"),
      suggested_role: role,
      risk: gaps.length ? gaps.slice(0, 2).join("; ") : "No major visible gap"
    };
  });
}

function buildProposedActions(intent: ReturnType<typeof carrierIntelligenceIntent>, recommendations: Record<string, unknown>[], gaps: Record<string, string>[]) {
  const topCount = Math.min(10, recommendations.length);
  const actions = [
    {
      priority: "High",
      action: topCount ? `Review the top ${topCount} carrier(s) and confirm which ones should enter an RFx shortlist.` : "Import or match more vendors before building a shortlist.",
      rationale: topCount ? "The shortlist is ranked, but final invitation should stay under human control." : "The analyst layer needs vendor evidence before it can recommend with confidence.",
      requires_confirmation: true
    },
    {
      priority: intent.pareto ? "High" : "Medium",
      action: intent.pareto ? "Validate Pareto concentration with the suggested pivot before excluding long-tail carriers." : "Load the suggested pivot and inspect carrier/lane evidence.",
      rationale: intent.pareto ? "Pareto is a concentration view, not a quality-only score." : "Pivot drilldown protects against acting on aggregated results without lane evidence.",
      requires_confirmation: true
    },
    {
      priority: gaps.length > 1 ? "High" : "Medium",
      action: "Fix the highest-impact data gaps before sending outreach at scale.",
      rationale: gaps[0]?.impact || "Cleaner vendor and rate data improves recommendation quality.",
      requires_confirmation: true
    },
    {
      priority: "Medium",
      action: "Prepare RFx or outreach from the selected carriers only after analyst approval.",
      rationale: "The AI Analyst can propose the action plan, but should not send invitations or promote vendors automatically.",
      requires_confirmation: true
    }
  ];
  return actions;
}

function buildAnalystLayer(
  prompt: string,
  recommendations: Record<string, unknown>[],
  rates: Record<string, unknown>[],
  vendors: Record<string, unknown>[],
  intent: ReturnType<typeof carrierIntelligenceIntent>,
  filters: Record<string, unknown>,
  dataScope: string
) {
  const confidence = analystConfidenceLabel(recommendations, rates, vendors);
  const approvedRates = rates.filter((row) => cleanText(row.status) === "approved").length;
  const crossborderRates = rates.filter(isCrossBorderRate).length;
  const d2dRates = rates.filter(isD2dImportExportRate).length;
  const dataGaps = buildDataGaps(rates, vendors, recommendations);
  return {
    analyst_summary: {
      headline: recommendations.length
        ? `${recommendations.length} carrier(s) surfaced for this request.`
        : "No carrier shortlist is strong enough yet for this request.",
      confidence_label: confidence,
      data_scope: dataScope,
      reasoning: [
        `${vendors.length} vendor record(s), ${rates.length} staging/Rateware row(s), ${approvedRates} approved row(s).`,
        `${crossborderRates} crossborder row(s) and ${d2dRates} D2D Import/Export row(s) available for this analysis.`,
        intent.pareto ? "Pareto ordering uses transaction concentration, not generic carrier quality." : "Ranking balances vendor readiness, contact availability, and linked quote evidence."
      ]
    },
    suggested_pivots: buildSuggestedPivots(prompt, intent, filters),
    data_gaps: dataGaps,
    rfx_shortlist: buildRfxShortlist(recommendations),
    proposed_actions: buildProposedActions(intent, recommendations, dataGaps)
  };
}

function summaryCount(summary: Record<string, unknown>, keyName: string) {
  const value = Number(summary?.[keyName] || 0);
  return Number.isFinite(value) ? value : 0;
}

function analystConfidenceLabelFromSummary(recommendations: Record<string, unknown>[], summary: Record<string, unknown>, vendors: Record<string, unknown>[]) {
  const linkedSignals = summaryCount(summary, "transactions");
  const approvedSignals = summaryCount(summary, "approved_rates");
  if (recommendations.length >= 10 && linkedSignals >= 40 && approvedSignals >= 10) return "High";
  if (recommendations.length >= 5 && linkedSignals >= 10) return "Medium";
  if (vendors.length > 0 || linkedSignals > 0) return "Directional";
  return "Low";
}

function buildDataGapsFromSummary(summary: Record<string, unknown>, vendors: Record<string, unknown>[], recommendations: Record<string, unknown>[]) {
  const missingVendor = summaryCount(summary, "missing_vendor");
  const missingRate = summaryCount(summary, "missing_rate");
  const missingMiles = summaryCount(summary, "missing_miles");
  const missingOrigin = summaryCount(summary, "missing_origin");
  const missingDestination = summaryCount(summary, "missing_destination");
  const missingContact = vendors.filter((vendor) => !vendor.primary_email && !vendor.whatsapp_phone).length;
  const lowEvidence = recommendations.filter((row) => Number((row.metrics as Record<string, unknown> | undefined)?.linked_rates || 0) === 0).length;
  const gaps = [
    missingVendor ? {
      title: "Unmatched carrier quotes",
      impact: `${missingVendor} rate row(s) have vendor evidence but are not linked to a vendor record.`,
      suggested_fix: "Run Match Vendors or improve domain/email data before using these rows for shortlist decisions."
    } : null,
    missingRate ? {
      title: "Missing all-in rates",
      impact: `${missingRate} row(s) cannot support cost comparison because all-in is missing.`,
      suggested_fix: "Correct all-in, linehaul, FSC, or border fee in Staging Review before ranking by price."
    } : null,
    missingMiles ? {
      title: "Missing mileage or kilometers",
      impact: `${missingMiles} priced row(s) cannot calculate cost per mile/km.`,
      suggested_fix: "Normalize locations and mileage before trusting cost per mile or cost per kilometer."
    } : null,
    missingOrigin || missingDestination ? {
      title: "Location normalization gaps",
      impact: `${missingOrigin + missingDestination} origin/destination side(s) are missing market, state, or country.`,
      suggested_fix: "Resolve US/CA zip prefixes and MX metro/state/region matches in staging."
    } : null,
    missingContact ? {
      title: "Vendor contact gaps",
      impact: `${missingContact} vendor(s) are missing email and WhatsApp contact data.`,
      suggested_fix: "Complete contacts before running RFx invitations or Gmail/WhatsApp outreach."
    } : null,
    lowEvidence ? {
      title: "CRM-only carrier recommendations",
      impact: `${lowEvidence} recommended carrier(s) have no linked quote evidence in the selected slice.`,
      suggested_fix: "Treat these as sourcing candidates, not proven Rateware carriers, until they quote lanes."
    } : null
  ].filter(Boolean) as Array<Record<string, string>>;

  if (!gaps.length) {
    gaps.push({
      title: "No critical gaps in selected slice",
      impact: "The selected data has enough vendor and rate evidence for directional analysis.",
      suggested_fix: "Use pivot drilldown to review lane-level evidence before acting."
    });
  }
  return gaps.slice(0, 6);
}

function buildAnalystLayerFromSummary(
  prompt: string,
  recommendations: Record<string, unknown>[],
  summary: Record<string, unknown>,
  vendors: Record<string, unknown>[],
  intent: ReturnType<typeof carrierIntelligenceIntent>,
  filters: Record<string, unknown>,
  dataScope: string
) {
  const dataGaps = buildDataGapsFromSummary(summary, vendors, recommendations);
  return {
    analyst_summary: {
      headline: recommendations.length
        ? `${recommendations.length} carrier(s) surfaced for this request.`
        : "No carrier shortlist is strong enough yet for this request.",
      confidence_label: analystConfidenceLabelFromSummary(recommendations, summary, vendors),
      data_scope: dataScope,
      reasoning: [
        `${vendors.length} vendor record(s), ${summaryCount(summary, "transactions")} staging/Rateware row(s), ${summaryCount(summary, "approved_rates")} approved row(s).`,
        `${summaryCount(summary, "crossborder_rates")} crossborder row(s) and ${summaryCount(summary, "d2d_import_export_rates")} D2D Import/Export row(s) available for this analysis.`,
        intent.pareto ? "Pareto ordering uses transaction concentration, not generic carrier quality." : "Ranking balances vendor readiness, contact availability, and linked quote evidence."
      ]
    },
    suggested_pivots: buildSuggestedPivots(prompt, intent, filters),
    data_gaps: dataGaps,
    rfx_shortlist: buildRfxShortlist(recommendations),
    proposed_actions: buildProposedActions(intent, recommendations, dataGaps)
  };
}

function deterministicCarrierRecommendations(
  prompt: string,
  vendors: Record<string, unknown>[],
  metricsOrRates: Map<string, Record<string, unknown>> | Record<string, unknown>[],
  summary: Record<string, unknown> = {}
) {
  const intent = carrierIntelligenceIntent(prompt);
  const limit = intent.pareto ? 100 : extractRecommendationLimit(prompt);
  const metricsByVendor = metricsOrRates instanceof Map ? metricsOrRates : null;
  const rates = Array.isArray(metricsOrRates) ? metricsOrRates : [];
  const scoredRecommendations = vendors
    .map((vendor) => {
      const vendorId = cleanText(vendor.id);
      const metrics = metricsByVendor ? normalizeVendorMetricRow(metricsByVendor.get(vendorId || "")) : createVendorMetrics(vendor, rates);
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
  const analystLayer = metricsByVendor
    ? buildAnalystLayerFromSummary(prompt, recommendations, summary, vendors, intent, {}, dataScope)
    : buildAnalystLayer(prompt, recommendations, rates, vendors, intent, {}, dataScope);

  return {
    answer: recommendations.length
      ? answerPrefix
      : "I could not find matching carriers in your vendor base yet.",
    filters: {
      limit,
      focus: intent.focus,
      data_scope: dataScope
    },
    ...analystLayer,
    recommendations,
    next_actions: [
      intent.pareto ? "Use this as a transaction concentration view, not a generic carrier quality list." : "Validate missing contacts before sending RFx invitations.",
      intent.pareto ? "Review carriers outside the Pareto cut for niche lane coverage before excluding them." : "Promote high-fit sourcing carriers to Procurement Base.",
      "Keep uploading carrier quotes so Rateware can learn lane-level coverage from actual submissions."
    ],
    model_status: "deterministic",
    candidate_count: vendors.length,
    rate_signal_count: metricsByVendor ? summaryCount(summary, "transactions") : rates.length
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
              "Return an analyst layer with a concise executive summary, suggested pivots, data gaps, RFx shortlist, and proposed actions.",
              "Proposed actions are advisory only. Do not claim that vendors were promoted, RFx events were created, or outreach was sent.",
              "Suggested pivots must use the available Rateware BI field names from the deterministic result.",
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
                analyst_summary: fallback.analyst_summary,
                suggested_pivots: fallback.suggested_pivots,
                data_gaps: fallback.data_gaps,
                rfx_shortlist: fallback.rfx_shortlist,
                proposed_actions: fallback.proposed_actions,
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
  const fallbackByVendor = new Map((Array.isArray(fallback.recommendations) ? fallback.recommendations : [])
    .map((row: Record<string, unknown>) => [row.vendor_id, row]));
  const mergedRecommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((row: Record<string, unknown>) => ({
      ...(fallbackByVendor.get(row.vendor_id) || {}),
      ...row
    }))
    : fallback.recommendations;

  return {
    ...parsed,
    recommendations: mergedRecommendations,
    model_status: "ai",
    candidate_count: fallback.candidate_count,
    rate_signal_count: fallback.rate_signal_count
  };
}

async function buildCarrierIntelligence(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, prompt: string) {
  const instruction = cleanText(prompt) || "Recommend the best carriers to add to Procurement Base.";
  const [vendorsResult, metricsByVendor, summary] = await Promise.all([
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails,whatsapp_phone,status,base_stage,tags,coverage_notes,notes,preferred_channel,created_at")
      .eq("owner_email", user.owner_email)
      .limit(1000),
    fetchBiVendorMetrics(supabase, user, {}),
    fetchBiSummary(supabase, user, {})
  ]);

  if (vendorsResult.error) throw vendorsResult.error;

  const fallback = deterministicCarrierRecommendations(instruction, vendorsResult.data || [], metricsByVendor, summary);
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
  const [vendorsResult, metricsByVendor, summary] = await Promise.all([
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails,whatsapp_phone,status,base_stage,tags,coverage_notes,notes,preferred_channel,created_at")
      .eq("owner_email", user.owner_email)
      .limit(1000),
    fetchBiVendorMetrics(supabase, user, filters),
    fetchBiSummary(supabase, user, filters)
  ]);
  if (vendorsResult.error) throw vendorsResult.error;

  const vendorTerm = cleanText(filters.vendor);
  const candidates = (vendorsResult.data || [])
    .filter((vendor) => !vendorTerm || catalogKey(vendorSearchText(vendor)).includes(catalogKey(vendorTerm)))
    .map((vendor) => {
      const vendorId = cleanText(vendor.id);
      const metrics = normalizeVendorMetricRow(metricsByVendor.get(vendorId || ""));
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
  const dataScope = "Structured recommendation engine over user vendors and filtered staging/Rateware transactions.";
  const analystLayer = buildAnalystLayerFromSummary(
    `Structured ${rankingMode} recommendation`,
    recommendations,
    summary,
    vendorsResult.data || [],
    intent as ReturnType<typeof carrierIntelligenceIntent>,
    filters,
    dataScope
  );

  return {
    answer: `${recommendations.length} carrier recommendation(s) ranked by ${rankingMode}.`,
    filters: {
      limit,
      focus: intent.focus,
      ranking_mode: rankingMode,
      min_transactions: minTransactions,
      data_scope: dataScope
    },
    ...analystLayer,
    recommendations,
    next_actions: [
      "Review score breakdown before promoting a carrier.",
      "Use min transactions to avoid over-ranking carriers with one-off quotes.",
      "Use the pivot drilldown to validate the underlying lanes before RFx outreach."
    ],
    candidate_count: vendorsResult.data?.length || 0,
    rate_signal_count: summaryCount(summary, "transactions"),
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
  { key: "origin_region", label: "Origin region" },
  { key: "destination_region", label: "Destination region" },
  { key: "origin_state", label: "Origin state" },
  { key: "destination_state", label: "Destination state" },
  { key: "origin_zip", label: "Origin ZIP/ST" },
  { key: "destination_zip", label: "Destination ZIP/ST" },
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

const BI_AGGREGATIONS = ["count", "distinct", "avg", "sum", "min", "max"];

function sanitizeBiDimensions(value: unknown, fallback: string[], max = 3) {
  const allowed = new Set(BI_DIMENSIONS.map((item) => item.key));
  const source = Array.isArray(value) ? value : fallback;
  const dimensions = source
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item && allowed.has(item)))
    .slice(0, max);
  return dimensions.length ? dimensions : fallback.slice(0, max);
}

function sanitizeBiMetric(value: unknown) {
  const metric = cleanText(value);
  return metric && BI_METRICS.some((item) => item.key === metric) ? metric : "transaction_count";
}

function sanitizeBiAggregation(value: unknown, metric: string) {
  const aggregation = cleanText(value);
  if (aggregation && BI_AGGREGATIONS.includes(aggregation)) return aggregation;
  return BI_METRICS.find((item) => item.key === metric)?.default_aggregation || "avg";
}

function biFieldCatalog() {
  return {
    dimensions: BI_DIMENSIONS,
    metrics: BI_METRICS,
    aggregations: BI_AGGREGATIONS
  };
}

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
    origin_region: row.origin_region || "-",
    destination_region: row.destination_region || "-",
    origin_state: row.origin_state || "-",
    destination_state: row.destination_state || "-",
    origin_zip: row.origin_zip_prefix || row.origin_state || "-",
    destination_zip: row.destination_zip_prefix || row.destination_state || "-",
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
    .select(RATE_SIGNAL_SELECT)
    .in("status", ["pending_review", "approved"])
    .order("quote_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(12000);
  if (result.error) throw result.error;
  return (result.data || []).filter((row) => {
    const vendor = typeof row.vendors === "object" && row.vendors ? row.vendors as Record<string, unknown> : null;
    return !row.vendor_id || !vendor?.owner_email || vendor.owner_email === user.owner_email;
  });
}

async function buildBusinessIntelligencePivotFromDb(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, config: Record<string, unknown>) {
  const rowDimensions = sanitizeBiDimensions(config.rows, ["vendor"], 3);
  const columnDimensions = sanitizeBiDimensions(config.columns, ["operation"], 2);
  const metric = sanitizeBiMetric(config.metric);
  const aggregation = sanitizeBiAggregation(config.aggregation, metric);
  const filters = objectRecord(config.filters);
  const result = await supabase.rpc("rateware_bi_pivot_for_owner", {
    p_owner_email: user.owner_email,
    p_row_dimensions: rowDimensions,
    p_column_dimensions: columnDimensions,
    p_metric: metric,
    p_aggregation: aggregation,
    p_filters: filters,
    p_row_limit: 300,
    p_column_limit: 80
  });
  if (result.error) throw result.error;
  return {
    ...objectRecord(result.data),
    fields: biFieldCatalog()
  };
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
  const rowDimensions = sanitizeBiDimensions(config.rows, ["vendor"], 3);
  const columnDimensions = sanitizeBiDimensions(config.columns, [], 2);
  const filters = objectRecord(config.filters);
  const rowValues = Array.isArray(cell.row_values) ? cell.row_values.map(String) : [];
  const columnValue = cleanText(cell.column_value);
  const result = await supabase.rpc("rateware_bi_drilldown_for_owner", {
    p_owner_email: user.owner_email,
    p_row_dimensions: rowDimensions,
    p_column_dimensions: columnDimensions,
    p_row_values: rowValues,
    p_column_value: columnValue || "Total",
    p_filters: filters,
    p_limit: 250
  });
  if (result.error) throw result.error;
  return objectRecord(result.data);
}

const GEO_CITY_COORDINATES: Record<string, [number, number]> = {
  "laredo|tx": [27.5064, -99.5075],
  "dallas|tx": [32.7767, -96.7970],
  "fort worth|tx": [32.7555, -97.3308],
  "houston|tx": [29.7604, -95.3698],
  "san antonio|tx": [29.4241, -98.4936],
  "mcallen|tx": [26.2034, -98.2300],
  "el paso|tx": [31.7619, -106.4850],
  "bowling green|ky": [36.9685, -86.4808],
  "louisville|ky": [38.2527, -85.7585],
  "canton|ms": [32.6126, -90.0368],
  "jackson|ms": [32.2988, -90.1848],
  "smyrna|tn": [35.9828, -86.5186],
  "nashville|tn": [36.1627, -86.7816],
  "memphis|tn": [35.1495, -90.0490],
  "chicago|il": [41.8781, -87.6298],
  "detroit|mi": [42.3314, -83.0458],
  "atlanta|ga": [33.7490, -84.3880],
  "charlotte|nc": [35.2271, -80.8431],
  "los angeles|ca": [34.0522, -118.2437],
  "ontario|ca": [34.0633, -117.6509],
  "phoenix|az": [33.4484, -112.0740],
  "denver|co": [39.7392, -104.9903],
  "kansas city|mo": [39.0997, -94.5786],
  "st louis|mo": [38.6270, -90.1994],
  "toronto|on": [43.6532, -79.3832],
  "montreal|qc": [45.5017, -73.5673],
  "vancouver|bc": [49.2827, -123.1207],
  "monterrey|nl": [25.6866, -100.3161],
  "apodaca|nl": [25.7816, -100.1881],
  "nuevo laredo|tm": [27.4864, -99.5054],
  "reynosa|tm": [26.0922, -98.2777],
  "matamoros|tm": [25.8690, -97.5027],
  "saltillo|cu": [25.4382, -100.9737],
  "ramos arizpe|cu": [25.5393, -100.9474],
  "torreon|cu": [25.5428, -103.4068],
  "toluca|mx": [19.2826, -99.6557],
  "lerma|mx": [19.2858, -99.5114],
  "mexico city|df": [19.4326, -99.1332],
  "mexico|df": [19.4326, -99.1332],
  "queretaro|qe": [20.5888, -100.3899],
  "san luis potosi|sl": [22.1565, -100.9855],
  "aguascalientes|ag": [21.8853, -102.2916],
  "guadalajara|ja": [20.6597, -103.3496],
  "puebla|pb": [19.0414, -98.2063],
  "leon|gj": [21.1250, -101.6860],
  "hermosillo|so": [29.0729, -110.9559],
  "nogales|so": [31.3012, -110.9381],
  "tijuana|bn": [32.5149, -117.0382],
  "mexicali|bn": [32.6245, -115.4523],
  "chihuahua|ch": [28.6320, -106.0691],
  "cd juarez|ch": [31.6904, -106.4245],
  "ciudad juarez|ch": [31.6904, -106.4245],
  "veracruz|ve": [19.1738, -96.1342],
  "merida|yu": [20.9674, -89.5926],
  "cancun|qr": [21.1619, -86.8515],
  "culiacan|si": [24.8091, -107.3940]
};

const GEO_STATE_COORDINATES: Record<string, [number, number]> = {
  "us|al": [32.8067, -86.7911],
  "us|az": [34.0489, -111.0937],
  "us|ar": [34.9697, -92.3731],
  "us|ca": [36.7783, -119.4179],
  "us|co": [39.5501, -105.7821],
  "us|ct": [41.6032, -73.0877],
  "us|fl": [27.6648, -81.5158],
  "us|ga": [32.1656, -82.9001],
  "us|ia": [41.8780, -93.0977],
  "us|il": [40.6331, -89.3985],
  "us|in": [40.2672, -86.1349],
  "us|ks": [39.0119, -98.4842],
  "us|ky": [37.8393, -84.2700],
  "us|la": [31.2448, -92.1450],
  "us|ma": [42.4072, -71.3824],
  "us|md": [39.0458, -76.6413],
  "us|mi": [44.3148, -85.6024],
  "us|mn": [46.7296, -94.6859],
  "us|mo": [37.9643, -91.8318],
  "us|ms": [32.3547, -89.3985],
  "us|nc": [35.7596, -79.0193],
  "us|ne": [41.4925, -99.9018],
  "us|nj": [40.0583, -74.4057],
  "us|nm": [34.5199, -105.8701],
  "us|nv": [38.8026, -116.4194],
  "us|ny": [43.2994, -74.2179],
  "us|oh": [40.4173, -82.9071],
  "us|ok": [35.0078, -97.0929],
  "us|or": [43.8041, -120.5542],
  "us|pa": [41.2033, -77.1945],
  "us|sc": [33.8361, -81.1637],
  "us|tn": [35.5175, -86.5804],
  "us|tx": [31.9686, -99.9018],
  "us|ut": [39.3210, -111.0937],
  "us|va": [37.4316, -78.6569],
  "us|wa": [47.7511, -120.7401],
  "us|wi": [43.7844, -88.7879],
  "ca|ab": [53.9333, -116.5765],
  "ca|bc": [53.7267, -127.6476],
  "ca|mb": [53.7609, -98.8139],
  "ca|nb": [46.5653, -66.4619],
  "ca|nl": [53.1355, -57.6604],
  "ca|ns": [44.6820, -63.7443],
  "ca|on": [51.2538, -85.3232],
  "ca|qc": [52.9399, -73.5491],
  "ca|sk": [52.9399, -106.4509],
  "mx|ag": [21.8853, -102.2916],
  "mx|bn": [30.8406, -115.2838],
  "mx|bs": [26.0444, -111.6661],
  "mx|ch": [28.6330, -106.0691],
  "mx|cu": [27.0587, -101.7068],
  "mx|df": [19.4326, -99.1332],
  "mx|gj": [21.0190, -101.2574],
  "mx|ja": [20.6597, -103.3496],
  "mx|mc": [19.5665, -101.7068],
  "mx|mx": [19.2826, -99.6557],
  "mx|nl": [25.5922, -99.9962],
  "mx|pb": [19.0414, -98.2063],
  "mx|qe": [20.5888, -100.3899],
  "mx|qr": [19.1817, -88.4791],
  "mx|si": [24.8091, -107.3940],
  "mx|sl": [22.1565, -100.9855],
  "mx|so": [29.2972, -110.3309],
  "mx|tm": [24.2669, -98.8363],
  "mx|ve": [19.1738, -96.1342],
  "mx|yu": [20.7099, -89.0943]
};

const GEO_REGION_COORDINATES: Record<string, [number, number]> = {
  "central mexico": [20.0, -99.4],
  "northeast mexico": [25.7, -100.3],
  "northwest mexico": [29.1, -110.9],
  "bajio": [20.8, -101.2],
  "southeast mexico": [19.0, -90.4],
  "z0 new england": [42.1, -71.7],
  "z1 mid atlantic": [40.2, -75.2],
  "z2 southeast": [33.2, -84.3],
  "z3 midwest": [41.8, -93.5],
  "z4 south central": [32.8, -96.8],
  "z5 southwest": [33.4, -112.1],
  "z6 mid central west": [39.0, -104.5],
  "z7 west": [37.8, -122.0],
  "z8 pacific northwest": [47.6, -122.3]
};

function geoStateCode(value: unknown) {
  const text = cleanText(value)?.toUpperCase() || "";
  const aliases: Record<string, string> = {
    COAHUILA: "CU",
    NUEVO_LEON: "NL",
    "NUEVO LEON": "NL",
    TAMAULIPAS: "TM",
    MEXICO: "MX",
    "ESTADO DE MEXICO": "MX",
    QUERETARO: "QE",
    JALISCO: "JA",
    SONORA: "SO",
    CHIHUAHUA: "CH",
    SINALOA: "SI",
    GUANAJUATO: "GJ",
    "SAN LUIS POTOSI": "SL",
    AGUASCALIENTES: "AG",
    PUEBLA: "PB"
  };
  return aliases[text] || text.slice(0, 2);
}

function geoCountryCode(row: Record<string, unknown>, side: "origin" | "destination", stateCode: string) {
  const raw = cleanText(row[`${side}_country`])?.toUpperCase() || "";
  if (["MX", "MEX", "MEXICO", "MÉXICO"].includes(raw)) return "MX";
  if (["US", "USA", "UNITED STATES"].includes(raw)) return "US";
  if (["CA", "CAN", "CANADA"].includes(raw)) return "CA";
  if (GEO_STATE_COORDINATES[`mx|${stateCode.toLowerCase()}`]) return "MX";
  if (GEO_STATE_COORDINATES[`ca|${stateCode.toLowerCase()}`]) return "CA";
  if (GEO_STATE_COORDINATES[`us|${stateCode.toLowerCase()}`]) return "US";
  return raw || "";
}

function geoCleanCity(value: unknown) {
  return cleanText(value)
    ?.replace(/\b\d{3,6}\b/g, "")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim() || "";
}

function geoLookupKey(value: unknown) {
  return catalogKey(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\bmkt\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function geoCoordinateFor(parts: { label: string; level: string; city: string; market: string; state: string; country: string; region: string }) {
  const state = geoStateCode(parts.state).toLowerCase();
  const country = parts.country.toLowerCase();
  const city = geoLookupKey(parts.city || parts.label || parts.market);
  const market = geoLookupKey(parts.market || parts.label);
  const region = geoLookupKey(parts.region);
  const cityKey = city && state ? `${city}|${state}` : "";
  const marketKey = market && state ? `${market}|${state}` : "";
  const stateKey = country && state ? `${country}|${state}` : "";
  const regionMatch = region ? Object.entries(GEO_REGION_COORDINATES).find(([keyName]) => region.includes(keyName) || keyName.includes(region)) : null;
  if (parts.level === "region" && regionMatch) return { coords: regionMatch[1], source: "region" };
  if (parts.level === "state" && stateKey && GEO_STATE_COORDINATES[stateKey]) return { coords: GEO_STATE_COORDINATES[stateKey], source: "state" };
  if (cityKey && GEO_CITY_COORDINATES[cityKey]) return { coords: GEO_CITY_COORDINATES[cityKey], source: "city" };
  if (marketKey && GEO_CITY_COORDINATES[marketKey]) return { coords: GEO_CITY_COORDINATES[marketKey], source: "market" };
  if (regionMatch) return { coords: regionMatch[1], source: "region" };
  if (stateKey && GEO_STATE_COORDINATES[stateKey]) return { coords: GEO_STATE_COORDINATES[stateKey], source: "state" };
  return { coords: null, source: "missing" };
}

function geoSidePoint(row: Record<string, unknown>, side: "origin" | "destination", level: string, flow: string) {
  const rawLocation = cleanText(row[`normalized_${side}`] || row[side]) || "";
  const state = geoStateCode(row[`${side}_state`]);
  const country = geoCountryCode(row, side, state);
  const market = cleanText(row[`${side}_market`]) || "";
  const region = cleanText(row[`${side}_region`]) || "";
  const zip = cleanText(row[`${side}_zip_prefix`]) || "";
  const city = geoCleanCity(rawLocation || market);
  const labels: Record<string, string> = {
    region: region || [country, state].filter(Boolean).join(" / ") || rawLocation || "-",
    state: [state, country].filter(Boolean).join(" / ") || rawLocation || "-",
    market: market || rawLocation || [state, country].filter(Boolean).join(" / ") || "-",
    location: rawLocation || market || [state, country].filter(Boolean).join(" / ") || "-"
  };
  const label = labels[level] || labels.market;
  const coordinate = geoCoordinateFor({ label, level, city, market, state, country, region });
  if (!coordinate.coords) return null;
  return {
    key: [flow, level, label, state, country].join("|"),
    label,
    flow,
    level,
    side,
    city,
    state,
    country,
    market,
    region,
    zip,
    lat: coordinate.coords[0],
    lng: coordinate.coords[1],
    geo_source: coordinate.source
  };
}

function geoMetricSortValue(point: Record<string, unknown>, metric: string) {
  if (metric === "carriers") return Number(point.carriers || 0);
  if (metric === "avg_all_in") return Number(point.avg_all_in || 0);
  if (metric === "avg_cost_per_mile") return Number(point.avg_cost_per_mile || 0);
  if (metric === "avg_cost_per_km") return Number(point.avg_cost_per_km || 0);
  return Number(point.transactions || 0);
}

function buildBusinessIntelligenceGeoDensity(rows: Record<string, unknown>[], config: Record<string, unknown>) {
  const filters = objectRecord(config.filters);
  const filteredRows = filterBiRows(rows, filters);
  const scope = ["origin", "destination", "both"].includes(cleanText(config.scope) || "") ? cleanText(config.scope)! : "both";
  const level = ["region", "state", "market", "location"].includes(cleanText(config.level) || "") ? cleanText(config.level)! : "market";
  const metric = cleanText(config.metric) || "transactions";
  const limit = Math.min(Math.max(Number(config.limit) || 80, 10), 250);
  const sides: Array<"origin" | "destination"> = scope === "origin" ? ["origin"] : scope === "destination" ? ["destination"] : ["origin", "destination"];
  const groups = new Map<string, { point: Record<string, unknown>; rows: Record<string, unknown>[]; carriers: Set<string>; rates: number[]; cpm: number[]; cpk: number[] }>();
  let missingGeo = 0;

  for (const row of filteredRows) {
    for (const side of sides) {
      const flow = side;
      const point = geoSidePoint(row, side, level, flow);
      if (!point) {
        missingGeo += 1;
        continue;
      }
      const group = groups.get(point.key) || { point, rows: [], carriers: new Set<string>(), rates: [], cpm: [], cpk: [] };
      group.rows.push(row);
      group.carriers.add(biDimensionValue(row, "vendor"));
      const allIn = numericAmount(row.all_in_rate);
      const costPerMile = biNumber(row, "cost_per_mile");
      const costPerKm = biNumber(row, "cost_per_km");
      if (allIn !== null) group.rates.push(allIn);
      if (costPerMile !== null) group.cpm.push(costPerMile);
      if (costPerKm !== null) group.cpk.push(costPerKm);
      groups.set(point.key, group);
    }
  }

  const avg = (values: number[]) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
  const points = [...groups.values()]
    .map((group) => ({
      ...group.point,
      transactions: group.rows.length,
      carriers: group.carriers.size,
      avg_all_in: avg(group.rates),
      avg_cost_per_mile: avg(group.cpm),
      avg_cost_per_km: avg(group.cpk),
      currency: cleanText(group.rows[0]?.currency) || "USD",
      metric_value: geoMetricSortValue({
        transactions: group.rows.length,
        carriers: group.carriers.size,
        avg_all_in: avg(group.rates),
        avg_cost_per_mile: avg(group.cpm),
        avg_cost_per_km: avg(group.cpk)
      }, metric)
    }))
    .sort((a, b) => geoMetricSortValue(b, metric) - geoMetricSortValue(a, metric) || Number(b.transactions || 0) - Number(a.transactions || 0))
    .slice(0, limit);

  const carrierSet = new Set(filteredRows.map((row) => biDimensionValue(row, "vendor")).filter(Boolean));
  return {
    points,
    level,
    scope,
    metric,
    filters,
    summary: {
      transactions: filteredRows.length,
      carriers: carrierSet.size,
      zones: groups.size,
      missing_geo: missingGeo,
      plotted: points.length
    },
    notes: [
      "Coordinates are resolved from known city/market centroids first, then state/province fallback.",
      "Use Admin > Catalogs to harden location data before relying on specific-location heatmaps."
    ]
  };
}

async function buildBusinessIntelligenceGeoDensityFromDb(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, config: Record<string, unknown>) {
  const filters = objectRecord(config.filters);
  const scope = ["origin", "destination", "both"].includes(cleanText(config.scope) || "") ? cleanText(config.scope)! : "both";
  const level = ["region", "state", "market", "location"].includes(cleanText(config.level) || "") ? cleanText(config.level)! : "market";
  const metric = cleanText(config.metric) || "transactions";
  const limit = Math.min(Math.max(Number(config.limit) || 80, 10), 250);
  const result = await supabase.rpc("rateware_bi_geo_density_for_owner", {
    p_owner_email: user.owner_email,
    p_scope: scope,
    p_level: level,
    p_metric: metric,
    p_filters: filters,
    p_limit: Math.min(limit * 2, 500)
  });
  if (result.error) throw result.error;

  const payload = objectRecord(result.data);
  const rawPoints = Array.isArray(payload.points) ? payload.points as Record<string, unknown>[] : [];
  let missingGeo = 0;
  const points = rawPoints
    .map((point) => {
      const state = geoStateCode(point.state);
      const rawCountry = cleanText(point.country)?.toUpperCase() || "";
      const country = rawCountry
        || (GEO_STATE_COORDINATES[`mx|${state.toLowerCase()}`] ? "MX"
          : GEO_STATE_COORDINATES[`ca|${state.toLowerCase()}`] ? "CA"
            : GEO_STATE_COORDINATES[`us|${state.toLowerCase()}`] ? "US" : "");
      const label = cleanText(point.label) || cleanText(point.market) || cleanText(point.city) || "-";
      const coordinate = geoCoordinateFor({
        label,
        level,
        city: cleanText(point.city) || label,
        market: cleanText(point.market) || label,
        state,
        country,
        region: cleanText(point.region) || ""
      });
      if (!coordinate.coords) {
        missingGeo += Number(point.transactions || 1);
        return null;
      }
      const enriched = {
        ...point,
        key: [point.flow, level, label, state, country].join("|"),
        label,
        state,
        country,
        lat: coordinate.coords[0],
        lng: coordinate.coords[1],
        geo_source: coordinate.source
      };
      return {
        ...enriched,
        metric_value: geoMetricSortValue(enriched, metric)
      };
    })
    .filter((point): point is Record<string, unknown> => Boolean(point))
    .sort((a, b) => geoMetricSortValue(b, metric) - geoMetricSortValue(a, metric) || Number(b.transactions || 0) - Number(a.transactions || 0))
    .slice(0, limit);

  const summary = objectRecord(payload.summary);
  return {
    ...payload,
    points,
    level,
    scope,
    metric,
    filters,
    summary: {
      ...summary,
      missing_geo: Number(summary.missing_geo || 0) + missingGeo,
      plotted: points.length
    },
    notes: [
      "Rateware groups the full database in SQL first, then plots known city/market/state centroids.",
      "Use Admin > Catalogs to harden location data before relying on specific-location heatmaps."
    ]
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

const VENDOR_FUNNEL_STAGES = ["targeted", "nested", "drafted", "invited", "onboarded", "trained", "activated", "completed"];
const VENDOR_FUNNEL_STAGE_LABELS: Record<string, string> = {
  targeted: "Targeted",
  nested: "Nested",
  drafted: "Drafted",
  invited: "Invited",
  onboarded: "Onboarded",
  trained: "Trained",
  activated: "Activated",
  completed: "Completed"
};
const VENDOR_FUNNEL_STAGE_DESCRIPTIONS: Record<string, string> = {
  targeted: "Moved from Sourcing Base into Procurement Base.",
  nested: "Has linked carrier quotes in staging or Rateware.",
  drafted: "Selected for onboarding preparation.",
  invited: "Onboarding invitation has been sent.",
  onboarded: "Supplier registration is complete.",
  trained: "TMS training or setup is complete.",
  activated: "Ready for immediate procurement use.",
  completed: "Legal document package is fully signed."
};
const VENDOR_FUNNEL_STAGE_TIMESTAMPS: Record<string, string> = {
  targeted: "targeted_at",
  nested: "nested_at",
  drafted: "drafted_at",
  invited: "invited_at",
  onboarded: "onboarded_at",
  trained: "trained_at",
  activated: "activated_at",
  completed: "completed_at"
};

function normalizeVendorFunnelStage(value: unknown) {
  const stage = cleanText(value)?.toLowerCase();
  return stage && VENDOR_FUNNEL_STAGES.includes(stage) ? stage : null;
}

function vendorFunnelPatch(stage: string | null, now = new Date().toISOString()) {
  if (!stage) return {};
  const timestampField = VENDOR_FUNNEL_STAGE_TIMESTAMPS[stage];
  return {
    funnel_stage: stage,
    funnel_stage_updated_at: now,
    ...(timestampField ? { [timestampField]: now } : {})
  };
}

function vendorFunnelUpdatePatch(stage: string | null, current: Record<string, unknown> = {}, now = new Date().toISOString()) {
  if (!stage) return {};
  const currentStage = normalizeVendorFunnelStage(current.funnel_stage);
  const timestampField = VENDOR_FUNNEL_STAGE_TIMESTAMPS[stage];
  const patch: Record<string, unknown> = { funnel_stage: stage };
  if (stage !== currentStage || !current.funnel_stage_updated_at) {
    patch.funnel_stage_updated_at = now;
  }
  if (timestampField && !current[timestampField]) {
    patch[timestampField] = now;
  }
  return patch;
}

function normalizeVendor(input: Record<string, unknown>, source = "manual") {
  const vendorName = cleanText(input.vendor_name || input.name || input.carrier || input.vendor);
  if (!vendorName) throw new Error("Vendor name is required.");

  const preferred = cleanText(input.preferred_channel)?.toLowerCase() || "email";
  const status = cleanText(input.status)?.toLowerCase() || "active";
  const baseStage = cleanText(input.base_stage)?.toLowerCase() || "sourcing";
  const now = new Date().toISOString();
  const funnelStage = normalizeVendorFunnelStage(input.funnel_stage) || (baseStage === "procurement" ? "targeted" : null);

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
    ...vendorFunnelPatch(funnelStage, now),
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

function normalizeVendorPatch(input: Record<string, unknown>, current: Record<string, unknown> = {}) {
  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
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
    if (baseStage === "procurement" && input.funnel_stage === undefined) {
      Object.assign(patch, vendorFunnelUpdatePatch(normalizeVendorFunnelStage(current.funnel_stage) || "targeted", current, now));
    }
    if ((baseStage === "sourcing" || baseStage === "archived") && input.funnel_stage === undefined) {
      patch.funnel_stage = null;
      patch.funnel_stage_updated_at = null;
    }
  }
  if (input.funnel_stage !== undefined) {
    Object.assign(patch, vendorFunnelUpdatePatch(normalizeVendorFunnelStage(input.funnel_stage), current, now));
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.preferred_channel !== undefined) {
    const preferred = cleanText(input.preferred_channel)?.toLowerCase();
    if (preferred && ["email", "whatsapp", "portal"].includes(preferred)) patch.preferred_channel = preferred;
  }
  patch.updated_at = now;
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
    "origin_match_source",
    "destination_market",
    "destination_country",
    "destination_zip_prefix",
    "destination_city",
    "destination_state",
    "destination_region",
    "destination_match_reason",
    "destination_match_source",
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
  if (input.origin_match_manual !== undefined) patch.origin_match_manual = cleanBoolean(input.origin_match_manual);
  if (input.destination_match_manual !== undefined) patch.destination_match_manual = cleanBoolean(input.destination_match_manual);

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
  if (input.origin_match_confidence !== undefined) patch.origin_match_confidence = Number(input.origin_match_confidence) || null;
  if (input.destination_match_confidence !== undefined) patch.destination_match_confidence = Number(input.destination_match_confidence) || null;
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

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const rateText = cleanRateText(value);
  if (rateText) return Number(rateText);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[#%()[\]{}:;.,/\\|_+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveVendorReferenceFromRows(vendors: Record<string, unknown>[], reference: unknown) {
  const ranked = vendors
    .map((vendor) => ({ vendor, ...scoreVendorReference(vendor, reference) }))
    .filter((match) => match.score >= 75)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

function vendorById(vendors: Record<string, unknown>[]) {
  return new Map(vendors.map((vendor) => [cleanText(vendor.id), vendor]).filter(([id]) => Boolean(id)) as [string, Record<string, unknown>][]);
}

function vendorLinkPatchFromRows(vendors: Record<string, unknown>[], reference: unknown) {
  if (!cleanText(reference)) return {};
  const match = resolveVendorReferenceFromRows(vendors, reference);
  const fallbackDomain = domainFromVendorReference(reference);
  if (!match) return { vendor_id: null, vendor_domain: fallbackDomain || cleanText(reference) };
  return {
    vendor_id: match.vendor.id,
    vendor_domain: normalizeDomain(match.vendor.domain) || match.domain || fallbackDomain || cleanText(reference)
  };
}

function uploadVendorRecord(upload: Record<string, unknown>) {
  return typeof upload.vendors === "object" && upload.vendors ? upload.vendors as Record<string, unknown> : {};
}

function uploadVendorDomain(upload: Record<string, unknown>) {
  const vendor = uploadVendorRecord(upload);
  return domainFromVendorReference(vendor.domain)
    || domainFromVendorReference(vendor.primary_email)
    || domainFromVendorReference(upload.vendor_hint);
}

function templateRowInput(mapped: Record<string, unknown>, upload: Record<string, unknown>) {
  const inheritedVendorDomain = uploadVendorDomain(upload);
  const hasOriginLocationMetadata = [
    mapped.origin_zip_prefix,
    mapped.origin_state,
    mapped.origin_country,
    mapped.origin_market,
    mapped.origin_region
  ].some(cleanText);
  const hasDestinationLocationMetadata = [
    mapped.destination_zip_prefix,
    mapped.destination_state,
    mapped.destination_country,
    mapped.destination_market,
    mapped.destination_region
  ].some(cleanText);
  const input: Record<string, unknown> = {
    vendor_domain: mapped.vendor_domain || inheritedVendorDomain,
    rfx_id: mapped.rfx_id || upload.rfx_hint,
    row_id: mapped.row_id,
    quote_date: mapped.quote_date,
    origin: mapped.origin,
    origin_zip_prefix: mapped.origin_zip_prefix,
    origin_state: mapped.origin_state,
    origin_country: mapped.origin_country,
    origin_market: mapped.origin_market,
    origin_region: mapped.origin_region,
    origin_match_manual: hasOriginLocationMetadata ? true : mapped.origin_match_manual,
    origin_match_source: hasOriginLocationMetadata ? "template" : mapped.origin_match_source,
    origin_match_reason: hasOriginLocationMetadata ? "template supplied location metadata" : mapped.origin_match_reason,
    destination: mapped.destination,
    destination_zip_prefix: mapped.destination_zip_prefix,
    destination_state: mapped.destination_state,
    destination_country: mapped.destination_country,
    destination_market: mapped.destination_market,
    destination_region: mapped.destination_region,
    destination_match_manual: hasDestinationLocationMetadata ? true : mapped.destination_match_manual,
    destination_match_source: hasDestinationLocationMetadata ? "template" : mapped.destination_match_source,
    destination_match_reason: hasDestinationLocationMetadata ? "template supplied location metadata" : mapped.destination_match_reason,
    equipment: mapped.equipment,
    trailer: mapped.trailer,
    config: mapped.config,
    operation: mapped.operation,
    service: mapped.service,
    driver: mapped.driver,
    mx_border_crossing_point: mapped.mx_border_crossing_point,
    us_border_crossing_point: mapped.us_border_crossing_point,
    mx_linehaul: mapped.mx_linehaul,
    us_linehaul: mapped.us_linehaul,
    us_miles: mapped.us_miles,
    fsc: mapped.fsc,
    fuel: mapped.fuel,
    border_crossing_fee: mapped.border_crossing_fee,
    all_in_rate: mapped.all_in_rate,
    currency: mapped.currency || "USD",
    weekly_capacity: mapped.weekly_capacity,
    notes: mapped.notes,
    hazmat: mapped.hazmat,
    temperature_controlled: mapped.temperature_controlled
  };

  const distance = cleanNumber(mapped.distance);
  const distanceType = normalizeHeaderKey(mapped.distance_type);
  if (distance !== null) {
    if (distanceType.includes("km") || distanceType.includes("kilomet")) input.calculated_km = distance;
    else input.calculated_miles = distance;
  }

  return input;
}

function templateMappedRows(templateRows: Record<string, unknown>[]) {
  return templateRows
    .map((row) => (row.mapped && typeof row.mapped === "object" ? row.mapped as Record<string, unknown> : {}))
    .filter((mapped) => Object.keys(mapped).length);
}

function templateLocationScope(templateRows: Record<string, unknown>[]) {
  const references = new Set<string>();
  const stateCodes = new Set<string>();
  const zipPrefixes = new Set<string>();
  const locationKeys = new Set<string>();

  for (const mapped of templateMappedRows(templateRows)) {
    for (const field of ["origin_zip_prefix", "destination_zip_prefix"]) {
      const value = cleanText(mapped[field]);
      if (!value) continue;
      const numericPostal = value.match(/\b\d{3,5}\b/)?.[0] || "";
      if (numericPostal) zipPrefixes.add(numericPostal.slice(0, 3));
      const caPostal = catalogKey(value).match(/\b[A-Z]\d[A-Z]\b/)?.[0] || "";
      if (caPostal) zipPrefixes.add(caPostal);
    }
    for (const field of ["origin_state", "destination_state"]) {
      const value = cleanText(mapped[field]);
      if (!value) continue;
      stateCodes.add(value.toUpperCase());
      stateCodes.add(normalizedLocationStateCode(value).toUpperCase());
    }
    for (const field of ["origin", "destination", "mx_border_crossing_point", "us_border_crossing_point"]) {
      const value = cleanText(mapped[field]);
      if (!value) continue;
      references.add(value);
      const profile = locationTextProfile(value);
      if (profile.lookup) locationKeys.add(profile.lookup);

      for (const token of profile.tokens) {
        const normalizedState = normalizedLocationStateCode(token).toUpperCase();
        if (LOCATION_MX_STATES.has(token) || LOCATION_US_STATES.has(token) || LOCATION_CA_PROVINCES.has(token)) {
          stateCodes.add(token.toUpperCase());
          stateCodes.add(normalizedState);
        }
      }

      const numericPostal = profile.lookup.match(/\b\d{3,5}\b/)?.[0] || "";
      if (numericPostal && !profile.explicitMx) zipPrefixes.add(numericPostal.slice(0, 3));
      const caPostal = profile.lookup.match(/\b[A-Z]\d[A-Z]\b/)?.[0] || "";
      if (caPostal && !profile.explicitMx) zipPrefixes.add(caPostal);
    }
  }

  return {
    references: [...references].slice(0, 500),
    stateCodes: [...stateCodes].filter(Boolean).slice(0, 100),
    zipPrefixes: [...zipPrefixes].filter(Boolean).slice(0, 500),
    locationKeys: [...locationKeys].filter(Boolean).slice(0, 500)
  };
}

async function fetchScopedTemplateLocations(
  supabase: ReturnType<typeof createClient>,
  templateRows: Record<string, unknown>[]
) {
  const selectColumns = "source,location_key,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region";
  const scope = templateLocationScope(templateRows);
  const byKey = new Map<string, Record<string, unknown>>();
  const addRows = (rows: Record<string, unknown>[] | null | undefined) => {
    for (const row of rows || []) {
      const key = cleanText(row.location_key) || cleanText(row.raw_value) || cleanText(row.id);
      if (!key) continue;
      byKey.set(key, row);
    }
  };

  for (const chunk of chunkValues(scope.zipPrefixes, 100)) {
    const result = await supabase
      .from("rateware_locations")
      .select(selectColumns)
      .eq("active", true)
      .in("zip_prefix", chunk)
      .limit(5000);
    if (result.error) throw result.error;
    addRows(result.data || []);
  }

  for (const chunk of chunkValues(scope.stateCodes, 50)) {
    const result = await supabase
      .from("rateware_locations")
      .select(selectColumns)
      .eq("active", true)
      .in("state_code", chunk)
      .limit(8000);
    if (result.error) throw result.error;
    addRows(result.data || []);
  }

  for (const chunk of chunkValues(scope.locationKeys, 100)) {
    const result = await supabase
      .from("rateware_locations")
      .select(selectColumns)
      .eq("active", true)
      .in("location_key", chunk)
      .limit(2000);
    if (result.error) throw result.error;
    addRows(result.data || []);
  }

  if (!byKey.size) {
    const result = await supabase
      .from("rateware_locations")
      .select(selectColumns)
      .eq("active", true)
      .limit(3000);
    if (result.error) throw result.error;
    addRows(result.data || []);
  }

  return [...byKey.values()];
}

function templateMileageKeys(templateRows: Record<string, unknown>[]) {
  const keys = new Set<string>();
  for (const mapped of templateMappedRows(templateRows)) {
    const origin = mapped.origin;
    const destination = mapped.destination;
    if (!cleanText(origin) || !cleanText(destination)) continue;
    [
      [origin, destination, mapped.equipment, mapped.trailer, mapped.config, mapped.operation, mapped.service, mapped.driver],
      [origin, destination, mapped.equipment],
      [origin, destination]
    ].forEach((parts) => {
      const key = catalogKey(parts.filter(Boolean).join(" "));
      if (key) keys.add(key);
    });
  }
  return [...keys].slice(0, 1000);
}

async function fetchScopedTemplateMileage(
  supabase: ReturnType<typeof createClient>,
  templateRows: Record<string, unknown>[]
) {
  const keys = templateMileageKeys(templateRows);
  if (!keys.length) return [];
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkValues(keys, 100)) {
    const result = await supabase
      .from("rateware_lane_mileage")
      .select("source,route_key,miles,km")
      .eq("active", true)
      .in("route_key", chunk)
      .limit(1000);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}

function rowHasRateSignal(row: Record<string, unknown>) {
  return Boolean(
    cleanRateText(row.all_in_rate) ||
      cleanRateText(row.mx_linehaul) ||
      cleanRateText(row.us_linehaul) ||
      cleanRateText(row.fsc) ||
      cleanRateText(row.border_crossing_fee)
  );
}

async function bulkImportStructuredUpload(
  supabase: ReturnType<typeof createClient>,
  user: { owner_user_id: string | null; owner_email: string | null },
  rawUploadId: string,
  templateRows: unknown[] = [],
  templateWarnings: unknown[] = [],
  options: Record<string, unknown> = {}
) {
  if (!rawUploadId) throw new Error("raw_upload_id is required.");
  const replaceExisting = options.replace_existing === undefined ? true : cleanBoolean(options.replace_existing);
  const expectedRateRows = Math.max(0, Number(options.expected_rate_rows || templateRows.length) || templateRows.length);
  const batchIndex = Math.max(0, Number(options.batch_index || 0) || 0);
  const batchCount = Math.max(1, Number(options.batch_count || 1) || 1);
  const importedBefore = Math.max(0, Number(options.imported_before || 0) || 0);
  const skippedBefore = Math.max(0, Number(options.skipped_before || 0) || 0);

  const uploadResult = await supabase
    .from("raw_uploads")
    .select("*, vendors(vendor_name,domain,primary_email)")
    .eq("id", rawUploadId)
    .single();
  if (uploadResult.error) throw uploadResult.error;
  const upload = uploadResult.data || {};
  if (cleanText(upload.document_type) !== "xlsx") {
    throw new Error("Bulk template import is only available for XLSX uploads.");
  }
  const inheritedVendorId = cleanText(upload.vendor_id);
  const inheritedVendorDomain = uploadVendorDomain(upload);

  const parsed = {
    rows: Array.isArray(templateRows)
      ? templateRows
          .map((row) => (row && typeof row === "object" ? row as Record<string, unknown> : null))
          .filter(Boolean) as Record<string, unknown>[]
      : [],
    warnings: Array.isArray(templateWarnings) ? templateWarnings.map(cleanText).filter(Boolean) as string[] : []
  };
  if (!parsed.rows.length) {
    throw new Error(parsed.warnings[0] || "No structured template rows were found in this workbook.");
  }

  const vendorsPromise = inheritedVendorId
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from("vendors")
        .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails,status,base_stage")
        .eq("owner_email", user.owner_email)
        .limit(5000);

  const [catalogResult, scopedLocations, scopedMileage, vendorsResult] = await Promise.all([
    supabase
      .from("rateware_catalog_items")
      .select("source,category,raw_value,normalized_value,code")
      .eq("active", true)
      .limit(10000),
    fetchScopedTemplateLocations(supabase, parsed.rows),
    fetchScopedTemplateMileage(supabase, parsed.rows),
    vendorsPromise
  ]);
  for (const result of [catalogResult, vendorsResult]) {
    if (result.error) throw result.error;
  }

  const jobResult = await supabase
    .from("interpretation_jobs")
    .insert({
      raw_upload_id: rawUploadId,
      status: "running",
      model: `structured-template-import ${batchIndex + 1}/${batchCount}`
    })
    .select("id")
    .single();
  if (jobResult.error) throw jobResult.error;

  const catalog = buildCatalogIndex(catalogResult.data || []);
  const locationIndex = buildLocationIndex(scopedLocations || []);
  const mileage = new Map((scopedMileage || []).map((lane) => [catalogKey(lane.route_key), lane]));
  const vendors = vendorsResult.data || [];
  const rowsToInsert: Record<string, unknown>[] = [];
  const warnings = [...parsed.warnings];
  let skipped = 0;

  for (const [index, parsedRow] of parsed.rows.entries()) {
    const mapped = parsedRow.mapped && typeof parsedRow.mapped === "object" ? parsedRow.mapped as Record<string, unknown> : {};
    const raw = parsedRow.raw && typeof parsedRow.raw === "object" ? parsedRow.raw as Record<string, unknown> : {};
    const sheetName = cleanText(parsedRow.sheet_name) || "Sheet";
    const sourceRowNumber = Number(parsedRow.source_row_number || index + 1) || index + 1;
    const input = templateRowInput(mapped, upload);
    const patch = normalizeStagingPatch(input, {});
    const rowWarnings: string[] = [];
    if (!patch.origin || !patch.destination) rowWarnings.push("missing origin or destination");
    if (!rowHasRateSignal(patch)) rowWarnings.push("missing usable rate");
    if (rowWarnings.length) {
      skipped += 1;
      if (warnings.length < 20) warnings.push(`${sheetName} row ${sourceRowNumber}: ${rowWarnings.join(", ")}.`);
      continue;
    }

    const vendorReference = patch.vendor_domain || mapped.vendor_domain || mapped.vendor_name || upload.vendor_hint;
    if (inheritedVendorId) {
      Object.assign(patch, {
        vendor_id: inheritedVendorId,
        vendor_domain: inheritedVendorDomain || domainFromVendorReference(vendorReference) || patch.vendor_domain || null
      });
    } else {
      Object.assign(patch, vendorLinkPatchFromRows(vendors, vendorReference));
    }
    Object.assign(patch, normalizeRowWithCurrentCatalog(patch, catalog, locationIndex, mileage));

    rowsToInsert.push({
      ...patch,
      raw_upload_id: rawUploadId,
      interpretation_job_id: jobResult.data.id,
      status: "pending_review",
      confidence: 1,
      row_id: patch.row_id || String(index + 1),
      extraction_warnings: [],
      audit_flags: [],
      field_confidence: {
        import_method: "structured_template",
        all_fields: 1
      },
      source_evidence: {
        import_method: "structured_template",
        sheet_name: sheetName,
        source_row_number: sourceRowNumber,
        mapped_fields: Object.keys(mapped)
      },
      extracted_payload: {
        import_method: "structured_template",
        sheet_name: sheetName,
        source_row_number: sourceRowNumber,
        raw_values: raw
      }
    });
  }

  if (!rowsToInsert.length) {
    await supabase
      .from("interpretation_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString(), extracted_rows: 0, error_message: "No usable template rows found." })
      .eq("id", jobResult.data.id);
    throw new Error(warnings[0] || "No usable template rows found.");
  }

  let existingRowsResult: { data: Array<{ id: string }> | null; error: unknown } = { data: [], error: null };
  if (replaceExisting) {
    existingRowsResult = await supabase
      .from("rate_staging")
      .select("id")
      .eq("raw_upload_id", rawUploadId)
      .in("status", ["pending_review", "rejected"]);
    if (existingRowsResult.error) throw existingRowsResult.error;
  }

  const insertedRows: Record<string, unknown>[] = [];
  for (let index = 0; index < rowsToInsert.length; index += 500) {
    const result = await supabase
      .from("rate_staging")
      .insert(rowsToInsert.slice(index, index + 500))
      .select("id");
    if (result.error) throw result.error;
    insertedRows.push(...(result.data || []));
  }

  const existingIds = (existingRowsResult.data || []).map((row) => row.id).filter(Boolean);
  if (existingIds.length) {
    const archiveResult = await supabase
      .from("rate_staging")
      .update({ status: "archived" })
      .in("id", existingIds);
    if (archiveResult.error) throw archiveResult.error;
  }

  const totalImportedRows = importedBefore + insertedRows.length;
  const totalSkippedRows = skippedBefore + skipped;
  const auditStatus = warnings.length || totalSkippedRows ? "needs_review" : "ok";
  const auditWarnings = warnings.slice(0, 25);
  const now = new Date().toISOString();
  const [jobUpdate, uploadUpdate] = await Promise.all([
    supabase
      .from("interpretation_jobs")
      .update({
        status: "completed",
        completed_at: now,
        extracted_rows: insertedRows.length,
        error_message: null
      })
      .eq("id", jobResult.data.id),
    supabase
      .from("raw_uploads")
      .update({
        status: "staged",
        vendor_hint: upload.vendor_hint || inheritedVendorDomain || null,
        interpreted_at: now,
        error_message: null,
        interpreted_rate_rows: totalImportedRows,
        expected_rate_rows: expectedRateRows,
        audit_status: auditStatus,
        audit_warnings: auditWarnings,
        interpretation_audit: {
          status: auditStatus,
          import_method: "structured_template",
          batch_index: batchIndex,
          batch_count: batchCount,
          expected_rate_rows: expectedRateRows,
          interpreted_rate_rows: totalImportedRows,
          skipped_rows: totalSkippedRows,
          warning_count: warnings.length,
          warnings: auditWarnings
        }
      })
      .eq("id", rawUploadId)
  ]);
  if (jobUpdate.error) throw jobUpdate.error;
  if (uploadUpdate.error) throw uploadUpdate.error;

  await writeAuditLog(supabase, user, "upload.bulk_template_import", "raw_uploads", rawUploadId, `Bulk imported ${insertedRows.length} structured rate row(s)`, {
    filename: upload.original_filename,
    batch_index: batchIndex,
    batch_count: batchCount,
    expected_rows: expectedRateRows,
    imported_rows: insertedRows.length,
    total_imported_rows: totalImportedRows,
    skipped_rows: skipped,
    total_skipped_rows: totalSkippedRows,
    warning_count: warnings.length
  });

  return {
    imported_rows: insertedRows.length,
    expected_rows: expectedRateRows,
    skipped_rows: skipped,
    total_imported_rows: totalImportedRows,
    total_skipped_rows: totalSkippedRows,
    batch_index: batchIndex,
    batch_count: batchCount,
    warnings: auditWarnings
  };
}

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeRfxEvent(input: Record<string, unknown>) {
  const rfxId = cleanText(input.rfx_id || input.rfx || input.event_id) || `RFx-${new Date().toISOString().slice(0, 10)}`;
  const eventType = cleanText(input.event_type || input.type)?.toLowerCase() || "spot";
  const status = cleanText(input.status)?.toLowerCase() || "draft";
  return {
    rfx_id: rfxId,
    name: cleanText(input.name || input.event_name || input.title) || rfxId,
    customer: cleanText(input.customer || input.shipper || input.account),
    event_type: ["spot", "rfx", "bid"].includes(eventType) ? eventType : "spot",
    status: ["draft", "open", "closed", "awarded", "archived"].includes(status) ? status : "draft",
    due_date: cleanDate(input.due_date || input.deadline),
    notes: cleanText(input.notes || input.description),
    updated_at: new Date().toISOString()
  };
}

function normalizeRfxEventPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (input.rfx_id !== undefined || input.rfx !== undefined) patch.rfx_id = cleanText(input.rfx_id || input.rfx);
  if (input.name !== undefined || input.event_name !== undefined || input.title !== undefined) patch.name = cleanText(input.name || input.event_name || input.title);
  if (input.customer !== undefined || input.shipper !== undefined || input.account !== undefined) patch.customer = cleanText(input.customer || input.shipper || input.account);
  if (input.event_type !== undefined || input.type !== undefined) {
    const eventType = cleanText(input.event_type || input.type)?.toLowerCase();
    if (eventType && ["spot", "rfx", "bid"].includes(eventType)) patch.event_type = eventType;
  }
  if (input.status !== undefined) {
    const status = cleanText(input.status)?.toLowerCase();
    if (status && ["draft", "open", "closed", "awarded", "archived"].includes(status)) patch.status = status;
  }
  if (input.due_date !== undefined || input.deadline !== undefined) patch.due_date = cleanDate(input.due_date || input.deadline);
  if (input.notes !== undefined || input.description !== undefined) patch.notes = cleanText(input.notes || input.description);
  patch.updated_at = new Date().toISOString();
  return patch;
}

function normalizeRfxLane(input: Record<string, unknown>, index = 0) {
  const origin = cleanText(input.origin || input.orig || input.origin_city || input.from);
  const destination = cleanText(input.destination || input.dest || input.destination_city || input.to);
  return {
    lane_number: Number(input.lane_number || input.lane || input.seq || index + 1) || index + 1,
    origin,
    origin_city: cleanText(input.origin_city || input.o_city),
    origin_state: cleanText(input.origin_state || input.o_state || input.origin_st || input.o_st),
    origin_country: cleanText(input.origin_country || input.o_country),
    origin_market: cleanText(input.origin_market || input.o_market),
    origin_region: cleanText(input.origin_region || input.o_region),
    destination,
    destination_city: cleanText(input.destination_city || input.d_city),
    destination_state: cleanText(input.destination_state || input.d_state || input.destination_st || input.d_st),
    destination_country: cleanText(input.destination_country || input.d_country),
    destination_market: cleanText(input.destination_market || input.d_market),
    destination_region: cleanText(input.destination_region || input.d_region),
    equipment: cleanText(input.equipment || input.equip),
    trailer: cleanText(input.trailer || input.trailer_type),
    config: cleanText(input.config || input.configuration),
    operation: cleanText(input.operation),
    service: cleanText(input.service),
    weekly_volume: cleanNumber(input.weekly_volume || input.weekly_loads || input.loads_per_week || input.volume),
    annual_volume: cleanNumber(input.annual_volume || input.annual_loads),
    target_rate: cleanNumber(input.target_rate || input.target || input.budget),
    currency: cleanText(input.currency)?.toUpperCase() || "USD",
    incumbent_vendor: cleanText(input.incumbent_vendor || input.incumbent),
    notes: cleanText(input.notes || input.lane_notes),
    updated_at: new Date().toISOString()
  };
}

function laneText(row: Record<string, unknown>) {
  return [
    row.origin,
    row.origin_city,
    row.origin_state,
    row.origin_country,
    row.origin_market,
    row.origin_region,
    row.destination,
    row.destination_city,
    row.destination_state,
    row.destination_country,
    row.destination_market,
    row.destination_region,
    row.equipment,
    row.trailer,
    row.config,
    row.operation,
    row.service
  ].filter(Boolean).join(" ");
}

function stringMatchScore(left: unknown, right: unknown, weight: number) {
  const a = catalogKey(left);
  const b = catalogKey(right);
  if (!a || !b) return 0;
  if (a === b) return weight;
  if (a.includes(b) || b.includes(a)) return Math.round(weight * 0.65);
  return 0;
}

function sideMatchScore(lane: Record<string, unknown>, rate: Record<string, unknown>, prefix: "origin" | "destination") {
  const normalizedField = prefix === "origin" ? "normalized_origin" : "normalized_destination";
  let score = 0;
  score += stringMatchScore(lane[`${prefix}_market`], rate[`${prefix}_market`], 30);
  score += stringMatchScore(lane[`${prefix}_region`], rate[`${prefix}_region`], 14);
  score += stringMatchScore(lane[`${prefix}_state`], rate[`${prefix}_state`], 14);
  score += stringMatchScore(lane[`${prefix}_country`], rate[`${prefix}_country`], 10);
  score += stringMatchScore(lane[prefix], rate[normalizedField] || rate[prefix], 22);
  score += stringMatchScore(lane[`${prefix}_city`], rate[`${prefix}_city`] || rate[normalizedField] || rate[prefix], 18);
  return Math.min(50, score);
}

function rateFitForLane(lane: Record<string, unknown>, rate: Record<string, unknown>) {
  const score =
    sideMatchScore(lane, rate, "origin") +
    sideMatchScore(lane, rate, "destination") +
    stringMatchScore(lane.equipment, rate.equipment || rate.normalized_equipment, 12) +
    stringMatchScore(lane.trailer, rate.trailer || rate.normalized_trailer, 10) +
    stringMatchScore(lane.config, rate.config || rate.normalized_config, 8) +
    stringMatchScore(lane.operation, rate.operation || rate.normalized_operation, 12) +
    stringMatchScore(lane.service, rate.service || rate.normalized_service, 10);
  return Math.min(100, score);
}

function bestRatewareBenchmark(lane: Record<string, unknown>, rates: Record<string, unknown>[]) {
  const matches = rates
    .map((rate) => ({
      rate,
      score: rateFitForLane(lane, rate),
      amount: numericAmount(rate.all_in_rate)
    }))
    .filter((item) => item.score >= 40 && item.amount !== null)
    .sort((a, b) => b.score - a.score || Number(a.amount) - Number(b.amount));
  const best = matches[0];
  if (!best) return null;
  return {
    rate_id: best.rate.id,
    score: best.score,
    vendor: (best.rate.vendors as Record<string, unknown> | undefined)?.vendor_name || best.rate.vendor_domain || null,
    vendor_domain: best.rate.vendor_domain || null,
    all_in_rate: best.amount,
    currency: best.rate.currency || "USD",
    quote_date: best.rate.quote_date || null,
    origin: best.rate.normalized_origin || best.rate.origin || null,
    destination: best.rate.normalized_destination || best.rate.destination || null
  };
}

function invitationWithComparison(invitation: Record<string, unknown>, benchmark: Record<string, unknown> | null) {
  const bidRate = cleanNumber(invitation.bid_rate);
  const benchmarkRate = cleanNumber(benchmark?.all_in_rate);
  return {
    ...invitation,
    bid_delta: bidRate !== null && benchmarkRate !== null ? bidRate - benchmarkRate : null,
    bid_delta_pct: bidRate !== null && benchmarkRate ? ((bidRate - benchmarkRate) / benchmarkRate) * 100 : null,
    benchmark
  };
}

function vendorOwnsRate(vendor: Record<string, unknown>, rate: Record<string, unknown>) {
  if (vendor.id && rate.vendor_id && vendor.id === rate.vendor_id) return true;
  const vendorDomain = normalizeDomain(vendor.domain);
  const rateDomain = normalizeDomain(rate.vendor_domain);
  if (vendorDomain && rateDomain && vendorDomain === rateDomain) return true;
  const emails = vendorEmails(vendor);
  return Boolean(rateDomain && emails.some((email) => email.endsWith(`@${rateDomain}`)));
}

function scoreVendorForLane(vendor: Record<string, unknown>, lane: Record<string, unknown>, rates: Record<string, unknown>[]) {
  let score = 28;
  const evidence: string[] = [];
  const gaps: string[] = [];
  const status = cleanText(vendor.status)?.toLowerCase();
  const baseStage = cleanText(vendor.base_stage)?.toLowerCase();
  if (status === "active") score += 12;
  if (status === "blocked") {
    score -= 80;
    gaps.push("Blocked vendor");
  }
  if (status === "inactive") {
    score -= 20;
    gaps.push("Inactive vendor");
  }
  if (baseStage === "procurement") {
    score += 18;
    evidence.push("Procurement Base carrier");
  } else if (baseStage === "sourcing") {
    score += 8;
    evidence.push("Available in Sourcing Base");
  }
  if (vendor.primary_email) score += 8;
  else gaps.push("Missing email");
  if (vendor.whatsapp_phone) score += 4;
  const vendorText = catalogKey(vendorSearchText(vendor));
  const laneTerms = [
    lane.origin_market,
    lane.destination_market,
    lane.origin_region,
    lane.destination_region,
    lane.origin_state,
    lane.destination_state,
    lane.equipment,
    lane.trailer,
    lane.operation,
    lane.service
  ].map(catalogKey).filter(Boolean);
  const textHits = laneTerms.filter((term) => vendorText.includes(term));
  if (textHits.length) {
    score += Math.min(18, textHits.length * 5);
    evidence.push(`Vendor profile matches ${textHits.slice(0, 3).join(", ")}`);
  }
  const vendorRates = rates.filter((rate) => vendorOwnsRate(vendor, rate));
  const bestRateScore = vendorRates.reduce((best, rate) => Math.max(best, rateFitForLane(lane, rate)), 0);
  if (bestRateScore >= 40) {
    score += Math.min(30, Math.round(bestRateScore / 3));
    evidence.push(`Historical Rateware fit ${bestRateScore}/100`);
  } else {
    gaps.push("No strong historical Rateware lane match");
  }
  return {
    vendor_id: vendor.id,
    vendor_name: vendor.vendor_name,
    domain: vendor.domain,
    primary_email: vendor.primary_email,
    base_stage: vendor.base_stage,
    status: vendor.status,
    fit_score: Math.max(0, Math.min(100, Math.round(score))),
    evidence,
    gaps
  };
}

async function fetchApprovedRateRows(supabase: ReturnType<typeof createClient>) {
  const result = await supabase
    .from("rate_staging")
    .select("*, vendors(vendor_name,domain,primary_email,base_stage,status)")
    .eq("status", "approved")
    .limit(2000);
  if (result.error) throw result.error;
  return result.data || [];
}

async function requireOwnedRfxEvent(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, eventId: unknown) {
  const id = cleanText(eventId);
  if (!id) throw new Error("RFx event id is required.");
  const result = await supabase
    .from("rfx_events")
    .select("*")
    .eq("id", id)
    .eq("owner_email", user.owner_email)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function requireOwnedRfxLane(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, laneId: unknown) {
  const id = cleanText(laneId);
  if (!id) throw new Error("RFx lane id is required.");
  const laneResult = await supabase
    .from("rfx_lanes")
    .select("*, rfx_events!inner(id,owner_email)")
    .eq("id", id)
    .eq("rfx_events.owner_email", user.owner_email)
    .single();
  if (laneResult.error) throw laneResult.error;
  return laneResult.data;
}

function normalizeOutreachTemplate(input: Record<string, unknown>) {
  const channel = cleanText(input.channel)?.toLowerCase() || "multi";
  const name = cleanText(input.name);
  if (!name) throw new Error("Template name is required.");
  return {
    name,
    channel: ["email", "whatsapp", "multi"].includes(channel) ? channel : "multi",
    subject: cleanText(input.subject),
    html_body: cleanText(input.html_body || input.body || input.email_body),
    whatsapp_body: cleanText(input.whatsapp_body || input.whatsapp_text),
    active: input.active === undefined ? true : cleanBoolean(input.active),
    is_default: input.is_default === undefined ? false : cleanBoolean(input.is_default),
    placeholders: Array.isArray(input.placeholders) ? input.placeholders.map(cleanText).filter(Boolean) : [],
    updated_at: new Date().toISOString()
  };
}

function normalizeOutreachCampaign(input: Record<string, unknown>) {
  const channel = cleanText(input.channel)?.toLowerCase() || "multi";
  const status = cleanText(input.status)?.toLowerCase() || "draft";
  const name = cleanText(input.name);
  if (!name) throw new Error("Campaign name is required.");
  return {
    rfx_event_id: cleanText(input.rfx_event_id || input.event_id),
    template_id: cleanText(input.template_id),
    name,
    channel: ["email", "whatsapp", "multi"].includes(channel) ? channel : "multi",
    status: ["draft", "generated", "queued", "sent", "closed", "archived"].includes(status) ? status : "draft",
    notes: cleanText(input.notes),
    updated_at: new Date().toISOString()
  };
}

function renderTemplateText(template: unknown, context: Record<string, unknown>) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function htmlToText(html: unknown) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function phoneForWhatsapp(value: unknown) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.length >= 10 ? digits : null;
}

function gmailComposeUrl(to: unknown, subject: unknown, body: unknown) {
  const recipient = cleanText(to);
  if (!recipient) return null;
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: recipient,
    su: cleanText(subject) || "",
    body: cleanText(body) || ""
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function whatsappDraftUrl(phone: unknown, text: unknown) {
  const normalized = phoneForWhatsapp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(cleanText(text) || "")}`;
}

function contactPreview(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function outreachContext(invitation: Record<string, unknown>, appOrigin: string) {
  const vendor = typeof invitation.vendors === "object" && invitation.vendors ? invitation.vendors as Record<string, unknown> : {};
  const lane = typeof invitation.rfx_lanes === "object" && invitation.rfx_lanes ? invitation.rfx_lanes as Record<string, unknown> : {};
  const event = typeof invitation.rfx_events === "object" && invitation.rfx_events ? invitation.rfx_events as Record<string, unknown> : {};
  const bidLink = `${appOrigin.replace(/\/$/, "")}/rfx-bid.html?token=${encodeURIComponent(String(invitation.invitation_token || ""))}`;
  return {
    vendor_name: vendor.vendor_name || vendor.domain || "Carrier",
    contact_name: vendor.contact_name || vendor.vendor_name || "team",
    vendor_domain: vendor.domain || "",
    vendor_email: vendor.primary_email || "",
    rfx_id: event.rfx_id || "",
    event_name: event.name || event.rfx_id || "",
    customer: event.customer || "",
    due_date: event.due_date || "",
    lane_origin: lane.origin || lane.origin_city || "",
    lane_destination: lane.destination || lane.destination_city || "",
    origin_market: lane.origin_market || "",
    destination_market: lane.destination_market || "",
    equipment: lane.equipment || "",
    trailer: lane.trailer || "",
    config: lane.config || "",
    operation: lane.operation || "",
    service: lane.service || "",
    weekly_volume: lane.weekly_volume || "",
    target_rate: lane.target_rate || "",
    currency: lane.currency || "USD",
    bid_link: bidLink
  };
}

function messageChannels(channel: unknown) {
  const normalized = cleanText(channel)?.toLowerCase() || "multi";
  if (normalized === "email") return ["email"];
  if (normalized === "whatsapp") return ["whatsapp"];
  return ["email", "whatsapp"];
}

async function fetchOutreachTemplate(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, id: unknown) {
  const templateId = cleanText(id);
  if (!templateId) throw new Error("Outreach template id is required.");
  const result = await supabase
    .from("outreach_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (result.error) throw result.error;
  if (result.data.owner_email && result.data.owner_email !== user.owner_email) throw new Error("Outreach template not found.");
  return result.data;
}

async function requireOwnedOutreachCampaign(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, id: unknown) {
  const campaignId = cleanText(id);
  if (!campaignId) throw new Error("Outreach campaign id is required.");
  const result = await supabase
    .from("outreach_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("owner_email", user.owner_email)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function normalizeSaasProfile(input: Record<string, unknown>) {
  const accessMode = cleanText(input.access_mode)?.toLowerCase() || "full_access";
  return {
    full_name: cleanText(input.full_name || input.name),
    job_title: cleanText(input.job_title || input.title),
    phone: cleanText(input.phone),
    timezone: cleanText(input.timezone) || "America/Mexico_City",
    preferred_language: cleanText(input.preferred_language || input.language) || "en",
    access_mode: ["full_access", "roles_later"].includes(accessMode) ? accessMode : "full_access",
    avatar_url: cleanText(input.avatar_url),
    updated_at: new Date().toISOString()
  };
}

function normalizeOrganization(input: Record<string, unknown>) {
  return {
    org_name: cleanText(input.org_name || input.name) || "Rateware workspace",
    workspace_slug: cleanText(input.workspace_slug || input.slug),
    website: cleanText(input.website),
    industry: cleanText(input.industry) || "freight procurement",
    timezone: cleanText(input.timezone) || "America/Mexico_City",
    billing_email: cleanText(input.billing_email),
    notes: cleanText(input.notes),
    updated_at: new Date().toISOString()
  };
}

async function ensureSaasProfile(supabase: ReturnType<typeof createClient>, user: { owner_user_id: string | null; owner_email: string | null }) {
  const existing = await supabase
    .from("user_profiles")
    .select("*")
    .eq("owner_email", user.owner_email)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const result = await supabase
    .from("user_profiles")
    .insert(withOwner({
      owner_email: user.owner_email,
      full_name: user.owner_email,
      access_mode: "full_access"
    }, user))
    .select()
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function ensureOrganization(supabase: ReturnType<typeof createClient>, user: { owner_user_id: string | null; owner_email: string | null }) {
  const existing = await supabase
    .from("organizations")
    .select("*")
    .eq("owner_email", user.owner_email)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const defaultName = user.owner_email?.includes("@")
    ? `${user.owner_email.split("@").pop()?.split(".")[0] || "Rateware"} workspace`
    : "Rateware workspace";
  const result = await supabase
    .from("organizations")
    .insert(withOwner({
      org_name: defaultName,
      billing_email: user.owner_email
    }, user))
    .select()
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function onboardingDefinition(summary: Record<string, unknown>, profile: Record<string, unknown>, organization: Record<string, unknown>, manual: Map<string, Record<string, unknown>>) {
  const definitions = [
    {
      key: "profile",
      label: "Complete user profile",
      detail: "Name, role, timezone, and contact data are configured.",
      done: Boolean(profile.full_name && profile.job_title)
    },
    {
      key: "organization",
      label: "Set organization profile",
      detail: "Workspace name, industry, website, and billing contact are set.",
      done: Boolean(organization.org_name && organization.billing_email)
    },
    {
      key: "vendors",
      label: "Load vendor base",
      detail: "Sourcing or procurement carriers exist in the workspace.",
      done: Number(summary.vendors || 0) > 0
    },
    {
      key: "rfx",
      label: "Create first RFx event",
      detail: "Spot book or RFx lane book has been created.",
      done: Number(summary.rfx_events || 0) > 0
    },
    {
      key: "outreach",
      label: "Generate carrier outreach",
      detail: "At least one Gmail or WhatsApp draft has been generated.",
      done: Number(summary.outreach_messages || 0) > 0
    },
    {
      key: "uploads",
      label: "Upload source evidence",
      detail: "Quotes, PDFs, images, emails, or spreadsheets are preserved.",
      done: Number(summary.raw_uploads || 0) > 0
    },
    {
      key: "rateware",
      label: "Approve first Rateware row",
      detail: "Human-approved rows are available in the final rate book.",
      done: Number(summary.approved_rows || 0) > 0
    },
    {
      key: "settings_reviewed",
      label: "Review SaaS controls",
      detail: "Confirm full access mode, audit visibility, and next role plan.",
      done: Boolean(manual.get("settings_reviewed")?.completed)
    }
  ];

  return definitions.map((item) => {
    const manualRow = manual.get(item.key);
    const completed = Boolean(item.done || manualRow?.completed);
    return {
      ...item,
      completed,
      completed_at: manualRow?.completed_at || (completed && item.done ? new Date().toISOString() : null),
      manual: Boolean(manualRow?.completed)
    };
  });
}

async function buildSaasSettings(supabase: ReturnType<typeof createClient>, user: { owner_user_id: string | null; owner_email: string | null }) {
  const [profile, organization, checklistResult, auditResult, uploads, vendors, pending, approved, rfxEvents, outreachMessages] = await Promise.all([
    ensureSaasProfile(supabase, user),
    ensureOrganization(supabase, user),
    supabase.from("onboarding_checklist").select("*").eq("owner_email", user.owner_email),
    supabase.from("saas_audit_log").select("*").eq("owner_email", user.owner_email).order("created_at", { ascending: false }).limit(80),
    supabase.from("raw_uploads").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email),
    supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("rfx_events").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).neq("status", "archived"),
    supabase.from("outreach_messages").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).neq("status", "archived")
  ]);

  for (const result of [checklistResult, auditResult, uploads, vendors, pending, approved, rfxEvents, outreachMessages]) {
    if (result.error) throw result.error;
  }

  const summary = {
    raw_uploads: uploads.count || 0,
    vendors: vendors.count || 0,
    pending_review: pending.count || 0,
    approved_rows: approved.count || 0,
    rfx_events: rfxEvents.count || 0,
    outreach_messages: outreachMessages.count || 0
  };
  const manual = new Map((checklistResult.data || []).map((row) => [row.task_key, row]));
  const onboarding = onboardingDefinition(summary, profile, organization, manual);
  return {
    profile,
    organization,
    access: {
      mode: "full_access",
      label: "Full access enabled",
      detail: "All authenticated users can use every Rateware module. Roles can be added later without blocking the current MVP."
    },
    summary,
    onboarding,
    audit: auditResult.data || []
  };
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
  const preserveOriginManual = cleanBoolean(row.origin_match_manual) && (row.origin_zip_prefix || row.origin_state || row.origin_market || row.origin_region || row.origin_country);
  const preserveDestinationManual = cleanBoolean(row.destination_match_manual) && (row.destination_zip_prefix || row.destination_state || row.destination_market || row.destination_region || row.destination_country);
  const originResolution = locationMatch(locationIndex, row.origin || row.normalized_origin);
  const destinationResolution = locationMatch(locationIndex, row.destination || row.normalized_destination);
  const originLocation = preserveOriginManual ? null : originResolution?.location || null;
  const destinationLocation = preserveDestinationManual ? null : destinationResolution?.location || null;
  const originPatch = preserveOriginManual
    ? { origin_match_source: row.origin_match_source || "manual", origin_match_confidence: row.origin_match_confidence || 100, origin_match_manual: true }
    : { ...applyLocation(row, "origin", originLocation), ...locationMatchMeta("origin", originResolution) };
  const destinationPatch = preserveDestinationManual
    ? { destination_match_source: row.destination_match_source || "manual", destination_match_confidence: row.destination_match_confidence || 100, destination_match_manual: true }
    : { ...applyLocation(row, "destination", destinationLocation), ...locationMatchMeta("destination", destinationResolution) };
  const merged = { ...row, ...originPatch, ...destinationPatch };

  return {
    patch: {
      ...originPatch,
      ...destinationPatch,
      origin_match_reason: preserveOriginManual ? row.origin_match_reason || "manual match preserved" : originResolution?.reason || null,
      destination_match_reason: preserveDestinationManual ? row.destination_match_reason || "manual match preserved" : destinationResolution?.reason || null,
      origin_location_candidates: preserveOriginManual ? row.origin_location_candidates || [] : originResolution?.candidates || [],
      destination_location_candidates: preserveDestinationManual ? row.destination_location_candidates || [] : destinationResolution?.candidates || [],
      location_match_status: isLocationResolved(merged, "origin") && isLocationResolved(merged, "destination")
        ? "matched"
        : isLocationResolved(merged, "origin") || isLocationResolved(merged, "destination")
          ? "partial"
          : "unmatched"
    },
    originLocation: preserveOriginManual ? row : originLocation,
    destinationLocation: preserveDestinationManual ? row : destinationLocation
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
  const profile = locationTextProfile([value, fallbackState].filter(Boolean).join(" "));
  if (profile.explicitMx) return null;
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const state = stateToken(fallbackState) || stateToken(parts.slice(1).join(" "));
  const city = parts[0]?.replace(/\b[A-Z]{2}\b/g, "").trim();
  const fallbackText = cleanText(fallbackCountry)?.toUpperCase();
  const fallback = fallbackText === "USA"
    ? "US"
    : fallbackText === "CAN" || fallbackText === "CANADA"
      ? "CA"
      : fallbackText === "MEX" || fallbackText === "MEXICO"
        ? "MX"
        : fallbackText;
  if (fallback === "MX") return null;
  const country = fallback || (state && LOCATION_US_STATES.has(state) ? "US" : state && LOCATION_CA_PROVINCES.has(state) ? "CA" : null);
  if (!city || !state || !country) return null;
  if (!["US", "CA"].includes(country)) return null;
  return { city, state, country };
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
    [`${prefix}_match_source`]: "external_zip_lookup",
    [`${prefix}_match_confidence`]: catalogResolution?.score || 70,
    [`${prefix}_match_manual`]: false,
    [`${prefix}_location_candidates`]: catalogResolution?.candidates || []
  };

  if (catalogLocation) {
    Object.assign(patch, applyLocation({}, prefix, catalogLocation));
    patch[`${prefix}_match_reason`] = `external ZIP lookup, then ${catalogResolution?.reason || "catalog match"}`;
    patch[`${prefix}_match_source`] = "external_zip_lookup";
    patch[`${prefix}_match_confidence`] = Math.max(70, Number(catalogResolution?.score || 0));
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
    const merged = { ...row, ...patch };
    patch.location_match_status = isLocationResolved(merged, "origin") && isLocationResolved(merged, "destination")
      ? "matched"
      : isLocationResolved(merged, "origin") || isLocationResolved(merged, "destination")
        ? "partial"
        : "unmatched";
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

async function fetchVendorRowsForRateMatching(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }) {
  return await fetchVendorReferenceRows(supabase, user, 50000);
}

async function attachUploadVendorHints(
  supabase: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[]
) {
  const uploadIds = [...new Set(rows.map((row) => cleanText(row.raw_upload_id)).filter(Boolean) as string[])];
  if (!uploadIds.length) return rows;

  const uploads = await supabase
    .from("raw_uploads")
    .select("id,original_filename,vendor_id,vendor_hint,vendor_match_source")
    .in("id", uploadIds);
  if (uploads.error) throw uploads.error;

  const byId = new Map((uploads.data || []).map((upload) => [cleanText(upload.id), upload]));
  return rows.map((row) => ({
    ...row,
    raw_upload: byId.get(cleanText(row.raw_upload_id)) || null
  }));
}

function rateVendorReferenceCandidates(row: Record<string, unknown>) {
  const upload = typeof row.raw_upload === "object" && row.raw_upload ? row.raw_upload as Record<string, unknown> : {};
  return [
    ...vendorReferenceCandidatesFromText(row.vendor_domain),
    ...vendorReferenceCandidatesFromText(upload.vendor_hint),
    ...vendorReferenceCandidatesFromText(upload.original_filename)
  ]
    .filter(Boolean)
    .filter((reference) => !isGenericEmailDomain(domainFromVendorReference(reference)))
    .filter((reference) => !isInternalRatewareDomain(reference)) as string[];
}

function rawRateVendorReferenceCandidates(row: Record<string, unknown>) {
  const upload = typeof row.raw_upload === "object" && row.raw_upload ? row.raw_upload as Record<string, unknown> : {};
  return [
    cleanText(row.vendor_domain),
    cleanText(upload.vendor_hint),
    cleanText(upload.original_filename)
  ].filter(Boolean) as string[];
}

function rawUploadVendorReferenceCandidates(upload: Record<string, unknown>) {
  return [
    ...vendorReferenceCandidatesFromText(upload.vendor_hint),
    ...vendorReferenceCandidatesFromText(upload.original_filename)
  ]
    .filter(Boolean)
    .filter((reference) => !isGenericEmailDomain(domainFromVendorReference(reference)))
    .filter((reference) => !isInternalRatewareDomain(reference)) as string[];
}

function plannedVendorPatchForRawUpload(upload: Record<string, unknown>, vendors: Record<string, unknown>[]) {
  if (cleanText(upload.vendor_id)) return null;

  for (const reference of rawUploadVendorReferenceCandidates(upload)) {
    const match = resolveVendorReferenceFromRows(vendors, reference);
    if (!match) continue;
    const fallbackDomain = domainFromVendorReference(reference);
    return {
      vendor_id: match.vendor.id,
      vendor_hint: cleanText(upload.vendor_hint) || normalizeDomain(match.vendor.domain) || match.domain || fallbackDomain || cleanText(match.vendor.vendor_name),
      vendor_match_source: "auto"
    };
  }

  return null;
}

function vendorMatchErrorReason(rawReferences: string[], usableReferences: string[]) {
  if (!rawReferences.length) return "Missing vendor reference. Add vendor domain, vendor name, or legal name.";
  if (!usableReferences.length) {
    const rawText = rawReferences.join(" ");
    if (rawReferences.some((reference) => isInternalRatewareDomain(reference))) return "Internal Marksman/Rateware domain cannot be used as carrier evidence.";
    if (rawReferences.some((reference) => isGenericEmailDomain(domainFromVendorReference(reference)))) return "Generic email domain needs vendor legal name or commercial name.";
    if (!domainFromVendorReference(rawText) && !businessNameKey(rawText)) return "Vendor reference is not usable. Add carrier domain, legal name, or commercial name.";
    return "Vendor reference could not be normalized.";
  }
  return "No vendor record matched the detected domain/name. Correct vendor domain/name or add the vendor to Carrier CRM.";
}

function vendorMatchErrorRow(row: Record<string, unknown>, reason: string, reference: string | null = null) {
  const upload = typeof row.raw_upload === "object" && row.raw_upload ? row.raw_upload as Record<string, unknown> : {};
  const detectedReference = reference || rateVendorReferenceCandidates(row)[0] || rawRateVendorReferenceCandidates(row)[0] || "";
  return {
    rate_row_id: cleanText(row.id),
    shipment_id: cleanText(row.row_id),
    raw_upload_id: cleanText(row.raw_upload_id),
    source_file: cleanText(upload.original_filename),
    rfx_id: cleanText(row.rfx_id),
    quote_date: cleanText(row.quote_date),
    origin: cleanText(row.origin || row.normalized_origin),
    destination: cleanText(row.destination || row.normalized_destination),
    current_vendor_domain: cleanText(row.vendor_domain),
    detected_vendor_reference: detectedReference,
    error_reason: reason,
    corrected_vendor_domain: "",
    corrected_vendor_name: "",
    corrected_legal_name: ""
  };
}

function planRawUploadVendorMatches(uploads: Record<string, unknown>[], vendors: Record<string, unknown>[], seenUploadIds = new Set<string>()) {
  const groups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();
  let candidates = 0;
  let matchable = 0;

  for (const upload of uploads) {
    const id = cleanText(upload.id);
    if (!id || seenUploadIds.has(id)) continue;
    seenUploadIds.add(id);
    const references = rawUploadVendorReferenceCandidates(upload);
    if (!references.length && !cleanText(upload.vendor_id)) continue;
    candidates += 1;

    const patch = plannedVendorPatchForRawUpload(upload, vendors);
    if (!patch?.vendor_id) continue;
    matchable += 1;

    const groupKey = `${patch.vendor_id}::${patch.vendor_hint}`;
    const group = groups.get(groupKey) || { patch, ids: [] };
    group.ids.push(id);
    groups.set(groupKey, group);
  }

  return { candidates, matchable, groups };
}

async function applyPlannedRawUploadVendorMatches(supabase: ReturnType<typeof createClient>, plan: ReturnType<typeof planRawUploadVendorMatches>) {
  let updated = 0;
  const rows: Record<string, unknown>[] = [];

  for (const group of plan.groups.values()) {
    for (const chunk of chunkValues(group.ids, 500)) {
      const result = await supabase
        .from("raw_uploads")
        .update(group.patch)
        .in("id", chunk)
        .is("vendor_id", null)
        .select("id,vendor_id,vendor_hint,vendor_match_source");
      if (result.error) throw result.error;
      updated += result.data?.length || 0;
      if (rows.length < 100) rows.push(...((result.data || []) as Record<string, unknown>[]).slice(0, 100 - rows.length));
    }
  }

  return { updated, rows };
}

function plannedVendorPatchForRateRow(row: Record<string, unknown>, vendors: Record<string, unknown>[]) {
  const vendorsById = vendorById(vendors);
  const upload = typeof row.raw_upload === "object" && row.raw_upload ? row.raw_upload as Record<string, unknown> : {};
  const linkedVendor = vendorsById.get(cleanText(row.vendor_id) || "") || vendorsById.get(cleanText(upload.vendor_id) || "");
  if (linkedVendor) {
    return {
      vendor_id: linkedVendor.id,
      vendor_domain: normalizeDomain(linkedVendor.domain) || domainFromVendorReference(linkedVendor.primary_email) || domainFromVendorReference(row.vendor_domain)
    };
  }

  for (const reference of rateVendorReferenceCandidates(row)) {
    const match = resolveVendorReferenceFromRows(vendors, reference);
    if (!match) continue;
    const fallbackDomain = domainFromVendorReference(reference);
    return {
      vendor_id: match.vendor.id,
      vendor_domain: normalizeDomain(match.vendor.domain) || match.domain || fallbackDomain || reference
    };
  }

  return null;
}

function planRateVendorMatches(rows: Record<string, unknown>[], vendors: Record<string, unknown>[], options: { collectErrors?: number } = {}) {
  const groups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();
  let candidates = 0;
  let matchable = 0;
  const unmatchedErrors: Record<string, unknown>[] = [];
  const errorLimit = Math.max(0, Number(options.collectErrors || 0) || 0);

  for (const row of rows) {
    const id = cleanText(row.id);
    if (!id) continue;
    const rawReferences = rawRateVendorReferenceCandidates(row);
    const references = rateVendorReferenceCandidates(row);
    const hasUploadVendor = Boolean(cleanText((row.raw_upload as Record<string, unknown> | undefined)?.vendor_id));
    const hasCurrentVendor = Boolean(cleanText(row.vendor_id));
    if (!hasCurrentVendor && !hasUploadVendor && !references.length) {
      if (errorLimit && unmatchedErrors.length < errorLimit) {
        unmatchedErrors.push(vendorMatchErrorRow(row, vendorMatchErrorReason(rawReferences, references)));
      }
      continue;
    }
    candidates += 1;

    const patch = plannedVendorPatchForRateRow(row, vendors);
    if (!patch?.vendor_id) {
      if (errorLimit && unmatchedErrors.length < errorLimit && !hasCurrentVendor && !hasUploadVendor) {
        unmatchedErrors.push(vendorMatchErrorRow(row, vendorMatchErrorReason(rawReferences, references), references[0]));
      }
      continue;
    }
    const currentVendorId = cleanText(row.vendor_id);
    const currentDomain = normalizeDomain(row.vendor_domain);
    if (currentVendorId === cleanText(patch.vendor_id) && currentDomain === normalizeDomain(patch.vendor_domain)) continue;
    matchable += 1;

    const groupKey = `${patch.vendor_id}::${patch.vendor_domain}`;
    const group = groups.get(groupKey) || { patch, ids: [] };
    group.ids.push(id);
    groups.set(groupKey, group);
  }

  return { candidates, matchable, groups, unmatched_errors: unmatchedErrors, unmatched_errors_truncated: errorLimit > 0 && unmatchedErrors.length >= errorLimit };
}

async function applyPlannedRateVendorMatches(supabase: ReturnType<typeof createClient>, plan: ReturnType<typeof planRateVendorMatches>) {
  const rows: Record<string, unknown>[] = [];
  let updated = 0;

  for (const group of plan.groups.values()) {
    for (const chunk of chunkValues(group.ids, 500)) {
      const result = await supabase
        .from("rate_staging")
        .update(group.patch)
        .in("id", chunk)
        .select("id,status,vendor_id,vendor_domain");
      if (result.error) throw result.error;
      updated += result.data?.length || 0;
      if (rows.length < 100) rows.push(...((result.data || []) as Record<string, unknown>[]).slice(0, 100 - rows.length));
    }
  }

  return { updated, rows };
}

async function matchRateVendorRows(supabase: ReturnType<typeof createClient>, user: { owner_email: string | null }, ids: string[], status: string | null = null) {
  if (!ids.length) throw new Error("At least one rate row id is required.");

  let rowQuery = supabase
    .from("rate_staging")
    .select("id,row_id,vendor_id,vendor_domain,status,raw_upload_id,rfx_id,quote_date,origin,destination,normalized_origin,normalized_destination")
    .in("id", ids)
    .limit(500);
  if (status) rowQuery = rowQuery.eq("status", status);

  const rowsResult = await rowQuery;
  if (rowsResult.error) throw rowsResult.error;

  const vendors = await fetchVendorRowsForRateMatching(supabase, user);
  const rows = await attachUploadVendorHints(supabase, (rowsResult.data || []) as Record<string, unknown>[]);
  const uploads = rows.map((row) => row.raw_upload).filter((upload) => upload && typeof upload === "object") as Record<string, unknown>[];
  const uploadPlan = planRawUploadVendorMatches(uploads, vendors);
  const uploadApplied = await applyPlannedRawUploadVendorMatches(supabase, uploadPlan);
  const plan = planRateVendorMatches(rows, vendors, { collectErrors: 1000 });
  const applied = await applyPlannedRateVendorMatches(supabase, plan);
  return {
    ...applied,
    candidates: plan.candidates,
    matchable: plan.matchable,
    unmatched_errors: plan.unmatched_errors,
    unmatched_errors_truncated: plan.unmatched_errors_truncated,
    upload_candidates: uploadPlan.candidates,
    upload_matchable: uploadPlan.matchable,
    upload_updated: uploadApplied.updated
  };
}

async function matchRateVendorRowsByFilter(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  filters: Record<string, unknown>,
  options: { dryRun?: boolean; maxRows?: number } = {}
) {
  const maxRows = Math.min(Math.max(Number(options.maxRows) || 100000, 1), 100000);
  const vendors = await fetchVendorRowsForRateMatching(supabase, user);
  const pageSize = 5000;
  let candidates = 0;
  let matchable = 0;
  let updated = 0;
  let uploadCandidates = 0;
  let uploadMatchable = 0;
  let uploadUpdated = 0;
  const sampleRows: Record<string, unknown>[] = [];
  const unmatchedErrors: Record<string, unknown>[] = [];
  let unmatchedErrorsTruncated = false;
  const filtered = await collectRateRowIdsByFilter(supabase, filters, { maxRows, pageSize });
  const ids = filtered.ids;
  const seenUploadIds = new Set<string>();

  for (const chunk of chunkValues(ids, pageSize)) {
    const rawRows = await fetchRateRowsForIds(supabase, chunk, "id,row_id,vendor_id,vendor_domain,status,raw_upload_id,rfx_id,quote_date,origin,destination,normalized_origin,normalized_destination");
    const rows = await attachUploadVendorHints(supabase, rawRows as Record<string, unknown>[]);
    const uploads = rows.map((row) => row.raw_upload).filter((upload) => upload && typeof upload === "object") as Record<string, unknown>[];
    const uploadPlan = planRawUploadVendorMatches(uploads, vendors, seenUploadIds);
    uploadCandidates += uploadPlan.candidates;
    uploadMatchable += uploadPlan.matchable;
    const remainingErrorSlots = Math.max(0, 5000 - unmatchedErrors.length);
    if (remainingErrorSlots === 0) unmatchedErrorsTruncated = true;
    const plan = planRateVendorMatches(rows as Record<string, unknown>[], vendors, { collectErrors: remainingErrorSlots });
    candidates += plan.candidates;
    matchable += plan.matchable;
    unmatchedErrors.push(...(plan.unmatched_errors || []));
    unmatchedErrorsTruncated = unmatchedErrorsTruncated || Boolean(plan.unmatched_errors_truncated);

    if (!options.dryRun) {
      const uploadApplied = await applyPlannedRawUploadVendorMatches(supabase, uploadPlan);
      uploadUpdated += uploadApplied.updated;
      const applied = await applyPlannedRateVendorMatches(supabase, plan);
      updated += applied.updated;
      if (sampleRows.length < 100) sampleRows.push(...applied.rows.slice(0, 100 - sampleRows.length));
    }
  }

  if (options.dryRun) {
    return {
      matched: filtered.database_count || ids.length,
      scanned: ids.length,
      candidates,
      matchable,
      upload_candidates: uploadCandidates,
      upload_matchable: uploadMatchable,
      upload_updated: 0,
      unmatched_errors: unmatchedErrors,
      unmatched_errors_truncated: unmatchedErrorsTruncated,
      updated: 0,
      rows: [],
      database_count: filtered.database_count || ids.length,
      hard_limit_reached: filtered.hard_limit_reached,
      max_rows: maxRows
    };
  }

  return {
    matched: filtered.database_count || ids.length,
    scanned: ids.length,
    candidates,
    matchable,
    upload_candidates: uploadCandidates,
    upload_matchable: uploadMatchable,
    upload_updated: uploadUpdated,
    unmatched_errors: unmatchedErrors,
    unmatched_errors_truncated: unmatchedErrorsTruncated,
    updated,
    rows: sampleRows,
    database_count: filtered.database_count || ids.length,
    hard_limit_reached: filtered.hard_limit_reached,
    max_rows: maxRows
  };
}

async function renormalizeRateRows(supabase: ReturnType<typeof createClient>, ids: string[], status: string | null = null) {
  if (!ids.length) throw new Error("At least one rate row id is required.");

  let rowQuery = supabase.from("rate_staging").select("*").in("id", ids).limit(500);
  if (status) rowQuery = rowQuery.eq("status", status);

  const [rowsResult, catalogResult] = await Promise.all([
    rowQuery,
    supabase
      .from("rateware_catalog_items")
      .select("source,category,raw_value,normalized_value,code")
      .eq("active", true)
      .limit(10000)
  ]);

  for (const result of [rowsResult, catalogResult]) {
    if (result.error) throw result.error;
  }

  const scopedRows = (rowsResult.data || []).map((row) => ({ mapped: row }));
  const [locations, mileageRows] = await Promise.all([
    fetchScopedTemplateLocations(supabase, scopedRows),
    fetchScopedTemplateMileage(supabase, scopedRows)
  ]);

  const catalog = buildCatalogIndex(catalogResult.data || []);
  const locationIndex = buildLocationIndex(locations);
  const mileage = new Map(mileageRows.map((lane) => [catalogKey(lane.route_key), lane]));

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

async function saveRatewareLocationAlias(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  body: Record<string, unknown>
) {
  const alias = cleanText(body.alias);
  const targetLocationId = cleanText(body.target_location_id);
  if (!alias) throw new Error("Alias text is required.");
  if (!targetLocationId) throw new Error("A target catalog location is required.");

  const targetResult = await supabase
    .from("rateware_locations")
    .select("*")
    .eq("id", targetLocationId)
    .eq("active", true)
    .single();
  if (targetResult.error) throw targetResult.error;

  const target = targetResult.data || {};
  const country = ["US", "CA", "MX", "UNKNOWN"].includes(String(target.country || "").toUpperCase())
    ? String(target.country || "").toUpperCase()
    : "UNKNOWN";
  const locationKey = catalogKey([
    alias,
    country,
    target.state_code || target.state_name,
    target.market || target.region
  ].filter(Boolean).join(" "));

  const aliasRow = {
    source: "rateware_manual_catalog",
    country,
    location_key: locationKey,
    raw_value: alias,
    zip_prefix: cleanText(target.zip_prefix),
    city: cleanText(target.city || target.metro_city || alias),
    state_code: cleanText(target.state_code),
    state_name: cleanText(target.state_name),
    metro_city: cleanText(target.metro_city || target.city || alias),
    market: cleanText(target.market),
    region: cleanText(target.region),
    metadata: {
      reason: "user_saved_alias",
      owner_email: user.owner_email,
      target_location_id: target.id,
      target_raw_value: target.raw_value,
      target_source: target.source
    },
    active: true,
    updated_at: new Date().toISOString()
  };

  const result = await supabase
    .from("rateware_locations")
    .upsert(aliasRow, { onConflict: "source,location_key" })
    .select("id,source,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region")
    .single();
  if (result.error) throw result.error;

  await writeAuditLog(supabase, user, "catalog.location_alias", "rateware_locations", String(result.data.id), `Saved location alias "${alias}"`, {
    target_location_id: targetLocationId,
    country,
    market: aliasRow.market,
    region: aliasRow.region
  });

  return { location: locationOptionPayload(result.data) };
}

function normalizeLocationCatalogInput(input: Record<string, unknown>, user: { owner_email: string | null }) {
  const countryInput = cleanText(input.country)?.toUpperCase() || "UNKNOWN";
  const country = ["US", "CA", "MX", "UNKNOWN"].includes(countryInput) ? countryInput : "UNKNOWN";
  const zipPrefix = cleanText(input.zip_prefix || input.zipPrefix);
  const rawValue = cleanText(input.raw_value || input.rawValue || input.value)
    || [cleanText(input.city || input.metro_city), cleanText(input.state_code || input.state_name), zipPrefix].filter(Boolean).join(", ");
  if (!rawValue) throw new Error("Location value is required.");

  const stateCode = cleanText(input.state_code || input.stateCode)?.toUpperCase() || null;
  const stateName = cleanText(input.state_name || input.stateName);
  const city = cleanText(input.city || input.metro_city || input.metroCity || rawValue);
  const metroCity = cleanText(input.metro_city || input.metroCity || city || rawValue);
  const market = cleanText(input.market);
  const region = cleanText(input.region);
  const locationKey = catalogKey([
    rawValue,
    zipPrefix,
    stateCode || stateName,
    country
  ].filter(Boolean).join(" "));

  return {
    row: {
      source: "rateware_manual_catalog",
      country,
      location_key: locationKey,
      raw_value: rawValue,
      zip_prefix: zipPrefix,
      city,
      state_code: stateCode,
      state_name: stateName,
      metro_city: metroCity,
      market,
      region,
      metadata: {
        owner_email: user.owner_email,
        owner_user_id: (user as Record<string, unknown>).owner_user_id || null,
        note: cleanText(input.note),
        created_from: "admin_catalogs"
      },
      active: true,
      updated_at: new Date().toISOString()
    },
    summary: {
      raw_value: rawValue,
      country,
      zip_prefix: zipPrefix,
      state_code: stateCode,
      market,
      region
    }
  };
}

function normalizeOperationalCatalogImportRow(input: Record<string, unknown>, user: { owner_email: string | null }, context: Record<string, unknown> = {}) {
  const category = cleanText(input.category);
  const rawValue = cleanText(input.raw_value || input.rawValue || input.value);
  const normalizedValue = cleanText(input.normalized_value || input.normalizedValue || rawValue);
  if (!category || !MANAGED_CATALOG_CATEGORIES.has(category)) throw new Error("invalid category");
  if (!rawValue || !normalizedValue) throw new Error("missing value");
  const code = cleanText(input.code) || catalogCode(normalizedValue);
  return {
    source: "rateware_manual_catalog",
    category,
    raw_value: rawValue,
    normalized_value: normalizedValue,
    code,
    metadata: {
      owner_email: user.owner_email,
      owner_user_id: (user as Record<string, unknown>).owner_user_id || null,
      note: cleanText(input.note),
      import_file_name: cleanText(context.file_name),
      import_sheet_name: cleanText(context.sheet_name),
      created_from: "admin_catalog_import"
    },
    active: true,
    updated_at: new Date().toISOString()
  };
}

async function bulkImportCatalogValues(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  body: Record<string, unknown>
) {
  const importType = cleanText(body.import_type || body.importType) || "locations";
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
  if (!rows.length) throw new Error("No catalog rows were provided.");
  const context = {
    file_name: cleanText(body.file_name || body.fileName),
    sheet_name: cleanText(body.sheet_name || body.sheetName)
  };
  const warnings: string[] = [];
  const normalizedRows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const [index, item] of rows.entries()) {
    const input = item && typeof item === "object" ? item as Record<string, unknown> : {};
    try {
      if (importType === "operational") {
        normalizedRows.push(normalizeOperationalCatalogImportRow(input, user, context));
      } else if (importType === "locations") {
        const normalized = normalizeLocationCatalogInput({ ...input, ...context }, user);
        normalized.row.metadata = {
          ...(typeof normalized.row.metadata === "object" && normalized.row.metadata ? normalized.row.metadata as Record<string, unknown> : {}),
          import_file_name: context.file_name,
          import_sheet_name: context.sheet_name,
          created_from: "admin_catalog_import"
        };
        normalizedRows.push(normalized.row);
      } else {
        throw new Error("invalid catalog import type");
      }
    } catch (error) {
      skipped += 1;
      if (warnings.length < 20) warnings.push(`Row ${index + 1}: ${error instanceof Error ? error.message : "invalid row"}.`);
    }
  }

  if (!normalizedRows.length) {
    throw new Error(warnings[0] || "No usable catalog rows were found.");
  }

  let imported = 0;
  const table = importType === "operational" ? "rateware_catalog_items" : "rateware_locations";
  const conflict = importType === "operational" ? "source,category,raw_value,normalized_value" : "source,location_key";
  for (const batch of chunkValues(normalizedRows, 500)) {
    const result = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflict })
      .select("id");
    if (result.error) throw result.error;
    imported += result.data?.length || 0;
  }

  await writeAuditLog(
    supabase,
    user,
    importType === "operational" ? "catalog.values.bulk_import" : "catalog.locations.bulk_import",
    table,
    null,
    `Imported ${imported} ${importType === "operational" ? "catalog value" : "location catalog"} row(s)`,
    { imported, skipped, file_name: context.file_name, sheet_name: context.sheet_name }
  );

  return { imported, skipped, warnings };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabase = getClient();
    const user = await resolveCanonicalUser(supabase, userContext(await requireKindeUser(request)));
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

    if (body.action === "vendor_intelligence") {
      const result = await buildVendorIntelligence(supabase, user, body.options || body);
      return jsonResponse(result);
    }

    if (body.action === "vendor_funnel") {
      const result = await buildVendorFunnel(supabase, user);
      return jsonResponse(result);
    }

    if (body.action === "apply_vendor_intelligence_tags") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });

      const intelligence = await buildVendorIntelligence(supabase, user, { ids });
      const byId = new Map((intelligence.rows || []).map((row: Record<string, unknown>) => [row.vendor_id, row]));
      const current = await supabase.from("vendors").select("id,tags").eq("owner_email", user.owner_email).in("id", ids);
      if (current.error) throw current.error;

      const updates = await Promise.all(
        (current.data || []).map((vendor) => {
          const insight = byId.get(vendor.id) as Record<string, unknown> | undefined;
          const suggested = arrayValues(insight?.suggested_tags);
          const mergedTags = Array.from(new Set([...normalizeTags(vendor.tags), ...suggested]));
          return supabase
            .from("vendors")
            .update({ tags: mergedTags, updated_at: new Date().toISOString() })
            .eq("owner_email", user.owner_email)
            .eq("id", vendor.id)
            .select()
            .single();
        })
      );

      for (const update of updates) {
        if (update.error) throw update.error;
      }

      return jsonResponse({ updated: updates.length, rows: updates.map((update) => update.data) });
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

    if (body.action === "business_intelligence_geo_density") {
      const result = await buildBusinessIntelligenceGeoDensityFromDb(supabase, user, body.config || {});
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

      const patchInput = objectRecord(body.patch);
      const addTags = normalizeTags(patchInput.add_tags);
      const current = await supabase.from("vendors").select("*").eq("owner_email", user.owner_email).in("id", ids);
      if (current.error) throw current.error;

      const updates = await Promise.all(
        (current.data || []).map((vendor) => {
          const patch = normalizeVendorPatch(patchInput, vendor || {});
          if (addTags.length) {
            patch.tags = Array.from(new Set([...normalizeTags(vendor.tags), ...addTags]));
          }
          return supabase
            .from("vendors")
            .update(patch)
            .eq("owner_email", user.owner_email)
            .eq("id", vendor.id)
            .select()
            .single();
        })
      );

      for (const update of updates) {
        if (update.error) throw update.error;
      }

      return jsonResponse({ updated: updates.length, rows: updates.map((update) => update.data) });
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
      const current = await supabase.from("vendors").select("*").eq("owner_email", user.owner_email).eq("id", body.id).single();
      if (current.error) throw current.error;
      const patch = normalizeVendorPatch(body.patch || {}, current.data || {});
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

    if (body.action === "list_rfx_events") {
      const eventsResult = await supabase
        .from("rfx_events")
        .select("*")
        .eq("owner_email", user.owner_email)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(100);
      if (eventsResult.error) throw eventsResult.error;

      const eventIds = (eventsResult.data || []).map((event) => event.id);
      const [lanesResult, invitationsResult] = eventIds.length
        ? await Promise.all([
            supabase.from("rfx_lanes").select("id,rfx_event_id").in("rfx_event_id", eventIds),
            supabase.from("rfx_lane_vendors").select("id,rfx_event_id,invitation_status,bid_rate").in("rfx_event_id", eventIds)
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (lanesResult.error) throw lanesResult.error;
      if (invitationsResult.error) throw invitationsResult.error;

      const laneCounts = new Map<string, number>();
      for (const lane of lanesResult.data || []) laneCounts.set(lane.rfx_event_id, (laneCounts.get(lane.rfx_event_id) || 0) + 1);
      const invitationCounts = new Map<string, number>();
      const bidCounts = new Map<string, number>();
      for (const invite of invitationsResult.data || []) {
        invitationCounts.set(invite.rfx_event_id, (invitationCounts.get(invite.rfx_event_id) || 0) + 1);
        if (invite.invitation_status === "bid_submitted" || invite.bid_rate !== null) {
          bidCounts.set(invite.rfx_event_id, (bidCounts.get(invite.rfx_event_id) || 0) + 1);
        }
      }

      return jsonResponse({
        rows: (eventsResult.data || []).map((event) => ({
          ...event,
          lane_count: laneCounts.get(event.id) || 0,
          invitation_count: invitationCounts.get(event.id) || 0,
          bid_count: bidCounts.get(event.id) || 0
        }))
      });
    }

    if (body.action === "create_rfx_event") {
      const row = withOwner(normalizeRfxEvent(body.event || body), user);
      const result = await supabase.from("rfx_events").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "update_rfx_event") {
      const eventId = cleanText(body.id || body.event_id);
      if (!eventId) return jsonResponse({ error: "RFx event id is required." }, 400);
      const patch = normalizeRfxEventPatch(body.patch || body.event || {});
      const result = await supabase
        .from("rfx_events")
        .update(patch)
        .eq("id", eventId)
        .eq("owner_email", user.owner_email)
        .select()
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "import_rfx_lanes") {
      const event = await requireOwnedRfxEvent(supabase, user, body.event_id);
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 1000) : [];
      if (!rows.length) return jsonResponse({ inserted: 0, rows: [] });
      const laneRows = rows
        .map((row: Record<string, unknown>, index: number) => ({
          ...normalizeRfxLane(row, index),
          rfx_event_id: event.id
        }))
        .filter((row) => row.origin || row.destination);
      if (!laneRows.length) return jsonResponse({ inserted: 0, rows: [] });
      const result = await supabase
        .from("rfx_lanes")
        .insert(laneRows)
        .select()
        .order("lane_number", { ascending: true });
      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "list_rfx_detail") {
      const event = await requireOwnedRfxEvent(supabase, user, body.event_id || body.id);
      const [lanesResult, invitationsResult, rates] = await Promise.all([
        supabase
          .from("rfx_lanes")
          .select("*")
          .eq("rfx_event_id", event.id)
          .order("lane_number", { ascending: true }),
        supabase
          .from("rfx_lane_vendors")
          .select("*, vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,base_stage,status,tags,coverage_notes)")
          .eq("rfx_event_id", event.id)
          .order("created_at", { ascending: true }),
        fetchApprovedRateRows(supabase)
      ]);
      if (lanesResult.error) throw lanesResult.error;
      if (invitationsResult.error) throw invitationsResult.error;

      const invitationsByLane = new Map<string, Record<string, unknown>[]>();
      for (const invitation of invitationsResult.data || []) {
        const bucket = invitationsByLane.get(invitation.rfx_lane_id) || [];
        bucket.push(invitation);
        invitationsByLane.set(invitation.rfx_lane_id, bucket);
      }

      const lanes = (lanesResult.data || []).map((lane) => {
        const benchmark = bestRatewareBenchmark(lane, rates);
        const invitations = (invitationsByLane.get(lane.id) || []).map((invitation) => invitationWithComparison(invitation, benchmark));
        return {
          ...lane,
          benchmark,
          invitations,
          invitation_count: invitations.length,
          bid_count: invitations.filter((invitation) => invitation.bid_rate !== null || invitation.invitation_status === "bid_submitted").length
        };
      });

      return jsonResponse({ event, lanes });
    }

    if (body.action === "auto_shortlist_rfx_lane") {
      const lane = await requireOwnedRfxLane(supabase, user, body.lane_id);
      const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
      const [vendorsResult, rates] = await Promise.all([
        supabase
          .from("vendors")
          .select("id,vendor_name,domain,primary_email,secondary_emails,whatsapp_phone,preferred_channel,base_stage,status,tags,coverage_notes,notes")
          .eq("owner_email", user.owner_email)
          .neq("base_stage", "archived")
          .limit(1000),
        fetchApprovedRateRows(supabase)
      ]);
      if (vendorsResult.error) throw vendorsResult.error;
      const ranked = (vendorsResult.data || [])
        .map((vendor) => scoreVendorForLane(vendor, lane, rates))
        .filter((row) => Number(row.fit_score || 0) >= 35)
        .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0))
        .slice(0, limit);
      if (!ranked.length) return jsonResponse({ inserted: 0, rows: [], recommendations: [] });

      const insertRows = ranked.map((row) => ({
        rfx_event_id: lane.rfx_event_id,
        rfx_lane_id: lane.id,
        vendor_id: row.vendor_id,
        invitation_status: "shortlisted",
        invitation_token: randomToken(),
        notes: [`Fit score ${row.fit_score}`, ...(row.evidence || [])].join("; ")
      }));
      const result = await supabase
        .from("rfx_lane_vendors")
        .upsert(insertRows, { onConflict: "rfx_lane_id,vendor_id", ignoreDuplicates: true })
        .select("*, vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,base_stage,status,tags,coverage_notes)");
      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data?.length || 0, rows: result.data || [], recommendations: ranked });
    }

    if (body.action === "shortlist_rfx_lane_vendors") {
      const lane = await requireOwnedRfxLane(supabase, user, body.lane_id);
      const vendorIds = Array.isArray(body.vendor_ids) ? body.vendor_ids.map(String).filter(Boolean).slice(0, 200) : [];
      if (!vendorIds.length) return jsonResponse({ inserted: 0, rows: [] });
      const vendorsResult = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_email", user.owner_email)
        .in("id", vendorIds);
      if (vendorsResult.error) throw vendorsResult.error;
      const insertRows = (vendorsResult.data || []).map((vendor) => ({
        rfx_event_id: lane.rfx_event_id,
        rfx_lane_id: lane.id,
        vendor_id: vendor.id,
        invitation_status: "shortlisted",
        invitation_token: randomToken()
      }));
      const result = await supabase
        .from("rfx_lane_vendors")
        .upsert(insertRows, { onConflict: "rfx_lane_id,vendor_id", ignoreDuplicates: true })
        .select("*, vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,base_stage,status,tags,coverage_notes)");
      if (result.error) throw result.error;
      return jsonResponse({ inserted: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "invite_rfx_lane_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });
      const ownedResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,rfx_events!inner(owner_email)")
        .in("id", ids)
        .eq("rfx_events.owner_email", user.owner_email);
      if (ownedResult.error) throw ownedResult.error;
      const ownedIds = (ownedResult.data || []).map((row) => row.id);
      if (!ownedIds.length) return jsonResponse({ updated: 0, rows: [] });
      const result = await supabase
        .from("rfx_lane_vendors")
        .update({ invitation_status: "invited", invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in("id", ownedIds)
        .select("*, vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,base_stage,status)");
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "update_rfx_bid") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "RFx invitation id is required." }, 400);
      const ownedResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,rfx_events!inner(owner_email)")
        .eq("id", id)
        .eq("rfx_events.owner_email", user.owner_email)
        .single();
      if (ownedResult.error) throw ownedResult.error;
      const patchInput = body.patch || {};
      const patch = {
        bid_rate: cleanNumber(patchInput.bid_rate),
        currency: cleanText(patchInput.currency)?.toUpperCase() || "USD",
        weekly_capacity: cleanNumber(patchInput.weekly_capacity),
        transit_days: cleanNumber(patchInput.transit_days),
        notes: cleanText(patchInput.notes),
        invitation_status: cleanNumber(patchInput.bid_rate) !== null ? "bid_submitted" : cleanText(patchInput.invitation_status) || "shortlisted",
        responded_at: cleanNumber(patchInput.bid_rate) !== null ? new Date().toISOString() : null,
        response_source: "rateware_admin",
        updated_at: new Date().toISOString()
      };
      const result = await supabase
        .from("rfx_lane_vendors")
        .update(patch)
        .eq("id", id)
        .select("*, vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,base_stage,status)")
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "archive_rfx_lane_vendors") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });
      const ownedResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,rfx_events!inner(owner_email)")
        .in("id", ids)
        .eq("rfx_events.owner_email", user.owner_email);
      if (ownedResult.error) throw ownedResult.error;
      const ownedIds = (ownedResult.data || []).map((row) => row.id);
      if (!ownedIds.length) return jsonResponse({ updated: 0, rows: [] });
      const result = await supabase
        .from("rfx_lane_vendors")
        .update({ invitation_status: "archived", updated_at: new Date().toISOString() })
        .in("id", ownedIds)
        .select("id");
      if (result.error) throw result.error;
      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "list_outreach_templates") {
      const [globalResult, ownedResult] = await Promise.all([
        supabase
          .from("outreach_templates")
          .select("*")
          .is("owner_email", null)
          .eq("active", true)
          .order("is_default", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("outreach_templates")
          .select("*")
          .eq("owner_email", user.owner_email)
          .order("created_at", { ascending: false })
      ]);
      if (globalResult.error) throw globalResult.error;
      if (ownedResult.error) throw ownedResult.error;
      return jsonResponse({ rows: [...(ownedResult.data || []), ...(globalResult.data || [])] });
    }

    if (body.action === "create_outreach_template") {
      const row = withOwner(normalizeOutreachTemplate(body.template || {}), user);
      const result = await supabase.from("outreach_templates").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "update_outreach_template") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "Template id is required." }, 400);
      const patch = normalizeOutreachTemplate(body.patch || body.template || {});
      const result = await supabase
        .from("outreach_templates")
        .update(patch)
        .eq("id", id)
        .eq("owner_email", user.owner_email)
        .select()
        .single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "list_outreach_campaigns") {
      const campaignsResult = await supabase
        .from("outreach_campaigns")
        .select("*, rfx_events(rfx_id,name,customer,status), outreach_templates(name,channel)")
        .eq("owner_email", user.owner_email)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(100);
      if (campaignsResult.error) throw campaignsResult.error;
      const campaignIds = (campaignsResult.data || []).map((campaign) => campaign.id);
      const messagesResult = campaignIds.length
        ? await supabase
            .from("outreach_messages")
            .select("id,campaign_id,status,channel")
            .in("campaign_id", campaignIds)
        : { data: [], error: null };
      if (messagesResult.error) throw messagesResult.error;
      const counts = new Map<string, { messages: number; sent: number; email: number; whatsapp: number }>();
      for (const message of messagesResult.data || []) {
        const bucket = counts.get(message.campaign_id) || { messages: 0, sent: 0, email: 0, whatsapp: 0 };
        bucket.messages += 1;
        if (message.status === "sent") bucket.sent += 1;
        if (message.channel === "email") bucket.email += 1;
        if (message.channel === "whatsapp") bucket.whatsapp += 1;
        counts.set(message.campaign_id, bucket);
      }
      return jsonResponse({
        rows: (campaignsResult.data || []).map((campaign) => ({
          ...campaign,
          message_count: counts.get(campaign.id)?.messages || 0,
          sent_count: counts.get(campaign.id)?.sent || 0,
          email_count: counts.get(campaign.id)?.email || 0,
          whatsapp_count: counts.get(campaign.id)?.whatsapp || 0
        }))
      });
    }

    if (body.action === "create_outreach_campaign") {
      const normalized = normalizeOutreachCampaign(body.campaign || {});
      if (normalized.rfx_event_id) await requireOwnedRfxEvent(supabase, user, normalized.rfx_event_id);
      if (normalized.template_id) await fetchOutreachTemplate(supabase, user, normalized.template_id);
      const row = withOwner(normalized, user);
      const result = await supabase.from("outreach_campaigns").insert(row).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "generate_outreach_drafts") {
      const campaign = await requireOwnedOutreachCampaign(supabase, user, body.campaign_id);
      const template = await fetchOutreachTemplate(supabase, user, body.template_id || campaign.template_id);
      const invitationIds = Array.isArray(body.invitation_ids) ? body.invitation_ids.map(String).filter(Boolean).slice(0, 1000) : [];
      const appOrigin = cleanText(body.app_origin) || Deno.env.get("RATEWARE_APP_URL") || "https://rateware.vercel.app";

      let invitationQuery = supabase
        .from("rfx_lane_vendors")
        .select(`
          *,
          vendors(id,vendor_name,domain,primary_email,whatsapp_phone,preferred_channel,contact_name),
          rfx_events!inner(id,owner_email,rfx_id,name,customer,status,due_date),
          rfx_lanes(*)
        `)
        .eq("rfx_events.owner_email", user.owner_email)
        .neq("invitation_status", "archived")
        .limit(1000);
      if (campaign.rfx_event_id) invitationQuery = invitationQuery.eq("rfx_event_id", campaign.rfx_event_id);
      if (invitationIds.length) invitationQuery = invitationQuery.in("id", invitationIds);

      const invitationsResult = await invitationQuery;
      if (invitationsResult.error) throw invitationsResult.error;

      const rows: Record<string, unknown>[] = [];
      const skipped: Record<string, unknown>[] = [];
      for (const invitation of invitationsResult.data || []) {
        const vendor = typeof invitation.vendors === "object" && invitation.vendors ? invitation.vendors as Record<string, unknown> : {};
        const context = outreachContext(invitation, appOrigin);
        const subject = renderTemplateText(template.subject || campaign.name, context);
        const htmlBody = renderTemplateText(template.html_body || template.whatsapp_body || "", context);
        const textBody = htmlToText(htmlBody);
        const whatsappText = renderTemplateText(template.whatsapp_body || textBody, context);
        const channels = messageChannels(campaign.channel || template.channel);

        if (channels.includes("email")) {
          const recipientEmail = cleanText(vendor.primary_email);
          if (recipientEmail) {
            rows.push(withOwner({
              campaign_id: campaign.id,
              template_id: template.id,
              rfx_event_id: invitation.rfx_event_id,
              rfx_lane_id: invitation.rfx_lane_id,
              rfx_lane_vendor_id: invitation.id,
              vendor_id: invitation.vendor_id,
              channel: "email",
              recipient_email: recipientEmail,
              subject,
              html_body: htmlBody,
              text_body: textBody,
              gmail_compose_url: gmailComposeUrl(recipientEmail, subject, textBody),
              status: "drafted",
              metadata: { bid_link: context.bid_link, generated_at: new Date().toISOString() }
            }, user));
          } else {
            skipped.push({ invitation_id: invitation.id, channel: "email", reason: "Missing vendor email" });
          }
        }

        if (channels.includes("whatsapp")) {
          const recipientPhone = cleanText(vendor.whatsapp_phone);
          if (phoneForWhatsapp(recipientPhone)) {
            rows.push(withOwner({
              campaign_id: campaign.id,
              template_id: template.id,
              rfx_event_id: invitation.rfx_event_id,
              rfx_lane_id: invitation.rfx_lane_id,
              rfx_lane_vendor_id: invitation.id,
              vendor_id: invitation.vendor_id,
              channel: "whatsapp",
              recipient_phone: recipientPhone,
              whatsapp_text: whatsappText,
              text_body: whatsappText,
              whatsapp_url: whatsappDraftUrl(recipientPhone, whatsappText),
              status: "drafted",
              metadata: { bid_link: context.bid_link, generated_at: new Date().toISOString() }
            }, user));
          } else {
            skipped.push({ invitation_id: invitation.id, channel: "whatsapp", reason: "Missing WhatsApp phone" });
          }
        }
      }

      if (!rows.length) return jsonResponse({ generated: 0, rows: [], skipped });

      const result = await supabase
        .from("outreach_messages")
        .upsert(rows, { onConflict: "campaign_id,rfx_lane_vendor_id,channel" })
        .select("*, vendors(vendor_name,domain,primary_email,whatsapp_phone), rfx_events(rfx_id,name), rfx_lanes(origin,destination,equipment,trailer,operation,service)");
      if (result.error) throw result.error;

      const historyRows = (result.data || []).map((message) => withOwner({
        outreach_message_id: message.id,
        campaign_id: campaign.id,
        vendor_id: message.vendor_id,
        rfx_event_id: message.rfx_event_id,
        channel: message.channel,
        direction: "outbound",
        status: "drafted",
        subject: message.subject,
        body_preview: contactPreview(message.text_body || message.whatsapp_text || message.html_body),
        metadata: { generated_from: "outreach_engine" }
      }, user));
      if (historyRows.length) {
        const history = await supabase.from("contact_history").insert(historyRows);
        if (history.error) throw history.error;
      }

      const campaignUpdate = await supabase
        .from("outreach_campaigns")
        .update({ status: "generated", updated_at: new Date().toISOString() })
        .eq("id", campaign.id)
        .eq("owner_email", user.owner_email);
      if (campaignUpdate.error) throw campaignUpdate.error;

      return jsonResponse({ generated: result.data?.length || 0, rows: result.data || [], skipped });
    }

    if (body.action === "list_outreach_messages") {
      let query = supabase
        .from("outreach_messages")
        .select("*, vendors(vendor_name,domain,primary_email,whatsapp_phone), rfx_events(rfx_id,name), rfx_lanes(origin,destination,equipment,trailer,operation,service)")
        .eq("owner_email", user.owner_email)
        .order("created_at", { ascending: false })
        .limit(500);
      if (body.campaign_id) query = query.eq("campaign_id", body.campaign_id);
      if (body.rfx_event_id) query = query.eq("rfx_event_id", body.rfx_event_id);
      if (body.status) query = query.eq("status", body.status);
      if (body.channel) query = query.eq("channel", body.channel);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "mark_outreach_messages") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      const status = cleanText(body.status)?.toLowerCase();
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });
      if (!status || !["drafted", "queued", "sent", "replied", "failed", "archived"].includes(status)) {
        return jsonResponse({ error: "Valid message status is required." }, 400);
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status, updated_at: now };
      if (status === "sent") {
        patch.sent_at = now;
        patch.last_contacted_at = now;
      }
      const result = await supabase
        .from("outreach_messages")
        .update(patch)
        .eq("owner_email", user.owner_email)
        .in("id", ids)
        .select("*");
      if (result.error) throw result.error;

      const historyRows = (result.data || []).map((message) => withOwner({
        outreach_message_id: message.id,
        campaign_id: message.campaign_id,
        vendor_id: message.vendor_id,
        rfx_event_id: message.rfx_event_id,
        channel: message.channel,
        direction: status === "replied" ? "inbound" : "outbound",
        status,
        subject: message.subject,
        body_preview: contactPreview(message.text_body || message.whatsapp_text || message.html_body),
        metadata: { marked_from: "outreach_engine" }
      }, user));
      if (historyRows.length) {
        const history = await supabase.from("contact_history").insert(historyRows);
        if (history.error) throw history.error;
      }

      const linkedInvitationIds = [...new Set((result.data || [])
        .map((message) => cleanText(message.rfx_lane_vendor_id))
        .filter(Boolean))];
      if (linkedInvitationIds.length && ["sent", "replied"].includes(status)) {
        const invitationPatch: Record<string, unknown> = {
          invitation_status: status === "sent" ? "invited" : "viewed",
          updated_at: now
        };
        if (status === "sent") invitationPatch.invited_at = now;
        if (status === "replied") invitationPatch.viewed_at = now;
        const invitationUpdate = await supabase
          .from("rfx_lane_vendors")
          .update(invitationPatch)
          .in("id", linkedInvitationIds)
          .not("invitation_status", "in", "(bid_submitted,awarded,archived)");
        if (invitationUpdate.error) throw invitationUpdate.error;
      }

      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
    }

    if (body.action === "list_contact_history") {
      let query = supabase
        .from("contact_history")
        .select("*, vendors(vendor_name,domain,primary_email), outreach_campaigns(name), rfx_events(rfx_id,name)")
        .eq("owner_email", user.owner_email)
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (body.vendor_id) query = query.eq("vendor_id", body.vendor_id);
      if (body.campaign_id) query = query.eq("campaign_id", body.campaign_id);
      if (body.rfx_event_id) query = query.eq("rfx_event_id", body.rfx_event_id);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "get_saas_settings") {
      const settings = await buildSaasSettings(supabase, user);
      return jsonResponse(settings);
    }

    if (body.action === "update_saas_profile") {
      const patch = normalizeSaasProfile(body.profile || body.patch || {});
      const current = await ensureSaasProfile(supabase, user);
      const result = await supabase
        .from("user_profiles")
        .update(patch)
        .eq("owner_email", user.owner_email)
        .select()
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(supabase, user, "settings.profile.update", "user_profile", current.id, "Updated user profile", { changed_fields: Object.keys(patch) });
      return jsonResponse({ profile: result.data });
    }

    if (body.action === "update_saas_organization") {
      const patch = normalizeOrganization(body.organization || body.patch || {});
      const current = await ensureOrganization(supabase, user);
      const result = await supabase
        .from("organizations")
        .update(patch)
        .eq("owner_email", user.owner_email)
        .select()
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(supabase, user, "settings.organization.update", "organization", current.id, "Updated organization profile", { changed_fields: Object.keys(patch) });
      return jsonResponse({ organization: result.data });
    }

    if (body.action === "update_onboarding_task") {
      const taskKey = cleanText(body.task_key);
      if (!taskKey) return jsonResponse({ error: "Onboarding task key is required." }, 400);
      const completed = body.completed === undefined ? true : cleanBoolean(body.completed);
      const row = withOwner({
        task_key: taskKey,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        notes: cleanText(body.notes),
        updated_at: new Date().toISOString()
      }, user);
      const result = await supabase
        .from("onboarding_checklist")
        .upsert(row, { onConflict: "owner_email,task_key" })
        .select()
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(
        supabase,
        user,
        completed ? "onboarding.task.complete" : "onboarding.task.reopen",
        "onboarding_task",
        taskKey,
        `${completed ? "Completed" : "Reopened"} onboarding task ${taskKey}`,
        { task_key: taskKey }
      );
      const settings = await buildSaasSettings(supabase, user);
      return jsonResponse({ row: result.data, onboarding: settings.onboarding, audit: settings.audit });
    }

    if (body.action === "list_saas_audit_log") {
      let query = supabase
        .from("saas_audit_log")
        .select("*")
        .eq("owner_email", user.owner_email)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(body.limit) || 100, 1), 300));
      if (body.action_filter) query = query.eq("action", body.action_filter);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "list_catalog_values") {
      const category = cleanText(body.category);
      let query = supabase
        .from("rateware_catalog_items")
        .select("id,source,category,raw_value,normalized_value,code,metadata,active,updated_at")
        .order("category", { ascending: true })
        .order("normalized_value", { ascending: true })
        .limit(5000);
      if (category && MANAGED_CATALOG_CATEGORIES.has(category)) query = query.eq("category", category);
      const result = await query;
      if (result.error) throw result.error;

      const rows = (result.data || [])
        .filter((item) => MANAGED_CATALOG_CATEGORIES.has(String(item.category)))
        .filter((item) => isManualCatalogOwnedBy(item, user))
        .map((item) => ({
          ...item,
          is_manual: item.source === "rateware_manual_catalog",
          can_archive: item.source === "rateware_manual_catalog" && item.active === true
        }));
      return jsonResponse({ rows });
    }

    if (body.action === "save_catalog_value") {
      const input = objectRecord(body.catalog_value || body);
      const category = cleanText(input.category);
      const rawValue = cleanText(input.raw_value || input.rawValue || input.value);
      const normalizedValue = cleanText(input.normalized_value || input.normalizedValue || rawValue);
      if (!category || !MANAGED_CATALOG_CATEGORIES.has(category)) {
        return jsonResponse({ error: "Choose a valid catalog category." }, 400);
      }
      if (!rawValue || !normalizedValue) {
        return jsonResponse({ error: "Catalog value and normalized value are required." }, 400);
      }
      const code = cleanText(input.code) || catalogCode(normalizedValue);
      const metadata = {
        owner_email: user.owner_email,
        owner_user_id: user.owner_user_id,
        note: cleanText(input.note),
        created_from: "settings_catalog_manager"
      };
      const row = {
        source: "rateware_manual_catalog",
        category,
        raw_value: rawValue,
        normalized_value: normalizedValue,
        code,
        metadata,
        active: true,
        updated_at: new Date().toISOString()
      };
      const result = await supabase
        .from("rateware_catalog_items")
        .upsert(row, { onConflict: "source,category,raw_value,normalized_value" })
        .select("id,source,category,raw_value,normalized_value,code,metadata,active,updated_at")
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(
        supabase,
        user,
        "catalog.value.save",
        "rateware_catalog_items",
        result.data.id,
        `Saved ${category} catalog value "${normalizedValue}"`,
        { category, raw_value: rawValue, normalized_value: normalizedValue, code }
      );
      return jsonResponse({ row: result.data });
    }

    if (body.action === "archive_catalog_value") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "Catalog value id is required." }, 400);
      const current = await supabase
        .from("rateware_catalog_items")
        .select("id,source,category,raw_value,normalized_value,metadata,active")
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return jsonResponse({ error: "Catalog value was not found." }, 404);
      if (current.data.source !== "rateware_manual_catalog") {
        return jsonResponse({ error: "Only manual catalog values can be archived from Admin Catalogs." }, 400);
      }
      if (!isManualCatalogOwnedBy(current.data, user)) {
        return jsonResponse({ error: "This manual catalog value belongs to another workspace." }, 403);
      }
      const result = await supabase
        .from("rateware_catalog_items")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,source,category,raw_value,normalized_value,code,metadata,active,updated_at")
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(
        supabase,
        user,
        "catalog.value.archive",
        "rateware_catalog_items",
        id,
        `Archived ${current.data.category} catalog value "${current.data.normalized_value}"`,
        { category: current.data.category, raw_value: current.data.raw_value, normalized_value: current.data.normalized_value }
      );
      return jsonResponse({ row: result.data });
    }

    if (body.action === "list_location_catalog_values") {
      const country = cleanText(body.country)?.toUpperCase();
      const activeOnly = body.active === undefined ? true : cleanBoolean(body.active);
      let query = supabase
        .from("rateware_locations")
        .select("id,source,country,location_key,raw_value,zip_prefix,city,state_code,state_name,metro_city,market,region,metadata,active,updated_at")
        .order("country", { ascending: true })
        .order("market", { ascending: true })
        .order("raw_value", { ascending: true })
        .limit(10000);
      if (activeOnly) query = query.eq("active", true);
      if (country && ["US", "CA", "MX", "UNKNOWN"].includes(country)) query = query.eq("country", country);
      const result = await query;
      if (result.error) throw result.error;

      const state = catalogKey(body.state || body.state_code || body.stateCode);
      const market = catalogKey(body.market);
      const region = catalogKey(body.region);
      const search = catalogKey(body.search);
      const rows = (result.data || [])
        .filter((item) => isManualCatalogOwnedBy(item, user))
        .filter((item) => {
          const stateKey = catalogKey([item.state_code, item.state_name].filter(Boolean).join(" "));
          const marketKey = catalogKey(item.market);
          const regionKey = catalogKey(item.region);
          const searchKey = catalogKey([
            item.raw_value,
            item.zip_prefix,
            item.city,
            item.state_code,
            item.state_name,
            item.metro_city,
            item.market,
            item.region,
            item.country
          ].filter(Boolean).join(" "));
          if (state && !stateKey.includes(state)) return false;
          if (market && !marketKey.includes(market)) return false;
          if (region && !regionKey.includes(region)) return false;
          if (search && !searchKey.includes(search)) return false;
          return true;
        })
        .slice(0, Math.min(Math.max(Number(body.limit) || 500, 1), 2000))
        .map((item) => ({
          ...item,
          is_manual: item.source === "rateware_manual_catalog",
          can_archive: item.source === "rateware_manual_catalog" && item.active === true
        }));
      return jsonResponse({ rows });
    }

    if (body.action === "save_location_catalog_value") {
      const input = objectRecord(body.location_value || body.location || body);
      const normalized = normalizeLocationCatalogInput(input, user);
      const result = await supabase
        .from("rateware_locations")
        .upsert(normalized.row, { onConflict: "source,location_key" })
        .select("id,source,country,location_key,raw_value,zip_prefix,city,state_code,state_name,metro_city,market,region,metadata,active,updated_at")
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(
        supabase,
        user,
        "catalog.location.save",
        "rateware_locations",
        result.data.id,
        `Saved location catalog value "${normalized.summary.raw_value}"`,
        normalized.summary
      );
      return jsonResponse({ row: { ...result.data, is_manual: true, can_archive: true } });
    }

    if (body.action === "archive_location_catalog_value") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "Location catalog id is required." }, 400);
      const current = await supabase
        .from("rateware_locations")
        .select("id,source,raw_value,metadata,active")
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return jsonResponse({ error: "Location catalog value was not found." }, 404);
      if (current.data.source !== "rateware_manual_catalog") {
        return jsonResponse({ error: "Only manual location catalog values can be archived from Admin Catalogs." }, 400);
      }
      if (!isManualCatalogOwnedBy(current.data, user)) {
        return jsonResponse({ error: "This manual location belongs to another workspace." }, 403);
      }
      const result = await supabase
        .from("rateware_locations")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,source,country,location_key,raw_value,zip_prefix,city,state_code,state_name,metro_city,market,region,metadata,active,updated_at")
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(
        supabase,
        user,
        "catalog.location.archive",
        "rateware_locations",
        id,
        `Archived location catalog value "${current.data.raw_value}"`,
        { raw_value: current.data.raw_value }
      );
      return jsonResponse({ row: result.data });
    }

    if (body.action === "bulk_import_catalog_values") {
      const result = await bulkImportCatalogValues(supabase, user, body);
      return jsonResponse(result);
    }

    if (body.action === "dashboard_summary") {
      const [uploads, vendors, sourcingVendors, procurementVendors, archivedVendors, pending, approved, failed, rfxEvents, rfxOpen, rfxBids, outreachMessages] = await Promise.all([
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }).neq("status", "archived"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "sourcing"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "procurement"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("base_stage", "archived"),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("rate_staging").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("raw_uploads").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("rfx_events").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).neq("status", "archived"),
        supabase.from("rfx_events").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).eq("status", "open"),
        supabase.from("rfx_lane_vendors").select("id,rfx_events!inner(owner_email)", { count: "exact", head: true }).eq("rfx_events.owner_email", user.owner_email).eq("invitation_status", "bid_submitted"),
        supabase.from("outreach_messages").select("id", { count: "exact", head: true }).eq("owner_email", user.owner_email).neq("status", "archived")
      ]);

      for (const result of [uploads, vendors, sourcingVendors, procurementVendors, archivedVendors, pending, approved, failed, rfxEvents, rfxOpen, rfxBids, outreachMessages]) {
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
        failed_uploads: failed.count || 0,
        rfx_events: rfxEvents.count || 0,
        rfx_open_events: rfxOpen.count || 0,
        rfx_bids: rfxBids.count || 0,
        outreach_messages: outreachMessages.count || 0
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

    if (body.action === "list_upload_staged_rows") {
      const rawUploadId = cleanText(body.raw_upload_id);
      if (!rawUploadId) return jsonResponse({ error: "raw_upload_id is required." }, 400);
      const result = await supabase
        .from("rate_staging")
        .select("id,row_id,status,vendor_domain,rfx_id,quote_date,origin,destination,equipment,trailer,operation,service,mx_linehaul,us_linehaul,fsc,fuel,border_crossing_fee,all_in_rate,currency,weekly_capacity,confidence,audit_flags,source_evidence,created_at")
        .eq("raw_upload_id", rawUploadId)
        .neq("status", "archived")
        .order("row_id", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "bulk_import_upload_template") {
      const rawUploadId = cleanText(body.raw_upload_id);
      const result = await bulkImportStructuredUpload(
        supabase,
        user,
        rawUploadId || "",
        Array.isArray(body.template_rows) ? body.template_rows : [],
        Array.isArray(body.template_warnings) ? body.template_warnings : [],
        {
          replace_existing: body.replace_existing,
          expected_rate_rows: body.expected_rate_rows,
          batch_index: body.batch_index,
          batch_count: body.batch_count,
          imported_before: body.imported_before,
          skipped_before: body.skipped_before
        }
      );
      return jsonResponse(result);
    }

    if (body.action === "list_interpretation_memory") {
      const rawUploadId = cleanText(body.raw_upload_id);
      let upload: Record<string, unknown> | null = null;
      let vendor: Record<string, unknown> | null = null;

      if (rawUploadId) {
        const uploadResult = await supabase
          .from("raw_uploads")
          .select("id,vendor_id,vendor_hint,rfx_hint")
          .eq("id", rawUploadId)
          .single();
        if (uploadResult.error) throw uploadResult.error;
        upload = uploadResult.data || null;

        if (upload?.vendor_id) {
          const vendorResult = await supabase
            .from("vendors")
            .select("id,vendor_name,domain,primary_email")
            .eq("id", upload.vendor_id)
            .maybeSingle();
          if (vendorResult.error) throw vendorResult.error;
          vendor = vendorResult.data || null;
        }
      }

      const [globalResult, ownedResult] = await Promise.all([
        supabase
          .from("interpretation_memory")
          .select("*")
          .is("owner_email", null)
          .eq("active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("interpretation_memory")
          .select("*")
          .eq("owner_email", user.owner_email)
          .eq("active", true)
          .order("created_at", { ascending: false })
      ]);
      if (globalResult.error) throw globalResult.error;
      if (ownedResult.error) throw ownedResult.error;

      const vendorDomain = normalizeDomain(vendor?.domain || upload?.vendor_hint);
      const rfxHint = cleanText(upload?.rfx_hint || body.rfx_hint);
      const baseRows = [...(ownedResult.data || []), ...(globalResult.data || [])].filter((rule) => {
        if (!upload) return true;
        if (rule.scope === "global") return true;
        if (rule.scope === "upload") return rule.raw_upload_id === upload.id;
        if (rule.scope === "rfx") return cleanText(rule.rfx_hint) && cleanText(rule.rfx_hint) === rfxHint;
        if (rule.scope === "vendor") {
          if (rule.vendor_id && upload.vendor_id && rule.vendor_id === upload.vendor_id) return true;
          const ruleDomain = normalizeDomain(rule.vendor_domain);
          return Boolean(ruleDomain && vendorDomain && ruleDomain === vendorDomain);
        }
        return false;
      });

      const usedRuleIds = baseRows.map((rule) => rule.id).filter(Boolean);
      const uploadAuditResult = usedRuleIds.length
        ? await supabase
            .from("raw_uploads")
            .select("id,status,created_at,interpreted_at,interpreted_rate_rows,expected_rate_rows,audit_status,audit_warnings,interpretation_audit")
            .not("interpretation_audit", "is", null)
            .order("interpreted_at", { ascending: false })
            .limit(500)
        : { data: [], error: null };
      if (uploadAuditResult.error) throw uploadAuditResult.error;

      const rows = baseRows.map((rule) => {
        const effectiveness = memoryEffectivenessSummary(rule, uploadAuditResult.data || []);
        const conflicts = memoryConflictSignals(rule, baseRows);
        return {
          ...rule,
          effectiveness,
          conflicts,
          recommendation: memoryRecommendation(rule, effectiveness, conflicts)
        };
      });
      return jsonResponse({ rows, upload, vendor });
    }

    if (body.action === "list_interpretation_memory_audit") {
      const memoryId = cleanText(body.id);
      let query = supabase
        .from("saas_audit_log")
        .select("*")
        .eq("owner_email", user.owner_email)
        .eq("entity_type", "interpretation_memory")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(body.limit) || 80, 1), 250));
      if (memoryId) query = query.ilike("entity_id", `%${memoryId}%`);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "create_interpretation_memory") {
      const instruction = cleanText(body.instruction);
      if (!instruction) return jsonResponse({ error: "Instruction is required." }, 400);
      const scope = ["global", "vendor", "rfx", "upload"].includes(String(body.scope || "")) ? String(body.scope) : "global";
      let upload: Record<string, unknown> | null = null;
      let vendor: Record<string, unknown> | null = null;

      if (body.raw_upload_id) {
        const uploadResult = await supabase
          .from("raw_uploads")
          .select("id,vendor_id,vendor_hint,rfx_hint")
          .eq("id", body.raw_upload_id)
          .maybeSingle();
        if (uploadResult.error) throw uploadResult.error;
        upload = uploadResult.data || null;
        if (upload?.vendor_id) {
          const vendorResult = await supabase
            .from("vendors")
            .select("id,domain")
            .eq("id", upload.vendor_id)
            .maybeSingle();
          if (vendorResult.error) throw vendorResult.error;
          vendor = vendorResult.data || null;
        }
      }

      const row = withOwner({
        scope,
        vendor_id: scope === "vendor" ? upload?.vendor_id || null : null,
        vendor_domain: scope === "vendor" ? normalizeDomain(vendor?.domain || upload?.vendor_hint || body.vendor_domain) : null,
        rfx_hint: scope === "rfx" ? cleanText(upload?.rfx_hint || body.rfx_hint) : null,
        raw_upload_id: scope === "upload" ? cleanText(upload?.id || body.raw_upload_id) : null,
        title: cleanText(body.title) || `${scope} interpretation rule`,
        instruction,
        active: true
      }, user);
      const result = await supabase.from("interpretation_memory").insert(row).select().single();
      if (result.error) throw result.error;
      await writeAuditLog(supabase, user, "create", "interpretation_memory", result.data.id, `Created ${scope} interpretation memory rule`, {
        scope,
        raw_upload_id: body.raw_upload_id || null
      });
      return jsonResponse({ row: result.data });
    }

    if (body.action === "simulate_interpretation_memory") {
      let rule: Record<string, unknown> | null = null;
      if (body.id) {
        const result = await supabase
          .from("interpretation_memory")
          .select("*")
          .eq("id", body.id)
          .or(`owner_email.eq.${user.owner_email},owner_email.is.null`)
          .maybeSingle();
        if (result.error) throw result.error;
        rule = result.data || null;
      } else {
        rule = {
          scope: ["global", "vendor", "rfx", "upload"].includes(String(body.scope || "")) ? String(body.scope) : "global",
          vendor_domain: normalizeDomain(body.vendor_domain),
          rfx_hint: cleanText(body.rfx_hint),
          raw_upload_id: cleanText(body.raw_upload_id),
          title: cleanText(body.title) || "Draft rule",
          instruction: cleanText(body.instruction) || ""
        };
      }
      if (!rule) return jsonResponse({ error: "Memory rule not found." }, 404);

      const uploadsResult = await supabase
        .from("raw_uploads")
        .select("id,original_filename,status,created_at,interpreted_at,vendor_id,vendor_hint,rfx_hint,document_type,interpreted_rate_rows,expected_rate_rows,audit_status,audit_warnings,vendors(vendor_name,domain)")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(500);
      if (uploadsResult.error) throw uploadsResult.error;

      const matches = (uploadsResult.data || []).filter((upload) => memoryRuleMatchesUpload(rule!, upload));
      const warningCount = matches.reduce((sum, upload) => sum + (Array.isArray(upload.audit_warnings) ? upload.audit_warnings.length : 0), 0);
      const stagedRows = matches.reduce((sum, upload) => sum + (Number(upload.interpreted_rate_rows || 0) || 0), 0);
      const expectedRows = matches.reduce((sum, upload) => sum + (Number(upload.expected_rate_rows || upload.interpreted_rate_rows || 0) || 0), 0);
      return jsonResponse({
        rule,
        impact: {
          upload_count: matches.length,
          staged_rows: stagedRows,
          expected_rows: expectedRows,
          warning_count: warningCount,
          failed_count: matches.filter((upload) => upload.status === "failed" || upload.audit_status === "failed").length,
          current_scope: rule.scope
        },
        rows: matches.slice(0, 25).map((upload) => ({
          id: upload.id,
          filename: upload.original_filename,
          status: upload.status,
          vendor: (upload.vendors as Record<string, unknown> | null)?.vendor_name || upload.vendor_hint || "",
          vendor_domain: (upload.vendors as Record<string, unknown> | null)?.domain || upload.vendor_hint || "",
          rfx_hint: upload.rfx_hint,
          document_type: upload.document_type,
          interpreted_rate_rows: upload.interpreted_rate_rows,
          expected_rate_rows: upload.expected_rate_rows,
          audit_status: upload.audit_status,
          created_at: upload.created_at
        }))
      });
    }

    if (body.action === "update_interpretation_memory") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "Memory rule id is required." }, 400);
      const patchInput = body.patch || {};
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patchInput.title !== undefined) patch.title = cleanText(patchInput.title) || "Interpretation rule";
      if (patchInput.instruction !== undefined) {
        const instruction = cleanText(patchInput.instruction);
        if (!instruction) return jsonResponse({ error: "Instruction is required." }, 400);
        patch.instruction = instruction;
      }
      if (patchInput.active !== undefined) patch.active = Boolean(patchInput.active);
      if (patchInput.scope !== undefined && ["global", "vendor", "rfx", "upload"].includes(String(patchInput.scope))) {
        patch.scope = String(patchInput.scope);
        if (patch.scope === "global") {
          patch.vendor_id = null;
          patch.vendor_domain = null;
          patch.rfx_hint = null;
          patch.raw_upload_id = null;
        }
      }

      const currentResult = await supabase
        .from("interpretation_memory")
        .select("id,scope,title,vendor_domain,rfx_hint,raw_upload_id")
        .eq("id", id)
        .eq("owner_email", user.owner_email)
        .maybeSingle();
      if (currentResult.error) throw currentResult.error;
      if (!currentResult.data) return jsonResponse({ error: "Memory rule not found." }, 404);

      const result = await supabase
        .from("interpretation_memory")
        .update(patch)
        .eq("id", id)
        .eq("owner_email", user.owner_email)
        .select()
        .single();
      if (result.error) throw result.error;
      const promotedToGlobal = currentResult.data.scope !== "global" && result.data.scope === "global";
      await writeAuditLog(
        supabase,
        user,
        promotedToGlobal ? "promote" : "update",
        "interpretation_memory",
        id,
        promotedToGlobal ? "Promoted interpretation memory rule to global" : "Updated interpretation memory rule",
        {
          prior_scope: currentResult.data.scope,
          next_scope: result.data.scope,
          changed_fields: Object.keys(patch).filter((key) => key !== "updated_at")
        }
      );
      return jsonResponse({ row: result.data });
    }

    if (body.action === "archive_interpretation_memory") {
      const ids = Array.isArray(body.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, 250)
        : ([cleanText(body.id)].filter(Boolean) as string[]);
      if (!ids.length) return jsonResponse({ updated: 0, rows: [] });
      const result = await supabase
        .from("interpretation_memory")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("owner_email", user.owner_email)
        .in("id", ids)
        .select();
      if (result.error) throw result.error;
      await writeAuditLog(supabase, user, "archive", "interpretation_memory", ids.join(","), `Archived ${result.data?.length || 0} interpretation memory rule(s)`, {
        ids,
        archived_count: result.data?.length || 0
      });
      return jsonResponse({ updated: result.data?.length || 0, rows: result.data || [] });
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

    if (body.action === "get_upload_source_url") {
      if (!body.id) return jsonResponse({ error: "Upload id is required." }, 400);
      const upload = await supabase
        .from("raw_uploads")
        .select("id,original_filename,storage_bucket,storage_path,mime_type")
        .eq("id", body.id)
        .single();
      if (upload.error) throw upload.error;
      if (!upload.data?.storage_bucket || !upload.data?.storage_path) {
        return jsonResponse({ error: "Source file is missing from storage." }, 404);
      }

      const signed = await supabase.storage
        .from(upload.data.storage_bucket)
        .createSignedUrl(upload.data.storage_path, 60 * 10, {
          download: upload.data.original_filename || undefined
        });
      if (signed.error) throw signed.error;
      return jsonResponse({
        url: signed.data.signedUrl,
        expires_in_seconds: 600,
        filename: upload.data.original_filename,
        mime_type: upload.data.mime_type
      });
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
      const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 1000);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const search = (cleanText(body.search) || "").replace(/[(),]/g, " ").trim();
      const columnFilters = objectRecord(body.column_filters);
      const reviewFilter = cleanText(body.review_filter) || "all";
      const usesGlobalFilters = Object.keys(columnFilters).length > 0 || reviewFilter !== "all";
      const filterPayload = {
        mode: "staging",
        status: cleanText(body.status),
        raw_upload_id: cleanText(body.raw_upload_id),
        search,
        review_filter: reviewFilter,
        column_filters: columnFilters
      };

      if (usesGlobalFilters && !canUseSqlRateFilters(filterPayload)) {
        const filtered = await fetchRateRowIdsByFilter(supabase, filterPayload, { limit, offset });
        const rows = await fetchRateRowsForIds(supabase, filtered.ids, RATE_ROW_LIST_SELECT);

        return jsonResponse({
          rows,
          total: filtered.database_count,
          database_count: filtered.database_count,
          limit,
          offset,
          has_more: offset + rows.length < filtered.database_count,
          hard_limit_reached: filtered.hard_limit_reached
        });
      }

      let query = supabase
        .from("rate_staging")
        .select(RATE_ROW_LIST_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);
      query = applySqlRateFilters(query, filterPayload);
      const result = await query;
      if (result.error) throw result.error;
      const rows = result.data || [];
      const total = result.count || 0;
      return jsonResponse({
        rows,
        total,
        limit,
        offset,
        has_more: offset + rows.length < total
      });
    }

    if (body.action === "list_staging_filter_values") {
      const field = cleanText(body.field);
      if (!field) return jsonResponse({ error: "Filter field is required." }, 400);
      const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 2000);
      const valueSearch = cleanText(body.value_search)?.toLowerCase() || "";
      const columnFilters = objectRecord(body.column_filters);
      delete columnFilters[field];
      const filterPayload = {
        mode: "staging",
        status: cleanText(body.status),
        raw_upload_id: cleanText(body.raw_upload_id),
        search: (cleanText(body.search) || "").replace(/[(),]/g, " ").trim(),
        review_filter: cleanText(body.review_filter) || "all",
        column_filters: columnFilters
      };

      const sqlValues = await fetchSqlRateFilterValues(supabase, filterPayload, field, valueSearch, limit);
      if (sqlValues) return jsonResponse(sqlValues);

      return jsonResponse(await fetchRateFilterValuesByRpc(supabase, filterPayload, field, valueSearch, limit));
    }

    if (body.action === "list_rateware") {
      const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 1000);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const search = (cleanText(body.search) || "").replace(/[(),]/g, " ").trim();
      const quickFilter = cleanText(body.quick_filter) || "all";
      const columnFilters = objectRecord(body.column_filters);
      const filterPayload = {
        mode: "rateware",
        search,
        operation: cleanText(body.operation),
        service: cleanText(body.service),
        quick_filter: quickFilter,
        column_filters: columnFilters
      };
      const usesGlobalFilters = hasActiveRatewareFilters(filterPayload);

      if (usesGlobalFilters) {
        try {
          const filtered = await fetchRateRowIdsByFilter(supabase, filterPayload, { limit, offset });
          const rows = await fetchRateRowsForIds(supabase, filtered.ids, RATE_ROW_LIST_SELECT);

          return jsonResponse({
            rows,
            total: filtered.database_count,
            database_count: filtered.database_count,
            limit,
            offset,
            has_more: offset + rows.length < filtered.database_count,
            hard_limit_reached: filtered.hard_limit_reached
          });
        } catch (error) {
          console.warn("rateware list RPC failed; attempting SQL fallback", {
            message: error instanceof Error ? error.message : String(error)
          });
          if (canUseSqlRateFilters(filterPayload)) {
            return jsonResponse(await fetchRatewareRowsBySql(supabase, filterPayload, limit, offset));
          }
          throw error;
        }
      }

      return jsonResponse(await fetchRatewareRowsBySql(supabase, filterPayload, limit, offset));
    }

    if (body.action === "list_rateware_filter_values") {
      const field = cleanText(body.field);
      if (!field) return jsonResponse({ error: "Filter field is required." }, 400);
      const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 2000);
      const valueSearch = cleanText(body.value_search)?.toLowerCase() || "";
      const columnFilters = objectRecord(body.column_filters);
      delete columnFilters[field];
      const filterPayload = {
        mode: "rateware",
        search: (cleanText(body.search) || "").replace(/[(),]/g, " ").trim(),
        operation: cleanText(body.operation),
        service: cleanText(body.service),
        quick_filter: cleanText(body.quick_filter) || "all",
        column_filters: columnFilters
      };

      try {
        return jsonResponse(await fetchRateFilterValuesByRpc(supabase, filterPayload, field, valueSearch, limit));
      } catch (error) {
        console.warn("rateware filter values RPC failed; using SQL fallback", {
          field,
          message: error instanceof Error ? error.message : String(error)
        });
        const sqlValues = await fetchSqlRateFilterValues(supabase, filterPayload, field, valueSearch, limit);
        if (sqlValues) return jsonResponse(sqlValues);
        throw error;
      }
    }

    if (body.action === "list_rateware_audit") {
      const rateId = cleanText(body.id);
      let query = supabase
        .from("saas_audit_log")
        .select("*")
        .eq("owner_email", user.owner_email)
        .eq("entity_type", "rate_staging")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(body.limit) || 80, 1), 250));
      if (rateId) query = query.ilike("entity_id", `%${rateId}%`);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "get_rate_row_detail") {
      const rateId = cleanText(body.id);
      if (!rateId) return jsonResponse({ error: "Rate row id is required." }, 400);
      let query = supabase
        .from("rate_staging")
        .select(RATE_ROW_RESPONSE_WITH_LEGS_SELECT)
        .eq("id", rateId)
        .single();
      const status = cleanText(body.status);
      if (status) query = query.eq("status", status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    if (body.action === "bulk_update_rateware") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ error: "At least one approved rate id is required." }, 400);

      const currentResult = await supabase
        .from("rate_staging")
        .select("id,trailer,hazmat,temperature_controlled,status,vendor_id,vendor_domain")
        .in("id", ids)
        .eq("status", "approved")
        .limit(500);
      if (currentResult.error) throw currentResult.error;

      const updatedRows: Record<string, unknown>[] = [];
      for (const current of currentResult.data || []) {
        const patch = normalizeStagingPatch(body.patch || {}, current || {});
        Object.assign(patch, await vendorLinkPatch(supabase, user, body.patch || {}, current || {}));
        delete patch.status;
        if (!Object.keys(patch).length) continue;

        const result = await supabase
          .from("rate_staging")
          .update(patch)
          .eq("id", current.id)
          .eq("status", "approved")
          .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
          .single();
        if (result.error) throw result.error;
        updatedRows.push(result.data);
      }

      if (updatedRows.length) {
        await writeAuditLog(supabase, user, "rateware.bulk_update", "rate_staging", updatedRows.map((row) => row.id).join(","), `Bulk updated ${updatedRows.length} approved Rateware row(s)`, {
          ids: updatedRows.map((row) => row.id),
          changed_fields: Object.keys(body.patch || {})
        });
      }
      return jsonResponse({ updated: updatedRows.length, rows: updatedRows });
    }

    if (body.action === "list_rateware_versions") {
      let query = supabase
        .from("rateware_book_versions")
        .select("id,created_at,owner_email,name,description,filter_summary,row_count")
        .order("created_at", { ascending: false })
        .limit(20);
      if (user.owner_email) query = query.eq("owner_email", user.owner_email);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data || [] });
    }

    if (body.action === "get_rateware_version") {
      const id = cleanText(body.id);
      if (!id) return jsonResponse({ error: "Rateware version id is required." }, 400);
      let query = supabase
        .from("rateware_book_versions")
        .select("*")
        .eq("id", id)
        .single();
      const result = await query;
      if (result.error) throw result.error;
      if (user.owner_email && result.data?.owner_email !== user.owner_email) {
        return jsonResponse({ error: "Rateware version not found." }, 404);
      }
      return jsonResponse({ version: result.data });
    }

    if (body.action === "create_rateware_version") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 1000) : [];
      const filters = objectRecord(body.filters);
      let rows: Record<string, unknown>[] = [];

      if (ids.length) {
        let query = supabase
          .from("rate_staging")
          .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
          .eq("status", "approved")
          .order("quote_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1000);
        query = query.in("id", ids);
        const rowsResult = await query;
        if (rowsResult.error) throw rowsResult.error;
        rows = rowsResult.data || [];
      } else if (Object.keys(filters).length) {
        const filtered = await fetchRateRowIdsByFilter(supabase, { ...filters, mode: "rateware" }, { limit: 50000 });
        rows = await fetchRateRowsForIds(supabase, filtered.ids, "*, vendors(vendor_name, domain, primary_email, base_stage, status)");
      } else {
        const rowsResult = await supabase
          .from("rate_staging")
          .select("*, vendors(vendor_name, domain, primary_email, base_stage, status)")
          .eq("status", "approved")
          .order("quote_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1000);
        if (rowsResult.error) throw rowsResult.error;
        rows = rowsResult.data || [];
      }
      if (!rows.length) return jsonResponse({ error: "No approved Rateware rows found for this version." }, 400);

      const name = cleanText(body.name) || `Rateware ${new Date().toISOString().slice(0, 10)}`;
      const description = cleanText(body.description);
      const filterSummary = typeof body.filter_summary === "object" && body.filter_summary !== null ? body.filter_summary : {};
      const version = withOwner({
        name,
        description,
        filter_summary: filterSummary,
        row_count: rows.length,
        rows_snapshot: rows
      }, user);

      const result = await supabase
        .from("rateware_book_versions")
        .insert(version)
        .select("id,created_at,owner_email,name,description,filter_summary,row_count")
        .single();
      if (result.error) throw result.error;
      await writeAuditLog(supabase, user, "rateware.snapshot", "rate_staging", rows.map((row) => row.id).join(","), `Created Rateware snapshot "${name}"`, {
        version_id: result.data.id,
        row_count: rows.length,
        name
      });
      return jsonResponse({ version: result.data });
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
      const result = await matchRateVendorRows(supabase, user, ids, status);
      return jsonResponse(result);
    }

    if (body.action === "match_rate_vendors_by_filter") {
      const filters = objectRecord(body.filters);
      const dryRun = body.dry_run === true;
      const maxRows = Math.min(Math.max(Number(body.max_rows) || 100000, 1), 100000);
      const mode = cleanText(filters.mode) === "rateware" ? "rateware" : "staging";
      const result = await matchRateVendorRowsByFilter(supabase, user, filters, { dryRun, maxRows });

      if (!dryRun && result.updated) {
        await writeAuditLog(
          supabase,
          user,
          `${mode}.bulk_match_vendors_filtered`,
          "rate_staging",
          result.rows.map((row) => cleanText(row.id)).filter(Boolean).slice(0, 50).join(","),
          `Matched vendors for ${result.updated} ${mode} row(s) using active filters`,
          {
            matched_count: result.matched,
            candidates_count: result.candidates,
            matchable_count: result.matchable,
            updated_count: result.updated,
            filters,
            hard_limit_reached: result.hard_limit_reached
          }
        );
      }

      return jsonResponse(result);
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
      await writeAuditLog(supabase, user, "rateware.update", "rate_staging", body.id, "Updated approved Rateware row", {
        changed_fields: Object.keys(patch)
      });
      return jsonResponse({ row: result.data });
    }

    if (body.action === "return_rateware_to_staging") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return jsonResponse({ error: "At least one approved rate id is required." }, 400);
      const reason = cleanText(body.reason) || "Needs correction or re-review from Rateware Final";
      const returnedNote = `Returned to staging ${new Date().toISOString().slice(0, 10)}: ${reason}`;

      const currentResult = await supabase
        .from("rate_staging")
        .select("id,notes")
        .in("id", ids)
        .eq("status", "approved");
      if (currentResult.error) throw currentResult.error;

      const updatedRows: Record<string, unknown>[] = [];
      for (const current of currentResult.data || []) {
        const notes = [cleanText(current.notes), returnedNote].filter(Boolean).join(" | ");
        const result = await supabase
          .from("rate_staging")
          .update({ status: "pending_review", notes })
          .eq("id", current.id)
          .eq("status", "approved")
          .select("id");
        if (result.error) throw result.error;
        updatedRows.push(...(result.data || []));
      }

      if (updatedRows.length) {
        await writeAuditLog(supabase, user, "rateware.return_to_staging", "rate_staging", updatedRows.map((row) => row.id).join(","), `Returned ${updatedRows.length} approved Rateware row(s) to staging`, {
          ids: updatedRows.map((row) => row.id),
          reason
        });
      }
      return jsonResponse({ updated: updatedRows.length, rows: updatedRows, reason });
    }

    if (body.action === "bulk_rate_rows_by_filter") {
      const filters = objectRecord(body.filters);
      const targetAction = cleanText(body.target_action);
      const dryRun = body.dry_run === true;
      const maxRows = Math.min(Math.max(Number(body.max_rows) || 100000, 1), 100000);
      if (!["archive", "remove"].includes(targetAction || "")) {
        return jsonResponse({ error: "Bulk target action must be archive or remove." }, 400);
      }
      const actionFilters = {
        ...filters,
        exclude_archived: targetAction === "archive"
      };
      const filtered = dryRun
        ? await fetchRateRowIdsByFilter(supabase, actionFilters, { limit: 1 })
        : await collectRateRowIdsByFilter(supabase, actionFilters, { maxRows });
      const ids = filtered.ids;
      if (dryRun) {
        return jsonResponse({
          action: targetAction,
          matched: filtered.database_count || ids.length,
          database_count: filtered.database_count,
          hard_limit_reached: false,
          max_rows: maxRows
        });
      }
      if (!ids.length) {
        return jsonResponse({
          action: targetAction,
          matched: 0,
          updated: 0,
          removed: 0,
          rows: []
        });
      }

      let affected = 0;
      for (const chunk of chunkValues(ids, 500)) {
        const result = targetAction === "archive"
          ? await supabase.from("rate_staging").update({ status: "archived" }).in("id", chunk).select("id")
          : await supabase.from("rate_staging").delete().in("id", chunk).select("id");
        if (result.error) throw result.error;
        affected += result.data?.length || 0;
      }

      const mode = cleanText(filters.mode) === "rateware" ? "rateware" : "staging";
      await writeAuditLog(
        supabase,
        user,
        `${mode}.bulk_${targetAction}_filtered`,
        "rate_staging",
        ids.slice(0, 50).join(","),
        `${targetAction === "archive" ? "Archived" : "Removed"} ${affected} ${mode} row(s) using active filters`,
        {
          ids_count: ids.length,
          database_count: filtered.database_count,
          filters: actionFilters,
          hard_limit_reached: filtered.hard_limit_reached
        }
      );

      return jsonResponse({
        action: targetAction,
        matched: filtered.database_count || ids.length,
        targeted: ids.length,
        updated: targetAction === "archive" ? affected : 0,
        removed: targetAction === "remove" ? affected : 0,
        max_rows: maxRows,
        hard_limit_reached: filtered.hard_limit_reached
      });
    }

    if (body.action === "bulk_update_rate_rows_by_filter") {
      const filters = objectRecord(body.filters);
      const patchInput = objectRecord(body.patch);
      const dryRun = body.dry_run === true;
      const maxRows = Math.min(Math.max(Number(body.max_rows) || 100000, 1), 100000);
      const mode = cleanText(filters.mode) === "rateware" ? "rateware" : "staging";
      if (!Object.keys(patchInput).length) return jsonResponse({ error: "Bulk update patch is required." }, 400);
      if (mode === "rateware" && patchInput.status !== undefined) {
        return jsonResponse({ error: "Filtered Rateware updates cannot change approved status." }, 400);
      }

      const filtered = dryRun
        ? await fetchRateRowIdsByFilter(supabase, filters, { limit: 1 })
        : await collectRateRowIdsByFilter(supabase, filters, { maxRows });
      const ids = filtered.ids;
      if (dryRun) {
        return jsonResponse({
          matched: filtered.database_count || ids.length,
          database_count: filtered.database_count,
          hard_limit_reached: false,
          max_rows: maxRows
        });
      }
      if (!ids.length) {
        return jsonResponse({
          matched: 0,
          updated: 0,
          rows: []
        });
      }

      const requiresRowSpecificPatch = patchInput.vendor_domain !== undefined
        || patchInput.trailer !== undefined
        || patchInput.hazmat !== undefined
        || patchInput.temperature_controlled !== undefined;
      const updatedRows: Record<string, unknown>[] = [];

      if (requiresRowSpecificPatch) {
        const currentRows = await fetchRateRowsForIds(supabase, ids, BULK_RATE_ROW_SELECT);
        for (const current of currentRows) {
          const patch = normalizeStagingPatch(patchInput, current || {});
          Object.assign(patch, await vendorLinkPatch(supabase, user, patchInput, current || {}));
          if (mode === "rateware") delete patch.status;
          if (!Object.keys(patch).length) continue;

          const result = await supabase
            .from("rate_staging")
            .update(patch)
            .eq("id", current.id)
            .select("id,status")
            .single();
          if (result.error) throw result.error;
          updatedRows.push(result.data);
        }
      } else {
        const patch = normalizeStagingPatch(patchInput, {});
        if (mode === "rateware") delete patch.status;
        if (!Object.keys(patch).length) return jsonResponse({ error: "No valid bulk updates provided." }, 400);

        for (const chunk of chunkValues(ids, 500)) {
          const result = await supabase
            .from("rate_staging")
            .update(patch)
            .in("id", chunk)
            .select("id,status");
          if (result.error) throw result.error;
          updatedRows.push(...(result.data || []));
        }
      }

      await writeAuditLog(
        supabase,
        user,
        `${mode}.bulk_update_filtered`,
        "rate_staging",
        ids.slice(0, 50).join(","),
        `Updated ${updatedRows.length} ${mode} row(s) using active filters`,
        {
          ids_count: ids.length,
          database_count: filtered.database_count,
          updated_count: updatedRows.length,
          changed_fields: Object.keys(patchInput),
          filters,
          hard_limit_reached: filtered.hard_limit_reached
        }
      );

      return jsonResponse({
        matched: filtered.database_count || ids.length,
        targeted: ids.length,
        updated: updatedRows.length,
        rows: updatedRows.slice(0, 100),
        max_rows: maxRows,
        hard_limit_reached: filtered.hard_limit_reached
      });
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

    if (body.action === "save_location_alias") {
      const result = await saveRatewareLocationAlias(supabase, user, body);
      return jsonResponse(result);
    }

    if (body.action === "list_staging_options") {
      const [catalog, locations, borderPairs, vendors] = await Promise.all([
        supabase
          .from("rateware_catalog_items")
          .select("source,category,normalized_value,raw_value,code,metadata")
          .in("category", ["equipment", "trailer", "config", "operation", "service", "driver", "mx_border_crossing", "us_border_crossing", "border_crossing"])
          .eq("active", true)
          .limit(5000),
        supabase
          .from("rateware_locations")
          .select("id,source,raw_value,zip_prefix,metro_city,city,state_code,state_name,country,market,region")
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
      const catalogData = (catalog.data || []).filter((item) => isManualCatalogOwnedBy(item, user));
      for (const item of catalogData) {
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
          locationMap.set(key, locationOptionPayload(location));
        }
      }

      const locationOptions = [...locationMap.values()]
        .sort((a, b) => String(a.label || a.value).localeCompare(String(b.label || b.value)))
        .slice(0, 5000);

      const manualMxCrossings = (categoryMaps.mx_border_crossing ? [...categoryMaps.mx_border_crossing.values()].map((item) => item.value) : []);
      const manualUsCrossings = (categoryMaps.us_border_crossing ? [...categoryMaps.us_border_crossing.values()].map((item) => item.value) : []);
      const manualGenericCrossings = (categoryMaps.border_crossing ? [...categoryMaps.border_crossing.values()].map((item) => item.value) : []);

      const mxCrossings = Array.from(new Set([
        ...manualMxCrossings,
        ...manualGenericCrossings,
        ...(borderPairs.data || []).map((pair) => [pair.mx_city, pair.mx_state].filter(Boolean).join(", "))
      ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

      const usCrossings = Array.from(new Set((borderPairs.data || [])
        .map((pair) => [pair.us_city, pair.us_state].filter(Boolean).join(", "))
        .concat(manualUsCrossings, manualGenericCrossings)
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
        .select("trailer,hazmat,temperature_controlled,vendor_id,vendor_domain,status")
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
      const priorStatus = cleanText(currentResult.data?.status);
      const nextStatus = cleanText(result.data?.status);
      if (priorStatus !== nextStatus || nextStatus === "approved") {
        await writeAuditLog(
          supabase,
          user,
          nextStatus === "approved" ? "rateware.approve" : "staging.status_update",
          "rate_staging",
          body.id,
          nextStatus === "approved" ? "Approved staging row into Rateware" : `Updated staging row status to ${nextStatus}`,
          {
            prior_status: priorStatus,
            next_status: nextStatus,
            changed_fields: Object.keys(patch)
          }
        );
      }
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }
});
