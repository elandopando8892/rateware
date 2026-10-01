import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import { memoryClient, type Row } from "./helpers/memory-client.ts";
import { QuoteQueueError } from "../supabase/functions/quotedesk-api/queue.ts";
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createQuotedeskApiHandler } = await import("../supabase/functions/quotedesk-api/index.ts");
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });
const ID = "00000000-0000-4000-8000-000000000001", OWNER = "org:team-a";

async function fixture() {
  Deno.env.set("GMAIL_TOKEN_ENCRYPTION_KEY", "fixture-quote-key-only");
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fixture-quote-key-only")), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("fixture-token-only"));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const store = memoryClient({
    quotedesk_quotes: [{ id: ID, owner_email: OWNER, folio: "Q-1001", status: "estimating", quote_type: "spot", shipper_name: "Fixture shipper", shipper_id: null, currency: "USD", valid_until: "2099-01-01" }],
    quotedesk_quote_lanes: [{ id: crypto.randomUUID(), quote_id: ID, owner_email: OWNER, lane_number: 1, origin: "Monterrey", destination: "Dallas", all_in_rate: 1800, currency: "USD", accessorials: [] }],
    quotedesk_quote_emails: [], outreach_campaigns: [], outreach_messages: [], email_suppression_list: [], saas_audit_log: [],
    gmail_mailbox_connections: [{ id: "gmail-fixture", owner_email: OWNER, mailbox_email: "sales@heymarksman.com", status: "connected", scopes: ["https://www.googleapis.com/auth/gmail.send"], token_expires_at: "2099-01-01", access_token_encrypted: `v1:${b64(iv)}:${b64(new Uint8Array(encrypted))}` }],
  });
  const options = { provider: "success", failReceipt: false, failQueue: false };
  const provider: Row[] = [];
  const client = { from(table: string) {
    const inner = store.client.from(table) as any, call = store.calls.at(-1)!;
    let wrapper: any;
    wrapper = new Proxy({}, { get(_target, name) {
      if (name === "then") return (resolve: (value: unknown) => void) => {
        if (call.op === "update" && ((table === "quotedesk_quote_emails" && options.failReceipt) || (table === "outreach_messages" && options.failQueue && call.payload.send_completed_at))) {
          resolve({ data: null, error: { message: "Fixture persistence failure" } }); return;
        }
        if (call.op === "insert" && store.tables[table].some(row => row.id === call.payload.id || (table === "quotedesk_quote_emails" && row.idempotency_key === call.payload.idempotency_key && row.owner_email === call.payload.owner_email))) {
          resolve({ data: null, error: { code: "23505", message: "Unique constraint" } }); return;
        }
        inner.then(resolve);
      };
      return (...args: any[]) => {
        if (name === "insert") args[0] = { created_at: new Date().toISOString(), ...(table === "quotedesk_quote_emails" ? { attempt: 1 } : {}), ...args[0] };
        inner[name](...args); return wrapper;
      };
    } }); return wrapper;
  } };
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    assertEquals(String(url), "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assertEquals(init?.method, "POST");
    provider.push(JSON.parse(String(init?.body)));
    if (options.provider === "unknown") throw new Error("Fixture lost response");
    if (options.provider === "reject") return new Response(JSON.stringify({ error: { message: "Fixture denied" } }), { status: 403 });
    return new Response(JSON.stringify({ id: "fixture-provider-id", threadId: "fixture-thread" }), { status: 200 });
  }) as typeof fetch;
  const workspace = (owner = OWNER) => ({ owner_email: owner, owner_user_id: "user-a", organization_id: "team-a" });
  const claims = (role = "operator") => ({ sub: "user-a", email: "fixture@heymarksman.com", roles: [role], rateware_organization_id: "team-a" });
  async function call(body: Row, role = "operator", owner = OWNER, expired = false) {
    const handle = createQuotedeskApiHandler({ getClient: () => client as never, resolveSession: () => {
      if (expired) throw new QuoteQueueError(401, "Fixture expired session");
      return Promise.resolve({ workspace: workspace(owner), claims: claims(role) });
    } });
    const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  async function generic(body: Row) {
    const handle = createRatewareApiHandler({ getClient: () => client as never,
      authenticate: () => Promise.resolve(claims("admin") as never), resolveUser: () => Promise.resolve(workspace() as never) });
    const response = await handle(new Request("https://fixture.test/rateware-api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  const input = { quote_id: ID, to: "shipper@example.test", cc: ["copy@example.test"], note: "Fixture note" };
  async function prepare() {
    const preview = await call({ action: "preview_quote_email", ...input }); assertEquals(preview.status, 200);
    const draft = await call({ action: "prepare_quote_email_draft", ...input, checksum: preview.body.checksum });
    assertEquals(draft.status, 200); return draft.body.message;
  }
  const send = (message: Row, extra: Row = {}) => call({ action: "send_quote_queue_message", quote_id: ID, message_id: message.id,
    checksum: message.metadata.checksum, confirmed: true, confirmation_action: "send_quote_queue_message", ...extra });
  return { store, options, provider, call, generic, prepare, send, input, cleanup: () => { globalThis.fetch = savedFetch; } };
}
async function run(test: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture(); try { await test(f); } finally { f.cleanup(); }
}

Deno.test("Quote queue: prepare/reload/repeat preserves snapshot and never contacts Gmail", () => run(async f => {
  const first = await f.prepare(), second = await f.prepare();
  assertEquals(first.id, second.id); assertEquals(f.store.tables.outreach_messages.length, 1);
  assertEquals(f.store.tables.outreach_campaigns.length, 1); assertEquals(first.rfx_event_id, null);
  assertEquals(f.provider.length, 0); assertEquals(f.store.tables.quotedesk_quotes[0].status, "estimating");
  const list = await f.call({ action: "list_quote_queue", quote_id: ID }, "viewer");
  assertEquals(list.status, 200); assertEquals(list.body.rows[0].html_body, first.html_body); assertEquals(list.body.total, 1);
}));
Deno.test("Quote queue: only explicit queue approval sends, receipt and retry are idempotent", () => run(async f => {
  const m = await f.prepare();
  assertEquals((await f.send(m, { confirmed: false })).status, 400);
  assertEquals((await f.send(m, { confirmation_action: "send_quote_email" })).status, 400);
  assertEquals((await f.call({ action: "send_quote_email", ...f.input, confirmed: true, checksum: m.metadata.checksum })).status, 409);
  assertEquals(f.provider.length, 0);
  const sent = await f.send(m); assertEquals(sent.status, 200); assertEquals(sent.body.message.status, "sent");
  assertEquals((await f.send(m)).body.duplicate, true); assertEquals(f.provider.length, 1);
  const raw = f.provider[0].raw.replace(/-/g, "+").replace(/_/g, "/");
  const mime = new TextDecoder().decode(Uint8Array.from(atob(raw), c => c.charCodeAt(0)));
  assertStringIncludes(mime, "To: shipper@example.test"); assertStringIncludes(mime, "Cc: copy@example.test");
  assertStringIncludes(mime, m.html_body); assertStringIncludes(mime, "X-QuoteDesk-Receipt-Id:");
  assertEquals(f.store.tables.quotedesk_quote_emails[0].status, "sent"); assertEquals(f.store.tables.quotedesk_quotes[0].status, "quoted");
}));
for (const scenario of ["price", "snapshot", "checksum", "cc", "closed", "expired", "suppressed"]) {
  Deno.test(`Quote queue: ${scenario} changed after preparation cannot send`, () => run(async f => {
    const m = await f.prepare();
    if (scenario === "price") f.store.tables.quotedesk_quote_lanes[0].all_in_rate = 1900;
    if (scenario === "snapshot") f.store.tables.outreach_messages[0].html_body += "tampered";
    if (scenario === "cc") f.store.tables.outreach_messages[0].metadata.cc = ["other@example.test"];
    if (scenario === "closed") f.store.tables.quotedesk_quotes[0].status = "won";
    if (scenario === "expired") f.store.tables.quotedesk_quotes[0].valid_until = "2000-01-01";
    if (scenario === "suppressed") f.store.tables.email_suppression_list.push({ owner_email: OWNER, email: "copy@example.test", status: "hard_bounce", resolved_at: null });
    const result = await f.send(m, scenario === "checksum" ? { checksum: "stale" } : {});
    assert(result.status >= 400); assertEquals(f.provider.length, 0); assertEquals(f.store.tables.quotedesk_quote_emails.length, 0);
  }));
}
for (const role of ["viewer", "foreign", "expired"]) Deno.test(`Quote queue: ${role} cannot prepare/send`, () => run(async f => {
  const m = await f.prepare(), body = { action: "send_quote_queue_message", quote_id: ID, message_id: m.id, checksum: m.metadata.checksum, confirmed: true, confirmation_action: "send_quote_queue_message" };
  const result = await f.call(body, role === "viewer" ? "viewer" : "operator", role === "foreign" ? "org:other" : OWNER, role === "expired");
  assertEquals(result.status, role === "viewer" ? 403 : role === "foreign" ? 404 : 401);
  if (role !== "expired") {
    const p = await f.call({ action: "prepare_quote_email_draft", ...f.input, checksum: m.metadata.checksum }, role === "viewer" ? "viewer" : "operator", role === "foreign" ? "org:other" : OWNER);
    assert(p.status >= 400);
  }
  assertEquals(f.provider.length, 0);
}));
for (const expiredBy of ["status", "date"]) Deno.test(`Quote queue: expiration by ${expiredBy} blocks preview, prepare and send`, () => run(async f => {
  const m = await f.prepare();
  if (expiredBy === "status") f.store.tables.quotedesk_quotes[0].status = "expired";
  else f.store.tables.quotedesk_quotes[0].valid_until = "2000-01-01";
  assertEquals((await f.call({ action: "preview_quote_email", ...f.input })).status, 400);
  assertEquals((await f.call({ action: "prepare_quote_email_draft", ...f.input, checksum: m.metadata.checksum })).status, 400);
  assertEquals((await f.send(m)).status, 400);
  assertEquals(f.provider.length, 0);
}));
Deno.test("Quote queue: definite Gmail failure allows one explicit retry", () => run(async f => {
  const m = await f.prepare(); f.options.provider = "reject";
  assertEquals((await f.send(m)).status, 502); assertEquals(f.store.tables.quotedesk_quote_emails[0].status, "failed");
  f.options.provider = "success"; assertEquals((await f.send(m)).status, 200);
  assertEquals(f.provider.length, 2); assertEquals(f.store.tables.quotedesk_quote_emails.length, 1); assertEquals(f.store.tables.quotedesk_quote_emails[0].attempt, 2);
}));
Deno.test("Quote queue: lost Gmail response remains unknown and cannot retry", () => run(async f => {
  const m = await f.prepare(); f.options.provider = "unknown";
  assertEquals((await f.send(m)).status, 502); assertEquals((await f.send(m)).status, 409);
  const rows = await f.call({ action: "list_quote_queue", quote_id: ID });
  assertEquals(rows.body.rows[0].status, "delivery_unknown"); assertEquals(f.provider.length, 1);
}));
for (const failure of ["receipt", "queue"]) Deno.test(`Quote queue: ${failure} persistence failure after acceptance cannot resend`, () => run(async f => {
  const m = await f.prepare(); f.options.failReceipt = failure === "receipt"; f.options.failQueue = failure === "queue";
  assert((await f.send(m)).status >= 400);
  f.options.failReceipt = false; f.options.failQueue = false;
  const retry = await f.send(m); assertEquals(retry.status, failure === "receipt" ? 409 : 200);
  assertEquals(f.provider.length, 1);
}));
Deno.test("Quote queue: two concurrent approvals reach Gmail once", () => run(async f => {
  const m = await f.prepare(); const results = await Promise.all([f.send(m), f.send(m)]);
  assert(results.some(r => r.status === 200)); assertEquals(f.provider.length, 1); assertEquals(f.store.tables.quotedesk_quote_emails.length, 1);
}));
Deno.test("Quote queue: two recoveries of a failed receipt with a stale claim retry once", () => run(async f => {
  const m = await f.prepare(); f.options.provider = "reject"; f.options.failQueue = true;
  assert((await f.send(m)).status >= 400);
  assertEquals(f.store.tables.outreach_messages[0].status, "sending");
  assertEquals(f.store.tables.quotedesk_quote_emails[0].status, "failed");
  f.options.failQueue = false; f.options.provider = "success";
  const results = await Promise.all([f.send(m), f.send(m)]);
  assert(results.some(r => r.status === 200)); assertEquals(f.provider.length, 2);
  assertEquals(f.store.tables.quotedesk_quote_emails[0].attempt, 2);
  assertEquals(f.store.tables.outreach_messages[0].status, "sent");
}));
for (const action of ["send_outreach_messages", "send_whatsapp_outreach_messages", "mark_outreach_messages", "delete_outreach_messages"]) {
  Deno.test(`Quote queue: generic ${action} cannot bypass snapshot/receipt`, () => run(async f => {
    const m = await f.prepare();
    const r = await f.generic({ action, ids: [m.id], status: "sent", confirmed: true, confirmation_action: action });
    assert(r.status >= 400); assertEquals(f.provider.length, 0); assertEquals(f.store.tables.outreach_messages[0].status, "drafted");
  }));
}
