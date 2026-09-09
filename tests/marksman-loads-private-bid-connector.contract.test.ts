import {
  MarksmanLoadsBidContractError,
  canBindBidCommandReadback,
  buildQuoteOperationReceiptRow,
  classifyBidCommandReplay,
  payloadFingerprint,
  reconcileBidPayload,
  sanitizePrivateConnectorValue,
  stableStringify,
  verifyMarksmanLoadsBidRequest,
} from "../supabase/functions/_shared/marksman-loads-bid-contract.ts";
import {
  decryptRfxInvitationToken,
  encryptRfxInvitationToken,
  hashRfxInvitationToken,
} from "../supabase/functions/_shared/rfx-invitation-token.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-08-31T12:00:30.000Z");

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sign(envelope: Record<string, unknown>) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(stableStringify(envelope)))));
}

async function fixture(overrides: Record<string, unknown> = {}) {
  const payload = { action: "submit_bid", bid_rate: 2111, currency: "USD" };
  const unsigned = {
    contractVersion: "rateware-internal-request.v1",
    issuer: "marksman-loads",
    audience: "rateware",
    keyId: "key-2026-08",
    requestId: "11111111-1111-4111-8111-111111111111",
    issuedAt: "2026-08-31T12:00:00.000Z",
    expiresAt: "2026-08-31T12:01:00.000Z",
    body: {
      action: "resolve_and_submit_bid_canary",
      organizationId: "carrier-org",
      vendorId: "22222222-2222-4222-8222-222222222222",
      laneId: "33333333-3333-4333-8333-333333333333",
      eventId: "44444444-4444-4444-8444-444444444444",
      preparedReceiptId: "prepared-01",
      quoteWorkspaceRevision: 7,
      payloadFingerprint: await payloadFingerprint(payload),
      payload,
      humanConfirmation: {
        actorId: "user-01",
        role: "ADMIN",
        confirmedAt: "2026-08-31T12:00:00.000Z",
      },
    },
    ...overrides,
  };
  return { ...unsigned, signature: await sign(unsigned) };
}

async function liveFixture(overrides: Record<string, unknown> = {}) {
  const payload = { action: "submit_bid", bid_rate: 2111, currency: "USD" };
  const payloadHash = await payloadFingerprint(payload);
  const body = {
    action: "resolve_and_submit_bid",
    organizationId: "carrier-org",
    vendorId: "22222222-2222-4222-8222-222222222222",
    laneId: "33333333-3333-4333-8333-333333333333",
    eventId: "44444444-4444-4444-8444-444444444444",
    invitationId: "99999999-9999-4999-8999-999999999999",
    preparedReceiptId: "prepared-01",
    quoteWorkspaceRevision: 7,
    payloadFingerprint: payloadHash,
    payload,
    humanConfirmation: { actorId: "user-01", role: "ADMIN", confirmedAt: "2026-08-31T12:00:00.000Z" },
  };
  const operationId = await payloadFingerprint({
    effect: "quote", organizationId: body.organizationId, vendorId: body.vendorId,
    eventId: body.eventId, laneId: body.laneId, invitationId: body.invitationId,
    preparedReceiptId: body.preparedReceiptId, payloadFingerprint: body.payloadFingerprint,
  });
  return fixture({ body: { ...body, operationId }, ...overrides });
}

Deno.test("private connector accepts the cross-runtime HMAC contract vector", async () => {
  const envelope = await fixture();
  assert(envelope.signature === "59957da6eb9ad6daa48cf982d19156ba999052b7d18ba6f5d66fc27ced552fbb", "signature must match the MARKSMAN Loads Node.js vector");
  const verified = await verifyMarksmanLoadsBidRequest(envelope, {
    sharedSecret: SECRET,
    expectedKeyId: "key-2026-08",
    now: NOW,
  });
  assert(verified.body.payloadFingerprint === "97af068eaa8c8d1e7ba1811f9c28b04b6d7e8b1fa813dcf1ec1e4812192b6190", "payload fingerprint must match the Node.js vector");
  assert(/^[0-9a-f]{64}$/.test(verified.operationKey), "logical prepared quote must receive a stable operation key");
  assert(verified.body.humanConfirmation.role === "ADMIN", "authorized role should survive validation");
});

Deno.test("operation key is stable across request UUID and envelope timestamp retries", async () => {
  const first = await liveFixture();
  const second = await liveFixture({
    requestId: "66666666-6666-4666-8666-666666666666",
    issuedAt: "2026-08-31T12:00:10.000Z",
    expiresAt: "2026-08-31T12:01:10.000Z",
  });
  const verifiedFirst = await verifyMarksmanLoadsBidRequest(first, { sharedSecret: SECRET, expectedKeyId: "key-2026-08", now: NOW });
  const verifiedSecond = await verifyMarksmanLoadsBidRequest(second, { sharedSecret: SECRET, expectedKeyId: "key-2026-08", now: NOW });
  assert(first.signature === "9a4afa292c6c68933e1a0bc751b07f16cfdaea012e213709a6e4225012521878", "live signature must match the MARKSMAN Loads Node.js vector");
  assert(verifiedFirst.operationKey === "09827e5b3150849d4a74f357d1d1dc099e7f06b6c53b4251c63c1ba976c1dc48", "operation id must match the MARKSMAN Loads Node.js vector");
  assert(verifiedFirst.requestFingerprint !== verifiedSecond.requestFingerprint, "different envelopes should retain different request fingerprints");
  assert(verifiedFirst.operationKey === verifiedSecond.operationKey, "same prepared quote must retain one operation identity across transport retries");
  assert(verifiedFirst.operationKey === verifiedFirst.body.operationId, "Rateware must retain the operation identity signed by MARKSMAN Loads");
  assert(verifiedFirst.body.invitationId === "99999999-9999-4999-8999-999999999999", "live execution must remain bound to the canary invitation");
});

Deno.test("live quote rejects missing or mismatched MARKSMAN Loads operation authority", async () => {
  const missing = await fixture({body:{...(await liveFixture()).body,operationId:undefined}});
  await assertRejects(missing,"INVALID_INTERNAL_OPERATION");
  const mismatched = await fixture({body:{...(await liveFixture()).body,operationId:"a".repeat(64)}});
  await assertRejects(mismatched,"OPERATION_ID_MISMATCH");
  const noInvitation = await fixture({body:{...(await liveFixture()).body,invitationId:undefined}});
  await assertRejects(noInvitation,"INVALID_INTERNAL_REQUEST");
});

Deno.test("private connector rejects tampering, expiry, wrong key and payload credentials", async () => {
  const tampered = await fixture();
  (tampered.body as Record<string, unknown>).quoteWorkspaceRevision = 8;
  await assertRejects(tampered, "INVALID_INTERNAL_SIGNATURE");

  const expired = await fixture({ expiresAt: "2026-08-31T12:00:20.000Z" });
  await assertRejects(expired, "INTERNAL_AUTHORIZATION_EXPIRED");

  const wrongKey = await fixture({ keyId: "retired-key" });
  await assertRejects(wrongKey, "INVALID_INTERNAL_KEY");

  const withCredential = await fixture();
  const body = withCredential.body as Record<string, unknown>;
  body.payload = { ...(body.payload as Record<string, unknown>), token: "must-not-cross" };
  body.payloadFingerprint = await payloadFingerprint(body.payload);
  const { signature: _oldSignature, ...unsigned } = withCredential;
  withCredential.signature = await sign(unsigned);
  await assertRejects(withCredential, "CREDENTIAL_EXPOSURE_BLOCKED");
});

Deno.test("private connector requires signed ADMIN or OPERATOR human confirmation", async () => {
  const envelope = await fixture();
  const body = envelope.body as Record<string, unknown>;
  body.humanConfirmation = { actorId: "viewer-01", role: "VIEWER", confirmedAt: "2026-08-31T12:00:00.000Z" };
  const { signature: _oldSignature, ...unsigned } = envelope;
  envelope.signature = await sign(unsigned);
  await assertRejects(envelope, "HUMAN_CONFIRMATION_REQUIRED");
});

Deno.test("private connector rejects stale confirmation and unsupported payload fields", async () => {
  const stale = await fixture();
  const staleBody = stale.body as Record<string, unknown>;
  staleBody.humanConfirmation = { actorId: "operator-01", role: "OPERATOR", confirmedAt: "2026-08-31T11:54:00.000Z" };
  const { signature: _staleSignature, ...staleUnsigned } = stale;
  stale.signature = await sign(staleUnsigned);
  await assertRejects(stale, "HUMAN_CONFIRMATION_REQUIRED");

  const expanded = await fixture();
  const expandedBody = expanded.body as Record<string, unknown>;
  expandedBody.payload = { ...(expandedBody.payload as Record<string, unknown>), webhook_url: "https://unexpected.test" };
  expandedBody.payloadFingerprint = await payloadFingerprint(expandedBody.payload);
  const { signature: _expandedSignature, ...expandedUnsigned } = expanded;
  expanded.signature = await sign(expandedUnsigned);
  await assertRejects(expanded, "INVALID_INTERNAL_PAYLOAD");
});

Deno.test("sanitizer recursively removes credential-shaped data", () => {
  const sanitized = sanitizePrivateConnectorValue({
    row: { id: "row-1", invitation_token: "secret", nested: { signature: "sig", amount: 2111 } },
    authorization: "Bearer private",
    apiKey: "private",
    authorizationEvidence: { algorithm: "HMAC-SHA256", keyId: "active-key", signature: "never" },
  });
  const encoded = JSON.stringify(sanitized);
  assert(!/secret|Bearer private|invitation_token|signature|apiKey/.test(encoded), "sanitized output must contain no credential-shaped fields or values");
  assert(encoded.includes("2111"), "non-secret result data should remain");
  assert(encoded.includes("HMAC-SHA256") && encoded.includes("active-key"), "non-secret authorization evidence should remain auditable");
});

Deno.test("bid reconciliation requires exact signed fields and permits unrelated server fields", () => {
  const payload = { action: "submit_bid", bid_rate: 2111, currency: "USD", weekly_capacity: 3, equipment_available: true };
  const matching = reconcileBidPayload(payload, { bid_rate: 2111, currency: "USD", weekly_capacity: 3, equipment_available: true, bid_rate_staging_id: "stage-1" });
  assert(matching.matches, "matching bid fields should reconcile");
  const mismatch = reconcileBidPayload(payload, { bid_rate: 2050, currency: "USD", weekly_capacity: 3, equipment_available: true });
  assert(!mismatch.matches && mismatch.mismatches[0].field === "bid_rate", "changed carrier economics must not reconcile");
});

Deno.test("idempotency state machine resumes only a stale pre-mutation receipt", () => {
  const fingerprint = "a".repeat(64);
  const now = Date.parse("2026-08-31T12:10:00.000Z");
  const recent = "2026-08-31T12:09:30.000Z";
  const stale = "2026-08-31T12:00:00.000Z";
  assert(classifyBidCommandReplay({ request_fingerprint: fingerprint, status: "received", updated_at: recent }, fingerprint, now, 120_000) === "in_progress", "fresh receipt must not run twice");
  assert(classifyBidCommandReplay({ request_fingerprint: fingerprint, status: "received", updated_at: stale }, fingerprint, now, 120_000) === "resume_before_mutation", "only stale received may resume before mutation");
  assert(classifyBidCommandReplay({ request_fingerprint: fingerprint, status: "executing", updated_at: stale }, fingerprint, now, 120_000) === "reconcile_only", "stale executing must never resubmit");
  assert(classifyBidCommandReplay({ request_fingerprint: fingerprint, status: "submitted", updated_at: recent }, fingerprint, now, 120_000) === "reconcile_only", "submitted must reconcile");
  assert(classifyBidCommandReplay({ request_fingerprint: "b".repeat(64), status: "reconciled", updated_at: recent }, fingerprint, now, 120_000) === "idempotency_conflict", "request id reuse with changed payload must conflict");
  assert(classifyBidCommandReplay({ request_fingerprint: "b".repeat(64), status: "reconciled", updated_at: recent }, fingerprint, now, 120_000, true) === "replay", "same logical quote under a new request id must replay instead of submit again");
});

Deno.test("only a command with a persisted returned canonical result may mint readback evidence", () => {
  const returned = { status:"submitted", external_execution:true, rateware_submission:true, result:{canonicalResult:{row:{id:"bid-1"}}} };
  assert(canBindBidCommandReadback(returned), "persisted canonical return should be eligible for operation evidence");
  for (const command of [
    { ...returned, status:"executing" },
    { ...returned, status:"reconcile_required" },
    { ...returned, result:{} },
    { ...returned, external_execution:false },
    { ...returned, rateware_submission:false },
  ]) assert(!canBindBidCommandReadback(command), "state coincidence without a returned canonical result cannot establish causation");
});

Deno.test("quote operation receipt binds the returned command, invitation, payload and staging row", async () => {
  const valid=await liveFixture();
  const verified=await verifyMarksmanLoadsBidRequest(valid,{sharedSecret:SECRET,expectedKeyId:"key-2026-08",now:NOW});
  const command={id:"77777777-7777-4777-8777-777777777777",status:"submitted",external_execution:true,rateware_submission:true,result:{canonicalResult:{row:{id:"bid-1"}}}};
  const context={canonicalOrganizationId:"88888888-8888-4888-8888-888888888888",workspaceOrganizationId:"sales@heymarksman.com",invitation:{id:"99999999-9999-4999-8999-999999999999"}};
  const reconciliation={status:"reconciled",payloadMatches:true,rateStagingObserved:true,row:{bid_rate_staging_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}};
  const row=buildQuoteOperationReceiptRow({verified,context,command,reconciliation,committedAt:"2026-08-31T12:00:31.000Z"});
  assert(row.operation_id===verified.operationKey&&row.payload_fingerprint===verified.body.payloadFingerprint,"receipt must bind operation and payload");
  assert(row.record_id===context.invitation.id&&row.staging_record_id==="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","receipt must bind invitation and staging row");
  for(const invalid of [
    {...reconciliation,status:"reconcile_required"},
    {...reconciliation,payloadMatches:false},
    {...reconciliation,rateStagingObserved:false},
    {...reconciliation,row:{}},
  ]){let code="";try{buildQuoteOperationReceiptRow({verified,context,command,reconciliation:invalid,committedAt:"2026-08-31T12:00:31.000Z"});}catch(error){code=(error as {code?:string}).code||"";}assert(code==="OPERATION_RECEIPT_INCOMPLETE","incomplete reconciliation must not mint evidence");}
});

Deno.test("invitation credential crypto remains backward-compatible and keyed", async () => {
  const token = "private-invitation-token";
  const encrypted = await encryptRfxInvitationToken(token, SECRET);
  assert(encrypted.startsWith("v1:"), "encrypted invitation must retain the v1 envelope");
  assert(await decryptRfxInvitationToken(encrypted, SECRET) === token, "shared crypto must round-trip invitation tokens");
  assert(await hashRfxInvitationToken(token) === "rFHIqiUa2AQcvg1q3PI8FlIo5hF6wZREvEbBPvEr5Cw=", "invitation lookup digest must remain stable");
  let rejected = false;
  try { await decryptRfxInvitationToken(encrypted, `${SECRET}-wrong`); } catch { rejected = true; }
  assert(rejected, "a different encryption secret must fail closed");
});

async function assertRejects(envelope: Record<string, unknown>, expectedCode: string) {
  let caught: unknown = null;
  try {
    await verifyMarksmanLoadsBidRequest(envelope, { sharedSecret: SECRET, expectedKeyId: "key-2026-08", now: NOW });
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof MarksmanLoadsBidContractError, `expected contract error ${expectedCode}`);
  assert(caught.code === expectedCode, `expected ${expectedCode}, received ${caught.code}`);
}

Deno.test("endpoint source keeps execution private, disabled and delegated to canonical submit_bid", async () => {
  const source = await Deno.readTextFile(new URL("../supabase/functions/rfx-internal-bid-api/index.ts", import.meta.url));
  const migration = await Deno.readTextFile(new URL("../supabase/migrations/20260831213000_marksman_loads_private_bid_commands.sql", import.meta.url));
  const receiptMigration = await Deno.readTextFile(new URL("../supabase/migrations/20260907090000_marksman_loads_operation_receipts.sql", import.meta.url));
  assert(source.includes('=== "true"'), "feature flags must require exact true opt-in");
  assert(source.includes('dependencies.canaryEnabled ?? CANARY_ENABLED') && source.includes('dependencies.liveEnabled ?? LIVE_ENABLED') && source.includes('canaryRequest ? canaryEnabled : liveEnabled'), "both execution modes must fail closed behind independent flags");
  assert(source.includes('/functions/v1/rfx-bid-api'), "connector must delegate to canonical Bid Room API");
  assert(source.includes('action: "submit_bid", token'), "invitation credential should be attached only inside Rateware canonical invocation");
  assert(source.includes('external_organization_links') && source.includes('workspace_registry') && source.includes('vendors'), "resolution must traverse reviewed tenant and vendor links");
  assert(source.includes('RECONCILIATION_REQUIRED') && source.includes('no automatic retry'), "uncertain execution must stop for reconciliation");
  assert(!source.includes("corsHeaders"), "private endpoint must not advertise browser CORS");
  assert(migration.includes("enable row level security"), "command ledger must enable RLS");
  assert(migration.includes("revoke all") && migration.includes("service_role"), "command ledger must be service-role only");
  assert(migration.includes("unique (provider, operation_key)"), "prepared quote identity must remain idempotent even if request UUID changes");
  assert(migration.includes("unique (provider, external_organization_id, prepared_receipt_id)"), "one preparation receipt must never authorize two different payloads");
  assert(!/request_signature|invitation_token/.test(migration), "command ledger must not persist request signatures or invitation tokens");
  assert(source.includes('persistQuoteOperationReceipt') && source.includes('canBindBidCommandReadback'), "quote completion must create operation evidence only after a returned canonical result");
  assert(receiptMigration.includes("enable row level security") && receiptMigration.includes("revoke all"), "operation evidence must remain service-role only");
  assert(receiptMigration.includes("unique (provider, effect, operation_id)"), "each effect operation must have one durable receipt");
  assert(!/request_signature|invitation_token|quote_payload/.test(receiptMigration), "receipt table must remain credential and payload minimized");
});
