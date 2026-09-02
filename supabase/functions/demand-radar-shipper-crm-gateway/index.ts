import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from "../_shared/kinde.ts";
import { resolveWorkspaceUser, workspaceUserContext } from "../_shared/workspace.ts";
import {
  DEMAND_RADAR_COMMIT_PHRASE,
  normalizeDemandRadarShipperPatch,
  safeDemandRadarShipperProjection,
  demandRadarGatewayCursor,
  stableGatewayPayload,
} from "../_shared/demand-radar-shipper-crm-contract.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const DEMAND_RADAR_WRITES_ENABLED = /^(1|true|yes|on)$/i.test(
  String(Deno.env.get("DEMAND_RADAR_SHIPPER_CRM_WRITES_ENABLED") || "").trim(),
);
const MAX_PAGE_SIZE = 250;

function clean(value: unknown, max = 500) {
  if (value === null || value === undefined) return null;
  const output = String(value).trim();
  return output ? output.slice(0, max) : null;
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message || "Demand Radar gateway request failed.";
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return clean(row.message || row.error || row.details || row.hint) || "Demand Radar gateway request failed.";
  }
  return "Demand Radar gateway request failed.";
}

function statusForError(value: unknown) {
  const message = errorMessage(value).toLowerCase();
  if (/bearer|jwt|token|auth|unauthorized|sign in|kinde/.test(message)) return 401;
  if (/revision_conflict|idempotency_key_reused/.test(message)) return 409;
  if (/required|invalid|not_allowed|unknown action/.test(message)) return 422;
  return 500;
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Rateware Supabase configuration.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableGatewayPayload(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "POST is required." }, 405);

  try {
    const supabase = getClient();
    const identity = await requireKindeUser(request);
    const user = await resolveWorkspaceUser(
      supabase,
      workspaceUserContext(identity as Record<string, unknown>),
      { persistIdentity: false },
    );
    const body = await request.json() as Record<string, unknown>;

    if (body.action === "health") {
      return jsonResponse({
        ok: true,
        gateway: "demand-radar-shipper-crm-gateway",
        authority: "rateware",
        capabilities: { pull: true, commit: DEMAND_RADAR_WRITES_ENABLED, cas: true, idempotency: true, canonical_receipt: true },
        production_write_executed: false,
      });
    }

    if (body.action === "pull_accounts") {
      const offset = demandRadarGatewayCursor(body.cursor);
      const limit = Math.min(Math.max(Number(body.limit) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const result = await supabase.from("shippers")
        .select("id,shipper_name,legal_name,domain,industry,status,relationship_stage,account_owner_email,primary_contact_name,headquarters_city,headquarters_state,headquarters_country,source,external_source,external_source_id,created_at,updated_at", { count: "exact" })
        .eq("owner_email", user.owner_email)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (result.error) throw result.error;
      const rows = (result.data || []).map(safeDemandRadarShipperProjection);
      const total = Number(result.count || rows.length);
      const nextOffset = offset + rows.length;
      return jsonResponse({
        rows,
        total,
        cursor: nextOffset < total ? String(nextOffset) : "",
        source_revision: rows[0]?.sourceRevision || null,
        read_at: new Date().toISOString(),
        contact_channels_returned: 0,
        external_writes: 0,
      });
    }

    if (body.action === "commit_change") {
      if (!DEMAND_RADAR_WRITES_ENABLED) {
        return jsonResponse({ error: "Demand Radar writes are disabled at the Rateware gateway.", code: "DEMAND_RADAR_WRITES_DISABLED" }, 403);
      }
      if (body.confirmed !== true || clean(body.confirmation_phrase, 80) !== DEMAND_RADAR_COMMIT_PHRASE) {
        return jsonResponse({ error: "Exact human write confirmation is required.", code: "EXACT_WRITE_CONFIRMATION_REQUIRED" }, 422);
      }
      const idempotencyKey = clean(body.idempotency_key, 240);
      const demandRadarAccountId = clean(body.demand_radar_account_id, 180);
      const operation = clean(body.operation, 40);
      if (!idempotencyKey || !demandRadarAccountId || !["create_shipper", "update_shipper"].includes(operation || "")) {
        return jsonResponse({ error: "A valid operation, account id, and idempotency key are required.", code: "INVALID_CHANGE_IDENTITY" }, 422);
      }
      const normalized = normalizeDemandRadarShipperPatch(body.patch);
      if (normalized.issues.length) return jsonResponse({ error: "The patch violates the Demand Radar gateway contract.", code: "PATCH_REJECTED", issues: normalized.issues }, 422);
      if (operation === "create_shipper" && !normalized.patch.shipper_name) {
        return jsonResponse({ error: "Shipper name is required for a canonical create.", code: "SHIPPER_NAME_REQUIRED" }, 422);
      }
      const requestHash = await sha256({ operation, demandRadarAccountId, shipperId: clean(body.shipper_id, 80), expectedRevision: clean(body.expected_revision, 80), patch: normalized.patch });
      const rpc = await supabase.rpc("apply_demand_radar_shipper_crm_change", {
        p_owner_email: user.owner_email,
        p_owner_user_id: user.owner_user_id,
        p_organization_id: user.organization_id,
        p_actor_email: clean((identity as Record<string, unknown>).email || user.owner_email, 240),
        p_idempotency_key: idempotencyKey,
        p_demand_radar_account_id: demandRadarAccountId,
        p_shipper_id: operation === "update_shipper" ? clean(body.shipper_id, 80) : null,
        p_expected_revision: operation === "update_shipper" ? clean(body.expected_revision, 80) : null,
        p_request_hash: requestHash,
        p_patch: normalized.patch,
      });
      if (rpc.error) throw rpc.error;
      const receipt = rpc.data as Record<string, unknown>;
      if (receipt?.state === "conflict") return jsonResponse({ error: "Rateware changed after review.", code: "RATEWARE_REVISION_CONFLICT", receipt }, 409);
      if (receipt?.state !== "accepted" || receipt?.accepted !== true) {
        return jsonResponse({ error: "Rateware did not return an accepted canonical receipt.", code: "CANONICAL_RECEIPT_REQUIRED", receipt }, 502);
      }
      return jsonResponse({ receipt });
    }

    return jsonResponse({ error: "Unknown Demand Radar Shipper CRM gateway action." }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, statusForError(error));
  }
});
