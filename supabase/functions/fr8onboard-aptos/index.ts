// Reads the Fr8Onboard "apto" (cleared to load) state per Rateware vendor.
// Read-only: connects to the Fr8Onboard Supabase with the fo_lector_rateware role, which can only
// see the fo_apto_por_vendor view. Rateware stays the vendor master; nothing is written here.
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";
import { requireRatewareUser } from "../_shared/auth.ts";
import { SUPABASE_ROOT_2021_CA } from "./supabase-root-2021-ca.ts";

const FR8ONBOARD_LECTOR_URL = (Deno.env.get("FR8ONBOARD_LECTOR_URL") || "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;

// Supabase's pooler certificate chains to its own root; verify against it instead of falling back to plaintext.
const SUPABASE_ROOT_CA = SUPABASE_ROOT_2021_CA;

function connectionOptions(url: string) {
  const parsed = new URL(url);
  return {
    hostname: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    tls: { enabled: true, enforce: true, caCertificates: [SUPABASE_ROOT_CA] }
  };
}

let pool: Pool | null = null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    await requireRatewareUser(request);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401, request);
  }

  const body = await request.json().catch(() => ({})) as { action?: string; vendor_ids?: unknown };
  if (body.action !== "list_aptos") return jsonResponse({ error: "Unknown action" }, 400, request);
  if (!FR8ONBOARD_LECTOR_URL) return jsonResponse({ configured: false, aptos: [] }, 200, request);

  const ids = (Array.isArray(body.vendor_ids) ? body.vendor_ids : [])
    .filter((id): id is string => typeof id === "string" && UUID.test(id))
    .slice(0, MAX_IDS);
  if (!ids.length) return jsonResponse({ configured: true, aptos: [] }, 200, request);

  pool ??= new Pool(connectionOptions(FR8ONBOARD_LECTOR_URL), 1, true);
  try {
    const client = await pool.connect();
    try {
      const result = await client.queryObject`
        select rateware_vendor_id, entidad_codigo, rol, estado, vigente_hasta, motivos, actualizado_en
        from fo_apto_por_vendor
        where rateware_vendor_id = any(${ids})`;
      return jsonResponse({ configured: true, aptos: result.rows }, 200, request);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("fr8onboard-aptos", (error as Error).message);
    return jsonResponse({ error: "Fr8Onboard is unavailable" }, 502, request);
  }
});
