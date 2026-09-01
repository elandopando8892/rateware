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

function normalizeLedgerRecord(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    requestId: row.request_id,
    requestHash: row.request_hash,
    action: row.action,
    issuer: row.issuer,
    keyId: row.key_id,
    organizationId: row.organization_id,
    vendorId: row.vendor_id,
    laneId: row.rfx_lane_id,
    eventId: row.rfx_event_id,
    payloadFingerprint: row.payload_fingerprint,
    evidenceFingerprint: row.evidence_fingerprint,
    handoffFingerprint: row.handoff_fingerprint,
    status: row.status,
    resolverRef: row.resolver_ref,
    invitationStatus: row.invitation_status,
    evidenceClass: row.evidence_class,
    errorCode: row.error_code,
    claimedAt: row.claimed_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  };
}

const requestLedger = {
  async claim(input: Record<string, string>) {
    const result = await getClient().rpc("claim_rfx_private_resolver_request", {
      p_request_id: input.requestId,
      p_request_hash: input.requestHash,
      p_action: input.action,
      p_issuer: input.issuer,
      p_key_id: input.keyId,
      p_organization_id: input.organizationId,
      p_vendor_id: input.vendorId,
      p_rfx_lane_id: input.laneId,
      p_rfx_event_id: input.eventId,
      p_payload_fingerprint: input.payloadFingerprint,
      p_evidence_fingerprint: input.evidenceFingerprint,
      p_handoff_fingerprint: input.handoffFingerprint,
      p_claimed_at: input.claimedAt,
      p_expires_at: input.expiresAt,
    });
    if (result.error) throw new PrivateResolverError("Rateware request ledger claim failed", "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE", 503);
    const data = result.data as { claimed?: boolean; mismatch?: boolean; record?: Record<string, unknown> } | null;
    return { claimed: data?.claimed === true, mismatch: data?.mismatch === true, record: normalizeLedgerRecord(data?.record || null) };
  },
  async complete(input: Record<string, string>) {
    const result = await getClient().rpc("complete_rfx_private_resolver_request", {
      p_request_id: input.requestId,
      p_request_hash: input.requestHash,
      p_resolver_ref: input.resolverRef,
      p_invitation_status: input.invitationStatus,
      p_evidence_class: input.evidenceClass,
      p_completed_at: input.completedAt,
    });
    if (result.error) throw new PrivateResolverError("Rateware request ledger completion failed", "REQUEST_LEDGER_STATE_CONFLICT", 409);
    return normalizeLedgerRecord(result.data as Record<string, unknown>);
  },
  async fail(input: Record<string, string>) {
    const result = await getClient().rpc("fail_rfx_private_resolver_request", {
      p_request_id: input.requestId,
      p_request_hash: input.requestHash,
      p_error_code: input.errorCode,
      p_completed_at: input.completedAt,
    });
    if (result.error) throw new PrivateResolverError("Rateware request ledger failure could not be recorded", "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE", 503);
    return normalizeLedgerRecord(result.data as Record<string, unknown> | null);
  },
};

const resolver = createPrivateResolver({
  sharedSecret: SHARED_SECRET,
  keyId: KEY_ID,
  canaryEnabled: CANARY_ENABLED,
  requestLedger,
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
