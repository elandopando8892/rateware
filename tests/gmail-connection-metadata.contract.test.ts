import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });

async function fixture(options: { bounce?: boolean; gmailError?: boolean; detailError?: boolean; saveError?: boolean; conflicts?: number } = {}) {
  // Synthetic encryption key/token; no credentials or network access are used.
  Deno.env.set("GMAIL_TOKEN_ENCRYPTION_KEY", "local-test-only");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("local-test-only"));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = new Uint8Array(12);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("fixture-token"));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const row: Record<string, any> = {
    id: "mailbox-fixture", owner_email: "org:team-a", mailbox_email: "sales@heymarksman.com", status: "connected",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"], updated_at: "2026-01-01T00:00:00Z",
    token_expires_at: "2099-01-01T00:00:00Z", access_token_encrypted: `v1:${b64(iv)}:${b64(new Uint8Array(encrypted))}`,
    metadata: { sender_name: "MARKSMAN Procurement", unrelated: { keep: true }, bounces_synced_at: "2026-01-02T00:00:00Z", secret: "must-not-be-returned" }
  };
  const writes: string[] = [];
  let attempts = 0;
  const client = {
    from(table: string) {
      let change: Record<string, unknown> | undefined;
      let kind = "select";
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; }, eq(k: string, v: unknown) { filters[k] = v; return query; },
        is(k: string, v: unknown) { filters[k] = v; return query; },
        in() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        update(data: Record<string, unknown>) { change = data; kind = "update"; return query; },
        insert() { kind = "insert"; return query; }, upsert() { kind = "upsert"; return query; },
        then(resolve: (r: unknown) => void) {
          if (table === "gmail_mailbox_connections") {
            assertEquals(filters.owner_email, "org:team-a"); assertEquals(filters.mailbox_email, "sales@heymarksman.com");
            if (change) {
              attempts += 1;
              assertEquals(filters.id, row.id); assertEquals(filters.status, "connected");
              assertEquals(filters.updated_at, row.updated_at);
              if (options.saveError) return resolve({ data: null, error: { message: "Save failed" } });
              if (attempts <= (options.conflicts ?? 0)) {
                row.metadata.concurrent = "preserve"; row.updated_at = `2026-01-0${attempts + 2}T00:00:00Z`;
                return resolve({ data: null, error: null });
              }
              Object.assign(row, change); writes.push(table); return resolve({ data: { id: row.id }, error: null });
            }
            return resolve({ data: structuredClone(row), error: null });
          }
          if (kind !== "select") writes.push(table);
          return resolve({ data: [], error: null });
        }
      };
      return query;
    }
  };
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve({ sub: "user-a", email: "fixture@example.test", roles: ["admin"] } as never),
    resolveUser: () => Promise.resolve({ owner_email: "org:team-a", owner_user_id: "user-a", organization_id: "team-a" } as never)
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    assertEquals(url.hostname, "gmail.googleapis.com");
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json(
      options.gmailError ? { error: { message: "Gmail failed" } } : { messages: options.bounce || options.detailError ? [{ id: "bounce-a" }] : [] },
      { status: options.gmailError ? 503 : 200 }));
    assert(url.pathname.endsWith("/messages/bounce-a"));
    return Promise.resolve(Response.json({ payload: { headers: [
      { name: "From", value: "postmaster@example.test" },
      { name: "X-Failed-Recipients", value: "carrier@example.test" },
      { name: "Subject", value: "Delivery incomplete" }
    ], body: { data: btoa("Status: 4.2.2\nFinal-Recipient: rfc822; carrier@example.test") } } }, { status: options.detailError ? 503 : 200 }));
  }) as typeof fetch;
  async function call(action: string) {
    const response = await handler(new Request("https://fixture.test/functions/v1/rateware-api", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, owner_email: "org:team-b" })
    }));
    return { status: response.status, body: await response.json() };
  }
  return { row, writes, call, attempts: () => attempts, restore: () => { globalThis.fetch = realFetch; Deno.env.delete("GMAIL_TOKEN_ENCRYPTION_KEY"); Deno.env.delete("GMAIL_SENDER_NAME"); } };
}

Deno.test("listado expone identidad y fecha, omite metadata y tokens", async () => {
  const f = await fixture(); try {
    const { status, body } = await f.call("list_gmail_connections"); assertEquals(status, 200);
    assertEquals(body.rows[0].sender_name, "MARKSMAN Procurement");
    assertEquals(body.rows[0].bounces_synced_at, "2026-01-02T00:00:00Z");
    assertEquals(body.rows[0].metadata, undefined); assertEquals(body.rows[0].access_token_encrypted, undefined);
    assertEquals(f.writes, []);
    f.row.metadata = { bounces_synced_at: "invalid" }; Deno.env.set("GMAIL_SENDER_NAME", "Default Name");
    const fallback = await f.call("list_gmail_connections");
    assertEquals(fallback.body.rows[0].sender_name, "Default Name"); assertEquals(fallback.body.rows[0].bounces_synced_at, null);
    Deno.env.delete("GMAIL_SENDER_NAME"); assertEquals((await f.call("list_gmail_connections")).body.rows[0].sender_name, null);
  } finally { f.restore(); }
});
for (const bounce of [false, true]) Deno.test(`sincronización con ${bounce ? "un rebote" : "cero rebotes"} persiste y se relee`, async () => {
  const f = await fixture({ bounce }); try {
    const { status, body } = await f.call("sync_gmail_bounces"); assertEquals(status, 200);
    assertEquals(body.detected, bounce ? 1 : 0); assert(body.bounces_synced_at !== "2026-01-02T00:00:00Z");
    assertEquals(f.row.metadata.unrelated, { keep: true }); assertEquals(f.row.metadata.sender_name, "MARKSMAN Procurement");
    assertEquals((await f.call("list_gmail_connections")).body.rows[0].bounces_synced_at, body.bounces_synced_at);
    assertEquals(f.writes.filter(t => t === "gmail_mailbox_connections").length, 1);
  } finally { f.restore(); }
});
for (const option of ["gmailError", "detailError", "saveError"] as const) Deno.test(`${option} no anuncia sincronización exitosa`, async () => {
  const f = await fixture({ [option]: true }); try {
    const { status } = await f.call("sync_gmail_bounces"); assert(status >= 400);
    assertEquals(f.row.metadata.bounces_synced_at, "2026-01-02T00:00:00Z");
    assert(!f.writes.includes("gmail_mailbox_connections"));
  } finally { f.restore(); }
});
Deno.test("actualización concurrente se relee y conserva sus metadatos", async () => {
  const f = await fixture({ conflicts: 1 }); try {
    assertEquals((await f.call("sync_gmail_bounces")).status, 200); assertEquals(f.attempts(), 2);
    assertEquals(f.row.metadata.concurrent, "preserve");
  } finally { f.restore(); }
});
Deno.test("conflicto persistente falla tras tres intentos", async () => {
  const f = await fixture({ conflicts: 3 }); try {
    assert((await f.call("sync_gmail_bounces")).status >= 400); assertEquals(f.attempts(), 3);
    assertEquals(f.row.metadata.bounces_synced_at, "2026-01-02T00:00:00Z");
  } finally { f.restore(); }
});
