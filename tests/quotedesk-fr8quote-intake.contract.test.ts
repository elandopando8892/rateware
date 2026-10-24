// Entrada de Fr8Quote a QuoteDesk (contrato fr8quote.quotedesk.v1): firma, idempotencia, shipper, precio y correo.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { memoryClient, type Row } from "./helpers/memory-client.ts";
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createQuotedeskApiHandler } = await import("../supabase/functions/quotedesk-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const OWNER = "org:team-a", SECRET = "fixture-fr8quote-secret", SHIPPER = "00000000-0000-4000-8000-0000000000aa";

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function pkg(client = "panel rey", email?: Row) {
  return {
    contract: "fr8quote.quotedesk.v1", idempotency_key: `k-${client}-${email ? "mail" : "plain"}`, exported_at: "2026-10-24T00:00:00Z", exported_by: "fixture@fr8quote",
    quotes: [{
      header: { action: "create_quote", client_name: client, quote_type: "spot", channel: "email", currency: "USD", valid_until: "2026-11-07", title: "Panel Rey · Monterrey → Dallas", notes: "Cotizado en Fr8Quote (FQ-2026-0001)." },
      lanes: [{
        origin: "Monterrey, N.L.", origin_country: "MX", destination: "Dallas, TX", destination_country: "US", equipment: "Dry Van", trailer: "Dry Van", config: "T3-S2",
        operation: "D2D Export", service: "One Way", mx_miles: 137.33, us_miles: 428, fsc_per_mile: 0.78, fsc_diesel_per_gallon: 5.9, fsc_rate_date: "2026-10-23",
        miles_source: "Fr8Quote", cost_source: "fcm", carrier_rate: 2000, markup_mode: "fixed_amount", markup_value: 191, notes: "Fr8Quote FQ-2026-0001 v1",
        fcm: { folio: "FQ-2026-0001", sell_price: 2191 },
      }],
    }],
    ...(email ? { email } : {}),
  };
}

async function fixture(secret: string | null = SECRET) {
  Deno.env.set("GMAIL_TOKEN_ENCRYPTION_KEY", "fixture-quote-key-only");
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fixture-quote-key-only")), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("fixture-token-only"));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const store = memoryClient({
    shippers: [{ id: SHIPPER, owner_email: OWNER, shipper_name: "Panel Rey", legal_name: "Panel Rey SA de CV" }],
    quotedesk_quotes: [], quotedesk_quote_lanes: [], quotedesk_fr8quote_imports: [], quotedesk_quote_emails: [], email_suppression_list: [],
    saas_audit_log: [], rateware_fx_spot_rates: [],
    gmail_mailbox_connections: [{ id: "gmail-fixture", owner_email: OWNER, owner_user_id: "user-a", organization_id: "team-a", mailbox_email: "sales@heymarksman.com", status: "connected",
      scopes: ["https://www.googleapis.com/auth/gmail.send"], token_expires_at: "2099-01-01", updated_at: "2026-10-01", access_token_encrypted: `v1:${b64(iv)}:${b64(new Uint8Array(encrypted))}` }],
  });
  const client = { from: (t: string) => store.client.from(t), rpc: (name: string) => Promise.resolve(name === "quotedesk_fr8quote_secret" ? { data: secret, error: null } : { data: null, error: { message: "rpc" } }) };
  const provider: Row[] = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    provider.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "fixture-provider-id", threadId: "fixture-thread" }), { status: 200 });
  }) as typeof fetch;
  const handle = createQuotedeskApiHandler({ getClient: () => client as never, resolveSession: () => { throw new Error("no debe pedir sesión de usuario"); } });
  async function send(body: Row, opts: { secret?: string; ts?: number; key?: string } = {}) {
    const raw = JSON.stringify(body), ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST", body: raw, headers: {
      "content-type": "application/json", "X-FR8-Timestamp": ts, "X-FR8-Signature": `sha256=${await hmac(opts.secret ?? SECRET, `${ts}.${raw}`)}`, "X-Idempotency-Key": opts.key ?? String(body.idempotency_key),
    } }));
    return { status: response.status, body: await response.json() };
  }
  return { store, provider, send, cleanup: () => { globalThis.fetch = savedFetch; } };
}
async function run(test: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>, secret?: string | null) {
  const f = await fixture(secret); try { await test(f); } finally { f.cleanup(); }
}

Deno.test("Fr8Quote: crea la cotización en el workspace de sales@ con el all-in igual al precio de venta, y el reintento no duplica", () => run(async (f) => {
  const r = await f.send(pkg());
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.quotes.length, 1);
  const [quote] = f.store.tables.quotedesk_quotes;
  assertEquals(quote.owner_email, OWNER);
  assertEquals(quote.shipper_id, SHIPPER);
  const [lane] = f.store.tables.quotedesk_quote_lanes;
  assertEquals(lane.all_in_rate, 2191);
  assertEquals(lane.cost_source, "fcm");
  assertEquals(f.store.tables.quotedesk_fr8quote_imports[0].status, "done");
  const again = await f.send(pkg());
  assertEquals(again.body.duplicate, true);
  assertEquals(f.store.tables.quotedesk_quotes.length, 1);
}));

Deno.test("Fr8Quote: firma inválida o vencida se rechaza sin escribir", () => run(async (f) => {
  assertEquals((await f.send(pkg(), { secret: "otro" })).status, 401);
  assertEquals((await f.send(pkg(), { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
  assertEquals((await f.send(pkg(), { key: "otra-clave" })).status, 400);
  assertEquals(f.store.tables.quotedesk_quotes.length, 0);
  assertEquals(f.store.tables.quotedesk_fr8quote_imports.length, 0);
}));

Deno.test("Fr8Quote: sin secreto en Vault la entrada está apagada", () => run(async (f) => {
  assertEquals((await f.send(pkg())).status, 503);
}, null));

Deno.test("Fr8Quote: un shipper que no está en el CRM no crea nada", () => run(async (f) => {
  const r = await f.send(pkg("Cliente desconocido"));
  assertEquals(r.status, 422);
  assertEquals(f.store.tables.quotedesk_quotes.length, 0);
  assertEquals(f.store.tables.quotedesk_fr8quote_imports[0].status, "failed");
}));

Deno.test("Fr8Quote: el correo armado con la plantilla sale por Gmail de sales@ y la cotización queda cotizada", () => run(async (f) => {
  const r = await f.send(pkg("Panel Rey SA de CV", { to: "compras@panelrey.test", subject: "RFX102426-0001 | Panel Rey", html: "<p>Propuesta</p>", text: "Propuesta" }));
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(f.provider.length, 1);
  assertEquals(f.store.tables.quotedesk_quote_emails[0].status, "sent");
  assertEquals(f.store.tables.quotedesk_quotes[0].status, "quoted");
  assert(r.body.email.provider_message_id);
}));
