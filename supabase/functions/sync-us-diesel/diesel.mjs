// Pure helpers for the weekly EIA diesel sync; imported by the edge function
// and by tests/us-diesel-sync.test.mjs.

// EIA's "On-Highway Diesel Fuel Retail Price" regions, as rateware_fsc_trend
// and rateware_fuel_regions name them.
export const EIA_DIESEL_REGIONS = [
  "U.S.",
  "East Coast",
  "New England",
  "Central Atlantic",
  "Lower Atlantic",
  "Midwest",
  "Gulf Coast",
  "Rocky Mountain",
  "West Coast",
  "West Coast less California",
  "California"
];

// The RSS title reads "Data For 09/21/26" (the Monday the prices refer to).
export function weekDateFromRss(xml) {
  const match = /Data For\s+(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(String(xml || ""));
  if (!match) return null;
  const [, month, day, yearText] = match;
  const year = yearText.length === 2 ? `20${yearText}` : yearText;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Region -> $/gal from the diesel section of the EIA gasoline & diesel RSS.
 * Lines look like "6.177 ... Gulf Coast"; names are matched exactly, so
 * "West Coast less California" never overwrites "West Coast" or "California".
 */
export function parseDieselPrices(xml) {
  const text = String(xml || "");
  const start = text.indexOf("On-Highway Diesel Fuel Retail Price");
  if (start < 0) return {};
  const section = text.slice(start);
  const prices = {};
  for (const raw of section.split(/<br\s*\/?>/i)) {
    const line = raw.replace(/\]\]>.*$/s, "").replace(/\s+/g, " ").trim();
    const match = /^(\d+(?:\.\d+)?)\s*\.+\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const price = Number(match[1]);
    const region = match[2].trim();
    if (!EIA_DIESEL_REGIONS.includes(region)) continue;
    if (Number.isFinite(price) && price > 0 && price < 20 && prices[region] === undefined) prices[region] = price;
  }
  return prices;
}

/**
 * Truckload fuel surcharge per mile for a diesel price, from the reviewed
 * rateware_fsc_index schedule (diesel_from <= price < diesel_to).
 */
export function fscPerMile(diesel, brackets) {
  const price = Number(diesel);
  if (!Number.isFinite(price)) return null;
  const row = (brackets || []).find((bracket) =>
    Number(bracket.diesel_from) <= price && price < Number(bracket.diesel_to)
  );
  const value = row ? Number(row.truckload_per_mile) : NaN;
  return Number.isFinite(value) ? value : null;
}
