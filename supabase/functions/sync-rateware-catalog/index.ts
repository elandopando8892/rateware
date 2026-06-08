import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireKindeUser } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const DEFAULT_SHEET_ID = "1FzrLGj4_uAUqF1PxslO8_MewYK3XmZdzr6JEzmG1x-o";
const SOURCE = "rateware_google_catalog";

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanNumber(value: unknown) {
  const text = String(value ?? "").replace(/[$,]/g, "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3] || "01"}`;

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function key(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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

async function fetchSheet(sheetId: string, sheetName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${sheetName}: ${response.status}`);
  return parseCsv(await response.text());
}

function catalogItem(category: string, rawValue: unknown, normalizedValue = rawValue, metadata: Record<string, unknown> = {}, code: unknown = null) {
  const raw = cleanText(rawValue);
  const normalized = cleanText(normalizedValue);
  if (!raw || !normalized) return null;

  return {
    source: SOURCE,
    category,
    raw_value: raw,
    normalized_value: normalized,
    code: cleanText(code),
    metadata,
    active: true,
    updated_at: new Date().toISOString()
  };
}

function routeKey(parts: unknown[]) {
  return parts.map(key).filter(Boolean).join(" ");
}

function parseCusCatalog(rows: string[][]) {
  const items: Record<string, unknown>[] = [];
  const [header, ...data] = rows;
  const categories: Array<[string, number]> = [
    ["equipment", 13],
    ["trailer", 14],
    ["config", 15],
    ["operation", 16],
    ["service", 17],
    ["driver", 18],
    ["dispatch_service", 19],
    ["border_crossing", 21],
    ["mx_production", 23],
    ["fuel_area", 26],
    ["fuel_region", 27]
  ];

  for (const row of data) {
    const zipPrefix = cleanText(row[2]);
    const marketZip = cleanText(row[3]);
    const metroCity = cleanText(row[4]);
    const market = cleanText(row[5]);

    if (zipPrefix && metroCity) {
      items.push(catalogItem("zip_market", zipPrefix, metroCity, { market_zip: marketZip, market }, zipPrefix)!);
    }

    for (const [category, index] of categories) {
      const item = catalogItem(category, row[index], row[index], {
        sheet: "cusCatalog",
        header: header[index] || category
      });
      if (item) items.push(item);
    }
  }

  return items.filter(Boolean);
}

function parseUsaLaneData(rows: string[][]) {
  const [, ...data] = rows;
  return data.map((row) => {
    const route = cleanText(row[0]);
    if (!route) return null;
    return {
      source: "usaLaneData",
      country_scope: "us",
      route_key: key(route),
      origin: route.split(" - ")[0]?.replace(/\s+TRUCK TRAILER$/i, "") || null,
      destination: route.split(" - ")[1]?.replace(/\s+TRUCK TRAILER$/i, "") || null,
      equipment: "Truck Trailer",
      miles: cleanNumber(row[2]),
      metadata: {
        out_state: cleanText(row[1]),
        transit_turns: cleanText(row[3]),
        driver_expenses: cleanText(row[4])
      },
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

function parseMexLaneData(rows: string[][]) {
  const [, ...data] = rows;
  return data.map((row) => {
    const route = cleanText(row[0]);
    if (!route) return null;
    return {
      source: "mexLaneData",
      country_scope: "mx",
      route_key: key(route),
      origin: route.split(" - ")[0]?.replace(/\s+TRUCK TRAILER$/i, "") || null,
      destination: route.split(" - ")[1]?.replace(/\s+TRUCK TRAILER$/i, "") || null,
      equipment: "Truck Trailer",
      km: cleanNumber(row[1]),
      miles: cleanNumber(row[1]) ? Number((cleanNumber(row[1])! * 0.621371).toFixed(2)) : null,
      metadata: {
        tolls_mxn: cleanText(row[2]),
        travel_expenses_mxn: cleanText(row[5]),
        travel_days: cleanText(row[6]),
        route_hours: cleanText(row[7])
      },
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

function parseProd(rows: string[][], source: string, countryScope: "us" | "mx") {
  const [header, ...data] = rows;
  const index = Object.fromEntries(header.map((name, position) => [key(name), position]));
  const at = (row: string[], name: string) => row[index[key(name)]];

  return data.map((row) => {
    const origin = cleanText(at(row, "Origin"));
    const destination = cleanText(at(row, "Destination"));
    if (!origin || !destination) return null;

    const equipment = cleanText(at(row, "Equipment"));
    const trailer = cleanText(at(row, "Trailer"));
    const config = cleanText(at(row, "Config"));
    const operation = cleanText(at(row, "Operation"));
    const service = cleanText(at(row, "Service"));
    const driver = cleanText(at(row, "Driver"));
    const referenceKey = cleanText(at(row, "ReferenceKey"));

    return {
      source,
      country_scope: countryScope,
      route_key: key(referenceKey) || routeKey([origin, destination, equipment, trailer, config, operation, service, driver]),
      origin,
      destination,
      equipment,
      trailer,
      config,
      operation,
      service,
      driver,
      miles: cleanNumber(at(row, "Miles")) || cleanNumber(at(row, "Loaded Miles")) || cleanNumber(at(row, "Total Miles")),
      km: cleanNumber(at(row, "Total KM")) || cleanNumber(at(row, "Loaded KM")),
      metadata: {
        production_version: cleanText(at(row, "Production Version")),
        lane_id: cleanText(at(row, "Lane ID")),
        usd: cleanText(at(row, "USD")),
        rpm: cleanText(at(row, "RPM")),
        fsc: cleanText(at(row, "FSC"))
      },
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

function parseFuelRegions(rows: string[][]) {
  const [, ...data] = rows;
  return data.map((row) => {
    const stateCode = cleanText(row[0])?.toUpperCase();
    const fuelRegion = cleanText(row[1]);
    if (!stateCode || !fuelRegion) return null;

    return {
      state_code: stateCode,
      fuel_region: fuelRegion,
      diesel_per_gallon: cleanNumber(row[2]),
      fsc_per_mile: cleanNumber(row[3]),
      source: "usaFuel",
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

function parseFscTrend(rows: string[][]) {
  const [, ...data] = rows;
  return data.map((row) => {
    const indexDate = cleanDate(row[2]);
    const fuelRegion = cleanText(row[1]);
    const diesel = cleanNumber(row[3]);
    const fsc = cleanNumber(row[4]);
    if (!indexDate || !fuelRegion || diesel === null || fsc === null) return null;

    return {
      source: "usaFSCtrend",
      api_fetch: cleanText(row[0]),
      fuel_region: fuelRegion,
      index_date: indexDate,
      diesel_per_gallon: diesel,
      fsc_per_mile: fsc,
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

function parseFscIndex(rows: string[][]) {
  return rows.slice(2).map((row) => {
    const dieselFrom = cleanNumber(row[0]);
    const dieselTo = cleanNumber(row[1]);
    const truckloadPerMile = cleanNumber(row[3]);
    if (dieselFrom === null || dieselTo === null || truckloadPerMile === null) return null;

    return {
      source: "usaFSCindex",
      diesel_from: dieselFrom,
      diesel_to: dieselTo,
      ltl_percent: cleanNumber(row[2]),
      truckload_per_mile: truckloadPerMile,
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

async function upsertInBatches(supabase: ReturnType<typeof createClient>, table: string, rows: Record<string, unknown>[], onConflict: string) {
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const result = await supabase.from(table).upsert(batch, { onConflict });
    if (result.error) throw result.error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    await requireKindeUser(request);
    const body = await request.json().catch(() => ({}));
    const sheetId = cleanText(body.sheet_id) || Deno.env.get("RATEWARE_CATALOG_SHEET_ID") || DEFAULT_SHEET_ID;
    const supabase = getClient();

    const [cusCatalog, usaLaneData, mexLaneData, usaLaneProd, mexLaneProd, usaFuel, usaFSCtrend, usaFSCindex] = await Promise.all([
      fetchSheet(sheetId, "cusCatalog"),
      fetchSheet(sheetId, "usaLaneData"),
      fetchSheet(sheetId, "mexLaneData"),
      fetchSheet(sheetId, "usaLaneProd"),
      fetchSheet(sheetId, "mexLaneProd"),
      fetchSheet(sheetId, "usaFuel"),
      fetchSheet(sheetId, "usaFSCtrend"),
      fetchSheet(sheetId, "usaFSCindex")
    ]);

    const catalogItems = parseCusCatalog(cusCatalog);
    const uniqueCatalogItems = [...new Map(catalogItems.map((item) => [`${item.category}|${item.raw_value}|${item.normalized_value}`, item])).values()];
    const laneMileage = [
      ...parseUsaLaneData(usaLaneData),
      ...parseMexLaneData(mexLaneData),
      ...parseProd(usaLaneProd, "usaLaneProd", "us"),
      ...parseProd(mexLaneProd, "mexLaneProd", "mx")
    ] as Record<string, unknown>[];

    await upsertInBatches(supabase, "rateware_catalog_items", uniqueCatalogItems, "source,category,raw_value,normalized_value");
    await upsertInBatches(supabase, "rateware_lane_mileage", laneMileage, "source,route_key");
    const fuelRegions = parseFuelRegions(usaFuel) as Record<string, unknown>[];
    const fscTrend = parseFscTrend(usaFSCtrend) as Record<string, unknown>[];
    const fscIndex = parseFscIndex(usaFSCindex) as Record<string, unknown>[];

    await upsertInBatches(supabase, "rateware_fuel_regions", fuelRegions, "state_code,source");
    await upsertInBatches(supabase, "rateware_fsc_trend", fscTrend, "source,fuel_region,index_date,api_fetch");
    await upsertInBatches(supabase, "rateware_fsc_index", fscIndex, "source,diesel_from,diesel_to");

    return jsonResponse({
      sheet_id: sheetId,
      catalog_items: uniqueCatalogItems.length,
      lane_mileage: laneMileage.length,
      fuel_regions: fuelRegions.length,
      fsc_trend: fscTrend.length,
      fsc_index: fscIndex.length
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
