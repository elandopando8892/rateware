import {
  payloadFingerprint,
  stableStringify,
} from "../supabase/functions/_shared/marksman-loads-bid-contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SECRET = "0123456789abcdef0123456789abcdef";

async function signedRequest(action: "resolve_and_submit_bid_canary" | "resolve_and_submit_bid") {
  const payload = { action: "submit_bid", bid_rate: 2111, currency: "USD" };
  const issuedAt = new Date();
  const unsigned = {
    contractVersion: "rateware-internal-request.v1",
    issuer: "marksman-loads",
    audience: "rateware",
    keyId: "runtime-key",
    requestId: "55555555-5555-4555-8555-555555555555",
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 60_000).toISOString(),
    body: {
      action,
      organizationId: "carrier-org",
      vendorId: "22222222-2222-4222-8222-222222222222",
      laneId: "33333333-3333-4333-8333-333333333333",
      eventId: "44444444-4444-4444-8444-444444444444",
      preparedReceiptId: "prepared-runtime",
      quoteWorkspaceRevision: 7,
      payloadFingerprint: await payloadFingerprint(payload),
      payload,
      humanConfirmation: { actorId: "operator-01", role: "OPERATOR", confirmedAt: issuedAt.toISOString() },
    },
  };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(stableStringify(unsigned))));
  const signature = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return { ...unsigned, signature };
}

Deno.env.set("MARKSMAN_LOADS_BID_CONNECTOR_SECRET", SECRET);
Deno.env.set("MARKSMAN_LOADS_BID_CONNECTOR_KEY_ID", "runtime-key");
Deno.env.delete("MARKSMAN_LOADS_BID_CONNECTOR_ENABLED");
Deno.env.delete("MARKSMAN_LOADS_BID_CONNECTOR_CANARY_ENABLED");

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const endpoint = await import("../supabase/functions/rfx-internal-bid-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

Deno.test("private endpoint exposes no browser preflight", async () => {
  const result = await endpoint.createRfxInternalBidHandler(new Request("https://rateware.test/rfx-internal-bid-api", { method: "OPTIONS" }));
  assert(result.status === 405, "OPTIONS must not open a browser route");
  assert(!result.headers.get("access-control-allow-origin"), "private endpoint must expose no CORS origin");
});

Deno.test("valid signed canary remains disabled without exact opt-in", async () => {
  const result = await endpoint.createRfxInternalBidHandler(new Request("https://rateware.test/rfx-internal-bid-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await signedRequest("resolve_and_submit_bid_canary")),
  }));
  const body = await result.json();
  assert(result.status === 503 && body.code === "CANARY_EXECUTION_DISABLED", "canary must fail closed before any database access");
});

Deno.test("valid signed live request remains disabled without exact opt-in", async () => {
  const result = await endpoint.createRfxInternalBidHandler(new Request("https://rateware.test/rfx-internal-bid-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await signedRequest("resolve_and_submit_bid")),
  }));
  const body = await result.json();
  assert(result.status === 503 && body.code === "LIVE_EXECUTION_DISABLED", "live bid must fail closed before any database access");
});
