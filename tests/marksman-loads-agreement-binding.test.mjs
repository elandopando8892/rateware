import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  AGREEMENT_BINDING_ACTION,
  AGREEMENT_BINDING_CONTRACT_VERSION,
  AgreementBindingError,
  createAgreementBindingService,
  stableStringify,
} from "../supabase/functions/marksman-loads-bind-agreement/binding-core.mjs";

const secret = "s".repeat(32);
const keyId = "marksman-loads-binding-1";
const now = new Date("2026-09-13T12:00:00.000Z");
const vendorId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const laneId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const customerId = "55555555-5555-4555-8555-555555555555";

function body(overrides = {}) {
  return {
    action: AGREEMENT_BINDING_ACTION,
    carrierOrganizationId: "carrier:acme",
    ratewareVendorId: vendorId,
    rfxEventId: eventId,
    rfxLaneVendorId: offerId,
    marksmanPostId: "loads-post-1",
    marksmanOfferId: "loads-offer-1",
    idempotencyKey: "bind-command-001",
    humanConfirmation: {
      actorId: "sales@heymarksman.com",
      role: "ADMIN",
      confirmedAt: now.toISOString(),
      approvalReference: "loads-agreement:loads-post-1:loads-offer-1",
    },
    ...overrides,
  };
}

function envelope(overrides = {}) {
  const unsigned = {
    contractVersion: AGREEMENT_BINDING_CONTRACT_VERSION,
    requestId: "request-001",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    keyId,
    body: body(overrides),
  };
  return {
    ...unsigned,
    signature: createHmac("sha256", secret).update(stableStringify(unsigned)).digest("hex"),
  };
}

function source(overrides = {}) {
  return {
    id: offerId,
    rfx_event_id: eventId,
    rfx_lane_id: laneId,
    vendor_id: vendorId,
    invitation_status: "awarded",
    award_role: "primary",
    bid_rate: 2111,
    currency: "USD",
    event: { id: eventId, customer_id: customerId, status: "awarded" },
    lane: { id: laneId },
    ...overrides,
  };
}

function row(input, id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
  return { id, created_at: now.toISOString(), updated_at: now.toISOString(), bound_at: now.toISOString(), ...input };
}

function harness(overrides = {}) {
  const rows = [];
  let inserts = 0;
  const service = createAgreementBindingService({
    sharedSecret: secret,
    keyId,
    enabled: true,
    now: () => now,
    findAgreement: async () => source(),
    findExistingByCommand: async (input) => rows.find((candidate) => candidate.metadata?.idempotencyKey === input.idempotencyKey) || null,
    findExistingByLocal: async (input) => rows.find((candidate) => candidate.carrier_organization_id === input.carrierOrganizationId && candidate.marksman_post_id === input.marksmanPostId && candidate.marksman_offer_id === input.marksmanOfferId) || null,
    findExistingByRateware: async (input) => rows.find((candidate) => candidate.carrier_organization_id === input.carrierOrganizationId && candidate.rfx_lane_vendor_id === input.rfxLaneVendorId) || null,
    insertBinding: async (input) => {
      inserts += 1;
      const inserted = row(input);
      rows.push(inserted);
      return inserted;
    },
    ...overrides,
  });
  return { service, rows, get inserts() { return inserts; } };
}

test("binds an awarded agreement once and records the human approval", async () => {
  const h = harness();
  const result = await h.service.bind(envelope());
  assert.equal(result.status, "bound");
  assert.equal(result.externalExecution, false);
  assert.equal(result.authorizationEvidence.humanConfirmation.actorId, "sales@heymarksman.com");
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].metadata.externalExecution, false);
  assert.equal(h.rows[0].metadata.sourceAgreement.bidRate, 2111);
});

test("verifies the HMAC envelope before reading or writing data", async () => {
  let reads = 0;
  const h = harness({ findAgreement: async () => { reads += 1; return source(); } });
  const tampered = envelope();
  tampered.body.marksmanPostId = "loads-post-tampered";
  await assert.rejects(() => h.service.bind(tampered), (error) => error.code === "INVALID_INTERNAL_SIGNATURE");
  assert.equal(reads, 0);
  assert.equal(h.inserts, 0);
});

test("stays disabled until the dedicated environment flag is enabled", async () => {
  let reads = 0;
  const h = harness({
    enabled: false,
    findAgreement: async () => { reads += 1; return source(); },
  });
  await assert.rejects(() => h.service.bind(envelope()), (error) => error.code === "AGREEMENT_BINDING_DISABLED");
  assert.equal(reads, 0);
  assert.equal(h.inserts, 0);
});

test("replays the same command without a second insert", async () => {
  const h = harness();
  const request = envelope();
  assert.equal((await h.service.bind(request)).status, "bound");
  const replay = await h.service.bind(request);
  assert.equal(replay.status, "already_bound");
  assert.equal(replay.idempotent, true);
  assert.equal(h.inserts, 1);
});

test("rejects reuse of an idempotency key with a changed payload", async () => {
  const h = harness();
  await h.service.bind(envelope());
  const changed = envelope({ marksmanOfferId: "loads-offer-2" });
  await assert.rejects(() => h.service.bind(changed), (error) => error instanceof AgreementBindingError && error.code === "AGREEMENT_BINDING_CONFLICT");
  assert.equal(h.inserts, 1);
});

test("does not bind an invitation that has only been quoted", async () => {
  let reads = 0;
  const h = harness({
    findAgreement: async () => {
      reads += 1;
      return source({ invitation_status: "quoted", award_role: null });
    },
  });
  await assert.rejects(() => h.service.bind(envelope()), (error) => error.code === "AGREEMENT_NOT_CONFIRMED");
  assert.equal(reads, 1);
  assert.equal(h.inserts, 0);
});

test("rejects a vendor or event mismatch before writing", async () => {
  const h = harness({ findAgreement: async () => source({ vendor_id: "66666666-6666-4666-8666-666666666666" }) });
  await assert.rejects(() => h.service.bind(envelope()), (error) => error.code === "AGREEMENT_BINDING_MISMATCH");
  assert.equal(h.inserts, 0);
});

test("requires an explicit ADMIN or OPERATOR confirmation", async () => {
  const h = harness();
  const request = envelope({ humanConfirmation: { actorId: "sales@heymarksman.com", role: "VIEWER", confirmedAt: now.toISOString(), approvalReference: "approval-1" } });
  await assert.rejects(() => h.service.bind(request), (error) => error.code === "APPROVAL_REQUIRED");
  assert.equal(h.inserts, 0);
});

test("never overwrites a conflicting local or revoked bridge", async () => {
  const existing = row({
    carrier_organization_id: "carrier:acme",
    rateware_vendor_id: vendorId,
    rfx_event_id: eventId,
    rfx_lane_vendor_id: "77777777-7777-4777-8777-777777777777",
    marksman_post_id: "loads-post-1",
    marksman_offer_id: "loads-offer-1",
    status: "active",
    metadata: { idempotencyKey: "old-command", requestFingerprint: "old" },
  });
  const h = harness({ findExistingByLocal: async () => existing });
  await assert.rejects(() => h.service.bind(envelope()), (error) => error.code === "AGREEMENT_BINDING_CONFLICT");
  assert.equal(h.inserts, 0);
});

test("does not replay a command whose bridge was revoked", async () => {
  const revoked = row({
    carrier_organization_id: "carrier:acme",
    rateware_vendor_id: vendorId,
    rfx_event_id: eventId,
    rfx_lane_vendor_id: offerId,
    marksman_post_id: "loads-post-1",
    marksman_offer_id: "loads-offer-1",
    status: "revoked",
    metadata: { idempotencyKey: "bind-command-001", requestFingerprint: "placeholder" },
  });
  const h = harness({ findExistingByCommand: async () => revoked });
  await assert.rejects(() => h.service.bind(envelope()), (error) => error.code === "AGREEMENT_BINDING_CONFLICT");
  assert.equal(h.inserts, 0);
});

test("reconciles a unique-constraint race instead of retrying an insert", async () => {
  let rows = [];
  const raced = createAgreementBindingService({
    sharedSecret: secret,
    keyId,
    enabled: true,
    now: () => now,
    findAgreement: async () => source(),
    findExistingByCommand: async (input) => rows.find((candidate) => candidate.metadata?.idempotencyKey === input.idempotencyKey) || null,
    findExistingByLocal: async (input) => rows.find((candidate) => candidate.marksman_post_id === input.marksmanPostId && candidate.marksman_offer_id === input.marksmanOfferId) || null,
    findExistingByRateware: async (input) => rows.find((candidate) => candidate.rfx_lane_vendor_id === input.rfxLaneVendorId) || null,
    insertBinding: async (input) => {
      rows = [row(input)];
      const error = new Error("duplicate key");
      error.code = "23505";
      error.constraint = "marksman_loads_binding_local_key_unique";
      throw error;
    },
  });
  const result = await raced.bind(envelope());
  assert.equal(result.status, "already_bound");
  assert.equal(result.reconciledAfterConflict, true);
});
