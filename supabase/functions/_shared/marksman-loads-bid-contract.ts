export const RATEWARE_INTERNAL_REQUEST_VERSION = "rateware-internal-request.v1";
export const MARKSMAN_LOADS_PROVIDER = "marksman_loads";
export const MAX_INTERNAL_REQUEST_TTL_MS = 5 * 60_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ALLOWED_ACTIONS = new Set(["resolve_and_submit_bid_canary", "resolve_and_submit_bid"]);
const MUTATING_ROLES = new Set(["ADMIN", "OPERATOR"]);
const ALLOWED_PAYLOAD_KEYS = new Set([
  "action", "bid_rate", "currency", "weekly_capacity", "transit_days",
  "valid_through", "commercial_model", "marksman_margin_pct", "carrier_share_pct",
  "best_final", "best_alternative_offered", "alternative_equipment",
  "alternative_units", "alternative_notes", "equipment_available",
  "current_unit_location", "deadhead_distance", "deadhead_unit", "unit_details",
  "eta_pickup", "eta_delivery", "mirror_account_enabled",
  "availability_validation_status", "availability_validation_notes", "notes", "language",
]);

export class MarksmanLoadsBidContractError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "INVALID_INTERNAL_AUTHORIZATION", status = 400) {
    super(message);
    this.name = "MarksmanLoadsBidContractError";
    this.code = code;
    this.status = status;
  }
}

function text(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!SHA256_PATTERN.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array | null, right: Uint8Array) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function payloadFingerprint(payload: unknown) {
  return sha256Hex(stableStringify(payload));
}

function unsignedEnvelope(envelope: Record<string, unknown>) {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

async function expectedSignature(envelope: Record<string, unknown>, sharedSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sharedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(stableStringify(unsignedEnvelope(envelope))),
  );
  return new Uint8Array(signature);
}

function requiredUuid(value: unknown, field: string) {
  const normalized = text(value).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new MarksmanLoadsBidContractError(`${field} must be a UUID.`, "INVALID_INTERNAL_REQUEST");
  }
  return normalized;
}

function requiredText(value: unknown, field: string, maximum = 191) {
  const normalized = text(value);
  if (!normalized || normalized.length > maximum) {
    throw new MarksmanLoadsBidContractError(`${field} is invalid.`, "INVALID_INTERNAL_REQUEST");
  }
  return normalized;
}

export type MarksmanLoadsBidBody = {
  action: "resolve_and_submit_bid_canary" | "resolve_and_submit_bid";
  organizationId: string;
  vendorId: string;
  laneId: string;
  eventId: string;
  invitationId?: string;
  operationId?: string;
  preparedReceiptId: string;
  quoteWorkspaceRevision: number;
  payloadFingerprint: string;
  payload: Record<string, unknown>;
  humanConfirmation: { actorId: string; role: "ADMIN" | "OPERATOR"; confirmedAt: string };
};

export type VerifiedMarksmanLoadsBidRequest = {
  requestId: string;
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  body: MarksmanLoadsBidBody;
  requestFingerprint: string;
  operationKey: string;
};

export async function verifyMarksmanLoadsBidRequest(
  envelopeValue: unknown,
  options: { sharedSecret: string; expectedKeyId: string; now?: Date },
): Promise<VerifiedMarksmanLoadsBidRequest> {
  const envelope = object(envelopeValue);
  const sharedSecret = text(options.sharedSecret);
  if (sharedSecret.length < 32) {
    throw new MarksmanLoadsBidContractError("Internal connector secret is not configured.", "CONNECTOR_NOT_CONFIGURED", 503);
  }
  if (
    envelope.contractVersion !== RATEWARE_INTERNAL_REQUEST_VERSION ||
    envelope.issuer !== "marksman-loads" ||
    envelope.audience !== "rateware"
  ) {
    throw new MarksmanLoadsBidContractError("Internal request routing is invalid.");
  }
  const keyId = requiredText(envelope.keyId, "keyId", 96);
  if (keyId !== text(options.expectedKeyId)) {
    throw new MarksmanLoadsBidContractError("Internal authorization key is not accepted.", "INVALID_INTERNAL_KEY", 401);
  }
  const suppliedSignature = hexToBytes(text(envelope.signature).toLowerCase());
  const expected = await expectedSignature(envelope, sharedSecret);
  if (!constantTimeEqual(suppliedSignature, expected)) {
    throw new MarksmanLoadsBidContractError("Internal request signature is invalid.", "INVALID_INTERNAL_SIGNATURE", 401);
  }

  const now = options.now || new Date();
  const current = now.getTime();
  const issued = Date.parse(text(envelope.issuedAt));
  const expires = Date.parse(text(envelope.expiresAt));
  if (
    !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued ||
    expires - issued > MAX_INTERNAL_REQUEST_TTL_MS || issued > current + 30_000
  ) {
    throw new MarksmanLoadsBidContractError("Internal request timestamps are invalid.", "INVALID_INTERNAL_TIMESTAMP", 401);
  }
  if (expires < current) {
    throw new MarksmanLoadsBidContractError("Internal authorization has expired.", "INTERNAL_AUTHORIZATION_EXPIRED", 401);
  }

  const bodyValue = object(envelope.body);
  const action = text(bodyValue.action);
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new MarksmanLoadsBidContractError("Internal bid action is not supported.", "INVALID_INTERNAL_ACTION");
  }
  const organizationId = requiredText(bodyValue.organizationId, "organizationId", 191).toLowerCase();
  if (organizationId !== text(bodyValue.organizationId)) {
    throw new MarksmanLoadsBidContractError("organizationId must be normalized lowercase.", "INVALID_INTERNAL_REQUEST");
  }
  const payload = object(bodyValue.payload);
  if (payload.action !== "submit_bid") {
    throw new MarksmanLoadsBidContractError("Payload must use Rateware submit_bid.", "INVALID_INTERNAL_PAYLOAD");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "token")) {
    throw new MarksmanLoadsBidContractError("Invitation credentials must not cross the connector boundary.", "CREDENTIAL_EXPOSURE_BLOCKED");
  }
  const unknownPayloadKeys = Object.keys(payload).filter((key) => !ALLOWED_PAYLOAD_KEYS.has(key));
  if (unknownPayloadKeys.length) {
    throw new MarksmanLoadsBidContractError(
      `Payload contains unsupported fields: ${unknownPayloadKeys.join(", ")}.`,
      "INVALID_INTERNAL_PAYLOAD",
    );
  }
  const fingerprint = text(bodyValue.payloadFingerprint).toLowerCase();
  if (!SHA256_PATTERN.test(fingerprint) || await payloadFingerprint(payload) !== fingerprint) {
    throw new MarksmanLoadsBidContractError("Payload fingerprint does not match the signed payload.", "PAYLOAD_FINGERPRINT_MISMATCH");
  }
  const revision = Number(bodyValue.quoteWorkspaceRevision);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new MarksmanLoadsBidContractError("quoteWorkspaceRevision must be a non-negative integer.", "INVALID_INTERNAL_REQUEST");
  }
  const confirmation = object(bodyValue.humanConfirmation);
  const role = text(confirmation.role).toUpperCase();
  const confirmedAt = text(confirmation.confirmedAt);
  const confirmedTime = Date.parse(confirmedAt);
  if (!MUTATING_ROLES.has(role)) {
    throw new MarksmanLoadsBidContractError("Authorized ADMIN or OPERATOR confirmation is required.", "HUMAN_CONFIRMATION_REQUIRED", 403);
  }
  if (!Number.isFinite(confirmedTime) || confirmedTime > current + 30_000 || confirmedTime < current - MAX_INTERNAL_REQUEST_TTL_MS) {
    throw new MarksmanLoadsBidContractError("Human confirmation timestamp is invalid.", "HUMAN_CONFIRMATION_REQUIRED", 403);
  }

  const vendorId = requiredUuid(bodyValue.vendorId, "vendorId");
  const laneId = requiredUuid(bodyValue.laneId, "laneId");
  const eventId = requiredUuid(bodyValue.eventId, "eventId");
  const preparedReceiptId = requiredText(bodyValue.preparedReceiptId, "preparedReceiptId");
  const live = action === "resolve_and_submit_bid";
  const invitationId = live ? requiredUuid(bodyValue.invitationId, "invitationId") : undefined;
  const suppliedOperationId = live ? text(bodyValue.operationId).toLowerCase() : "";
  if (live && !SHA256_PATTERN.test(suppliedOperationId)) {
    throw new MarksmanLoadsBidContractError("operationId must be SHA-256 for a live quote.", "INVALID_INTERNAL_OPERATION");
  }
  if (!live && (bodyValue.invitationId != null || bodyValue.operationId != null)) {
    throw new MarksmanLoadsBidContractError("Canary requests cannot carry live invitation or operation authority.", "INVALID_INTERNAL_OPERATION");
  }
  const expectedLiveOperationId = live
    ? await sha256Hex(stableStringify({
      effect: "quote",
      organizationId,
      vendorId,
      eventId,
      laneId,
      invitationId,
      preparedReceiptId,
      payloadFingerprint: fingerprint,
    }))
    : "";
  if (live && suppliedOperationId !== expectedLiveOperationId) {
    throw new MarksmanLoadsBidContractError("operationId does not match the signed quote scope and content.", "OPERATION_ID_MISMATCH");
  }

  const body: MarksmanLoadsBidBody = {
    action: action as MarksmanLoadsBidBody["action"],
    organizationId,
    vendorId,
    laneId,
    eventId,
    ...(live ? { invitationId, operationId: suppliedOperationId } : {}),
    preparedReceiptId,
    quoteWorkspaceRevision: revision,
    payloadFingerprint: fingerprint,
    payload,
    humanConfirmation: {
      actorId: requiredText(confirmation.actorId, "humanConfirmation.actorId"),
      role: role as "ADMIN" | "OPERATOR",
      confirmedAt,
    },
  };
  const requestId = requiredUuid(envelope.requestId, "requestId");
  const operationKey = live ? suppliedOperationId : await sha256Hex(stableStringify({
    provider: MARKSMAN_LOADS_PROVIDER,
    action: body.action,
    organizationId: body.organizationId,
    vendorId: body.vendorId,
    laneId: body.laneId,
    eventId: body.eventId,
    preparedReceiptId: body.preparedReceiptId,
    quoteWorkspaceRevision: body.quoteWorkspaceRevision,
    payloadFingerprint: body.payloadFingerprint,
  }));
  return {
    requestId,
    keyId,
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    body,
    requestFingerprint: await sha256Hex(stableStringify(unsignedEnvelope(envelope))),
    operationKey,
  };
}

const SECRET_KEY_PATTERN = /(token|signature|secret|authorization|service.?role|api.?key)/i;

export function sanitizePrivateConnectorValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePrivateConnectorValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key === "authorizationEvidence" || !SECRET_KEY_PATTERN.test(key))
      .map(([key, nested]) => [key, sanitizePrivateConnectorValue(nested)]),
  );
}

function comparable(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

const RECONCILIATION_FIELDS = [
  "bid_rate", "currency", "weekly_capacity", "transit_days", "valid_through",
  "commercial_model", "marksman_margin_pct", "carrier_share_pct",
  "best_alternative_offered", "alternative_equipment", "alternative_units",
  "alternative_notes", "equipment_available", "current_unit_location",
  "deadhead_distance", "deadhead_unit", "unit_details", "eta_pickup",
  "eta_delivery", "mirror_account_enabled", "availability_validation_status",
  "availability_validation_notes", "notes",
] as const;

export function reconcileBidPayload(payload: Record<string, unknown>, row: Record<string, unknown>) {
  const mismatches: Array<{ field: string; expected: unknown; observed: unknown }> = [];
  for (const field of RECONCILIATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const expected = comparable(payload[field]);
    const observed = comparable(row[field]);
    if (typeof expected === "number" && typeof observed === "number") {
      if (Math.abs(expected - observed) > 0.000001) mismatches.push({ field, expected, observed });
    } else if (expected !== observed) {
      mismatches.push({ field, expected, observed });
    }
  }
  return { matches: mismatches.length === 0, mismatches };
}

export type BidCommandReplayDisposition =
  | "idempotency_conflict"
  | "replay"
  | "rejected"
  | "in_progress"
  | "resume_before_mutation"
  | "reconcile_only";

export function canBindBidCommandReadback(command: Record<string, unknown>) {
  const result = command.result && typeof command.result === "object" && !Array.isArray(command.result)
    ? command.result as Record<string, unknown>
    : {};
  return command.status === "submitted" && command.external_execution === true && command.rateware_submission === true &&
    Object.prototype.hasOwnProperty.call(result, "canonicalResult");
}

export function buildQuoteOperationReceiptRow(input: {
  verified: VerifiedMarksmanLoadsBidRequest;
  context: Record<string, unknown>;
  command: Record<string, unknown>;
  reconciliation: Record<string, unknown>;
  committedAt: string;
}) {
  const { verified, context, command, reconciliation, committedAt } = input;
  const row = object(reconciliation.row);
  const stagingId = text(row.bid_rate_staging_id);
  if (!canBindBidCommandReadback(command) || reconciliation.status !== "reconciled" || reconciliation.payloadMatches !== true || reconciliation.rateStagingObserved !== true || !stagingId) {
    throw new MarksmanLoadsBidContractError("Quote operation evidence is incomplete.", "OPERATION_RECEIPT_INCOMPLETE", 409);
  }
  if (!Number.isFinite(Date.parse(committedAt))) throw new MarksmanLoadsBidContractError("Quote operation evidence timestamp is invalid.", "OPERATION_RECEIPT_INCOMPLETE", 409);
  return {
    provider: MARKSMAN_LOADS_PROVIDER,
    external_organization_id: verified.body.organizationId,
    organization_id: text(context.canonicalOrganizationId),
    workspace_organization_id: text(context.workspaceOrganizationId),
    vendor_id: verified.body.vendorId,
    rfx_event_id: verified.body.eventId,
    rfx_lane_id: verified.body.laneId,
    rfx_lane_vendor_id: text(object(context.invitation).id),
    effect: "quote",
    operation_id: verified.operationKey,
    payload_fingerprint: verified.body.payloadFingerprint,
    segment_key: null,
    record_id: text(object(context.invitation).id),
    staging_record_id: stagingId,
    source_command_id: text(command.id),
    outcome: "committed",
    committed_at: new Date(committedAt).toISOString(),
  };
}

export function classifyBidCommandReplay(
  command: Record<string, unknown>,
  requestFingerprint: string,
  nowMs: number,
  staleExecutionMs: number,
  equivalentOperation = false,
): BidCommandReplayDisposition {
  if (!equivalentOperation && command.request_fingerprint !== requestFingerprint) return "idempotency_conflict";
  if (command.status === "reconciled") return "replay";
  if (command.status === "rejected") return "rejected";
  const updatedAt = Date.parse(text(command.updated_at));
  if (!Number.isFinite(updatedAt)) return "reconcile_only";
  const age = Math.max(0, nowMs - updatedAt);
  if (["received", "executing"].includes(text(command.status)) && age < staleExecutionMs) return "in_progress";
  if (command.status === "received") return "resume_before_mutation";
  return "reconcile_only";
}
