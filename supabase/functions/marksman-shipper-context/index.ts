import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createShipperContextResolver, ShipperContextError } from "./context-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "";
const SHARED_SECRET = Deno.env.get("MARKSMAN_LOADS_SHIPPER_CONTEXT_SHARED_SECRET") || "";
const KEY_ID = Deno.env.get("MARKSMAN_LOADS_SHIPPER_CONTEXT_KEY_ID") || "";
const ENABLED = Deno.env.get("MARKSMAN_LOADS_SHIPPER_CONTEXT_ENABLED") === "true";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function client() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new ShipperContextError("Rateware data source is not configured", "SHIPPER_CONTEXT_NOT_CONFIGURED", 503);
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseStructuredPolicy(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    // Human-readable policy text is intentionally not interpreted as a number.
    return null;
  }
}

function structuredPolicy(row: Record<string, unknown> | null) {
  if (!row) return null;
  const candidates = [row.tonu_policy, row.cancellation_policy, row.raw_payload]
    .map(parseStructuredPolicy)
    .filter((value): value is Record<string, unknown> => Boolean(value));
  for (const candidate of candidates) {
    const nested = parseStructuredPolicy(candidate.cancellationPolicy || candidate.cancellation_policy || candidate);
    if (!nested) continue;
    const hours = nested.tonuWindowHours ?? nested.tonu_window_hours;
    const code = nested.tonuCode ?? nested.tonu_code;
    const suspension = nested.suspensionOnUnjustifiedCancel ?? nested.suspension_on_unjustified_cancel;
    if (hours !== undefined || code !== undefined || suspension !== undefined) {
      return {
        tonuWindowHours: hours,
        tonuCode: code,
        suspensionOnUnjustifiedCancel: suspension,
        sourceRef: `rfx_rfi_business_rules:${text(row.project_id)}`,
        observedAt: text(row.updated_at) || null,
      };
    }
  }
  return null;
}

const resolver = createShipperContextResolver({
  sharedSecret: SHARED_SECRET,
  keyId: KEY_ID,
  enabled: ENABLED,
  async findAgreement(input: { ratewareVendorId: string; offerId: string }) {
    const result = await client()
      .from("rfx_lane_vendors")
      .select(`id,rfx_event_id,rfx_lane_id,vendor_id,invitation_status,
        rfx_events!inner(id,customer_id,status,source_rfx_process_project_id),
        rfx_lanes!inner(id)`)
      .eq("id", input.offerId)
      .eq("vendor_id", input.ratewareVendorId)
      .limit(1)
      .maybeSingle();
    if (result.error) throw new ShipperContextError("Rateware agreement lookup failed", "SHIPPER_CRM_CONTEXT_SOURCE_ERROR", 502);
    if (!result.data) throw new ShipperContextError("Rateware offer was not found for this carrier", "SHIPPER_CRM_CONTEXT_UNAVAILABLE", 404);
    return result.data as Record<string, unknown>;
  },
  async findShipper(shipperId: string) {
    const result = await client()
      .from("shippers")
      .select("id,shipper_name,legal_name,domain,tms_system_id,status,metadata,updated_at")
      .eq("id", shipperId)
      .neq("status", "archived")
      .limit(1)
      .maybeSingle();
    if (result.error) throw new ShipperContextError("Shipper CRM lookup failed", "SHIPPER_CRM_CONTEXT_SOURCE_ERROR", 502);
    return (result.data || null) as Record<string, unknown> | null;
  },
  async findPolicy(input: { projectId: string | null }) {
    if (!input.projectId) return null;
    const result = await client()
      .from("rfx_rfi_business_rules")
      .select("project_id,tonu_policy,cancellation_policy,raw_payload,updated_at")
      .eq("project_id", input.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new ShipperContextError("Rateware policy lookup failed", "SHIPPER_CRM_CONTEXT_SOURCE_ERROR", 502);
    return structuredPolicy((result.data || null) as Record<string, unknown> | null);
  },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ShipperContextError("JSON request body is required", "INVALID_INTERNAL_REQUEST", 400);
    }
    return json(await resolver.resolve(body));
  } catch (error) {
    const known = error instanceof ShipperContextError;
    const status = known ? error.status : 500;
    return json({
      error: known ? error.message : "Shipper context resolver failed.",
      code: known ? error.code : "SHIPPER_CONTEXT_ERROR",
      details: known ? error.details : {},
    }, status);
  }
});
