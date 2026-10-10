import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  authorize,
  buildDirectoryResponse,
  buildPublishResponse,
  buildRfxId,
  buildSpotRows,
  buildStatusResponse,
  canonicalJson,
  digestsEqual,
  IntakeError,
  requestHash,
  rpcError,
  sanitizeSearch,
  trucksForWeight,
  validateCancel,
  validateDirectoryQuery,
  validateEventId,
  validatePublish
} from "../supabase/functions/steel-intake-api/logic.mjs";

const SHIPMENT = "3f9a1c2e-0b7d-4e55-9a10-2b3c4d5e6f70";
const EVENT = "11111111-2222-4333-8444-555555555555";
const LANE = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const RECEIPT = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const WORKSPACE = { owner_email: "org:org_steel", owner_user_id: "kp_owner", organization_id: "org_steel" };

function publishBody(overrides = {}) {
  return {
    action: "publish_spot_opportunity",
    contract: "steel.freight-request.v1",
    idempotency_key: `steel:shipment:${SHIPMENT}:v1`,
    external_ref: { system: "steel-marketplace", shipment_id: SHIPMENT, order_number: 42 },
    lane: {
      origin: { city: "Saltillo", state: "Coahuila", country: "MX" },
      destination: { city: "Dallas", state: "TX", country: "US" },
      equipment: "Flatbed",
      weight_kg: 40000,
      pickup_from: "2026-10-15",
      commodity: "Acero — rollo caliente (HRC)",
      notes: "Lonas, 2 camiones"
    },
    due_at: "2026-10-13T23:59:00Z",
    ...overrides
  };
}

function rejects(fn, code) {
  assert.throws(fn, (error) => error instanceof IntakeError && error.code === code);
}

test("canonical hash equals sha256 of the sorted-key JSON, whatever the key order", async () => {
  const body = { b: 1, a: { d: [3, { z: true, y: null }], c: "ñ — acero" }, action: "x" };
  const sorted = '{"a":{"c":"ñ — acero","d":[3,{"y":null,"z":true}]},"action":"x","b":1}';
  assert.equal(canonicalJson(body), sorted);
  const expected = createHash("sha256").update(sorted, "utf8").digest("hex");
  assert.equal(await requestHash(body), expected);
  const reordered = { action: "x", a: { c: "ñ — acero", d: [3, { y: null, z: true }] }, b: 1 };
  assert.equal(await requestHash(reordered), expected);
  // Same members parsed from whitespace-heavy JSON hash the same.
  assert.equal(await requestHash(JSON.parse(JSON.stringify(body, null, 2))), expected);
});

test("canonical hash of the contract example is stable and changes with any value", async () => {
  const body = publishBody();
  const expected = createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
  assert.equal(await requestHash(body), expected);
  assert.notEqual(await requestHash(publishBody({ due_at: "2026-10-14T23:59:00Z" })), expected);
  assert.equal(canonicalJson({ a: undefined, b: [undefined] }), '{"b":[null]}');
  assert.throws(() => canonicalJson({ a: Number.NaN }), TypeError);
});

test("authorization is fail-closed and compares the digest of the bearer", async () => {
  const secret = "s3cret-material-for-steel-intake";
  const digest = createHash("sha256").update(secret).digest("hex");
  assert.deepEqual(await authorize(`Bearer ${secret}`, digest), { ok: true });
  assert.deepEqual(await authorize(`bearer ${secret}`, digest.toUpperCase()), { ok: true });
  assert.equal((await authorize(`Bearer ${secret}x`, digest)).status, 401);
  assert.equal((await authorize(null, digest)).status, 401);
  assert.equal((await authorize(`Basic ${secret}`, digest)).status, 401);
  // The digest itself is not a credential.
  assert.equal((await authorize(`Bearer ${digest}`, digest)).status, 401);
  for (const missing of ["", undefined, "not-hex", digest.slice(1)]) {
    const result = await authorize(`Bearer ${secret}`, missing);
    assert.equal(result.status, 503);
    assert.equal(result.code, "intake_not_configured");
  }
  assert.equal(digestsEqual("ab", "ab"), true);
  assert.equal(digestsEqual("ab", "ac"), false);
  assert.equal(digestsEqual("ab", "abc"), false);
});

test("publish validation accepts the contract example and normalizes it", () => {
  const input = validatePublish(publishBody({ lane: { ...publishBody().lane, equipment: "flatbed", origin: { city: " Saltillo ", country: "mx" } } }));
  assert.equal(input.lane.equipment, "Flatbed");
  assert.deepEqual(input.lane.origin, { city: "Saltillo", state: null, country: "MX" });
  assert.equal(input.due_date, "2026-10-13");
  assert.equal(input.lane.pickup_from, "2026-10-15");
  assert.equal(input.idempotency_key, `steel:shipment:${SHIPMENT}:v1`);
});

test("publish validation rejects bad countries, weights, equipment, refs and keys", () => {
  const lane = publishBody().lane;
  rejects(() => validatePublish(publishBody({ contract: "steel.freight-request.v2" })), "unsupported_contract");
  rejects(() => validatePublish(publishBody({ lane: { ...lane, destination: { city: "Madrid", country: "ES" } } })), "invalid_payload");
  for (const weight of [0, -5, "40000", Number.NaN, 3_000_000]) {
    rejects(() => validatePublish(publishBody({ lane: { ...lane, weight_kg: weight } })), "invalid_payload");
  }
  rejects(() => validatePublish(publishBody({ lane: { ...lane, equipment: "Spaceship" } })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ lane: { ...lane, commodity: "" } })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ lane: { ...lane, pickup_from: "2026-02-30" } })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ due_at: "mañana" })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ idempotency_key: "x".repeat(201) })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ idempotency_key: " padded " })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ external_ref: { system: "steel-marketplace", shipment_id: "nope", order_number: 42 } })), "invalid_payload");
  rejects(() => validatePublish(publishBody({ external_ref: { system: "steel-marketplace", shipment_id: SHIPMENT, order_number: 0 } })), "invalid_payload");
});

test("payload maps to an open private spot event and one lane with trucks as weekly volume", () => {
  const input = validatePublish(publishBody());
  const ids = { event_id: EVENT, lane_id: LANE, receipt_id: RECEIPT };
  const rows = buildSpotRows(input, ids, WORKSPACE);
  assert.equal(buildRfxId(input.external_ref), "STEEL-42-3f9a");
  assert.equal(rows.event.rfx_id, "STEEL-42-3f9a");
  assert.equal(rows.event.event_type, "spot");
  assert.equal(rows.event.status, "open");
  assert.equal(rows.event.bid_visibility_mode, "private");
  assert.equal(rows.event.customer, "The Steel Marketplace");
  assert.equal(rows.event.owner_email, "org:org_steel");
  assert.equal(rows.event.organization_id, "org_steel");
  assert.equal(rows.event.due_date, "2026-10-13");
  assert.equal(rows.event.operation_start_date, "2026-10-15");
  assert.equal(rows.lane.rfx_event_id, EVENT);
  assert.equal(rows.lane.weekly_volume, 2);
  assert.equal(rows.lane.origin, "Saltillo, Coahuila, MX");
  assert.equal(rows.lane.destination_country, "US");
  assert.equal(rows.lane.equipment, "Flatbed");
  assert.match(rows.lane.notes, /Peso: 40,000 kg \(≈ 2 camión\(es\) de 22 t\)/);
  assert.match(rows.lane.notes, /Mercancía: Acero — rollo caliente \(HRC\)/);
  assert.match(rows.lane.notes, /Recolección desde: 2026-10-15/);
  assert.match(rows.event.notes, /No se invitó a ningún carrier/);
  assert.deepEqual(buildPublishResponse(ids, rows, "2026-10-10T00:00:00.000Z"), {
    contract: "steel.freight-request.v1", receipt_id: RECEIPT, status: "open", rfx_event_id: EVENT,
    rfx_id: "STEEL-42-3f9a", rfx_lane_id: LANE, received_at: "2026-10-10T00:00:00.000Z", replayed: false
  });
  assert.equal(trucksForWeight(22000), 1);
  assert.equal(trucksForWeight(22001), 2);
  assert.equal(trucksForWeight(0.5), 1);
});

test("status lists live bids cheapest first and reports the primary award", () => {
  const vendors = new Map([["v1", { id: "v1", vendor_name: "Transportes Uno" }], ["v2", { id: "v2", vendor_name: "", name: "Dos Freight" }]]);
  const rows = [
    { id: "b2", vendor_id: "v2", invitation_status: "bid_submitted", bid_rate: "5150", currency: "USD", transit_days: 3, weekly_capacity: 2, responded_at: "2026-10-11T10:00:00Z" },
    { id: "b1", vendor_id: "v1", invitation_status: "awarded", bid_rate: 4900, currency: "usd", transit_days: 4, weekly_capacity: 1, responded_at: "2026-10-11T09:00:00Z", award_role: "primary", awarded_at: "2026-10-12T00:00:00Z" },
    { id: "b3", vendor_id: "v1", invitation_status: "withdrawn", bid_rate: 100, currency: "USD" },
    { id: "b4", vendor_id: "v2", invitation_status: "quoted", bid_rate: 90000, currency: "MXN", award_role: "backup" }
  ];
  const status = buildStatusResponse({ id: EVENT, status: "open" }, rows, vendors, "2026-10-12T01:00:00Z");
  assert.deepEqual(status.bids.map((bid) => bid.bid_ref), ["b1", "b2", "b4"]);
  assert.equal(status.bids[1].vendor_name, "Dos Freight");
  assert.equal(status.bids[1].rate_usd, 5150);
  assert.equal(status.bids[2].rate_usd, null, "a non-USD bid has no rate_usd");
  assert.equal(status.bids[2].currency, "MXN");
  assert.deepEqual(status.award, {
    bid_ref: "b1", vendor_id: "v1", vendor_name: "Transportes Uno", rate_usd: 4900, rate: 4900,
    currency: "USD", awarded_at: "2026-10-12T00:00:00Z"
  });
  assert.equal(buildStatusResponse({ id: EVENT, status: "open" }, [], new Map(), "x").award, null);
});

test("directory exposes only id, name, domain, status and tags", () => {
  const query = validateDirectoryQuery({ limit: 2, offset: 0, search: "acme" });
  const response = buildDirectoryResponse([
    { id: "v1", vendor_name: "Acme", domain: "acme.mx", status: "active", tags: ["flatbed", 3], primary_email: "x@acme.mx", whatsapp_phone: "+52" }
  ], 7, query, "2026-10-10T00:00:00Z");
  assert.deepEqual(response, {
    contract: "rateware.carrier-directory.v1", as_of: "2026-10-10T00:00:00Z", total: 7, limit: 2, offset: 0,
    items: [{ vendor_id: "v1", name: "Acme", domain: "acme.mx", status: "active", tags: ["flatbed"] }]
  });
  assert.deepEqual(validateDirectoryQuery({}), { limit: 50, offset: 0, search: null });
  rejects(() => validateDirectoryQuery({ limit: 201 }), "invalid_limit");
  rejects(() => validateDirectoryQuery({ limit: 0 }), "invalid_limit");
  rejects(() => validateDirectoryQuery({ offset: -1 }), "invalid_payload");
  assert.equal(sanitizeSearch("acme),status.eq.blocked,(x%_*"), "acme status.eq.blocked x");
  assert.equal(sanitizeSearch("acme.com.mx"), "acme.com.mx");
  assert.equal(sanitizeSearch("   "), null);
});

test("cancel and status validation require a uuid and a reason", () => {
  assert.equal(validateEventId({ rfx_event_id: EVENT.toUpperCase() }), EVENT);
  rejects(() => validateEventId({ rfx_event_id: "42" }), "invalid_payload");
  assert.deepEqual(validateCancel({ idempotency_key: "steel:cancel:1", rfx_event_id: EVENT, reason: " Pedido cancelado " }), {
    idempotency_key: "steel:cancel:1", rfx_event_id: EVENT, reason: "Pedido cancelado"
  });
  rejects(() => validateCancel({ idempotency_key: "k", rfx_event_id: EVENT }), "invalid_payload");
});

test("RPC errors raised as PTxxx become contract errors", () => {
  const conflict = rpcError({ code: "PT409", message: "idempotency_conflict" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, "idempotency_conflict");
  assert.equal(rpcError({ code: "PT404", message: "spot_not_found" }).status, 404);
  assert.equal(rpcError({ code: "23505", message: "duplicate key" }), null);
  assert.equal(rpcError({ code: "PT409", message: "Some free text" }), null);
});
