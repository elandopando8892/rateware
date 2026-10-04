// Actual handler; injected identity and an in-memory database. Not SQL/JWT evidence.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
type Row = Record<string, any>;
const ID = "00000000-0000-4000-8000-000000000001";
const alias = (owner: string | null = "org:a", active = true): Row => ({ id: ID, source: "rateware_manual_catalog", category: "config", raw_value: "Fixture alias", normalized_value: "Single", code: "single", metadata: owner ? { owner_email: owner, note: "original" } : {}, active, updated_at: "2026-10-03T00:00:00Z" });
const input = { category: "config", raw_value: "Fixture alias", normalized_value: "Single", note: "changed" };
function database(initial: Row[] = [], options: { afterRead?: (rows: Row[]) => void; insertError?: boolean; updateError?: boolean; auditError?: boolean } = {}) {
  const state = { rows: structuredClone(initial), audit: [] as Row[], mutations: [] as Row[] };
  const client = { from(table: string) {
    if (table === "saas_audit_log") return { insert(row: Row) { if (options.auditError) return Promise.resolve({ error: { message: "Synthetic audit outage" } }); state.audit.push(row); return Promise.resolve({ error: null }); } };
    if (table !== "rateware_catalog_items") throw new Error(`Unexpected table: ${table}`);
    let action = "read", payload: Row = {}, upsert: Row = {}, start = 0, end = 999;
    const filters: Record<string, unknown> = {};
    const matching = (row: Row) => Object.entries(filters).every(([key, value]) => (key === "metadata->>owner_email" ? row.metadata?.owner_email : row[key]) === value);
    const execute = async () => {
      await Promise.resolve();
      if (action === "read") { const found = state.rows.filter(matching).slice(start, end + 1).map(row => structuredClone(row)); options.afterRead?.(state.rows); return { data: found, error: null }; }
      state.mutations.push({ action, filters: { ...filters }, options: { ...upsert }, payload: structuredClone(payload) });
      if ((action === "insert" && options.insertError) || (action === "update" && options.updateError)) return { data: null, error: { message: "Synthetic database outage" } };
      if (action === "insert") {
        const existing = state.rows.find(row => ["source", "category", "raw_value", "normalized_value"].every(key => row[key] === payload[key]));
        if (existing && upsert.ignoreDuplicates) return { data: [], error: null };
        if (existing) { Object.assign(existing, structuredClone(payload)); return { data: [structuredClone(existing)], error: null }; }
        const row = { id: crypto.randomUUID(), ...structuredClone(payload) }; state.rows.push(row); return { data: [structuredClone(row)], error: null };
      }
      const found = state.rows.filter(matching);
      for (const row of found) Object.assign(row, structuredClone(payload));
      return { data: structuredClone(found), error: null };
    };
    const chain = {
      upsert(row: Row, opts: Row) { action = "insert"; payload = row; upsert = opts; return chain; },
      update(row: Row) { action = "update"; payload = row; return chain; },
      select() { return chain; }, eq(key: string, value: unknown) { filters[key] = value; return chain; },
      order() { return chain; }, range(from: number, to: number) { start = from; end = to; return chain; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
      async single() { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
      then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { return execute().then(resolve, reject); },
    }; return chain;
  } }; return { client, state };
}
function api(db: ReturnType<typeof database>, owner: string | null = "org:a", role = "admin", authenticated = true) {
  return createRatewareApiHandler({ getClient: () => db.client as never,
    authenticate: () => authenticated ? Promise.resolve({ sub: "fixture-admin", email: "fixture@example.test", roles: [role], rateware_organization_id: "fixture-org" } as never) : Promise.reject(new Response("Unauthorized", { status: 401 })),
    resolveUser: () => Promise.resolve({ owner_email: owner, owner_user_id: "fixture-admin", organization_id: "fixture-org" } as never),
  });
}
const request = (action = "save_catalog_value", extra: Row = {}) => new Request("https://rateware.test/functions/v1/rateware-api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, catalog_value: input, ...extra }) });
const archive = () => request("archive_catalog_value", { id: ID, confirmed: true, confirmation_action: "archive_catalog_value" });
const successAudit = (db: ReturnType<typeof database>) => db.state.audit.filter(row => ["catalog.value.save", "catalog.value.archive"].includes(row.action));

Deno.test("a conflicting alias cannot transfer the existing owner or expose its row", async () => {
  const db = database([alias()]); const before = structuredClone(db.state.rows);
  const response = await api(db, "org:b")(request());
  assertEquals(response.status, 409); const body = await response.json(); assertEquals(body.code, "CATALOG_ALIAS_CONFLICT"); assertEquals(body.row, undefined);
  assertEquals(db.state.rows, before); assertEquals(successAudit(db).length, 0);
});
Deno.test("creation uses the resolved owner and ignores owner/source fields supplied by caller", async () => {
  const db = database(); const response = await api(db)(request("save_catalog_value", { owner_email: "org:b", catalog_value: { ...input, source: "rateware_seed", metadata: { owner_email: "org:b" } } }));
  assertEquals(response.status, 200); assertEquals(db.state.rows[0].metadata.owner_email, "org:a"); assertEquals(db.state.rows[0].source, "rateware_manual_catalog"); assertEquals(db.state.mutations.length, 1); assertEquals(successAudit(db).length, 1);
});
Deno.test("same owner updates note/code and reactivates the same historical id", async () => {
  const db = database([alias("org:a", false)]); const response = await api(db)(request("save_catalog_value", { catalog_value: { ...input, code: "single-test" } }));
  assertEquals(response.status, 200); assertEquals(db.state.rows.length, 1); assertEquals(db.state.rows[0].id, ID); assertEquals(db.state.rows[0].active, true); assertEquals(db.state.rows[0].metadata.note, "changed"); assertEquals(db.state.rows[0].code, "single-test");
});
Deno.test("ownerless historical alias cannot be claimed by saving", async () => {
  const db = database([alias(null)]); const before = structuredClone(db.state.rows);
  assertEquals((await api(db)(request())).status, 409); assertEquals(db.state.rows, before); assertEquals(successAudit(db).length, 0);
});
for (const owner of [null, " "]) Deno.test(`missing resolved owner (${JSON.stringify(owner)}) refuses both mutations`, async () => {
  const db = database([alias()]); assertEquals((await api(db, owner)(request())).status, 403); assertEquals((await api(db, owner)(archive())).status, 403); assertEquals(db.state.mutations.length, 0);
});
for (const role of ["operator", "viewer"]) Deno.test(`${role} cannot bypass save/archive through the real handler`, async () => {
  const db = database([alias()]); assertEquals((await api(db, "org:a", role)(request())).status, 403); assertEquals((await api(db, "org:a", role)(archive())).status, 403); assertEquals(db.state.mutations.length, 0);
});
Deno.test("unauthenticated caller cannot reach catalog mutations", async () => { const db = database(); assertEquals((await api(db, "org:a", "admin", false)(request())).status, 401); assertEquals(db.state.mutations.length, 0); });
Deno.test("malformed input produces no mutation", async () => { const db = database(); assertEquals((await api(db)(request("save_catalog_value", { catalog_value: { ...input, category: "not-managed" } }))).status, 400); assertEquals(db.state.mutations.length, 0); });
Deno.test("two simulated same-owner requests and an explicit retry retain one alias id", async () => {
  const db = database(); const handler = api(db); const responses = await Promise.all([handler(request()), handler(request())]); assertEquals(responses.map(r => r.status), [200, 200]);
  const id = db.state.rows[0].id; assertEquals((await handler(request())).status, 200); assertEquals(db.state.rows.length, 1); assertEquals(db.state.rows[0].id, id);
});
Deno.test("two simulated organizations cannot both win the same new global key", async () => {
  const db = database(); const responses = await Promise.all([api(db)(request()), api(db, "org:b")(request())]); assertEquals(responses.map(r => r.status).sort(), [200, 409]); assertEquals(db.state.rows.length, 1); assertEquals(successAudit(db).length, 1);
});
Deno.test("seed with identical labels is preserved independently of the manual alias", async () => {
  const seed = { ...alias(null), source: "rateware_seed" }; const db = database([seed]); assertEquals((await api(db)(request())).status, 200); assertEquals(db.state.rows[0], seed); assertEquals(db.state.rows.length, 2);
});
Deno.test("own archive requires explicit confirmation and retains row/history", async () => {
  const db = database([alias()]); const response = await api(db)(archive()); assertEquals(response.status, 200); assertEquals(db.state.rows.length, 1); assertEquals(db.state.rows[0].id, ID); assertEquals(db.state.rows[0].active, false); assertEquals(db.state.rows[0].metadata.owner_email, "org:a");
  // Existing bulk-confirmation rejection is a 500; preserve its status in this scoped fix.
  const before = db.state.mutations.length;
  assertEquals((await api(db)(request("archive_catalog_value", { id: ID }))).status, 500);
  assertEquals(db.state.mutations.length, before);
});
for (const owner of ["org:b", null]) Deno.test(`archive rejects foreign or ownerless alias (${owner})`, async () => {
  const db = database([alias(owner)]); const before = structuredClone(db.state.rows); assertEquals((await api(db)(archive())).status, 403); assertEquals(db.state.rows, before); assertEquals(successAudit(db).length, 0);
});
Deno.test("archive's write predicate defeats owner change after the preliminary read", async () => {
  const db = database([alias()], { afterRead: rows => { rows[0].metadata.owner_email = "org:b"; } }); assertEquals((await api(db)(archive())).status, 409); assertEquals(db.state.rows[0].active, true); assertEquals(successAudit(db).length, 0);
});
Deno.test("archive cannot change a reference row", async () => { const db = database([{ ...alias(null), source: "rateware_seed" }]); assertEquals((await api(db)(archive())).status, 400); assertEquals(db.state.mutations.length, 0); });
Deno.test("catalog list keeps own/private filtering and shared seed semantics", async () => {
  const db = database([alias(), { ...alias("org:b"), id: "foreign" }, { ...alias(null), id: "seed", source: "rateware_seed" }]); const response = await api(db)(request("list_catalog_values", { category: "config" }));
  assertEquals(response.status, 200); const body = await response.json(); assertEquals(body.rows.map((row: Row) => row.id).sort(), [ID, "seed"].sort());
});
Deno.test("failed conditional update cannot transfer ownership or claim success", async () => {
  const db = database([alias()], { updateError: true }); const before = structuredClone(db.state.rows); assertEquals((await api(db)(request())).status, 500); assertEquals(db.state.rows, before); assertEquals(successAudit(db).length, 0);
});
Deno.test("audit outage is reported after the saved row; explicit retry never duplicates it", async () => {
  const db = database([], { auditError: true }); const handler = api(db); assertEquals((await handler(request())).status, 500); assertEquals((await handler(request())).status, 500); assertEquals(db.state.rows.length, 1); assertEquals(db.state.rows[0].metadata.owner_email, "org:a");
});
