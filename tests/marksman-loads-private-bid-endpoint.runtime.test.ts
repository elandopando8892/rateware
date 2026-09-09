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
  const payloadHash = await payloadFingerprint(payload);
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
      payloadFingerprint: payloadHash,
      payload,
      humanConfirmation: { actorId: "operator-01", role: "OPERATOR", confirmedAt: issuedAt.toISOString() },
      ...(action === "resolve_and_submit_bid" ? {
        invitationId: "99999999-9999-4999-8999-999999999999",
        operationId: await payloadFingerprint({
          effect: "quote", organizationId: "carrier-org",
          vendorId: "22222222-2222-4222-8222-222222222222",
          eventId: "44444444-4444-4444-8444-444444444444",
          laneId: "33333333-3333-4333-8333-333333333333",
          invitationId: "99999999-9999-4999-8999-999999999999",
          preparedReceiptId: "prepared-runtime", payloadFingerprint: payloadHash,
        }),
      } : {}),
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

class Query {
  db: Record<string, Record<string, unknown>[]>;
  name: string;
  filters: Array<(row: Record<string, unknown>) => boolean> = [];
  action = "select";
  values: Record<string, unknown> = {};
  maximum: number | null = null;
  constructor(db: Record<string, Record<string, unknown>[]>, name: string) { this.db = db; this.name = name; }
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
  limit(value: number) { this.maximum = value; return this; }
  insert(values: Record<string, unknown>) { this.action = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>) { this.action = "update"; this.values = values; return this; }
  rows() { const rows = (this.db[this.name] || []).filter((row) => this.filters.every((filter) => filter(row))); return this.maximum == null ? rows : rows.slice(0, this.maximum); }
  execute() {
    if (this.action === "insert") {
      const duplicate = this.name === "marksman_loads_bid_commands"
        ? this.db[this.name].some((row) => row.provider === this.values.provider && (row.request_id === this.values.request_id || row.operation_key === this.values.operation_key || row.prepared_receipt_id === this.values.prepared_receipt_id))
        : this.name === "marksman_loads_operation_receipts"
        ? this.db[this.name].some((row) => row.provider === this.values.provider && row.effect === this.values.effect && row.operation_id === this.values.operation_id)
        : false;
      if (duplicate) return { data: [], error: { code: "23505" } };
      const id = this.name === "marksman_loads_bid_commands" ? "66666666-6666-4666-8666-666666666666" : "77777777-7777-4777-8777-777777777777";
      const row = { id, ...this.values };
      this.db[this.name].push(row);
      return { data: [row], error: null };
    }
    if (this.action === "update") { const rows = this.rows(); rows.forEach((row) => Object.assign(row, this.values)); return { data: rows, error: null }; }
    return { data: this.rows(), error: null };
  }
  async single() { const result = this.execute(); return { data: result.data[0] || null, error: result.error || (result.data.length === 1 ? null : { code: "PGRST116" }) }; }
  async maybeSingle() { const result = this.execute(); return { data: result.data[0] || null, error: result.error || (result.data.length <= 1 ? null : { code: "PGRST116" }) }; }
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(this.execute()).then(resolve, reject); }
}

function liveDatabase() {
  const db: Record<string, Record<string, unknown>[]> = {
    external_organization_links: [{ provider: "marksman_loads", external_organization_id: "carrier-org", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "active", reviewed_at: "2026-09-01T00:00:00Z", reviewed_by_user_id: "reviewer", review_note: "approved" }],
    workspace_registry: [{ organization_id: "sales@heymarksman.com", organization_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    vendors: [{ id: "22222222-2222-4222-8222-222222222222", organization_id: "sales@heymarksman.com", vendor_name: "ACME Trucking", domain: "acme.example", status: "active" }],
    rfx_events: [{ id: "44444444-4444-4444-8444-444444444444", organization_id: "sales@heymarksman.com", rfx_id: "RFX-1", name: "Private test", status: "active" }],
    rfx_lanes: [{ id: "33333333-3333-4333-8333-333333333333", rfx_event_id: "44444444-4444-4444-8444-444444444444", origin: "Laredo, TX", destination: "Dallas, TX", equipment: "Dry Van" }],
    rfx_lane_vendors: [{ id: "99999999-9999-4999-8999-999999999999", vendor_id: "22222222-2222-4222-8222-222222222222", rfx_event_id: "44444444-4444-4444-8444-444444444444", rfx_lane_id: "33333333-3333-4333-8333-333333333333", invitation_status: "viewed", invitation_token: "runtime-token", bid_rate: null, bid_rate_staging_id: null, currency: null }],
    marksman_loads_bid_commands: [],
    marksman_loads_operation_receipts: [],
  };
  return { db, client: { from(name: string) { if (!db[name]) db[name] = []; return new Query(db, name); } } };
}

Deno.test("enabled live quote returns a bound receipt after persisting the submitted command", async () => {
  const store = liveDatabase();
  const signed = await signedRequest("resolve_and_submit_bid");
  const result = await endpoint.createRfxInternalBidHandler(new Request("https://rateware.test/rfx-internal-bid-api", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signed),
  }), {
    liveEnabled: true,
    getClient: () => store.client as never,
    fetchImpl: async (_url: URL | RequestInfo, options?: RequestInit) => {
      const payload = JSON.parse(String(options?.body || "{}"));
      const invitation = store.db.rfx_lane_vendors[0];
      Object.assign(invitation, payload, { invitation_status: "bid_submitted", bid_rate_staging_id: "88888888-8888-4888-8888-888888888888", responded_at: new Date().toISOString() });
      return new Response(JSON.stringify({ row: invitation }), { status: 200 });
    },
  });
  const body = await result.json();
  assert(result.status === 200 && body.status === "reconciled", "live quote must return a reconciled response");
  assert(body.operationReceipt?.operationId === signed.body.operationId, "quote receipt must bind the signed operation");
  assert(store.db.marksman_loads_bid_commands[0]?.status === "reconciled", "command must finish reconciled");
  assert(store.db.marksman_loads_operation_receipts.length === 1, "one quote receipt must be persisted");
});
