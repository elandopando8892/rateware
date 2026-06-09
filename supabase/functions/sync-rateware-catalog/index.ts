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

async function fetchOptionalSheet(sheetId: string, sheetName: string) {
  try {
    return await fetchSheet(sheetId, sheetName);
  } catch {
    return [];
  }
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

const MX_STATE_NAMES: Record<string, string> = {
  AG: "Aguascalientes",
  BN: "Baja California",
  BS: "Baja California Sur",
  CM: "Campeche",
  CU: "Coahuila",
  CL: "Colima",
  CS: "Chiapas",
  CH: "Chihuahua",
  DF: "Mexico, DF",
  DU: "Durango",
  GJ: "Guanajuato",
  GR: "Guerrero",
  HG: "Hidalgo",
  JA: "Jalisco",
  MX: "Mexico",
  MC: "Michoacan",
  MR: "Morelos",
  NA: "Nayarit",
  NL: "Nuevo Leon",
  OA: "Oaxaca",
  PB: "Puebla",
  QE: "Queretaro",
  QR: "Quintana Roo",
  SL: "San Luis Potosi",
  SI: "Sinaloa",
  SO: "Sonora",
  TB: "Tabasco",
  TM: "Tamaulipas",
  TL: "Tlaxcala",
  VE: "Veracruz",
  YU: "Yucatan",
  ZA: "Zacatecas"
};

const CANADIAN_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NF", "NS", "NT", "NU", "ON", "PE", "PQ", "QC", "SK", "YT"]);
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY", "DC"
]);

function splitCityState(value: unknown) {
  const text = cleanText(value);
  if (!text) return { city: null, stateCode: null };
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: parts[0] || text,
    stateCode: parts[1]?.toUpperCase() || null
  };
}

function countryFromState(stateCode: string | null, zipPrefix: string | null) {
  if (stateCode && US_STATES.has(stateCode)) return "US";
  if (stateCode && CANADIAN_PROVINCES.has(stateCode)) return "CA";
  if (stateCode && MX_STATE_NAMES[stateCode]) return "MX";
  if (zipPrefix && /^\d{3}/.test(zipPrefix)) return "US";
  return "UNKNOWN";
}

function locationRecord(input: {
  rawValue: unknown;
  zipPrefix?: unknown;
  metroCity?: unknown;
  market?: unknown;
  region?: unknown;
  source?: string;
}) {
  const rawValue = cleanText(input.rawValue);
  const metroCity = cleanText(input.metroCity || rawValue);
  if (!rawValue || !metroCity) return null;

  const zipPrefix = cleanText(input.zipPrefix);
  const { city, stateCode } = splitCityState(metroCity);
  const country = countryFromState(stateCode, zipPrefix);

  return {
    source: input.source || "cusCatalog",
    country,
    location_key: key([zipPrefix, metroCity, input.market].filter(Boolean).join(" ")),
    raw_value: rawValue,
    zip_prefix: zipPrefix,
    city,
    state_code: stateCode,
    state_name: country === "MX" && stateCode ? MX_STATE_NAMES[stateCode] || stateCode : stateCode,
    metro_city: metroCity,
    market: cleanText(input.market),
    region: cleanText(input.region),
    metadata: {},
    active: true,
    updated_at: new Date().toISOString()
  };
}

function parseCusCatalog(rows: string[][]) {
  if (!rows.length) return { items: [], locations: [] };
  const items: Record<string, unknown>[] = [];
  const locations: Record<string, unknown>[] = [];
  const [header, ...data] = rows;
  const index = Object.fromEntries(header.map((name, position) => [key(name), position]));
  const at = (row: string[], name: string, fallbackIndex: number) => row[index[key(name)] ?? fallbackIndex];
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
    const zipPrefix = cleanText(at(row, "Zip Code", 2));
    const marketZip = cleanText(at(row, "(M) ZIp Code", 3));
    const metroCity = cleanText(at(row, "Metro City", 4));
    const market = cleanText(at(row, "Market", 5));

    if (zipPrefix && metroCity) {
      items.push(catalogItem("zip_market", zipPrefix, metroCity, { market_zip: marketZip, market }, zipPrefix)!);
      const location = locationRecord({ rawValue: marketZip || zipPrefix, zipPrefix, metroCity, market, source: "cusCatalog" });
      if (location) locations.push(location);
    }

    const mxProduction = cleanText(at(row, "MEX Production", 23));
    const homologation = cleanText(at(row, "Homolgation", 24));
    if (mxProduction) {
      const location = locationRecord({
        rawValue: mxProduction,
        zipPrefix: String(mxProduction).match(/^(\d{3})-/)?.[1] || null,
        metroCity: mxProduction.replace(/^\d{3}-/, ""),
        market: homologation,
        source: "cusCatalog"
      });
      if (location) locations.push(location);
    }

    for (const [category, index] of categories) {
      const item = catalogItem(category, row[index], row[index], {
        sheet: "cusCatalog",
        header: header[index] || category
      });
      if (item) items.push(item);
    }
  }

  return {
    items: items.filter(Boolean),
    locations
  };
}

function parseUsaLaneData(rows: string[][]) {
  if (!rows.length) return [];
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
  if (!rows.length) return [];
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
  if (!rows.length) return [];
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
  if (!rows.length) return [];
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
  if (!rows.length) return [];
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
  if (!rows.length) return [];
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

function previousPeriodMonth() {
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function parseAssumptions(rows: string[][]) {
  if (!rows.length) return { assumptions: [], mxDieselIndex: [], fxRates: [] };
  const [header, ...data] = rows;
  const index = Object.fromEntries(header.map((name, position) => [key(name), position]));
  const at = (row: string[], name: string) => row[index[key(name)]];
  const assumptions = data.map((row) => {
    const field = cleanText(at(row, "Field") || row[2]);
    if (!field) return null;
    const recommended = cleanText(at(row, "Recommended Value") || row[5]);

    return {
      source: SOURCE,
      section: cleanText(at(row, "Section") || row[1]),
      field,
      recommended_value: cleanNumber(recommended),
      raw_value: recommended,
      unit: cleanText(at(row, "Unit") || row[6]),
      refresh_frequency: cleanText(at(row, "Refresh Frequency") || row[8]),
      metadata: {
        source_tab: "Assumptions",
        source_name: cleanText(at(row, "Source") || row[0]),
        purpose: cleanText(at(row, "Purpose") || row[11]),
        owner: cleanText(at(row, "Owner") || row[12])
      },
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean) as Record<string, unknown>[];

  const periodMonth = previousPeriodMonth();
  const dieselMx = assumptions.find((item) => key(item.field) === "DIESEL MX");
  const fx = assumptions.find((item) => key(item.field) === "TIPO DE CAMBIO");

  const mxDieselIndex = dieselMx?.recommended_value ? [{
    source: "rateware_assumptions",
    period_month: periodMonth,
    country: "MX",
    market_key: "MX_NATIONAL",
    market: "Mexico national",
    diesel_mxn_per_liter: dieselMx.recommended_value,
    source_note: "Assumptions sheet Diesel MX",
    active: true,
    updated_at: new Date().toISOString()
  }] : [];

  const fxRates = fx?.recommended_value ? [{
    source: "rateware_assumptions",
    period_month: periodMonth,
    currency_pair: "MXN/USD",
    rate: fx.recommended_value,
    source_note: "Assumptions sheet Tipo de Cambio",
    active: true,
    updated_at: new Date().toISOString()
  }] : [];

  return { assumptions, mxDieselIndex, fxRates };
}

function parseFactors(rows: string[][]) {
  if (!rows.length) return [];
  const [header, ...data] = rows;
  const index = Object.fromEntries(header.map((name, position) => [key(name), position]));
  const at = (row: string[], name: string) => row[index[key(name)]];

  return data.map((row) => {
    const factorGroup = cleanText(at(row, "Factor Group") || at(row, "Group") || row[0]);
    const factorName = cleanText(at(row, "Factor Name") || at(row, "Name") || row[1]);
    if (!factorGroup || !factorName) return null;
    const recommended = cleanText(at(row, "Recommended Value") || at(row, "Value") || row[2]);

    return {
      source: SOURCE,
      factor_group: factorGroup,
      factor_name: factorName,
      recommended_value: cleanNumber(recommended),
      raw_value: recommended,
      unit: cleanText(at(row, "Unit") || row[3]),
      notes: cleanText(at(row, "Notes") || row[5]),
      lookup_key: key([factorGroup, factorName].join(" ")),
      metadata: {
        source_tab: "Factors",
        applies_to: cleanText(at(row, "Applies To") || row[4])
      },
      active: true,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean) as Record<string, unknown>[];
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
    const mode = cleanText(body.mode) || "core";
    const includeLaneMileage = mode === "full" || body.include_lane_mileage === true;
    const supabase = getClient();

    const [cusCatalog, usaFuel, usaFSCtrend, usaFSCindex, assumptionsSheet, factorsSheet] = await Promise.all([
      fetchOptionalSheet(sheetId, "cusCatalog"),
      fetchOptionalSheet(sheetId, "usaFuel"),
      fetchOptionalSheet(sheetId, "usaFSCtrend"),
      fetchOptionalSheet(sheetId, "usaFSCindex"),
      fetchOptionalSheet(sheetId, "Assumptions"),
      fetchOptionalSheet(sheetId, "Factors")
    ]);

    const [usaLaneData, mexLaneData, usaLaneProd, mexLaneProd] = includeLaneMileage
      ? await Promise.all([
        fetchOptionalSheet(sheetId, "usaLaneData"),
        fetchOptionalSheet(sheetId, "mexLaneData"),
        fetchOptionalSheet(sheetId, "usaLaneProd"),
        fetchOptionalSheet(sheetId, "mexLaneProd")
      ])
      : [[], [], [], []];

    const catalog = parseCusCatalog(cusCatalog);
    const uniqueCatalogItems = [...new Map(catalog.items.map((item) => [`${item.category}|${item.raw_value}|${item.normalized_value}`, item])).values()];
    const uniqueLocations = [...new Map(catalog.locations.map((item) => [item.location_key, item])).values()];
    const laneMileage = [
      ...parseUsaLaneData(usaLaneData),
      ...parseMexLaneData(mexLaneData),
      ...parseProd(usaLaneProd, "usaLaneProd", "us"),
      ...parseProd(mexLaneProd, "mexLaneProd", "mx")
    ] as Record<string, unknown>[];

    await upsertInBatches(supabase, "rateware_catalog_items", uniqueCatalogItems, "source,category,raw_value,normalized_value");
    await upsertInBatches(supabase, "rateware_locations", uniqueLocations, "source,location_key");
    if (includeLaneMileage) {
      await upsertInBatches(supabase, "rateware_lane_mileage", laneMileage, "source,route_key");
    }
    const fuelRegions = parseFuelRegions(usaFuel) as Record<string, unknown>[];
    const fscTrend = parseFscTrend(usaFSCtrend) as Record<string, unknown>[];
    const fscIndex = parseFscIndex(usaFSCindex) as Record<string, unknown>[];
    const assumptions = parseAssumptions(assumptionsSheet);
    const factors = parseFactors(factorsSheet);

    await upsertInBatches(supabase, "rateware_fuel_regions", fuelRegions, "state_code,source");
    await upsertInBatches(supabase, "rateware_fsc_trend", fscTrend, "source,fuel_region,index_date,api_fetch");
    await upsertInBatches(supabase, "rateware_fsc_index", fscIndex, "source,diesel_from,diesel_to");
    await upsertInBatches(supabase, "rateware_assumptions", assumptions.assumptions, "source,field");
    await upsertInBatches(supabase, "rateware_mx_diesel_index", assumptions.mxDieselIndex, "source,period_month,market_key");
    await upsertInBatches(supabase, "rateware_fx_rates", assumptions.fxRates, "source,period_month,currency_pair");
    await upsertInBatches(supabase, "rateware_factor_items", factors, "source,lookup_key");

    return jsonResponse({
      sheet_id: sheetId,
      mode,
      catalog_items: uniqueCatalogItems.length,
      locations: uniqueLocations.length,
      lane_mileage: laneMileage.length,
      fuel_regions: fuelRegions.length,
      fsc_trend: fscTrend.length,
      fsc_index: fscIndex.length,
      assumptions: assumptions.assumptions.length,
      mx_diesel_index: assumptions.mxDieselIndex.length,
      fx_rates: assumptions.fxRates.length,
      factors: factors.length
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
