// QuoteDesk pricing math. Pure functions shared by the quotedesk-api edge
// function and its node tests; the Bidware UI mirrors them for live previews,
// but the server's result is the one that gets stored.
//
// Semantics follow the team's QuoteDesk sheet: accessorials are COSTS added to
// the base cost before markup (Net Freight Cost + ACC = Gross Freight Cost),
// and the margin is what the markup adds on top of that cost.

export const QUOTE_TYPES = ["spot", "contract"];
export const QUOTE_CHANNELS = ["email", "whatsapp", "phone", "rfi", "portal", "other"];
export const QUOTE_CURRENCIES = ["USD", "MXN"];
export const QUOTE_STATUSES = ["new", "estimating", "quoted", "bid_room", "won", "lost", "expired", "archived"];
export const MARKUP_MODES = ["percent_on_cost", "fixed_amount", "target_margin"];
export const ACCESSORIAL_UNITS = ["hour", "event", "trip", "day", "mile", "other"];
export const COST_SOURCES = ["manual", "bid_room_award", "fcm"];

// Where a quote may go next. Archiving is always possible; restoring an
// archived quote puts it back in the queue.
const STATUS_TRANSITIONS = {
  new: ["estimating", "quoted", "bid_room", "lost", "archived"],
  estimating: ["new", "quoted", "bid_room", "lost", "archived"],
  quoted: ["estimating", "bid_room", "won", "lost", "expired", "archived"],
  bid_room: ["estimating", "quoted", "won", "lost", "archived"],
  won: ["quoted", "archived"],
  lost: ["estimating", "archived"],
  expired: ["estimating", "quoted", "archived"],
  archived: ["new"]
};

export class QuoteInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuoteInputError";
  }
}

export function canTransition(from, to) {
  if (from === to) return true;
  return Boolean(STATUS_TRANSITIONS[from]?.includes(to));
}

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function cleanLabel(value, max = 120) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text ? text.slice(0, max) : "";
}

/**
 * Non-negative amount or null. Blank means "not captured yet", which is
 * different from zero, so the base cost can tell "no cost" from "$0".
 */
export function amountOrNull(value, label) {
  const number = toNumber(value);
  if (number === null) return null;
  if (number < 0) throw new QuoteInputError(`${label} no puede ser negativo.`);
  if (number > 10_000_000) throw new QuoteInputError(`${label} es demasiado grande.`);
  return round2(number);
}

/** Accessorial lines: label + unit + quantity × rate. Invalid lines are dropped. */
export function normalizeAccessorials(list) {
  if (!Array.isArray(list)) return [];
  const lines = [];
  for (const item of list.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const label = cleanLabel(item.label);
    if (!label) continue;
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate);
    if (quantity === null || rate === null || quantity < 0 || rate < 0) continue;
    const unit = ACCESSORIAL_UNITS.includes(item.unit) ? item.unit : "other";
    const code = cleanLabel(item.code, 60).toLowerCase().replace(/[^a-z0-9_]+/g, "_") || null;
    lines.push({
      code,
      label,
      unit,
      quantity: round2(quantity),
      rate: round2(rate),
      subtotal: round2(quantity * rate)
    });
  }
  return lines;
}

function validatedMarkup(mode, value) {
  const markupMode = MARKUP_MODES.includes(mode) ? mode : "percent_on_cost";
  const markupValue = toNumber(value);
  if (markupValue === null) return { markupMode, markupValue: null };
  if (markupMode === "percent_on_cost" && (markupValue <= -100 || markupValue > 1000)) {
    throw new QuoteInputError("El markup en % debe estar entre -100 y 1000.");
  }
  if (markupMode === "target_margin" && (markupValue < 0 || markupValue >= 100)) {
    throw new QuoteInputError("El margen objetivo debe ser mayor o igual a 0 y menor a 100%.");
  }
  if (markupMode === "fixed_amount" && Math.abs(markupValue) > 10_000_000) {
    throw new QuoteInputError("El markup fijo es demasiado grande.");
  }
  return { markupMode, markupValue: round4(markupValue) };
}

/**
 * Derived numbers for one route. `input` carries the editable components;
 * everything returned besides the echoed inputs is computed here.
 */
export function computeLane(input = {}) {
  const components = {
    linehaul_mx: amountOrNull(input.linehaul_mx, "El linehaul MX"),
    linehaul_us: amountOrNull(input.linehaul_us, "El linehaul US"),
    fuel_amount: amountOrNull(input.fuel_amount, "El combustible"),
    border_amount: amountOrNull(input.border_amount, "El cruce"),
    carrier_rate: amountOrNull(input.carrier_rate, "La tarifa del carrier")
  };
  const captured = Object.values(components).filter((value) => value !== null);
  const baseCost = captured.length ? round2(captured.reduce((sum, value) => sum + value, 0)) : null;

  const accessorials = normalizeAccessorials(input.accessorials);
  const accessorialsTotal = round2(accessorials.reduce((sum, line) => sum + line.subtotal, 0));
  const { markupMode, markupValue } = validatedMarkup(input.markup_mode, input.markup_value);

  const hasCost = baseCost !== null || accessorials.length > 0;
  const costTotal = round2((baseCost ?? 0) + accessorialsTotal);
  let markupAmount = null;
  let allInRate = null;
  if (hasCost) {
    if (markupValue === null) {
      markupAmount = 0;
    } else if (markupMode === "percent_on_cost") {
      markupAmount = round2(costTotal * markupValue / 100);
    } else if (markupMode === "fixed_amount") {
      markupAmount = round2(markupValue);
    } else {
      allInRate = round2(costTotal / (1 - markupValue / 100));
      markupAmount = round2(allInRate - costTotal);
    }
    if (allInRate === null) allInRate = round2(costTotal + markupAmount);
  }
  const marginPct = allInRate !== null && allInRate > 0 && markupAmount !== null
    ? round4(markupAmount / allInRate * 100)
    : null;

  return {
    ...components,
    accessorials,
    accessorials_total: accessorialsTotal,
    base_cost: baseCost,
    markup_mode: markupMode,
    markup_value: markupValue,
    markup_amount: markupAmount,
    all_in_rate: allInRate,
    margin_amount: markupAmount,
    margin_pct: marginPct
  };
}

/** Totals across a quote's routes (per load; volume is informational). */
export function summarizeLanes(lanes = []) {
  const priced = lanes.filter((lane) => toNumber(lane.all_in_rate) !== null);
  const sum = (key) => round2(priced.reduce((total, lane) => total + (toNumber(lane[key]) ?? 0), 0));
  const allIn = sum("all_in_rate");
  const margin = sum("margin_amount");
  return {
    lane_count: lanes.length,
    priced_lane_count: priced.length,
    base_cost_total: sum("base_cost"),
    accessorials_total: sum("accessorials_total"),
    all_in_total: allIn,
    margin_total: margin,
    margin_pct: allIn > 0 ? round4(margin / allIn * 100) : null
  };
}

/** US fuel surcharge for the US miles, in the quote's currency. */
export function suggestedFuelAmount({ usMiles, fscPerMile, currency, fxUsdMxn }) {
  const miles = toNumber(usMiles);
  const fsc = toNumber(fscPerMile);
  if (miles === null || fsc === null || miles <= 0 || fsc <= 0) return null;
  const usd = miles * fsc;
  if (currency === "MXN") {
    const fx = toNumber(fxUsdMxn);
    return fx && fx > 0 ? round2(usd * fx) : null;
  }
  return round2(usd);
}

/** Same normalization rateware uses for route keys (rateware-api catalogKey). */
export function catalogKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Candidate `rateware_lane_mileage.route_key`s for a leg between two places.
 * MX rows are keyed by "City, State" with either the state code or the full
 * name; US rows by KMA market ("Laredo Mkt (TX)").
 */
export function legRouteKeys(from = {}, to = {}) {
  const variants = (place) => {
    const names = new Set();
    const city = cleanLabel(place.city);
    for (const state of [place.state_code, place.state_name]) {
      const stateText = cleanLabel(state);
      if (city && stateText) names.add(`${city} ${stateText}`);
    }
    if (cleanLabel(place.market)) names.add(cleanLabel(place.market));
    if (cleanLabel(place.label)) names.add(cleanLabel(place.label));
    return [...names].map(catalogKey).filter(Boolean);
  };
  const keys = [];
  for (const a of variants(from)) {
    for (const b of variants(to)) keys.push(`${a} ${b}`);
  }
  return [...new Set(keys)];
}

export function folioFor(number) {
  return `Q-${number}`;
}
