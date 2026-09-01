import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PrivateResolverError, createPrivateResolver } from "./resolver-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "";
const SHARED_SECRET = Deno.env.get("RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET") || "";
const KEY_ID = Deno.env.get("RATEWARE_PRIVATE_RESOLVER_KEY_ID") || "";
const CANARY_ENABLED = Deno.env.get("RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED") === "true";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new PrivateResolverError("Rateware data source is not configured", "PRIVATE_RESOLVER_NOT_CONFIGURED", 503);
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const resolver = createPrivateResolver({
  sharedSecret: SHARED_SECRET,
  keyId: KEY_ID,
  canaryEnabled: CANARY_ENABLED,
  async findInvitations({ vendorId, laneId, eventId, limit }: { vendorId: string; laneId: string; eventId: string; limit: number }) {
    const result = await getClient()
      .from("rfx_lane_vendors")
      .select("id,rfx_event_id,rfx_lane_id,vendor_id,invitation_status,rfx_events!inner(id,status,due_date)")
      .eq("vendor_id", vendorId)
      .eq("rfx_lane_id", laneId)
      .eq("rfx_event_id", eventId)
      .limit(limit);
    if (result.error) throw new PrivateResolverError("Rateware private invitation lookup failed", "PRIVATE_RESOLVER_SOURCE_ERROR", 502);
    return result.data || [];
  },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    return json(await resolver.resolve(await request.json()));
  } catch (error) {
    const known = error instanceof PrivateResolverError;
    return json({
      error: known ? error.message : "Private resolver failed.",
      code: known ? error.code : "PRIVATE_RESOLVER_ERROR",
      details: known ? error.details : {},
    }, known ? error.status : 500);
  }
});
