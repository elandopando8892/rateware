// Pure logic of steel-intake-api (contracts steel.freight-request.v1 and
// rateware.carrier-directory.v1). No I/O: validation, canonical hashing,
// payload-to-row mapping and response building, so Node and Deno can test it.

export const FREIGHT_CONTRACT = "steel.freight-request.v1";
export const DIRECTORY_CONTRACT = "rateware.carrier-directory.v1";
export const STEEL_CUSTOMER = "The Steel Marketplace";
export const TRUCK_PAYLOAD_KG = 22000;
export const MAX_DIRECTORY_LIMIT = 200;
export const DEFAULT_DIRECTORY_LIMIT = 50;
export const MAX_DIRECTORY_OFFSET = 10000;
export const COUNTRIES = new Set(["MX", "US", "CA"]);
// Same trailer vocabulary QuoteDesk's FCM engine prices (quotedesk-api/fcm.mjs TRAILERS).
export const EQUIPMENT = ["Dry Van", "Flatbed", "Reefer", "Hazmat", "Chassis", "Power Only", "Overdim"];
// A withdrawn, declined or archived invitation no longer offers its rate.
export const INACTIVE_BID_STATUSES = new Set(["withdrawn", "declined", "archived"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class IntakeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(code, message) {
  return new IntakeError(400, code, message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value, field, { max = 200, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw invalid("invalid_payload", `${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw invalid("invalid_payload", `${field} must be a string.`);
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) {
    if (required) throw invalid("invalid_payload", `${field} is required.`);
    return null;
  }
  if (clean.length > max) throw invalid("invalid_payload", `${field} must be at most ${max} characters.`);
  return clean;
}

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function validDate(value) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// ---------------------------------------------------------------- hashing

/**
 * Canonical JSON: object keys sorted (JS default code-unit order), no
 * whitespace, arrays kept in order, scalars as JSON.stringify writes them,
 * undefined members dropped. Equivalent to Python
 * json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
 * for ASCII keys and integral numbers.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestHash(body) {
  return sha256Hex(canonicalJson(body));
}

/** Constant-time comparison of two equal-length lowercase hex digests. */
export function digestsEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export function normalizeSecretDigest(value) {
  const clean = String(value || "").trim().toLowerCase();
  return SHA256_HEX.test(clean) ? clean : null;
}

export function bearerToken(header) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(String(header || ""));
  return match ? match[1] : null;
}

/** Fail-closed: no configured digest, no token or a different token all reject. */
export async function authorize(authorizationHeader, configuredDigest) {
  const expected = normalizeSecretDigest(configuredDigest);
  if (!expected) return { ok: false, status: 503, code: "intake_not_configured" };
  const token = bearerToken(authorizationHeader);
  // Hash even when the token is missing, so both paths cost about the same.
  const supplied = await sha256Hex(token || "");
  if (!token || !digestsEqual(supplied, expected)) return { ok: false, status: 401, code: "unauthorized" };
  return { ok: true };
}

// ------------------------------------------------------------- validation

function idempotencyKey(value) {
  const key = text(value, "idempotency_key", { max: 200, required: true });
  if (key !== value) throw invalid("invalid_payload", "idempotency_key must not have surrounding or repeated spaces.");
  return key;
}

function place(value, field) {
  const input = record(value);
  if (!input) throw invalid("invalid_payload", `${field} must be an object.`);
  const country = text(input.country, `${field}.country`, { max: 2, required: true }).toUpperCase();
  if (!COUNTRIES.has(country)) throw invalid("invalid_payload", `${field}.country must be MX, US or CA.`);
  return {
    city: text(input.city, `${field}.city`, { max: 120, required: true }),
    state: text(input.state, `${field}.state`, { max: 120 }),
    country
  };
}

export function canonicalEquipment(value) {
  const clean = text(value, "lane.equipment", { max: 40, required: true }).toLowerCase();
  const match = EQUIPMENT.find((item) => item.toLowerCase() === clean);
  if (!match) throw invalid("invalid_payload", `lane.equipment must be one of: ${EQUIPMENT.join(", ")}.`);
  return match;
}

export function validatePublish(body) {
  if (body.contract !== FREIGHT_CONTRACT) {
    throw invalid("unsupported_contract", `contract must be ${FREIGHT_CONTRACT}.`);
  }
  const key = idempotencyKey(body.idempotency_key);
  const ref = record(body.external_ref);
  if (!ref) throw invalid("invalid_payload", "external_ref must be an object.");
  const system = text(ref.system, "external_ref.system", { max: 60, required: true });
  if (!isUuid(ref.shipment_id)) throw invalid("invalid_payload", "external_ref.shipment_id must be a uuid.");
  if (!Number.isSafeInteger(ref.order_number) || ref.order_number <= 0) {
    throw invalid("invalid_payload", "external_ref.order_number must be a positive integer.");
  }
  if (canonicalJson(ref).length > 2000) throw invalid("invalid_payload", "external_ref is too large.");

  const lane = record(body.lane);
  if (!lane) throw invalid("invalid_payload", "lane must be an object.");
  const weight = lane.weight_kg;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 2_000_000) {
    throw invalid("invalid_payload", "lane.weight_kg must be a number greater than 0 (at most 2,000,000).");
  }
  const pickupFrom = text(lane.pickup_from, "lane.pickup_from", { max: 10 });
  if (pickupFrom && !validDate(pickupFrom)) throw invalid("invalid_payload", "lane.pickup_from must be YYYY-MM-DD.");

  let dueDate = null;
  if (body.due_at !== undefined && body.due_at !== null) {
    const parsed = typeof body.due_at === "string" ? new Date(body.due_at) : new Date(Number.NaN);
    if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(body.due_at)) {
      throw invalid("invalid_payload", "due_at must be an ISO-8601 date-time.");
    }
    // rfx_events.due_date is a date: the UTC day of due_at.
    dueDate = parsed.toISOString().slice(0, 10);
  }

  return {
    idempotency_key: key,
    external_ref: { ...ref, system, shipment_id: ref.shipment_id.toLowerCase() },
    lane: {
      origin: place(lane.origin, "lane.origin"),
      destination: place(lane.destination, "lane.destination"),
      equipment: canonicalEquipment(lane.equipment),
      weight_kg: weight,
      pickup_from: pickupFrom,
      commodity: text(lane.commodity, "lane.commodity", { max: 200, required: true }),
      notes: text(lane.notes, "lane.notes", { max: 1000 })
    },
    due_date: dueDate
  };
}

export function validateEventId(body) {
  if (!isUuid(body.rfx_event_id)) throw invalid("invalid_payload", "rfx_event_id must be a uuid.");
  return body.rfx_event_id.toLowerCase();
}

export function validateCancel(body) {
  return {
    idempotency_key: idempotencyKey(body.idempotency_key),
    rfx_event_id: validateEventId(body),
    reason: text(body.reason, "reason", { max: 500, required: true })
  };
}

/** Removes characters with meaning inside a PostgREST or=() filter or an ilike pattern. */
export function sanitizeSearch(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid("invalid_payload", "search must be a string.");
  const clean = value.replace(/[,()*%_\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return clean || null;
}

export function validateDirectoryQuery(body) {
  const limit = body.limit === undefined || body.limit === null ? DEFAULT_DIRECTORY_LIMIT : body.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DIRECTORY_LIMIT) {
    throw invalid("invalid_limit", `limit must be an integer between 1 and ${MAX_DIRECTORY_LIMIT}.`);
  }
  const offset = body.offset === undefined || body.offset === null ? 0 : body.offset;
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_DIRECTORY_OFFSET) {
    throw invalid("invalid_payload", `offset must be an integer between 0 and ${MAX_DIRECTORY_OFFSET}.`);
  }
  return { limit, offset, search: sanitizeSearch(body.search) };
}

// ------------------------------------------------------- payload -> rows

export function trucksForWeight(weightKg) {
  return Math.max(1, Math.ceil(weightKg / TRUCK_PAYLOAD_KG));
}

export function buildRfxId(externalRef) {
  const short = externalRef.shipment_id.replace(/-/g, "").slice(0, 4).toLowerCase();
  return `STEEL-${externalRef.order_number}-${short}`;
}

function placeLabel(value) {
  return [value.city, value.state, value.country].filter(Boolean).join(", ");
}

function formatKg(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} kg`;
}

export function laneNotes(input) {
  const trucks = trucksForWeight(input.lane.weight_kg);
  return [
    `Solicitud de ${STEEL_CUSTOMER} · pedido #${input.external_ref.order_number}`,
    `Peso: ${formatKg(input.lane.weight_kg)} (≈ ${trucks} camión(es) de ${TRUCK_PAYLOAD_KG / 1000} t)`,
    `Mercancía: ${input.lane.commodity}`,
    input.lane.pickup_from ? `Recolección desde: ${input.lane.pickup_from}` : null,
    input.lane.notes ? `Notas del cliente: ${input.lane.notes}` : null
  ].filter(Boolean).join("\n");
}

/** Rows for rfx_events and rfx_lanes. Tenancy fields come from the resolved workspace. */
export function buildSpotRows(input, ids, workspace) {
  const rfxId = buildRfxId(input.external_ref);
  const origin = input.lane.origin;
  const destination = input.lane.destination;
  const event = {
    id: ids.event_id,
    owner_user_id: workspace.owner_user_id,
    owner_email: workspace.owner_email,
    organization_id: workspace.organization_id,
    rfx_id: rfxId,
    name: `${STEEL_CUSTOMER} #${input.external_ref.order_number} · ${origin.city} → ${destination.city} (${input.lane.equipment})`,
    customer: STEEL_CUSTOMER,
    event_type: "spot",
    status: "open",
    bid_visibility_mode: "private",
    due_date: input.due_date,
    operation_start_date: input.lane.pickup_from,
    notes: [
      `Creado por steel-intake-api (${FREIGHT_CONTRACT}) desde ${input.external_ref.system}.`,
      `Pedido #${input.external_ref.order_number} · embarque ${input.external_ref.shipment_id}.`,
      "No se invitó a ningún carrier: el operador decide a quién invitar."
    ].join("\n")
  };
  const lane = {
    id: ids.lane_id,
    rfx_event_id: ids.event_id,
    lane_number: 1,
    origin: placeLabel(origin),
    origin_city: origin.city,
    origin_state: origin.state,
    origin_country: origin.country,
    destination: placeLabel(destination),
    destination_city: destination.city,
    destination_state: destination.state,
    destination_country: destination.country,
    equipment: input.lane.equipment,
    weekly_volume: trucksForWeight(input.lane.weight_kg),
    currency: "USD",
    notes: laneNotes(input)
  };
  return { event, lane };
}

export function buildPublishResponse(ids, rows, receivedAt) {
  return {
    contract: FREIGHT_CONTRACT,
    receipt_id: ids.receipt_id,
    status: "open",
    rfx_event_id: rows.event.id,
    rfx_id: rows.event.rfx_id,
    rfx_lane_id: rows.lane.id,
    received_at: receivedAt,
    replayed: false
  };
}

// ---------------------------------------------------------- read models

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function vendorName(vendor) {
  if (!vendor) return null;
  return String(vendor.vendor_name || vendor.name || "").trim() || null;
}

function rateUsd(row) {
  const currency = String(row.currency || "USD").toUpperCase();
  return currency === "USD" ? number(row.bid_rate) : null;
}

/** invitations: rfx_lane_vendors rows of the event with a bid_rate; vendors: by id. */
export function buildStatusResponse(event, invitations, vendorsById, asOf) {
  const priced = invitations.filter((row) => number(row.bid_rate) !== null);
  const bids = priced
    .filter((row) => !INACTIVE_BID_STATUSES.has(String(row.invitation_status || "").toLowerCase()))
    .map((row) => ({
      bid_ref: row.id,
      vendor_id: row.vendor_id,
      vendor_name: vendorName(vendorsById.get(row.vendor_id)),
      rate_usd: rateUsd(row),
      rate: number(row.bid_rate),
      currency: String(row.currency || "USD").toUpperCase(),
      transit_days: number(row.transit_days),
      weekly_capacity: number(row.weekly_capacity),
      submitted_at: row.responded_at || row.updated_at || null
    }))
    .sort((left, right) => (left.rate ?? Infinity) - (right.rate ?? Infinity) || String(left.bid_ref).localeCompare(String(right.bid_ref)));
  // rateware_award_rfx_lane_vendor marks the winner with award_role = 'primary'.
  const winner = priced.find((row) => String(row.award_role || "").toLowerCase() === "primary") || null;
  return {
    contract: FREIGHT_CONTRACT,
    rfx_event_id: event.id,
    status: event.status,
    as_of: asOf,
    bids,
    award: winner ? {
      bid_ref: winner.id,
      vendor_id: winner.vendor_id,
      vendor_name: vendorName(vendorsById.get(winner.vendor_id)),
      rate_usd: rateUsd(winner),
      rate: number(winner.bid_rate),
      currency: String(winner.currency || "USD").toUpperCase(),
      awarded_at: winner.awarded_at || null
    } : null
  };
}

export function directoryItem(vendor) {
  return {
    vendor_id: vendor.id,
    name: vendorName(vendor),
    domain: vendor.domain || null,
    status: vendor.status,
    tags: Array.isArray(vendor.tags) ? vendor.tags.filter((tag) => typeof tag === "string") : []
  };
}

export function buildDirectoryResponse(rows, total, query, asOf) {
  return {
    contract: DIRECTORY_CONTRACT,
    as_of: asOf,
    total,
    limit: query.limit,
    offset: query.offset,
    items: rows.map(directoryItem)
  };
}

/** Maps a PostgREST/RPC error raised with errcode PTxxx to an HTTP error. */
export function rpcError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (/^PT\d{3}$/.test(code) && /^[a-z0-9_]+$/.test(message)) {
    return new IntakeError(Number(code.slice(2)), message, message.replace(/_/g, " "));
  }
  return null;
}
