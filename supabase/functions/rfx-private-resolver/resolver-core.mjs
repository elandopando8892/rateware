export const INTERNAL_REQUEST_VERSION = "rateware-internal-request.v1";
export const SUBMIT_BID_CONTRACT_VERSION = "rateware.rfx-bid-api.submit_bid.v1";
export const SUBMIT_BID_FIELDS = Object.freeze([
  "action",
  "bid_rate",
  "currency",
  "weekly_capacity",
  "transit_days",
  "notes",
]);

const ELIGIBLE_INVITATION_STATES = new Set(["invited", "viewed", "responded", "quoted", "bid_submitted"]);
const encoder = new TextEncoder();

export class PrivateResolverError extends Error {
  constructor(message, code = "PRIVATE_RESOLVER_ERROR", status = 400, details = {}) {
    super(message);
    this.name = "PrivateResolverError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const text = (value) => String(value == null ? "" : value).trim();
const clone = (value) => structuredClone(value);

function ledgerError(message, code = "PRIVATE_RESOLVER_LEDGER_ERROR", status = 503, details = {}) {
  return new PrivateResolverError(message, code, status, details);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  if (!/^[a-f0-9]{64}$/i.test(text(value))) throw new PrivateResolverError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);
  return Uint8Array.from(text(value).match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
}

export async function fingerprint(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(stableStringify(value)));
  return bytesToHex(new Uint8Array(digest));
}

async function verifyEnvelope(envelope, { sharedSecret, expectedKeyId, now }) {
  if (text(sharedSecret).length < 32) throw new PrivateResolverError("private resolver secret is not configured", "PRIVATE_RESOLVER_NOT_CONFIGURED", 503);
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new PrivateResolverError("internal request envelope is required", "INVALID_INTERNAL_AUTHORIZATION", 401);
  if (envelope.contractVersion !== INTERNAL_REQUEST_VERSION || envelope.issuer !== "marksman-loads" || envelope.audience !== "rateware") {
    throw new PrivateResolverError("internal request routing is invalid", "INVALID_INTERNAL_AUTHORIZATION", 401);
  }
  if (!text(expectedKeyId) || text(envelope.keyId) !== text(expectedKeyId)) throw new PrivateResolverError("internal authorization key is not accepted", "INVALID_INTERNAL_KEY", 401);
  if (!text(envelope.requestId) || !envelope.body || typeof envelope.body !== "object" || Array.isArray(envelope.body)) {
    throw new PrivateResolverError("internal request is incomplete", "INVALID_INTERNAL_AUTHORIZATION", 401);
  }

  const { signature: _signature, ...unsigned } = envelope;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sharedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify("HMAC", key, hexToBytes(envelope.signature), encoder.encode(stableStringify(unsigned)));
  if (!verified) throw new PrivateResolverError("internal request signature is invalid", "INVALID_INTERNAL_SIGNATURE", 401);

  const current = now().getTime();
  const issued = Date.parse(envelope.issuedAt);
  const expires = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || issued > current + 30_000) {
    throw new PrivateResolverError("internal request timestamps are invalid", "INVALID_INTERNAL_TIMESTAMP", 401);
  }
  if (expires < current) throw new PrivateResolverError("internal authorization has expired", "INTERNAL_AUTHORIZATION_EXPIRED", 401);
  if (expires - issued > 5 * 60_000) throw new PrivateResolverError("internal authorization lifetime is too long", "INVALID_INTERNAL_TIMESTAMP", 401);
  return clone(envelope);
}

export function createMemoryRequestLedger() {
  const records = new Map();
  return {
    async claim(input) {
      const current = records.get(input.requestId);
      if (!current) {
        const record = { ...clone(input), status: "processing", claimedAt: input.claimedAt, completedAt: null };
        records.set(input.requestId, record);
        return { claimed: true, record: clone(record) };
      }
      if (current.requestHash !== input.requestHash) return { claimed: false, mismatch: true, record: clone(current) };
      return { claimed: false, mismatch: false, record: clone(current) };
    },
    async complete(input) {
      const current = records.get(input.requestId);
      if (!current || current.requestHash !== input.requestHash || current.status !== "processing") {
        throw ledgerError("resolver request could not be completed from its current state", "REQUEST_LEDGER_STATE_CONFLICT", 409);
      }
      const record = { ...current, ...clone(input), status: "resolution_canary_passed", errorCode: null };
      records.set(input.requestId, record);
      return clone(record);
    },
    async fail(input) {
      const current = records.get(input.requestId);
      if (!current || current.requestHash !== input.requestHash || current.status !== "processing") return current ? clone(current) : null;
      const record = { ...current, status: "failed", errorCode: text(input.errorCode) || "PRIVATE_RESOLVER_ERROR", completedAt: input.completedAt };
      records.set(input.requestId, record);
      return clone(record);
    },
    snapshot() { return [...records.values()].map(clone); },
  };
}

export function createMemoryRateLimiter({ limitPerMinute = 30 } = {}) {
  const windows = new Map();
  return {
    async check(input) {
      const checkedAt = new Date(input.checkedAt);
      const bucket = Number.isFinite(checkedAt.getTime()) ? checkedAt.toISOString().slice(0, 16) : "invalid";
      const scope = `${text(input.issuer)}|${text(input.keyId)}|${text(input.organizationId)}|${bucket}`;
      const count = (windows.get(scope) || 0) + 1;
      windows.set(scope, count);
      return {
        allowed: count <= limitPerMinute,
        code: count <= limitPerMinute ? "RATE_LIMIT_OK" : "PRIVATE_RESOLVER_RATE_LIMITED",
        controlVersion: "memory-candidate.v1",
        limitPerMinute,
        remaining: Math.max(limitPerMinute - count, 0),
        retryAfterSeconds: 60,
        externalExecutionPossible: false,
      };
    },
  };
}

function assertExactAcceptedFields(value) {
  if (!Array.isArray(value) || value.length !== SUBMIT_BID_FIELDS.length || value.some((field, index) => field !== SUBMIT_BID_FIELDS[index])) {
    throw new PrivateResolverError("Rateware accepted fields do not match the current submit_bid contract", "RATEWARE_CONTRACT_MISMATCH", 409);
  }
}

async function validateHandoff(body) {
  if (body.action === "resolve_and_submit_bid") throw new PrivateResolverError("live Rateware bid execution is disabled", "LIVE_EXECUTION_DISABLED", 403);
  if (body.action !== "resolve_and_submit_bid_canary") throw new PrivateResolverError("private resolver action is unsupported", "INVALID_INTERNAL_ACTION", 400);
  for (const field of ["organizationId", "vendorId", "laneId", "eventId", "preparedReceiptId", "payloadFingerprint", "evidenceFingerprint", "handoffFingerprint"]) {
    if (!text(body[field])) throw new PrivateResolverError(`${field} is required`, "INVALID_INTERNAL_REQUEST", 400);
  }
  if (body.targetContract !== SUBMIT_BID_CONTRACT_VERSION) throw new PrivateResolverError("Rateware target contract is unsupported", "RATEWARE_CONTRACT_MISMATCH", 409);
  assertExactAcceptedFields(body.acceptedFields);
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw new PrivateResolverError("canonical submit_bid payload is required", "INVALID_INTERNAL_REQUEST", 400);
  const payloadFields = Object.keys(body.payload);
  if (payloadFields.some((field) => !SUBMIT_BID_FIELDS.includes(field)) || body.payload.action !== "submit_bid" || !Number.isFinite(Number(body.payload.bid_rate))) {
    throw new PrivateResolverError("canonical submit_bid payload contains unsupported fields or values", "RATEWARE_CONTRACT_MISMATCH", 409);
  }
  if (!body.evidenceSidecar || typeof body.evidenceSidecar !== "object" || Array.isArray(body.evidenceSidecar) || body.evidenceSidecar.acceptedByCurrentSubmitBid !== false) {
    throw new PrivateResolverError("MARKSMAN evidence sidecar boundary is invalid", "EVIDENCE_BOUNDARY_MISMATCH", 409);
  }
  if (!body.humanConfirmation || !text(body.humanConfirmation.actorId) || !new Set(["ADMIN", "OPERATOR"]).has(body.humanConfirmation.role) || !Number.isFinite(Date.parse(body.humanConfirmation.confirmedAt))) {
    throw new PrivateResolverError("current authorized-user confirmation is required", "HUMAN_CONFIRMATION_REQUIRED", 403);
  }

  const payloadHash = await fingerprint(body.payload);
  const evidenceHash = await fingerprint(body.evidenceSidecar);
  const handoffHash = await fingerprint({ targetContract: body.targetContract, submitBidFingerprint: payloadHash, evidenceFingerprint: evidenceHash });
  if (payloadHash !== body.payloadFingerprint) throw new PrivateResolverError("submit_bid payload fingerprint does not reconcile", "PAYLOAD_FINGERPRINT_MISMATCH", 409);
  if (evidenceHash !== body.evidenceFingerprint) throw new PrivateResolverError("MARKSMAN evidence fingerprint does not reconcile", "EVIDENCE_FINGERPRINT_MISMATCH", 409);
  if (handoffHash !== body.handoffFingerprint) throw new PrivateResolverError("complete handoff fingerprint does not reconcile", "HANDOFF_FINGERPRINT_MISMATCH", 409);
}

function relationRecord(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === "object" ? value : {};
}

function assertEligibleInvitation(row, now) {
  const status = text(row.invitation_status).toLowerCase();
  const event = relationRecord(row.rfx_events);
  if (!ELIGIBLE_INVITATION_STATES.has(status)) throw new PrivateResolverError("private invitation is not eligible for carrier bidding", "PRIVATE_INVITATION_INELIGIBLE", 409, { invitationStatus: status || "unknown" });
  if (text(event.status).toLowerCase() !== "open") throw new PrivateResolverError("Rateware event is not open", "PRIVATE_INVITATION_INELIGIBLE", 409, { eventStatus: text(event.status).toLowerCase() || "unknown" });
  const due = Date.parse(event.due_date);
  if (Number.isFinite(due) && due < now().getTime()) throw new PrivateResolverError("Rateware event deadline has elapsed", "PRIVATE_INVITATION_EXPIRED", 409);
}

/**
 * @param {{
 *   sharedSecret?: string,
 *   keyId?: string,
 *   findInvitations: (input: {vendorId:string,laneId:string,eventId:string,limit:number}) => Promise<object[]>,
 *   canaryEnabled?: boolean,
 *   now?: () => Date,
 *   evidenceClass?: string,
 *   requestLedger?: any,
 *   rateLimiter?: any,
 * }} options
 */
export function createPrivateResolver({
  sharedSecret,
  keyId,
  findInvitations,
  canaryEnabled = false,
  now = () => new Date(),
  evidenceClass = "RATEWARE_PRIVATE_RESOLUTION_CANDIDATE",
  requestLedger,
  rateLimiter,
}) {
  if (typeof findInvitations !== "function") throw new TypeError("findInvitations is required");

  function assertLedger() {
    if (!requestLedger || typeof requestLedger.claim !== "function" || typeof requestLedger.complete !== "function" || typeof requestLedger.fail !== "function") {
      throw ledgerError("durable request ledger is not configured", "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE", 503);
    }
  }

  function assertRateLimiter() {
    if (!rateLimiter || typeof rateLimiter.check !== "function") {
      throw new PrivateResolverError("private resolver rate limiter is not configured", "PRIVATE_RESOLVER_RATE_LIMITER_UNAVAILABLE", 503);
    }
  }

  function responseFromRecord(record, { duplicate = false } = {}) {
    if (!record?.resolverRef || !record?.invitationStatus || record.status !== "resolution_canary_passed") {
      throw ledgerError("resolver ledger result is incomplete", "PRIVATE_RESOLVER_LEDGER_ERROR", 503);
    }
    return {
      status: "resolution_canary_passed",
      requestId: record.requestId,
      executionReference: `rateware-resolver-canary-${record.requestId}`,
      privateResolution: {
        status: "matched",
        resolverRef: record.resolverRef,
        vendorId: record.vendorId,
        laneId: record.laneId,
        eventId: record.eventId,
        invitationStatus: record.invitationStatus,
        evidenceClass: record.evidenceClass,
        credentialExposure: false,
      },
      authorizationEvidence: {
        algorithm: "HMAC-SHA256",
        keyId: record.keyId,
        verified: true,
        requestExpiresAt: record.expiresAt,
      },
      ledgerEvidence: {
        persisted: true,
        requestHash: record.requestHash,
        status: record.status,
        duplicate,
        claimedAt: record.claimedAt,
        completedAt: record.completedAt,
        requestBodyStored: false,
        credentialMaterialStored: false,
      },
      projectedAction: "submit_bid",
      externalExecution: false,
      ratewareSubmission: false,
      credentialExposure: false,
      occurredAt: record.completedAt,
    };
  }

  async function resolve(envelope) {
    if (canaryEnabled !== true) throw new PrivateResolverError("private resolution canary is disabled", "CANARY_EXECUTION_DISABLED", 403);
    const verified = await verifyEnvelope(envelope, { sharedSecret, expectedKeyId: keyId, now });
    await validateHandoff(verified.body);
    assertLedger();
    assertRateLimiter();
    const body = verified.body;
    const { signature: _signature, ...unsigned } = verified;
    const requestHash = await fingerprint(unsigned);
    const claimedAt = now().toISOString();
    let claim;
    try {
      claim = await requestLedger.claim({
        requestId: text(verified.requestId), requestHash, action: text(body.action), issuer: text(verified.issuer), keyId: text(verified.keyId),
        organizationId: text(body.organizationId), vendorId: text(body.vendorId), laneId: text(body.laneId), eventId: text(body.eventId),
        payloadFingerprint: text(body.payloadFingerprint), evidenceFingerprint: text(body.evidenceFingerprint), handoffFingerprint: text(body.handoffFingerprint),
        claimedAt, expiresAt: text(verified.expiresAt),
      });
    } catch (error) {
      if (error instanceof PrivateResolverError) throw error;
      throw ledgerError("resolver request ledger is unavailable", "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE", 503);
    }
    if (!claim || typeof claim !== "object" || !claim.record) throw ledgerError("resolver request ledger returned an invalid claim", "PRIVATE_RESOLVER_LEDGER_ERROR", 503);
    if (claim.mismatch === true) throw new PrivateResolverError("request identifier was reused with altered content", "REQUEST_REPLAY_MISMATCH", 409);
    if (claim.claimed !== true) {
      if (claim.record.status === "resolution_canary_passed") return responseFromRecord(claim.record, { duplicate: true });
      if (claim.record.status === "processing") throw new PrivateResolverError("an identical resolver request is already processing", "REQUEST_IN_PROGRESS", 409);
      throw new PrivateResolverError("the resolver request already reached a terminal failure", text(claim.record.errorCode) || "REQUEST_TERMINAL_FAILURE", 409);
    }

    try {
      let rateLimit;
      try {
        rateLimit = await rateLimiter.check({
          issuer: text(verified.issuer),
          keyId: text(verified.keyId),
          organizationId: text(body.organizationId),
          checkedAt: claimedAt,
        });
      } catch (error) {
        if (error instanceof PrivateResolverError) throw error;
        throw new PrivateResolverError("private resolver rate limiter is unavailable", "PRIVATE_RESOLVER_RATE_LIMITER_UNAVAILABLE", 503);
      }
      if (!rateLimit || typeof rateLimit.allowed !== "boolean") {
        throw new PrivateResolverError("private resolver rate limiter returned invalid evidence", "PRIVATE_RESOLVER_RATE_LIMITER_UNAVAILABLE", 503);
      }
      if (rateLimit.allowed !== true) {
        throw new PrivateResolverError("private resolver request limit exceeded", text(rateLimit.code) || "PRIVATE_RESOLVER_RATE_LIMITED", 429, {
          retryAfterSeconds: Number(rateLimit.retryAfterSeconds) || 60,
          controlVersion: text(rateLimit.controlVersion) || null,
        });
      }

      const rows = await findInvitations({ vendorId: text(body.vendorId), laneId: text(body.laneId), eventId: text(body.eventId), limit: 2 });
      if (!Array.isArray(rows)) throw new PrivateResolverError("private invitation source returned an invalid result", "PRIVATE_RESOLVER_SOURCE_ERROR", 502);
      if (rows.length === 0) throw new PrivateResolverError("no private invitation matches this carrier and lane", "PRIVATE_INVITATION_NOT_FOUND", 404);
      if (rows.length !== 1) throw new PrivateResolverError("private invitation resolution is ambiguous", "PRIVATE_INVITATION_AMBIGUOUS", 409, { matchCount: rows.length });
      const row = rows[0];
      if (text(row.vendor_id) !== text(body.vendorId) || text(row.rfx_lane_id) !== text(body.laneId) || text(row.rfx_event_id) !== text(body.eventId)) {
        throw new PrivateResolverError("private invitation source did not preserve requested identifiers", "PRIVATE_RESOLUTION_MISMATCH", 409);
      }
      assertEligibleInvitation(row, now);
      const completedAt = now().toISOString();
      const resolverDigest = (await fingerprint({ type: "rfx_lane_vendor", id: text(row.id) })).slice(0, 24);
      const completed = await requestLedger.complete({
        requestId: text(verified.requestId), requestHash, resolverRef: `rlv-${resolverDigest}`,
        invitationStatus: text(row.invitation_status).toLowerCase(), evidenceClass, completedAt,
      });
      return responseFromRecord(completed);
    } catch (error) {
      if (error?.code === "REQUEST_LEDGER_STATE_CONFLICT" || error?.code === "PRIVATE_RESOLVER_LEDGER_ERROR" || error?.code === "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE") throw error;
      try {
        await requestLedger.fail({ requestId: text(verified.requestId), requestHash, errorCode: text(error?.code) || "PRIVATE_RESOLVER_ERROR", completedAt: now().toISOString() });
      } catch {
        throw ledgerError("resolver failure could not be recorded", "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE", 503);
      }
      throw error;
    }
  }

  return { resolve };
}
