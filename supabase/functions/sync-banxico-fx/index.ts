// Pulls the daily USD/MXN FIX rate published by Banco de Mexico and stores it
// for Bid Room offer comparison.
//
// FIX (series SF63528) is the reference rate Banxico publishes each business day
// for settling obligations in Mexico, which is why it is the right yardstick for
// comparing carrier offers quoted in pesos against offers quoted in dollars.
//
// Intended to run on a daily schedule. It is idempotent: re-running on the same
// day updates the same row instead of inserting a duplicate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const BANXICO_TOKEN = (Deno.env.get("BANXICO_API_TOKEN") || "").trim();
// SF63528 = "Tipo de cambio pesos por dolar E.U.A. FIX".
const BANXICO_SERIES = (Deno.env.get("BANXICO_FX_SERIES") || "SF63528").trim();
const CURRENCY_PAIR = "USD/MXN";
const SOURCE = "banxico_fix";
// This endpoint spends a rate-limited Banxico quota on every call, so it is not
// left open. The daily schedule passes this secret; nothing else can trigger it.
const SYNC_CRON_SECRET = (Deno.env.get("SYNC_CRON_SECRET") || "").trim();

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Banxico returns dd/mm/yyyy; Postgres wants yyyy-mm-dd.
function isoDateFromBanxico(value: unknown) {
  const text = String(value ?? "").trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Guard against values like 31/02/2026 that parse but roll over.
  return parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

// On holidays Banxico publishes the literal "N/E" (no existe) instead of a number.
function rateFromBanxico(value: unknown) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text.toUpperCase() === "N/E") return null;
  const rate = Number(text);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function extractObservations(payload: unknown) {
  const series = (payload as Record<string, any>)?.bmx?.series;
  if (!Array.isArray(series) || !series.length) {
    throw new Error("Banxico response did not contain a series.");
  }
  const datos = series[0]?.datos;
  if (!Array.isArray(datos) || !datos.length) {
    throw new Error("Banxico series did not contain any observations.");
  }
  return datos as Record<string, unknown>[];
}

async function fetchBanxicoFix() {
  if (!BANXICO_TOKEN) {
    throw new Error("BANXICO_API_TOKEN is not configured for this deployment.");
  }
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${encodeURIComponent(BANXICO_SERIES)}/datos/oportuno`;
  const response = await fetch(url, {
    headers: { "Bmx-Token": BANXICO_TOKEN, Accept: "application/json" }
  });
  if (!response.ok) {
    // Banxico answers 401 for a bad token and 404 for an unknown series; both are
    // configuration problems worth surfacing verbatim.
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Banxico request failed (${response.status}). ${detail}`);
  }
  return extractObservations(await response.json());
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });

  // Fail closed: an unset secret means the deployment is misconfigured, not that
  // the endpoint should be public.
  if (!SYNC_CRON_SECRET) {
    return jsonResponse({ error: "SYNC_CRON_SECRET is not configured for this deployment." }, 500);
  }
  if ((request.headers.get("x-cron-secret") || "").trim() !== SYNC_CRON_SECRET) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  try {
    const supabase = getClient();
    const observations = await fetchBanxicoFix();

    const rows = observations
      .map((observation) => ({
        rate_date: isoDateFromBanxico(observation.fecha),
        rate: rateFromBanxico(observation.dato)
      }))
      .filter((row): row is { rate_date: string; rate: number } => Boolean(row.rate_date && row.rate))
      .map((row) => ({
        source: SOURCE,
        currency_pair: CURRENCY_PAIR,
        rate_date: row.rate_date,
        rate: row.rate,
        source_note: `Banxico series ${BANXICO_SERIES} (FIX)`,
        updated_at: new Date().toISOString()
      }));

    if (!rows.length) {
      // A holiday with no published rate is normal, not a failure. The Bid Room
      // falls back to the most recent earlier rate on its own.
      return jsonResponse({
        stored: 0,
        currency_pair: CURRENCY_PAIR,
        message: "Banxico published no usable rate for this run (likely a non-business day)."
      });
    }

    const result = await supabase
      .from("rateware_fx_spot_rates")
      .upsert(rows, { onConflict: "source,rate_date,currency_pair" })
      .select("rate_date,rate");
    if (result.error) throw new Error(`FX spot rate write failed: ${result.error.message}`);

    const stored = result.data || [];
    return jsonResponse({
      stored: stored.length,
      currency_pair: CURRENCY_PAIR,
      source: SOURCE,
      latest: stored.slice().sort((a, b) => String(b.rate_date).localeCompare(String(a.rate_date)))[0] || null
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Banxico FX sync failed." },
      500
    );
  }
});
