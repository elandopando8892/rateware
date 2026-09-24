// Google Routes fallback for legs the mileage catalog doesn't have. Pure
// helpers only; the edge function does the HTTP call and the caching.

const METERS_PER_MILE = 1609.344;

/**
 * A geocodable address for a place picked from rateware's location catalog:
 * MX "City, State, México"; US/CA "City, ST, USA|Canada". A KMA market such as
 * "Laredo Mkt (TX)" or "Monterrey Market" stands in when there is no city.
 */
export function placeQuery(place = {}) {
  const country = String(place.country || "").toUpperCase();
  const countryName = country === "MX" ? "México" : country === "CA" ? "Canada" : "USA";
  let city = String(place.city || "").trim();
  let state = country === "MX"
    ? String(place.state_name || place.state_code || "").trim()
    : String(place.state_code || "").trim();
  if (!city && place.market) {
    const match = /^(.+?)\s+(?:Mkt|Market)\s*(?:\(([A-Za-z]{2})\))?\s*$/i.exec(String(place.market).trim());
    if (match) {
      city = match[1].trim();
      if (!state && match[2]) state = match[2].toUpperCase();
    }
  }
  if (!city) return null;
  return [city, state, countryName].filter(Boolean).join(", ");
}

/** Cache key for a query: case, accents and punctuation don't matter. */
export function queryKey(query) {
  return String(query || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function metersToMiles(meters) {
  const value = Number(meters);
  return Number.isFinite(value) && value >= 0 ? Math.round((value / METERS_PER_MILE) * 10) / 10 : null;
}
