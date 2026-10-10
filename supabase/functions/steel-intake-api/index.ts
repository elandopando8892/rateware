// steel-intake-api: The Steel Marketplace -> Rateware, server to server
// (contracts steel.freight-request.v1 and rateware.carrier-directory.v1).
// POST { action, ...payload } with Authorization: Bearer <STEEL_INTAKE_SECRET>;
// only the SHA-256 of the secret lives here (STEEL_INTAKE_SECRET_SHA256) and a
// missing digest rejects every call. No CORS: browsers are not callers.
// It publishes, reads and archives spot opportunities created by itself and
// lists active carriers without contact data. It never invites carriers: a
// Rateware operator chooses whom to invite in the Bid Room.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authorize,
  buildDirectoryResponse,
  buildPublishResponse,
  buildSpotRows,
  buildStatusResponse,
  DIRECTORY_CONTRACT,
  FREIGHT_CONTRACT,
  IntakeError,
  requestHash,
  rpcError,
  validateCancel,
  validateDirectoryQuery,
  validateEventId,
  validatePublish
} from "./logic.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const SECRET_SHA256 = Deno.env.get("STEEL_INTAKE_SECRET_SHA256") || "";
const OWNER_EMAIL = (Deno.env.get("STEEL_INTAKE_OWNER_EMAIL") || "").trim().toLowerCase();
const ORGANIZATION_ID = (Deno.env.get("STEEL_INTAKE_ORGANIZATION_ID") || "").trim();
// Logical caller name for logs (contract "Reglas comunes").
const CLIENT_ID = (Deno.env.get("STEEL_INTAKE_CLIENT_ID") || "steel-marketplace").trim();
const MAX_BODY_BYTES = 32 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const WORKSPACE_CACHE_MS = 5 * 60 * 1000;

type Row = Record<string, unknown>;
type Db = ReturnType<typeof getClient>;
type Workspace = { owner_email: string; owner_user_id: string; organization_id: string };

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new IntakeError(503, "intake_not_configured", "Rateware service role is not configured.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(body: unknown, status: number, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "X-Request-Id": requestId
    }
  });
}

function errorBody(error: IntakeError) {
  return { error: error.code, message: error.message };
}

let workspaceCache: { value: Workspace; expires: number } | null = null;

/**
 * Rateware rows are keyed by the workspace's canonical owner key
 * (workspace_registry.canonical_owner_key, e.g. "org:<id>"), not by a person's
 * email; STEEL_INTAKE_OWNER_EMAIL must be a known identity of that workspace.
 */
async function resolveWorkspace(db: Db): Promise<Workspace> {
  if (!OWNER_EMAIL || !ORGANIZATION_ID) {
    throw new IntakeError(503, "intake_not_configured", "STEEL_INTAKE_OWNER_EMAIL and STEEL_INTAKE_ORGANIZATION_ID are required.");
  }
  if (workspaceCache && workspaceCache.expires > Date.now()) return workspaceCache.value;
  const registry = await db
    .from("workspace_registry")
    .select("organization_id,canonical_owner_key,canonical_owner_user_id")
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (registry.error) throw registry.error;
  const alias = await db
    .from("workspace_identity_aliases")
    .select("identity_key")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("identity_key", OWNER_EMAIL)
    .maybeSingle();
  if (alias.error) throw alias.error;
  if (!registry.data?.canonical_owner_key || !alias.data) {
    throw new IntakeError(503, "intake_workspace_not_configured",
      "STEEL_INTAKE_ORGANIZATION_ID is not a Rateware workspace or STEEL_INTAKE_OWNER_EMAIL is not one of its identities.");
  }
  const value = {
    owner_email: String(registry.data.canonical_owner_key),
    owner_user_id: String(registry.data.canonical_owner_user_id || OWNER_EMAIL),
    organization_id: String(registry.data.organization_id)
  };
  workspaceCache = { value, expires: Date.now() + WORKSPACE_CACHE_MS };
  return value;
}

function throwRpc(error: unknown): never {
  throw rpcError(error) || error;
}

async function publishSpot(db: Db, body: Row) {
  const input = validatePublish(body);
  const hash = await requestHash(body);
  const workspace = await resolveWorkspace(db);
  const ids = { event_id: crypto.randomUUID(), lane_id: crypto.randomUUID(), receipt_id: crypto.randomUUID() };
  const rows = buildSpotRows(input, ids, workspace);
  const response = buildPublishResponse(ids, rows, new Date().toISOString());
  const result = await db.rpc("steel_intake_publish_spot", {
    p_idempotency_key: input.idempotency_key,
    p_request_hash: hash,
    p_owner_email: workspace.owner_email,
    p_owner_user_id: workspace.owner_user_id,
    p_organization_id: workspace.organization_id,
    p_actor_email: OWNER_EMAIL,
    p_event: rows.event,
    p_lane: rows.lane,
    p_external_system: input.external_ref.system,
    p_external_ref: input.external_ref,
    p_response: response
  });
  if (result.error) throwRpc(result.error);
  const receipt = result.data as Row;
  return { status: receipt.replayed ? 200 : 201, body: receipt };
}

async function cancelSpot(db: Db, body: Row) {
  const input = validateCancel(body);
  const hash = await requestHash(body);
  const workspace = await resolveWorkspace(db);
  const result = await db.rpc("steel_intake_cancel_spot", {
    p_idempotency_key: input.idempotency_key,
    p_request_hash: hash,
    p_owner_email: workspace.owner_email,
    p_owner_user_id: workspace.owner_user_id,
    p_organization_id: workspace.organization_id,
    p_actor_email: OWNER_EMAIL,
    p_rfx_event_id: input.rfx_event_id,
    p_reason: input.reason,
    p_receipt_id: crypto.randomUUID()
  });
  if (result.error) throwRpc(result.error);
  return { status: 200, body: result.data as Row };
}

async function spotStatus(db: Db, body: Row) {
  const eventId = validateEventId(body);
  const workspace = await resolveWorkspace(db);
  const marker = await db.from("steel_intake_events").select("rfx_event_id").eq("rfx_event_id", eventId).maybeSingle();
  if (marker.error) throw marker.error;
  if (!marker.data) throw new IntakeError(404, "spot_not_found", "No spot opportunity from steel-intake-api has this id.");
  const event = await db
    .from("rfx_events")
    .select("id,status")
    .eq("id", eventId)
    .eq("owner_email", workspace.owner_email)
    .maybeSingle();
  if (event.error) throw event.error;
  if (!event.data) throw new IntakeError(404, "spot_not_found", "No spot opportunity from steel-intake-api has this id.");
  const invitations = await db
    .from("rfx_lane_vendors")
    .select("id,vendor_id,invitation_status,bid_rate,currency,transit_days,weekly_capacity,responded_at,updated_at,award_role,awarded_at")
    .eq("rfx_event_id", eventId)
    .not("bid_rate", "is", null)
    .limit(1000);
  if (invitations.error) throw invitations.error;
  const vendorIds = [...new Set((invitations.data || []).map((row: Row) => String(row.vendor_id)))];
  const vendorsById = new Map<string, Row>();
  if (vendorIds.length) {
    const vendors = await db.from("vendors").select("id,vendor_name,name").in("id", vendorIds);
    if (vendors.error) throw vendors.error;
    for (const vendor of vendors.data || []) vendorsById.set(String(vendor.id), vendor);
  }
  return { status: 200, body: buildStatusResponse(event.data, invitations.data || [], vendorsById, new Date().toISOString()) };
}

async function carrierDirectory(db: Db, body: Row) {
  const query = validateDirectoryQuery(body);
  const workspace = await resolveWorkspace(db);
  let request = db
    .from("vendors")
    .select("id,vendor_name,name,domain,status,tags", { count: "exact" })
    .eq("owner_email", workspace.owner_email)
    .eq("status", "active")
    .neq("base_stage", "archived");
  if (query.search) {
    const pattern = `%${query.search}%`;
    request = request.or(
      ["vendor_name", "name", "legal_name", "domain"].map((column) => `${column}.ilike.${pattern}`).join(",")
    );
  }
  const result = await request
    .order("vendor_name", { ascending: true })
    .order("id", { ascending: true })
    .range(query.offset, query.offset + query.limit - 1);
  if (result.error) throw result.error;
  return { status: 200, body: buildDirectoryResponse(result.data || [], result.count ?? 0, query, new Date().toISOString()) };
}

async function readBody(request: Request): Promise<Row> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new IntakeError(413, "payload_too_large", `Body must be at most ${MAX_BODY_BYTES} bytes.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new IntakeError(400, "invalid_json", "Body must be a JSON object.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new IntakeError(400, "invalid_json", "Body must be a JSON object.");
  }
  return body as Row;
}

Deno.serve(async (request) => {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  const requestId = REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
  const started = Date.now();
  let action = "";
  let status = 500;
  try {
    if (request.method !== "POST") {
      status = 405;
      return json({ error: "method_not_allowed", message: "Use POST." }, status, requestId);
    }
    const auth = await authorize(request.headers.get("authorization"), SECRET_SHA256);
    if (!auth.ok) {
      status = auth.status ?? 401;
      const message = auth.code === "unauthorized" ? "Invalid service credential." : "steel-intake-api is not configured.";
      return json({ error: auth.code, message }, status, requestId);
    }
    const body = await readBody(request);
    action = typeof body.action === "string" ? body.action : "";
    let result: { status: number; body: unknown };
    if (body.action === "publish_spot_opportunity") {
      result = await publishSpot(getClient(), body);
    } else if (body.action === "get_spot_status") {
      result = await spotStatus(getClient(), body);
    } else if (body.action === "cancel_spot_opportunity") {
      result = await cancelSpot(getClient(), body);
    } else if (body.action === "list_carrier_directory") {
      result = await carrierDirectory(getClient(), body);
    } else {
      status = 400;
      return json({ error: "unknown_action", message: `Unsupported action. Contracts: ${FREIGHT_CONTRACT}, ${DIRECTORY_CONTRACT}.` }, status, requestId);
    }
    status = result.status;
    return json(result.body, status, requestId);
  } catch (error) {
    if (error instanceof IntakeError) {
      status = error.status;
      return json(errorBody(error), status, requestId);
    }
    status = 500;
    console.error("STEEL_INTAKE_ERROR", {
      request_id: requestId,
      client_id: CLIENT_ID,
      action,
      code: String((error as Row)?.code || "") || null
    });
    return json({ error: "internal_error", message: "Rateware could not complete the request." }, status, requestId);
  } finally {
    console.info("STEEL_INTAKE_REQUEST", {
      request_id: requestId,
      client_id: CLIENT_ID,
      action: action || null,
      status,
      duration_ms: Date.now() - started
    });
  }
});
