import fs from "node:fs";
import path from "node:path";

const ATTACHMENTS = "C:/Users/andre/.codex/attachments";
const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "supabase/migrations/20260623193000_rebuild_location_catalog_from_user_lists.sql");
const SOURCE = "rateware_reference_catalog";

const files = {
  zipMarkets: path.join(ATTACHMENTS, "aa0f07a1-3cc9-46df-97e1-821a069abae2/pasted-text.txt"),
  mxHomologation: path.join(ATTACHMENTS, "64429e48-845b-4e29-928b-a1015277c359/pasted-text.txt"),
  marketRegions: path.join(ATTACHMENTS, "d3048dae-cbbd-4bd1-aaa3-11cb9a801471/pasted-text.txt"),
  usPostalMarkets: path.join(ATTACHMENTS, "f3bcdbe0-c445-491e-97e9-14bec67ac33e/pasted-text.txt"),
  mxKilometers: path.join(ATTACHMENTS, "d0faa739-2174-44c9-bbd5-127c9aa56053/pasted-text.txt"),
  usMarketMiles: path.join(ATTACHMENTS, "c7be64c7-f268-44bf-b439-8d5b2f90f3d9/pasted-text.txt")
};

const MX_STATE_NAMES = {
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
  EM: "Estado de Mexico",
  MX: "Estado de Mexico",
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

const MX_STATE_CODE_BY_NAME = Object.fromEntries(
  Object.entries(MX_STATE_NAMES).map(([code, name]) => [key(name), code])
);

Object.assign(MX_STATE_CODE_BY_NAME, {
  "BAJA CALIFORNIA NORTE": "BN",
  "CDMX": "DF",
  "CIUDAD DE MEXICO": "DF",
  "COAHUILA": "CU",
  "COAHUILA DE ZARAGOZA": "CU",
  "DISTRITO FEDERAL": "DF",
  "DURANGO": "DU",
  "EDO MEX": "MX",
  "EDO. MEX": "MX",
  "ESTADO DE MEXICO": "MX",
  "GUANAJUATO": "GJ",
  "MICHOACAN DE OCAMPO": "MC",
  "MEXICO": "MX",
  "NUEVO LEON": "NL",
  "PUEBLA": "PB",
  "QUERETARO DE ARTEAGA": "QE",
  "SAN LUIS POTOSI": "SL",
  "TAMAULIPAS": "TM",
  "VERACRUZ DE IGNACIO DE LA LLAVE": "VE"
});

const US_STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
  DC: "District of Columbia"
};

const CA_PROVINCE_NAMES = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NF: "Newfoundland and Labrador",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  PQ: "Quebec",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon"
};

const US_REGION_BY_STATE = {
  CT: "Z0 - New England",
  MA: "Z0 - New England",
  ME: "Z0 - New England",
  NH: "Z0 - New England",
  RI: "Z0 - New England",
  VT: "Z0 - New England",
  NJ: "Z1 - Mid Atlantic",
  NY: "Z1 - Mid Atlantic",
  PA: "Z1 - Mid Atlantic",
  DE: "Z1 - Mid Atlantic",
  MD: "Z1 - Mid Atlantic",
  DC: "Z1 - Mid Atlantic",
  VA: "Z2 - Southeast",
  WV: "Z2 - Southeast",
  NC: "Z2 - Southeast",
  SC: "Z2 - Southeast",
  GA: "Z2 - Southeast",
  FL: "Z2 - Southeast",
  AL: "Z2 - Southeast",
  MS: "Z2 - Southeast",
  TN: "Z2 - Southeast",
  KY: "Z2 - Southeast",
  OH: "Z3 - Midwest",
  MI: "Z3 - Midwest",
  IN: "Z3 - Midwest",
  IL: "Z3 - Midwest",
  WI: "Z3 - Midwest",
  MN: "Z3 - Midwest",
  IA: "Z3 - Midwest",
  MO: "Z3 - Midwest",
  ND: "Z3 - Midwest",
  SD: "Z3 - Midwest",
  NE: "Z3 - Midwest",
  KS: "Z3 - Midwest",
  AR: "Z4 - South Central",
  LA: "Z4 - South Central",
  OK: "Z4 - South Central",
  TX: "Z4 - Texas",
  CO: "Z5 - Mountain",
  NM: "Z5 - Mountain",
  AZ: "Z5 - Mountain",
  UT: "Z5 - Mountain",
  NV: "Z5 - Mountain",
  ID: "Z5 - Mountain",
  MT: "Z5 - Mountain",
  WY: "Z5 - Mountain",
  CA: "Z6 - West",
  OR: "Z6 - West",
  WA: "Z6 - West"
};

const MX_REGION_BY_STATE = {
  BN: "Northwest Mexico",
  BS: "Northwest Mexico",
  SO: "Northwest Mexico",
  SI: "Northwest Mexico",
  CH: "North Mexico",
  NL: "Northeast Mexico",
  CU: "Northeast Mexico",
  TM: "Northeast Mexico",
  DU: "North Mexico",
  ZA: "Bajio",
  AG: "Bajio",
  GJ: "Bajio",
  QE: "Bajio",
  SL: "Bajio",
  JA: "West Mexico",
  CL: "West Mexico",
  MC: "West Mexico",
  NA: "West Mexico",
  DF: "Central Mexico",
  EM: "Central Mexico",
  MX: "Central Mexico",
  HG: "Central Mexico",
  MR: "Central Mexico",
  PB: "Central Mexico",
  TL: "Central Mexico",
  GR: "South Mexico",
  OA: "South Mexico",
  CS: "Southeast Mexico",
  TB: "Southeast Mexico",
  VE: "Gulf Mexico",
  CM: "Southeast Mexico",
  QR: "Southeast Mexico",
  YU: "Southeast Mexico"
};

const CA_REGION_BY_PROVINCE = {
  NF: "Atlantic Canada",
  NL: "Atlantic Canada",
  NS: "Atlantic Canada",
  NB: "Atlantic Canada",
  PE: "Atlantic Canada",
  QC: "Quebec",
  PQ: "Quebec",
  ON: "Ontario",
  MB: "Prairies",
  SK: "Prairies",
  AB: "Alberta",
  BC: "Western Canada",
  YT: "Northern Canada",
  NT: "Northern Canada",
  NU: "Northern Canada"
};

function clean(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bUsa\b/g, "USA")
    .replace(/\bDc\b/g, "DC")
    .replace(/\bNy\b/g, "NY");
}

function key(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

function parseTsv(file) {
  const text = fs.readFileSync(file, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}

function splitCityState(value) {
  const text = clean(value);
  if (!text) return { city: null, stateCode: null };
  const [cityPart, statePart] = text.split(",").map((part) => part?.trim());
  return {
    city: clean(cityPart),
    stateCode: clean(statePart)?.toUpperCase() || null
  };
}

function splitReferenceLocation(value) {
  const text = clean(value);
  if (!text) return { city: null, stateCode: null, stateName: null, country: null };
  const stripped = text.replace(/^\d{3,5}-/, "").trim();
  const [cityPart, ...stateParts] = stripped.split(",").map((part) => part?.trim()).filter(Boolean);
  const stateRaw = clean(stateParts.join(", "));
  const stateKey = key(stateRaw);
  const mxCode = MX_STATE_NAMES[stateRaw?.toUpperCase()] ? stateRaw.toUpperCase() : MX_STATE_CODE_BY_NAME[stateKey];
  if (mxCode) {
    return {
      city: clean(cityPart),
      stateCode: mxCode,
      stateName: MX_STATE_NAMES[mxCode],
      country: "MX"
    };
  }
  const stateCode = stateRaw && stateRaw.length <= 3 ? stateRaw.toUpperCase() : null;
  if (stateCode && US_STATE_NAMES[stateCode]) {
    return { city: clean(cityPart), stateCode, stateName: US_STATE_NAMES[stateCode], country: "US" };
  }
  if (stateCode && CA_PROVINCE_NAMES[stateCode]) {
    return { city: clean(cityPart), stateCode, stateName: CA_PROVINCE_NAMES[stateCode], country: "CA" };
  }
  return { city: clean(cityPart), stateCode, stateName: stateRaw, country: null };
}

function locationDisplay(city, stateCode) {
  return [city, stateCode].filter(Boolean).join(", ");
}

function marketFromMxCity(city) {
  const cleaned = String(city || "").replace(/^Cd\.\s*/i, "").replace(/^Ciudad\s*/i, "");
  if (/^Mexico$/i.test(cleaned)) return "Mexico City Market";
  return `${cleaned} Market`;
}

function marketFromUsCity(city, stateCode) {
  return `${titleCase(city)} Mkt (${stateCode})`;
}

function parseMxMileageRoute(value) {
  const text = clean(value);
  if (!text) return null;
  const vehicleMatch = text.match(/\s+(Truck Trailer|Caja Seca|3\.5\s*Tons?|<\s*1\.5\s*Tons?|Rabon|Rabón|Thorton|Torton)\s*$/i);
  const vehicleClass = vehicleMatch ? vehicleMatch[1].replace(/\s+/g, " ") : null;
  const route = vehicleMatch ? text.slice(0, vehicleMatch.index).trim() : text;
  const [origin, destination] = route.split(/\s+-\s+/).map(clean);
  if (!origin || !destination) return null;
  return { origin, destination, vehicleClass };
}

function addLocation(map, input) {
  const rawValue = clean(input.raw_value);
  const city = clean(input.city);
  const stateCode = clean(input.state_code)?.toUpperCase() || null;
  const metroCity = clean(input.metro_city) || [city, stateCode].filter(Boolean).join(", ");
  if (!rawValue || !city || !stateCode) return;

  const row = {
    source: SOURCE,
    country: input.country,
    location_key: key([input.country, input.zip_prefix, rawValue, metroCity, input.market].filter(Boolean).join(" ")),
    raw_value: rawValue,
    zip_prefix: clean(input.zip_prefix),
    city,
    state_code: stateCode,
    state_name: clean(input.state_name),
    metro_city: metroCity,
    market: clean(input.market),
    region: clean(input.region),
    metadata: input.metadata || {},
    active: true
  };
  map.set(row.location_key, row);
}

function addMileage(map, input) {
  const origin = clean(input.origin);
  const destination = clean(input.destination);
  if (!origin || !destination) return;
  const routeKey = key(input.route_key || [origin, destination, input.equipment, input.trailer, input.config, input.operation, input.service, input.driver].filter(Boolean).join(" "));
  if (!routeKey) return;
  map.set(`${input.source}|${routeKey}`, {
    source: input.source,
    country_scope: input.country_scope,
    route_key: routeKey,
    origin,
    destination,
    equipment: clean(input.equipment),
    trailer: clean(input.trailer),
    config: clean(input.config),
    operation: clean(input.operation),
    service: clean(input.service),
    driver: clean(input.driver),
    miles: input.miles ?? null,
    km: input.km ?? null,
    metadata: input.metadata || {},
    active: true
  });
}

function rowsToInsert(table, rows, columns, rowSql, conflictTarget, updateColumns, chunkSize = 500) {
  const statements = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    statements.push(`insert into public.${table} (\n  ${columns.join(",\n  ")}\n)\nvalues\n${chunk.map(rowSql).join(",\n")}\non conflict (${conflictTarget}) do update\nset ${updateColumns.map((column) => `${column} = excluded.${column}`).join(",\n    ")},\n    active = true,\n    updated_at = now();`);
  }
  return statements.join("\n\n");
}

function buildMarketRegionMap(rows) {
  const byCityState = new Map();
  const mxStateRegions = new Map(Object.entries(MX_REGION_BY_STATE));
  for (const row of rows.slice(1)) {
    if (row.length < 3) continue;
    const firstLooksLikeLocation = splitReferenceLocation(row[0]).city && splitReferenceLocation(row[0]).stateCode;
    const [location, market, region] = firstLooksLikeLocation ? row : [row[2], row[0], row[1]];
    const mxRegionState = clean(market)?.toUpperCase();
    if (!clean(location) && mxRegionState && MX_STATE_NAMES[mxRegionState] && region) {
      mxStateRegions.set(mxRegionState, region);
      continue;
    }
    const parsed = splitReferenceLocation(location);
    if (!market || !region || !parsed.city || !parsed.stateCode) continue;
    byCityState.set(key([parsed.city, parsed.stateCode].join(" ")), {
      market,
      region,
      city: titleCase(parsed.city),
      stateCode: parsed.stateCode,
      country: parsed.country
    });
  }
  return { byCityState, mxStateRegions };
}

function addLocationAliases(locations, input) {
  const aliases = [...new Set(input.aliases.map(clean).filter(Boolean))];
  for (const alias of aliases) {
    addLocation(locations, { ...input, raw_value: alias });
  }
}

function main() {
  const locations = new Map();
  const mileage = new Map();
  const { byCityState: marketRegions, mxStateRegions } = buildMarketRegionMap(parseTsv(files.marketRegions));
  const mxZipMarkets = new Map();

  for (const [zipRaw, marketZip, metroRaw, marketRaw] of parseTsv(files.zipMarkets).slice(1)) {
    const metro = clean(metroRaw);
    const market = clean(marketRaw);
    if (!metro || !market) continue;
    const parsed = splitReferenceLocation(metro);
    if (!parsed.city || !parsed.stateCode || !parsed.country) continue;
    const zip = clean(String(zipRaw || "").match(/^[A-Z]\d|^\d[A-Z]|^\d{3}/)?.[0]);
    const mapped = marketRegions.get(key([parsed.city, parsed.stateCode].join(" ")));
    const region = parsed.country === "MX"
      ? mxStateRegions.get(parsed.stateCode) || MX_REGION_BY_STATE[parsed.stateCode] || null
      : mapped?.region || (parsed.country === "US" ? US_REGION_BY_STATE[parsed.stateCode] : CA_REGION_BY_PROVINCE[parsed.stateCode]) || null;
    const metroCity = locationDisplay(parsed.city, parsed.stateCode);

    addLocationAliases(locations, {
      country: parsed.country,
      zip_prefix: zip,
      city: parsed.city,
      state_code: parsed.stateCode,
      state_name: parsed.stateName,
      metro_city: metroCity,
      market,
      region,
      aliases: [
        marketZip,
        metro,
        metroCity,
        locationDisplay(parsed.city, parsed.stateName),
        zip ? `${zip}-${metro}` : null
      ],
      metadata: {
        source_tab: "Zip Code Metro City Market",
        source_file: "Zip Code / Metro City / Market",
        market_zip: marketZip || null
      }
    });

    if (parsed.country === "MX") {
      mxZipMarkets.set(key([parsed.city, parsed.stateCode].join(" ")), { market, region, zip });
      mxZipMarkets.set(key([parsed.city, parsed.stateName].join(" ")), { market, region, zip });
    }
  }

  const mxRows = parseTsv(files.mxHomologation);
  const mxHomologation = new Map();
  for (const [production, homologation] of mxRows.slice(1)) {
    if (!production || !homologation) continue;
    const canonical = splitReferenceLocation(homologation);
    if (!canonical.city || !canonical.stateCode || !MX_STATE_NAMES[canonical.stateCode]) continue;
    const productionParts = splitReferenceLocation(production);
    const zipMarket = mxZipMarkets.get(key([canonical.city, canonical.stateCode].join(" ")))
      || mxZipMarkets.get(key([canonical.city, canonical.stateName].join(" ")));
    const market = zipMarket?.market || marketFromMxCity(canonical.city);
    const region = zipMarket?.region || mxStateRegions.get(canonical.stateCode) || MX_REGION_BY_STATE[canonical.stateCode] || null;
    const metroCity = locationDisplay(canonical.city, canonical.stateCode);
    const aliases = [production, homologation, productionParts.city ? `${productionParts.city}, ${canonical.stateCode}` : null].filter(Boolean);
    addLocationAliases(locations, {
      country: "MX",
      zip_prefix: zipMarket?.zip || null,
      city: canonical.city,
      state_code: canonical.stateCode,
      state_name: MX_STATE_NAMES[canonical.stateCode],
      metro_city: metroCity,
      market,
      region,
      aliases,
      metadata: {
        source_tab: "MEX Production Homolgation",
        production_value: production,
        homologation_value: homologation,
        market_source: zipMarket ? "Zip Code Metro City Market" : "derived_city_market"
      }
    });
    mxHomologation.set(key(production), metroCity);
    mxHomologation.set(key(homologation), metroCity);
  }

  for (const item of marketRegions.values()) {
    if (item.country && item.country !== "US" && item.country !== "CA") continue;
    addLocation(locations, {
      country: item.country || "US",
      raw_value: `${item.city}, ${item.stateCode}`,
      city: item.city,
      state_code: item.stateCode,
      state_name: US_STATE_NAMES[item.stateCode] || CA_PROVINCE_NAMES[item.stateCode] || item.stateCode,
      metro_city: `${item.city}, ${item.stateCode}`,
      market: item.market,
      region: item.region,
      metadata: { source_tab: "Market Region Location", market_level: true }
    });
  }

  for (const [cityRaw, stateRaw, zipRaw] of parseTsv(files.usPostalMarkets).slice(1)) {
    const stateCode = clean(stateRaw)?.toUpperCase();
    const zip = clean(zipRaw);
    if (!cityRaw || !stateCode || !zip || !US_STATE_NAMES[stateCode]) continue;
    const city = titleCase(cityRaw);
    const mapped = marketRegions.get(key([city, stateCode].join(" ")));
    addLocation(locations, {
      country: "US",
      raw_value: `${city}, ${stateCode}`,
      zip_prefix: zip.padStart(3, "0"),
      city,
      state_code: stateCode,
      state_name: US_STATE_NAMES[stateCode],
      metro_city: `${city}, ${stateCode}`,
      market: mapped?.market || marketFromUsCity(city, stateCode),
      region: mapped?.region || US_REGION_BY_STATE[stateCode] || null,
      metadata: { source_tab: "US Postal Code Market", postal_prefix: zip.padStart(3, "0") }
    });
  }

  for (const [route, kmRaw] of parseTsv(files.mxKilometers).slice(1)) {
    const parsedRoute = parseMxMileageRoute(route);
    const km = Number(kmRaw);
    if (!parsedRoute || !Number.isFinite(km)) continue;
    const { origin: originRaw, destination: destinationRaw, vehicleClass } = parsedRoute;
    const originCanonical = mxHomologation.get(key(originRaw)) || originRaw;
    const destinationCanonical = mxHomologation.get(key(destinationRaw)) || destinationRaw;
    const variants = [
      [originRaw, destinationRaw],
      [destinationRaw, originRaw],
      [originCanonical, destinationCanonical],
      [destinationCanonical, originCanonical]
    ];
    for (const [origin, destination] of variants) {
      addMileage(mileage, {
        source: "rateware_reference_mx_km",
        country_scope: "mx",
        origin,
        destination,
        km,
        miles: Number((km * 0.621371).toFixed(2)),
        metadata: { source_tab: "Gastos de Viaje KM", vehicle_class: vehicleClass }
      });
    }
  }

  for (const [originMarket, destinationMarket, milesRaw, transitDaysRaw] of parseTsv(files.usMarketMiles).slice(1)) {
    const miles = Number(milesRaw);
    if (!originMarket || !destinationMarket || !Number.isFinite(miles)) continue;
    for (const [origin, destination] of [[originMarket, destinationMarket], [destinationMarket, originMarket]]) {
      addMileage(mileage, {
        source: "rateware_reference_us_miles",
        country_scope: "us",
        route_key: [origin, destination].join(" "),
        origin,
        destination,
        miles,
        metadata: { source_tab: "US Market Miles", transit_days_raw: transitDaysRaw || null }
      });
    }
  }

  const locationRows = [...locations.values()].sort((a, b) => a.location_key.localeCompare(b.location_key));
  const mileageRows = [...mileage.values()].sort((a, b) => `${a.source} ${a.route_key}`.localeCompare(`${b.source} ${b.route_key}`));

  const locationColumns = ["source", "country", "location_key", "raw_value", "zip_prefix", "city", "state_code", "state_name", "metro_city", "market", "region", "metadata", "active", "updated_at"];
  const locationSql = rowsToInsert(
    "rateware_locations",
    locationRows,
    locationColumns,
    (row) => `  (${sql(row.source)}, ${sql(row.country)}, ${sql(row.location_key)}, ${sql(row.raw_value)}, ${sql(row.zip_prefix)}, ${sql(row.city)}, ${sql(row.state_code)}, ${sql(row.state_name)}, ${sql(row.metro_city)}, ${sql(row.market)}, ${sql(row.region)}, ${jsonSql(row.metadata)}, true, now())`,
    "source, location_key",
    ["country", "raw_value", "zip_prefix", "city", "state_code", "state_name", "metro_city", "market", "region", "metadata"]
  );

  const mileageColumns = ["source", "country_scope", "route_key", "origin", "destination", "equipment", "trailer", "config", "operation", "service", "driver", "miles", "km", "metadata", "active", "updated_at"];
  const mileageSql = rowsToInsert(
    "rateware_lane_mileage",
    mileageRows,
    mileageColumns,
    (row) => `  (${sql(row.source)}, ${sql(row.country_scope)}, ${sql(row.route_key)}, ${sql(row.origin)}, ${sql(row.destination)}, ${sql(row.equipment)}, ${sql(row.trailer)}, ${sql(row.config)}, ${sql(row.operation)}, ${sql(row.service)}, ${sql(row.driver)}, ${row.miles ?? "null"}, ${row.km ?? "null"}, ${jsonSql(row.metadata)}, true, now())`,
    "source, route_key",
    ["country_scope", "origin", "destination", "equipment", "trailer", "config", "operation", "service", "driver", "miles", "km", "metadata"]
  );

  const contents = `-- Generated by tools/generate-reference-catalog-migration.mjs\n-- Source: pasted reference catalog extracts provided in Codex attachments.\n-- Rebuilds generated catalogs so MX locations use MX city/state/market rules and US/CA use ZIP/KMA rules.\n\nupdate public.rateware_locations\nset active = false,\n    updated_at = now()\nwhere source in ('rateware_reference_catalog', 'rateware_google_catalog', 'cusCatalog', 'rateware_seed');\n\n${locationSql}\n\n${mileageSql}\n`;
  fs.writeFileSync(OUTPUT, contents, "utf8");
  console.log(`Generated ${path.relative(ROOT, OUTPUT)}`);
  console.log(`Locations: ${locationRows.length}`);
  console.log(`Mileage rows: ${mileageRows.length}`);
}

main();
