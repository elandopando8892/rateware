import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  SUBMIT_BID_CONTRACT_VERSION,
  SUBMIT_BID_FIELDS,
  fingerprint,
  stableStringify,
} from "../supabase/functions/rfx-private-resolver/resolver-core.mjs";

const FIXTURE = Object.freeze({
  organizationId: "10000000-0000-4000-8000-000000000001",
  vendorId: "20000000-0000-4000-8000-000000000001",
  eventId: "30000000-0000-4000-8000-000000000001",
  laneId: "40000000-0000-4000-8000-000000000001",
});

const required = (name, env = process.env) => {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export async function signedCanaryEnvelope({ secret, keyId, action = "resolve_and_submit_bid_canary", requestId = randomUUID(), now = new Date() }) {
  const payload = {
    action: "submit_bid",
    bid_rate: 2100,
    currency: "USD",
    weekly_capacity: 1,
    transit_days: 1,
    notes: "Synthetic canary; no bid submission",
  };
  const evidenceSidecar = {
    contractVersion: "marksman-loads.rateware-handoff-evidence.v1",
    acceptedByCurrentSubmitBid: false,
    operationalFit: { answered: 6, total: 6 },
    evidenceClass: "STAGING_FIXTURE_ONLY",
  };
  const payloadFingerprint = await fingerprint(payload);
  const evidenceFingerprint = await fingerprint(evidenceSidecar);
  const handoffFingerprint = await fingerprint({
    targetContract: SUBMIT_BID_CONTRACT_VERSION,
    submitBidFingerprint: payloadFingerprint,
    evidenceFingerprint,
  });
  const envelope = {
    contractVersion: "rateware-internal-request.v1",
    issuer: "marksman-loads",
    audience: "rateware",
    keyId,
    requestId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    body: {
      action,
      ...FIXTURE,
      preparedReceiptId: `staging-${requestId}`,
      quoteWorkspaceRevision: 1,
      targetContract: SUBMIT_BID_CONTRACT_VERSION,
      acceptedFields: [...SUBMIT_BID_FIELDS],
      payloadFingerprint,
      payload,
      evidenceFingerprint,
      handoffFingerprint,
      evidenceSidecar,
      humanConfirmation: { actorId: "staging-authorized-operator", role: "ADMIN", confirmedAt: now.toISOString() },
    },
  };
  return { ...envelope, signature: createHmac("sha256", secret).update(stableStringify(envelope)).digest("hex") };
}

async function post(url, envelope, fetchImpl = fetch) {
  const response = await fetchImpl(`${url.replace(/\/$/, "")}/functions/v1/rfx-private-resolver`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  return { status: response.status, body: await response.json() };
}

export async function runStagingCanary({ env = process.env, fetchImpl = fetch, expectDisabled = false } = {}) {
  const url = required("MARKSMAN_STAGING_SUPABASE_URL", env);
  const secret = required("RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET", env);
  const keyId = required("RATEWARE_PRIVATE_RESOLVER_KEY_ID", env);
  const envelope = await signedCanaryEnvelope({ secret, keyId });
  const first = await post(url, envelope, fetchImpl);

  if (expectDisabled) {
    assert.equal(first.status, 403);
    assert.equal(first.body.code, "CANARY_EXECUTION_DISABLED");
    return { status: "PASS", mode: "KILL_SWITCH", httpStatus: first.status, code: first.body.code, externalExecution: false };
  }

  assert.equal(first.status, 200);
  assert.equal(first.body.status, "resolution_canary_passed");
  assert.equal(first.body.privateResolution?.status, "matched");
  assert.equal(first.body.privateResolution?.vendorId, FIXTURE.vendorId);
  assert.equal(first.body.privateResolution?.laneId, FIXTURE.laneId);
  assert.equal(first.body.privateResolution?.eventId, FIXTURE.eventId);
  assert.equal(first.body.externalExecution, false);
  assert.equal(first.body.ratewareSubmission, false);
  assert.equal(first.body.credentialExposure, false);
  assert.equal(first.body.ledgerEvidence?.persisted, true);
  assert.equal(first.body.ledgerEvidence?.requestBodyStored, false);
  assert.equal(first.body.ledgerEvidence?.credentialMaterialStored, false);

  const replay = await post(url, envelope, fetchImpl);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.ledgerEvidence?.duplicate, true);
  assert.equal(replay.body.privateResolution?.resolverRef, first.body.privateResolution?.resolverRef);

  const live = await signedCanaryEnvelope({ secret, keyId, action: "resolve_and_submit_bid" });
  const blocked = await post(url, live, fetchImpl);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "LIVE_EXECUTION_DISABLED");

  const tampered = await signedCanaryEnvelope({ secret, keyId });
  tampered.body.payload.bid_rate = 9999;
  const rejected = await post(url, tampered, fetchImpl);
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.code, "INVALID_INTERNAL_SIGNATURE");

  return {
    status: "PASS",
    mode: "REMOTE_FIXTURE_CANARY",
    match: "one_synthetic_invitation",
    persistedReplay: true,
    liveExecution: "blocked",
    tampering: "blocked",
    externalExecution: false,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runStagingCanary({ expectDisabled: process.argv.includes("--expect-disabled") });
  console.log(JSON.stringify(result, null, 2));
}
