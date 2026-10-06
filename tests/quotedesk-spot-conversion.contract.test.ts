import { assertEquals } from "jsr:@std/assert@1.0.14";
import { memoryClient } from "./helpers/memory-client.ts";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createQuotedeskApiHandler } = await import("../supabase/functions/quotedesk-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
const ID = "00000000-0000-4000-8000-000000000001";
const VERSION = "2026-10-06T12:00:00.123456Z";
const expected = { quote: { id: ID, folio: "Q-1001" }, source_project_id: ID, lane_count: 1, replayed: false };
type Row = Record<string, unknown>;
for (const legacy of [true, false]) Deno.test(`Spot cutover: ${legacy ? "blocks published legacy intake" : "preserves manual RFI creation"}`, async () => {
  const store = memoryClient({ shippers: [{ id: ID, owner_email: "org:a", shipper_name: "Fixture" }],
    quotedesk_quotes: [], saas_audit_log: [], rateware_fx_spot_rates: [] });
  const handle = createQuotedeskApiHandler({ getClient: () => store.client as never, resolveSession: () => Promise.resolve({
    workspace: { owner_email: "org:a", owner_user_id: "a", organization_id: "a" },
    claims: { roles: ["operator"], rateware_organization_id: "a" },
  }) });
  const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST",
    body: JSON.stringify({ action: "create_quote", quote: { shipper_id: ID, title: "Fixture", quote_type: "spot", channel: "rfi",
      notes: legacy ? "Solicitud del cliente por liga (Fixture). Contacto: Example." : "Manual RFI" } }) }));
  assertEquals(response.status, legacy ? 409 : 200);
  if (legacy) assertEquals(store.writes(), []);
});
function fixture(role = "operator", rpcResult = { data: expected as unknown, error: null as unknown }, organization = "team-a") {
  const calls: Row[] = [];
  const handler = createQuotedeskApiHandler({
    getClient: () => ({
      rpc(name: string, args: Row) { calls.push({ name, args }); return Promise.resolve(rpcResult); },
      from() { throw new Error("Conversion must use one transaction, not table writes from Edge."); },
    }) as never,
    resolveSession: () => Promise.resolve({
      workspace: { owner_email: "org:team-a", owner_user_id: "owner-user", organization_id: organization },
      claims: { sub: "actor-user", email: "operator@example.test", roles: [role], rateware_organization_id: organization },
    }),
  });
  const call = async (extra: Row = {}) => {
    const result = await handler(new Request("https://fixture.test/quotedesk-api", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "convert_spot_request_to_quote", project_id: ID, expected_submission_updated_at: VERSION, ...extra }),
    }));
    return { status: result.status, body: await result.json() };
  };
  return { calls, call };
}
Deno.test("Spot conversion: one RPC, trusted workspace and actual actor, precise source version", async () => {
  const f = fixture();
  const response = await f.call({ owner_email: "org:evil", actor_email: "forged", lanes: [{ all_in_rate: 1 }], quote: { shipper_id: ID } });
  assertEquals(response, { status: 200, body: expected });
  assertEquals(f.calls, [{ name: "quotedesk_convert_spot_request", args: {
    p_owner_email: "org:team-a", p_owner_user_id: "owner-user", p_organization_id: "team-a",
    p_actor_email: "operator@example.test", p_project_id: ID, p_expected_submission_updated_at: VERSION,
  } }]);
});
for (const role of ["viewer", "unknown"]) Deno.test(`Spot conversion: denies ${role} before RPC`, async () => {
  const f = fixture(role); assertEquals((await f.call()).status, 403); assertEquals(f.calls, []);
});
Deno.test("Spot conversion: organization-less claims cannot bypass role gate", async () => {
  const f = fixture("viewer", undefined, ""); assertEquals((await f.call()).status, 403); assertEquals(f.calls, []);
});
for (const extra of [{ project_id: "bad" }, { expected_submission_updated_at: null }, { expected_submission_updated_at: "yesterday" }]) {
  Deno.test(`Spot conversion: rejects malformed input ${JSON.stringify(extra)}`, async () => {
    const f = fixture(); assertEquals((await f.call(extra)).status, 400); assertEquals(f.calls, []);
  });
}
for (const [code, status] of [["PT404", 404], ["PT409", 409], ["PT422", 422]]) {
  Deno.test(`Spot conversion: maps ${code} without retry`, async () => {
    const f = fixture("admin", { data: null, error: { code, message: "spot_source_conflict" } });
    assertEquals((await f.call()).status, status); assertEquals(f.calls.length, 1);
  });
}
Deno.test("Spot conversion: replay preserves the database result", async () => {
  const f = fixture("operator", { data: { ...expected, replayed: true }, error: null });
  assertEquals((await f.call()).body, { ...expected, replayed: true }); assertEquals(f.calls.length, 1);
});
Deno.test("Spot conversion: missing migration fails closed and never falls back to create_quote", async () => {
  const f = fixture("operator", { data: null, error: { code: "PGRST202", message: "schema details must not leak" } });
  const result = await f.call(); assertEquals(result.status, 503);
  assertEquals(JSON.stringify(result.body).includes("schema details"), false); assertEquals(f.calls.length, 1);
});

Deno.test("Spot receipts: Consulta reads only its workspace and requested sources without writes", async () => {
  const other = "00000000-0000-4000-8000-000000000002";
  const store = memoryClient({ quotedesk_spot_conversions: [
    { owner_email: "org:a", source_project_id: ID, quote_id: ID, original_lane_count: 2, submission_updated_at: VERSION },
    { owner_email: "org:b", source_project_id: other, quote_id: other, original_lane_count: 1 },
  ], quotedesk_quotes: [{ id: ID, owner_email: "org:a", folio: "Q-1001" }] });
  const handle = createQuotedeskApiHandler({ getClient: () => store.client as never, resolveSession: () => Promise.resolve({
    workspace: { owner_email: "org:a", owner_user_id: "a", organization_id: "a" },
    claims: { roles: ["viewer"], rateware_organization_id: "a" },
  }) });
  const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST",
    body: JSON.stringify({ action: "list_spot_request_quotes", project_ids: [ID, other], owner_email: "org:b" }) }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { rows: [{ source_project_id: ID, quote: { id: ID, folio: "Q-1001" },
    lane_count: 2, submission_updated_at: VERSION }] });
  assertEquals(store.writes(), []);
});
