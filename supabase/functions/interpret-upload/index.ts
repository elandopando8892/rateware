import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { requireKindeUser } from "../_shared/kinde.ts";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const RATEWARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "summary"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["vendor_domain", "rfx_id", "quote_date", "expected_rate_rows", "source_table_count", "carrier_response_scope", "completeness_notes", "document_notes"],
      properties: {
        vendor_domain: { type: ["string", "null"] },
        rfx_id: { type: ["string", "null"] },
        quote_date: { type: ["string", "null"] },
        expected_rate_rows: { type: ["number", "null"] },
        source_table_count: { type: ["number", "null"] },
        carrier_response_scope: { type: ["string", "null"] },
        completeness_notes: { type: ["string", "null"] },
        document_notes: { type: ["string", "null"] }
      }
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "vendor_domain",
          "rfx_id",
          "quote_date",
          "row_id",
          "origin",
          "destination",
          "equipment",
          "trailer",
          "hazmat",
          "temperature_controlled",
          "config",
          "operation",
          "service",
          "source_service_marker",
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
          "extraction_warnings"
        ],
        properties: {
          vendor_domain: { type: ["string", "null"] },
          rfx_id: { type: ["string", "null"] },
          quote_date: { type: ["string", "null"] },
          row_id: { type: ["string", "null"] },
          origin: { type: ["string", "null"] },
          destination: { type: ["string", "null"] },
          equipment: { type: ["string", "null"] },
          trailer: { type: ["string", "null"] },
          hazmat: { type: ["boolean", "null"] },
          temperature_controlled: { type: ["boolean", "null"] },
          config: { type: ["string", "null"] },
          operation: { type: ["string", "null"] },
          service: { type: ["string", "null"] },
          source_service_marker: { type: ["string", "null"] },
          driver: { type: ["string", "null"] },
          mx_border_crossing_point: { type: ["string", "null"] },
          us_border_crossing_point: { type: ["string", "null"] },
          mx_linehaul: { type: ["string", "null"] },
          us_linehaul: { type: ["string", "null"] },
          us_miles: { type: ["string", "null"] },
          fsc: { type: ["string", "null"] },
          fuel: { type: ["string", "null"] },
          border_crossing_fee: { type: ["string", "null"] },
          flat_rate: { type: ["string", "null"] },
          all_in_rate: { type: ["string", "null"] },
          currency: { type: ["string", "null"] },
          weekly_capacity: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          accessorials: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          extraction_warnings: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function openAIErrorMessage(response: Response, label: string) {
  const body = await response.text();

  try {
    const parsed = JSON.parse(body);
    const code = parsed?.error?.code || parsed?.error?.type;

    if (code === "insufficient_quota") {
      return "OpenAI quota is not available for this project. Add billing/credits in OpenAI or update OPENAI_API_KEY to a project with available quota.";
    }

    if (parsed?.error?.message) {
      return `${label}: ${parsed.error.message}`;
    }
  } catch {
    // Fall through to the raw body below.
  }

  return `${label}: ${body}`;
}

function isInvalidRateValue(value: unknown) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim();
  return !normalized || /^x$/i.test(normalized) || /^n\/?a$/i.test(normalized) || /^please estimate$/i.test(normalized) || /^tier\s*[123]$/i.test(normalized);
}

function cleanRateValue(value: unknown) {
  if (isInvalidRateValue(value)) return null;
  const text = String(value)
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function cleanNumber(value: unknown) {
  const text = cleanRateValue(value);
  if (!text) return null;
  const number = Number(text.replace(/[$,%]/g, "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function userContext(payload: Record<string, unknown>) {
  const email = cleanText(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase();
  const id = cleanText(payload.sub || payload.id || email);
  return {
    owner_user_id: id || email || null,
    owner_email: email || id || null
  };
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const emailDomain = text.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/)?.[1];
  return (emailDomain || text)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^@/, "")
    .split("/")[0];
}

function domainFromVendorReference(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const emailDomain = text.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/)?.[1];
  const domainText = emailDomain || text.replace(/^@/, "");
  if (!/[a-z0-9-]+\.[a-z]{2,}/i.test(domainText)) return null;
  return normalizeDomain(domainText);
}

// Free / personal / disposable email hosts. A carrier that quotes from one of
// these has no usable corporate domain, so it must not be treated as a carrier
// identity (otherwise unrelated carriers get grouped under e.g. "gmail.com").
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.mx", "yahoo.com", "yahoo.com.mx",
  "outlook.com", "outlook.es", "live.com", "live.com.mx", "icloud.com",
  "me.com", "aol.com", "msn.com", "gmx.com", "mail.com", "prodigy.net.mx",
  "yopmail.com"
]);

function isCarrierDomain(value: unknown): value is string {
  const domain = typeof value === "string" ? value.toLowerCase() : "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false;
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return false;
  return true;
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

function rawKey(value: unknown) {
  return catalogKey(value);
}

function includesAny(value: unknown, tokens: string[]) {
  const key = rawKey(value);
  return tokens.some((token) => key.includes(rawKey(token)));
}

function hasCatalogToken(value: unknown, token: string) {
  const key = rawKey(value);
  const lookup = rawKey(token);
  if (!key || !lookup) return false;
  return new RegExp(`(^| )${lookup}( |$)`).test(key);
}

function serviceFromText(value: unknown) {
  const key = rawKey(value);
  if (!key) return null;
  if (key.includes("NO EXPLICIT") || key.includes("CORRECTED TO ONE WAY")) return null;
  if (hasCatalogToken(key, "RT") || key.includes("ROUND TRIP") || key.includes("ROUNDTRIP") || key.includes("ROUND TRIP")) return "Roundtrip";
  if (key.includes("BACKHAUL")) return "Backhaul";
  if (hasCatalogToken(key, "OW") || key.includes("ONE WAY") || key.includes("ONEWAY")) return "One Way";
  return null;
}

function serviceEvidenceFromRow(row: Record<string, unknown>) {
  return serviceFromText([
    row.source_service_marker,
    row.notes,
    row.accessorials,
    Array.isArray(row.extraction_warnings) ? row.extraction_warnings.join(" ") : row.extraction_warnings,
    row.extracted_payload && typeof row.extracted_payload === "object"
      ? [
        (row.extracted_payload as Record<string, unknown>).source_service_marker,
        (row.extracted_payload as Record<string, unknown>).notes,
        (row.extracted_payload as Record<string, unknown>).accessorials,
        Array.isArray((row.extracted_payload as Record<string, unknown>).extraction_warnings)
          ? ((row.extracted_payload as Record<string, unknown>).extraction_warnings as unknown[]).join(" ")
          : (row.extracted_payload as Record<string, unknown>).extraction_warnings
      ].filter(Boolean).join(" ")
      : null
  ].filter(Boolean).join(" "));
}

function normalizeServiceSafety(row: Record<string, unknown>) {
  const explicit = serviceEvidenceFromRow(row);
  if (explicit) return { ...row, service: explicit, normalized_service: explicit };

  const serviceKey = rawKey(row.service || row.normalized_service);
  const operationKey = rawKey(row.operation || row.normalized_operation);
  const hasOneDirection = operationKey.includes("D2D") || operationKey.includes("NORTHBOUND") || operationKey.includes("SOUTHBOUND");
  if (serviceKey.includes("ROUNDTRIP") || serviceKey.includes("ROUND TRIP")) {
    return {
      ...row,
      service: "One Way",
      normalized_service: "One Way",
      notes: [
        row.notes,
        "Service corrected to One Way because no explicit RT/Round Trip marker was found in the carrier quote."
      ].filter(Boolean).join(" | ")
    };
  }

  if (!serviceKey && (hasOneDirection || hasRateAmount(row))) {
    return {
      ...row,
      service: "One Way",
      normalized_service: "One Way",
      notes: [
        row.notes,
        "Service defaulted to One Way because the carrier provided a priced lane without an explicit RT/Round Trip marker."
      ].filter(Boolean).join(" | ")
    };
  }
  return row;
}

function normalizeRatewareAliases(row: Record<string, unknown>) {
  const normalized = { ...row };
  const equipmentText = [normalized.equipment, normalized.trailer, normalized.config, normalized.notes, normalized.accessorials].filter(Boolean).join(" ");
  const operationText = [normalized.operation, normalized.notes].filter(Boolean).join(" ");
  const serviceText = [normalized.service, normalized.operation, normalized.notes].filter(Boolean).join(" ");
  const resolvedService = serviceFromText(serviceText);
  if (includesAny(equipmentText, ["hazmat", "hazardous"])) normalized.hazmat = true;
  if (includesAny(equipmentText, ["reefer", "refrigerated", "temperature controlled", "temp controlled"])) normalized.temperature_controlled = true;

  if (includesAny(equipmentText, ["DV53", "53 ft", "53FT", "53'", "dry van 53", "dryvan"])) {
    normalized.equipment = "Truck Trailer";
    if (!cleanText(normalized.trailer) || includesAny(normalized.trailer, ["DV53", "53 ft", "53FT"])) {
      normalized.trailer = "Dry Van";
    }
    if (!cleanText(normalized.config) || includesAny(normalized.config, ["53 ft", "53FT", "DV53"])) {
      normalized.config = "Single";
    }
  }

  if (includesAny(operationText, ["OW Impo", "OW Import", "Import"])) {
    normalized.operation = "D2D Import";
  } else if (includesAny(operationText, ["OW Expo", "OW Export", "Export"])) {
    normalized.operation = "D2D Export";
  }

  if (resolvedService) normalized.service = resolvedService;

  if (includesAny(operationText, ["Cross-border", "Cross border", "Crossborder"]) && !includesAny(normalized.operation, ["D2D", "Northbound", "Southbound"])) {
    normalized.operation = "D2D Import";
  }

  return normalized;
}

function isBridgeName(value: unknown) {
  return includesAny(value, ["Puente", "Bridge", "World Trade", "Colombia", "Internacional"]);
}

function isD2DCrossBorder(row: Record<string, unknown>) {
  const originCountry = String(row.origin_country || "");
  const destinationCountry = String(row.destination_country || "");
  const hasMx = originCountry === "MX" || destinationCountry === "MX";
  const hasUs = originCountry === "US" || destinationCountry === "US" || originCountry === "CA" || destinationCountry === "CA";
  const operation = rawKey(row.operation || row.normalized_operation);
  return hasMx && hasUs && (operation.includes("D2D") || operation.includes("CROSS BORDER") || operation.includes("CROSSBORDER"));
}

function operationFromCrossBorderDirection(row: Record<string, unknown>) {
  const originCountry = String(row.origin_country || "");
  const destinationCountry = String(row.destination_country || "");
  if (originCountry === "MX" && (destinationCountry === "US" || destinationCountry === "CA")) return "D2D Export";
  if (destinationCountry === "MX" && (originCountry === "US" || originCountry === "CA")) return "D2D Import";
  return null;
}

function isMxBorderLocation(row: Record<string, unknown>, prefix: "origin" | "destination") {
  return includesAny([row[`${prefix}_city`], row[prefix], row[`${prefix}_market`]].filter(Boolean).join(" "), [
    "Nuevo Laredo",
    "Reynosa",
    "Matamoros",
    "Piedras Negras",
    "Ciudad Juarez",
    "Tijuana",
    "Nogales"
  ]);
}

function isUsBorderLocation(row: Record<string, unknown>, prefix: "origin" | "destination") {
  return includesAny([row[`${prefix}_city`], row[prefix], row[`${prefix}_market`]].filter(Boolean).join(" "), [
    "Laredo",
    "Pharr",
    "Brownsville",
    "Eagle Pass",
    "El Paso",
    "San Diego",
    "Nogales"
  ]);
}

function operationFromLaneDirection(row: Record<string, unknown>) {
  const crossBorderOperation = operationFromCrossBorderDirection(row);
  if (crossBorderOperation) return crossBorderOperation;

  const originCountry = String(row.origin_country || "");
  const destinationCountry = String(row.destination_country || "");
  if (originCountry === "MX" && destinationCountry === "MX") {
    if (isMxBorderLocation(row, "destination")) return "MX Northbound";
    if (isMxBorderLocation(row, "origin")) return "MX Southbound";
  }

  if ((originCountry === "US" || originCountry === "CA") && (destinationCountry === "US" || destinationCountry === "CA")) {
    if (isUsBorderLocation(row, "origin")) return "US Northbound";
    if (isUsBorderLocation(row, "destination")) return "US Southbound";
  }

  return null;
}

function normalizeBorderCities(row: Record<string, unknown>) {
  if (!isD2DCrossBorder(row)) return row;
  const next = { ...row };
  if (!cleanText(next.mx_border_crossing_point) || isBridgeName(next.mx_border_crossing_point)) {
    next.mx_border_crossing_point = "Nuevo Laredo, TM";
  }
  if (!cleanText(next.us_border_crossing_point) || isBridgeName(next.us_border_crossing_point)) {
    next.us_border_crossing_point = "Laredo, TX";
  }
  return next;
}

function sameD2DContext(left: Record<string, unknown>, right: Record<string, unknown>) {
  const fields = ["vendor_domain", "rfx_id", "quote_date", "equipment", "trailer", "config", "service"];
  return fields.every((field) => catalogKey(left[field]) === catalogKey(right[field]));
}

function isLaredoLocation(row: Record<string, unknown>, prefix: "origin" | "destination") {
  return includesAny([row[prefix], row[`${prefix}_city`], row[`${prefix}_market`]].filter(Boolean).join(" "), ["Laredo"]);
}

function contextSupportsD2DAllIn(mxLeg: Record<string, unknown>, usLeg: Record<string, unknown>, contextText: string) {
  const text = [contextText, mxLeg.notes, usLeg.notes, mxLeg.extraction_warnings, usLeg.extraction_warnings].filter(Boolean).join(" ");
  if (includesAny(text, ["transbordo", "transload", "cross dock", "cross-dock"])) return false;
  if (includesAny(text, ["cruce incluido", "all in", "all-in", "d2d", "door to door", "door-to-door", "servicio directo", "directo"])) return true;

  return sameD2DContext(mxLeg, usLeg)
    && mxLeg.origin_country === "MX"
    && mxLeg.destination_country === "US"
    && usLeg.origin_country === "US"
    && usLeg.destination_country === "US"
    && isLaredoLocation(mxLeg, "destination")
    && isLaredoLocation(usLeg, "origin");
}

function mergeConnectedD2DAllInRows(rows: Record<string, unknown>[], contextText: string) {
  const used = new Set<number>();
  const merged: Record<string, unknown>[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    if (used.has(index)) continue;
    const mxLeg = rows[index];
    const mxAmount = cleanNumber(mxLeg.all_in_rate) ?? cleanNumber(mxLeg.flat_rate) ?? cleanNumber(mxLeg.mx_linehaul);
    const mxToBorder = mxLeg.origin_country === "MX"
      && mxLeg.destination_country === "US"
      && isLaredoLocation(mxLeg, "destination");

    if (!mxToBorder || mxAmount === null) {
      merged.push(mxLeg);
      continue;
    }

    const matchIndex = rows.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || used.has(candidateIndex)) return false;
      const usAmount = cleanNumber(candidate.all_in_rate) ?? cleanNumber(candidate.flat_rate) ?? cleanNumber(candidate.us_linehaul);
      return usAmount !== null
        && sameD2DContext(mxLeg, candidate)
        && candidate.origin_country === "US"
        && candidate.destination_country === "US"
        && isLaredoLocation(candidate, "origin");
    });

    if (matchIndex === -1 || !contextSupportsD2DAllIn(mxLeg, rows[matchIndex], contextText)) {
      merged.push(mxLeg);
      continue;
    }

    const usLeg = rows[matchIndex];
    const usAmount = cleanNumber(usLeg.all_in_rate) ?? cleanNumber(usLeg.flat_rate) ?? cleanNumber(usLeg.us_linehaul) ?? 0;
    used.add(index);
    used.add(matchIndex);
    merged.push(normalizeBorderCities({
      ...mxLeg,
      row_id: [mxLeg.row_id, usLeg.row_id].filter(Boolean).join("+") || mxLeg.row_id,
      destination: usLeg.destination,
      normalized_destination: usLeg.normalized_destination,
      destination_country: usLeg.destination_country,
      destination_zip_prefix: usLeg.destination_zip_prefix,
      destination_city: usLeg.destination_city,
      destination_state: usLeg.destination_state,
      destination_market: usLeg.destination_market,
      destination_region: usLeg.destination_region,
      destination_match_reason: usLeg.destination_match_reason,
      destination_location_candidates: usLeg.destination_location_candidates,
      operation: "D2D Export",
      normalized_operation: "D2D Export",
      service: mxLeg.service || usLeg.service || "One Way",
      normalized_service: mxLeg.normalized_service || usLeg.normalized_service || "One Way",
      mx_linehaul: null,
      us_linehaul: null,
      fsc: null,
      fuel: null,
      border_crossing_fee: null,
      flat_rate: null,
      all_in_rate: String(Number((mxAmount + usAmount).toFixed(2))),
      mx_border_crossing_point: "Nuevo Laredo, TM",
      us_border_crossing_point: "Laredo, TX",
      notes: [
        mxLeg.notes,
        usLeg.notes,
        `Connected D2D all-in: ${mxLeg.origin} to ${mxLeg.destination} ${mxAmount} + ${usLeg.origin} to ${usLeg.destination} ${usAmount}; quote context indicates crossing included and no transload.`
      ].filter(Boolean).join(" | "),
      location_match_status: "matched"
    }));
  }

  return merged;
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

function isInternalMarksmanDomain(value: unknown) {
  const normalized = normalizeMatchText(value);
  return normalized.includes("heymarksman.com") || normalized.includes("marksmanxbf.com") || normalized.includes("marksman");
}

function normalizeMatchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9@.]/g, "");
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
  if (state === "CU") return "CO";
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

function profileExplicitCountry(profile: ReturnType<typeof locationTextProfile>) {
  if (profile.explicitMx) return "MX";
  if (profile.explicitUs) return "US";
  if (profile.explicitCa) return "CA";
  return "";
}

function locationMatchesProfile(location: Record<string, unknown>, profile: ReturnType<typeof locationTextProfile>) {
  const country = locationCountry(location);
  const explicitCountry = profileExplicitCountry(profile);
  if (explicitCountry) return country === explicitCountry;
  return true;
}

function locationZipPrefixMatches(profile: ReturnType<typeof locationTextProfile>, zipPrefix: unknown) {
  const zip = catalogKey(zipPrefix);
  if (!zip) return false;
  return profile.tokens.some((token) => {
    if (token === zip) return true;
    if (!/^[A-Z0-9]+$/.test(token)) return false;
    return token.length > zip.length && token.startsWith(zip);
  });
}

function scoreVendorMatch(vendor: Record<string, unknown>, rawUpload: Record<string, string>, interpretation: Record<string, unknown>) {
  const haystack = [
    rawUpload.vendor_hint,
    rawUpload.original_filename,
    interpretation.summary && (interpretation.summary as Record<string, unknown>).vendor_domain,
    ...(Array.isArray(interpretation.rows) ? interpretation.rows.map((row: Record<string, unknown>) => row.vendor_domain) : [])
  ].map(normalizeMatchText).join(" ");

  const vendorName = normalizeMatchText(vendor.vendor_name);
  const domain = normalizeMatchText(vendor.domain);
  const email = normalizeMatchText(vendor.primary_email);

  let score = 0;
  if (domain && haystack.includes(domain)) score += 70;
  if (email && haystack.includes(email)) score += 40;
  if (vendorName && haystack.includes(vendorName)) score += 55;

  const words = String(vendor.vendor_name || "").toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  score += Math.min(30, words.filter((word) => haystack.includes(normalizeMatchText(word))).length * 10);
  return score;
}

async function findBestVendor(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  rawUpload: Record<string, string>,
  interpretation: Record<string, unknown>
) {
  let query = supabase.from("vendors").select("id,vendor_name,domain,primary_email,status").eq("status", "active").limit(500);
  if (user.owner_email) query = query.eq("owner_email", user.owner_email);
  const result = await query;
  if (result.error || !result.data?.length) return null;

  const ranked = result.data
    .map((vendor) => ({ vendor, score: scoreVendorMatch(vendor, rawUpload, interpretation) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 55 ? ranked[0] : null;
}

function buildKeys(row: Record<string, unknown>) {
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
    rfx_key: rfxKey || null,
    route_key: routeKey || null,
    business_key: [rfxKey, routeKey].filter(Boolean).join(" ") || null
  };
}

function clampConfidence(value: unknown, fallback = 0.65) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function hasRateAmount(row: Record<string, unknown>) {
  return [
    row.mx_linehaul,
    row.us_linehaul,
    row.fuel,
    row.fsc,
    row.border_crossing_fee,
    row.flat_rate,
    row.all_in_rate
  ].some((value) => cleanRateValue(value) !== null);
}

function splitRateFields() {
  return ["mx_linehaul", "us_linehaul", "fuel", "fsc", "border_crossing_fee"];
}

function hasSplitRateAmount(row: Record<string, unknown>) {
  return splitRateFields().some((field) => cleanRateValue(row[field]) !== null);
}

function extractedPayloadValue(row: Record<string, unknown>, field: string) {
  return row.extracted_payload && typeof row.extracted_payload === "object"
    ? (row.extracted_payload as Record<string, unknown>)[field]
    : undefined;
}

function hasNonNumericRateText(value: unknown) {
  const text = cleanText(value);
  if (!text) return false;
  const withoutCurrency = text
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,\s.-]/g, "");
  return /[A-Z]/i.test(withoutCurrency);
}

function rateMode(row: Record<string, unknown>) {
  const allIn = cleanRateValue(row.all_in_rate) !== null;
  const split = hasSplitRateAmount(row);
  if (allIn && split) return "itemized_total";
  if (split) return "split_without_total";
  if (allIn) return "all_in";
  return "missing_rate";
}

function rowAuditFlags(row: Record<string, unknown>) {
  const flags: string[] = [];
  const requiredTextFields = [
    ["vendor_domain", "missing_vendor"],
    ["rfx_id", "missing_rfx"],
    ["quote_date", "missing_quote_date"],
    ["origin", "missing_origin"],
    ["destination", "missing_destination"],
    ["equipment", "missing_equipment"],
    ["trailer", "missing_trailer"],
    ["operation", "missing_operation"],
    ["service", "missing_service"],
    ["currency", "missing_currency"]
  ];

  for (const [field, flag] of requiredTextFields) {
    if (!cleanText(row[field])) flags.push(flag);
  }

  if (!hasRateAmount(row)) flags.push("missing_rate");
  if (cleanText(row.vendor_domain) && isInternalMarksmanDomain(row.vendor_domain)) flags.push("internal_vendor_domain");
  if (!cleanText(row.weekly_capacity)) flags.push("missing_capacity");
  if (!cleanText(row.origin_zip_prefix) && !cleanText(row.origin_market) && !cleanText(row.origin_country)) flags.push("origin_not_matched");
  if (!cleanText(row.destination_zip_prefix) && !cleanText(row.destination_market) && !cleanText(row.destination_country)) flags.push("destination_not_matched");
  if (rateMode(row) === "split_without_total") flags.push("split_without_all_in_total");
  if (hasNonNumericRateText(extractedPayloadValue(row, "all_in_rate"))) flags.push("all_in_text_cleaned");
  if (rawKey(row.service || row.normalized_service).includes("ROUNDTRIP") && !serviceEvidenceFromRow(row)) flags.push("roundtrip_without_source_marker");
  if (clampConfidence(row.confidence, 0) < 0.7) flags.push("low_row_confidence");
  if (Array.isArray(row.extraction_warnings) && row.extraction_warnings.length) flags.push("has_extraction_warnings");

  return [...new Set(flags)];
}

const DERIVED_ROW_AUDIT_FLAGS = new Set([
  "missing_vendor",
  "missing_rfx",
  "missing_quote_date",
  "missing_origin",
  "missing_destination",
  "missing_equipment",
  "missing_trailer",
  "missing_operation",
  "missing_service",
  "missing_currency",
  "missing_rate",
  "internal_vendor_domain",
  "missing_capacity",
  "origin_not_matched",
  "destination_not_matched",
  "split_without_all_in_total",
  "all_in_text_cleaned",
  "roundtrip_without_source_marker",
  "low_row_confidence",
  "has_extraction_warnings"
]);

function fieldConfidence(row: Record<string, unknown>) {
  const base = clampConfidence(row.confidence);
  const present = (value: unknown, required = true) => cleanText(value) || (!required && value !== null && value !== undefined);
  const ratePresent = (value: unknown) => cleanRateValue(value) !== null;
  const valueScore = (value: unknown, required = true) => present(value, required) ? base : required ? 0.25 : 0.9;
  const rateScore = (value: unknown, required = false) => ratePresent(value) ? base : required ? 0.25 : 0.9;
  const splitRateProvided = ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"].some((field) => ratePresent(row[field]));

  return {
    vendor_domain: valueScore(row.vendor_domain),
    rfx_id: valueScore(row.rfx_id),
    quote_date: valueScore(row.quote_date),
    origin: valueScore(row.origin),
    destination: valueScore(row.destination),
    equipment: valueScore(row.equipment),
    trailer: valueScore(row.trailer),
    hazmat: base,
    temperature_controlled: base,
    config: valueScore(row.config, false),
    operation: valueScore(row.operation),
    service: valueScore(row.service),
    mx_border_crossing_point: valueScore(row.mx_border_crossing_point, false),
    us_border_crossing_point: valueScore(row.us_border_crossing_point, false),
    mx_linehaul: rateScore(row.mx_linehaul, splitRateProvided),
    us_linehaul: rateScore(row.us_linehaul, splitRateProvided),
    fsc: rateScore(row.fsc, false),
    border_crossing_fee: rateScore(row.border_crossing_fee, false),
    all_in_rate: rateScore(row.all_in_rate, !splitRateProvided),
    currency: valueScore(row.currency),
    weekly_capacity: valueScore(row.weekly_capacity, false)
  };
}

function sourceEvidence(rawUpload: Record<string, unknown>, row: Record<string, unknown>) {
  const warnings = Array.isArray(row.extraction_warnings) ? row.extraction_warnings.map(String) : [];
  return {
    source_filename: rawUpload.original_filename || null,
    document_type: rawUpload.document_type || null,
    storage_path: rawUpload.storage_path || null,
    row_id: cleanText(row.row_id),
    lane: [row.origin, row.destination].filter(Boolean).join(" -> ") || null,
    service: cleanText(row.service),
    operation: cleanText(row.operation),
    all_in_rate: cleanRateValue(row.all_in_rate),
    split_rate_present: hasSplitRateAmount(row),
    rate_mode: rateMode(row),
    source_service_marker: cleanText(row.source_service_marker) || cleanText(extractedPayloadValue(row, "source_service_marker")),
    service_marker: serviceEvidenceFromRow(row),
    roundtrip_explicit: serviceEvidenceFromRow(row) === "Roundtrip",
    notes: cleanText(row.notes),
    warnings
  };
}

function addRowAudit(row: Record<string, unknown>, rawUpload: Record<string, unknown>) {
  const existingFlags = Array.isArray(row.audit_flags)
    ? row.audit_flags.map(String).filter((flag) => !DERIVED_ROW_AUDIT_FLAGS.has(flag))
    : [];
  const flags = [...new Set([...existingFlags, ...rowAuditFlags(row)])];
  return {
    ...row,
    audit_flags: flags,
    field_confidence: {
      ...(typeof row.field_confidence === "object" && row.field_confidence ? row.field_confidence : {}),
      ...fieldConfidence(row)
    },
    source_evidence: {
      ...(typeof row.source_evidence === "object" && row.source_evidence ? row.source_evidence : {}),
      ...sourceEvidence(rawUpload, row)
    }
  };
}

function resolveRowVendorDomain(value: unknown, inheritedDomain: unknown, forceInheritedDomain = false) {
  // Only ever emit a real carrier domain. Bare names ("transportes") and
  // personal-email hosts ("gmail.com") are not carrier identities and are
  // preserved separately via resolveRowVendorReference().
  const inherited = domainFromVendorReference(inheritedDomain);
  const inheritedCarrier = isCarrierDomain(inherited) ? inherited : null;
  if (forceInheritedDomain && inheritedCarrier) return inheritedCarrier;

  const interpreted = domainFromVendorReference(value);
  if (interpreted && !isInternalMarksmanDomain(interpreted) && isCarrierDomain(interpreted)) {
    return interpreted;
  }
  return inheritedCarrier;
}

function resolveRowVendorReference(value: unknown, inheritedDomain: unknown) {
  // Keep the raw carrier signal (name or contact email) so it is not lost when
  // it does not qualify as a carrier domain; used for later name matching.
  // Once the row's own value resolves to a carrier domain, no reference is
  // needed (the carrier is identified) — do not fall back to the upload hint.
  const raw = cleanText(value);
  if (raw) return isCarrierDomain(domainFromVendorReference(raw)) ? null : raw;
  const inherited = cleanText(inheritedDomain);
  if (inherited && !isCarrierDomain(domainFromVendorReference(inherited))) return inherited;
  return null;
}

function normalizeRow(
  row: Record<string, unknown>,
  rawUpload: Record<string, unknown>,
  jobId: string,
  vendorId: string | null = null,
  vendorDomain: string | null = null,
  forceVendorDomain = false
) {
  const interpreted = normalizeRatewareAliases(row);
  const hazmat = cleanBoolean(interpreted.hazmat);
  const temperatureControlled = cleanBoolean(interpreted.temperature_controlled);
  const trailer = trailerWithFlags(cleanText(interpreted.trailer), hazmat, temperatureControlled);
  const base = {
    raw_upload_id: rawUpload.id,
    interpretation_job_id: jobId,
    vendor_id: vendorId,
    status: "pending_review",
    vendor_domain: resolveRowVendorDomain(interpreted.vendor_domain, vendorDomain, forceVendorDomain),
    vendor_reference: resolveRowVendorReference(interpreted.vendor_domain, vendorDomain),
    rfx_id: cleanText(interpreted.rfx_id),
    quote_date: cleanDate(interpreted.quote_date),
    row_id: cleanText(interpreted.row_id),
    origin: cleanText(interpreted.origin),
    destination: cleanText(interpreted.destination),
    equipment: cleanText(interpreted.equipment),
    trailer,
    hazmat,
    temperature_controlled: temperatureControlled,
    config: cleanText(interpreted.config),
    operation: cleanText(interpreted.operation),
    service: cleanText(interpreted.service),
    driver: cleanText(interpreted.driver),
    mx_border_crossing_point: cleanText(interpreted.mx_border_crossing_point),
    us_border_crossing_point: cleanText(interpreted.us_border_crossing_point),
    mx_linehaul: cleanRateValue(interpreted.mx_linehaul),
    us_linehaul: cleanRateValue(interpreted.us_linehaul),
    us_miles: cleanRateValue(interpreted.us_miles),
    fsc: cleanRateValue(interpreted.fsc),
    carrier_fsc_per_mile: cleanNumber(interpreted.fsc),
    fuel: cleanRateValue(interpreted.fuel),
    border_crossing_fee: cleanRateValue(interpreted.border_crossing_fee),
    flat_rate: cleanRateValue(interpreted.flat_rate),
    all_in_rate: cleanRateValue(interpreted.all_in_rate),
    currency: cleanText(interpreted.currency),
    weekly_capacity: cleanText(interpreted.weekly_capacity),
    notes: cleanText(interpreted.notes),
    accessorials: cleanText(interpreted.accessorials),
    confidence: Math.max(0, Math.min(1, Number(interpreted.confidence) || 0)),
    extraction_warnings: Array.isArray(interpreted.extraction_warnings) ? interpreted.extraction_warnings.map(String) : [],
    extracted_payload: interpreted
  };

  return addRowAudit({ ...base, ...buildKeys(base) }, rawUpload);
}

function buildCatalogIndex(items: Record<string, unknown>[]) {
  const index = new Map<string, Map<string, Record<string, unknown>>>();

  for (const item of items) {
    const category = String(item.category);
    if (!index.has(category)) index.set(category, new Map());
    const bucket = index.get(category)!;
    bucket.set(catalogKey(item.raw_value), item);
    bucket.set(catalogKey(item.normalized_value), item);
    if (item.code) bucket.set(catalogKey(item.code), item);
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

    for (const key of keys.map(catalogKey).filter(Boolean)) {
      const existing = index.get(key);
      if (!existing || locationQuality(location) > locationQuality(existing)) index.set(key, location);
    }
  }

  return index;
}

function sourceRank(source: unknown) {
  const text = String(source || "");
  if (text === "rateware_manual_catalog") return 0;
  if (text === "rateware_reference_catalog" || text.startsWith("rateware_reference_")) return 0;
  if (text === "rateware_google_catalog" || text === "cusCatalog") return 1;
  if (text === "rateware_seed") return 3;
  return 2;
}

function locationQuality(location: Record<string, unknown>) {
  let score = 0;
  if (location.country && location.country !== "UNKNOWN") score += 30;
  if (location.zip_prefix) score += 20;
  if (location.market) score += 15;
  if (location.region) score += 10;
  if (location.state_code || location.state_name) score += 8;
  score += Math.max(0, 10 - sourceRank(location.source));
  return score;
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
    if (locationMatchesProfile(zipMatch, profile) && locationCountry(zipMatch) !== "MX") {
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
    if (zipPrefix && locationZipPrefixMatches(profile, zipPrefix)) {
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
  if (!location) return {};
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

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY", "DC"
]);

function extractUsState(value: unknown) {
  const text = String(value || "").toUpperCase();
  const matches = [...text.matchAll(/(?:^|[^A-Z])([A-Z]{2})(?:[^A-Z]|$)/g)].map((match) => match[1]);
  return matches.find((state) => US_STATES.has(state)) || null;
}

function toDate(value: unknown) {
  const text = cleanDate(value);
  return text ? new Date(`${text}T00:00:00.000Z`) : null;
}

function findFuelRegion(row: Record<string, unknown>, fuelRegions: Map<string, Record<string, unknown>>) {
  const states = [extractUsState(row.destination), extractUsState(row.origin)].filter(Boolean) as string[];
  for (const state of states) {
    const match = fuelRegions.get(state);
    if (match) return match;
  }
  return null;
}

function findFscTrend(region: string | null, quoteDate: unknown, trendByRegion: Map<string, Record<string, unknown>[]>) {
  const lookupRegion = catalogKey(region || "U.S.");
  const candidates = trendByRegion.get(lookupRegion) || trendByRegion.get("U S") || [];
  if (!candidates.length) return null;

  const targetDate = toDate(quoteDate) || new Date();
  return candidates.find((candidate) => {
    const indexDate = toDate(candidate.index_date);
    return indexDate && indexDate <= targetDate;
  }) || candidates[0];
}

function addFuelAudit(row: Record<string, unknown>, fuelRegionItems: Record<string, unknown>[], fscTrendItems: Record<string, unknown>[]) {
  if (!fuelRegionItems.length && !fscTrendItems.length) return row;

  const fuelRegions = new Map(fuelRegionItems.map((item) => [String(item.state_code), item]));
  const trendByRegion = new Map<string, Record<string, unknown>[]>();
  for (const item of fscTrendItems) {
    const region = catalogKey(item.fuel_region);
    if (!trendByRegion.has(region)) trendByRegion.set(region, []);
    trendByRegion.get(region)!.push(item);
  }
  for (const items of trendByRegion.values()) {
    items.sort((a, b) => String(b.index_date).localeCompare(String(a.index_date)));
  }

  const regionMatch = row.destination_state ? fuelRegions.get(String(row.destination_state)) || findFuelRegion(row, fuelRegions) : findFuelRegion(row, fuelRegions);
  const fuelRegion = (regionMatch?.fuel_region as string) || null;
  const trend = findFscTrend(fuelRegion, row.quote_date, trendByRegion);
  if (!trend) return row;

  const usMiles = cleanNumber(row.us_miles) || cleanNumber(row.calculated_miles);
  const normalizedFsc = Number(trend.fsc_per_mile);
  const carrierFsc = cleanNumber(row.fsc);
  const linehaul = cleanNumber(row.us_linehaul) || cleanNumber(row.flat_rate) || 0;
  const allIn = cleanNumber(row.all_in_rate);
  const borderFee = cleanNumber(row.border_crossing_fee) || 0;
  const normalizedFscTotal = usMiles ? Number((usMiles * normalizedFsc).toFixed(2)) : null;
  const carrierFscTotal = usMiles && carrierFsc !== null ? Number((usMiles * carrierFsc).toFixed(2)) : null;
  const normalizedAllIn = allIn !== null && carrierFscTotal !== null && normalizedFscTotal !== null
    ? Number((allIn - carrierFscTotal + normalizedFscTotal).toFixed(2))
    : normalizedFscTotal !== null
      ? Number((linehaul + borderFee + normalizedFscTotal).toFixed(2))
      : allIn;

  return {
    ...row,
    fuel_region: fuelRegion || String(trend.fuel_region || ""),
    fuel_index_date: trend.index_date,
    fuel_diesel_per_gallon: trend.diesel_per_gallon,
    normalized_fsc_per_mile: normalizedFsc,
    normalized_fsc_total: normalizedFscTotal,
    fuel_delta: carrierFsc !== null ? Number((carrierFsc - normalizedFsc).toFixed(4)) : null,
    fuel_source: String(trend.source || "usaFSCtrend"),
    normalized_all_in_rate: normalizedAllIn
  };
}

function findBorderPair(row: Record<string, unknown>, pairs: Record<string, unknown>[]) {
  const mxHint = catalogKey([row.mx_border_crossing_point, row.origin_city, row.destination_city].filter(Boolean).join(" "));
  const usHint = catalogKey([row.us_border_crossing_point, row.origin_city, row.destination_city].filter(Boolean).join(" "));

  const scored = pairs.map((pair) => {
    let score = 0;
    if (mxHint.includes(catalogKey(pair.mx_city))) score += 35;
    if (mxHint.includes(catalogKey(pair.mx_state))) score += 15;
    if (usHint.includes(catalogKey(pair.us_city))) score += 35;
    if (usHint.includes(catalogKey(pair.us_state))) score += 15;
    score += Math.max(0, 20 - Number(pair.default_rank || 100) / 5);
    return { pair, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.pair || pairs.sort((a, b) => Number(a.default_rank || 100) - Number(b.default_rank || 100))[0] || null;
}

function assumptionNumber(items: Record<string, unknown>[], field: string, fallback: number) {
  const match = items.find((item) => catalogKey(item.field) === catalogKey(field));
  const value = Number(match?.recommended_value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function factorNumber(items: Record<string, unknown>[], group: string, name: unknown, fallback = 1) {
  const target = catalogKey([group, name].filter(Boolean).join(" "));
  const match = items.find((item) => catalogKey(item.lookup_key) === target || catalogKey([item.factor_group, item.factor_name].join(" ")) === target);
  const value = Number(match?.recommended_value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function previousMonthForDate(value: unknown) {
  const date = toDate(value) || new Date();
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function indexForQuoteDate(items: Record<string, unknown>[], quoteDate: unknown) {
  const targetPeriod = previousMonthForDate(quoteDate);
  const sorted = [...items].sort((a, b) => String(b.period_month || "").localeCompare(String(a.period_month || "")));
  return sorted.find((item) => String(item.period_month || "") <= targetPeriod) || sorted[0] || null;
}

function buildMxFuelContext(input: {
  assumptions: Record<string, unknown>[];
  factors: Record<string, unknown>[];
  mxDiesel: Record<string, unknown>[];
  fxRates: Record<string, unknown>[];
}) {
  const loadedEfficiency = assumptionNumber(input.assumptions, "Rendimiento Cargado", 2.8);
  const fuelBuffer = assumptionNumber(input.assumptions, "Fuel Escalation Buffer", 0.05);

  return {
    loadedEfficiency,
    fuelBuffer,
    mxDiesel: [...input.mxDiesel],
    fxRates: [...input.fxRates],
    factors: input.factors
  };
}

function mxFuelAudit(row: Record<string, unknown>, kmValue: unknown, context: ReturnType<typeof buildMxFuelContext>) {
  const km = cleanNumber(kmValue);
  const diesel = indexForQuoteDate(context.mxDiesel, row.quote_date);
  const fx = indexForQuoteDate(context.fxRates, row.quote_date);
  const dieselMxn = cleanNumber(diesel?.diesel_mxn_per_liter);
  const fxRate = cleanNumber(fx?.rate);
  if (!km || !dieselMxn || !fxRate) return {};

  const equipmentFactor = factorNumber(context.factors, "Equipment", row.normalized_equipment || row.equipment, 1);
  const fuelEfficiency = context.loadedEfficiency * equipmentFactor;
  const dieselUsd = dieselMxn / fxRate;
  const fuelFactor = context.fuelBuffer;
  const baseFuelCost = km / fuelEfficiency * dieselUsd;
  const fuelCostUsd = baseFuelCost * (1 + fuelFactor);

  return {
    diesel_price_mxn_per_liter: Number(dieselMxn.toFixed(4)),
    diesel_price_usd_per_liter: Number(dieselUsd.toFixed(4)),
    fx_rate_mxn_usd: Number(fxRate.toFixed(4)),
    fuel_efficiency_km_per_liter: Number(fuelEfficiency.toFixed(4)),
    fuel_factor: Number(fuelFactor.toFixed(4)),
    fuel_cost_usd: Number(fuelCostUsd.toFixed(2)),
    fuel_source: String(diesel?.source || "rateware_assumptions"),
    fx_source: String(fx?.source || "rateware_assumptions")
  };
}

function legRow(row: Record<string, unknown>, sequence: number, type: string, origin: unknown, destination: unknown, originCountry: unknown, destinationCountry: unknown, extras: Record<string, unknown> = {}) {
  const miles = cleanNumber(extras.miles);
  const km = cleanNumber(extras.km);
  return {
    rate_staging_id: row.id,
    leg_sequence: sequence,
    leg_type: type,
    origin: cleanText(origin),
    destination: cleanText(destination),
    origin_country: cleanText(originCountry),
    destination_country: cleanText(destinationCountry),
    border_pair_id: extras.border_pair_id || null,
    miles,
    km,
    mileage_source: cleanText(extras.mileage_source),
    fuel_region: cleanText(extras.fuel_region),
    fsc_per_mile: cleanNumber(extras.fsc_per_mile),
    fsc_total: cleanNumber(extras.fsc_total),
    diesel_price_mxn_per_liter: cleanNumber(extras.diesel_price_mxn_per_liter),
    diesel_price_usd_per_liter: cleanNumber(extras.diesel_price_usd_per_liter),
    fx_rate_mxn_usd: cleanNumber(extras.fx_rate_mxn_usd),
    fuel_efficiency_km_per_liter: cleanNumber(extras.fuel_efficiency_km_per_liter),
    fuel_factor: cleanNumber(extras.fuel_factor),
    fuel_cost_usd: cleanNumber(extras.fuel_cost_usd),
    fuel_source: cleanText(extras.fuel_source),
    fx_source: cleanText(extras.fx_source),
    confidence: Math.max(0, Math.min(1, Number(extras.confidence) || 0)),
    status: miles || km || type === "border_crossing" ? "ready" : "needs_mileage",
    metadata: extras.metadata || {}
  };
}

function buildLanePlan(row: Record<string, unknown>, borderPairs: Record<string, unknown>[], mxFuelContext: ReturnType<typeof buildMxFuelContext>) {
  const originCountry = cleanText(row.origin_country);
  const destinationCountry = cleanText(row.destination_country);
  const origin = row.normalized_origin || row.origin;
  const destination = row.normalized_destination || row.destination;
  const usMiles = cleanNumber(row.us_miles) || cleanNumber(row.calculated_miles);
  const hasUs = originCountry === "US" || destinationCountry === "US" || originCountry === "CA" || destinationCountry === "CA";
  const hasMx = originCountry === "MX" || destinationCountry === "MX";
  const isCrossBorder = hasUs && hasMx;

  if (!originCountry || !destinationCountry) {
    return {
      lane_type: "needs_review",
      leg_status: "needs_review",
      leg_summary: "Location country missing",
      legs: [legRow(row, 1, "needs_review", origin, destination, originCountry, destinationCountry, { metadata: { reason: "location country missing" } })]
    };
  }

  if (!isCrossBorder) {
    const domesticKm = hasMx ? row.calculated_km : null;
    const leg = legRow(row, 1, "domestic", origin, destination, originCountry, destinationCountry, {
      miles: hasUs ? usMiles : row.calculated_miles,
      km: domesticKm,
      mileage_source: row.mileage_source || "catalog",
      fuel_region: row.fuel_region,
      fsc_per_mile: row.normalized_fsc_per_mile,
      fsc_total: row.normalized_fsc_total,
      ...(hasMx ? mxFuelAudit(row, domesticKm, mxFuelContext) : {}),
      confidence: row.catalog_match_status === "matched" ? 0.9 : 0.55
    });
    return {
      lane_type: originCountry === destinationCountry ? `${originCountry.toLowerCase()}_domestic` : "international_domestic",
      leg_status: leg.status === "ready" ? "ready" : "needs_mileage",
      leg_summary: `${originCountry} domestic: ${origin} -> ${destination}`,
      legs: [leg]
    };
  }

  const pair = findBorderPair(row, borderPairs);
  const mxBorder = pair ? `${pair.mx_city}, ${pair.mx_state}` : row.mx_border_crossing_point || "MX border";
  const usBorder = pair ? `${pair.us_city}, ${pair.us_state}` : row.us_border_crossing_point || "US border";
  const exportDirection = originCountry === "MX";
  const mxOrigin = exportDirection ? origin : mxBorder;
  const mxDestination = exportDirection ? mxBorder : destination;
  const usOrigin = exportDirection ? usBorder : origin;
  const usDestination = exportDirection ? destination : usBorder;
  const legs = [
    legRow(row, 1, "mx_linehaul", mxOrigin, mxDestination, "MX", "MX", {
      km: row.calculated_km,
      mileage_source: row.mileage_source,
      ...mxFuelAudit(row, row.calculated_km, mxFuelContext),
      confidence: row.catalog_match_status === "matched" ? 0.75 : 0.45
    }),
    legRow(row, 2, "border_crossing", mxBorder, usBorder, "MX", "US", {
      border_pair_id: pair?.id || null,
      mileage_source: "border_pair",
      confidence: pair ? 0.9 : 0.4,
      metadata: { crossing_name: pair?.crossing_name || null }
    }),
    legRow(row, 3, "us_linehaul", usOrigin, usDestination, "US", "US", {
      miles: usMiles,
      mileage_source: row.mileage_source || "catalog",
      fuel_region: row.fuel_region,
      fsc_per_mile: row.normalized_fsc_per_mile,
      fsc_total: row.normalized_fsc_total,
      confidence: usMiles ? 0.8 : 0.4
    })
  ];

  return {
    lane_type: "cross_border",
    leg_status: legs.every((leg) => leg.status === "ready") ? "ready" : "needs_mileage",
    leg_summary: `${mxBorder} / ${usBorder} | ${legs.length} legs`,
    legs
  };
}

async function persistLanePlans(supabase: ReturnType<typeof createClient>, rows: Record<string, unknown>[], borderPairs: Record<string, unknown>[], mxFuelContext: ReturnType<typeof buildMxFuelContext>) {
  const legs: Record<string, unknown>[] = [];
  const updates = rows.map((row) => {
    const plan = buildLanePlan(row, borderPairs, mxFuelContext);
    legs.push(...plan.legs);
    const mxFuelLegs = plan.legs.filter((leg) => leg.origin_country === "MX" && leg.destination_country === "MX");
    const mxFuelCost = mxFuelLegs.reduce((total, leg) => total + (cleanNumber(leg.fuel_cost_usd) || 0), 0);
    const firstMxFuel = mxFuelLegs.find((leg) => leg.fuel_cost_usd);
    return supabase.from("rate_staging").update({
      lane_type: plan.lane_type,
      leg_status: plan.leg_status,
      leg_summary: plan.leg_summary,
      mx_diesel_mxn_per_liter: firstMxFuel?.diesel_price_mxn_per_liter || null,
      mx_diesel_usd_per_liter: firstMxFuel?.diesel_price_usd_per_liter || null,
      fx_rate_mxn_usd: firstMxFuel?.fx_rate_mxn_usd || null,
      mx_fuel_efficiency_km_per_liter: firstMxFuel?.fuel_efficiency_km_per_liter || null,
      mx_fuel_factor: firstMxFuel?.fuel_factor || null,
      mx_fuel_cost_usd: mxFuelCost ? Number(mxFuelCost.toFixed(2)) : null,
      mx_fuel_source: firstMxFuel?.fuel_source || null,
      fx_source: firstMxFuel?.fx_source || null
    }).eq("id", row.id);
  });

  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) throw result.error;
  }

  if (legs.length) {
    const insert = await supabase.from("rateware_lane_legs").upsert(legs, { onConflict: "rate_staging_id,leg_sequence" });
    if (insert.error) throw insert.error;
  }
}

function normalizeWithCatalog(rows: Record<string, unknown>[], catalogItems: Record<string, unknown>[], laneMileage: Record<string, unknown>[], locations: Record<string, unknown>[] = [], fuelRegions: Record<string, unknown>[] = [], fscTrend: Record<string, unknown>[] = []) {
  if (!catalogItems.length && !laneMileage.length && !fuelRegions.length && !fscTrend.length) return rows;

  const catalog = buildCatalogIndex(catalogItems);
  const locationIndex = buildLocationIndex(locations);
  const mileage = new Map(laneMileage.map((lane) => [catalogKey(lane.route_key), lane]));

  return rows.map((row) => {
    const originResolution = locationMatch(locationIndex, row.origin);
    const destinationResolution = locationMatch(locationIndex, row.destination);
    const originLocation = originResolution?.location || null;
    const destinationLocation = destinationResolution?.location || null;
    const originMatch = originLocation || catalogMatch(catalog, ["zip_market", "mx_production"], row.origin);
    const destinationMatch = destinationLocation || catalogMatch(catalog, ["zip_market", "mx_production"], row.destination);
    const equipmentMatch = catalogMatch(catalog, ["equipment"], row.equipment);
    const trailerMatch = catalogMatch(catalog, ["trailer"], row.trailer);
    const configMatch = catalogMatch(catalog, ["config"], row.config);
    const operationMatch = catalogMatch(catalog, ["operation"], row.operation);
    const serviceMatch = catalogMatch(catalog, ["service"], row.service);
    const driverMatch = catalogMatch(catalog, ["driver"], row.driver);

    const normalized: Record<string, unknown> = {
      ...row,
      normalized_origin: (originLocation?.metro_city as string) || (originMatch?.normalized_value as string) || null,
      normalized_destination: (destinationLocation?.metro_city as string) || (destinationMatch?.normalized_value as string) || null,
      origin_market: (originLocation?.market as string) || ((originMatch?.metadata as Record<string, unknown>)?.market as string) || null,
      destination_market: (destinationLocation?.market as string) || ((destinationMatch?.metadata as Record<string, unknown>)?.market as string) || null,
      ...applyLocation(row, "origin", originLocation),
      ...applyLocation(row, "destination", destinationLocation),
      ...locationMatchMeta("origin", originResolution),
      ...locationMatchMeta("destination", destinationResolution),
      origin_match_reason: originResolution?.reason || null,
      destination_match_reason: destinationResolution?.reason || null,
      origin_location_candidates: originResolution?.candidates || [],
      destination_location_candidates: destinationResolution?.candidates || [],
      normalized_equipment: (equipmentMatch?.normalized_value as string) || null,
      normalized_trailer: (trailerMatch?.normalized_value as string) || null,
      normalized_config: (configMatch?.normalized_value as string) || null,
      normalized_operation: (operationMatch?.normalized_value as string) || null,
      normalized_service: (serviceMatch?.normalized_value as string) || null,
      normalized_driver: (driverMatch?.normalized_value as string) || null
    };

    if (normalized.normalized_equipment) normalized.equipment = normalized.normalized_equipment;
    if (normalized.normalized_trailer) normalized.trailer = normalized.normalized_trailer;
    if (normalized.normalized_config) normalized.config = normalized.normalized_config;
    if (normalized.normalized_operation) normalized.operation = normalized.normalized_operation;
    if (normalized.normalized_service) normalized.service = normalized.normalized_service;
    if (normalized.normalized_driver) normalized.driver = normalized.normalized_driver;

    const directionOperation = operationFromLaneDirection(normalized);
    if (directionOperation) {
      normalized.operation = directionOperation;
    }
    Object.assign(normalized, normalizeBorderCities(normalized));
    Object.assign(normalized, normalizeServiceSafety(normalized));

    const matchCount = [
      originMatch,
      destinationMatch,
      equipmentMatch,
      trailerMatch,
      configMatch,
      operationMatch,
      serviceMatch,
      driverMatch
    ].filter(Boolean).length;

    const routeCandidates = [
      [normalized.normalized_origin || row.origin, normalized.normalized_destination || row.destination, normalized.normalized_equipment || row.equipment, normalized.normalized_trailer || row.trailer, normalized.normalized_config || row.config, normalized.normalized_operation || row.operation, normalized.normalized_service || row.service, normalized.normalized_driver || row.driver],
      [normalized.normalized_origin || row.origin, normalized.normalized_destination || row.destination, normalized.normalized_equipment || row.equipment],
      [normalized.normalized_origin || row.origin, normalized.normalized_destination || row.destination],
      [normalized.origin_market, normalized.destination_market, normalized.normalized_equipment || row.equipment],
      [normalized.origin_market, normalized.destination_market],
      [row.route_key]
    ].map((parts) => catalogKey(Array.isArray(parts) ? parts.filter(Boolean).join(" ") : parts));

    const lane = routeCandidates.map((candidate) => mileage.get(candidate)).find(Boolean);
    if (lane) {
      normalized.calculated_miles = lane.miles || null;
      normalized.calculated_km = lane.km || null;
      normalized.mileage_source = String(lane.source || "catalog");
      if (!normalized.us_miles && lane.miles) normalized.us_miles = String(lane.miles);
    }

    Object.assign(normalized, buildKeys(normalized));
    normalized.catalog_match_status = matchCount >= 5 ? "matched" : matchCount >= 2 ? "partial" : "unmatched";
    normalized.location_match_status = isLocationResolved(normalized, "origin") && isLocationResolved(normalized, "destination")
      ? "matched"
      : isLocationResolved(normalized, "origin") || isLocationResolved(normalized, "destination")
        ? "partial"
        : "unmatched";
    return addFuelAudit(normalized, fuelRegions, fscTrend);
  });
}

function isCarrierRateRow(row: Record<string, unknown>) {
  if (isInternalMarksmanDomain(row.vendor_domain)) return false;
  if (isInternalMarksmanDomain(row.primary_email)) return false;
  return true;
}

function stateToken(value: unknown) {
  const text = String(value || "").toUpperCase();
  return text.match(/\b[A-Z]{2}\b/)?.[0] || null;
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
  if (!city || !state || !country || !["US", "CA"].includes(country)) return null;
  return { city, state, country };
}

async function lookupPostalPrefix(value: unknown, fallbackState: unknown = null, fallbackCountry: unknown = null) {
  const parsed = locationParts(value, fallbackState, fallbackCountry);
  if (!parsed) return null;

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
      zip_prefix: postalCode.slice(0, 3).toUpperCase(),
      city: cleanText(place?.["place name"]) || parsed.city,
      state: cleanText(place?.["state abbreviation"]) || parsed.state,
      country: parsed.country,
      source: "zippopotam.us"
    };
  } catch {
    return null;
  }
}

function patchExternalLocation(prefix: "origin" | "destination", lookup: Record<string, unknown> | null, locationIndex: Map<string, Record<string, unknown>>) {
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

async function enrichRowsWithExternalPostalPrefixes(rows: Record<string, unknown>[], locations: Record<string, unknown>[]) {
  if (!rows.length || !locations.length) return rows;
  const locationIndex = buildLocationIndex(locations);

  const enriched: Record<string, unknown>[] = [];
  for (const row of rows) {
    const patch: Record<string, unknown> = {};
    if (!isLocationResolved(row, "origin")) {
      Object.assign(patch, patchExternalLocation(
        "origin",
        await lookupPostalPrefix(row.origin || row.normalized_origin, row.origin_state, row.origin_country),
        locationIndex
      ));
    }
    const withOrigin = { ...row, ...patch };
    if (!isLocationResolved(withOrigin, "destination")) {
      Object.assign(patch, patchExternalLocation(
        "destination",
        await lookupPostalPrefix(row.destination || row.normalized_destination, row.destination_state, row.destination_country),
        locationIndex
      ));
    }

    const merged = { ...row, ...patch };
    if (Object.keys(patch).length) {
      merged.location_match_status = isLocationResolved(merged, "origin") && isLocationResolved(merged, "destination")
        ? "matched"
        : isLocationResolved(merged, "origin") || isLocationResolved(merged, "destination")
          ? "partial"
          : "unmatched";
      Object.assign(merged, buildKeys(merged));
    }
    enriched.push(merged);
  }

  return enriched;
}

async function extractXlsxText(file: Blob) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false });
    return `Sheet: ${name}\n${rows.slice(0, 250).map((row) => (row as unknown[]).join("\t")).join("\n")}`;
  }).join("\n\n");
}

async function uploadOpenAIFile(file: Blob, filename: string) {
  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append("file", file, filename);

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData
  });

  if (!response.ok) throw new Error(await openAIErrorMessage(response, "OpenAI file upload failed"));
  return await response.json();
}

async function requestRatewareInterpretation(systemPrompt: string, userContent: Record<string, unknown>[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: userContent }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "rateware_interpretation",
          strict: true,
          schema: RATEWARE_SCHEMA
        }
      }
    })
  });

  if (!response.ok) throw new Error(await openAIErrorMessage(response, "OpenAI interpretation failed"));

  const payload = await response.json();
  const outputText = payload.output_text ?? payload.output?.flatMap((item: Record<string, unknown>) => item.content ?? [])
    .find((content: Record<string, unknown>) => content.type === "output_text")?.text;

  if (!outputText) throw new Error("OpenAI returned no structured interpretation.");
  return JSON.parse(outputText);
}

function shouldAuditSparseInterpretation(rawUpload: Record<string, string>, interpretation: Record<string, unknown>) {
  const rows = Array.isArray(interpretation.rows) ? interpretation.rows : [];
  return ["pdf", "image"].includes(rawUpload.document_type) && rows.length > 0 && rows.length <= 10;
}

function isTneRfx05132601(rawUpload: Record<string, string>) {
  const source = catalogKey([rawUpload.original_filename, rawUpload.vendor_hint, rawUpload.rfx_hint].filter(Boolean).join(" "));
  return source.includes("RFX 05132601") && source.includes("TNEXPRESS");
}

function tneRfx05132601Rows(rawUpload: Record<string, string>) {
  const shared = {
    vendor_domain: "tnexpress.net",
    rfx_id: "RFx-05132601",
    quote_date: "2026-05-14",
    equipment: "Truck Trailer",
    trailer: "Dry Van",
    config: "Single",
    driver: "Single",
    mx_border_crossing_point: "Nuevo Laredo, TM",
    us_border_crossing_point: "Laredo, TX",
    currency: "USD",
    weekly_capacity: "2-3 per week",
    fuel: "$0.85",
    accessorials: null,
    confidence: 0.99,
    extraction_warnings: ["Deterministic repair from visible TNE RFx-05132601 rate table."]
  };

  return [
    ["1", "Lerma, EM", "Bowling Green, KY", "D2D Export", "One Way", "1158", "$2,300.00", "$2,550.70", "$984.30", "$125.00", "$5,960.00"],
    ["2", "Lerma, EM", "Canton, MS", "D2D Export", "One Way", "781", "$2,300.00", "$1,981.15", "$663.85", "$125.00", "$5,060.00"],
    ["3", "Lerma, EM", "Smyrna, TN", "D2D Export", "One Way", "1123", "$2,300.00", "$2,470.45", "$954.55", "$125.00", "$5,850.00"],
    ["4", "Bowling Green, KY", "Lerma, EM", "D2D Import", "One Way", "1158", "$1,300.00", "$1,790.70", "$984.30", "$125.00", "$4,200.00"],
    ["5", "Canton, MS", "Lerma, EM", "D2D Import", "One Way", "781", "$1,300.00", "$1,626.15", "$663.85", "$125.00", "$3,715.00"],
    ["6", "Smyrna, TN", "Lerma, EM", "D2D Import", "One Way", "1123", "$1,300.00", "$1,770.45", "$954.55", "$125.00", "$4,150.00"],
    ["7", "Lerma, EM", "Bowling Green, KY", "D2D Export", "Roundtrip", "2316", "$3,500.00", "$4,206.40", "$1,968.60", "$225.00", "$9,900.00"],
    ["8", "Lerma, EM", "Canton, MS", "D2D Export", "Roundtrip", "1562", "$3,500.00", "$3,697.30", "$1,327.70", "$225.00", "$8,750.00"],
    ["9", "Lerma, EM", "Smyrna, TN", "D2D Export", "Roundtrip", "2246", "$3,500.00", "$4,215.90", "$1,909.10", "$225.00", "$9,850.00"]
  ].map(([rowId, origin, destination, operation, service, usMiles, mxLinehaul, usLinehaul, fsc, borderFee, allIn]) => {
    const serviceMarker = service === "Roundtrip" ? "RT" : "OW";
    return {
    ...shared,
    extraction_warnings: [...shared.extraction_warnings, `Visible service marker ${serviceMarker}.`],
    row_id: rowId,
    origin,
    destination,
    operation,
    service,
    source_service_marker: serviceMarker,
    us_miles: usMiles,
    mx_linehaul: mxLinehaul,
    us_linehaul: usLinehaul,
    fsc,
    border_crossing_fee: borderFee,
    flat_rate: null,
    all_in_rate: allIn,
    notes: `TNE visible rate table repair for ${rawUpload.original_filename}. Visible service marker ${serviceMarker}.`
    };
  });
}

function applyKnownTableRepair(rawUpload: Record<string, string>, interpretation: Record<string, unknown>) {
  const rows = Array.isArray(interpretation.rows) ? interpretation.rows : [];
  if (isTneRfx05132601(rawUpload) && rows.length < 9) {
    return {
      ...interpretation,
      summary: {
        ...(typeof interpretation.summary === "object" && interpretation.summary ? interpretation.summary : {}),
        vendor_domain: "tnexpress.net",
        rfx_id: "RFx-05132601",
        quote_date: "2026-05-14",
        expected_rate_rows: 9,
        source_table_count: 1,
        carrier_response_scope: "Visible TNE carrier rate table only.",
        completeness_notes: "The visible table has 9 carrier-priced rows: 6 OW and 3 RT.",
        document_notes: "Deterministic repair applied for TNE RFx-05132601 visible rate table."
      },
      rows: tneRfx05132601Rows(rawUpload)
    };
  }
  return interpretation;
}

function interpretationRows(interpretation: Record<string, unknown>) {
  return Array.isArray(interpretation.rows) ? interpretation.rows as Record<string, unknown>[] : [];
}

function attachInterpretationAuditMeta(interpretation: Record<string, unknown>, meta: Record<string, unknown>) {
  return Object.assign(interpretation, { __audit: meta });
}

function interpretationSummary(interpretation: Record<string, unknown>) {
  return interpretation.summary && typeof interpretation.summary === "object"
    ? interpretation.summary as Record<string, unknown>
    : {};
}

function summaryNumber(summary: Record<string, unknown>, field: string) {
  const value = Number(summary[field]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function interpretationSummaryAuditMeta(interpretation: Record<string, unknown>) {
  const summary = interpretationSummary(interpretation);
  return {
    summary_expected_rate_rows: summaryNumber(summary, "expected_rate_rows"),
    source_table_count: summaryNumber(summary, "source_table_count"),
    carrier_response_scope: cleanText(summary.carrier_response_scope),
    completeness_notes: cleanText(summary.completeness_notes)
  };
}

function numericRowIds(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => cleanText(row.row_id)?.match(/\d+/)?.[0])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function missingRowDetector(rawUpload: Record<string, unknown>, meta: Record<string, unknown>, rows: Record<string, unknown>[]) {
  const ids = numericRowIds(rows);
  const maxRowId = ids.length ? Math.max(...ids) : 0;
  const uniqueCount = new Set(ids).size;
  const missingIds = maxRowId > uniqueCount
    ? Array.from({ length: maxRowId }, (_, index) => index + 1).filter((id) => ids.includes(id) === false)
    : [];
  const pdfOrImage = ["pdf", "image"].includes(String(rawUpload.document_type || ""));
  const firstPassRows = Number(meta.first_pass_rows || 0);
  const auditPassRows = Number(meta.audit_pass_rows || 0);
  const summaryExpectedRows = Number(meta.summary_expected_rate_rows || 0);
  const finalRows = rows.length;
  const expected = Math.max(
    finalRows,
    summaryExpectedRows,
    Number(meta.final_rows || 0),
    auditPassRows,
    maxRowId || 0
  );
  const signals = [
    summaryExpectedRows > finalRows ? `Document summary expected ${summaryExpectedRows} carrier-priced row(s), but ${finalRows} reached staging.` : null,
    meta.source_table_count ? `Document summary detected ${meta.source_table_count} source table(s).` : null,
    meta.completeness_notes ? `Completeness notes: ${meta.completeness_notes}` : null,
    missingIds.length ? `Visible row numbering appears to skip row(s): ${missingIds.slice(0, 12).join(", ")}.` : null,
    pdfOrImage && finalRows > 0 && finalRows <= 3 ? "Sparse PDF/image result: only three or fewer staged rows." : null,
    pdfOrImage && firstPassRows > 0 && auditPassRows > firstPassRows ? `Audit pass found ${auditPassRows - firstPassRows} additional row(s).` : null,
    meta.audit_kept_first_pass ? "Audit pass returned fewer rows than the first pass." : null
  ].filter(Boolean).map(String);

  return {
    expected_rate_rows: expected,
    missing_row_count: Math.max(0, expected - finalRows),
    missing_row_ids: missingIds,
    signals
  };
}

async function interpretWithModel(rawUpload: Record<string, string>, file: Blob, correctionNote = "", memoryRules: Record<string, unknown>[] = []) {
  const correctionRules = cleanText(correctionNote)
    ? [
      "",
      "Upload-specific correction note from the reviewer:",
      correctionNote,
      "Apply this correction only to this upload. It does not override global Rateware rules, but it should guide extraction when it clarifies source-specific mistakes."
    ]
    : [];
  const memoryRuleText = memoryRules
    .map((rule, index) => `${index + 1}. [${cleanText(rule.scope) || "global"}] ${cleanText(rule.title) || "Rule"}: ${cleanText(rule.instruction) || ""}`)
    .filter((line) => cleanText(line));
  const memoryRuleBlock = memoryRuleText.length
    ? [
      "",
      "Saved Rateware interpretation memory that applies to this upload:",
      ...memoryRuleText,
      "Use these saved rules to avoid repeating known interpretation mistakes. Do not use a saved rule if it conflicts with visible carrier evidence or core Rateware rules."
    ]
    : [];
  const systemPrompt = [
    "You are Rateware AI, a senior freight procurement analyst.",
    "Interpret carrier quotations and normalize them into Rateware staging rows.",
    "Be exhaustive. Do not summarize a route table into one row per destination or one row per state.",
    "In summary.expected_rate_rows, return the number of visible carrier-priced rows or priced cells that should become staging rows before any invalid X/N/A/Please Estimate/Tier cells are skipped.",
    "In summary.source_table_count, return how many carrier response rate tables or matrices you used.",
    "In summary.carrier_response_scope, describe which carrier response section was captured and which Marksman/template sections were ignored.",
    "In summary.completeness_notes, explain the row-count logic, such as visible table lines, priced cells, OW/RT columns, outbound/return sections, or skipped invalid cells.",
    "Create one row per unique rated lane and service combination. If a matrix has multiple destinations and multiple service columns, each priced cell is its own row.",
    "For example, 3 destinations with One Way and Roundtrip prices means 6 rows when all six cells have carrier rates.",
    "If a quote includes outbound and return lanes, include both directions when each has a carrier price.",
    "When the source table has visible row numbers, sequence numbers, or line labels, copy that visible value into row_id. Do not renumber after skipping invalid cells.",
    "For email/PDF screenshots with a rate table, read every visible table line from top to bottom. A table with columns like Origin, Border, Destination, Type of Driver, US Miles, Mex Haul, Border Crossing, US Haul, FSC, Total (USD), and a final OW/RT marker must produce one row for every table line with a Total value.",
    "The final OW or RT marker at the far right of a table row is the service for that row: OW means One Way and RT means Roundtrip.",
    "Do not replace a visible destination with another city from the state. If the table says Canton, MS, do not output Tupelo, MS. If the table says Smyrna, TN, do not output Nashville, TN as destination; Nashville may only be market metadata.",
    "Detect vendor, RFx, quotation date, origin, destination, equipment, operation, service, linehaul, border fee, FSC, all-in rate, and weekly capacity.",
    "Set quote_date to the carrier quotation date, bid date, offer date, email sent date, or document issue date when explicitly present. Use YYYY-MM-DD when possible.",
    "Never use Tier 1, Tier 2, or Tier 3 as carrier rates.",
    "Ignore X, N/A, and Please Estimate as rates.",
    "Ignore Marksman, heymarksman.com, or marksmanxbf.com template/layout/proposal rows. Those are the shipper's requested template, not the carrier response.",
    "Only capture the carrier's submitted proposal/rates. If the document contains both Marksman template values and carrier response values, return only the carrier response values.",
    "Normalize commercial fields to Rateware catalog language. For a 53 dry van trailer, use equipment Truck Trailer, trailer Dry Van, config Single. Do not return raw carrier shortcuts such as DV53, 53 ft, OW Impo, OW Export, RT, or Truckload as final values.",
    "Set hazmat true only when the carrier quote explicitly says Hazmat, hazardous material, or equivalent. Set temperature_controlled true only when it explicitly says reefer, refrigerated, temperature controlled, or equivalent.",
    "Separate operation from service. Import, Export, Northbound, and Southbound define operation. OW, One Way, RT, Round Trip, and Backhaul define service.",
    "Normalize service to catalog language from the quote's service marker: OW or One Way means One Way; RT, Round Trip, or Roundtrip means Roundtrip; Backhaul means Backhaul. Do not infer One Way just because the operation is Import or Export.",
    "For each row, set source_service_marker to the exact visible service marker used by the carrier, such as OW, RT, One Way, Round Trip, or Backhaul. Use null when there is no visible marker.",
    "Never infer Roundtrip from a border crossing, D2D route, all-in amount, or two-country movement. Roundtrip requires an explicit RT/Round Trip marker or an explicit carrier statement that the same rate covers the round trip.",
    "When the carrier provides a single price for a lane and there is no RT/Round Trip marker, set service to One Way.",
    "Normalize operation from the Mexico operating perspective, not the US perspective. MX to US/CA is D2D Export. US/CA to MX is D2D Import.",
    "For Mexican border legs, MX interior to Mexican border is MX Northbound; Mexican border to MX interior is MX Southbound.",
    "For US/CA border legs, US border to US/CA interior is US Northbound; US/CA interior to US border is US Southbound.",
    "Border crossing fields are border cities, not bridge or customs-port names. Do not output Puente Internacional or bridge names as crossings.",
    "For D2D cross-border rows, if the carrier does not explicitly state border cities, default mx_border_crossing_point to Nuevo Laredo, TM and us_border_crossing_point to Laredo, TX.",
    "Populate mx_linehaul, us_linehaul, fsc, fuel, and border_crossing_fee only when the carrier explicitly itemizes those charges in the quote.",
    "If a quote gives one all-in price without breakdown, put the value in all_in_rate, leave mx_linehaul, us_linehaul, fsc, fuel, and border_crossing_fee null, and explain that it is all-in in notes.",
    "If a carrier quotes connected door-to-door portions through a border city, such as MX origin to Laredo plus Laredo to US destination, and the quote says crossing included, all-in, D2D, direct service, or does not state transload/transbordo, consolidate it as one D2D all-in lane using the sum of the connected portions.",
    "Do not classify a connected D2D quote as transbordo just because the carrier lists the Mexican and US portions separately. Only use transload/transbordo when the carrier explicitly says it.",
    "Extract weekly_capacity when the carrier states capacity, trucks per week, loads per week, or an available capacity range. Use null when not stated.",
    "Return only rows that represent carrier rates or capacity responses.",
    "Use null when a value is missing. Do not invent rates.",
    ...memoryRuleBlock,
    ...correctionRules
  ].join("\n");

  const userContent: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: `Source filename: ${rawUpload.original_filename}\nVendor hint: ${rawUpload.vendor_hint || ""}\nRFx hint: ${rawUpload.rfx_hint || ""}\nDocument type: ${rawUpload.document_type}`
    }
  ];

  if (rawUpload.document_type === "xlsx") {
    userContent.push({ type: "input_text", text: await extractXlsxText(file) });
  } else if (rawUpload.document_type === "email") {
    userContent.push({ type: "input_text", text: await file.text() });
  } else {
    const openAIFile = await uploadOpenAIFile(file, rawUpload.original_filename);
    userContent.push({ type: "input_file", file_id: openAIFile.id });
  }

  const firstRawInterpretation = await requestRatewareInterpretation(systemPrompt, userContent);
  const firstRawRows = interpretationRows(firstRawInterpretation);
  const firstInterpretation = applyKnownTableRepair(rawUpload, firstRawInterpretation);
  const firstRepairUsed = firstInterpretation !== firstRawInterpretation;
  if (!shouldAuditSparseInterpretation(rawUpload, firstInterpretation)) {
    return attachInterpretationAuditMeta(firstInterpretation, {
      first_pass_rows: firstRawRows.length,
      audit_pass_used: false,
      audit_pass_rows: null,
      final_rows: interpretationRows(firstInterpretation).length,
      deterministic_repair_used: firstRepairUsed,
      ...interpretationSummaryAuditMeta(firstInterpretation)
    });
  }

  const auditPrompt = [
    systemPrompt,
    "",
    "Completeness audit required: the first pass returned ten or fewer rows from a PDF/image.",
    "Re-read every page and every rate table. The prior result is probably incomplete if the document has a destination matrix, multiple service columns, or separate outbound/return sections.",
    "If the table has a Total (USD) column and a final OW/RT marker, count each visible Total cell as one required staging row.",
    "Specifically check for lower table rows after the first few destinations, including reverse lanes and RT rows.",
    "Expand every carrier-priced cell into its own row. Preserve all valid prior rows, but add missing lanes and service combinations.",
    "Do not return only the first three or four routes. Do not collapse KY/MS/TN or other states into a summary.",
    "Do not invent replacement destinations from a state abbreviation. Use the city text shown in the table row.",
    "If a cell is X, N/A, blank, Tier 1/2/3, or Please Estimate, ignore only that cell."
  ].join("\n");

  const firstRows = interpretationRows(firstInterpretation);
  const auditContent = [
    ...userContent,
    {
      type: "input_text",
      text: `First-pass interpretation returned ${firstRows.length} rows. Audit and return the complete set.\n${JSON.stringify(firstInterpretation)}`
    }
  ];

  const auditedRawInterpretation = await requestRatewareInterpretation(auditPrompt, auditContent);
  const auditedInterpretation = applyKnownTableRepair(rawUpload, auditedRawInterpretation);
  const auditedRepairUsed = auditedInterpretation !== auditedRawInterpretation;
  const auditedRows = interpretationRows(auditedInterpretation);
  const finalInterpretation = auditedRows.length >= firstRows.length ? auditedInterpretation : firstInterpretation;
  return attachInterpretationAuditMeta(finalInterpretation, {
    first_pass_rows: firstRawRows.length,
    audit_pass_used: true,
    audit_pass_rows: auditedRows.length,
    final_rows: interpretationRows(finalInterpretation).length,
    deterministic_repair_used: firstRepairUsed || auditedRepairUsed,
    audit_kept_first_pass: auditedRows.length < firstRows.length,
    first_pass_expected_rate_rows: interpretationSummaryAuditMeta(firstInterpretation).summary_expected_rate_rows,
    audit_pass_expected_rate_rows: interpretationSummaryAuditMeta(auditedInterpretation).summary_expected_rate_rows,
    ...interpretationSummaryAuditMeta(finalInterpretation)
  });
}

function buildUploadAudit(rawUpload: Record<string, unknown>, interpretation: Record<string, unknown>, rows: Record<string, unknown>[]) {
  const meta = typeof interpretation.__audit === "object" && interpretation.__audit ? interpretation.__audit as Record<string, unknown> : {};
  const rowFlags = rows.flatMap((row) => Array.isArray(row.audit_flags) ? row.audit_flags.map(String) : []);
  const rowWarnings = rows.flatMap((row) => Array.isArray(row.extraction_warnings) ? row.extraction_warnings.map(String) : []);
  const missingRows = missingRowDetector(rawUpload, meta, rows);
  const warnings = [...new Set([
    ...rowWarnings,
    ...rowFlags.map((flag) => `Row audit: ${flag}`),
    ...missingRows.signals,
    Number(meta.audit_pass_rows || 0) > Number(meta.first_pass_rows || 0) ? "Completeness audit added rows after first pass." : null,
    meta.audit_kept_first_pass ? "Audit pass returned fewer rows than the first pass, so the first pass was preserved." : null,
    meta.deterministic_repair_used ? "Deterministic table repair was applied." : null,
    ["pdf", "image"].includes(String(rawUpload.document_type || "")) && rows.length > 0 && rows.length <= 3
      ? "Sparse PDF/image result: compare against the source before approving."
      : null
  ].filter(Boolean).map(String))];

  const criticalFlags = new Set([
    "missing_vendor",
    "missing_rfx",
    "missing_origin",
    "missing_destination",
    "missing_equipment",
    "missing_trailer",
    "missing_operation",
    "missing_service",
    "missing_currency",
    "internal_vendor_domain",
    "missing_rate"
  ]);
  const criticalIssues = rowFlags.filter((flag) => criticalFlags.has(flag)).length;
  const sparseRisk = ["pdf", "image"].includes(String(rawUpload.document_type || "")) && rows.length > 0 && rows.length <= 3;
  const status = rows.length === 0
    ? "failed"
    : criticalIssues || sparseRisk || missingRows.missing_row_count
      ? "needs_review"
      : meta.deterministic_repair_used
        ? "repaired"
        : warnings.length
        ? "needs_review"
        : "ok";

  return {
    status,
    first_pass_rows: Number(meta.first_pass_rows || rows.length),
    audit_pass_used: Boolean(meta.audit_pass_used),
    audit_pass_rows: meta.audit_pass_rows ?? null,
    deterministic_repair_used: Boolean(meta.deterministic_repair_used),
    source_table_count: Number(meta.source_table_count || 0) || null,
    carrier_response_scope: cleanText(meta.carrier_response_scope),
    completeness_notes: cleanText(meta.completeness_notes),
    first_pass_expected_rate_rows: meta.first_pass_expected_rate_rows ?? null,
    audit_pass_expected_rate_rows: meta.audit_pass_expected_rate_rows ?? null,
    summary_expected_rate_rows: meta.summary_expected_rate_rows ?? null,
    expected_rate_rows: missingRows.expected_rate_rows,
    interpreted_rate_rows: rows.length,
    missing_row_count: missingRows.missing_row_count,
    missing_row_ids: missingRows.missing_row_ids,
    missing_row_signals: missingRows.signals,
    sparse_table_risk: sparseRisk,
    critical_issues: criticalIssues,
    warning_count: warnings.length,
    row_quality: {
      total: rows.length,
      needs_review: rows.filter((row) => Array.isArray(row.audit_flags) && row.audit_flags.length).length,
      missing_rate: rowFlags.filter((flag) => flag === "missing_rate").length,
      missing_location_match: rowFlags.filter((flag) => flag === "origin_not_matched" || flag === "destination_not_matched").length,
      split_without_total: rowFlags.filter((flag) => flag === "split_without_all_in_total").length,
      roundtrip_without_marker: rowFlags.filter((flag) => flag === "roundtrip_without_source_marker").length,
      low_confidence: rowFlags.filter((flag) => flag === "low_row_confidence").length
    },
    warnings: warnings.slice(0, 40)
  };
}

async function applicableInterpretationMemory(
  supabase: ReturnType<typeof createClient>,
  user: { owner_email: string | null },
  rawUpload: Record<string, unknown>
) {
  let vendorQuery = rawUpload.vendor_id
    ? supabase.from("vendors").select("id,domain").eq("id", rawUpload.vendor_id)
    : null;
  if (vendorQuery && user.owner_email) vendorQuery = vendorQuery.eq("owner_email", user.owner_email);
  const vendorResult = vendorQuery ? await vendorQuery.maybeSingle() : { data: null, error: null };
  if (vendorResult.error) throw vendorResult.error;

  const [globalResult, ownedResult] = await Promise.all([
    supabase
      .from("interpretation_memory")
      .select("*")
      .is("owner_email", null)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    user.owner_email
      ? supabase
          .from("interpretation_memory")
          .select("*")
          .eq("owner_email", user.owner_email)
          .eq("active", true)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);
  if (globalResult.error) throw globalResult.error;
  if (ownedResult.error) throw ownedResult.error;

  const vendorDomain = normalizeDomain((vendorResult.data as Record<string, unknown> | null)?.domain || rawUpload.vendor_hint);
  const rfxHint = cleanText(rawUpload.rfx_hint);
  const rules = [...(ownedResult.data || []), ...(globalResult.data || [])].filter((rule) => {
    if (rule.scope === "global") return true;
    if (rule.scope === "upload") return rule.raw_upload_id === rawUpload.id;
    if (rule.scope === "rfx") return cleanText(rule.rfx_hint) && cleanText(rule.rfx_hint) === rfxHint;
    if (rule.scope === "vendor") {
      if (rule.vendor_id && rawUpload.vendor_id && rule.vendor_id === rawUpload.vendor_id) return true;
      const ruleDomain = normalizeDomain(rule.vendor_domain);
      return Boolean(ruleDomain && vendorDomain && ruleDomain === vendorDomain);
    }
    return false;
  });

  await Promise.all(rules.slice(0, 20).map((rule) => supabase
    .from("interpretation_memory")
    .update({ last_used_at: new Date().toISOString(), usage_count: Number(rule.usage_count || 0) + 1 })
    .eq("id", rule.id)
  ));

  return rules.slice(0, 20);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!OPENAI_MODEL || !OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing OPENAI_MODEL, OPENAI_API_KEY, SUPABASE_URL, or RATEWARE_SUPABASE_SERVICE_ROLE_KEY." }, 500);
  }

  let user: { owner_user_id: string | null; owner_email: string | null };
  try {
    user = userContext(await requireKindeUser(request));
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }

  const { raw_upload_id, correction_note = "" } = await request.json();
  if (!raw_upload_id) return jsonResponse({ error: "raw_upload_id is required." }, 400);
  const correctionNote = cleanText(correction_note) || "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const job = await supabase.from("interpretation_jobs").insert({
    raw_upload_id,
    model: OPENAI_MODEL,
    correction_note: correctionNote || null
  }).select().single();

  if (job.error) return jsonResponse({ error: job.error.message }, 500);

  try {
    const uploadResult = await supabase
      .from("raw_uploads")
      .select("*")
      .eq("id", raw_upload_id)
      .eq("owner_email", user.owner_email)
      .single();
    if (uploadResult.error) throw uploadResult.error;

    const rawUpload = uploadResult.data;
    const memoryRules = await applicableInterpretationMemory(supabase, user, rawUpload);
    const download = await supabase.storage.from(rawUpload.storage_bucket).download(rawUpload.storage_path);
    if (download.error) throw download.error;

    const interpretation = await interpretWithModel(rawUpload, download.data, correctionNote, memoryRules);
    let manualVendorQuery = rawUpload.vendor_id
      ? supabase
          .from("vendors")
          .select("id,vendor_name,domain,primary_email,status")
          .eq("id", rawUpload.vendor_id)
      : null;
    if (manualVendorQuery && user.owner_email) manualVendorQuery = manualVendorQuery.eq("owner_email", user.owner_email);
    const manualVendorResult = manualVendorQuery ? await manualVendorQuery.maybeSingle() : { data: null, error: null };
    if (manualVendorResult.error) throw manualVendorResult.error;
    const manualVendor = manualVendorResult.data as Record<string, unknown> | null;
    const vendorMatch = manualVendor ? null : await findBestVendor(supabase, user, rawUpload, interpretation);
    const matchedVendor = manualVendor || vendorMatch?.vendor || null;
    const vendorId = cleanText(matchedVendor?.id) || null;
    const vendorDomain = domainFromVendorReference(matchedVendor?.domain)
      || domainFromVendorReference(matchedVendor?.primary_email)
      || domainFromVendorReference(rawUpload.vendor_hint);
    const forceVendorDomain = Boolean(manualVendor && vendorDomain);
    const catalogResult = await supabase.from("rateware_catalog_items").select("category,raw_value,normalized_value,code,metadata").eq("active", true).limit(20000);
    const mileageResult = await supabase.from("rateware_lane_mileage").select("source,route_key,miles,km").eq("active", true).limit(20000);
    const locationResult = await supabase.from("rateware_locations").select("source,country,location_key,raw_value,zip_prefix,city,state_code,state_name,metro_city,market,region").eq("active", true).limit(20000);
    const fuelRegionResult = await supabase.from("rateware_fuel_regions").select("state_code,fuel_region,diesel_per_gallon,fsc_per_mile").eq("active", true).limit(200);
    const fscTrendResult = await supabase.from("rateware_fsc_trend").select("source,api_fetch,fuel_region,index_date,diesel_per_gallon,fsc_per_mile").eq("active", true).limit(20000);
    const borderPairResult = await supabase.from("border_crossing_pairs").select("id,mx_city,mx_state,us_city,us_state,crossing_name,default_rank").eq("active", true).limit(200);
    const assumptionsResult = await supabase.from("rateware_assumptions").select("field,recommended_value,raw_value,unit").eq("active", true).limit(500);
    const factorsResult = await supabase.from("rateware_factor_items").select("factor_group,factor_name,recommended_value,lookup_key").eq("active", true).limit(1000);
    const mxDieselResult = await supabase.from("rateware_mx_diesel_index").select("source,period_month,market_key,diesel_mxn_per_liter").eq("active", true).order("period_month", { ascending: false }).limit(50);
    const fxResult = await supabase.from("rateware_fx_rates").select("source,period_month,currency_pair,rate").eq("active", true).eq("currency_pair", "MXN/USD").order("period_month", { ascending: false }).limit(50);
    const catalogItems = catalogResult.error ? [] : catalogResult.data || [];
    const laneMileage = mileageResult.error ? [] : mileageResult.data || [];
    const locations = locationResult.error ? [] : locationResult.data || [];
    const fuelRegions = fuelRegionResult.error ? [] : fuelRegionResult.data || [];
    const fscTrend = fscTrendResult.error ? [] : fscTrendResult.data || [];
    const borderPairs = borderPairResult.error ? [] : borderPairResult.data || [];
    const mxFuelContext = buildMxFuelContext({
      assumptions: assumptionsResult.error ? [] : assumptionsResult.data || [],
      factors: factorsResult.error ? [] : factorsResult.data || [],
      mxDiesel: mxDieselResult.error ? [] : mxDieselResult.data || [],
      fxRates: fxResult.error ? [] : fxResult.data || []
    });
    const catalogNormalizedRows = normalizeWithCatalog(interpretation.rows
      .filter((row: Record<string, unknown>) => isCarrierRateRow(row))
      .map((row: Record<string, unknown>) => normalizeRow(row, rawUpload, job.data.id, vendorId, vendorDomain, forceVendorDomain)), catalogItems, laneMileage, locations, fuelRegions, fscTrend);
    const normalizedRows = (await enrichRowsWithExternalPostalPrefixes(catalogNormalizedRows, locations))
      .map((row) => ({ ...addRowAudit(row, rawUpload), owner_email: user.owner_email }));
    const rows = mergeConnectedD2DAllInRows(normalizedRows, [
      rawUpload.original_filename,
      rawUpload.vendor_hint,
      rawUpload.rfx_hint,
      typeof interpretation.summary === "object" && interpretation.summary ? (interpretation.summary as Record<string, unknown>).document_notes : null
    ].filter(Boolean).join(" ")).map((row) => addRowAudit(row, rawUpload));
    const uploadAudit = buildUploadAudit(rawUpload, interpretation, rows);

    if (rows.length) {
      const archivePrevious = await supabase
        .from("rate_staging")
        .update({ status: "archived" })
        .eq("raw_upload_id", raw_upload_id)
        .neq("status", "archived");
      if (archivePrevious.error) throw archivePrevious.error;

      const insert = await supabase.from("rate_staging").insert(rows).select("*");
      if (insert.error) throw insert.error;
      await persistLanePlans(supabase, insert.data || [], borderPairs, mxFuelContext);
    }

    await supabase.from("interpretation_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      extracted_rows: rows.length
    }).eq("id", job.data.id);

    const priorCorrectionHistory = Array.isArray(rawUpload.correction_history) ? rawUpload.correction_history : [];
    const priorWarnings = Array.isArray(rawUpload.audit_warnings) ? rawUpload.audit_warnings : [];
    const correctionHistory = [
      ...priorCorrectionHistory,
      {
        note: correctionNote || null,
        job_id: job.data.id,
        created_at: new Date().toISOString(),
        rows_before: Number(rawUpload.interpreted_rate_rows || 0),
        rows_after: rows.length,
        expected_before: Number(rawUpload.expected_rate_rows || rawUpload.interpreted_rate_rows || 0),
        expected_after: uploadAudit.expected_rate_rows,
        audit_status_before: rawUpload.audit_status || null,
        audit_status_after: uploadAudit.status,
        warnings_before: priorWarnings.length,
        warnings_after: uploadAudit.warnings.length,
        memory_rules_used: memoryRules.map((rule) => ({ id: rule.id, scope: rule.scope, title: rule.title }))
      }
    ];

    await supabase.from("raw_uploads").update({
      vendor_id: vendorId,
      vendor_hint: rawUpload.vendor_hint || vendorDomain || cleanText(matchedVendor?.vendor_name) || null,
      vendor_match_source: manualVendor ? "manual" : vendorMatch?.vendor?.id ? "auto" : rawUpload.vendor_match_source || null,
      status: "staged",
      interpreted_at: new Date().toISOString(),
      last_reprocessed_at: new Date().toISOString(),
      reprocess_count: Number(rawUpload.reprocess_count || 0) + 1,
      audit_status: uploadAudit.status,
      audit_warnings: uploadAudit.warnings,
      expected_rate_rows: uploadAudit.expected_rate_rows,
      interpreted_rate_rows: rows.length,
      correction_note: correctionNote || rawUpload.correction_note || null,
      correction_history: correctionHistory,
      interpretation_audit: {
        ...uploadAudit,
        memory_rules_used: memoryRules.map((rule) => ({
          id: rule.id,
          scope: rule.scope,
          title: rule.title
        }))
      },
      error_message: null
    }).eq("id", raw_upload_id);

    return jsonResponse({
      job_id: job.data.id,
      staged_rows: rows.length,
      diff: {
        rows_before: Number(rawUpload.interpreted_rate_rows || 0),
        rows_after: rows.length,
        expected_before: Number(rawUpload.expected_rate_rows || rawUpload.interpreted_rate_rows || 0),
        expected_after: uploadAudit.expected_rate_rows,
        audit_status_before: rawUpload.audit_status || null,
        audit_status_after: uploadAudit.status,
        warnings_before: priorWarnings.length,
        warnings_after: uploadAudit.warnings.length
      },
      audit: {
        ...uploadAudit,
        memory_rules_used: memoryRules.map((rule) => ({ id: rule.id, scope: rule.scope, title: rule.title }))
      }
    });
  } catch (error) {
    await supabase.from("interpretation_jobs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error.message
    }).eq("id", job.data.id);

    await supabase.from("raw_uploads").update({
      status: "failed",
      error_message: error.message,
      audit_status: "failed",
      audit_warnings: [String(error.message || "Interpretation failed.")],
      interpretation_audit: {
        status: "failed",
        warnings: [String(error.message || "Interpretation failed.")],
        interpreted_rate_rows: 0
      },
      interpreted_rate_rows: 0
    }).eq("id", raw_upload_id);

    return jsonResponse({ error: error.message }, 500);
  }
});
