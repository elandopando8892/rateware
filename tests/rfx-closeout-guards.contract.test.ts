// Actual handler, injected database: no live credentials, SQL, or provider effects.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { rfxOfferExpired } from "../supabase/functions/rateware-api/rfx-closeout-guards.ts";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
const EVENT = "00000000-0000-4000-8000-000000000001";
const primary = { id: "invitation-a", rfx_event_id: EVENT, rfx_lane_id: "lane-a", vendor_id: "carrier-a", bid_rate: 1200, bid_rate_staging_id: "staging-a", rate_staging_id: "staging-a", award_role: "primary", invitation_status: "quoted", valid_through: "2099-12-31", vendors: { status: "active" }, rfx_lanes: {} };
const refused = { rfx_lane_vendor_id: primary.id, vendor_id: primary.vendor_id, segment_key: "general", rubric_key: "logistics_model", answer: "disagree", updated_at: "2026-09-30T12:00:00Z" };
type Row = Record<string, unknown>;
async function close(options: { patch?: Row; extra?: Row; rows?: Row[]; role?: string; foreign?: boolean; failRead?: boolean; pending?: boolean; action?: string } = {}) {
  const writes: Row[] = [], reads: Row[] = [];
  const invitations = [{ ...primary, ...options.patch }, ...(options.extra ? [options.extra] : [])];
  const client = {
    from(table: string) {
      let op = "select", payload: unknown, start = 0, end = 999;
      const filters: Row = {};
      const chain = new Proxy({}, {
        get(_target, name) {
          if (name === "then") return (resolve: (v: unknown) => void) => {
            if (op !== "select") { writes.push({ table, op, payload, filters }); resolve({ data: [], error: null }); return; }
            reads.push({ table, filters, start, end });
            let data: unknown = [];
            if (table === "rfx_events") data = options.foreign ? null : { id: EVENT, owner_email: "org:team-a", status: "open" };
            else if (table === "rfx_lanes") data = [{ id: "lane-a", lane_number: 1 }, { id: "lane-b", lane_number: 2, no_award_at: options.pending ? null : "2026-09-30T12:00:00Z" }].slice(start, end + 1);
            else if (table === "rfx_lane_vendors") data = invitations.slice(start, end + 1);
            else if (table === "rfx_segment_confirmations") data = [...(options.rows || [])].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(start, end + 1);
            const failed = (table === "rfx_events" && options.foreign) || (table === "rfx_segment_confirmations" && options.failRead);
            resolve({ data: failed ? null : data, error: failed ? { message: "Read denied" } : null });
          };
          return (...args: unknown[]) => {
            if (["insert", "update", "upsert", "delete"].includes(String(name))) { op = String(name); payload = args[0]; }
            if (name === "eq" || name === "in") filters[String(args[0])] = args[1];
            if (name === "range") { start = Number(args[0]); end = Number(args[1]); }
            return chain;
          };
        },
      });
      return chain;
    },
  };
  const handler = createRatewareApiHandler({
    getClient: () => client as never,
    authenticate: () => Promise.resolve({ sub: "user-a", email: "test@example.test", roles: [options.role || "admin"], rateware_organization_id: "team-a" } as never),
    resolveUser: () => Promise.resolve({ owner_user_id: "user-a", owner_email: "org:team-a", organization_id: "team-a" } as never),
  });
  const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: options.action || "closeout_awarded_rfx_to_rateware", event_id: EVENT, patch: { status: "closed" }, owner_email: "org:team-b", operation_id: "fixture-only", target_status: "approved" }),
  }));
  return { status: response.status, body: await response.json(), writes, reads };
}
for (const [name, options] of [
  ["primario vencido", { patch: { valid_through: "2000-01-01" } }],
  ["carrier bloqueado", { patch: { vendors: { status: "blocked" } } }],
  ["respaldo vencido", { extra: { ...primary, id: "invitation-b", award_role: "backup", valid_through: "2000-01-01" } }],
  ["rubro rechazado vigente", { rows: [refused] }],
  ["fallo al leer rubros", { failRead: true }],
  ["otro evento/workspace", { foreign: true }],
  ["lane sin decisión", { pending: true }],
  ["operator", { role: "operator" }],
  ["viewer", { role: "viewer" }],
] as const) for (const action of ["closeout_awarded_rfx_to_rateware", "update_rfx_event"]) Deno.test(`${action} rechaza ${name} antes de modificar datos comerciales`, async () => {
  const result = await close({ ...options, action });
  assert(result.status >= 400, JSON.stringify(result));
  assertEquals(result.writes.filter(w => !(w.table === "saas_audit_log" && (w.payload as Row)?.action === "api.error")), [], "No modifica datos comerciales; conserva la auditoría del rechazo");
});
for (const [name, options] of [
  ["sin respuestas conserva aviso", {}],
  ["la respuesta nueva reemplaza el rechazo", { rows: [refused, { ...refused, answer: "agree", updated_at: "2026-10-01T12:00:00Z" }] }],
  ["otro segmento no se mezcla", { rows: [{ ...refused, rfx_lane_vendor_id: "other", segment_key: "other-segment" }] }],
  ["la excepción no es rechazo", { rows: [{ ...refused, answer: "exception" }] }],
  ["rechazo de oferta archivada se ignora", { extra: { ...primary, id: "archived", invitation_status: "archived", valid_through: "2000-01-01", vendors: { status: "blocked" } } }],
] as const) Deno.test(`closeout válido: ${name}`, async () => {
  const result = await close(options);
  assertEquals(result.status, 200, JSON.stringify(result.body));
  assertEquals(result.body.target_status, "pending_review", "El body no autoriza aprobación automática");
  assert(result.writes.some(w => w.table === "rfx_events"));
  assert(result.reads.filter(r => r.table === "rfx_events").every(r => (r.filters as Row).owner_email === "org:team-a"));
});

Deno.test("vigencia incluye todo el día comercial de México, incluso después de medianoche UTC", () => {
  assertEquals(rfxOfferExpired("2026-09-30", Date.parse("2026-10-01T05:59:59.999Z")), false);
  assertEquals(rfxOfferExpired("2026-09-30", Date.parse("2026-10-01T06:00:00.000Z")), true);
  assertEquals(rfxOfferExpired(null), false, "No se inventa una fecha para ofertas antiguas sin vigencia");
  assertEquals(rfxOfferExpired("invalid"), true);
});

Deno.test("el rechazo del mismo carrier y segmento se hereda solo sin respuestas propias", async () => {
  const inherited = await close({ rows: [{ ...refused, rfx_lane_vendor_id: "another-lane" }] });
  assertEquals(inherited.status, 409);
  assertEquals(inherited.writes.filter(w => w.table !== "saas_audit_log"), []);
  const own = await close({ rows: [{ ...refused, rfx_lane_vendor_id: "another-lane" }, { ...refused, answer: "agree" }] });
  assertEquals(own.status, 200);
});

Deno.test("confirma todas las páginas antes de aceptar el cierre", async () => {
  const noise = Array.from({ length: 1001 }, (_, i) => ({ ...refused, rfx_lane_vendor_id: `noise-${i}`, vendor_id: "unawarded-carrier", updated_at: "2026-10-01T12:00:00Z" }));
  const result = await close({ rows: [...noise, refused] });
  assertEquals(result.status, 409);
  assertEquals(result.writes.filter(w => w.table !== "saas_audit_log"), []);
  assertEquals(result.reads.filter(r => r.table === "rfx_segment_confirmations").map(r => r.start), [0, 1000]);
});
