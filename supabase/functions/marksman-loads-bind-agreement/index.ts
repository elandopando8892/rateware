import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AgreementBindingError,
  createAgreementBindingService,
} from "./binding-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "";
const SHARED_SECRET = Deno.env.get("MARKSMAN_LOADS_AGREEMENT_BIND_SHARED_SECRET") || "";
const KEY_ID = Deno.env.get("MARKSMAN_LOADS_AGREEMENT_BIND_KEY_ID") || "";
const ENABLED = Deno.env.get("MARKSMAN_LOADS_AGREEMENT_BIND_ENABLED") === "true";
const BINDING_TABLE = "marksman_loads_rateware_agreement_bindings";
const BINDING_SELECT = "id,created_at,updated_at,carrier_organization_id,rateware_vendor_id,rfx_event_id,rfx_lane_vendor_id,marksman_post_id,marksman_offer_id,status,bound_at,revoked_at,metadata";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceError(message: string, result: { error?: { message?: string; code?: string } | null }) {
  if (!result.error) return;
  if (String(result.error.code || "") === "42P01") {
    throw new AgreementBindingError("agreement binding table is not available in this environment", "AGREEMENT_BINDING_NOT_MIGRATED", 503);
  }
  throw new AgreementBindingError(message, "AGREEMENT_BINDING_SOURCE_ERROR", 502);
}

function client() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new AgreementBindingError("Rateware data source is not configured", "AGREEMENT_BINDING_NOT_CONFIGURED", 503);
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const service = createAgreementBindingService({
  sharedSecret: SHARED_SECRET,
  keyId: KEY_ID,
  enabled: ENABLED,
  async findAgreement(input: Record<string, unknown>) {
    const ratewareVendorId = text(input.ratewareVendorId);
    const rfxEventId = text(input.rfxEventId);
    const rfxLaneVendorId = text(input.rfxLaneVendorId);
    const result = await client()
      .from("rfx_lane_vendors")
      .select(`id,rfx_event_id,rfx_lane_id,vendor_id,invitation_status,award_role,bid_rate,currency,awarded_at,updated_at,
        rfx_events!inner(id,customer_id,status),
        rfx_lanes!inner(id)`)
      .eq("id", rfxLaneVendorId)
      .eq("rfx_event_id", rfxEventId)
      .eq("vendor_id", ratewareVendorId)
      .limit(1)
      .maybeSingle();
    sourceError("Rateware invitation lookup failed", result);
    if (!result.data) throw new AgreementBindingError("the exact Rateware invitation was not found", "AGREEMENT_NOT_FOUND", 404);
    return result.data as Record<string, unknown>;
  },
  async findExistingByLocal(input: Record<string, unknown>) {
    const carrierOrganizationId = text(input.carrierOrganizationId);
    const marksmanPostId = text(input.marksmanPostId);
    const marksmanOfferId = text(input.marksmanOfferId);
    const result = await client()
      .from(BINDING_TABLE)
      .select(BINDING_SELECT)
      .eq("carrier_organization_id", carrierOrganizationId)
      .eq("marksman_post_id", marksmanPostId)
      .eq("marksman_offer_id", marksmanOfferId)
      .limit(1)
      .maybeSingle();
    sourceError("agreement bridge lookup failed", result);
    return (result.data || null) as Record<string, unknown> | null;
  },
  async findExistingByRateware(input: Record<string, unknown>) {
    const carrierOrganizationId = text(input.carrierOrganizationId);
    const rfxLaneVendorId = text(input.rfxLaneVendorId);
    const result = await client()
      .from(BINDING_TABLE)
      .select(BINDING_SELECT)
      .eq("carrier_organization_id", carrierOrganizationId)
      .eq("rfx_lane_vendor_id", rfxLaneVendorId)
      .limit(1)
      .maybeSingle();
    sourceError("Rateware invitation bridge lookup failed", result);
    return (result.data || null) as Record<string, unknown> | null;
  },
  async findExistingByCommand(input: Record<string, unknown>) {
    const carrierOrganizationId = text(input.carrierOrganizationId);
    const idempotencyKey = text(input.idempotencyKey);
    const result = await client()
      .from(BINDING_TABLE)
      .select(BINDING_SELECT)
      .eq("carrier_organization_id", carrierOrganizationId)
      .eq("metadata->>idempotencyKey", idempotencyKey)
      .limit(1)
      .maybeSingle();
    sourceError("agreement command receipt lookup failed", result);
    return (result.data || null) as Record<string, unknown> | null;
  },
  async insertBinding(input: Record<string, unknown>) {
    const result = await client()
      .from(BINDING_TABLE)
      .insert(input)
      .select(BINDING_SELECT)
      .single();
    sourceError("agreement bridge insert failed", result);
    if (!result.data) throw new AgreementBindingError("agreement bridge insert returned no record", "AGREEMENT_BINDING_SOURCE_ERROR", 502);
    return result.data as Record<string, unknown>;
  },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AgreementBindingError("JSON request body is required", "INVALID_INTERNAL_REQUEST", 400);
    }
    return json(await service.bind(record(body)));
  } catch (error) {
    const known = error instanceof AgreementBindingError;
    const status = known ? error.status : 500;
    return json({
      error: known ? error.message : "Agreement binding command failed.",
      code: known ? error.code : "AGREEMENT_BINDING_ERROR",
      details: known ? error.details : {},
    }, status);
  }
});
