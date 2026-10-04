// Real pinned SDK, injected fetch. Verifies HTTP encoding, not a live PostgREST/JWT.
import { assertEquals, assert } from "jsr:@std/assert@1.0.14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
Deno.test("SDK encodes ignore-duplicates and returns an empty INSERT representation array", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const client = createClient("https://supabase.test", "synthetic-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => { captured = { url: String(url), init }; return Promise.resolve(new Response("[]", { status: 201, headers: { "content-type": "application/json" } })); } } });
  const result = await client.from("rateware_catalog_items").upsert({ source: "rateware_manual_catalog", category: "config", raw_value: "Fixture", normalized_value: "Single" }, { onConflict: "source,category,raw_value,normalized_value", ignoreDuplicates: true }).select("id,metadata");
  assertEquals(result.error, null); assertEquals(result.data, []); assertEquals(result.data?.[0], undefined); assert(captured); assertEquals(captured.init?.method, "POST");
  assert(new Headers(captured.init?.headers).get("Prefer")?.includes("resolution=ignore-duplicates")); assertEquals(new URL(captured.url).searchParams.get("on_conflict"), "source,category,raw_value,normalized_value");
});
Deno.test("SDK encodes an owner JSON-path predicate in the PATCH itself", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const client = createClient("https://supabase.test", "synthetic-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => { captured = { url: String(url), init }; return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } })); } } });
  const result = await client.from("rateware_catalog_items").update({ active: true }).eq("source", "rateware_manual_catalog").eq("metadata->>owner_email", "org:a").select("id");
  assertEquals(result.error, null); assertEquals(result.data, []); assert(captured); assertEquals(captured.init?.method, "PATCH"); const url = new URL(captured.url); assertEquals(url.searchParams.get("metadata->>owner_email"), "eq.org:a"); assertEquals(url.searchParams.get("source"), "eq.rateware_manual_catalog");
});
for (const own of [false, true]) Deno.test(`actual handler and SDK interpret an empty INSERT plus owner-filtered PATCH (${own ? "own" : "foreign"})`, async () => {
  const calls: { table: string; method: string; owner: string | null }[] = [];
  const row = { id: "00000000-0000-4000-8000-000000000001", source: "rateware_manual_catalog", category: "config", raw_value: "Fixture", normalized_value: "Single", metadata: { owner_email: "org:a" }, active: true };
  const client = createClient("https://supabase.test", "synthetic-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const url = new URL(String(input)), table = url.pathname.split("/").at(-1)!, method = String(init?.method);
    calls.push({ table, method, owner: url.searchParams.get("metadata->>owner_email") });
    assert(["rateware_catalog_items", "saas_audit_log"].includes(table));
    const data = method === "PATCH" && own ? [row] : [];
    return Promise.resolve(new Response(JSON.stringify(data), { status: method === "POST" ? 201 : 200, headers: { "content-type": "application/json" } }));
  } } });
  const handler = createRatewareApiHandler({ getClient: () => client,
    authenticate: () => Promise.resolve({ sub: "fixture-admin", email: "fixture@example.test", roles: ["admin"], rateware_organization_id: "fixture-org" } as never),
    resolveUser: () => Promise.resolve({ owner_email: "org:a", owner_user_id: "fixture-admin", organization_id: "fixture-org" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_catalog_value", catalog_value: { category: "config", raw_value: "Fixture", normalized_value: "Single" } }) }));
  assertEquals(response.status, own ? 200 : 409);
  assertEquals(calls[1], { table: "rateware_catalog_items", method: "PATCH", owner: "eq.org:a" });
  assertEquals(calls.length, own ? 3 : 2);
  if (own) { assertEquals((await response.json()).row.id, row.id); assertEquals(calls[2].table, "saas_audit_log"); }
  else { assertEquals((await response.json()).code, "CATALOG_ALIAS_CONFLICT"); }
});
