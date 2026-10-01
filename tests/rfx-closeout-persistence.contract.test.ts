// Real API handler against an in-memory dataset. Persistence here is simulated,
// not a PostgreSQL transaction or a production acceptance test.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
type Row = Record<string, unknown>;
const EVENT = "00000000-0000-4000-8000-000000000001";
const OWNER = "org:team-a";
function dataset(approved = false) {
  const tables: Record<string, Row[]> = {
    rfx_events: [{ id: EVENT, owner_email: OWNER, rfx_id: "RFX-TEST", status: "open" }],
    rfx_lanes: [{ id: "lane-a", rfx_event_id: EVENT, lane_number: 1 }, { id: "lane-b", rfx_event_id: EVENT, lane_number: 2, no_award_at: "2026-09-30T12:00:00Z" }],
    rfx_lane_vendors: ["primary", "backup", ""].map((award_role, i) => ({ id: `invitation-${i}`, rfx_event_id: EVENT, rfx_lane_id: "lane-a", vendor_id: `carrier-${i}`, bid_rate: 1200 + i * 100, bid_rate_staging_id: `staging-${i}`, rate_staging_id: null, award_role, invitation_status: "quoted", valid_through: "2099-12-31", vendors: { status: "active" }, rfx_lanes: {} })),
    rate_staging: [0, 1, 2].map(i => ({ id: `staging-${i}`, row_id: i + 1, owner_email: OWNER, status: i === 0 && approved ? "approved" : "pending_review", rfx_bid_outcome: "submitted" })),
    rfx_segment_confirmations: [], saas_audit_log: [],
  };
  const writes: { table: string; op: string; payload: unknown }[] = [];
  let failLink = false;
  const client = { from(table: string) {
    let op = "select", payload: Row = {}, single = false, start = 0, end = Infinity;
    const filters: ((row: Row) => boolean)[] = [];
    const chain = new Proxy({}, { get(_target, name) {
      if (name === "then") return (resolve: (v: unknown) => void) => {
        if (!(table in tables)) throw new Error(`Unmocked table: ${table}`);
        let rows = tables[table].filter(row => filters.every(filter => filter(row)));
        if (op === "update" && table === "rfx_lane_vendors" && failLink) {
          failLink = false; resolve({ data: null, error: { message: "Simulated link failure" } }); return;
        }
        if (op === "update") { writes.push({ table, op, payload }); rows.forEach(row => Object.assign(row, payload)); }
        if (op === "insert") { writes.push({ table, op, payload }); rows = [{ ...payload }]; tables[table].push(...rows); }
        rows = rows.slice(start, end + 1);
        resolve({ data: single ? rows[0] || null : rows, error: null });
      };
      return (...args: unknown[]) => {
        if (name === "eq") filters.push(row => row[String(args[0])] === args[1]);
        if (name === "in") filters.push(row => (args[1] as unknown[]).includes(row[String(args[0])]));
        if (name === "neq") filters.push(row => row[String(args[0])] !== args[1]);
        if (name === "range") { start = Number(args[0]); end = Number(args[1]); }
        if (name === "single" || name === "maybeSingle") single = true;
        if (name === "update" || name === "insert") { op = String(name); payload = args[0] as Row; }
        return chain;
      };
    } });
    return chain;
  } };
  async function close() {
    const handler = createRatewareApiHandler({
      getClient: () => client as never,
      authenticate: () => Promise.resolve({ sub: "admin", email: "fixture@example.test", roles: ["admin"], rateware_organization_id: "team-a" } as never),
      resolveUser: () => Promise.resolve({ owner_user_id: "admin", owner_email: OWNER, organization_id: "team-a" } as never),
    });
    const response = await handler(new Request("https://rateware.test/functions/v1/rateware-api", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "closeout_awarded_rfx_to_rateware", event_id: EVENT, operation_id: "00000000-0000-4000-8000-000000000010", target_status: "approved" }),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { tables, writes, close, failNextLink() { failLink = true; } };
}
Deno.test("dos lanes decididos y tres carriers: enlaza historia, revisión humana y reintento sin duplicar", async () => {
  const fixture = dataset();
  const first = await fixture.close();
  assertEquals(first.status, 200);
  assertEquals(first.body.linked, 1);
  assertEquals(first.body.queued_for_review, 1);
  assertEquals(first.body.outcomes.counts, { awarded: 1, backup: 1, not_awarded: 1 });
  assertEquals(fixture.tables.rfx_lane_vendors[0].rate_staging_id, "staging-0");
  assertEquals(fixture.tables.rate_staging.map(row => row.rfx_bid_outcome), ["awarded", "backup", "not_awarded"]);
  assertEquals(fixture.tables.rate_staging[0].status, "pending_review");
  assertEquals(fixture.tables.rfx_events[0].status, "awarded");
  const second = await fixture.close();
  assertEquals(second.status, 200);
  assertEquals(second.body.linked, 0);
  assertEquals(second.body.already_staged, 1);
  assertEquals(fixture.tables.rate_staging.length, 3);
  assert(!fixture.writes.some(w => w.op === "insert" && w.table !== "saas_audit_log"));
});
Deno.test("conserva una tarifa previamente aprobada; no la degrada al reintentar", async () => {
  const fixture = dataset(true);
  const first = await fixture.close();
  assertEquals(first.status, 200);
  assertEquals(first.body.preserved_approved, 1);
  assertEquals(first.body.queued_for_review, 0);
  assertEquals((await fixture.close()).status, 200);
  assertEquals(fixture.tables.rate_staging[0].status, "approved");
});
Deno.test("fallo entre staging y enlace: reintenta y recupera el mismo registro histórico", async () => {
  const fixture = dataset();
  fixture.failNextLink();
  assertEquals((await fixture.close()).status, 500);
  assertEquals(fixture.tables.rfx_lane_vendors[0].rate_staging_id, null);
  assertEquals(fixture.tables.rfx_events[0].status, "open");
  assertEquals((await fixture.close()).status, 200);
  assertEquals(fixture.tables.rfx_lane_vendors[0].rate_staging_id, "staging-0");
  assertEquals(fixture.tables.rate_staging.length, 3);
});
