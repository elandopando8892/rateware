// Slice of the Freight Cost Model V3.0 that QuoteDesk still needs: reading the
// shipper’s free-text equipment, mapping QuoteDesk operations/services onto the
// FCM’s, picking the cost base that covers a route, the crossing model and the
// tier margins. The cost itself is no longer calculated here: since 2026-10-31
// QuoteDesk asks Fr8Quote (/api/estimate, fr8quote.estimate.v1), so there is a
// single engine. The V3 port that used to live in this file was removed.
//
// QuoteDesk rules on top of the cost (user decisions, 2026-09-24):
// - The cruce is its own line and depends on the crossing model: interchange
//   (transfer, swap, drayage) carries it; blue plates (direct, B1) do not.
// - The carrier’s price to us = cost floor / (1 - tier margin), with the tier
//   (minimum, target, premium) picked per lane; our markup goes on top.

export const round2 = (n) => Math.round(n * 100) / 100;

/** FCM ParamMap lookup: "SECTION__Field" → value, else the V3.0 default. */
export function getParam(map, section, field, fallback = 0) {
  return map?.[`${section}__${field}`] ?? fallback;
}

// ---------------------------------------------------------------- factors

/** Southbound / import legs are the carrier's backhaul by default; the analyst can change it. */
export function defaultService(operation) {
  switch (operation) {
    case "D2D Import":
    case "MX Southbound":
    case "US Southbound":
      return "Backhaul";
    default:
      return "One Way";
  }
}

export function trailerFactor(trailer, params) {
  switch (trailer) {
    case "Dry Van": return getParam(params, "FACTORS", "Trailer Dry Van", 1.0);
    case "Flatbed": return getParam(params, "FACTORS", "Trailer Flatbed", 1.3);
    case "Overdim": return getParam(params, "FACTORS", "Trailer Overdim", 1.8);
    case "Hazmat": return getParam(params, "FACTORS", "Trailer Hazmat", 1.2);
    case "Reefer": return getParam(params, "FACTORS", "Trailer Reefer", 1.5);
    case "Chassis": return getParam(params, "FACTORS", "Trailer Chassis", 1.15);
    case "Power Only": return getParam(params, "FACTORS", "Trailer Power Only", 0.8);
    default: return 1.0;
  }
}

// ---------------------------------------------------------------- legs and tiers

export function legsFor(operation) {
  switch (operation) {
    case "D2D Export":
    case "D2D Import":
      return { mex: true, usa: true };
    case "Drayage":
    case "Intra-US":
    case "US Northbound":
    case "US Southbound":
      return { mex: false, usa: true };
    default:
      return { mex: true, usa: false };
  }
}

// ---------------------------------------------------------------- QuoteDesk mapping

export const TIERS = {
  minimum: { field: "Minimum Gross Margin", fallback: 0.12, label: "Mínimo" },
  target: { field: "Target Gross Margin", fallback: 0.18, label: "Objetivo" },
  premium: { field: "Premium Gross Margin", fallback: 0.25, label: "Premium" }
};

export function tierMargins(params) {
  return Object.fromEntries(Object.entries(TIERS).map(([key, tier]) => [key, getParam(params, "TECHNICAL_MARGIN", tier.field, tier.fallback)]));
}

const FCM_OPERATIONS = new Set(["D2D Export", "D2D Import", "Intra-Mex", "Local", "MX Northbound", "MX Southbound", "Intra-US", "US Northbound", "US Southbound"]);

/**
 * The RFI template's names (the shipper's form and the shared catalog use
 * them) for operations the FCM models under its own name. MX Drayage isn't
 * one: the FCM's Drayage is the US leg, so the countries decide.
 */
const TEMPLATE_OPERATIONS = {
  "Intra-MX": "Intra-Mex",
  "Local MX": "Local",
  "Intra-US/CA": "Intra-US",
  "Local US/CA": "Intra-US",
  "US/CA Northbound": "US Northbound",
  "US/CA Southbound": "US Southbound"
};
const MX_SIDE = new Set(["Intra-Mex", "Local"]);

/** QuoteDesk's operation (rateware catalog) as an FCM operation; the countries decide when it is ambiguous. */
export function fcmOperation(operation, originCountry, destinationCountry) {
  const named = String(operation || "").trim();
  const value = TEMPLATE_OPERATIONS[named] || named;
  const from = String(originCountry || "").toUpperCase();
  const to = String(destinationCountry || "").toUpperCase();
  const mx = (country) => country === "MX";
  const byCountries = mx(from) && !mx(to) ? "D2D Export"
    : !mx(from) && mx(to) ? "D2D Import"
      : mx(from) && mx(to) ? "Intra-Mex"
        : "Intra-US";
  if (value === "Domestic MX") return mx(from) && mx(to) ? "Intra-Mex" : byCountries;
  if (value === "Domestic US") return !mx(from) && !mx(to) ? "Intra-US" : byCountries;
  if (!FCM_OPERATIONS.has(value)) return byCountries; // Cross-border, Drayage or blank
  // A cross-border operation needs one leg in each country, and a domestic one none.
  const crossBorder = value === "D2D Export" || value === "D2D Import";
  if (crossBorder !== (mx(from) !== mx(to))) return byCountries;
  // A template name also says which country the lane runs in ("Local US/CA"); the countries must agree.
  if (value !== named && MX_SIDE.has(value) !== (mx(from) && mx(to))) return byCountries;
  return value;
}

/** The carrier's trip type. Expedited is never a backhaul; blank takes the FCM default. */
export function fcmService(service, operation) {
  const value = String(service || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!value) return defaultService(operation);
  if (value === "backhaul") return "Backhaul";
  if (["round trip", "roundtrip", "rt"].includes(value)) return "Roundtrip";
  if (["expedited", "expeditado", "urgente"].includes(value)) return "Expedited";
  return "One Way"; // One Way, OW Export/Import, Truckload
}

/** What the shipper sees: a backhaul is our cost assumption, not the service sold. */
export function customerService(service) {
  const value = String(service || "").trim();
  return /^backhaul$/i.test(value) ? "One Way" : value;
}

const TRUCK_TYPES = new Set(["Truck Trailer", "Thorton", "Rabon", "3.5 tons", "1.5 tons"]);
const TRAILERS = new Set(["Dry Van", "Flatbed", "Reefer", "Hazmat", "Chassis", "Power Only", "Overdim"]);

export const TRUCK_LABEL = { "Truck Trailer": "Tractocamión", Thorton: "Torton", Rabon: "Rabón", "3.5 tons": "Camioneta 3.5 t", "1.5 tons": "Camioneta 1.5 t" };
export const TRAILER_LABEL = { "Dry Van": "Caja seca", Reefer: "Refrigerado", Flatbed: "Plataforma", Hazmat: "Hazmat", Overdim: "Sobredimensionado", Chassis: "Chasis", "Power Only": "Sólo tracto" };
export const CONFIG_LABEL = { Single: "Sencillo", Tandem: "Full" };

// What people type in the Bid Room and QuoteDesk ("Reefer 53'", "Plataforma 48'",
// "Rabón", "Camioneta 3.5", "Sprinter") read as the FCM's equipment. First match wins.
const TRUCK_WORDS = [
  ["1.5 tons", /\b1[.,]5\s*(?:t\b|ton)|cargo\s*van|sprinter|^\s*van\s*$|camioneta(?!\s*(?:de\s*)?3[.,]5)/i],
  ["3.5 tons", /\b3[.,]5\s*(?:t\b|ton)|box\s*truck|camioneta\s*(?:de\s*)?3[.,]5/i],
  ["Rabon", /rab[oó]n|straight\s*truck|\b(?:8|10)\s*(?:t\b|ton)/i],
  ["Thorton", /th?orton|\b(?:12|14|15|16|18)\s*(?:t\b|ton)/i],
  ["Truck Trailer", /truck\s*trailer|tract(?:o|or)|trailer|t3-?s[23]|\bfull\b|\bdv\s*53\b|\b(?:53|48)\s*(?:'|ft\b|pies\b)?/i]
];
// Highest FCM risk factor first, so "Reefer Hazmat" prices as Reefer.
const TRAILER_WORDS = [
  ["Overdim", /overdim|sobre\s*-?\s*dimension|lowboy|cama\s*baja|oversize/i],
  ["Reefer", /reefer|refriger|\bthermo|\btermo|frigor|temperatura\s*controlada/i],
  ["Flatbed", /flat\s*-?\s*bed|plataforma/i],
  ["Hazmat", /hazmat|haz\s*mat|peligros|hazardous/i],
  ["Chassis", /chass?is/i],
  ["Power Only", /power\s*only|s[oó]lo\s*tracto/i],
  ["Dry Van", /dry\s*van|caja\s*seca|\bseca\b|\bdv\b|\bdv\s*53\b|\bbox\b/i]
];
const TANDEM_WORDS = /tandem|\bfull\b|doble|double|t3-?s2-?r4/i;

const firstMatch = (words, value) => (words.find(([, pattern]) => pattern.test(value)) || [null])[0];

/** The FCM equipment for free-text lane fields, plus notes on anything guessed or unknown. */
export function readEquipment({ equipment, trailer, config } = {}) {
  const truckText = String(equipment || "").trim();
  const boxText = String(trailer || "").trim();
  const configText = String(config || "").trim();
  const allText = [truckText, boxText, configText].filter(Boolean).join(" ");
  const notes = [];
  const truckType = TRUCK_TYPES.has(truckText) ? truckText
    : firstMatch(TRUCK_WORDS, truckText) || firstMatch(TRUCK_WORDS.slice(0, 4), boxText) || "Truck Trailer"; // DV53 and blanks are a tractor-trailer
  if (truckText && !TRUCK_TYPES.has(truckText) && !firstMatch(TRUCK_WORDS, truckText) && !firstMatch(TRAILER_WORDS, truckText)) {
    notes.push(`No reconocí el equipo "${truckText}"; se calculó como ${TRUCK_LABEL[truckType].toLowerCase()}.`);
  }
  const tons = truckText.match(/\b(8|10|12|14|15|16|18)\s*(?:t\b|ton)/i)?.[1];
  const guessed = tons ? `${tons} t` : /camioneta/i.test(truckText) && !/\d/.test(truckText) ? "Camioneta"
    : /rab[oó]n/i.test(truckText) && /th?orton/i.test(truckText) ? truckText : null;
  if (guessed && !TRUCK_TYPES.has(truckText)) {
    notes.push(`Se interpretó "${guessed}" como ${TRUCK_LABEL[truckType].toLowerCase()}; corrígelo si es otra unidad.`);
  }
  const box = TRAILERS.has(boxText) ? boxText : firstMatch(TRAILER_WORDS, allText) || "Dry Van";
  if (boxText && !TRAILERS.has(boxText) && !firstMatch(TRAILER_WORDS, allText) && !firstMatch(TRUCK_WORDS, boxText)) {
    notes.push(`No reconocí el remolque "${boxText}"; se calculó como caja seca.`);
  }
  if (box !== "Hazmat" && TRAILER_WORDS.find(([name]) => name === "Hazmat")[1].test(allText)) {
    notes.push(`El FCM no combina hazmat con ${TRAILER_LABEL[box].toLowerCase()}; se calculó como ${TRAILER_LABEL[box].toLowerCase()}, sin la prima de hazmat.`);
  }
  const tandem = /sencill|single/i.test(configText) ? false : TANDEM_WORDS.test(configText) || TANDEM_WORDS.test(truckText);
  return {
    equipment: {
      truckType,
      trailer: box,
      config: tandem ? "Tandem" : "Single",
      driver: "B1" // the FCM screen's default driver
    },
    notes
  };
}

export function fcmEquipment(input = {}) {
  return readEquipment(input).equipment;
}

/** The FCM lane table keys most 1.5-ton routes as "< 1.5 tons"; look both up. */
export function mexLaneUnits(truckType) {
  return truckType === "1.5 tons" ? ["1.5 tons", "< 1.5 tons"] : [truckType];
}

export function equipmentLabel(equipment) {
  return [TRUCK_LABEL[equipment.truckType], TRAILER_LABEL[equipment.trailer], CONFIG_LABEL[equipment.config]].filter(Boolean).join(" · ");
}

/** What the FCM does not model for this equipment, in the base's own factors. */
export function equipmentCaveats(equipment, params = {}) {
  const caveats = [];
  if (equipment.truckType !== "Truck Trailer") {
    caveats.push(`${TRUCK_LABEL[equipment.truckType]}: el FCM lo estima escalando el costo del tractocamión con factores fijos; aún no tiene costos propios de esa unidad.`);
  }
  if (["Reefer", "Flatbed", "Hazmat", "Overdim"].includes(equipment.trailer)) {
    const pct = Math.round((trailerFactor(equipment.trailer, params) - 1) * 100);
    caveats.push(`${TRAILER_LABEL[equipment.trailer]}: el FCM sólo suma un recargo de riesgo de ${pct} % al costo de caja seca; no costea el equipo especial.`);
  }
  return caveats;
}

const INTERCHANGE_MODELS = new Set(["transfer", "swap", "drayage"]);
const BLUE_PLATE_MODELS = new Set(["direct", "b1"]);

/** Interchange (transfer, swap, drayage) carries the cruce; blue plates (direct, B1) do not. Unknown: carries it, as the FCM does. */
export function crossingCarriesBorder(model) {
  const value = String(model || "").trim().toLowerCase();
  if (INTERCHANGE_MODELS.has(value)) return { carries: true, known: true };
  if (BLUE_PLATE_MODELS.has(value)) return { carries: false, known: true };
  return { carries: true, known: false };
}

// ---------------------------------------------------------------- which base prices a route (cost-bases.service.ts)

export function scopeForOperation(operation) {
  switch (operation) {
    case "D2D Export":
    case "D2D Import":
      return "CROSS_BORDER";
    case "Drayage":
      return "DRAYAGE";
    case "Local":
      return "LOCAL";
    case "Intra-Mex":
    case "MX Northbound":
    case "MX Southbound":
      return "INTRA_MEX";
    case "Intra-US":
    case "US Northbound":
    case "US Southbound":
      return "INTRA_US";
    default:
      return null;
  }
}

export const SCOPE_LABEL = {
  CROSS_BORDER: "crossborder (D2D)",
  INTRA_MEX: "Intra-México",
  INTRA_US: "Intra-EE. UU.",
  DRAYAGE: "drayage",
  LOCAL: "local"
};

/**
 * Why a base cannot price this route, as the FCM would refuse it
 * (assertScopeCompatible + assertCalculationSupportedByProfile); null when it
 * can. Legacy sets carry no scope or profile and price any operation.
 */
export function baseRefusal(base, { operation, service, equipment }) {
  const name = base?.name || "La base";
  const expected = scopeForOperation(operation);
  if (base?.scope && expected && base.scope !== expected) {
    return `"${name}" es para rutas ${SCOPE_LABEL[base.scope] || base.scope}; esta ruta es ${operation}.`;
  }
  const profile = base?.profile;
  if (!profile || typeof profile !== "object") return null;
  const checks = [
    ["operations", operation, "la operación"],
    ["services", service, "el servicio"],
    ["truckTypes", equipment?.truckType, "el equipo"],
    ["trailerTypes", equipment?.trailer, "el remolque"],
    ["configurations", equipment?.config, "la configuración"],
    ["driverTypes", equipment?.driver, "el tipo de operador"]
  ];
  for (const [key, value, label] of checks) {
    const allowed = Array.isArray(profile[key]) ? profile[key] : null;
    if (allowed && !allowed.includes(value)) return `"${name}" no cubre ${label} ${value}; permite ${allowed.join(", ")}.`;
  }
  return null;
}

/** The base for a route: one of the route's scope that covers it, else the default, else any that covers it. */
export function pickCostBase(bases, input) {
  const fits = bases.filter((base) => !baseRefusal(base, input));
  const expected = scopeForOperation(input.operation);
  return fits.find((base) => expected && base.scope === expected) || fits.find((base) => base.is_default) || fits[0] || null;
}
