import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MARKSMAN_LOADS_PROVIDER,
  MarksmanLoadsBidContractError,
  classifyBidCommandReplay,
  reconcileBidPayload,
  sanitizePrivateConnectorValue,
  type VerifiedMarksmanLoadsBidRequest,
  verifyMarksmanLoadsBidRequest,
} from "../_shared/marksman-loads-bid-contract.ts";
import { decryptRfxInvitationToken } from "../_shared/rfx-invitation-token.ts";

const SUPABASE_URL = String(Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const CONNECTOR_SECRET = String(Deno.env.get("MARKSMAN_LOADS_BID_CONNECTOR_SECRET") || "").trim();
const CONNECTOR_KEY_ID = String(Deno.env.get("MARKSMAN_LOADS_BID_CONNECTOR_KEY_ID") || "").trim();
const LIVE_ENABLED = String(Deno.env.get("MARKSMAN_LOADS_BID_CONNECTOR_ENABLED") || "").trim() === "true";
const CANARY_ENABLED = String(Deno.env.get("MARKSMAN_LOADS_BID_CONNECTOR_CANARY_ENABLED") || "").trim() === "true";
const INVITATION_ENCRYPTION_KEY = String(
  Deno.env.get("RFX_INVITATION_TOKEN_ENCRYPTION_KEY") ||
    Deno.env.get("RFX_RFI_LINK_ENCRYPTION_KEY") ||
    Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") ||
    "",
).trim();
const STALE_EXECUTION_MS = 2 * 60_000;

type RecordValue = Record<string, unknown>;

class ConnectorError extends Error {
  code: string;
  status: number;
  details: RecordValue;

  constructor(message: string, code = "RATEWARE_PRIVATE_CONNECTOR_ERROR", status = 400, details: RecordValue = {}) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConnectorError("Rateware service connection is not configured.", "CONNECTOR_NOT_CONFIGURED", 503);
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ConnectorClient = ReturnType<typeof getClient>;

function text(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function safeMessage(value: unknown, fallback = "Private Bid Room connector request failed.") {
  const message = value instanceof Error ? value.message : text(value);
  return (message || fallback).slice(0, 1000);
}

function response(payload: RecordValue, status = 200, requestId = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (requestId) headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(sanitizePrivateConnectorValue(payload)), { status, headers });
}

async function resolvePrivateContext(client: ConnectorClient, verified: VerifiedMarksmanLoadsBidRequest) {
  const body = verified.body;
  const link = await client
    .from("external_organization_links")
    .select("id,organization_id,status,reviewed_at,reviewed_by_user_id,review_note")
    .eq("provider", MARKSMAN_LOADS_PROVIDER)
    .eq("external_organization_id", body.organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (link.error) throw link.error;
  if (!link.data) {
    throw new ConnectorError("No active reviewed MARKSMAN Loads organization link exists.", "ORGANIZATION_LINK_NOT_FOUND", 403);
  }
  if (!link.data.reviewed_at || !text(link.data.reviewed_by_user_id) || !text(link.data.review_note)) {
    throw new ConnectorError("The MARKSMAN Loads organization link is not review-complete.", "ORGANIZATION_LINK_NOT_REVIEWED", 403);
  }

  const workspaces = await client
    .from("workspace_registry")
    .select("organization_id,organization_uuid")
    .eq("organization_uuid", link.data.organization_id)
    .limit(2);
  if (workspaces.error) throw workspaces.error;
  if (!workspaces.data || workspaces.data.length !== 1) {
    throw new ConnectorError(
      "The canonical organization does not resolve to exactly one Rateware workspace.",
      "WORKSPACE_LINK_AMBIGUOUS",
      409,
      { matches: workspaces.data?.length || 0 },
    );
  }
  const workspaceOrganizationId = text(workspaces.data[0].organization_id);

  const vendor = await client
    .from("vendors")
    .select("id,vendor_name,domain,status,organization_id")
    .eq("id", body.vendorId)
    .eq("organization_id", workspaceOrganizationId)
    .maybeSingle();
  if (vendor.error) throw vendor.error;
  if (!vendor.data) throw new ConnectorError("Carrier vendor is not linked to this Rateware workspace.", "VENDOR_LINK_MISMATCH", 403);

  const event = await client
    .from("rfx_events")
    .select("id,rfx_id,name,status,due_date,organization_id,owner_email")
    .eq("id", body.eventId)
    .eq("organization_id", workspaceOrganizationId)
    .maybeSingle();
  if (event.error) throw event.error;
  if (!event.data) throw new ConnectorError("RFx event is not linked to this Rateware workspace.", "EVENT_LINK_MISMATCH", 403);

  const lane = await client
    .from("rfx_lanes")
    .select("id,rfx_event_id,origin,destination,equipment")
    .eq("id", body.laneId)
    .eq("rfx_event_id", body.eventId)
    .maybeSingle();
  if (lane.error) throw lane.error;
  if (!lane.data) throw new ConnectorError("Lane does not belong to the signed RFx event.", "LANE_LINK_MISMATCH", 403);

  const invitation = await client
    .from("rfx_lane_vendors")
    .select(`
      id,rfx_event_id,rfx_lane_id,vendor_id,invitation_status,award_role,
      invitation_token,invitation_token_encrypted,bid_rate,bid_rate_staging_id,
      currency,weekly_capacity,transit_days,valid_through,commercial_model,
      marksman_margin_pct,carrier_share_pct,best_alternative_offered,
      alternative_equipment,alternative_units,alternative_notes,equipment_available,
      current_unit_location,deadhead_distance,deadhead_unit,unit_details,
      eta_pickup,eta_delivery,mirror_account_enabled,availability_validation_status,
      availability_validation_notes,notes,responded_at
    `)
    .eq("vendor_id", body.vendorId)
    .eq("rfx_lane_id", body.laneId)
    .eq("rfx_event_id", body.eventId)
    .maybeSingle();
  if (invitation.error) throw invitation.error;
  if (!invitation.data) {
    throw new ConnectorError("No private invitation matches the signed carrier, lane and event.", "PRIVATE_INVITATION_NOT_FOUND", 404);
  }

  return {
    canonicalOrganizationId: text(link.data.organization_id),
    workspaceOrganizationId,
    vendor: vendor.data as RecordValue,
    event: event.data as RecordValue,
    lane: lane.data as RecordValue,
    invitation: invitation.data as RecordValue,
  };
}

function safeResolution(context: Awaited<ReturnType<typeof resolvePrivateContext>>) {
  return {
    status: "matched",
    resolverRef: context.invitation.id,
    organizationId: context.canonicalOrganizationId,
    workspaceOrganizationId: context.workspaceOrganizationId,
    vendor: {
      id: context.vendor.id,
      name: context.vendor.vendor_name,
      domain: context.vendor.domain,
      status: context.vendor.status,
    },
    event: {
      id: context.event.id,
      rfxId: context.event.rfx_id,
      name: context.event.name,
      status: context.event.status,
      dueDate: context.event.due_date,
    },
    lane: {
      id: context.lane.id,
      origin: context.lane.origin,
      destination: context.lane.destination,
      equipment: context.lane.equipment,
    },
    invitationStatus: context.invitation.invitation_status,
    credentialExposure: false,
  };
}

async function readCurrentBid(client: ConnectorClient, invitationId: unknown) {
  const current = await client
    .from("rfx_lane_vendors")
    .select(`
      id,invitation_status,bid_rate,bid_rate_staging_id,bid_rate_staged_at,
      currency,weekly_capacity,transit_days,valid_through,commercial_model,
      marksman_margin_pct,carrier_share_pct,best_alternative_offered,
      alternative_equipment,alternative_units,alternative_notes,equipment_available,
      current_unit_location,deadhead_distance,deadhead_unit,unit_details,
      eta_pickup,eta_delivery,mirror_account_enabled,availability_validation_status,
      availability_validation_notes,notes,responded_at
    `)
    .eq("id", invitationId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new ConnectorError("Private invitation disappeared during reconciliation.", "RECONCILIATION_TARGET_NOT_FOUND", 409);
  return current.data as RecordValue;
}

async function reconcileCurrentBid(client: ConnectorClient, verified: VerifiedMarksmanLoadsBidRequest, invitationId: unknown) {
  const row = await readCurrentBid(client, invitationId);
  const payloadMatch = reconcileBidPayload(verified.body.payload, row);
  const staged = Boolean(text(row.bid_rate_staging_id));
  return {
    status: payloadMatch.matches && staged ? "reconciled" : "reconcile_required",
    payloadMatches: payloadMatch.matches,
    rateStagingObserved: staged,
    mismatches: payloadMatch.mismatches,
    row: sanitizePrivateConnectorValue(row),
    checkedAt: new Date().toISOString(),
  };
}

async function commandByRequest(client: ConnectorClient, requestId: string) {
  const result = await client
    .from("marksman_loads_bid_commands")
    .select("*")
    .eq("provider", MARKSMAN_LOADS_PROVIDER)
    .eq("request_id", requestId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as RecordValue | null;
}

async function commandByOperation(client: ConnectorClient, operationKey: string) {
  const result = await client
    .from("marksman_loads_bid_commands")
    .select("*")
    .eq("provider", MARKSMAN_LOADS_PROVIDER)
    .eq("operation_key", operationKey)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as RecordValue | null;
}

async function commandByPreparedReceipt(
  client: ConnectorClient,
  externalOrganizationId: string,
  preparedReceiptId: string,
) {
  const result = await client
    .from("marksman_loads_bid_commands")
    .select("*")
    .eq("provider", MARKSMAN_LOADS_PROVIDER)
    .eq("external_organization_id", externalOrganizationId)
    .eq("prepared_receipt_id", preparedReceiptId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as RecordValue | null;
}

async function createOrReadCommand(
  client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
) {
  const body = verified.body;
  const insert = await client
    .from("marksman_loads_bid_commands")
    .insert({
      provider: MARKSMAN_LOADS_PROVIDER,
      request_id: verified.requestId,
      request_fingerprint: verified.requestFingerprint,
      operation_key: verified.operationKey,
      external_organization_id: body.organizationId,
      organization_id: context.canonicalOrganizationId,
      workspace_organization_id: context.workspaceOrganizationId,
      vendor_id: body.vendorId,
      rfx_event_id: body.eventId,
      rfx_lane_id: body.laneId,
      rfx_lane_vendor_id: context.invitation.id,
      prepared_receipt_id: body.preparedReceiptId,
      quote_workspace_revision: body.quoteWorkspaceRevision,
      payload_fingerprint: body.payloadFingerprint,
      actor_id: body.humanConfirmation.actorId,
      actor_role: body.humanConfirmation.role,
      confirmed_at: body.humanConfirmation.confirmedAt,
      status: "received",
    })
    .select("*")
    .single();
  if (!insert.error) return { command: insert.data as RecordValue, inserted: true };
  if (String(insert.error.code || "") !== "23505") throw insert.error;
  const existing = await commandByRequest(client, verified.requestId) ||
    await commandByPreparedReceipt(client, body.organizationId, body.preparedReceiptId) ||
    await commandByOperation(client, verified.operationKey);
  if (!existing) throw insert.error;
  return { command: existing, inserted: false };
}

async function updateCommand(client: ConnectorClient, commandId: unknown, patch: RecordValue) {
  const result = await client
    .from("marksman_loads_bid_commands")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", commandId)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data as RecordValue;
}

function duplicateResponse(command: RecordValue, verified: VerifiedMarksmanLoadsBidRequest) {
  return {
    ...(object(command.result)),
    commandId: command.id,
    requestId: verified.requestId,
    originalRequestId: command.request_id,
    status: command.status,
    duplicate: true,
  };
}

async function handleExistingCommand(
  client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
  command: RecordValue,
) {
  const equivalentOperation = command.operation_key === verified.operationKey;
  const disposition = classifyBidCommandReplay(
    command,
    verified.requestFingerprint,
    Date.now(),
    STALE_EXECUTION_MS,
    equivalentOperation && command.request_id !== verified.requestId,
  );
  if (disposition === "idempotency_conflict") {
    throw new ConnectorError("requestId was already used with different signed content.", "IDEMPOTENCY_CONFLICT", 409);
  }
  if (disposition === "replay") return duplicateResponse(command, verified);
  if (disposition === "rejected") {
    throw new ConnectorError("This bid command was previously rejected.", text(command.error_code) || "COMMAND_REJECTED", 409);
  }
  if (disposition === "in_progress") {
    throw new ConnectorError("This bid command is already in progress.", "COMMAND_IN_PROGRESS", 409, { retryAfterSeconds: 120 });
  }
  if (disposition === "resume_before_mutation") {
    const claimed = await client
      .from("marksman_loads_bid_commands")
      .update({ status: "executing", execution_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", command.id)
      .eq("status", "received")
      .select("*")
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (claimed.data) return { resumeExecution: true, command: claimed.data as RecordValue };
    throw new ConnectorError("This bid command changed while being claimed.", "COMMAND_IN_PROGRESS", 409);
  }

  const reconciliation = await reconcileCurrentBid(client, verified, context.invitation.id);
  if (reconciliation.status === "reconciled") {
    const result = {
      commandId: command.id,
      requestId: verified.requestId,
      status: "reconciled",
      effect: "rateware_submit_bid",
      privateResolution: safeResolution(context),
      reconciliation,
      credentialExposure: false,
      externalExecution: true,
      ratewareSubmission: true,
      duplicate: true,
    };
    await updateCommand(client, command.id, {
      status: "reconciled",
      result,
      error_code: null,
      error_detail: null,
      external_execution: true,
      rateware_submission: true,
      reconciled_at: new Date().toISOString(),
    });
    return result;
  }
  await updateCommand(client, command.id, {
    status: "reconcile_required",
    result: { ...(object(command.result)), reconciliation },
    error_code: "RECONCILIATION_REQUIRED",
    error_detail: "Current Rateware state does not prove the signed bid payload was fully staged.",
  });
  throw new ConnectorError(
    "The previous execution is uncertain and requires reconciliation; it was not retried.",
    "RECONCILIATION_REQUIRED",
    409,
    { reconciliation },
  );
}

async function invitationCredential(invitation: RecordValue) {
  const legacy = text(invitation.invitation_token);
  if (legacy) return legacy;
  if (!INVITATION_ENCRYPTION_KEY) {
    throw new ConnectorError("Invitation credential decryption is not configured.", "CONNECTOR_NOT_CONFIGURED", 503);
  }
  const decrypted = await decryptRfxInvitationToken(invitation.invitation_token_encrypted, INVITATION_ENCRYPTION_KEY);
  if (!decrypted) throw new ConnectorError("Private invitation has no recoverable credential.", "PRIVATE_INVITATION_CREDENTIAL_MISSING", 409);
  return decrypted;
}

async function invokeCanonicalSubmit(verified: VerifiedMarksmanLoadsBidRequest, invitation: RecordValue) {
  const token = await invitationCredential(invitation);
  const canonicalResponse = await fetch(`${SUPABASE_URL}/functions/v1/rfx-bid-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "X-Request-Id": verified.requestId,
    },
    body: JSON.stringify({ ...verified.body.payload, action: "submit_bid", token }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await canonicalResponse.text();
  let parsed: RecordValue = {};
  try {
    parsed = object(raw ? JSON.parse(raw) : {});
  } catch {
    parsed = {};
  }
  if (!canonicalResponse.ok) {
    throw new ConnectorError(
      safeMessage(parsed.error, `Canonical Bid Room returned HTTP ${canonicalResponse.status}.`),
      "CANONICAL_SUBMIT_FAILED",
      502,
      { canonicalStatus: canonicalResponse.status },
    );
  }
  return sanitizePrivateConnectorValue(parsed) as RecordValue;
}

async function executeLive(
  client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
) {
  const claimed = await createOrReadCommand(client, verified, context);
  let command = claimed.command;
  if (!claimed.inserted) {
    const disposition = await handleExistingCommand(client, verified, context, command);
    if (!(object(disposition).resumeExecution)) return disposition;
    command = object(disposition).command as RecordValue;
  } else {
    command = await updateCommand(client, command.id, {
      status: "executing",
      execution_started_at: new Date().toISOString(),
    });
  }

  let canonicalResult: RecordValue;
  try {
    canonicalResult = await invokeCanonicalSubmit(verified, context.invitation);
  } catch (error) {
    const reconciliation = await reconcileCurrentBid(client, verified, context.invitation.id).catch(() => null);
    await updateCommand(client, command.id, {
      status: "reconcile_required",
      result: reconciliation ? { reconciliation } : null,
      error_code: error instanceof ConnectorError ? error.code : "CANONICAL_SUBMIT_UNCERTAIN",
      error_detail: safeMessage(error),
      external_execution: true,
      rateware_submission: false,
    });
    throw new ConnectorError(
      "Canonical submission did not return a provable completion; no automatic retry will occur.",
      "RECONCILIATION_REQUIRED",
      409,
      { reconciliation },
    );
  }

  await updateCommand(client, command.id, {
    status: "submitted",
    result: { canonicalResult },
    external_execution: true,
    rateware_submission: true,
  });
  const reconciliation = await reconcileCurrentBid(client, verified, context.invitation.id);
  const reconciled = reconciliation.status === "reconciled";
  const result = {
    commandId: command.id,
    requestId: verified.requestId,
    status: reconciliation.status,
    effect: "rateware_submit_bid",
    privateResolution: safeResolution(context),
    canonicalResult,
    reconciliation,
    authorizationEvidence: {
      algorithm: "HMAC-SHA256",
      keyId: verified.keyId,
      verified: true,
      requestExpiresAt: verified.expiresAt,
    },
    credentialExposure: false,
    externalExecution: true,
    ratewareSubmission: true,
    duplicate: false,
  };
  await updateCommand(client, command.id, {
    status: reconciliation.status,
    result,
    error_code: reconciled ? null : "RECONCILIATION_REQUIRED",
    error_detail: reconciled ? null : "Bid response returned but the staged Rateware state did not fully match.",
    external_execution: true,
    rateware_submission: true,
    reconciled_at: reconciled ? new Date().toISOString() : null,
  });
  if (!reconciled) {
    throw new ConnectorError("Bid returned but requires Rateware reconciliation.", "RECONCILIATION_REQUIRED", 409, { reconciliation });
  }
  return result;
}

async function executeCanary(
  _client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
) {
  return {
    requestId: verified.requestId,
    status: "resolution_canary_passed",
    effect: "read_only_private_resolution",
    privateResolution: safeResolution(context),
    authorizationEvidence: {
      algorithm: "HMAC-SHA256",
      keyId: verified.keyId,
      verified: true,
      requestExpiresAt: verified.expiresAt,
    },
    payloadFingerprint: verified.body.payloadFingerprint,
    credentialExposure: false,
    externalExecution: false,
    ratewareSubmission: false,
  };
}

async function handleCanaryRequest(
  client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
) {
  return response(await executeCanary(client, verified, context), 200, verified.requestId);
}

async function handleLiveRequest(
  client: ConnectorClient,
  verified: VerifiedMarksmanLoadsBidRequest,
  context: Awaited<ReturnType<typeof resolvePrivateContext>>,
) {
  return response(await executeLive(client, verified, context), 200, verified.requestId);
}

export async function createRfxInternalBidHandler(request: Request) {
  let requestId = "";
  try {
    if (request.method !== "POST") {
      return response({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 100_000) return response({ error: "Request body is too large.", code: "REQUEST_TOO_LARGE" }, 413);
    const envelope = await request.json();
    const verified = await verifyMarksmanLoadsBidRequest(envelope, {
      sharedSecret: CONNECTOR_SECRET,
      expectedKeyId: CONNECTOR_KEY_ID,
    });
    requestId = verified.requestId;

    const canaryRequest = verified.body.action.endsWith("_canary");
    if (!(canaryRequest ? CANARY_ENABLED : LIVE_ENABLED)) {
      throw new ConnectorError(
        canaryRequest ? "Private resolution canary is disabled." : "Live private bid execution is disabled.",
        canaryRequest ? "CANARY_EXECUTION_DISABLED" : "LIVE_EXECUTION_DISABLED",
        503,
      );
    }

    const client = getClient();
    const context = await resolvePrivateContext(client, verified);
    switch (verified.body.action) {
      case "resolve_and_submit_bid_canary":
        return handleCanaryRequest(client, verified, context);
      case "resolve_and_submit_bid":
        return handleLiveRequest(client, verified, context);
    }
  } catch (error) {
    if (error instanceof MarksmanLoadsBidContractError || error instanceof ConnectorError) {
      return response({ error: error.message, code: error.code, details: error instanceof ConnectorError ? error.details : {} }, error.status, requestId);
    }
    return response({ error: safeMessage(error), code: "RATEWARE_PRIVATE_CONNECTOR_ERROR" }, 500, requestId);
  }
}

Deno.serve(createRfxInternalBidHandler);
