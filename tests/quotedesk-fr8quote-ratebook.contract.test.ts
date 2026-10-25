// Tarifa en revisión de Fr8Quote (fr8quote.rateware-rate.v1) por la entrada firmada: bandeja, idempotencia, reemplazo y reglas.
import { assertEquals } from "jsr:@std/assert@1.0.14";
import { memoryClient, type Row } from "./helpers/memory-client.ts";
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createQuotedeskApiHandler } = await import("../supabase/functions/quotedesk-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });

const SECRET = "fixture-fr8quote-secret";
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (v: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function ratePackage(version = 1, snapshot = "snap-1", over: Row = {}) {
  const cost = 1800, margin = 1 - 1800 / 2191;
  const pkg: Row = {
    action: "receive_fcm_ratebook", contract_version: "fr8quote.rateware-rate.v1",
    idempotency_key: await sha(`fr8quote.rateware-rate.v1:org-1:quote-1:${snapshot}`),
    lane: { origin: "Monterrey, N.L.", destination: "Dallas, TX", operation: "CROSS_D2D", service: "One Way" },
    equipment: { vehicle_config: "T3S2", trailer: "SECA" },
    rate: { currency: "USD", total: 2191, per_unit: [{ value: 3.4, unit: "USD/mi", leg: "TOTAL" }], valid_from: "2026-10-24" },
    cost_basis: { cost_total: cost, margin, market_status: "SIN REFERENCIA", active_assumptions: [] },
    provenance: { organization_id: "org-1", quote_id: "quote-1", quote_version: version, model_version: "fr8quote.model.v0", snapshot_hash: snapshot,
      read_only_url: "https://fr8quote.test/h/x?vista=trazable", exported_at: "2026-10-24T20:00:00Z", exported_by: "jose@fixture" },
    status: "pending_review", ...over,
  };
  return pkg;
}

async function run(test: (f: { store: ReturnType<typeof memoryClient>; send: (rate: Row) => Promise<{ status: number; body: Row }>; sendRaw: (body: Row) => Promise<{ status: number; body: Row }> }) => Promise<void>) {
  const store = memoryClient({
    fcm_ratebook_imports: [], quotedesk_fr8quote_imports: [], quotedesk_quotes: [], saas_audit_log: [],
    gmail_mailbox_connections: [{ id: "g", owner_email: "org:team-a", owner_user_id: "user-a", organization_id: "team-a", mailbox_email: "sales@heymarksman.com", status: "connected", updated_at: "2026-10-01" }],
  });
  const client = { from: (t: string) => store.client.from(t), rpc: () => Promise.resolve({ data: SECRET, error: null }) };
  const handle = createQuotedeskApiHandler({ getClient: () => client as never, resolveSession: () => { throw new Error("no debe pedir sesión de usuario"); } });
  async function send(rate: Row) {
    return sendRaw({ idempotency_key: rate.idempotency_key, op: "ratebook_import", rate_package: rate });
  }
  async function sendRaw(extra: Row) {
    const body = { contract: "fr8quote.quotedesk.v1", idempotency_key: crypto.randomUUID().replace(/-/g, ""), ...extra };
    const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
    const response = await handle(new Request("https://fixture.test/quotedesk-api", { method: "POST", body: raw, headers: {
      "content-type": "application/json", "X-FR8-Timestamp": ts, "X-FR8-Signature": `sha256=${await hmac(SECRET, `${ts}.${raw}`)}`, "X-Idempotency-Key": String(body.idempotency_key),
    } }));
    return { status: response.status, body: await response.json() };
  }
  await test({ store, send, sendRaw });
}

Deno.test("Rateware: la tarifa entra en revisión, el reintento no duplica y la misma clave con otro contenido choca", () => run(async (f) => {
  const pkg = await ratePackage();
  const r = await f.send(pkg);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals([r.body.accepted, r.body.duplicate, r.body.status], [true, false, "pending_review"]);
  const [row] = f.store.tables.fcm_ratebook_imports;
  assertEquals([row.owner_email, row.source_quote_id, row.status], ["org:team-a", "quote-1", "pending_review"]);
  assertEquals((await f.send(pkg)).body.duplicate, true);
  assertEquals((await f.send({ ...pkg, lane: { ...pkg.lane, origin: "Saltillo" } })).status, 409);
  assertEquals(f.store.tables.fcm_ratebook_imports.length, 1);
  assertEquals(f.store.tables.quotedesk_quotes.length, 0);
}));

Deno.test("Rateware: la versión 2 de la cotización deja la 1 como superseded", () => run(async (f) => {
  await f.send(await ratePackage(1, "snap-1"));
  await f.send(await ratePackage(2, "snap-2"));
  assertEquals(f.store.tables.fcm_ratebook_imports.map((x: Row) => x.status), ["superseded", "pending_review"]);
}));

Deno.test("Rateware: precio que no sale del costo, unidad de tramo, estado o clave inválidos se rechazan sin escribir", () => run(async (f) => {
  const base = await ratePackage();
  assertEquals((await f.send({ ...base, rate: { ...base.rate, total: 2500 } })).status, 400);
  assertEquals((await f.send({ ...base, rate: { ...base.rate, per_unit: [{ value: 60, unit: "USD/mi", leg: "MX" }] } })).status, 400);
  assertEquals((await f.send({ ...base, status: "approved" })).status, 400);
  assertEquals((await f.send({ ...base, idempotency_key: await sha("otra") })).status, 400);
  assertEquals(f.store.tables.fcm_ratebook_imports.length, 0);
}));

Deno.test("Rateware: la revisión desde Fr8Quote aprueba o rechaza con nota, repetirla no cambia nada y otra decisión choca", () => run(async (f) => {
  const pkg = await ratePackage(1, "snap-1");
  await f.send(pkg);
  const review = (decision: string, note?: string) => f.sendRaw({ op: "ratebook_review", review: { rate_idempotency_key: pkg.idempotency_key, decision, note, reviewer: "jose@fixture.test" } });
  assertEquals((await review("rejected")).status, 400);
  const ok = await review("approved", "Revisada");
  assertEquals([ok.status, ok.body.row.status, ok.body.row.reviewed_by_email], [200, "approved", "jose@fixture.test"]);
  assertEquals((await review("approved")).body.duplicate, true);
  assertEquals((await review("rejected", "no")).status, 409);
  assertEquals(f.store.tables.fcm_ratebook_imports[0].status, "approved");
}));
