export const SHIPPER_CONTEXT_CONTRACT_VERSION = "marksman-loads.rateware-shipper-crm-context.v1";
export const SHIPPER_CONTEXT_ACTION = "resolve_instruction_letter_context";

const REQUEST_FIELDS = ["action", "carrierOrganizationId", "ratewareVendorId", "postId", "offerId"];
const LINK_STATUSES = new Set(["verified", "pending", "rejected"]);
const ENVIRONMENTS = new Set(["demo", "prod"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

export class ShipperContextError extends Error {
  constructor(message, code = "SHIPPER_CRM_CONTEXT_ERROR", status = 500, details = {}) {
    super(message);
    this.name = "ShipperContextError";
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

function hexToBytes(value) {
  const signature = text(value);
  if (!/^[a-f0-9]{64}$/i.test(signature)) throw new ShipperContextError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);
  const bytes = new Uint8Array(signature.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(signature.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function requireText(value, field, max = 256) {
  const result = text(value);
  if (!result || result.length > max) throw new ShipperContextError(`${field} is invalid`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return result;
}

function requireUuid(value, field) {
  const result = requireText(value, field);
  if (!UUID.test(result)) throw new ShipperContextError(`${field} must be a UUID`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return result;
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShipperContextError(`${field} must be an object`, "INVALID_INTERNAL_REQUEST", 400, { field });
  return value;
}

async function verifyEnvelope(envelope, { sharedSecret, keyId, now }) {
  if (text(sharedSecret).length < 32 || !text(keyId)) throw new ShipperContextError("shipper context resolver is not configured", "SHIPPER_CONTEXT_NOT_CONFIGURED", 503);
  object(envelope, "request");
  if (envelope.contractVersion !== SHIPPER_CONTEXT_CONTRACT_VERSION) throw new ShipperContextError("internal request contract is unsupported", "INVALID_INTERNAL_AUTHORIZATION", 401);
  if (text(envelope.keyId) !== text(keyId)) throw new ShipperContextError("internal authorization key is not accepted", "INVALID_INTERNAL_KEY", 401);
  if (!text(envelope.requestId) || !envelope.body || typeof envelope.body !== "object" || Array.isArray(envelope.body)) {
    throw new ShipperContextError("internal request is incomplete", "INVALID_INTERNAL_AUTHORIZATION", 401);
  }
  const bodyKeys = Object.keys(envelope.body).sort();
  if (bodyKeys.length !== REQUEST_FIELDS.length || REQUEST_FIELDS.some((field) => !bodyKeys.includes(field))) {
    throw new ShipperContextError("internal request fields are not canonical", "INVALID_INTERNAL_REQUEST", 400);
  }
  const { signature: _signature, ...unsigned } = envelope;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new ShipperContextError("cryptographic verification is unavailable", "SHIPPER_CONTEXT_NOT_CONFIGURED", 503);
  const key = await subtle.importKey("raw", encoder.encode(text(sharedSecret)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const verified = await subtle.verify("HMAC", key, hexToBytes(envelope.signature), encoder.encode(stableStringify(unsigned)));
  if (!verified) throw new ShipperContextError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);

  const at = now();
  const current = at instanceof Date ? at.getTime() : Number.NaN;
  const issued = Date.parse(envelope.issuedAt);
  const expires = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(current) || !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || issued > current + 30_000 || expires - issued > 5 * 60_000) {
    throw new ShipperContextError("internal request timestamps are invalid", "INVALID_INTERNAL_TIMESTAMP", 401);
  }
  if (expires < current) throw new ShipperContextError("internal authorization has expired", "INTERNAL_AUTHORIZATION_EXPIRED", 401);
  const body = {
    action: requireText(envelope.body.action, "body.action", 80),
    carrierOrganizationId: requireText(envelope.body.carrierOrganizationId, "body.carrierOrganizationId"),
    ratewareVendorId: requireUuid(envelope.body.ratewareVendorId, "body.ratewareVendorId"),
    postId: requireText(envelope.body.postId, "body.postId"),
    offerId: requireText(envelope.body.offerId, "body.offerId"),
  };
  if (body.action !== SHIPPER_CONTEXT_ACTION) throw new ShipperContextError("internal action is unsupported", "INVALID_INTERNAL_ACTION", 400);
  return { ...clone(envelope), body, expiresAt: new Date(expires).toISOString() };
}

function relation(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === "object" ? value : {};
}

function normalizedAccount(value, index, fallbackObservedAt) {
  object(value, `fleetRocketAccounts[${index}]`);
  const environment = text(value.environment).toLowerCase();
  if (!ENVIRONMENTS.has(environment)) throw new ShipperContextError("Fleet Rocket environment is invalid", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { field: `fleetRocketAccounts[${index}].environment` });
  const shipperId = Number(value.shipperId ?? value.shipper_id);
  if (!Number.isInteger(shipperId) || shipperId < 1) throw new ShipperContextError("Fleet Rocket shipper ID is invalid", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { field: `fleetRocketAccounts[${index}].shipperId` });
  const status = text(value.status || "pending").toLowerCase();
  if (!LINK_STATUSES.has(status)) throw new ShipperContextError("Fleet Rocket account status is invalid", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { field: `fleetRocketAccounts[${index}].status` });
  return {
    environment,
    shipperId,
    status,
    sourceRef: requireText(value.sourceRef || value.source_ref, `fleetRocketAccounts[${index}].sourceRef`, 300),
    observedAt: text(value.observedAt || value.observed_at || fallbackObservedAt) || null,
  };
}

function shipperLink(shipper) {
  object(shipper, "shipper");
  const shipperId = requireUuid(shipper.id, "shipper.id");
  const tmsSystemId = requireText(shipper.tms_system_id, "shipper.tms_system_id", 160);
  const metadata = shipper.metadata && typeof shipper.metadata === "object" && !Array.isArray(shipper.metadata) ? shipper.metadata : {};
  const loadsMetadata = metadata.marksman_loads && typeof metadata.marksman_loads === "object" && !Array.isArray(metadata.marksman_loads) ? metadata.marksman_loads : {};
  const rawAccounts = loadsMetadata.fleetRocketAccounts || loadsMetadata.fleet_rocket_accounts;
  if (!Array.isArray(rawAccounts) || !rawAccounts.length) throw new ShipperContextError("explicit Fleet Rocket environment mapping is missing from Shipper CRM", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { dependency: "shippers.metadata.marksman_loads.fleetRocketAccounts" });
  const accounts = rawAccounts.map((account, index) => normalizedAccount(account, index, shipper.updated_at));
  if (!accounts.some((account) => account.status === "verified")) throw new ShipperContextError("no verified Fleet Rocket account is available", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409);
  return {
    contractVersion: "rateware.shipper-crm-link.v1",
    source: "rateware.shipper_crm",
    status: "verified",
    shipperName: text(shipper.shipper_name || shipper.legal_name) || "Unnamed shipper",
    ratewareShipperId: shipperId,
    tmsSystemId,
    ratewareDomain: text(shipper.domain) || null,
    fleetRocketAccounts: accounts,
    match: { basis: "rfx_events.customer_id + shippers.id + explicit Fleet Rocket account map", confidence: "verified" },
    evidence: [
      { type: "rateware_shipper_record", ref: `shippers:${shipperId}`, observedAt: text(shipper.updated_at) || null },
      { type: "fleet_rocket_account_map", ref: `shippers:${shipperId}:metadata.marksman_loads`, observedAt: text(shipper.updated_at) || null },
    ],
    externalWrite: false,
  };
}

function cancellationPolicy(input) {
  object(input, "cancellationPolicy");
  const tonuWindowHours = Number(input.tonuWindowHours ?? input.tonu_window_hours);
  const tonuCode = text(input.tonuCode ?? input.tonu_code);
  if (!Number.isFinite(tonuWindowHours) || tonuWindowHours < 0 || !tonuCode || typeof (input.suspensionOnUnjustifiedCancel ?? input.suspension_on_unjustified_cancel) !== "boolean") {
    throw new ShipperContextError("structured cancellation policy is incomplete", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { dependency: "Rateware structured TONU/cancellation policy" });
  }
  return { tonuWindowHours, tonuCode, suspensionOnUnjustifiedCancel: input.suspensionOnUnjustifiedCancel ?? input.suspension_on_unjustified_cancel };
}

function agreementIsBound(agreement, body) {
  object(agreement, "agreement");
  const offer = relation(agreement.offer || agreement);
  const event = relation(agreement.event || agreement.rfx_events);
  const lane = relation(agreement.lane || agreement.rfx_lanes);
  const binding = relation(agreement.binding || agreement.marksmanLoadsBinding);
  const offerId = text(offer.id || agreement.rfx_lane_vendor_id);
  const vendorId = text(offer.vendor_id || agreement.vendor_id);
  const eventId = text(event.id || agreement.rfx_event_id);
  const laneId = text(lane.id || agreement.rfx_lane_id);
  const directBinding = offerId === body.offerId && [eventId, laneId].includes(body.postId);
  const bridgedBinding = text(binding.carrier_organization_id || binding.carrierOrganizationId) === body.carrierOrganizationId
    && text(binding.marksman_post_id || binding.marksmanPostId) === body.postId
    && text(binding.marksman_offer_id || binding.marksmanOfferId) === body.offerId
    && text(binding.rfx_event_id || binding.rfxEventId) === eventId
    && text(binding.status || "active").toLowerCase() === "active"
    && text(binding.rfx_lane_vendor_id || binding.rfxLaneVendorId || offerId) === offerId;
  if (vendorId !== body.ratewareVendorId || (!directBinding && !bridgedBinding)) {
    throw new ShipperContextError("post, offer and Rateware vendor are not bound to the same agreement", "SHIPPER_CRM_CONTEXT_BINDING_MISMATCH", 409);
  }
  if (!["open", "closed", "awarded"].includes(text(event.status).toLowerCase())) throw new ShipperContextError("Rateware event is not eligible for context resolution", "SHIPPER_CRM_CONTEXT_UNAVAILABLE", 409, { eventStatus: text(event.status) || "unknown" });
  const customerId = text(event.customer_id || event.customerId);
  if (!customerId || !UUID.test(customerId)) throw new ShipperContextError("Rateware event has no canonical Shipper CRM link", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { dependency: "rfx_events.customer_id" });
  return { offer, event, lane, customerId, eventId, laneId };
}

/**
 * @param {{
 *   sharedSecret?: string,
 *   keyId?: string,
 *   enabled?: boolean,
 *   findAgreement: (input: {carrierOrganizationId: string, ratewareVendorId: string, postId: string, offerId: string}) => Promise<object>,
 *   findShipper: (shipperId: string) => Promise<object|null>,
 *   findPolicy: (input: {event: object, projectId: string|null}) => Promise<object|null>,
 *   now?: () => Date,
 * }} options
 */
export function createShipperContextResolver({ sharedSecret = "", keyId = "", enabled = false, findAgreement, findShipper, findPolicy, now = () => new Date() } = {}) {
  if (typeof findAgreement !== "function" || typeof findShipper !== "function" || typeof findPolicy !== "function") throw new TypeError("findAgreement, findShipper and findPolicy are required");

  async function resolve(envelope) {
    if (enabled !== true) throw new ShipperContextError("shipper context resolver is disabled", "SHIPPER_CONTEXT_DISABLED", 403);
    const verified = await verifyEnvelope(envelope, { sharedSecret, keyId, now });
    const bound = agreementIsBound(await findAgreement(verified.body), verified.body);
    const shipper = await findShipper(bound.customerId);
    if (!shipper) throw new ShipperContextError("canonical Shipper CRM record was not found", "SHIPPER_CRM_CONTEXT_UNAVAILABLE", 404);
    const policySource = await findPolicy({ event: bound.event, projectId: text(bound.event.source_rfx_process_project_id) || null });
    if (!policySource) throw new ShipperContextError("structured cancellation policy is not available", "SHIPPER_CRM_CONTEXT_INCOMPLETE", 409, { dependency: "Rateware structured TONU/cancellation policy" });
    const policy = cancellationPolicy(policySource);
    const observedAt = now().toISOString();
    return {
      contractVersion: SHIPPER_CONTEXT_CONTRACT_VERSION,
      requestId: verified.requestId,
      status: "resolved",
      observedAt,
      externalExecution: false,
      authorizationEvidence: { algorithm: "HMAC-SHA256", keyId: verified.keyId, verified: true, requestExpiresAt: verified.expiresAt },
      context: {
        shipperCrmLink: shipperLink(shipper),
        cancellationPolicy: policy,
      },
    };
  }

  return Object.freeze({ resolve });
}
