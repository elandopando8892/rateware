import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHIPPER_CONTEXT_ACTION,
  SHIPPER_CONTEXT_CONTRACT_VERSION,
  ShipperContextError,
  createShipperContextResolver,
  stableStringify,
} from "../supabase/functions/marksman-shipper-context/context-core.mjs";

const bridgeMigration = readFileSync(new URL("../supabase/migrations/20260913130000_marksman_loads_agreement_binding.sql", import.meta.url), "utf8");

const secret = "s".repeat(32);
const keyId = "marksman-loads-context-1";
const now = new Date("2026-09-13T12:00:00.000Z");
const vendorId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const laneId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const shipperId = "55555555-5555-4555-8555-555555555555";

function envelope(overrides = {}) {
  const unsigned = {
    contractVersion: SHIPPER_CONTEXT_CONTRACT_VERSION,
    requestId: "request-001",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    keyId,
    body: {
      action: SHIPPER_CONTEXT_ACTION,
      carrierOrganizationId: "carrier:acme",
      ratewareVendorId: vendorId,
      postId: eventId,
      offerId,
    },
  };
  const finalUnsigned = { ...unsigned, ...overrides };
  return {
    ...finalUnsigned,
    signature: createHmac("sha256", secret).update(stableStringify(finalUnsigned)).digest("hex"),
  };
}

function resign(input) {
  const { signature: _signature, ...unsigned } = input;
  return { ...unsigned, signature: createHmac("sha256", secret).update(stableStringify(unsigned)).digest("hex") };
}

function agreement() {
  return {
    id: offerId,
    rfx_event_id: eventId,
    rfx_lane_id: laneId,
    vendor_id: vendorId,
    event: { id: eventId, customer_id: shipperId, status: "awarded", source_rfx_process_project_id: "66666666-6666-4666-8666-666666666666" },
    lane: { id: laneId },
  };
}

function shipper() {
  return {
    id: shipperId,
    shipper_name: "Vifaa",
    domain: "vifaa.example",
    tms_system_id: "17",
    status: "active",
    updated_at: now.toISOString(),
    metadata: {
      marksman_loads: {
        fleetRocketAccounts: [
          { environment: "demo", shipperId: 17, status: "verified", sourceRef: "rateware:shipper:5555:demo" },
        ],
      },
    },
  };
}

function resolver(overrides = {}) {
  return createShipperContextResolver({
    sharedSecret: secret,
    keyId,
    enabled: true,
    now: () => now,
    findAgreement: async () => agreement(),
    findShipper: async () => shipper(),
    findPolicy: async () => ({ tonuWindowHours: 24, tonuCode: "TONU", suspensionOnUnjustifiedCancel: true }),
    ...overrides,
  });
}

test("resolves a direct Rateware event/lane offer with explicit Shipper CRM and Fleet Rocket evidence", async () => {
  const result = await resolver().resolve(envelope());
  assert.equal(result.status, "resolved");
  assert.equal(result.externalExecution, false);
  assert.deepEqual(result.authorizationEvidence, {
    algorithm: "HMAC-SHA256",
    keyId,
    verified: true,
    requestExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
  });
  assert.equal(result.context.shipperCrmLink.ratewareShipperId, shipperId);
  assert.equal(result.context.shipperCrmLink.tmsSystemId, "17");
  assert.equal(result.context.shipperCrmLink.fleetRocketAccounts[0].shipperId, 17);
  assert.deepEqual(result.context.cancellationPolicy, { tonuWindowHours: 24, tonuCode: "TONU", suspensionOnUnjustifiedCancel: true });
});

test("rejects tampering and expired signed requests before reading Rateware data", async () => {
  let reads = 0;
  const target = resolver({ findAgreement: async () => { reads += 1; return agreement(); } });
  const tampered = envelope();
  tampered.body.offerId = "77777777-7777-4777-8777-777777777777";
  await assert.rejects(() => target.resolve(tampered), (error) => error.code === "INVALID_INTERNAL_SIGNATURE");
  const expiredUnsigned = resign({ ...envelope(), issuedAt: new Date(now.getTime() - 120_000).toISOString(), expiresAt: new Date(now.getTime() - 60_000).toISOString() });
  await assert.rejects(() => target.resolve(expiredUnsigned), (error) => error.code === "INTERNAL_AUTHORIZATION_EXPIRED");
  assert.equal(reads, 0);
});

test("does not infer a local Loads post or offer from unrelated Rateware identifiers", async () => {
  const target = resolver({ findAgreement: async () => ({ ...agreement(), id: "rateware-offer-not-loads" }) });
  await assert.rejects(() => target.resolve(envelope({ body: { ...envelope().body, postId: "loads-post-1", offerId: "loads-offer-1" } })), (error) => error.code === "SHIPPER_CRM_CONTEXT_BINDING_MISMATCH");
});

test("accepts local Loads identifiers only when an explicit Rateware bridge binds both ids", async () => {
  const target = resolver({
    findAgreement: async () => ({
      ...agreement(),
      binding: {
        carrier_organization_id: "carrier:acme",
        rfx_event_id: eventId,
        rfx_lane_vendor_id: offerId,
        marksman_post_id: "loads-post-1",
        marksman_offer_id: "loads-offer-1",
        status: "active",
      },
    }),
  });
  const body = { ...envelope().body, postId: "loads-post-1", offerId: "loads-offer-1" };
  const result = await target.resolve(envelope({ body }));
  assert.equal(result.context.shipperCrmLink.shipperName, "Vifaa");
});

test("fails closed when environment account mapping or structured policy is absent", async () => {
  const missingAccount = resolver({ findShipper: async () => ({ ...shipper(), metadata: {} }) });
  await assert.rejects(() => missingAccount.resolve(envelope()), (error) => error instanceof ShipperContextError && error.code === "SHIPPER_CRM_CONTEXT_INCOMPLETE");
  const missingPolicy = resolver({ findPolicy: async () => null });
  await assert.rejects(() => missingPolicy.resolve(envelope()), (error) => error.code === "SHIPPER_CRM_CONTEXT_INCOMPLETE");
});

test("does not interpret human-readable cancellation policy text as structured evidence", async () => {
  const textPolicy = resolver({ findPolicy: async () => ({ cancellation_policy: "TONU within 24 hours" }) });
  await assert.rejects(() => textPolicy.resolve(envelope()), (error) => error.code === "SHIPPER_CRM_CONTEXT_INCOMPLETE");
});

test("keeps the local Loads agreement bridge server-owned and auditable", () => {
  assert.match(bridgeMigration, /create table if not exists public\.marksman_loads_rateware_agreement_bindings/);
  assert.match(bridgeMigration, /carrier_organization_id text not null/);
  assert.match(bridgeMigration, /marksman_post_id text not null/);
  assert.match(bridgeMigration, /marksman_offer_id text not null/);
  assert.match(bridgeMigration, /rfx_lane_vendor_id uuid not null references public\.rfx_lane_vendors/);
  assert.match(bridgeMigration, /alter table public\.marksman_loads_rateware_agreement_bindings enable row level security/);
  assert.doesNotMatch(bridgeMigration, /create policy/i);
});
