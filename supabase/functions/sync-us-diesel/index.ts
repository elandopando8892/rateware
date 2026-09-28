// Pulls this week's US on-highway diesel price by region from EIA and stores it
// with its truckload fuel surcharge per mile, so QuoteDesk suggestions and rate
// normalization use current fuel instead of the last manual sheet sync.
//
// Source: EIA's public "Gasoline and Diesel Fuel Update" RSS (no API key). The
// surcharge comes from the reviewed rateware_fsc_index schedule, the same one
// the sheet used. Intended to run weekly; re-running the same week updates the
// same rows (unique source + region + week + series).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";
import { fscPerMile, parseDieselPrices, weekDateFromRss } from "./diesel.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const EIA_DIESEL_RSS = "https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml";
const SOURCE = "eia_weekly_rss";
const INDEX_SOURCE = "usaFSCindex";
// Same shared secret the Banxico schedule uses; nothing else can trigger this.
const SYNC_CRON_SECRET = (Deno.env.get("SYNC_CRON_SECRET") || "").trim();

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function secretMatches(supplied: string) {
  if (!SYNC_CRON_SECRET || supplied.length !== SYNC_CRON_SECRET.length) return false;
  let diff = 0;
  for (let index = 0; index < supplied.length; index += 1) {
    diff |= supplied.charCodeAt(index) ^ SYNC_CRON_SECRET.charCodeAt(index);
  }
  return diff === 0;
}

async function syncUsDiesel() {
  const response = await fetch(EIA_DIESEL_RSS, { headers: { Accept: "application/rss+xml, text/xml" } });
  if (!response.ok) throw new Error(`EIA RSS request failed (${response.status}).`);
  const xml = await response.text();
  const week = weekDateFromRss(xml);
  const prices = parseDieselPrices(xml) as Record<string, number>;
  const regions = Object.keys(prices);
  if (!week) throw new Error("EIA RSS did not include the week the prices refer to.");
  if (!regions.includes("U.S.") || regions.length < 5) {
    throw new Error(`EIA RSS diesel section could not be read (${regions.length} regions).`);
  }

  const supabase = getClient();
  const bracketsResult = await supabase.from("rateware_fsc_index")
    .select("diesel_from,diesel_to,truckload_per_mile")
    .eq("source", INDEX_SOURCE)
    .eq("active", true)
    .order("diesel_from", { ascending: true });
  if (bracketsResult.error) throw bracketsResult.error;
  const brackets = bracketsResult.data || [];
  if (!brackets.length) throw new Error("The fuel surcharge schedule (rateware_fsc_index) is empty.");

  const now = new Date().toISOString();
  const rows = regions.map((region) => ({
    source: SOURCE,
    fuel_region: region,
    index_date: week,
    diesel_per_gallon: prices[region],
    fsc_per_mile: fscPerMile(prices[region], brackets),
    api_fetch: `${region} On-Highway Diesel Retail Price (EIA weekly)`,
    active: true,
    updated_at: now
  }));
  const missing = rows.filter((row) => row.fsc_per_mile === null).map((row) => row.fuel_region);
  if (missing.length) throw new Error(`No fuel surcharge bracket for: ${missing.join(", ")}.`);

  const upsert = await supabase.from("rateware_fsc_trend")
    .upsert(rows, { onConflict: "source,fuel_region,index_date,api_fetch" })
    .select("fuel_region");
  if (upsert.error) throw upsert.error;

  // Keep each state's current diesel and surcharge in step with its region.
  let statesUpdated = 0;
  for (const row of rows) {
    const update = await supabase.from("rateware_fuel_regions")
      .update({ diesel_per_gallon: row.diesel_per_gallon, fsc_per_mile: row.fsc_per_mile, updated_at: now })
      .eq("fuel_region", row.fuel_region)
      .eq("active", true)
      .select("state_code");
    if (update.error) throw update.error;
    statesUpdated += (update.data || []).length;
  }

  return {
    week,
    stored: (upsert.data || []).length,
    states_updated: statesUpdated,
    regions: rows.map((row) => ({ region: row.fuel_region, diesel: row.diesel_per_gallon, fsc_per_mile: row.fsc_per_mile }))
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!SYNC_CRON_SECRET) return jsonResponse({ error: "SYNC_CRON_SECRET is not configured." }, 500, request);
  if (!secretMatches((request.headers.get("x-cron-secret") || "").trim())) {
    return jsonResponse({ error: "Unauthorized." }, 401, request);
  }
  try {
    return jsonResponse(await syncUsDiesel(), 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as Record<string, unknown>)?.message || "Diesel sync failed.");
    console.error("SYNC_US_DIESEL_FAILED", message);
    return jsonResponse({ error: message }, 502, request);
  }
});
