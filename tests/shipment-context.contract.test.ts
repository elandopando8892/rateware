import { SERVICE_DESK_ORIGIN, SHIPMENT_CONTEXT_FIELDS, createShipmentContextHandler } from "../supabase/functions/shipment-context-api/handler.ts";
import { IdentityContractError } from "../supabase/functions/_shared/identity-contract.mjs";

function assert(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
type Row = Record<string, any>;

function row(n: number): Row {
  return {
    event_id: id(n), event_type: "shipment.created", occurred_at: new Date(Date.UTC(2026, 8, 30 - n, 12)).toISOString(),
    rfx_event_id: id(100 + n), rfx_reference: `RFX-${n}`, rfx_lane_id: id(200 + n),
    instruction_letter_id: `IL-${n}`, instruction_letter_revision: 2,
    execution_receipt_id: `RECEIPT-${n}`, fleet_rocket_load_number: `XBF-LD-${4400 + n}`,
    target_system: "fleet_rocket", status: "confirmed", customer_name: "Cliente sintético",
    origin: "Monterrey, NL", destination: "Laredo, TX", updated_at: "2026-09-20T12:01:00.000Z"
  };
}

function fixture() {
  const state = { auth: 0, resolve: 0, calls: [] as Row[], denied: false, revoked: false, dbError: false,
    rows: Array.from({ length: 27 }, (_, index) => row(index + 1)) };
  const client = { async rpc(name: string, args: Row) {
    state.calls.push({ name, args });
    if (state.dbError) return { data: null, error: { message: "private database detail" } };
    if (name === "rateware_get_shipment_creation_event") {
      return { data: state.rows.filter(item => item.event_id === args.p_event_id), error: null };
    }
    assert(name === "rateware_search_shipment_creation_events", `unexpected RPC ${name}`);
    let rows = state.rows;
    if (args.p_query) rows = rows.filter(item => JSON.stringify(item).toLowerCase().includes(String(args.p_query).toLowerCase()));
    if (args.p_after_id) rows = rows.slice(rows.findIndex(item => item.event_id === args.p_after_id) + 1);
    return { data: rows.slice(0, args.p_limit), error: null };
  } };
  const handler = createShipmentContextHandler({
    getClient: () => client,
    authenticate: async () => { state.auth++; if (state.denied) throw new Error("token secret"); return { sub: "subject" }; },
    resolveUser: async (_client, _claims, options) => {
      state.resolve++; equal(options, { persistLegacyIdentity: false });
      if (state.revoked) throw new IdentityContractError("IDENTITY_INACTIVE", "revoked");
      return { organization_id: "org-alpha", owner_user_id: "subject-alpha" };
    }
  });
  const call = async (body: Row, origin = SERVICE_DESK_ORIGIN) => {
    const response = await handler(new Request("https://rateware.example/functions/v1/shipment-context-api", {
      method: "POST", headers: { origin, "content-type": "application/json", authorization: "Bearer synthetic" },
      body: JSON.stringify(body)
    }));
    return { response, body: await response.json() };
  };
  return { state, call, handler };
}

Deno.test("shipment context exposes only the bounded safe projection", async () => {
  const f = fixture();
  const result = await f.call({ action: "search_shipment_creation_events", query: "", limit: 25, cursor: null });
  equal(result.response.status, 200); equal(result.body.rows.length, 25); assert(result.body.next_cursor);
  equal(Object.keys(result.body.rows[0]).sort(), [...SHIPMENT_CONTEXT_FIELDS].sort());
  equal(f.state.calls[0].args.p_organization_id, "org-alpha"); equal(f.state.calls[0].args.p_limit, 26);
  assert(!JSON.stringify(result.body).includes("commercialHandoff"));
});

Deno.test("shipment context cursor is scoped and supports a second page", async () => {
  const f = fixture();
  const first = await f.call({ action: "search_shipment_creation_events", query: "", limit: 25, cursor: null });
  const second = await f.call({ action: "search_shipment_creation_events", query: "", limit: 25, cursor: first.body.next_cursor });
  equal(second.body.rows.length, 2); equal(second.body.next_cursor, null);
  const changed = await f.call({ action: "search_shipment_creation_events", query: "RFX", limit: 25, cursor: first.body.next_cursor });
  equal(changed.response.status, 400);
});

Deno.test("shipment context detail requires UUID and hides missing or foreign rows", async () => {
  const f = fixture();
  const found = await f.call({ action: "get_shipment_creation_event", event_id: id(1) });
  equal(found.response.status, 200); equal(found.body.row.event_id, id(1));
  const missing = await f.call({ action: "get_shipment_creation_event", event_id: id(99) });
  equal(missing.response.status, 404); equal(missing.body, { error: "CONTEXT_NOT_AVAILABLE" });
  const invalid = await f.call({ action: "get_shipment_creation_event", event_id: "XBF-LD-4471" });
  equal(invalid.response.status, 400);
});

Deno.test("shipment context rejects extra fields, oversized input and write actions before RPC", async () => {
  for (const body of [
    { action: "register_shipment_creation_event" },
    { action: "get_shipment_creation_event", event_id: id(1), organization_id: "other" },
    { action: "search_shipment_creation_events", query: "x".repeat(201), limit: 25, cursor: null },
    { action: "search_shipment_creation_events", query: "a\n", limit: 25, cursor: null },
    { action: "search_shipment_creation_events", query: "", limit: 26, cursor: null }
  ]) {
    const f = fixture(); const result = await f.call(body); equal(result.response.status, 400); equal(f.state.calls.length, 0);
  }
});

Deno.test("shipment context rechecks authentication and tenant identity on every request", async () => {
  const f = fixture();
  equal((await f.call({ action: "get_shipment_creation_event", event_id: id(1) })).response.status, 200);
  f.state.revoked = true;
  equal((await f.call({ action: "get_shipment_creation_event", event_id: id(1) })).response.status, 403);
  f.state.revoked = false; f.state.denied = true;
  equal((await f.call({ action: "search_shipment_creation_events", query: "", limit: 25, cursor: null })).response.status, 401);
  equal(f.state.calls.length, 1); equal(f.state.auth, 3); equal(f.state.resolve, 2);
});

Deno.test("shipment context uses exact CORS and fails closed without database details", async () => {
  const f = fixture(); f.state.dbError = true;
  const failed = await f.call({ action: "get_shipment_creation_event", event_id: id(1) });
  equal(failed.response.status, 503); equal(failed.body, { error: "CONTEXT_UNAVAILABLE" });
  equal(failed.response.headers.get("Access-Control-Allow-Origin"), SERVICE_DESK_ORIGIN);
  for (const origin of [SERVICE_DESK_ORIGIN + ".evil.test", "https://servicedesk-fleet-review-elandopando8892s-projects.vercel.app"]) {
    const denied = await f.call({ action: "get_shipment_creation_event", event_id: id(1) }, origin);
    equal(denied.response.status, 403); equal(denied.response.headers.get("Access-Control-Allow-Origin"), null);
  }
});
