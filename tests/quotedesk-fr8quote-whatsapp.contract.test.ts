// WhatsApp de Fr8Quote por el remitente de HeyMarksman: plantilla en Meta, envío firmado e idempotente.
import { assertEquals } from "jsr:@std/assert@1.0.14";
import { memoryClient, type Row } from "./helpers/memory-client.ts";
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createQuotedeskApiHandler } = await import("../supabase/functions/quotedesk-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const SECRET = "fixture-fr8quote-secret";
const PARAMS = ["Jose", "RFX102426-0001", "Monterrey → Dallas", "$2,191 USD", "https://fr8quote.test/h/abc"];

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function run(templateStatus: string | null, test: (f: {
  store: ReturnType<typeof memoryClient>; calls: { url: string; method: string; body: Row | null }[];
  send: (body: Row) => Promise<{ status: number; body: Row }>;
}) => Promise<void>) {
  Deno.env.set("WHATSAPP_ACCESS_TOKEN", "fixture-token-only");
  Deno.env.set("WHATSAPP_PHONE_NUMBER_ID", "phone-1");
  const store = memoryClient({
    quotedesk_fr8quote_imports: [], saas_audit_log: [],
    gmail_mailbox_connections: [{ id: "g", owner_email: "org:team-a", owner_user_id: "user-a", organization_id: "team-a", mailbox_email: "sales@heymarksman.com", status: "connected", updated_at: "2026-10-01" }],
  });
  const client = { from: (t: string) => store.client.from(t), rpc: () => Promise.resolve({ data: SECRET, error: null }) };
  const calls: { url: string; method: string; body: Row | null }[] = [];
  let status = templateStatus;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.includes("fields=whatsapp_business_account")) return json({ whatsapp_business_account: { id: "waba-1" } });
    if (url.includes("/message_templates") && method === "GET") {
      return json({ data: status ? [{ name: "fr8quote_propuesta_es", language: "es_MX", status }] : [] });
    }
    if (url.includes("/message_templates")) { status = "PENDING"; return json({ id: "tpl-1", status: "PENDING" }); }
    if (url.endsWith("/phone-1/messages")) return json({ messages: [{ id: "wamid.fixture" }] });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const handle = createQuotedeskApiHandler({ getClient: () => client as never, resolveSession: () => { throw new Error("no debe pedir sesión de usuario"); } });
  async function send(body: Row) {
    const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
    const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST", body: raw, headers: {
      "content-type": "application/json", "X-FR8-Timestamp": ts, "X-FR8-Signature": `sha256=${await hmac(SECRET, `${ts}.${raw}`)}`, "X-Idempotency-Key": String(body.idempotency_key),
    } }));
    return { status: response.status, body: await response.json() };
  }
  try { await test({ store, calls, send }); } finally { globalThis.fetch = savedFetch; }
}

const wa = (key: string, to = "+52 1 81 8366 0604", params: unknown[] = PARAMS) =>
  ({ contract: "fr8quote.quotedesk.v1", idempotency_key: key, op: "whatsapp_send", whatsapp: { to, params } });

Deno.test("Fr8Quote WhatsApp: si la plantilla no existe la registra en Meta como UTILITY y no manda nada", () => run(null, async (f) => {
  const r = await f.send({ contract: "fr8quote.quotedesk.v1", idempotency_key: "t-1", op: "whatsapp_template" });
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.template, { status: "PENDING", created: true, name: "fr8quote_propuesta_es" });
  const created = f.calls.find((c) => c.method === "POST" && c.url.includes("/waba-1/message_templates"));
  assertEquals(created?.body?.category, "UTILITY");
  assertEquals(created?.body?.language, "es_MX");
  assertEquals(f.calls.some((c) => c.url.endsWith("/messages")), false);
}));

Deno.test("Fr8Quote WhatsApp: con la plantilla en revisión el envío se rechaza y se puede reintentar", () => run("PENDING", async (f) => {
  const r = await f.send(wa("w-1"));
  assertEquals(r.status, 409);
  assertEquals(f.store.tables.quotedesk_fr8quote_imports[0].status, "failed");
  assertEquals(f.calls.some((c) => c.url.endsWith("/messages")), false);
}));

Deno.test("Fr8Quote WhatsApp: con la plantilla aprobada manda la propuesta y el reintento no la repite", () => run("APPROVED", async (f) => {
  const r = await f.send(wa("w-2"));
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.whatsapp, { to: "5218183660604", message_id: "wamid.fixture" });
  const sent = f.calls.filter((c) => c.url.endsWith("/phone-1/messages"));
  assertEquals(sent.length, 1);
  assertEquals(sent[0].body?.to, "5218183660604");
  assertEquals((sent[0].body?.template as Row).name, "fr8quote_propuesta_es");
  const again = await f.send(wa("w-2"));
  assertEquals(again.body.duplicate, true);
  assertEquals(f.calls.filter((c) => c.url.endsWith("/phone-1/messages")).length, 1);
}));

Deno.test("Fr8Quote WhatsApp: número sin lada de país o datos incompletos no llegan a Meta", () => run("APPROVED", async (f) => {
  assertEquals((await f.send(wa("w-3", "8183660604"))).status, 400);
  assertEquals((await f.send(wa("w-4", "+5218183660604", PARAMS.slice(0, 4)))).status, 400);
  assertEquals(f.calls.length, 0);
  assertEquals(f.store.tables.quotedesk_fr8quote_imports.length, 0);
}));
