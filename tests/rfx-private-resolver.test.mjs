import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PrivateResolverError,
  SUBMIT_BID_CONTRACT_VERSION,
  SUBMIT_BID_FIELDS,
  createMemoryRequestLedger,
  createPrivateResolver,
  fingerprint,
  stableStringify,
} from "../supabase/functions/rfx-private-resolver/resolver-core.mjs";
import { createFileRequestLedger } from "../tools/file-request-ledger.mjs";

const secret = "test-only-rateware-private-resolver-secret";
const keyId = "candidate-key";
const now = () => new Date("2026-09-01T18:00:00.000Z");

async function signedEnvelope(overrides = {}) {
  const payload = overrides.payload || { action: "submit_bid", bid_rate: 2100, currency: "USD", weekly_capacity: 5, transit_days: 2, notes: "MARKSMAN evidence" };
  const evidenceSidecar = overrides.evidenceSidecar || { contractVersion: "marksman-loads.rateware-handoff-evidence.v1", acceptedByCurrentSubmitBid: false, operationalFit: { answered: 6, total: 6 } };
  const payloadFingerprint = await fingerprint(payload);
  const evidenceFingerprint = await fingerprint(evidenceSidecar);
  const handoffFingerprint = await fingerprint({ targetContract: SUBMIT_BID_CONTRACT_VERSION, submitBidFingerprint: payloadFingerprint, evidenceFingerprint });
  const body = {
    action: "resolve_and_submit_bid_canary",
    organizationId: "org-acme",
    vendorId: "vendor-acme-001",
    laneId: "lane-100",
    eventId: "event-1",
    preparedReceiptId: "prepared-1",
    quoteWorkspaceRevision: 2,
    targetContract: SUBMIT_BID_CONTRACT_VERSION,
    acceptedFields: [...SUBMIT_BID_FIELDS],
    payloadFingerprint,
    payload,
    evidenceFingerprint,
    handoffFingerprint,
    evidenceSidecar,
    humanConfirmation: { actorId: "member-1", role: "ADMIN", confirmedAt: now().toISOString() },
    ...overrides.body,
  };
  const envelope = {
    contractVersion: "rateware-internal-request.v1",
    issuer: "marksman-loads",
    audience: "rateware",
    keyId,
    requestId: overrides.requestId || "11111111-1111-4111-8111-111111111111",
    issuedAt: now().toISOString(),
    expiresAt: new Date(now().getTime() + 60_000).toISOString(),
    body,
  };
  return { ...envelope, signature: createHmac("sha256", secret).update(stableStringify(envelope)).digest("hex") };
}

function invitation(overrides = {}) {
  return {
    id: "rlv-private-1",
    vendor_id: "vendor-acme-001",
    rfx_lane_id: "lane-100",
    rfx_event_id: "event-1",
    invitation_status: "viewed",
    rfx_events: { id: "event-1", status: "open", due_date: "2026-09-30T23:59:59.000Z" },
    ...overrides,
  };
}

function resolver(findInvitations = async () => [invitation()]) {
  return createPrivateResolver({ sharedSecret: secret, keyId, canaryEnabled: true, now, findInvitations, requestLedger: createMemoryRequestLedger() });
}

test("resolves one eligible private invitation without returning credentials or writing a bid", async () => {
  let lookup;
  const result = await resolver(async (input) => { lookup = input; return [invitation()]; }).resolve(await signedEnvelope());
  assert.deepEqual(lookup, { vendorId: "vendor-acme-001", laneId: "lane-100", eventId: "event-1", limit: 2 });
  assert.equal(result.status, "resolution_canary_passed");
  assert.equal(result.privateResolution.status, "matched");
  assert.equal(result.privateResolution.evidenceClass, "RATEWARE_PRIVATE_RESOLUTION_CANDIDATE");
  assert.equal(result.externalExecution, false);
  assert.equal(result.ratewareSubmission, false);
  assert.equal(result.credentialExposure, false);
  assert.equal(result.ledgerEvidence.persisted, true);
  assert.equal(result.ledgerEvidence.duplicate, false);
  assert.equal(result.ledgerEvidence.requestBodyStored, false);
  assert.equal(result.ledgerEvidence.credentialMaterialStored, false);
  assert.equal(JSON.stringify(result).includes("invitation_token"), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("rejects tampering and expired signatures before invitation lookup", async () => {
  let calls = 0;
  const candidate = resolver(async () => { calls += 1; return [invitation()]; });
  const envelope = await signedEnvelope();
  await assert.rejects(candidate.resolve({ ...envelope, body: { ...envelope.body, vendorId: "vendor-other" } }), (error) => error.code === "INVALID_INTERNAL_SIGNATURE");
  const expiredUnsigned = { ...envelope, issuedAt: "2026-09-01T17:00:00.000Z", expiresAt: "2026-09-01T17:01:00.000Z" };
  delete expiredUnsigned.signature;
  const expired = { ...expiredUnsigned, signature: createHmac("sha256", secret).update(stableStringify(expiredUnsigned)).digest("hex") };
  await assert.rejects(candidate.resolve(expired), (error) => error.code === "INTERNAL_AUTHORIZATION_EXPIRED");
  assert.equal(calls, 0);
});

test("rejects no match and ambiguous match without converting either to an eligible invitation", async () => {
  await assert.rejects(resolver(async () => []).resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_INVITATION_NOT_FOUND");
  await assert.rejects(resolver(async () => [invitation(), invitation({ id: "rlv-private-2" })]).resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_INVITATION_AMBIGUOUS");
});

test("rejects closed, expired and ineligible invitation states", async () => {
  await assert.rejects(resolver(async () => [invitation({ invitation_status: "archived" })]).resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_INVITATION_INELIGIBLE");
  await assert.rejects(resolver(async () => [invitation({ rfx_events: { status: "closed", due_date: "2026-09-30T23:59:59.000Z" } })]).resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_INVITATION_INELIGIBLE");
  await assert.rejects(resolver(async () => [invitation({ rfx_events: { status: "open", due_date: "2026-08-31T23:59:59.000Z" } })]).resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_INVITATION_EXPIRED");
});

test("fails closed on live execution and does not query Rateware", async () => {
  let calls = 0;
  const candidate = resolver(async () => { calls += 1; return [invitation()]; });
  await assert.rejects(candidate.resolve(await signedEnvelope({ body: { action: "resolve_and_submit_bid" } })), (error) => error.code === "LIVE_EXECUTION_DISABLED" && error.status === 403);
  assert.equal(calls, 0);
});

test("rejects payload, evidence and handoff drift independently", async () => {
  const original = await signedEnvelope();
  const candidate = resolver();
  const resign = (body) => {
    const unsigned = { ...original, body };
    delete unsigned.signature;
    return { ...unsigned, signature: createHmac("sha256", secret).update(stableStringify(unsigned)).digest("hex") };
  };
  await assert.rejects(candidate.resolve(resign({ ...original.body, payloadFingerprint: "0".repeat(64) })), (error) => error.code === "PAYLOAD_FINGERPRINT_MISMATCH");
  await assert.rejects(candidate.resolve(resign({ ...original.body, evidenceFingerprint: "0".repeat(64) })), (error) => error.code === "EVIDENCE_FINGERPRINT_MISMATCH");
  await assert.rejects(candidate.resolve(resign({ ...original.body, handoffFingerprint: "0".repeat(64) })), (error) => error.code === "HANDOFF_FINGERPRINT_MISMATCH");
});

test("requires exact current submit_bid fields and preserves the MARKSMAN sidecar boundary", async () => {
  const candidate = resolver();
  const extraPayload = { action: "submit_bid", bid_rate: 2100, commercial_model: "fee_plus" };
  await assert.rejects(candidate.resolve(await signedEnvelope({ payload: extraPayload })), (error) => error.code === "RATEWARE_CONTRACT_MISMATCH");
  await assert.rejects(candidate.resolve(await signedEnvelope({ evidenceSidecar: { acceptedByCurrentSubmitBid: true } })), (error) => error.code === "EVIDENCE_BOUNDARY_MISMATCH");
});

test("keeps the canary disabled unless explicitly enabled", async () => {
  const candidate = createPrivateResolver({ sharedSecret: secret, keyId, canaryEnabled: false, now, findInvitations: async () => [invitation()], requestLedger: createMemoryRequestLedger() });
  await assert.rejects(candidate.resolve(await signedEnvelope()), (error) => error instanceof PrivateResolverError && error.code === "CANARY_EXECUTION_DISABLED");
});

test("returns the persisted result for an identical retry without a second invitation lookup", async () => {
  let calls = 0;
  const candidate = resolver(async () => { calls += 1; return [invitation()]; });
  const envelope = await signedEnvelope();
  const first = await candidate.resolve(envelope);
  const duplicate = await candidate.resolve(envelope);
  assert.equal(calls, 1);
  assert.equal(duplicate.privateResolution.resolverRef, first.privateResolution.resolverRef);
  assert.equal(duplicate.occurredAt, first.occurredAt);
  assert.equal(duplicate.ledgerEvidence.duplicate, true);
});

test("blocks a re-signed altered body that reuses a completed request identifier", async () => {
  let calls = 0;
  const candidate = resolver(async () => { calls += 1; return [invitation()]; });
  await candidate.resolve(await signedEnvelope());
  const altered = await signedEnvelope({ evidenceSidecar: { contractVersion: "marksman-loads.rateware-handoff-evidence.v1", acceptedByCurrentSubmitBid: false, operationalFit: { answered: 5, total: 6 } } });
  await assert.rejects(candidate.resolve(altered), (error) => error.code === "REQUEST_REPLAY_MISMATCH");
  assert.equal(calls, 1);
});

test("fails closed when an identical request is already processing", async () => {
  let calls = 0;
  const processingLedger = {
    claim: async (input) => ({ claimed: false, mismatch: false, record: { ...input, status: "processing" } }),
    complete: async () => null,
    fail: async () => null,
  };
  const candidate = createPrivateResolver({ sharedSecret: secret, keyId, canaryEnabled: true, now, requestLedger: processingLedger, findInvitations: async () => { calls += 1; return [invitation()]; } });
  await assert.rejects(candidate.resolve(await signedEnvelope()), (error) => error.code === "REQUEST_IN_PROGRESS");
  assert.equal(calls, 0);
});

test("fails closed before invitation lookup when the durable ledger is unavailable", async () => {
  let calls = 0;
  const candidate = createPrivateResolver({ sharedSecret: secret, keyId, canaryEnabled: true, now, findInvitations: async () => { calls += 1; return [invitation()]; } });
  await assert.rejects(candidate.resolve(await signedEnvelope()), (error) => error.code === "PRIVATE_RESOLVER_LEDGER_UNAVAILABLE");
  assert.equal(calls, 0);
});

test("records a terminal failure and does not silently retry the invitation query", async () => {
  let calls = 0;
  const candidate = resolver(async () => { calls += 1; return []; });
  const envelope = await signedEnvelope();
  await assert.rejects(candidate.resolve(envelope), (error) => error.code === "PRIVATE_INVITATION_NOT_FOUND");
  await assert.rejects(candidate.resolve(envelope), (error) => error.code === "PRIVATE_INVITATION_NOT_FOUND" && error.status === 409);
  assert.equal(calls, 1);
});

test("durable response contains hashes but no request body or credential material", async () => {
  const result = await resolver().resolve(await signedEnvelope());
  const serialized = JSON.stringify(result);
  assert.match(result.ledgerEvidence.requestHash, /^[0-9a-f]{64}$/);
  assert.equal(serialized.includes("evidenceSidecar"), false);
  assert.equal(serialized.includes("humanConfirmation"), false);
  assert.equal(/invitation_token|signature|secret/i.test(serialized), false);
});

test("file-backed candidate returns the same result after resolver restart without persisting the body", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rateware-resolver-ledger-"));
  const path = join(directory, "ledger.json");
  let calls = 0;
  const options = () => ({
    sharedSecret: secret,
    keyId,
    canaryEnabled: true,
    now,
    requestLedger: createFileRequestLedger(path),
    findInvitations: async () => { calls += 1; return [invitation()]; },
  });
  try {
    const envelope = await signedEnvelope();
    const first = await createPrivateResolver(options()).resolve(envelope);
    const duplicate = await createPrivateResolver(options()).resolve(envelope);
    const stored = await readFile(path, "utf8");
    assert.equal(calls, 1);
    assert.equal(duplicate.privateResolution.resolverRef, first.privateResolution.resolverRef);
    assert.equal(duplicate.ledgerEvidence.duplicate, true);
    assert.equal(stored.includes("evidenceSidecar"), false);
    assert.equal(stored.includes("humanConfirmation"), false);
    assert.equal(/invitation_token|signature|secret/i.test(stored), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unapplied migration exposes only service-role RPCs and no request-body columns", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260901193000_rfx_private_resolver_request_ledger.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.match(sql, /claim_rfx_private_resolver_request/i);
  assert.match(sql, /complete_rfx_private_resolver_request/i);
  assert.match(sql, /fail_rfx_private_resolver_request/i);
  assert.doesNotMatch(sql, /\n\s*(request_body|signature|invitation_token|operational_fit|bid_rate)\s+/i);
});

test("health migration exposes aggregate service-role evidence without adding a retention policy", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260901230000_rfx_private_resolver_ledger_health.sql", import.meta.url), "utf8");
  assert.match(sql, /get_rfx_private_resolver_ledger_health/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /requestBodyStored'[\s\S]+false/i);
  assert.match(sql, /credentialMaterialStored'[\s\S]+false/i);
  assert.doesNotMatch(sql, /delete\s+from|truncate|drop\s+table/i);
});
