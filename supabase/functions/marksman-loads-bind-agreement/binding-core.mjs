export const AGREEMENT_BINDING_CONTRACT_VERSION = "marksman-loads.rateware-agreement-binding.v1";
export const AGREEMENT_BINDING_ACTION = "bind_rateware_agreement";

const REQUEST_FIELDS = [
  "action",
  "carrierOrganizationId",
  "ratewareVendorId",
  "rfxEventId",
  "rfxLaneVendorId",
  "marksmanPostId",
  "marksmanOfferId",
  "idempotencyKey",
  "humanConfirmation",
];
const CONFIRMATION_FIELDS = ["actorId", "role", "confirmedAt", "approvalReference"];
const APPROVED_ROLES = new Set(["ADMIN", "OPERATOR"]);
const EVENT_STATUSES = new Set(["open", "closed", "awarded"]);
const AWARD_ROLES = new Set(["primary", "backup"]);
const CONFIRMED_INVITATION_STATUSES = new Set(["awarded", "quoted"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,191}$/;
const encoder = new TextEncoder();

export class AgreementBindingError extends Error {
  constructor(message, code = "AGREEMENT_BINDING_ERROR", status = 500, details = {}) {
    super(message);
    this.name = "AgreementBindingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const text = (value) => String(value == null ? "" : value).trim();
const clone = (value) => structuredClone(value);

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new AgreementBindingError("cryptographic hashing is unavailable", "AGREEMENT_BINDING_NOT_CONFIGURED", 503);
  const digest = new Uint8Array(await subtle.digest("SHA-256", encoder.encode(String(value))));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  const signature = text(value);
  if (!/^[a-f0-9]{64}$/i.test(signature)) throw new AgreementBindingError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);
  const bytes = new Uint8Array(signature.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(signature.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function requireText(value, field, max = 256) {
  const result = text(value);
  if (!result || result.length > max) throw new AgreementBindingError(`${field} is invalid`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return result;
}

function requireUuid(value, field) {
  const result = requireText(value, field);
  if (!UUID.test(result)) throw new AgreementBindingError(`${field} must be a UUID`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return result;
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgreementBindingError(`${field} must be an object`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return value;
}

function relation(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === "object" ? value : {};
}

function normalizeConfirmation(value, now) {
  const input = object(value, "body.humanConfirmation");
  const keys = Object.keys(input).sort();
  if (keys.length !== CONFIRMATION_FIELDS.length || CONFIRMATION_FIELDS.some((field) => !keys.includes(field))) {
    throw new AgreementBindingError("human confirmation fields are not canonical", "INVALID_INTERNAL_REQUEST", 400, { field: "body.humanConfirmation" });
  }
  const actorId = requireText(input.actorId, "humanConfirmation.actorId", 160);
  const role = requireText(input.role, "humanConfirmation.role", 20).toUpperCase();
  if (!APPROVED_ROLES.has(role)) throw new AgreementBindingError("human confirmation role is not allowed", "APPROVAL_REQUIRED", 403, { allowedRoles: Array.from(APPROVED_ROLES) });
  const confirmedAt = requireText(input.confirmedAt, "humanConfirmation.confirmedAt", 80);
  const confirmedMs = Date.parse(confirmedAt);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(confirmedMs) || !Number.isFinite(nowMs) || confirmedMs > nowMs + 30_000) {
    throw new AgreementBindingError("human confirmation timestamp is invalid", "APPROVAL_REQUIRED", 403, { field: "humanConfirmation.confirmedAt" });
  }
  return {
    actorId,
    role,
    confirmedAt: new Date(confirmedMs).toISOString(),
    approvalReference: requireText(input.approvalReference, "humanConfirmation.approvalReference", 240),
  };
}

async function verifyEnvelope(envelope, { sharedSecret, keyId, now }) {
  if (text(sharedSecret).length < 32 || !text(keyId)) throw new AgreementBindingError("agreement binding command is not configured", "AGREEMENT_BINDING_NOT_CONFIGURED", 503);
  object(envelope, "request");
  if (envelope.contractVersion !== AGREEMENT_BINDING_CONTRACT_VERSION) throw new AgreementBindingError("internal request contract is unsupported", "INVALID_INTERNAL_AUTHORIZATION", 401);
  if (text(envelope.keyId) !== text(keyId)) throw new AgreementBindingError("internal authorization key is not accepted", "INVALID_INTERNAL_KEY", 401);
  if (!text(envelope.requestId) || !envelope.body || typeof envelope.body !== "object" || Array.isArray(envelope.body)) {
    throw new AgreementBindingError("internal request is incomplete", "INVALID_INTERNAL_AUTHORIZATION", 401);
  }
  const bodyKeys = Object.keys(envelope.body).sort();
  if (bodyKeys.length !== REQUEST_FIELDS.length || REQUEST_FIELDS.some((field) => !bodyKeys.includes(field))) {
    throw new AgreementBindingError("internal request fields are not canonical", "INVALID_INTERNAL_REQUEST", 400);
  }
  const { signature: _signature, ...unsigned } = envelope;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new AgreementBindingError("cryptographic verification is unavailable", "AGREEMENT_BINDING_NOT_CONFIGURED", 503);
  const key = await subtle.importKey("raw", encoder.encode(text(sharedSecret)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const verified = await subtle.verify("HMAC", key, hexToBytes(envelope.signature), encoder.encode(stableStringify(unsigned)));
  if (!verified) throw new AgreementBindingError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);

  const current = now();
  const currentMs = current instanceof Date ? current.getTime() : Number.NaN;
  const issued = Date.parse(envelope.issuedAt);
  const expires = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(currentMs) || !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || issued > currentMs + 30_000 || expires - issued > 5 * 60_000) {
    throw new AgreementBindingError("internal request timestamps are invalid", "INVALID_INTERNAL_TIMESTAMP", 401);
  }
  if (expires < currentMs) throw new AgreementBindingError("internal authorization has expired", "INTERNAL_AUTHORIZATION_EXPIRED", 401);

  const body = {
    action: requireText(envelope.body.action, "body.action", 80),
    carrierOrganizationId: requireText(envelope.body.carrierOrganizationId, "body.carrierOrganizationId", 160),
    ratewareVendorId: requireUuid(envelope.body.ratewareVendorId, "body.ratewareVendorId"),
    rfxEventId: requireUuid(envelope.body.rfxEventId, "body.rfxEventId"),
    rfxLaneVendorId: requireUuid(envelope.body.rfxLaneVendorId, "body.rfxLaneVendorId"),
    marksmanPostId: requireText(envelope.body.marksmanPostId, "body.marksmanPostId", 160),
    marksmanOfferId: requireText(envelope.body.marksmanOfferId, "body.marksmanOfferId", 160),
    idempotencyKey: requireText(envelope.body.idempotencyKey, "body.idempotencyKey", 191),
    humanConfirmation: normalizeConfirmation(envelope.body.humanConfirmation, currentMs),
  };
  if (body.action !== AGREEMENT_BINDING_ACTION) throw new AgreementBindingError("internal action is unsupported", "INVALID_INTERNAL_ACTION", 400);
  if (!IDEMPOTENCY_KEY.test(body.idempotencyKey)) throw new AgreementBindingError("idempotency key is invalid", "INVALID_INTERNAL_REQUEST", 400, { field: "body.idempotencyKey" });
  return { ...clone(envelope), body, expiresAt: new Date(expires).toISOString() };
}

function agreementIsEligible(agreement, body) {
  object(agreement, "agreement");
  const offer = relation(agreement.offer || agreement);
  const event = relation(agreement.event || agreement.rfx_events);
  const lane = relation(agreement.lane || agreement.rfx_lanes);
  const offerId = text(offer.id || agreement.rfx_lane_vendor_id);
  const vendorId = text(offer.vendor_id || agreement.vendor_id);
  const eventId = text(event.id || agreement.rfx_event_id);
  const laneVendorEventId = text(offer.rfx_event_id || agreement.rfx_event_id);
  if (offerId !== body.rfxLaneVendorId || vendorId !== body.ratewareVendorId || eventId !== body.rfxEventId || laneVendorEventId !== body.rfxEventId) {
    throw new AgreementBindingError("Rateware invitation is not the exact requested agreement", "AGREEMENT_BINDING_MISMATCH", 409);
  }
  const eventStatus = text(event.status).toLowerCase();
  if (!EVENT_STATUSES.has(eventStatus)) throw new AgreementBindingError("Rateware event is not eligible for an agreement binding", "AGREEMENT_NOT_CONFIRMED", 409, { eventStatus: eventStatus || "unknown" });
  const awardRole = text(offer.award_role || agreement.award_role).toLowerCase();
  const invitationStatus = text(offer.invitation_status || agreement.invitation_status).toLowerCase();
  if (!AWARD_ROLES.has(awardRole) || !CONFIRMED_INVITATION_STATUSES.has(invitationStatus)) {
    throw new AgreementBindingError("the Rateware invitation has no confirmed award state", "AGREEMENT_NOT_CONFIRMED", 409, { awardRole: awardRole || null, invitationStatus: invitationStatus || null });
  }
  const bidRate = Number(offer.bid_rate ?? agreement.bid_rate);
  if (!Number.isFinite(bidRate) || bidRate <= 0) throw new AgreementBindingError("a positive confirmed carrier rate is required", "AGREEMENT_NOT_CONFIRMED", 409);
  const customerId = text(event.customer_id || event.customerId);
  if (!UUID.test(customerId)) throw new AgreementBindingError("the Rateware event has no canonical Shipper CRM link", "AGREEMENT_BINDING_INCOMPLETE", 409, { dependency: "rfx_events.customer_id" });
  return {
    eventId,
    laneId: text(lane.id || agreement.rfx_lane_id) || null,
    offerId,
    vendorId,
    customerId,
    eventStatus,
    invitationStatus,
    awardRole,
    bidRate,
    currency: text(offer.currency || agreement.currency) || null,
  };
}

function metadataOf(binding) {
  return binding && binding.metadata && typeof binding.metadata === "object" && !Array.isArray(binding.metadata) ? binding.metadata : {};
}

function targetMatches(binding, body) {
  if (!binding) return false;
  return text(binding.carrier_organization_id || binding.carrierOrganizationId) === body.carrierOrganizationId
    && text(binding.rateware_vendor_id || binding.ratewareVendorId) === body.ratewareVendorId
    && text(binding.rfx_event_id || binding.rfxEventId) === body.rfxEventId
    && text(binding.rfx_lane_vendor_id || binding.rfxLaneVendorId) === body.rfxLaneVendorId
    && text(binding.marksman_post_id || binding.marksmanPostId) === body.marksmanPostId
    && text(binding.marksman_offer_id || binding.marksmanOfferId) === body.marksmanOfferId;
}

function bindingResponse(status, binding, verified, source, extra = {}) {
  return {
    contractVersion: AGREEMENT_BINDING_CONTRACT_VERSION,
    requestId: verified.requestId,
    status,
    externalExecution: false,
    binding,
    sourceAgreement: source,
    authorizationEvidence: {
      algorithm: "HMAC-SHA256",
      keyId: verified.keyId,
      verified: true,
      requestExpiresAt: verified.expiresAt,
      humanConfirmation: verified.body.humanConfirmation,
    },
    ...extra,
  };
}

function conflict(message, details = {}) {
  return new AgreementBindingError(message, "AGREEMENT_BINDING_CONFLICT", 409, details);
}

/**
 * Build a server-only, idempotent command for the explicit bridge table.
 * The callbacks deliberately keep database access outside the pure domain
 * contract so this module can be exercised without a live Supabase project.
 *
 * @param {{
 *   sharedSecret?: string,
 *   keyId?: string,
 *   enabled?: boolean,
 *   findAgreement: (input: Record<string, unknown>) => Promise<object>,
 *   findExistingByLocal: (input: Record<string, unknown>) => Promise<object|null>,
 *   findExistingByRateware: (input: Record<string, unknown>) => Promise<object|null>,
 *   findExistingByCommand?: (input: Record<string, unknown>) => Promise<object|null>,
 *   insertBinding: (input: Record<string, unknown>) => Promise<object>,
 *   now?: () => Date,
 * }} options
 */
export function createAgreementBindingService({
  sharedSecret = "",
  keyId = "",
  enabled = false,
  findAgreement,
  findExistingByLocal,
  findExistingByRateware,
  findExistingByCommand = async () => null,
  insertBinding,
  now = () => new Date(),
} = {}) {
  if (typeof findAgreement !== "function" || typeof findExistingByLocal !== "function" || typeof findExistingByRateware !== "function" || typeof findExistingByCommand !== "function" || typeof insertBinding !== "function") {
    throw new TypeError("agreement binding database callbacks are required");
  }

  async function bind(envelope) {
    if (enabled !== true) throw new AgreementBindingError("agreement binding command is disabled", "AGREEMENT_BINDING_DISABLED", 403);
    const verified = await verifyEnvelope(envelope, { sharedSecret, keyId, now });
    const body = verified.body;
    const requestFingerprint = await sha256Hex(stableStringify(body));

    const existingByCommand = await findExistingByCommand(body);
    if (existingByCommand) {
      const existingMetadata = metadataOf(existingByCommand);
      if (text(existingByCommand.status).toLowerCase() !== "active" || text(existingMetadata.requestFingerprint) !== requestFingerprint || !targetMatches(existingByCommand, body)) {
        throw conflict("idempotency key was already used for a different agreement", { idempotencyKey: body.idempotencyKey });
      }
      return bindingResponse("already_bound", existingByCommand, verified, null, { idempotent: true });
    }

    const source = agreementIsEligible(await findAgreement(body), body);
    const existingLocal = await findExistingByLocal(body);
    if (existingLocal) {
      if (text(existingLocal.status).toLowerCase() === "active" && targetMatches(existingLocal, body)) {
        return bindingResponse("already_bound", existingLocal, verified, source, { idempotent: true });
      }
      throw conflict("the MARKSMAN Loads agreement key is already bound to another Rateware invitation", { marksmanPostId: body.marksmanPostId, marksmanOfferId: body.marksmanOfferId });
    }

    const existingRateware = await findExistingByRateware(body);
    if (existingRateware) {
      if (text(existingRateware.status).toLowerCase() === "active" && targetMatches(existingRateware, body)) {
        return bindingResponse("already_bound", existingRateware, verified, source, { idempotent: true });
      }
      throw conflict("the Rateware invitation is already bound to another MARKSMAN Loads agreement", { rfxLaneVendorId: body.rfxLaneVendorId });
    }

    const bindingInput = {
      carrier_organization_id: body.carrierOrganizationId,
      rateware_vendor_id: body.ratewareVendorId,
      rfx_event_id: body.rfxEventId,
      rfx_lane_vendor_id: body.rfxLaneVendorId,
      marksman_post_id: body.marksmanPostId,
      marksman_offer_id: body.marksmanOfferId,
      status: "active",
      metadata: {
        source: "marksman_loads_agreement_binding",
        contractVersion: AGREEMENT_BINDING_CONTRACT_VERSION,
        requestId: verified.requestId,
        idempotencyKey: body.idempotencyKey,
        requestFingerprint,
        externalExecution: false,
        humanConfirmation: body.humanConfirmation,
        sourceAgreement: source,
      },
    };

    try {
      const inserted = await insertBinding(bindingInput);
      return bindingResponse("bound", inserted, verified, source, { idempotent: false });
    } catch (error) {
      // Unique constraints are the concurrency fence. Re-read after a race;
      // never use upsert because an existing bridge must not be overwritten.
      if (String(error?.code || "") === "23505") {
        const racedByCommand = await findExistingByCommand(body);
        const racedLocal = racedByCommand || await findExistingByLocal(body);
        const racedRateware = racedByCommand || await findExistingByRateware(body);
        if (racedLocal && racedRateware && targetMatches(racedLocal, body) && targetMatches(racedRateware, body)) {
          return bindingResponse("already_bound", racedLocal, verified, source, { idempotent: true, reconciledAfterConflict: true });
        }
        throw conflict("agreement binding could not be created because an existing bridge won the race", { constraint: error.constraint || null });
      }
      throw error;
    }
  }

  return Object.freeze({ bind });
}
